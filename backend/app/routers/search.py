"""Search router for both precise and semantic search."""
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, text, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models import Document, DocumentChunk
from app.schemas import (
    SemanticSearchRequest, SemanticSearchResponse, SemanticSearchResult,
    DocumentResponse, DocumentListResponse,
)
from app.services.embedding_service import generate_query_embedding

router = APIRouter(prefix="/api/search", tags=["search"])


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
    """Precise search with filters."""
    from app.services.document_service import get_documents
    
    documents, total, _ = await get_documents(
        db, page, page_size, status, category_id, author_id,
        q, date_from, date_to,
    )
    
    total_pages = (total + page_size - 1) // page_size
    
    items = []
    for doc in documents:
        items.append(DocumentResponse(
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

    # Perform cosine similarity search with pre-filters applied in SQL
    sql = text(f"""
        SELECT
            dc.document_id,
            dc.content,
            1 - (dc.embedding <=> :embedding::vector) as similarity,
            d.doc_number,
            d.title,
            d.status
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE dc.embedding IS NOT NULL
        {extra_conditions}
        ORDER BY dc.embedding <=> :embedding::vector
        LIMIT :limit
    """)

    result = await db.execute(sql, params)
    rows = result.fetchall()

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

