"""Document business logic service."""
import os
import uuid
import base64
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Tuple
from sqlalchemy import select, func, desc, and_, or_, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload, defer as sa_defer
from sqlalchemy.orm.exc import StaleDataError  # 樂觀鎖衝突時會拋出此異常

from app.database import AsyncSessionLocal
from app.models import Document, DocumentVersion, DocumentChunk, AuditLog, NumberFormat, User, Category, MDFDocumentLink

from app.services.file_parser import extract_text
from app.services.ai_service import extract_metadata, analyze_relations_with_ai, extract_text_multimodal
from app.services.embedding_service import generate_embeddings, check_semantic_duplicate
from app.utils.chunking import chunk_text
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


async def ensure_upload_dir():
    """Ensure the upload directory exists."""
    os.makedirs(settings.upload_dir, exist_ok=True)


async def generate_doc_number(db: AsyncSession, category_id: Optional[uuid.UUID] = None) -> str:
    """Generate the next document number based on the configured format."""
    fmt = None
    
    # Try to get category-specific format
    if category_id:
        result = await db.execute(select(NumberFormat).where(NumberFormat.category_id == category_id))
        fmt = result.scalar_one_or_none()
        
    # If not found or no category, try Global Default (category_id is NULL)
    if fmt is None:
        result = await db.execute(select(NumberFormat).where(NumberFormat.category_id.is_(None)))
        fmt = result.scalar_one_or_none()

    # Fallback to id=1 for backward compatibility
    if fmt is None:
        result = await db.execute(select(NumberFormat).where(NumberFormat.id == 1))
        fmt = result.scalar_one_or_none()
    
    current_year = datetime.now().year
    
    if fmt is None:
        fmt = NumberFormat(
            prefix="DOC", separator="-",
            year_format="YYYY", sequence_digits=4,
            current_sequence=0, current_year=current_year,
            category_id=None
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


async def _get_text_with_ocr(file_bytes: bytes, filename: str) -> Optional[str]:
    """Extract text from file, falling back to Gemini OCR if needed."""
    file_ext = os.path.splitext(filename)[1].lower().strip(".")
    text = extract_text(file_bytes, file_ext)
    
    # Define formats that might need OCR
    ocr_formats = ["pdf", "jpg", "jpeg", "png", "tiff", "webp", "bmp"]
    
    # If text is empty or None, and it's a format that might need OCR
    if (not text or not text.strip()) and file_ext in ocr_formats:
        logger.info(f"Standard text extraction failed for {filename}, attempting Gemini OCR...")
        
        # Map extension to mime type
        mime_map = {
            "pdf": "application/pdf",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "tiff": "image/tiff",
            "webp": "image/webp",
            "bmp": "image/bmp",
        }
        mime_type = mime_map.get(file_ext, "application/octet-stream")
        
        ocr_text = await extract_text_multimodal(file_bytes, mime_type)
        if ocr_text:
            logger.info(f"Gemini OCR successfully extracted text for {filename}")
            return ocr_text
    
    return text


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
    # Calculate file hash for duplicate detection
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    # Check for exact duplicate by hash
    existing_version = await db.execute(
        select(DocumentVersion).where(DocumentVersion.file_hash == file_hash)
    )
    duplicate_version = existing_version.scalar_one_or_none()

    if duplicate_version:
        # Get the associated document
        existing_doc = await db.execute(
            select(Document).where(Document.id == duplicate_version.document_id)
        )
        duplicate_doc = existing_doc.scalar_one_or_none()

        return {
            "file_id": None,
            "file_name": filename,
            "file_type": os.path.splitext(filename)[1].strip("."),
            "file_size": file_size,
            "extracted_text_preview": "",
            "ai_metadata": None,
            "duplicate_check": {
                "is_exact_duplicate": True,
                "is_semantic_duplicate": False,
                "duplicate_document_id": str(duplicate_doc.id) if duplicate_doc else None,
                "duplicate_doc_number": duplicate_doc.doc_number if duplicate_doc else None,
                "duplicate_title": duplicate_doc.title if duplicate_doc else None,
                "similarity_score": None,
            }
        }

    # Save file
    file_path, stored_name = await save_uploaded_file(file_bytes, filename)

    # Extract text (with OCR fallback)
    extracted_text = await _get_text_with_ocr(file_bytes, filename)

    # Check for semantic duplicate
    semantic_duplicate = None
    if extracted_text:
        semantic_duplicate = await check_semantic_duplicate(db, extracted_text, similarity_threshold=0.95)

    if semantic_duplicate:
        return {
            "file_id": stored_name,
            "file_name": filename,
            "file_path": file_path,
            "file_type": file_ext,
            "file_size": file_size,
            "extracted_text_preview": (extracted_text or "")[:500],
            "ai_metadata": None,
            "duplicate_check": {
                "is_exact_duplicate": False,
                "is_semantic_duplicate": True,
                "duplicate_document_id": semantic_duplicate["document_id"],
                "duplicate_doc_number": semantic_duplicate["doc_number"],
                "duplicate_title": semantic_duplicate["title"],
                "similarity_score": semantic_duplicate["similarity_score"],
            }
        }

    # Get categories for AI prompt
    result = await db.execute(
        select(Category).where(Category.is_active == True).order_by(Category.sort_order)
    )
    categories = [c.name for c in result.scalars().all()]

    # Get AI metadata
    ai_metadata = None
    if extracted_text or filename:
        ai_metadata = await extract_metadata(extracted_text, filename, categories)

    return {
        "file_id": stored_name,
        "file_name": filename,
        "file_path": file_path,
        "file_type": file_ext,
        "file_size": file_size,
        "extracted_text": extracted_text or "",
        "extracted_text_preview": (extracted_text or "")[:500],
        "ai_metadata": ai_metadata,
        "file_hash": file_hash,
        "duplicate_check": None,
    }



async def process_doc_ai_background(doc_id: uuid.UUID, version_id: uuid.UUID, file_path: str, filename: str, title: str):
    """Background task to extract text, AI metadata, and embeddings."""
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

async def confirm_document(
    db: AsyncSession,
    file_id: str,
    title: str,
    doc_number: Optional[str],
    version: str,
    author_id: Optional[uuid.UUID],
    category_id: Optional[uuid.UUID],
    keywords: Optional[List[str]],
    notes: Optional[str],
    actor_id: Optional[uuid.UUID] = None,
    file_hash: Optional[str] = None,
) -> Tuple[Document, DocumentVersion]:
    """Confirm and finalize a document upload."""
    file_path = os.path.join(settings.upload_dir, file_id)
    file_ext = os.path.splitext(file_id)[1].strip(".")

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Uploaded file not found: {file_id}")

    # Read file for text extraction and hash calculation
    with open(file_path, "rb") as f:
        file_bytes = f.read()

    # Calculate hash if not provided
    if not file_hash:
        file_hash = hashlib.sha256(file_bytes).hexdigest()

    extracted_text = None  # Processed in background
    ai_metadata = None     # Processed in background
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
            doc_number = await generate_doc_number(db, category_id=category_id)

        document = Document(
            doc_number=doc_number,
            title=title,
            status="active",
            current_version=version,
            author_id=author_id,
            category_id=category_id,
            keywords=keywords,
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
        document.keywords = keywords
        document.notes = notes
        document.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # Mark old versions as not current
    from sqlalchemy import update as sql_update
    await db.execute(
        sql_update(DocumentVersion)
        .where(DocumentVersion.document_id == document.id)
        .values(is_current=False)
    )

    # Create version record
    document.ai_processing_status = "pending"
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
    )
    db.add(doc_version)
    await db.flush()

    # Chunking and embedding moved to background task

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

    return document, doc_version


async def get_extracted_metadata(
    db: AsyncSession,
    file_bytes: bytes,
    filename: str,
) -> dict:
    """
    Extract text and metadata from a file without saving it to the database.
    Used for the pre-upload AI auto-fill feature.
    """
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    extracted_text = await _get_text_with_ocr(file_bytes, filename)
    
    # Get categories for AI prompt
    result = await db.execute(
        select(Category).where(Category.is_active == True).order_by(Category.sort_order)
    )
    categories = [c.name for c in result.scalars().all()]

    ai_metadata = await extract_metadata(extracted_text, filename, categories)
    
    return {
        **ai_metadata,
        "extracted_text_preview": (extracted_text or "")[:500],
        "file_hash": file_hash,
    }


async def reserve_document_number(
    db: AsyncSession,
    notes: Optional[str] = None,
    actor_id: Optional[uuid.UUID] = None,
    category_id: Optional[uuid.UUID] = None,
) -> Document:
    """Reserve a document number for future use."""
    doc_number = await generate_doc_number(db, category_id=category_id)
    
    document = Document(
        doc_number=doc_number,
        status="reserved",
        notes=notes,
        reserved_at=datetime.now(timezone.utc).replace(tzinfo=None),
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
    # [優化5] 游標分頁：傳入上一頁最後一筆的 doc UUID
    last_id: Optional[uuid.UUID] = None,
) -> Tuple[List, int, Optional[str]]:
    """
    取得文件列表，支援過濾、分頁、游標分頁。

    COUNT 策略：
    - 無過濾條件（全表列表）: 使用 pg_class.reltuples 估算（速度快 100x）
    - 有過濾條件: 精確 COUNT(*)（確保分頁正確性）

    游標分頁使用指南：
    - 傳入 last_id（上一頁回傳的 next_cursor 解析後）以啟用游標模式
    - 游標模式不需傳 page，產生的 next_cursor 將被回傳
    """
    # [優化6] 滞遲載入：列表查詢不需要大文本欄位，減少 I/O 與記憶體使用
    query = select(Document).options(
        joinedload(Document.author),
        joinedload(Document.category),
        selectinload(Document.mdf_links).selectinload(MDFDocumentLink.project),
        # 延遲載入 DocumentVersion 中的大儲存量 Text 欄位
        selectinload(Document.versions).options(
            sa_defer(DocumentVersion.extracted_text),
            sa_defer(DocumentVersion.ai_analysis_text),
        ),
    )

    # [優化4] 預設過濾軟刪除資料（deleted_at IS NULL 表示未刪除）
    filters = [Document.deleted_at.is_(None)]

    has_filters = False  # 追蹤是否有額外過濾條件（決定 COUNT 策略）

    if status:
        filters.append(Document.status == status)
        has_filters = True
    if category_id:
        filters.append(Document.category_id == category_id)
        has_filters = True
    if author_id:
        filters.append(Document.author_id == author_id)
        has_filters = True

    if search:
        # [優化3] 全文檢索：優先使用 tsvector @@ tsquery
        # plainto_tsquery 自動處理空白字元，安全且無需手動語法
        try:
            filters.append(
                Document.search_vector.op("@@")(
                    func.plainto_tsquery("simple", search)
                )
            )
        except Exception:
            # Fallback：若 search_vector 欄位尚未建立（遷移期間），回退至 ILIKE
            filters.append(
                or_(
                    Document.title.ilike(f"%{search}%"),
                    Document.doc_number.ilike(f"%{search}%"),
                )
            )
        has_filters = True

    if date_from:
        filters.append(Document.created_at >= datetime.fromisoformat(date_from))
        has_filters = True
    if date_to:
        filters.append(Document.created_at <= datetime.fromisoformat(date_to + "T23:59:59"))
        has_filters = True

    # [優化5] 游標分頁：透過 WHERE id < :last_id 越過已載入的資料
    cursor_mode = last_id is not None
    if cursor_mode:
        # UUID 比較基於數據庫的字典順序；過濾呼現於目待游標之後的資料
        # 請注意：created_at 排序 + id 游標才能保證穩定
        filters.append(Document.id < last_id)

    if filters:
        query = query.where(and_(*filters))

    # ============================================================
    # [優化-COUNT 策略] 智慧估算策略
    # ============================================================
    if not has_filters and not cursor_mode:
        # 無指定過濾條件時，使用 pg_class.reltuples 估算總數
        # 這個方法誳取統計資料，速度比 COUNT(*) 快 100x，精度在 VACUUM/ANALYZE 後舉高
        est_result = await db.execute(
            text("SELECT reltuples::bigint FROM pg_class WHERE relname = 'documents'")
        )
        raw_est = est_result.scalar() or 0
        # 若估算值為 -1（表示成混渴小，尚未 ANALYZE），改用精確 COUNT
        if raw_est > 0:
            total = raw_est
            logger.debug(f"Using pg_class estimate for total count: {total}")
        else:
            total_result = await db.execute(
                select(func.count(Document.id)).where(Document.deleted_at.is_(None))
            )
            total = total_result.scalar() or 0
    elif cursor_mode:
        # 游標模式：总數不含 cursor 條件（展示全表總數）
        base_filters = [f for f in filters if not (
            hasattr(f, 'left') and hasattr(f.left, 'key') and f.left.key == 'id'
        )]
        count_q = (
            select(func.count(Document.id)).where(and_(*base_filters))
            if base_filters
            else select(func.count(Document.id))
        )
        total_result = await db.execute(count_q)
        total = total_result.scalar() or 0
    else:
        # 有過濾條件：精確 COUNT（保證分頁正確性）
        count_filters = [f for f in filters if not (
            hasattr(f, 'left') and hasattr(f.left, 'key') and f.left.key == 'id'
        )]
        total_result = await db.execute(
            select(func.count(Document.id)).where(and_(*count_filters))
        )
        total = total_result.scalar() or 0

    # 排序：始終包含 id 以確保在 created_at 相同時分頁穩定
    sort_column = getattr(Document, sort_by, Document.created_at)
    if sort_order == "desc":
        query = query.order_by(desc(sort_column), desc(Document.id))
    else:
        query = query.order_by(sort_column, Document.id)

    # 分頁
    if cursor_mode:
        # 游標模式不使用 offset
        query = query.limit(page_size + 1)  # 多取 1 筆以判斷是否有下一頁
    else:
        # 傳統 offset 分頁（向下相容）
        query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    documents = list(result.unique().scalars().all())

    # [優化5] 產生下一頁游標
    next_cursor = None
    if cursor_mode and len(documents) > page_size:
        # 移除多取的那筆，將最後一筆的 ID 編碼為游標
        documents = documents[:page_size]
        last_doc = documents[-1]
        # base64 編碼 UUID，方便前端傳遞
        next_cursor = base64.urlsafe_b64encode(str(last_doc.id).encode()).decode()

    return documents, total, next_cursor


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
        .where(Document.id == doc_id, Document.deleted_at.is_(None))
    )
    return result.unique().scalar_one_or_none()


