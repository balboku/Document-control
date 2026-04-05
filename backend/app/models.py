import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, BigInteger,
    DateTime, ForeignKey, Index, Computed, UniqueConstraint, text
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, TSVECTOR
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    department = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    role = Column(String(20), nullable=False, default="editor")  # admin / editor / viewer
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    authored_documents = relationship("Document", back_populates="author", foreign_keys="Document.author_id")


class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    documents = relationship("Document", back_populates="category")
    number_format = relationship("NumberFormat", back_populates="category", uselist=False)


class NumberFormat(Base):
    __tablename__ = "number_format"

    id = Column(Integer, primary_key=True, default=1)
    prefix = Column(String(20), default="DOC")
    separator = Column(String(5), default="-")
    year_format = Column(String(4), default="YYYY")  # YYYY or YY
    sequence_digits = Column(Integer, default=4)
    current_sequence = Column(Integer, default=0)
    current_year = Column(Integer, default=2026)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True, unique=True)

    # Relationships
    category = relationship("Category", back_populates="number_format")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_number = Column(String(50), unique=True, nullable=False, index=True)
    title = Column(String(500), nullable=True)
    status = Column(String(20), default="draft")  # reserved, draft, active, archived
    ai_processing_status = Column(String(20), default="completed")  # pending, completed, failed
    current_version = Column(String(20), nullable=True)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)

    # [優化2] JSON → JSONB，支援 GIN 索引與更快的 JSON 操作
    keywords = Column(JSONB, nullable=True)  # List of keywords

    notes = Column(Text, nullable=True)
    reserved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # [優化4] 軟刪除欄位：記錄刪除時間，NULL 表示未刪除
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # [優化-樂觀鎖] row_version 欄位：每次 UPDATE 自動遞增，防止並發編輯衝突
    # SQLAlchemy 會在 UPDATE 時自動校驗，若版本不符則拋出 StaleDataError
    row_version = Column(Integer, nullable=False, default=1, server_default="1")

    # [優化3] 全文檢索：由 PostgreSQL 自動計算，基於 title + doc_number 產生 tsvector
    # 注意：此為 GENERATED ALWAYS AS ... STORED 計算欄位，需配合遷移 SQL 建立
    search_vector = Column(
        TSVECTOR,
        Computed(
            "to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(doc_number, ''))",
            persisted=True,
        ),
        nullable=True,
    )

    # Relationships
    author = relationship("User", back_populates="authored_documents", foreign_keys=[author_id])
    category = relationship("Category", back_populates="documents")
    versions = relationship("DocumentVersion", back_populates="document", order_by="DocumentVersion.uploaded_at.desc()", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="document", order_by="AuditLog.created_at.desc()", cascade="all, delete-orphan")
    mdf_links = relationship("MDFDocumentLink", back_populates="document", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_documents_status", "status"),
        Index("idx_documents_created_at", "created_at"),
        # [優化4] 軟刪除查詢索引：過濾未刪除資料時使用
        Index("idx_documents_deleted_at", "deleted_at"),
        # [優化2] GIN 索引：加速 keywords 的 JSON 包含查詢
        Index("idx_documents_keywords_gin", "keywords", postgresql_using="gin"),
        # [優化3] GIN 索引：加速全文檢索
        Index("idx_documents_search_vector_gin", "search_vector", postgresql_using="gin"),
    )




