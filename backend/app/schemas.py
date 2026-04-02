from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from uuid import UUID


# ============ User Schemas ============

class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    department: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None

class UserResponse(BaseModel):
    id: UUID
    name: str
    department: Optional[str]
    is_active: bool
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

class NumberFormatResponse(BaseModel):
    id: int
    prefix: str
    separator: str
    year_format: str
    sequence_digits: int
    current_sequence: int
    current_year: int
    example: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============ Document Schemas ============

class DocumentUploadResponse(BaseModel):
    file_id: str
    file_name: str
    file_type: str
    file_size: int
    extracted_text_preview: str
    ai_metadata: Optional[dict] = None

class DocumentConfirm(BaseModel):
    file_id: str
    title: str
    doc_number: Optional[str] = None  # If binding to reserved number
    version: str = "v1.0"
    author_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    notes: Optional[str] = None

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    author_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class DocumentVersionResponse(BaseModel):
    id: UUID
    version_number: str
    file_name: str
    file_type: str
    file_size: int
    ai_metadata: Optional[dict]
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
    current_version: Optional[str]
    author_id: Optional[UUID]
    author_name: Optional[str] = None
    category_id: Optional[UUID]
    category_name: Optional[str] = None
    notes: Optional[str]
    reserved_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class DocumentDetailResponse(DocumentResponse):
    versions: List[DocumentVersionResponse] = []

class DocumentListResponse(BaseModel):
    items: List[DocumentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============ Reserve Schemas ============

class ReserveRequest(BaseModel):
    notes: Optional[str] = None
    actor_id: Optional[UUID] = None

class ReserveResponse(BaseModel):
    id: UUID
    doc_number: str
    status: str
    reserved_at: datetime


# ============ Search Schemas ============

class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(default=10, ge=1, le=50)

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


# ============ Export Schemas ============

class ExportRequest(BaseModel):
    document_ids: Optional[List[UUID]] = None
    format: str = "csv"  # csv or xlsx
    filters: Optional[dict] = None

class BatchDownloadRequest(BaseModel):
    document_ids: List[UUID]

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
