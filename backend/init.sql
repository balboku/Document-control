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
