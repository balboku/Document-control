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


async def extract_metadata(document_text: str, filename: str = None, categories: List[str] = None) -> Optional[dict]:
    """
    Use Gemma 3 27B to extract metadata from document text.
    
    Args:
        document_text: The extracted text from the document
        filename: The original filename (hint for AI)
        categories: List of available category names
    
    Returns:
        Dictionary with extracted metadata or None on failure
    """
    if not document_text or not document_text.strip():
        # Even if text is empty, if we have a filename, we can try to guess
        if not filename:
            return None
        document_text = "[無文字內容]"
    
    # Truncate text if too long (keep within token limits ~15000 TPM)
    max_chars = 10000
    truncated_text = document_text[:max_chars] if len(document_text) > max_chars else document_text
    
    categories_str = ", ".join(categories) if categories else "（未設定類別）"
    
    prompt = f"""你是一個專業的文件分析助手。請仔細閱讀以下文件內容與檔名，從中提取以下欄位資訊。
若某欄位在文件中找不到，請填入 null。

特別注意：
1. 「原始檔名」通常包含關鍵資訊（如文件編號、版本號 Vxx），請將其視為高優先權的參考來源。
2. 版本號請統一格式如: v1.0, v2.1, V03 等。
3. 如果文件內容為空，請純粹根據檔名來預估標題、編號與版本。

原始檔名：{filename or "未知"}
可用的文件類別清單：{categories_str}

請以嚴格的 JSON 格式回傳，不要包含任何其他文字、markdown標記或程式碼區塊：

{{
  "title": "文件名稱/標題 (若檔名更完整則優先採用檔名)",
  "version": "版本號 (如 v1.0, v2.1, V03)",
  "doc_number": "文件編號 (如果文件或檔名中有標注, 如 QC-P2404-01)",
  "date": "文件日期 (YYYY-MM-DD 格式)",
  "author": "製定人/作者",
  "category": "從類別清單中選擇最適合的一個，若清單為空則自行判斷",
  "summary": "100字以內的文件摘要"
}}

---
文件內容（前 {len(truncated_text)} 字）：
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

async def analyze_relations_with_ai(target_doc: dict, related_docs: List[dict]) -> str:
    """
    Use Gemma 3 27B to analyze the business relationship between a target document and related documents.
    """
    if not target_doc or not related_docs:
        return "無法進行關聯分析：目標文件或關聯文件為空。"
    
    docs_info = []
    for i, doc in enumerate(related_docs, 1):
        info = f"關聯文件 {i}:\n文件編號: {doc.get('doc_number', '未知')}\n文件名稱: {doc.get('title', '未知')}\n內容片段/摘要: {doc.get('chunk_content', '未知')}\n"
        docs_info.append(info)
        
    related_docs_str = "\n".join(docs_info)
    
    prompt = f"""你是一個專業的企業文件與知識管理專家。請分析「目標文件」與多筆「關聯文件」之間的業務邏輯關聯性。

目標文件：
文件編號: {target_doc.get("doc_number", "未知")}
文件名稱: {target_doc.get("title", "未知")}

以下是透過向量搜尋找出的關聯文件：
{related_docs_str}

請以專業、精煉的繁體中文，綜合總結這份「目標文件」與上述「關聯文件」在業務邏輯上高度相關的原因。
例如它們是否屬於同一個業務流程的上下游、是否為彼此的參考規範、是否有版本繼承或補充說明的關係？
請直接給出分析結論，字數控制在 300 字以內，不要使用 Markdown 標題，請使用一般段落與條列式說明。"""

    async with _semaphore:
        try:
            client = get_client()
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=settings.gemma_model,
                contents=prompt,
            )
            
            if not response or not response.text:
                return "AI 暫無回應，請稍後再試。"
            
            return response.text.strip()
            
        except Exception as e:
            logger.error(f"AI relation analysis failed: {e}")
            return f"AI 關聯分析失敗：{str(e)}"
