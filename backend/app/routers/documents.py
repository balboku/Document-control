"""Document management router."""
import os
import zipfile
import io
import base64
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone

from app.database import get_db
from app.models import Document, DocumentVersion, AuditLog, User
from app.schemas import (
    DocumentUploadResponse, DocumentConfirm, DocumentUpdate,
    DocumentResponse, DocumentDetailResponse, DocumentVersionResponse,
    DocumentListResponse, ReserveRequest, ReserveResponse,
    AuditLogResponse, BatchDownloadRequest, BatchStatusUpdateRequest,
    DocumentStatsResponse, RelationAnalysisResponse, DocumentHistoryResponse,
    RelatedDocumentResponse, ExtractMetadataResponse, DocumentCreate,
)
from app.services import document_service
from app.services.document_service import (
    get_document_stats, analyze_document_relations, get_related_documents,
    get_document_history, reindex_document, reindex_all_documents,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {".docx", ".xlsx", ".xls", ".pdf", ".txt", ".doc"}


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file and get AI-extracted metadata for confirmation."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    file_bytes = await file.read()
    file_size = len(file_bytes)
    
    if file_size > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=400, detail="File too large. Max 50MB.")
    
    result = await document_service.process_upload(db, file_bytes, file.filename, file_size)
    
    return DocumentUploadResponse(
        file_id=result["file_id"],
        file_name=result["file_name"],
        file_type=result["file_type"],
        file_size=result["file_size"],
        extracted_text_preview=result["extracted_text_preview"],
        ai_metadata=result["ai_metadata"],
    )


