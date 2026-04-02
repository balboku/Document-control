"""Document business logic service."""
import os
import uuid
import shutil
from datetime import datetime
from typing import Optional, List, Tuple
from sqlalchemy import select, func, desc, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models import Document, DocumentVersion, DocumentChunk, AuditLog, NumberFormat, User, Category
from app.services.file_parser import extract_text
from app.services.ai_service import extract_metadata
from app.services.embedding_service import generate_embeddings
from app.utils.chunking import chunk_text
from app.config import get_settings

settings = get_settings()


async def ensure_upload_dir():
    """Ensure the upload directory exists."""
    os.makedirs(settings.upload_dir, exist_ok=True)


async def generate_doc_number(db: AsyncSession) -> str:
    """Generate the next document number based on the configured format."""
    # Get number format settings
    result = await db.execute(select(NumberFormat).where(NumberFormat.id == 1))
    fmt = result.scalar_one_or_none()
    
    current_year = datetime.now().year
    
    if fmt is None:
        fmt = NumberFormat(
            id=1, prefix="DOC", separator="-",
            year_format="YYYY", sequence_digits=4,
            current_sequence=0, current_year=current_year
        )
        db.add(fmt)
    
    # Reset sequence if year changed
    if fmt.current_year != current_year:
        fmt.current_sequence = 0
        fmt.current_year = current_year
    
    fmt.current_sequence += 1
    
    # Format the year
    if fmt.year_format == "YY":
        year_str = str(current_year)[-2:]
    else:
        year_str = str(current_year)
    
    # Format the sequence number
    seq_str = str(fmt.current_sequence).zfill(fmt.sequence_digits)
    
    doc_number = f"{fmt.prefix}{fmt.separator}{year_str}{fmt.separator}{seq_str}"
    
    await db.commit()
    return doc_number


async def save_uploaded_file(file_bytes: bytes, original_filename: str) -> Tuple[str, str]:
    """Save an uploaded file to the uploads directory."""
    await ensure_upload_dir()
    
    file_ext = os.path.splitext(original_filename)[1]
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(settings.upload_dir, unique_filename)
    
    with open(file_path, "wb") as f:
        f.write(file_bytes)
    
    return file_path, unique_filename


async def process_upload(
    db: AsyncSession,
    file_bytes: bytes,
    filename: str,
    file_size: int,
) -> dict:
    """
    Process an uploaded file: save it, extract text, and get AI metadata.
    Returns a temporary result for user confirmation.
    """
    # Save file
    file_path, stored_name = await save_uploaded_file(file_bytes, filename)
    
    # Extract text
    file_ext = os.path.splitext(filename)[1].strip(".")
    extracted_text = extract_text(file_bytes, file_ext)
    
    # Get categories for AI prompt
    result = await db.execute(
        select(Category).where(Category.is_active == True).order_by(Category.sort_order)
    )
    categories = [c.name for c in result.scalars().all()]
    
    # Get AI metadata
    ai_metadata = None
    if extracted_text:
        ai_metadata = await extract_metadata(extracted_text, categories)
    
    return {
        "file_id": stored_name,
        "file_name": filename,
        "file_path": file_path,
        "file_type": file_ext,
        "file_size": file_size,
        "extracted_text": extracted_text or "",
        "extracted_text_preview": (extracted_text or "")[:500],
        "ai_metadata": ai_metadata,
    }


async def confirm_document(
    db: AsyncSession,
    file_id: str,
    title: str,
    doc_number: Optional[str],
    version: str,
    author_id: Optional[uuid.UUID],
    category_id: Optional[uuid.UUID],
    notes: Optional[str],
    actor_id: Optional[uuid.UUID] = None,
) -> Document:
    """Confirm and finalize a document upload."""
    file_path = os.path.join(settings.upload_dir, file_id)
    file_ext = os.path.splitext(file_id)[1].strip(".")
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Uploaded file not found: {file_id}")
    
    # Read file for text extraction
    with open(file_path, "rb") as f:
        file_bytes = f.read()
    
    extracted_text = extract_text(file_bytes, file_ext)
    file_size = os.path.getsize(file_path)
    
    # Check if binding to a reserved document
    document = None
    if doc_number:
        result = await db.execute(
            select(Document).where(Document.doc_number == doc_number)
        )
        document = result.scalar_one_or_none()
    
    if document is None:
        # Create new document
        if not doc_number:
            doc_number = await generate_doc_number(db)
        
        document = Document(
            doc_number=doc_number,
            title=title,
            status="active",
            current_version=version,
            author_id=author_id,
            category_id=category_id,
            notes=notes,
        )
        db.add(document)
        await db.flush()
    else:
        # Update reserved/draft document
        document.title = title
        document.status = "active"
        document.current_version = version
        document.author_id = author_id
        document.category_id = category_id
        document.notes = notes
        document.updated_at = datetime.utcnow()
    
    # Get categories for AI prompt
    cat_result = await db.execute(
        select(Category).where(Category.is_active == True)
    )
    categories = [c.name for c in cat_result.scalars().all()]
    
    # Get AI metadata
    ai_metadata = None
    if extracted_text:
        ai_metadata = await extract_metadata(extracted_text, categories)
    
    # Mark old versions as not current
    await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document.id)
    )
    
    from sqlalchemy import update as sql_update
    await db.execute(
        sql_update(DocumentVersion)
        .where(DocumentVersion.document_id == document.id)
        .values(is_current=False)
    )
    
    # Create version record
    doc_version = DocumentVersion(
        document_id=document.id,
        version_number=version,
        file_name=os.path.basename(file_path),
        file_path=file_path,
        file_type=file_ext,
        file_size=file_size,
        extracted_text=extracted_text,
        ai_metadata=ai_metadata,
        is_current=True,
        uploaded_by=actor_id,
    )
    db.add(doc_version)
    await db.flush()
    
    # Generate embeddings for chunks
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
    
    # Create audit log
    actor_name = None
    if actor_id:
        user_result = await db.execute(select(User).where(User.id == actor_id))
        user = user_result.scalar_one_or_none()
        if user:
            actor_name = user.name
    
    audit = AuditLog(
        document_id=document.id,
        action="UPLOAD",
        actor_id=actor_id,
        actor_name=actor_name,
        details={"version": version, "file_name": os.path.basename(file_path)},
    )
    db.add(audit)
    
    await db.commit()
    await db.refresh(document)
    
    return document