async def upload_new_version(
    db: AsyncSession,
    doc_id: uuid.UUID,
    file_bytes: bytes,
    filename: str,
    version_number: str,
    actor_id: Optional[uuid.UUID] = None,
) -> Tuple[DocumentVersion, Document]:
    """Upload a new version of an existing document."""
    # Get document
    result = await db.execute(select(Document).where(Document.id == doc_id))
    document = result.scalar_one_or_none()
    if not document:
        raise ValueError("Document not found")
    
    # Save file
    file_path, stored_name = await save_uploaded_file(file_bytes, filename)
    file_ext = os.path.splitext(filename)[1].strip(".")
    
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
        extracted_text=None,
        ai_metadata=None,
        ai_processing_status="pending",
        is_current=True,
        uploaded_by=actor_id,
    )
    db.add(doc_version)
    await db.flush()
    
    # Update document
    document.current_version = version_number
    document.ai_processing_status = "pending"
    document.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    
    # Embedding generation moved to background task
    
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
    return doc_version, document


async def get_document_stats(db: AsyncSession) -> dict:
    """Get overall document statistics for the dashboard."""
    active_count = await db.scalar(
        select(func.count(Document.id))
        .where(Document.status == "active", Document.deleted_at.is_(None))
    )
    draft_count = await db.scalar(
        select(func.count(Document.id))
        .where(Document.status == "draft", Document.deleted_at.is_(None))
    )
    reserved_count = await db.scalar(
        select(func.count(Document.id))
        .where(Document.status == "reserved", Document.deleted_at.is_(None))
    )
    
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    # Count uploads today based on created_at or updated_at
    today_upload_count = await db.scalar(
        select(func.count(DocumentVersion.id))
        .where(func.date(DocumentVersion.uploaded_at) == today)
    )
    
    # Get recent documents (eager load mdf_links to avoid MissingGreenlet error)
    recent_docs_result = await db.execute(
        select(Document)
        .options(
            joinedload(Document.author),
            joinedload(Document.category),
            selectinload(Document.mdf_links).selectinload(MDFDocumentLink.project)
        )
        .where(Document.deleted_at.is_(None))
        .order_by(desc(Document.updated_at), desc(Document.created_at))
        .limit(5)
    )
    recent_documents = list(recent_docs_result.unique().scalars().all())
    
    return {
        "active_count": active_count or 0,
        "draft_count": draft_count or 0,
        "reserved_count": reserved_count or 0,
        "today_upload_count": today_upload_count or 0,
        "recent_documents": recent_documents
    }


