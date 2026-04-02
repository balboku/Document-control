"""Embedding service for semantic search using Gemini Embedding 2."""
import asyncio
import logging
from typing import List, Optional
from google import genai
from app.config import get_settings

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


async def generate_embeddings(texts: List[str]) -> Optional[List[List[float]]]:
    """
    Generate embeddings for a list of text chunks using Gemini Embedding 2.
    Batches texts to stay within rate limits.
    
    Args:
        texts: List of text strings to embed
    
    Returns:
        List of embedding vectors, or None on failure
    """
    if not texts:
        return []
    
    async with _semaphore:
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
            
            return all_embeddings
            
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
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
