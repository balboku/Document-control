
import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
from sqlalchemy import select, delete, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Document, DocumentVersion, DocumentChunk, 
    RegulatoryRequirement, ComplianceInsight, MDFProject, MDFDocumentLink
)
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _fallback_insights(reason: str = "") -> List[Dict[str, Any]]:
    content = "目前暫時無法完成完整法規分析，建議稍後重新整理，或先確認 ISO 條文資料與 AI 設定是否已完成初始化。"
    if reason:
        content = f"{content} 系統訊息：{reason}"

    return [{
        "type": "AUDIT_TIP",
        "title": "法規提示暫時使用預設建議",
        "content": content,
        "severity": "info"
    }]


async def get_compliance_insights(db: AsyncSession, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Get compliance insights. Use cache if available and not force_refresh.
    """
    if not force_refresh:
        try:
            # Check cache (active insights created within last 24h)
            cache_threshold = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
            stmt = select(ComplianceInsight).where(
                ComplianceInsight.is_active == True,
                ComplianceInsight.created_at >= cache_threshold
            ).order_by(ComplianceInsight.created_at.desc())

            result = await db.execute(stmt)
            cached = result.scalars().all()

            if cached:
                return [
                    {
                        "id": str(i.id),
                        "type": i.type,
                        "title": i.title,
                        "content": i.content,
                        "severity": i.severity,
                        "created_at": i.created_at.isoformat()
                    } for i in cached
                ]
        except Exception as e:
            logger.warning("Failed to load cached compliance insights: %s", e)
            await db.rollback()

    # No cache or force refresh: Run analysis
    try:
        logger.info("Running comprehensive compliance analysis...")
        insights = await run_compliance_analysis(db)
    except Exception as e:
        logger.exception("Compliance analysis failed")
        await db.rollback()
        return _fallback_insights(str(e))

    if not insights:
        insights = _fallback_insights()

    # Save to database (clear old ones first)
    try:
        await db.execute(delete(ComplianceInsight).where(ComplianceInsight.is_active == True))

        for ins_data in insights:
            insight = ComplianceInsight(
                type=ins_data["type"],
                title=ins_data["title"],
                content=ins_data["content"],
                severity=ins_data["severity"]
            )
            db.add(insight)

        await db.commit()
    except Exception as e:
        logger.warning("Failed to persist compliance insights cache: %s", e)
        await db.rollback()

    return insights

async def run_compliance_analysis(db: AsyncSession) -> List[Dict[str, Any]]:
    """
    Perform the actual AI-driven gap analysis and semantic matching.
    """
    insights = []

    # 1. MDF Gap Analysis (Rule-based)
    try:
        mdf_stmt = select(MDFProject).options(selectinload(MDFProject.linked_documents))
        mdf_result = await db.execute(mdf_stmt)
        projects = mdf_result.scalars().all()

        critical_items = {
            1: "產品概述",
            2: "產品規格",
            8: "風險管理報告",
            10: "臨床評估",
            13: "標籤與說明書"
        }

        for project in projects:
            linked_item_nos = {link.item_no for link in project.linked_documents}
            missing = [name for item_no, name in critical_items.items() if item_no not in linked_item_nos]

            if missing:
                insights.append({
                    "type": "MISSING_DOC",
                    "title": f"專案 {project.project_no} 缺少核心文件",
                    "content": f"專案「{project.product_name}」尚缺少以下關鍵合規文件：{', '.join(missing)}。請儘速補齊以符合法規要求。",
                    "severity": "warning"
                })
    except Exception as e:
        logger.warning("MDF compliance gap analysis skipped: %s", e)
        await db.rollback()

    # 2. Semantic Compliance Matching (Vector-based)
    try:
        requirement_count = await db.scalar(
            select(func.count(RegulatoryRequirement.id))
            .where(RegulatoryRequirement.embedding.is_not(None))
        )
    except Exception as e:
        logger.warning("Regulatory requirement lookup unavailable: %s", e)
        await db.rollback()
        requirement_count = 0

    if requirement_count:
        try:
            doc_stmt = (
                select(Document)
                .where(Document.status == "active", Document.deleted_at.is_(None))
                .order_by(Document.updated_at.desc())
                .limit(10)
            )
            doc_result = await db.execute(doc_stmt)
            active_docs = doc_result.scalars().all()

            docs_to_analyze = []
            for doc in active_docs:
                chunk_stmt = (
                    select(DocumentChunk)
                    .where(
                        DocumentChunk.document_id == doc.id,
                        DocumentChunk.embedding.is_not(None)
                    )
                    .limit(1)
                )
                chunk_result = await db.execute(chunk_stmt)
                chunk = chunk_result.scalar_one_or_none()
                if chunk is not None and chunk.embedding is not None:
                    docs_to_analyze.append((doc, chunk))
                if len(docs_to_analyze) >= 3:
                    break

            sql = text("""
                SELECT clause_no, title, requirement_text,
                       1 - (embedding <=> CAST(:emb AS vector)) as similarity
                FROM regulatory_requirements
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> CAST(:emb AS vector)
                LIMIT 1
            """)

            for main_doc, chunk in docs_to_analyze:
                try:
                    emb_str = "[" + ",".join(str(x) for x in chunk.embedding) + "]"
                    sim_result = await db.execute(sql, {"emb": emb_str})
                    clause = sim_result.fetchone()

                    if not clause or clause.similarity <= 0.6:
                        continue

                    if any(ins["type"] == "RELEVANT_CLAUSE" and clause.clause_no in ins["title"] for ins in insights):
                        continue

                    advice = await generate_ai_compliance_advice(
                        main_doc.title,
                        clause.clause_no,
                        clause.title,
                        clause.requirement_text
                    )

                    insights.append({
                        "type": "RELEVANT_CLAUSE",
                        "title": f"針對「{main_doc.title}」的法規建議：{clause.clause_no}",
                        "content": advice,
                        "severity": "info"
                    })
                except Exception as e:
                    logger.warning(
                        "Semantic compliance advice skipped for document %s: %s",
                        main_doc.id,
                        e
                    )
                    await db.rollback()
        except Exception as e:
            logger.warning("Semantic compliance analysis skipped: %s", e)
            await db.rollback()

    # Default if nothing found
    if not insights:
        insights.append({
            "type": "AUDIT_TIP",
            "title": "品質管理系統狀況良好",
            "content": "目前所有作用中專案的主要文件皆已完備。建議定期執行內部稽核以維持合規性。",
            "severity": "info"
        })
        
    return insights

async def generate_ai_compliance_advice(doc_title: str, clause_no: str, clause_title: str, clause_text: str) -> str:
    """
    Use Gemma 3 to generate human-friendly compliance advice.
    """
    prompt = f"""你是一個資深的醫療器材法規專家 (QA/RA)。
系統發現現有文件「{doc_title}」與 ISO 13485 第 {clause_no} 條「{clause_title}」高度相關。

法規要求內容：
{clause_text}

請根據上述資訊，為使用者提供一條簡短（100字以內）、專業且具有行動指導意義的提示。
語氣要專業且友善，直接給出建議內容，不要開場白。"""

    try:
        from app.services.ai_service import get_client
        client = get_client()
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=settings.gemma_model,
            contents=prompt,
        )
        if response and response.text:
            return response.text.strip()
    except Exception as e:
        logger.error(f"Failed to generate AI advice: {e}")
    
    return f"建議依照 ISO 13485 {clause_no} ({clause_title}) 之要求，確保相關記錄已完整存檔並經過核准。"
