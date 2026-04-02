"""Text chunking utility for document embedding."""
from typing import List


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> List[str]:
    """
    Split text into overlapping chunks for embedding.
    
    Args:
        text: The text to split
        chunk_size: Target size of each chunk in characters
        overlap: Number of overlapping characters between chunks
    
    Returns:
        List of text chunks
    """
    if not text or not text.strip():
        return []
    
    text = text.strip()
    
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    
    while start < len(text):
        end = start + chunk_size
        
        if end >= len(text):
            chunks.append(text[start:])
            break
        
        # Try to break at a natural boundary (sentence end, paragraph)
        # Look for the last period, newline, or other delimiter within range
        break_point = end
        for delimiter in ['\n\n', '\n', '。', '. ', '！', '？', '! ', '? ', '；', '; ']:
            idx = text.rfind(delimiter, start + chunk_size // 2, end)
            if idx != -1:
                break_point = idx + len(delimiter)
                break
        
        chunks.append(text[start:break_point])
        start = break_point - overlap
    
    return chunks
