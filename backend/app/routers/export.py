"""Export router for CSV/Excel downloads."""
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from datetime import datetime
import io

from app.database import get_db
from app.models import Document
from app.schemas import ExportRequest
from app.services.export_service import generate_csv, generate_xlsx

router = APIRouter(prefix="/api/export", tags=["export"])


@router.post("/list")
async def export_document_list(
    data: ExportRequest,
    db: AsyncSession = Depends(get_db),
):
    """Export document list as CSV or Excel."""
    query = select(Document).options(
        joinedload(Document.author),
        joinedload(Document.category),
    )
    
    if data.document_ids:
        query = query.where(Document.id.in_(data.document_ids))
    
    if data.filters:
        filters = []
        if data.filters.get("status"):
            filters.append(Document.status == data.filters["status"])
        if data.filters.get("category_id"):
            filters.append(Document.category_id == data.filters["category_id"])
        if data.filters.get("author_id"):
            filters.append(Document.author_id == data.filters["author_id"])
        if data.filters.get("search"):
            s = data.filters["search"]
            filters.append(or_(Document.title.ilike(f"%{s}%"), Document.doc_number.ilike(f"%{s}%")))
        if filters:
            query = query.where(and_(*filters))
    
    query = query.order_by(Document.created_at.desc())
    
    result = await db.execute(query)
    documents = result.unique().scalars().all()
    
    doc_list = []
    for doc in documents:
        doc_list.append({
            "doc_number": doc.doc_number,
            "title": doc.title or "",
            "status": doc.status,
            "current_version": doc.current_version or "",
            "author_name": doc.author.name if doc.author else "",
            "category_name": doc.category.name if doc.category else "",
            "notes": doc.notes or "",
            "created_at": doc.created_at.strftime("%Y-%m-%d %H:%M") if doc.created_at else "",
            "updated_at": doc.updated_at.strftime("%Y-%m-%d %H:%M") if doc.updated_at else "",
        })
    
    if data.format == "xlsx":
        content = generate_xlsx(doc_list)
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=documents_{datetime.now().strftime('%Y%m%d')}.xlsx"}
        )
    else:
        content = generate_csv(doc_list)
        return StreamingResponse(
            io.BytesIO(content),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=documents_{datetime.now().strftime('%Y%m%d')}.csv"}
        )