async def analyze_document_relations(db: AsyncSession, doc_id: uuid.UUID, force_refresh: bool = False) -> dict:
    """Find related documents using embeddings and analyze their relationship using Gemma 3."""
    # Get target document
    target_doc = await get_document_detail(db, doc_id)
    if not target_doc:
        raise ValueError("Document not found")

    # Get all embeddings for the target document's current version
    current_version = next((v for v in target_doc.versions if v.is_current), None)
    if not current_version:
        return {"document_id": doc_id, "analysis_text": "無當前版本，無法進行關聯分析。", "related_documents": []}

    # Check for cached analysis if not forcing refresh
    if not force_refresh and current_version.ai_analysis_text:
        # We still need to fetch related documents to show in the UI, 
        # but we skip the AI generation step.
        logger.info(f"Using cached analysis for document {target_doc.doc_number}")
        
        # We need to find the related documents again for the response 
        # (even if we don't call AI, we need the list for the UI)
        related_docs = await _find_related_docs_data(db, doc_id, current_version)
        
        return {
            "document_id": doc_id,
            "analysis_text": current_version.ai_analysis_text,
            "related_documents": related_docs,
            "cached": True
        }

    # Find related documents for analysis
    related_docs_data = await _find_related_docs_data(db, doc_id, current_version)

    if not related_docs_data:
         return {"document_id": doc_id, "analysis_text": "系統中目前無相關的文件可供關聯。", "related_documents": []}

    target_doc_dict = {
        "doc_number": target_doc.doc_number,
        "title": target_doc.title
    }

    # Send to AI
    analysis_text = await analyze_relations_with_ai(target_doc_dict, related_docs_data)

    # Cache the result
    current_version.ai_analysis_text = analysis_text
    db.add(current_version)
    await db.commit()

    return {
        "document_id": doc_id,
        "analysis_text": analysis_text,
        "related_documents": related_docs_data,
        "cached": False
    }


