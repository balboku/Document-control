import asyncio
from sqlalchemy import select, func
from app.database import AsyncSessionLocal
from app.models import Document, DocumentVersion, DocumentChunk

async def check_data():
    async with AsyncSessionLocal() as db:
        # Check document counts
        doc_count = await db.scalar(select(func.count(Document.id)))
        version_count = await db.scalar(select(func.count(DocumentVersion.id)))
        chunk_count = await db.scalar(select(func.count(DocumentChunk.id)))
        
        print(f"Total Documents: {doc_count}")
        print(f"Total Versions: {version_count}")
        print(f"Total Chunks: {chunk_count}")
        
        # Find documents without chunks
        result = await db.execute(
            select(Document.id, Document.title, Document.doc_number)
            .outerjoin(DocumentChunk, Document.id == DocumentChunk.document_id)
            .where(DocumentChunk.id == None)
        )
        docs_no_chunks = result.all()
        
        print("\nDocuments with NO chunks (Vector Search will fail for these):")
        for doc in docs_no_chunks:
            print(f"- {doc.title} ({doc.doc_number}) [ID: {doc.id}]")

        # Check for documents with very few chunks
        result = await db.execute(
            select(Document.id, Document.title, func.count(DocumentChunk.id).label('chunk_count'))
            .join(DocumentChunk, Document.id == DocumentChunk.document_id)
            .group_by(Document.id, Document.title)
            .having(func.count(DocumentChunk.id) < 1) # This is redundant due to outerjoin above, but let's see counts
        )
        # Re-check with counts
        result = await db.execute(
            select(Document.id, Document.title, func.count(DocumentChunk.id))
            .join(DocumentChunk, Document.id == DocumentChunk.document_id)
            .group_by(Document.id, Document.title)
        )
        docs_with_counts = result.all()
        print("\nDocuments with chunk counts:")
        for doc_id, title, count in docs_with_counts:
            print(f"- {title}: {count} chunks")

if __name__ == "__main__":
    asyncio.run(check_data())
