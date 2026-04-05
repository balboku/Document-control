-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- MDF Projects table
CREATE TABLE IF NOT EXISTS mdf_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_name VARCHAR(255) NOT NULL,
    project_no VARCHAR(100) UNIQUE NOT NULL,
    classification VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MDF Document Links table
CREATE TABLE IF NOT EXISTS mdf_document_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mdf_project_id UUID NOT NULL REFERENCES mdf_projects(id) ON DELETE CASCADE,
    item_no INTEGER NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mdf_projects_no ON mdf_projects(project_no);
CREATE INDEX IF NOT EXISTS idx_mdf_links_project ON mdf_document_links(mdf_project_id);
CREATE INDEX IF NOT EXISTS idx_mdf_links_doc ON mdf_document_links(document_id);


-- ============================================================
-- 效能優化遷移 SQL（適用於已存在的資料庫）
-- 若為全新環境，SQLAlchemy create_all 會自動建立，無需手動執行
-- ============================================================

-- [優化2] JSON → JSONB 型別轉換（現有資料庫執行一次）
-- ALTER TABLE documents ALTER COLUMN keywords TYPE JSONB USING keywords::jsonb;
-- ALTER TABLE document_versions ALTER COLUMN ai_metadata TYPE JSONB USING ai_metadata::jsonb;
-- ALTER TABLE audit_logs ALTER COLUMN details TYPE JSONB USING details::jsonb;

-- [優化2] GIN 索引建立（適用已存在資料庫，CONCURRENTLY 不鎖表）
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_keywords_gin ON documents USING gin(keywords);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_versions_ai_metadata_gin ON document_versions USING gin(ai_metadata);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_details_gin ON audit_logs USING gin(details);

-- [優化3] 全文檢索：新增 tsvector 計算欄位（GENERATED ALWAYS AS STORED）
-- 注意：PostgreSQL 12+ 才支援 GENERATED 語法
-- ALTER TABLE documents
--   ADD COLUMN IF NOT EXISTS search_vector tsvector
--   GENERATED ALWAYS AS (
--     to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(doc_number, ''))
--   ) STORED;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_search_vector_gin
--   ON documents USING gin(search_vector);

-- [優化4] 軟刪除欄位
-- ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
-- ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);

-- [優化1] HNSW 向量索引（大型資料集建議在離峰時段執行）
-- 注意：需先確認 pgvector 版本 >= 0.5.0 才支援 HNSW
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_embedding_hnsw
--   ON document_chunks
--   USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