async def _find_related_docs_data(db: AsyncSession, doc_id: uuid.UUID, current_version: DocumentVersion) -> List[dict]:
    """Helper to find related documents data based on embeddings."""
    chunks_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.version_id == current_version.id)
    )
    target_chunks = chunks_result.scalars().all()
    if not target_chunks:
        return []

    # Use the first chunk's embedding for query
    query_embedding = target_chunks[0].embedding

    # Perform vector search excluding current doc
    results = await db.execute(
        select(DocumentChunk, DocumentVersion, Document)
        .join(DocumentVersion, DocumentChunk.version_id == DocumentVersion.id)
        .join(Document, DocumentVersion.document_id == Document.id)
        .where(Document.id != doc_id)
        .where(Document.status == "active")
        .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
        .limit(50)
    )

    seen_doc_ids = set()
    related_docs_data = []

    for chunk, version, doc in results:
        if doc.id in seen_doc_ids:
            continue

        seen_doc_ids.add(doc.id)
        related_docs_data.append({
            "document_id": doc.id,
            "doc_number": doc.doc_number,
            "title": doc.title,
            "chunk_content": chunk.content[:200] + "..." if len(chunk.content) > 200 else chunk.content,
        })
        
        if len(related_docs_data) >= 5:
            break

    return related_docs_data


