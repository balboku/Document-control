"""AI service for metadata extraction using Gemma 3 27B via Google AI API."""
import json
import asyncio
import logging
from typing import Optional, List
from google import genai
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Rate limiting semaphore (max 25 concurrent requests to be safe with 30 RPM)
_semaphore = asyncio.Semaphore(5)

# Initialize the client
_client = None


def get_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.google_api_key)
    return _client


async def extract_metadata(document_text: str, categories: List[str] = None) -> Optional[dict]:
    """
    Use Gemma 3 27B to extract metadata from document text.
    
    Args:
        document_text: The extracted text from the document
        categories: List of available category names
    
    Returns:
        Dictionary with extracted metadata or None on failure
    """
    if not document_text or not document_text.strip():
        return None
    
    # Truncate text if too long (keep within token limits ~15000 TPM)
    max_chars = 10000
    truncated_text = document_text[:max_chars] if len(document_text) > max_chars else document_text
    
    categories_str = ", ".join(categories) if categories else "（未設定類別）"
    
    prompt = f"""你是一個專業的文件分析助手。請仔細閱讀以下文件內容，從中提取以下欄位資訊。
若某欄位在文件中找不到，請填入 null。

可用的文件類別清單：{categories_str}

請以嚴格的 JSON 格式回傳，不要包含任何其他文字、markdown標記或程式碼區塊：

{{
  "title": "文件名稱/標題",
  "version": "版本號 (如 v1.0, v2.1)",
  "doc_number": "文件編號 (如果文件中有標注)",
  "date": "文件日期 (YYYY-MM-DD 格式)",
  "author": "製定人/作者",
  "category": "從類別清單中選擇最適合的一個，若清單為空則自行判斷",
  "summary": "100字以內的文件摘要"
}}

---
文件內容：
{truncated_text}"""

    async with _semaphore:
        try:
            client = get_client()
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=settings.gemma_model,
                contents=prompt,
            )
            
            if not response or not response.text:
                logger.warning("Empty response from Gemma 3 27B")
                return None
            
            # Parse JSON from response
            text = response.text.strip()
            
            # Remove markdown code block markers if present
            if text.startswith("```json"):
                text = text[7:]
            elif text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
            
            metadata = json.loads(text)
            return metadata
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {e}")
            logger.error(f"Raw response: {response.text if response else 'None'}")
            return None
        except Exception as e:
            logger.error(f"AI metadata extraction failed: {e}")
            return None
