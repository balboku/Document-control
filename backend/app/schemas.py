from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime
from uuid import UUID


# ============ User Schemas ============

VALID_ROLES = ["admin", "editor", "viewer"]

class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    department: Optional[str] = None
    role: Optional[str] = "editor"

class UserUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None

class UserResponse(BaseModel):
    id: UUID
    name: str
    department: Optional[str]
    is_active: bool
    role: str = "editor"
    created_at: datetime

    class Config:
        from_attributes = True


# ============ Category Schemas ============

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    sort_order: Optional[int] = 0

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None

class CategoryResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    is_active: bool
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True


# ============ Number Format Schemas ============

class NumberFormatUpdate(BaseModel):
    prefix: Optional[str] = None
    separator: Optional[str] = None
    year_format: Optional[str] = None  # YYYY or YY
    sequence_digits: Optional[int] = None
    category_id: Optional[UUID] = None

class NumberFormatResponse(BaseModel):
    id: int
    prefix: str
    separator: str
    year_format: str
    sequence_digits: int
    current_sequence: int
    current_year: int
    category_id: Optional[UUID] = None
    example: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============ Document Schemas ============

class DocumentUploadResponse(BaseModel):
    file_id: Optional[str] = None
    file_name: str
    file_type: str
    file_size: int
    extracted_text_preview: str
    ai_metadata: Optional[dict] = None
    duplicate_check: Optional[dict] = None  # Contains duplicate detection results