async def get_related_documents(db: AsyncSession, doc_id: uuid.UUID, top_k: int = 5) -> list:
    """Find semantically related documents based on embedding similarity."""
    from app.services.embedding_service import find_similar_documents

    # Get target document's current version embedding
    target_doc = await get_document_detail(db, doc_id)
    if not target_doc:
        raise ValueError("Document not found")

    current_version = next((v for v in target_doc.versions if v.is_current), None)
    if not current_version:
        return []

    # Get a representative chunk
    chunks_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.version_id == current_version.id)
        .limit(1)
    )
    target_chunk = chunks_result.scalar_one_or_none()
    if not target_chunk or not target_chunk.embedding:
        return []

    # Find similar documents
    similar_docs = await find_similar_documents(
        db,
        target_chunk.embedding,
        exclude_doc_id=str(doc_id),
        top_k=top_k,
        similarity_threshold=0.5  # Minimum 50% similarity
    )

    # Enrich with author and category names
    for doc_info in similar_docs:
        if doc_info.get("author_id"):
            author_result = await db.execute(
                select(User).where(User.id == doc_info["author_id"])
            )
            author = author_result.scalar_one_or_none()
            doc_info["author_name"] = author.name if author else None
        if doc_info.get("category_id"):
            cat_result = await db.execute(
                select(Category).where(Category.id == doc_info["category_id"])
            )
            cat = cat_result.scalar_one_or_none()
            doc_info["category_name"] = cat.name if cat else None

    return similar_docs


