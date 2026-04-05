"""Search router for both precise and semantic search.

Supports three search strategies:
  1. GET /api/search         — Precise filter search (tsvector full-text)
  2. POST /api/search/semantic — Pure semantic search (pgvector cosine similarity)
  3. POST /api/search/hybrid  — Hybrid RRF search (tsvector + pgvector + Reciprocal Rank Fusion)
"""
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, text, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
import logging

from app.database import get_db
from app.models import Document, DocumentChunk
from app.schemas import (
    SemanticSearchRequest, SemanticSearchResponse, SemanticSearchResult,
    DocumentResponse, DocumentListResponse, DocumentWithMdfResponse,
)
from app.services.embedding_service import generate_query_embedding

router = APIRouter(prefix="/api/search", tags=["search"])
logger = logging.getLogger(__name__)


@router.get("", response_model=DocumentListResponse)
async def precise_search(
    q: Optional[str] = None,
    status: Optional[str] = None,
    category_id: Optional[UUID] = None,
    author_id: Optional[UUID] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Precise search with filters (uses tsvector full-text search)."""
    from app.services.document_service import get_documents

    documents, total, _ = await get_documents(
        db, page, page_size, status, category_id, author_id,
        q, date_from, date_to,
    )

    total_pages = (total + page_size - 1) // page_size

    items = []
    for doc in documents:
        items.append(DocumentWithMdfResponse(
            id=doc.id,
            doc_number=doc.doc_number,
            title=doc.title,
            status=doc.status,
            current_version=doc.current_version,
            author_id=doc.author_id,
            author_name=doc.author.name if doc.author else None,
            category_id=doc.category_id,
            category_name=doc.category.name if doc.category else None,
            notes=doc.notes,
            reserved_at=doc.reserved_at,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            mdf_links=doc.mdf_links,
        ))

    return DocumentListResponse(
        items=items, total=total, page=page,
        page_size=page_size, total_pages=total_pages,
    )


@router.post("/semantic", response_model=SemanticSearchResponse)
async def semantic_search(
    data: SemanticSearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Semantic search using Gemini Embedding 2 vectors with optional SQL pre-filtering."""
    # Generate query embedding
    query_embedding = await generate_query_embedding(data.query)

    if not query_embedding:
        return SemanticSearchResponse(results=[], query=data.query)

    # Convert to string format for pgvector
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # Build dynamic WHERE conditions for pre-filtering
    extra_conditions = "AND d.deleted_at IS NULL"
    params: dict = {"embedding": embedding_str, "limit": data.limit}

    if data.status:
        extra_conditions += " AND d.status = :status"
        params["status"] = data.status

    if data.category_id:
        extra_conditions += " AND d.category_id = :category_id"
        params["category_id"] = str(data.category_id)

    # Perform cosine similarity search using HNSW index (via <=> operator)
    # SET LOCAL hnsw.ef_search = 100 ensures high recall during runtime query phase
    sql = text(f"""
        SELECT
            dc.document_id,
            dc.content,
            1 - ((dc.embedding::halfvec(3072)) <=> :embedding::halfvec(3072)) as similarity,
            d.doc_number,
            d.title,
            d.status
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE dc.embedding IS NOT NULL
        {extra_conditions}
        ORDER BY (dc.embedding::halfvec(3072)) <=> :embedding::halfvec(3072)
        LIMIT :limit
    """)

    try:
        result = await db.execute(sql, params)
        rows = result.fetchall()
    except Exception as e:
        logger.error(f"Semantic search query failed: {e}")
        return SemanticSearchResponse(results=[], query=data.query)

    # Deduplicate by document_id, keep highest similarity
    seen = {}
    results = []
    for row in rows:
        doc_id = row[0]
        if doc_id not in seen:
            seen[doc_id] = True
            results.append(SemanticSearchResult(
                document_id=doc_id,
                doc_number=row[3],
                title=row[4],
                chunk_content=row[1][:300],
                similarity_score=round(float(row[2]), 4),
                status=row[5],
            ))

    return SemanticSearchResponse(results=results, query=data.query)


@router.post("/hybrid", response_model=SemanticSearchResponse)
async def hybrid_search(
    data: SemanticSearchRequest,
    rrf_k: int = Query(60, ge=1, le=200, description="RRF 常數 k，業界標準為 60"),
    db: AsyncSession = Depends(get_db),
):
    """
    混合搜尋（Hybrid Search）：結合語義向量搜尋與全文關鍵字搜尋。

    使用 Reciprocal Rank Fusion (RRF) 演算法合併兩路評分，適用於：
    - 精確詞彙查詢（文件編號如 DOC-2026-0001）→ 由 tsvector 處理
    - 語義概念查詢（「品管程序」「風險評估」）→ 由 pgvector 處理
    - 混合查詢（同時命中兩者）→ RRF 加權融合，排名更準確

    RRF 評分公式：score = Σ 1/(k + rank_i)
    其中 k=60 為業界標準常數，可抑制極高/低排名文件的過大影響。

    Args:
        data: 搜尋請求（query, status, category_id, limit）
        rrf_k: RRF 常數，預設 60（業界標準）
    """
    if not data.query or not data.query.strip():
        return SemanticSearchResponse(results=[], query=data.query)

    # Step 1: 生成語義查詢向量
    query_embedding = await generate_query_embedding(data.query)

    if not query_embedding:
        logger.warning(f"Hybrid search: failed to generate embedding for '{data.query}', falling back to fulltext only.")

    embedding_str = (
        "[" + ",".join(str(x) for x in query_embedding) + "]"
        if query_embedding else None
    )

    # Step 2: 建立過濾條件
    filter_clauses = "AND d.deleted_at IS NULL"
    params: dict = {
        "query": data.query,
        "limit": data.limit,
        "rrf_k": rrf_k,
    }

    if data.status:
        filter_clauses += " AND d.status = :status"
        params["status"] = data.status

    if data.category_id:
        filter_clauses += " AND d.category_id = :category_id"
        params["category_id"] = str(data.category_id)

    # ============================================================
    # Step 3: 執行 RRF 混合搜尋
    # ============================================================
    # 策略：根據向量是否可用，選擇 全混合 或 純全文 模式
    if embedding_str:
        params["embedding"] = embedding_str

        # [全混合模式] tsvector + pgvector → RRF 融合
        # 使用 FULL OUTER JOIN 確保只在其中一路命中的文件也能被納入排名
        rrf_sql = text(f"""
            WITH
            -- 語義搜尋排名：使用 pgvector HNSW 索引（<=> 餘弦距離）
            semantic_ranked AS (
                SELECT
                    dc.document_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY dc.document_id
                        ORDER BY (dc.embedding::halfvec(3072)) <=> :embedding::halfvec(3072)
                    ) AS chunk_rank,
                    ROW_NUMBER() OVER (
                        ORDER BY MIN((dc.embedding::halfvec(3072)) <=> :embedding::halfvec(3072)) OVER (PARTITION BY dc.document_id)
                    ) AS doc_rank
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                WHERE dc.embedding IS NOT NULL
                {filter_clauses}
            ),
            -- 去重：每個文件只保留最佳 chunk 排名
            semantic_best AS (
                SELECT DISTINCT ON (document_id) document_id, doc_rank AS rank
                FROM semantic_ranked
                ORDER BY document_id, chunk_rank
            ),

            -- 全文搜尋排名：使用 tsvector GIN 索引（@@ plainto_tsquery）
            -- ts_rank_cd 計算覆蓋密度排名（適合文件編號等精確詞彙）
            fulltext_ranked AS (
                SELECT
                    d.id AS document_id,
                    ROW_NUMBER() OVER (
                        ORDER BY ts_rank_cd(d.search_vector, plainto_tsquery('simple', :query)) DESC
                    ) AS rank
                FROM documents d
                WHERE d.search_vector @@ plainto_tsquery('simple', :query)
                  AND d.deleted_at IS NULL
                  {'AND d.status = :status' if data.status else ''}
                  {'AND d.category_id = :category_id' if data.category_id else ''}
            ),

            -- RRF 融合：Reciprocal Rank Fusion 評分合併
            -- 公式：rrf_score = Σ 1/(k + rank_i)
            -- FULL OUTER JOIN 確保只命中其中一路的文件也被納入
            rrf_scored AS (
                SELECT
                    COALESCE(s.document_id, f.document_id) AS document_id,
                    COALESCE(1.0 / (:rrf_k + s.rank), 0.0) +
                    COALESCE(1.0 / (:rrf_k + f.rank), 0.0) AS rrf_score,
                    -- 保留各自評分供偵錯用
                    COALESCE(1.0 / (:rrf_k + s.rank), 0.0) AS semantic_score,
                    COALESCE(1.0 / (:rrf_k + f.rank), 0.0) AS fulltext_score
                FROM semantic_best s
                FULL OUTER JOIN fulltext_ranked f ON s.document_id = f.document_id
            )

            -- 最終結果：Join 文件資訊，依 RRF 分數排序
            SELECT
                r.document_id,
                -- 取最具代表性的 chunk（最接近查詢的那塊）
                (
                    SELECT dc2.content
                    FROM document_chunks dc2
                    WHERE dc2.document_id = r.document_id
                      AND dc2.embedding IS NOT NULL
                    ORDER BY (dc2.embedding::halfvec(3072)) <=> :embedding::halfvec(3072)
                    LIMIT 1
                ) AS chunk_content,
                r.rrf_score,
                d.doc_number,
                d.title,
                d.status,
                r.semantic_score,
                r.fulltext_score
            FROM rrf_scored r
            JOIN documents d ON r.document_id = d.id
            WHERE d.deleted_at IS NULL
            ORDER BY r.rrf_score DESC
            LIMIT :limit
        """)

    else:
        # [純全文模式] 向量生成失敗時退回純 tsvector 搜尋
        logger.warning("Hybrid search falling back to full-text only (no embedding)")
        rrf_sql = text(f"""
            SELECT
                d.id AS document_id,
                ts_headline(
                    'simple', coalesce(d.title, ''),
                    plainto_tsquery('simple', :query),
                    'MaxWords=20, MinWords=5'
                ) AS chunk_content,
                ts_rank_cd(d.search_vector, plainto_tsquery('simple', :query)) AS rrf_score,
                d.doc_number,
                d.title,
                d.status,
                0.0 AS semantic_score,
                ts_rank_cd(d.search_vector, plainto_tsquery('simple', :query)) AS fulltext_score
            FROM documents d
            WHERE d.search_vector @@ plainto_tsquery('simple', :query)
              AND d.deleted_at IS NULL
              {'AND d.status = :status' if data.status else ''}
              {'AND d.category_id = :category_id' if data.category_id else ''}
            ORDER BY rrf_score DESC
            LIMIT :limit
        """)

    try:
        result = await db.execute(rrf_sql, params)
        rows = result.fetchall()
    except Exception as e:
        logger.error(f"Hybrid search query failed: {e}", exc_info=True)
        return SemanticSearchResponse(results=[], query=data.query)

    # Step 4: 組裝結果
    results = []
    for row in rows:
        chunk_content = row[1] or ""
        results.append(SemanticSearchResult(
            document_id=row[0],
            doc_number=row[3],
            title=row[4],
            chunk_content=chunk_content[:300],
            similarity_score=round(float(row[2]), 6),  # RRF score
            status=row[5],
        ))

    logger.info(
        f"Hybrid search '{data.query}': {len(results)} results "
        f"(embedding={'yes' if embedding_str else 'no'}, rrf_k={rrf_k})"
    )
    return SemanticSearchResponse(results=results, query=data.query)