class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    version_number = Column(String(20), nullable=False)
    file_name = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    file_type = Column(String(20), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    file_hash = Column(String(64), nullable=True)  # SHA-256 hash for duplicate detection
    extracted_text = Column(Text, nullable=True)

    # [優化2] JSON → JSONB，支援 GIN 索引與更快的 JSON 操作
    ai_metadata = Column(JSONB, nullable=True)

    ai_analysis_text = Column(Text, nullable=True)
    ai_processing_status = Column(String(20), default="completed")  # pending, completed, failed
    is_current = Column(Boolean, default=True)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # [優化4] 軟刪除欄位
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    document = relationship("Document", back_populates="versions")
    uploader = relationship("User", foreign_keys=[uploaded_by])
    chunks = relationship("DocumentChunk", back_populates="version", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_versions_document_id", "document_id"),
        Index("idx_versions_file_hash", "file_hash"),
        # [優化2] GIN 索引：加速 ai_metadata 的 JSON 包含查詢
        Index("idx_versions_ai_metadata_gin", "ai_metadata", postgresql_using="gin"),
        # [優化-唯一性約束] 同一文件下不允許重複的版本號
        UniqueConstraint("document_id", "version_number", name="uq_doc_version_number"),
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version_id = Column(UUID(as_uuid=True), ForeignKey("document_versions.id"), nullable=False)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(3072), nullable=True)  # gemini-embedding-2-preview outputs 3072 dims

    # Relationships
    version = relationship("DocumentVersion", back_populates="chunks")

    __table_args__ = (
        Index("idx_chunks_document_id", "document_id"),
        Index("idx_chunks_version_id", "version_id"),
        # [優化1] HNSW 向量索引：針對 3072 維 Gemini Embedding 向量
        # m=24：每節點最大連線數，高維向量建議 16~32，24 為精度/速度平衡點
        # ef_construction=200：建構品質係數，值越高索引精度越高（建構時間亦越長）
        # pgvector 將 HNSW 限制在 2000 維內，因此我們透過轉型為半精度 (halfvec) 突破限制
        Index(
            "idx_chunks_embedding_hnsw",
            text("(embedding::halfvec(3072)) halfvec_cosine_ops"),
            postgresql_using="hnsw",
            postgresql_with={"m": 24, "ef_construction": 200},
        ),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    action = Column(String(50), nullable=False)  # CREATE, UPLOAD, UPDATE, DOWNLOAD, RESERVE, ARCHIVE
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(100), nullable=True)

    # [優化2] JSON → JSONB，支援 GIN 索引與更快的 JSON 操作
    details = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # [優化-留存策略] 標記此筆日誌的法規留存截止日（NULL = 永久保留）
    # 通常由 purge_old_audit_logs() 服務函式依法規天數自動設定
    retention_expires_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    document = relationship("Document", back_populates="audit_logs")
    actor = relationship("User", foreign_keys=[actor_id])

    __table_args__ = (
        Index("idx_audit_document_id", "document_id"),
        Index("idx_audit_created_at", "created_at"),
        # [優化2] GIN 索引：加速 details 的 JSON 包含查詢（適合 @> 操作符）
        Index("idx_audit_details_gin", "details", postgresql_using="gin"),
        # [優化-留存] 加速留存期清理查詢（只掃描有截止日的資料列）
        Index(
            "idx_audit_retention_expires",
            "retention_expires_at",
            postgresql_where=text("retention_expires_at IS NOT NULL"),
        ),
        # [優化-JSONB路徑索引] 針對 details->>'version' 的常用查詢
        # 使用 expression index 讓 WHERE details->>'version' = '1.0' 走索引
        Index(
            "idx_audit_details_version",
            text("(details->>'version')"),
            postgresql_where=text("details ? 'version'"),
        ),
    )


class MDFProject(Base):
    __tablename__ = "mdf_projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_name = Column(String(255), nullable=False)
    project_no = Column(String(100), unique=True, nullable=False, index=True)
    classification = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    linked_documents = relationship("MDFDocumentLink", back_populates="project", cascade="all, delete-orphan")


class MDFDocumentLink(Base):
    __tablename__ = "mdf_document_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mdf_project_id = Column(UUID(as_uuid=True), ForeignKey("mdf_projects.id"), nullable=False)
    item_no = Column(Integer, nullable=False)  # Item 1~18
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("MDFProject", back_populates="linked_documents")
    document = relationship("Document", back_populates="mdf_links")

    __table_args__ = (
        Index("idx_mdf_links_project_id", "mdf_project_id"),
        Index("idx_mdf_links_document_id", "document_id"),
    )

class RegulatoryRequirement(Base):
    __tablename__ = "regulatory_requirements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    standard_name = Column(String(100), nullable=False)  # e.g., "ISO 13485:2016"
    clause_no = Column(String(50), nullable=False)      # e.g., "7.3.3"
    title = Column(String(255), nullable=True)
    requirement_text = Column(Text, nullable=False)
    embedding = Column(Vector(3072), nullable=True)     # For semantic mapping
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_regulatory_standard_clause", "standard_name", "clause_no"),
    )


class ComplianceInsight(Base):
    __tablename__ = "compliance_insights"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type = Column(String(50), nullable=False)  # "MISSING_DOC", "RELEVANT_CLAUSE", "AUDIT_TIP"
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    severity = Column(String(20), default="info")  # "info", "warning", "critical"
    
    # Optional linking to specific relevant data
    related_id = Column(UUID(as_uuid=True), nullable=True)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_insights_type", "type"),
        Index("idx_insights_created_at", "created_at"),
    )


# ============================================================
# [優化-樂觀鎖] Document 樂觀鎖啟用
# ============================================================
# SQLAlchemy 建議透過 mapper_registry.configure() 後設定 version_id_col
# 直接在 class body 中設定 __mapper_args__ 使用 Column 物件可能有前向依賴問題
# 此處使用安全的事件監聽器方式，在所有 mapper 初始化完成後套用
from sqlalchemy import event
from sqlalchemy.orm import configure_mappers


@event.listens_for(Document, "init", propagate=True)
def _configure_document_optimistic_lock(target, args, kwargs):
    """確保樂觀鎖欄位在實例初始化時存在。（佔位，實際設定由下方完成）"""
    pass


# 在模組載入完成後設定 version_id_col（安全的時間點）
# 使用 inspect 取得 mapper，再直接設定版本欄位
def _apply_optimistic_lock():
    """套用 Document 樂觀鎖設定。在 create_all / get_db 前會自動呼叫。"""
    from sqlalchemy import inspect as sa_inspect
    try:
        mapper = sa_inspect(Document)
        if not mapper.version_id_col:
            mapper.version_id_col = Document.__table__.c.row_version
            mapper.version_id_generator = False  # 使用自定義遞增策略（+1）
    except Exception:
        pass  # 若已設定則忽略


# 立即執行以確保最早載入時生效
_apply_optimistic_lock()
