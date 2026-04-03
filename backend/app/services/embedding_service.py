"""Embedding service for semantic search using Gemini Embedding 2."""
import asyncio
import logging
from typing import List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from google import genai
from app.config import get_settings
from app.models import DocumentChunk, DocumentVersion, Document

logger = logging.getLogger(__name__)
settings = get_settings()

# Rate limiting
_semaphore = asyncio.Semaphore(10)

_client = None


def get_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.google_api_key)
    return _client


async def generate_embeddings(texts: List[str], max_retries: int = 3) -> Optional[List[List[float]]]:
    """
    Generate embeddings for a list of text chunks using Gemini Embedding 2.
    Batches texts to stay within rate limits, with exponential backoff retry.

    Args:
        texts: List of text strings to embed
        max_retries: Maximum number of retry attempts

    Returns:
        List of embedding vectors, or None on failure
    """
    if not texts:
        return []

    async with _semaphore:
        for attempt in range(max_retries):
            try:
                client = get_client()

                # Process in batches of 20 to manage token limits
                batch_size = 20
                all_embeddings = []

                for i in range(0, len(texts), batch_size):
                    batch = texts[i:i + batch_size]

                    response = await asyncio.to_thread(
                        client.models.embed_content,
                        model=settings.embedding_model,
                        contents=batch,
                    )

                    for emb in response.embeddings:
                        all_embeddings.append(emb.values)

                    # Small delay between batches to respect rate limits
                    if i + batch_size < len(texts):
                        await asyncio.sleep(0.5)

                logger.info(f"Successfully generated {len(all_embeddings)} embeddings")
                return all_embeddings

            except Exception as e:
                error_str = str(e).lower()
                is_rate_limit = any(kw in error_str for kw in ["rate limit", "resource exhausted", "429", "too many requests"])
                is_auth_error = any(kw in error_str for kw in ["permission denied", "unauthenticated", "api key", "401", "403"])

                if is_rate_limit:
                    wait_time = 2 ** attempt * 2
                    logger.warning(f"Rate limited on attempt {attempt + 1}/{max_retries}, waiting {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
                elif is_auth_error:
                    logger.error(f"API key/authentication error - check GOOGLE_API_KEY: {e}")
                    return None
                else:
                    wait_time = 2 ** attempt * 2
                    logger.error(f"Embedding generation failed (attempt {attempt + 1}/{max_retries}): {e}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(wait_time)
                    else:
                        return None

        logger.error(f"Embedding generation failed after {max_retries} retries")
        return None


async def generate_query_embedding(query: str) -> Optional[List[float]]:
    """
    Generate embedding for a single search query.

    Args:
        query: The search query text

    Returns:
        Embedding vector or None on failure
    """
    result = await generate_embeddings([query])
    if result and len(result) > 0:
        return result[0]
    return None


async def find_similar_documents(
    db: AsyncSession,
    query_embedding: List[float],
    exclude_doc_id: Optional[str] = None,
    top_k: int = 5,
    similarity_threshold: float = 0.0
) -> List[Tuple[dict, float]]:
    """
    Find similar documents using cosine similarity on embeddings.

    Args:
        db: Database session
        query_embedding: The embedding vector to compare against
        exclude_doc_id: Document ID to exclude from results
        top_k: Maximum number of results to return
        similarity_threshold: Minimum similarity score (0-1)

    Returns:
        List of tuples (document_info, similarity_score)
    """
    try:
        # Query using cosine distance (lower = more similar)
        # pgvector's cosine_distance returns 1 - cosine_similarity
        query = (
            select(DocumentChunk, DocumentVersion, Document)
            .join(DocumentVersion, DocumentChunk.version_id == DocumentVersion.id)
            .join(Document, DocumentVersion.document_id == Document.id)
            .where(Document.status == "active")
            .where(DocumentVersion.is_current == True)
        )

        if exclude_doc_id:
            query = query.where(Document.id != exclude_doc_id)

        query = query.order_by(
            DocumentChunk.embedding.cosine_distance(query_embedding)
        ).limit(top_k * 3)  # Fetch more to deduplicate

        result = await db.execute(query)
        rows = result.all()

        # Deduplicate by document_id and collect similarity scores
        seen_docs = {}
        for chunk, version, doc in rows:
            if doc.id not in seen_docs:
                # Calculate cosine similarity from cosine distance
                # cosine_distance = 1 - cosine_similarity
                # We need to get the actual distance value
                seen_docs[doc.id] = {
                    "document": doc,
                    "version": version,
                    "chunk_content": chunk.content[:200] + "..." if len(chunk.content) > 200 else chunk.content,
                }

        # Build response with proper similarity calculation
        # Re-query to get accurate distance values
        similar_docs = []
        for doc_id, info in list(seen_docs.items())[:top_k]:
            # Get a representative chunk for this document to calculate similarity
            chunk_result = await db.execute(
                select(DocumentChunk)
                .where(DocumentChunk.document_id == doc_id)
                .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
                .limit(1)
            )
            representative_chunk = chunk_result.scalar_one_or_none()

            if representative_chunk:
                # Use pgvector's cosine_distance function
                # We'll approximate by fetching and comparing
                distance_result = await db.execute(
                    select(DocumentChunk.embedding.cosine_distance(query_embedding).label("distance"))
                    .where(DocumentChunk.id == representative_chunk.id)
                )
                distance = distance_result.scalar()
                similarity = 1.0 - float(distance)  # Convert distance to similarity

                if similarity >= similarity_threshold:
                    doc = info["document"]
                    similar_docs.append({
                        "document_id": doc.id,
                        "doc_number": doc.doc_number,
                        "title": doc.title,
                        "status": doc.status,
                        "similarity_score": round(similarity, 4),
                        "category_id": doc.category_id,
                        "author_id": doc.author_id,
                    })

        return similar_docs

    except Exception as e:
        logger.error(f"Similar document search failed: {e}")
        return []


async def check_semantic_duplicate(
    db: AsyncSession,
    file_content: str,
    similarity_threshold: float = 0.95
) -> Optional[dict]:
    """
    Check if a document is semantically similar to existing documents.

    Args:
        db: Database session
        file_content: The text content to check
        similarity_threshold: Minimum similarity to consider as duplicate

    Returns:
        Dictionary with duplicate info if found, None otherwise
    """
    # Generate embedding for the content
    chunks = [file_content[:5000]] if len(file_content) > 5000 else [file_content] if file_content else []
    if not chunks:
        return None

    embeddings = await generate_embeddings(chunks)
    if not embeddings:
        return None

    query_embedding = embeddings[0]

    # Find similar documents
    similar_docs = await find_similar_documents(
        db,
        query_embedding,
        top_k=1,
        similarity_threshold=similarity_threshold
    )

    if similar_docs and similar_docs[0]["similarity_score"] >= similarity_threshold:
        return similar_docs[0]

    return None