@router.post("/extract-metadata", response_model=ExtractMetadataResponse)
async def extract_metadata_only(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Extract metadata from a file without saving it to the database."""
    file_bytes = await file.read()
    result = await document_service.get_extracted_metadata(db, file_bytes, file.filename)
    
    return ExtractMetadataResponse(
        title=result.get("title"),
        category=result.get("category"),
        keywords=result.get("keywords", []),
        summary=result.get("summary"),
        version=result.get("version"),
        doc_number=result.get("doc_number"),
        extracted_text_preview=result.get("extracted_text_preview"),
        file_hash=result.get("file_hash"),
    )


@router.post("/confirm", response_model=DocumentResponse)
async def confirm_document(
    data: DocumentConfirm,
    db: AsyncSession = Depends(get_db),
):
    """Confirm metadata and finalize the document upload."""
    try:
        document = await document_service.confirm_document(
            db=db,
            file_id=data.file_id,
            title=data.title,
            doc_number=data.doc_number,
            version=data.version,
            author_id=data.author_id,
            category_id=data.category_id,
            keywords=data.keywords,
            notes=data.notes,
            actor_id=data.actor_id,
            file_hash=data.file_hash,
        )

        return DocumentResponse(
            id=document.id,
            doc_number=document.doc_number,
            title=document.title,
            status=document.status,
            current_version=document.current_version,
            author_id=document.author_id,
            author_name=document.author.name if document.author else None,
            category_id=document.category_id,
            category_name=document.category.name if document.category else None,
            keywords=document.keywords,
            notes=document.notes,
            reserved_at=document.reserved_at,
            created_at=document.created_at,
            updated_at=document.updated_at,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/reserve", response_model=ReserveResponse)
async def reserve_number(
    data: ReserveRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reserve a document number for future use."""
    document = await document_service.reserve_document_number(
        db=db,
        notes=data.notes,
        actor_id=data.actor_id,
    )
    return ReserveResponse(
        id=document.id,
        doc_number=document.doc_number,
        status=document.status,
        reserved_at=document.reserved_at,
    )


@router.post("/card", response_model=DocumentResponse)
async def create_document_card(
    data: DocumentCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a document card without a file."""
    # Generate document number
    doc_number = await document_service.generate_doc_number(db)
    
    document = Document(
        doc_number=doc_number,
        title=data.title,
        status=data.status or "draft",
        author_id=data.author_id,
        category_id=data.category_id,
        keywords=data.keywords,
        notes=data.notes,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    
    db.add(document)
    await db.commit()
    await db.refresh(document)
    
    # Reload with relationships for response
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.author), selectinload(Document.category))
        .where(Document.id == document.id)
    )
    document = result.unique().scalar_one()
    
    return DocumentResponse(
        id=document.id,
        doc_number=document.doc_number,
        title=document.title,
        status=document.status,
        current_version=document.current_version,
        author_id=document.author_id,
        author_name=document.author.name if document.author else None,
        category_id=document.category_id,
        category_name=document.category.name if document.category else None,
        keywords=document.keywords,
        notes=document.notes,
        reserved_at=document.reserved_at,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


@router.get("", response_model=DocumentListResponse)
async def get_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    category_id: Optional[UUID] = None,
    author_id: Optional[UUID] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    # [優化5] 游標分頁：傳入 next_cursor 以啟用游標模式
    cursor: Optional[str] = Query(None, description="base64 游標，由上一页回傳的 next_cursor 提供"),
    db: AsyncSession = Depends(get_db),
):
    """Get document list with filtering, pagination, and optional cursor-based pagination."""
    # 解析游標
    last_id = None
    if cursor:
        try:
            last_id = UUID(base64.urlsafe_b64decode(cursor).decode())
        except Exception:
            raise HTTPException(status_code=400, detail="無效的分頁游標")

    documents, total, next_cursor = await document_service.get_documents(
        db, page, page_size, status, category_id, author_id,
        search, date_from, date_to, sort_by, sort_order,
        last_id=last_id,
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
            keywords=doc.keywords,
            notes=doc.notes,
            reserved_at=doc.reserved_at,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            mdf_links=doc.mdf_links,
        ))

    return DocumentListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        next_cursor=next_cursor,
    )


@router.get("/stats", response_model=DocumentStatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Get system document statistics."""
    try:
        stats = await get_document_stats(db)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{doc_id}/analyze-relations", response_model=RelationAnalysisResponse)
async def analyze_relations(
    doc_id: UUID,
    force_refresh: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """Analyze relationships between this document and others."""
    try:
        analysis = await analyze_document_relations(db, doc_id, force_refresh)
        return analysis
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{doc_id}", response_model=DocumentDetailResponse)
async def get_document(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get document detail with versions and audit logs."""
    document = await document_service.get_document_detail(db, doc_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    versions = []
    for v in document.versions:
        versions.append(DocumentVersionResponse(
            id=v.id,
            version_number=v.version_number,
            file_name=v.file_name,
            file_type=v.file_type,
            file_size=v.file_size,
            ai_metadata=v.ai_metadata,
            is_current=v.is_current,
            uploaded_by=v.uploaded_by,
            uploader_name=v.uploader.name if v.uploader else None,
            uploaded_at=v.uploaded_at,
        ))
    
    return DocumentDetailResponse(
        id=document.id,
        doc_number=document.doc_number,
        title=document.title,
        status=document.status,
        current_version=document.current_version,
        author_id=document.author_id,
        author_name=document.author.name if document.author else None,
        category_id=document.category_id,
        category_name=document.category.name if document.category else None,
        notes=document.notes,
        reserved_at=document.reserved_at,
        created_at=document.created_at,
        updated_at=document.updated_at,
        versions=versions,
    )


@router.put("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: UUID,
    data: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update document metadata."""
    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(Document)
        .options(joinedload(Document.author), joinedload(Document.category))
        .where(Document.id == doc_id)
    )
    document = result.unique().scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(document, key, value)
    document.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    
    await db.commit()
    await db.refresh(document)
    
    return DocumentResponse(
        id=document.id,
        doc_number=document.doc_number,
        title=document.title,
        status=document.status,
        current_version=document.current_version,
        author_id=document.author_id,
        author_name=document.author.name if document.author else None,
        category_id=document.category_id,
        category_name=document.category.name if document.category else None,
        notes=document.notes,
        reserved_at=document.reserved_at,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


@router.post("/{doc_id}/upload-version")
async def upload_new_version(
    doc_id: UUID,
    version_number: str = Query(...),
    actor_id: Optional[UUID] = Query(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a new version of an existing document."""
    file_bytes = await file.read()
    
    try:
        version = await document_service.upload_new_version(
            db, doc_id, file_bytes, file.filename, version_number, actor_id
        )
        return {"message": "Version uploaded successfully", "version_id": str(version.id)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{doc_id}/status")
async def update_status(
    doc_id: UUID,
    status: str = Query(...),
    actor_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Update document status."""
    valid_statuses = ["reserved", "draft", "active", "archived"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.execute(select(Document).where(Document.id == doc_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    old_status = document.status
    document.status = status
    document.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    
    # Get actor name
    actor_name = None
    if actor_id:
        user_result = await db.execute(select(User).where(User.id == actor_id))
        user = user_result.scalar_one_or_none()
        if user:
            actor_name = user.name
    
    audit = AuditLog(
        document_id=doc_id,
        action="STATUS_CHANGE",
        actor_id=actor_id,
        actor_name=actor_name,
        details={"from": old_status, "to": status},
    )
    db.add(audit)
    
    await db.commit()
    return {"message": f"Status updated from {old_status} to {status}"}


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: UUID,
    version_id: Optional[UUID] = None,
    actor_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    """Download a document file."""
    if version_id:
        result = await db.execute(
            select(DocumentVersion).where(DocumentVersion.id == version_id)
        )
    else:
        result = await db.execute(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == doc_id, DocumentVersion.is_current == True)
        )
    
    version = result.scalar_one_or_none()
    if not version or not os.path.exists(version.file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    # Audit log
    actor_name = None
    if actor_id:
        user_result = await db.execute(select(User).where(User.id == actor_id))
        user = user_result.scalar_one_or_none()
        if user:
            actor_name = user.name
    
    audit = AuditLog(
        document_id=doc_id,
        action="DOWNLOAD",
        actor_id=actor_id,
        actor_name=actor_name,
        details={"version": version.version_number, "file_name": version.file_name},
    )
    db.add(audit)
    await db.commit()
    
    return FileResponse(
        path=version.file_path,
        filename=version.file_name,
        media_type="application/octet-stream",
    )


@router.post("/batch-download")
async def batch_download(
    data: BatchDownloadRequest,
    actor_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Download multiple documents as a ZIP file."""
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for doc_id in data.document_ids:
            result = await db.execute(
                select(DocumentVersion)
                .where(DocumentVersion.document_id == doc_id, DocumentVersion.is_current == True)
            )
            version = result.scalar_one_or_none()
            if version and os.path.exists(version.file_path):
                # Use original filename in ZIP
                zip_file.write(version.file_path, version.file_name)
                
                # Audit log
                actor_name = None
                if actor_id:
                    user_result = await db.execute(select(User).where(User.id == actor_id))
                    user = user_result.scalar_one_or_none()
                    if user:
                        actor_name = user.name
                
                audit = AuditLog(
                    document_id=doc_id,
                    action="DOWNLOAD",
                    actor_id=actor_id,
                    actor_name=actor_name,
                    details={"batch": True, "file_name": version.file_name},
                )
                db.add(audit)
    
    await db.commit()
    zip_buffer.seek(0)
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=documents_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"}
    )


@router.get("/{doc_id}/audit-log", response_model=List[AuditLogResponse])
async def get_audit_log(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get audit log for a document."""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.document_id == doc_id)
        .order_by(AuditLog.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{doc_id}/history", response_model=DocumentHistoryResponse)
async def get_history(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get complete document history including versions and audit logs."""
    try:
        history = await get_document_history(db, doc_id)
        return history
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{doc_id}/related", response_model=List[RelatedDocumentResponse])
async def get_related(
    doc_id: UUID,
    top_k: int = Query(default=5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    """Get semantically related documents based on content similarity."""
    try:
        related = await get_related_documents(db, doc_id, top_k)
        return related
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{doc_id}/reindex")
async def reindex_single_document(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Re-index a single document to regenerate missing embeddings."""
    try:
        result = await reindex_document(db, doc_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/reindex-all")
async def reindex_all_documents_endpoint(
    db: AsyncSession = Depends(get_db),
):
    """Re-index ALL documents that are missing embeddings."""
    result = await reindex_all_documents(db)
    return result


@router.post("/batch-status")
async def batch_update_status(
    data: BatchStatusUpdateRequest,
    actor_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Batch update status for multiple documents."""
    valid_statuses = ["reserved", "draft", "active", "archived"]
    if data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    # Get actor name once
    actor_name = None
    if actor_id:
        user_result = await db.execute(select(User).where(User.id == actor_id))
        user = user_result.scalar_one_or_none()
        if user:
            actor_name = user.name

    updated_ids = []
    failed_ids = []
    for doc_id in data.document_ids:
        try:
            result = await db.execute(select(Document).where(Document.id == doc_id))
            document = result.scalar_one_or_none()
            if not document or document.deleted_at is not None:
                failed_ids.append(str(doc_id))
                continue

            old_status = document.status
            document.status = data.status
            document.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

            audit = AuditLog(
                document_id=doc_id,
                action="STATUS_CHANGE",
                actor_id=actor_id,
                actor_name=actor_name,
                details={"from": old_status, "to": data.status, "batch": True},
            )
            db.add(audit)
            updated_ids.append(str(doc_id))
        except Exception as e:
            logger.error(f"Failed to update document {doc_id} in batch: {str(e)}")
            failed_ids.append(str(doc_id))

    await db.commit()
    return {
        "message": f"批次執行完畢。成功：{len(updated_ids)}, 失敗：{len(failed_ids)}",
        "updated_count": len(updated_ids),
        "updated_ids": updated_ids,
        "failed_ids": failed_ids,
    }



@router.delete("/{doc_id}")
async def delete_document(
    doc_id: UUID,
    actor_id: Optional[UUID] = Query(None, description="執行刪除的使用者 ID，用於稽核記錄"),
    db: AsyncSession = Depends(get_db),
):
    """
    [優化4] 軟刪除文件：將 deleted_at 設為當前時間，資料庫記錄保留以符合稽核規範。
    實體檔案會被保留，如需實體清除可幓理。
    """
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.versions))
        .where(Document.id == doc_id)
    )
    document = result.unique().scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.deleted_at is not None:
        raise HTTPException(status_code=409, detail="文件已在先前刪除")

    now = datetime.now(timezone.utc)

    # 軟刪除文件本體
    document.deleted_at = now

    # 同步軟刪除所有版本
    for version in document.versions:
        if version.deleted_at is None:
            version.deleted_at = now

    # 稽核記錄
    actor_name = None
    if actor_id:
        user_result = await db.execute(select(User).where(User.id == actor_id))
        user = user_result.scalar_one_or_none()
        if user:
            actor_name = user.name

    audit = AuditLog(
        document_id=doc_id,
        action="DELETE",
        actor_id=actor_id,
        actor_name=actor_name,
        details={"doc_number": document.doc_number, "soft_delete": True},
    )
    db.add(audit)

    await db.commit()

    return {
        "status": "success",
        "message": f"Document {document.doc_number} 已軟刪除，稽核記錄已保留。",
        "deleted_at": now.isoformat(),
    }