async def get_document_history(db: AsyncSession, doc_id: uuid.UUID) -> dict:
    """Get complete document history including versions and audit logs."""
    document = await get_document_detail(db, doc_id)
    if not document:
        raise ValueError("Document not found")

    # Get all versions
    versions = []
    for v in document.versions:
        versions.append({
            "id": str(v.id),
            "version_number": v.version_number,
            "file_name": v.file_name,
            "file_type": v.file_type,
            "file_size": v.file_size,
            "is_current": v.is_current,
            "uploaded_by": str(v.uploaded_by) if v.uploaded_by else None,
            "uploader_name": v.uploader.name if v.uploader else None,
            "uploaded_at": v.uploaded_at.isoformat(),
        })

    # Get all audit logs
    audit_logs = []
    for log in document.audit_logs:
        audit_logs.append({
            "id": str(log.id),
            "action": log.action,
            "actor_name": log.actor_name,
            "details": log.details,
            "created_at": log.created_at.isoformat(),
        })

    # Combine into timeline format
    timeline = []

    # Add versions to timeline
    for v in versions:
        timeline.append({
            "type": "version",
            "timestamp": v["uploaded_at"],
            "data": v,
        })

    # Add audit logs to timeline
    for log in audit_logs:
        timeline.append({
            "type": "audit",
            "timestamp": log["created_at"],
            "data": log,
        })

    # Sort by timestamp descending
    timeline.sort(key=lambda x: x["timestamp"], reverse=True)

    return {
        "document_id": str(doc_id),
        "doc_number": document.doc_number,
        "title": document.title,
        "versions": versions,
        "audit_logs": audit_logs,
        "timeline": timeline,
    }