class ExtractMetadataResponse(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    keywords: List[str] = []
    summary: Optional[str] = None
    version: Optional[str] = None
    doc_number: Optional[str] = None
    extracted_text_preview: str
    file_hash: str

class DocumentConfirm(BaseModel):
    file_id: str
    title: str
    doc_number: Optional[str] = None  # If binding to reserved number
    version: str = "v1.0"
    author_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    keywords: Optional[List[str]] = None
    notes: Optional[str] = None
    actor_id: Optional[UUID] = None
    file_hash: Optional[str] = None  # SHA-256 hash for duplicate detection

class DocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    category_id: Optional[UUID] = None
    author_id: Optional[UUID] = None
    notes: Optional[str] = None
    keywords: Optional[List[str]] = None
    status: Optional[str] = "draft"

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    author_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    keywords: Optional[List[str]] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class DocumentVersionResponse(BaseModel):
    id: UUID
    version_number: str
    file_name: str
    file_type: str
    file_size: int
    ai_metadata: Optional[dict]
    ai_processing_status: Optional[str] = None
    is_current: bool
    uploaded_by: Optional[UUID]
    uploader_name: Optional[str] = None
    uploaded_at: datetime

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: UUID
    doc_number: str
    title: Optional[str]
    status: str
    ai_processing_status: Optional[str] = None
    current_version: Optional[str]
    author_id: Optional[UUID]
    author_name: Optional[str] = None
    category_id: Optional[UUID]
    category_name: Optional[str] = None
    keywords: Optional[List[str]] = None
    notes: Optional[str]
    reserved_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class DocumentWithMdfResponse(DocumentResponse):
    """Extended document response containing project links."""
    mdf_links: List["MDFLinkInfo"] = Field(default_factory=list)


class DocumentBriefResponse(BaseModel):
    id: UUID
    doc_number: str
    title: Optional[str]
    status: str
    ai_processing_status: Optional[str] = None
    current_version: Optional[str]
    author_name: Optional[str] = None
    category_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class DocumentDetailResponse(DocumentResponse):
    versions: List[DocumentVersionResponse] = []

class DocumentListResponse(BaseModel):
    items: List[DocumentWithMdfResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    # [優化5] 游標分頁：當使用 cursor 模式時回傳下一頁游標，None 表示已無更多資料
    next_cursor: Optional[str] = None


# ============ Reserve Schemas ============

class ReserveRequest(BaseModel):
    notes: Optional[str] = None
    actor_id: Optional[UUID] = None
    category_id: Optional[UUID] = None

class ReserveResponse(BaseModel):
    id: UUID
    doc_number: str
    status: str
    reserved_at: datetime


# ============ Search Schemas ============

class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(default=10, ge=1, le=50)
    skip: int = Field(default=0, ge=0)
    category_id: Optional[UUID] = None
    status: Optional[str] = None

class SemanticSearchResult(BaseModel):
    document_id: UUID
    doc_number: str
    title: Optional[str]
    chunk_content: str
    similarity_score: float
    status: str

class SemanticSearchResponse(BaseModel):
    results: List[SemanticSearchResult]
    query: str
    total_count: int = 0
    page: int = 1
    total_pages: int = 1


# ============ Audit Log Schemas ============

class AuditLogResponse(BaseModel):
    id: UUID
    document_id: Optional[UUID]
    action: str
    actor_name: Optional[str]
    details: Optional[dict]
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentHistoryResponse(BaseModel):
    """Combined history response with versions and audit logs in timeline format."""
    document_id: UUID
    doc_number: str
    title: Optional[str]
    versions: List[DocumentVersionResponse]
    audit_logs: List[AuditLogResponse]


class TimelineEntryResponse(BaseModel):
    """Single timeline entry combining version and audit log data."""
    type: str  # 'version' or 'audit'
    timestamp: str
    data: dict


class RelatedDocumentResponse(BaseModel):
    """Response for semantically related documents."""
    document_id: UUID
    doc_number: str
    title: Optional[str]
    similarity_score: float
    status: str
    category_name: Optional[str] = None
    author_name: Optional[str] = None


class DuplicateCheckResponse(BaseModel):
    """Response for duplicate check during upload."""
    is_exact_duplicate: bool
    is_semantic_duplicate: bool
    duplicate_document_id: Optional[UUID] = None
    duplicate_doc_number: Optional[str] = None
    duplicate_title: Optional[str] = None
    similarity_score: Optional[float] = None


# ============ Export Schemas ============

class ExportRequest(BaseModel):
    document_ids: Optional[List[UUID]] = None
    format: str = "csv"  # csv or xlsx
    filters: Optional[dict] = None

class BatchDownloadRequest(BaseModel):
    document_ids: List[UUID]

class BatchStatusUpdateRequest(BaseModel):
    document_ids: List[UUID]
    status: str

class DocumentStatsResponse(BaseModel):
    active_count: int
    draft_count: int
    reserved_count: int
    today_upload_count: int
    recent_documents: List[DocumentResponse]

class RelationAnalysisResponse(BaseModel):
    document_id: UUID
    analysis_text: str
    related_documents: List[Dict[str, Any]]
    cached: bool = False



# ============ MDF (Medical Device File) Schemas ============

class MDFDocumentLinkBase(BaseModel):
    item_no: int = Field(..., ge=1, le=18)
    document_id: UUID

class MDFDocumentLinkCreate(MDFDocumentLinkBase):
    pass

class MDFDocumentLinkResponse(MDFDocumentLinkBase):
    id: UUID
    mdf_project_id: UUID
    created_at: datetime
    # Document details for response
    document: Optional[DocumentBriefResponse] = None

    class Config:
        from_attributes = True

class MDFProjectBase(BaseModel):
    product_name: str = Field(..., min_length=1, max_length=255)
    project_no: str = Field(..., min_length=1, max_length=100)
    classification: Optional[str] = Field(None, max_length=50)

class MDFProjectCreate(MDFProjectBase):
    pass

class MDFProjectUpdate(BaseModel):
    product_name: Optional[str] = Field(None, min_length=1, max_length=255)
    project_no: Optional[str] = Field(None, min_length=1, max_length=100)
    classification: Optional[str] = Field(None, max_length=50)

class MDFProjectResponse(MDFProjectBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    linked_documents: List[MDFDocumentLinkResponse] = []

    class Config:
        from_attributes = True


class MDFProjectBasicInfo(BaseModel):
    project_no: str
    product_name: str

    class Config:
        from_attributes = True


class MDFLinkInfo(BaseModel):
    item_no: int
    project: MDFProjectBasicInfo

    class Config:
        from_attributes = True


