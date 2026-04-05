import re
import os

with open("backend/app/services/document_service.py", "r", encoding="utf-8") as f:
    content = f.read()

# Add AsyncSessionLocal import
if "from app.database import AsyncSessionLocal" not in content:
    content = content.replace("from app.models import", "from app.database import AsyncSessionLocal\nfrom app.models import")

# Add process_doc_ai_background and retry_ai_processing at the end or somewhere before confirm_document.
background_funcs = """
async def process_doc_ai_background(doc_id: uuid.UUID, version_id: uuid.UUID, file_path: str, filename: str, title: str):
    \"\"\"Background task to extract text, AI metadata, and embeddings.\"\"\"
    try:
        from sqlalchemy import update as sql_update
        async with AsyncSessionLocal() as db:
            try:
                # 1. Update status
                await db.execute(sql_update(DocumentVersion).where(DocumentVersion.id == version_id).values(ai_processing_status="pending"))
                await db.execute(sql_update(Document).where(Document.id == doc_id).values(ai_processing_status="pending"))
                await db.commit()

                with open(file_path, "rb") as f:
                    file_bytes = f.read()

                extracted_text = await _get_text_with_ocr(file_bytes, filename)

                cat_result = await db.execute(select(Category).where(Category.is_active == True))
                categories = [c.name for c in cat_result.scalars().all()]

                ai_metadata = None
                if extracted_text or title or filename:
                    ai_metadata = await extract_metadata(extracted_text, title or filename, categories)

                if extracted_text:
                    chunks = chunk_text(extracted_text)
                    if chunks:
                        embeddings = await generate_embeddings(chunks)
                        if embeddings:
                            for idx, (chunk_content, embedding) in enumerate(zip(chunks, embeddings)):
                                chunk = DocumentChunk(
                                    version_id=version_id,
                                    document_id=doc_id,
                                    chunk_index=idx,
                                    content=chunk_content,
                                    embedding=embedding,
                                )
                                db.add(chunk)
                
                await db.execute(
                    sql_update(DocumentVersion)
                    .where(DocumentVersion.id == version_id)
                    .values(
                        extracted_text=extracted_text,
                        ai_metadata=ai_metadata,
                        ai_processing_status="completed",
                        updated_at=datetime.now(timezone.utc).replace(tzinfo=None)
                    )
                )
                await db.execute(
                    sql_update(Document)
                    .where(Document.id == doc_id)
                    .values(ai_processing_status="completed")
                )
                await db.commit()
                logger.info(f"Background AI processing completed for doc {doc_id}")

            except Exception as e:
                logger.error(f"Background AI processing failed for doc {doc_id}: {e}")
                await db.rollback()
                await db.execute(sql_update(DocumentVersion).where(DocumentVersion.id == version_id).values(ai_processing_status="failed"))
                await db.execute(sql_update(Document).where(Document.id == doc_id).values(ai_processing_status="failed"))
                await db.commit()
    except Exception as outer_e:
         logger.error(f"Fatal error in background task for doc {doc_id}: {outer_e}")


async def retry_ai_processing(db: AsyncSession, doc_id: uuid.UUID, version_id: uuid.UUID) -> DocumentVersion:
    result = await db.execute(select(DocumentVersion).where(DocumentVersion.id == version_id, DocumentVersion.document_id == doc_id))
    version = result.scalar_one_or_none()
    if not version:
        raise ValueError("Document version not found")
        
    doc_result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = doc_result.scalar_one_or_none()
    
    version.ai_processing_status = "pending"
    if doc:
        doc.ai_processing_status = "pending"
    
    await db.commit()
    return version

"""

content = content.replace("async def confirm_document(", background_funcs + "async def confirm_document(")

# Now rewrite confirm_document body
# Change return type signature
content = content.replace(") -> Document:\n    \"\"\"Confirm and finalize a document upload.\"\"\"", ") -> Tuple[Document, DocumentVersion]:\n    \"\"\"Confirm and finalize a document upload.\"\"\"")

# the original code inside confirm_document extracts text and ai_metadata, and chunks.
# we'll remove it.
confirm_old_body = """    extracted_text = await _get_text_with_ocr(file_bytes, file_id)
    file_size = os.path.getsize(file_path)

    # Check if binding to a reserved document"""
confirm_new_body = """    extracted_text = None  # Processed in background
    ai_metadata = None     # Processed in background
    file_size = os.path.getsize(file_path)

    # Check if binding to a reserved document"""
content = content.replace(confirm_old_body, confirm_new_body)

ai_meta_block = """    # Get categories for AI prompt
    cat_result = await db.execute(
        select(Category).where(Category.is_active == True)
    )
    categories = [c.name for c in cat_result.scalars().all()]

    # Get AI metadata
    ai_metadata = None
    if extracted_text or title:
        # Use provided title (often filename) as AI hint
        ai_metadata = await extract_metadata(extracted_text, title, categories)

    # Mark old versions as not current"""
content = content.replace(ai_meta_block, "    # Mark old versions as not current")

# In confirm_document, doc_version initialization is fine. Need to set status.
version_record_old = """    doc_version = DocumentVersion(
        document_id=document.id,
        version_number=version,
        file_name=os.path.basename(file_path),
        file_path=file_path,
        file_type=file_ext,
        file_size=file_size,
        file_hash=file_hash,
        extracted_text=extracted_text,
        ai_metadata=ai_metadata,
        is_current=True,
        uploaded_by=actor_id,
    )"""