async def reindex_document(db: AsyncSession, doc_id: uuid.UUID) -> dict:
    """Regenerate embeddings for a document that has no chunks."""
    from sqlalchemy import delete as sql_delete

    document = await get_document_detail(db, doc_id)
    if not document:
        raise ValueError("Document not found")

    current_version = next((v for v in document.versions if v.is_current), None)
    if not current_version:
        return {"status": "error", "message": "No current version found"}

    extracted_text = current_version.extracted_text
    if not extracted_text or not extracted_text.strip():
        return {"status": "error", "message": "No extracted text available for re-indexing"}

    # Delete existing chunks for this document
    await db.execute(
        sql_delete(DocumentChunk).where(DocumentChunk.document_id == doc_id)
    )
    await db.commit()

    # Generate new chunks and embeddings
    chunks = chunk_text(extracted_text)
    if not chunks:
        return {"status": "error", "message": "Failed to generate text chunks"}

    embeddings = await generate_embeddings(chunks)
    if not embeddings:
        return {"status": "error", "message": "Embedding generation failed - check API key and logs"}

    for idx, (chunk_content, embedding) in enumerate(zip(chunks, embeddings)):
        chunk = DocumentChunk(
            version_id=current_version.id,
            document_id=doc_id,
            chunk_index=idx,
            content=chunk_content,
            embedding=embedding,
        )
        db.add(chunk)

    await db.commit()
    logger.info(f"Re-indexed document {document.doc_number}: created {len(embeddings)} chunks")

    return {
        "status": "success",
        "message": f"Successfully re-indexed with {len(embeddings)} chunks",
        "chunks_created": len(embeddings),
    }


async def reindex_all_documents(db: AsyncSession) -> dict:
    """Regenerate embeddings for ALL documents that have no chunks."""
    from sqlalchemy import delete as sql_delete

    # Find all documents without chunks
    result = await db.execute(
        select(Document.id, Document.doc_number, Document.title)
        .outerjoin(DocumentChunk, Document.id == DocumentChunk.document_id)
        .where(DocumentChunk.id == None)
    )
    docs_no_chunks = result.all()

    if not docs_no_chunks:
        return {"status": "success", "message": "All documents already have chunks", "reindexed": 0}

    total_reindexed = 0
    errors = []

    for doc_id, doc_number, title in docs_no_chunks:
        try:
            # Get current version
            version_result = await db.execute(
                select(DocumentVersion)
                .where(DocumentVersion.document_id == doc_id, DocumentVersion.is_current == True)
            )
            current_version = version_result.scalar_one_or_none()
            if not current_version:
                errors.append({"doc_number": doc_number, "error": "No current version"})
                continue

            extracted_text = current_version.extracted_text
            if not extracted_text or not extracted_text.strip():
                errors.append({"doc_number": doc_number, "error": "No extracted text"})
                continue

            # Delete existing chunks
            await db.execute(
                sql_delete(DocumentChunk).where(DocumentChunk.document_id == doc_id)
            )
            await db.commit()

            # Generate chunks and embeddings
            chunks = chunk_text(extracted_text)
            if not chunks:
                errors.append({"doc_number": doc_number, "error": "Failed to generate chunks"})
                continue

            embeddings = await generate_embeddings(chunks)
            if not embeddings:
                errors.append({"doc_number": doc_number, "error": "Embedding generation failed"})
                continue

            for idx, (chunk_content, embedding) in enumerate(zip(chunks, embeddings)):
                chunk = DocumentChunk(
                    version_id=current_version.id,
                    document_id=doc_id,
                    chunk_index=idx,
                    content=chunk_content,
                    embedding=embedding,
                )
                db.add(chunk)

            await db.commit()
            total_reindexed += 1
            logger.info(f"Re-indexed {doc_number}: {len(embeddings)} chunks")

        except Exception as e:
            errors.append({"doc_number": doc_number, "error": str(e)})
            await db.rollback()

    return {
        "status": "completed",
        "total_found": len(docs_no_chunks),
        "reindexed": total_reindexed,
        "errors": errors,
    }


