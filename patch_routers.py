import os
import re

with open("backend/app/routers/documents.py", "r", encoding="utf-8") as f:
    content = f.read()

# Add BackgroundTasks if not present
if "BackgroundTasks" not in content:
    content = content.replace("from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query", "from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks")

# Patch confirm_document
old_confirm_def = """@router.post("/confirm", response_model=DocumentResponse)
async def confirm_document(
    data: DocumentConfirm,
    db: AsyncSession = Depends(get_db),
):"""
new_confirm_def = """@router.post("/confirm", response_model=DocumentResponse)
async def confirm_document(
    data: DocumentConfirm,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):"""
content = content.replace(old_confirm_def, new_confirm_def)

old_confirm_call = """        document = await document_service.confirm_document(
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
        )"""

new_confirm_call = """        document, doc_version = await document_service.confirm_document(
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
        
        background_tasks.add_task(
            document_service.process_doc_ai_background,
            document.id,
            doc_version.id,
            doc_version.file_path,
            doc_version.file_name,
            document.title
        )"""
content = content.replace(old_confirm_call, new_confirm_call)

# Patch upload_new_version
old_upload_def = """@router.post("/{doc_id}/upload-version")
async def upload_new_version(
    doc_id: UUID,
    version_number: str = Query(...),
    actor_id: Optional[UUID] = Query(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):"""
new_upload_def = """@router.post("/{doc_id}/upload-version")
async def upload_new_version(
    doc_id: UUID,
    background_tasks: BackgroundTasks,
    version_number: str = Query(...),
    actor_id: Optional[UUID] = Query(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):"""
content = content.replace(old_upload_def, new_upload_def)

old_upload_call = """        version = await document_service.upload_new_version(
            db, doc_id, file_bytes, file.filename, version_number, actor_id
        )
        return {"message": "Version uploaded successfully", "version_id": str(version.id)}"""
new_upload_call = """        version, document = await document_service.upload_new_version(
            db, doc_id, file_bytes, file.filename, version_number, actor_id
        )
        
        background_tasks.add_task(
            document_service.process_doc_ai_background,
            document.id,
            version.id,
            version.file_path,
            version.file_name,
            document.title
        )
        
        return {"message": "Version uploaded successfully", "version_id": str(version.id)}"""
content = content.replace(old_upload_call, new_upload_call)

# Add retry endpoint
retry_endpoint = """

@router.post("/{doc_id}/versions/{version_id}/retry-ai", response_model=DocumentVersionResponse)
async def retry_ai_processing(
    doc_id: UUID,
    version_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    \"\"\"Retry failed AI processing for a document version.\"\"\"
    try:
        # First reset the status in the current transaction
        version = await document_service.retry_ai_processing(db, doc_id, version_id)
        
        # Then dispatch the background task
        # Notice we pass document.title, we need to fetch the document
        result = await db.execute(select(Document).where(Document.id == doc_id))
        document = result.scalar_one_or_none()
        
        background_tasks.add_task(
            document_service.process_doc_ai_background,
            doc_id,
            version_id,
            version.file_path,
            version.file_name,
            document.title if document else ""
        )
        
        # Reload with uploader for response
        result = await db.execute(select(DocumentVersion).options(selectinload(DocumentVersion.uploader)).where(DocumentVersion.id == version_id))
        version = result.scalar_one_or_none()
        
        return DocumentVersionResponse(
            id=version.id,
            version_number=version.version_number,
            file_name=version.file_name,
            file_type=version.file_type,
            file_size=version.file_size,
            ai_metadata=version.ai_metadata,
            ai_processing_status=version.ai_processing_status,
            is_current=version.is_current,
            uploaded_by=version.uploaded_by,
            uploader_name=version.uploader.name if version.uploader else None,
            uploaded_at=version.uploaded_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
"""

if "retry-ai" not in content:
    content += retry_endpoint

with open("backend/app/routers/documents.py", "w", encoding="utf-8") as f:
    f.write(content)