async def reserve_document_number(
    db: AsyncSession,
    notes: Optional[str] = None,
    actor_id: Optional[uuid.UUID] = None,
) -> Document:
    """Reserve a document number for future use."""
    doc_number = await generate_doc_number(db)
    
    document = Document(
        doc_number=doc_number,
        status="reserved",
        notes=notes,
        reserved_at=datetime.utcnow(),
    )
    db.add(document)
    await db.flush()
    
    # Get actor name
    actor_name = None
    if actor_id:
        user_result = await db.execute(select(User).where(User.id == actor_id))
        user = user_result.scalar_one_or_none()
        if user:
            actor_name = user.name
    
    audit = AuditLog(
        document_id=document.id,
        action="RESERVE",
        actor_id=actor_id,
        actor_name=actor_name,
        details={"doc_number": doc_number},
    )
    db.add(audit)
    
    await db.commit()
    await db.refresh(document)
    
    return document


async def get_documents(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    category_id: Optional[uuid.UUID] = None,
    author_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> Tuple[List[Document], int]:
    """Get documents with filtering and pagination."""
    query = select(Document).options(
        joinedload(Document.author),
        joinedload(Document.category),
    )
    count_query = select(func.count(Document.id))
    
    # Apply filters
    filters = []
    if status:
        filters.append(Document.status == status)
    if category_id:
        filters.append(Document.category_id == category_id)
    if author_id:
        filters.append(Document.author_id == author_id)
    if search:
        filters.append(
            or_(
                Document.title.ilike(f"%{search}%"),
                Document.doc_number.ilike(f"%{search}%"),
            )
        )
    if date_from:
        filters.append(Document.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        filters.append(Document.created_at <= datetime.fromisoformat(date_to + "T23:59:59"))
    
    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Apply sorting
    sort_column = getattr(Document, sort_by, Document.created_at)
    if sort_order == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(sort_column)
    
    # Apply pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    documents = result.unique().scalars().all()
    
    return documents, total


async def get_document_detail(db: AsyncSession, doc_id: uuid.UUID) -> Optional[Document]:
    """Get a single document with all its versions and audit logs."""
    result = await db.execute(
        select(Document)
        .options(
            joinedload(Document.author),
            joinedload(Document.category),
            selectinload(Document.versions).joinedload(DocumentVersion.uploader),
            selectinload(Document.audit_logs).joinedload(AuditLog.actor),
        )
        .where(Document.id == doc_id)
    )
    return result.unique().scalar_one_or_none()


async def upload_new_version(
    db: AsyncSession,
    doc_id: uuid.UUID,
    file_bytes: bytes,
    filename: str,
    version_number: str,
    actor_id: Optional[uuid.UUID] = None,
) -> DocumentVersion:
    """Upload a new version of an existing document."""
    # Get document
    result = await db.execute(select(Document).where(Document.id == doc_id))
    document = result.scalar_one_or_none()
    if not document:
        raise ValueError("Document not found")
    
    # Save file
    file_path, stored_name = await save_uploaded_file(file_bytes, filename)
    file_ext = os.path.splitext(filename)[1].strip(".")
    extracted_text = extract_text(file_bytes, file_ext)
    
    # Get categories for AI
    cat_result = await db.execute(select(Category).where(Category.is_active == True))
    categories = [c.name for c in cat_result.scalars().all()]
    
    ai_metadata = None
    if extracted_text:
        ai_metadata = await extract_metadata(extracted_text, categories)
    
    # Mark old versions as not current
    from sqlalchemy import update as sql_update
    await db.execute(
        sql_update(DocumentVersion)
        .where(DocumentVersion.document_id == doc_id)
        .values(is_current=False)
    )
    
    # Delete old chunks for this document
    from sqlalchemy import delete as sql_delete
    await db.execute(
        sql_delete(DocumentChunk).where(DocumentChunk.document_id == doc_id)
    )
    
    # Create new version
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
    )
    db.add(doc_version)
    await db.flush()
    
    # Update document
    document.current_version = version_number
    document.updated_at = datetime.utcnow()
    
    # Generate new embeddings
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
    
    # Audit log
    actor_name = None
    if actor_id:
        user_result = await db.execute(select(User).where(User.id == actor_id))
        user = user_result.scalar_one_or_none()
        if user:
            actor_name = user.name
    
    audit = AuditLog(
        document_id=doc_id,
        action="UPDATE",
        actor_id=actor_id,
        actor_name=actor_name,
        details={"version": version_number, "file_name": filename},
    )
    db.add(audit)
    
    await db.commit()
    return doc_version