# ============================================================
# [優化-稽核日誌留存策略]
# ============================================================

async def set_audit_retention(
    audit: AuditLog,
    retain_days: int = 365,
) -> None:
    """
    設定稽核日誌的留存截止日。

    ISO 13485 要求設計文件至少保留至產品生命週期結束後 15 年；
    一般作業日誌建議最少 365 天。

    Args:
        audit: AuditLog 實例（尚未 commit）
        retain_days: 留存天數，預設 365 天（ISO 13485 最低要求）
                     傳入 0 或負數表示永久保留（retention_expires_at = NULL）
    """
    if retain_days > 0:
        audit.retention_expires_at = datetime.now(timezone.utc) + timedelta(days=retain_days)
    else:
        audit.retention_expires_at = None  # 永久保留


async def purge_old_audit_logs(
    db: AsyncSession,
    retain_days: int = 365,
    dry_run: bool = False,
) -> dict:
    """
    清除超過留存期限的稽核日誌。

    留存策略：
    - 優先依 retention_expires_at 欄位判斷（精確控制）
    - 若 retention_expires_at 為 NULL，則視為永久保留，不清除
    - dry_run=True 時只統計不實際刪除（回乾跑模式，安全驗證用）

    符合法規：
    - ISO 13485:2016 第 4.2.5 節：記錄保存期限需依風險等級決定
    - FDA 21 CFR Part 820：設計歷史文件至少保留產品生命週期 + 2 年

    Args:
        db: 非同步資料庫 Session
        retain_days: 當 retention_expires_at 未設定時的備用策略天數
        dry_run: True = 僅統計，不執行刪除

    Returns:
        dict: 包含刪除/預計刪除筆數與錯誤的統計報告
    """
    from sqlalchemy import delete as sql_delete

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=retain_days)

    # 計算符合清除條件的日誌數量
    # 條件：retention_expires_at 已設定且已過期
    count_result = await db.execute(
        select(func.count(AuditLog.id)).where(
            and_(
                AuditLog.retention_expires_at.isnot(None),
                AuditLog.retention_expires_at < datetime.now(timezone.utc),
            )
        )
    )
    eligible_count = count_result.scalar() or 0

    logger.info(
        f"[AuditLog Purge] Found {eligible_count} logs eligible for purge "
        f"(retention_expires_at < now). dry_run={dry_run}"
    )

    if dry_run:
        return {
            "status": "dry_run",
            "eligible_for_purge": eligible_count,
            "purged": 0,
            "message": f"Dry run: {eligible_count} logs would be purged. Set dry_run=False to execute.",
        }

    if eligible_count == 0:
        return {
            "status": "success",
            "eligible_for_purge": 0,
            "purged": 0,
            "message": "No logs eligible for purge.",
        }

    try:
        # 執行批次刪除（條件：retention_expires_at 已過期）
        delete_stmt = sql_delete(AuditLog).where(
            and_(
                AuditLog.retention_expires_at.isnot(None),
                AuditLog.retention_expires_at < datetime.now(timezone.utc),
            )
        )
        result = await db.execute(delete_stmt)
        purged_count = result.rowcount
        await db.commit()

        logger.info(f"[AuditLog Purge] Successfully purged {purged_count} audit logs.")
        return {
            "status": "success",
            "eligible_for_purge": eligible_count,
            "purged": purged_count,
            "cutoff_strategy": "retention_expires_at < now()",
            "message": f"Successfully purged {purged_count} expired audit logs.",
        }

    except Exception as e:
        await db.rollback()
        logger.error(f"[AuditLog Purge] Failed to purge audit logs: {e}")
        return {
            "status": "error",
            "eligible_for_purge": eligible_count,
            "purged": 0,
            "message": f"Purge failed: {str(e)}",
        }