version_record_new = """    document.ai_processing_status = "pending"
    doc_version = DocumentVersion(
        document_id=document.id,
        version_number=version,
        file_name=os.path.basename(file_path),
        file_path=file_path,
        file_type=file_ext,
        file_size=file_size,
        file_hash=file_hash,
        extracted_text=None,
        ai_metadata=None,
        ai_processing_status="pending",
        is_current=True,
        uploaded_by=actor_id,
    )"""
content = content.replace(version_record_old, version_record_new)

embedding_block = """    # Generate embeddings for chunks
    if extracted_text:
        chunks = chunk_text(extracted_text)
        if chunks:
            embeddings = await generate_embeddings(chunks)
            if embeddings:
                for idx, (chunk_content, embedding) in enumerate(zip(chunks, embeddings)):
                    chunk = DocumentChunk(
                        version_id=doc_version.id,
                        document_id=document.id,
                        chunk_index=idx,
                        content=chunk_content,
                        embedding=embedding,
                    )
                    db.add(chunk)
                logger.info(f"Created {len(embeddings)} embeddings for document {document.doc_number}")
            else:
                logger.error(f"Embedding generation returned None for document {document.doc_number} - document will not be searchable")
        else:
            logger.warning(f"No text chunks generated for document {document.doc_number}")
    else:
        logger.warning(f"No extracted text for document {document.doc_number} - cannot generate embeddings")"""
content = content.replace(embedding_block, "    # Chunking and embedding moved to background task")

return_doc = """    await db.refresh(document)

    return document"""
return_doc_new = """    await db.refresh(document)

    return document, doc_version"""
content = content.replace(return_doc, return_doc_new)


# Now patch upload_new_version
content = content.replace("async def upload_new_version(\n    db: AsyncSession,\n    doc_id: uuid.UUID,\n    file_bytes: bytes,\n    filename: str,\n    version_number: str,\n    actor_id: Optional[uuid.UUID] = None,\n) -> DocumentVersion:", "async def upload_new_version(\n    db: AsyncSession,\n    doc_id: uuid.UUID,\n    file_bytes: bytes,\n    filename: str,\n    version_number: str,\n    actor_id: Optional[uuid.UUID] = None,\n) -> Tuple[DocumentVersion, Document]:")

extracted_old = """    file_ext = os.path.splitext(filename)[1].strip(".")
    extracted_text = await _get_text_with_ocr(file_bytes, filename)
    
    # Get categories for AI
    cat_result = await db.execute(select(Category).where(Category.is_active == True))
    categories = [c.name for c in cat_result.scalars().all()]
    
    ai_metadata = None
    if extracted_text or filename:
        ai_metadata = await extract_metadata(extracted_text, filename, categories)
    
    # Mark old versions as not current"""

extracted_new = """    file_ext = os.path.splitext(filename)[1].strip(".")
    
    # Mark old versions as not current"""
content = content.replace(extracted_old, extracted_new)

ver_old = """    # Create new version
    doc_version = DocumentVersion(
        document_id=doc_id,
        version_number=version_number,
        file_name=filename,
        file_path=file_path,
        file_type=file_ext,
        file_size=len(file_bytes),
        extracted_text=extracted_text,
        ai_metadata=ai_metadata,
        is_current=True,
        uploaded_by=actor_id,
    )"""
ver_new = """    # Create new version
    doc_version = DocumentVersion(
        document_id=doc_id,
        version_number=version_number,
        file_name=filename,
        file_path=file_path,
        file_type=file_ext,
        file_size=len(file_bytes),
        extracted_text=None,
        ai_metadata=None,
        ai_processing_status="pending",
        is_current=True,
        uploaded_by=actor_id,
    )"""
content = content.replace(ver_old, ver_new)

doc_update_old = """    # Update document
    document.current_version = version_number
    document.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)"""
doc_update_new = """    # Update document
    document.current_version = version_number
    document.ai_processing_status = "pending"
    document.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)"""
content = content.replace(doc_update_old, doc_update_new)

embed2_old = """    # Generate new embeddings
    if extracted_text:
        chunks = chunk_text(extracted_text)
        if chunks:
            embeddings = await generate_embeddings(chunks)
            if embeddings:
                for idx, (chunk_content, embedding) in enumerate(zip(chunks, embeddings)):
                    chunk = DocumentChunk(
                        version_id=doc_version.id,
                        document_id=doc_id,
                        chunk_index=idx,
                        content=chunk_content,
                        embedding=embedding,
                    )
                    db.add(chunk)
                logger.info(f"Created {len(embeddings)} embeddings for document version {version_number}")
            else:
                logger.error(f"Embedding generation returned None for document version {version_number} - document will not be searchable")
        else:
            logger.warning(f"No text chunks generated for document version {version_number}")
    else:
        logger.warning(f"No extracted text for document version {version_number} - cannot generate embeddings")"""
content = content.replace(embed2_old, "    # Embedding generation moved to background task")

ret_old = "    return doc_version"
ret_new = "    return doc_version, document"
content = content.replace(ret_old, ret_new)

with open("backend/app/services/document_service.py", "w", encoding="utf-8") as f:
    f.write(content)

