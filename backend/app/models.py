import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, BigInteger,
    DateTime, ForeignKey, JSON, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    department = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
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


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_number = Column(String(50), unique=True, nullable=False, index=True)
    title = Column(String(500), nullable=True)
    status = Column(String(20), default="draft")  # reserved, draft, active, archived
    current_version = Column(String(20), nullable=True)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    keywords = Column(JSON, nullable=True)  # List of keywords
    notes = Column(Text, nullable=True)
    reserved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    author = relationship("User", back_populates="authored_documents", foreign_keys=[author_id])
    category = relationship("Category", back_populates="documents")
    versions = relationship("DocumentVersion", back_populates="document", order_by="DocumentVersion.uploaded_at.desc()")
    audit_logs = relationship("AuditLog", back_populates="document", order_by="AuditLog.created_at.desc()")

    __table_args__ = (
        Index("idx_documents_status", "status"),
        Index("idx_documents_created_at", "created_at"),
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
    ai_metadata = Column(JSON, nullable=True)
    is_current = Column(Boolean, default=True)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="versions")
    uploader = relationship("User", foreign_keys=[uploaded_by])
    chunks = relationship("DocumentChunk", back_populates="version", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_versions_document_id", "document_id"),
        Index("idx_versions_file_hash", "file_hash"),
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
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    action = Column(String(50), nullable=False)  # CREATE, UPLOAD, UPDATE, DOWNLOAD, RESERVE, ARCHIVE
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(100), nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="audit_logs")
    actor = relationship("User", foreign_keys=[actor_id])

    __table_args__ = (
        Index("idx_audit_document_id", "document_id"),
        Index("idx_audit_created_at", "created_at"),
    )
