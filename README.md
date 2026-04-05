# 文件管理系統 (DMS) — 高效能 AI 驅議、ISO 13485 合規架構

這是一個基於 **FastAPI**、**SQLAlchemy (非同步)** 與 **Postgres (pgvector)** 建立的醫療器材品質管理系統 (QMS/DHF)。系統整合了 **Gemini 2.0** 與 **Gemma 3** 模型，提供業界領先的文件自動化處理與法規合規性分析。

---

## 🚀 核心優化特性 (V2.0)

為了符合 ISO 13485 醫療器材品質管理標準，並優化巨量資料的處理速度，系統實作了以下核心優化：

1.  **高效率向量搜尋 (HNSW + halfvec)**：針對 3072 維的 Gemini 向量，採用 `pgvector 0.7+` 的半精度轉型技術 (`halfvec`) 突破維度限制，並透過 HNSW 索引確保在海量文件中進行語義比對時，延遲保持在毫秒級別。
2.  **RRF 混合搜尋 (Hybrid Search) 與智慧分頁**：結合 PostgreSQL `tsvector`（全文檢索）與 `pgvector`（語義搜尋），並使用 **Reciprocal Rank Fusion (RRF)** 演算法自動融合排名。後端實作高效能 Python 端切片分頁 (Skip/Limit)，前端提供視覺化 Pagination 與關鍵字自動高亮 (Highlighting) 體驗。
3.  **非同步 AI 處理 (Background Tasks)**：將極度耗時的 Gemini API 請求（OCR 解析、Metadata 擷取、Embedding 向量化）全部從 HTTP 請求週期中抽離，改由 FastAPI `BackgroundTasks` 在背景非同步執行。搭配前端完整的「Pending / Completed / Failed」狀態追蹤與一鍵重試 (Retry) 機制，極大化提升系統吞吐量與穩定性。
4.  **一站式智慧拖曳上傳 (Smart Drag & Drop)**：重構繁雜的上傳流程，全新設計直覺的拖曳上傳區塊。使用者拖入檔案後，系統能在背景快速串流解析文件內容，並利用 AI 自動預填表單標題、分類與標籤 (Tag)，大幅減少人為輸入時間。
5.  **分類綁定文件編號 (Category-bound Numbering)**：支援針對不同文件分類（如 SOP、Record）設定獨立的編碼規則（Prefix、年份格式、位數），並內建全域預設 (Global Default) 機制與年度流水號自動歸零邏輯。
6.  **全域操作者狀態管理 (User Context)**：實作基於 React Context API 的操作者模擬機制，支援在管理介面一鍵切換當前執行身分，並透過 `localStorage` 實現狀態持久化，確保稽核路徑的準確性。
7.  **樂觀鎖 (Optimistic Locking)**：為檔案模型新增 `row_version` 控制機制，防止非同步與多人協作時的寫入衝突 (StaleDataError)，確保設計變更 (Change Control) 的資料完整性。
8.  **JSONB 效能與稽核優化**：稽核日誌 (Audit Log) 已升級為 `JSONB` 並建立 Partial Index，支持對 `details` 中特定版本號、檔名的極速檢索。
9. **版本唯一性限制 (UQ)**：實作強制性的 `(document_id, version_number)` 唯一性約束，從資料庫底層杜絕重複版本號產生的品質風險。
10. **軟刪除與完整稽核軌跡**：符合醫療器材產業規範，所有文件刪除皆為標記式軟刪除，完整保留變更歷史與 `deleted_at` 稽核點。

---

## 🛠️ 技術棧

*   **後端 (Backend)**: FastAPI, SQLAlchemy 2.0 (Async), Pydantic v2
*   **資料庫 (Database)**: PostgreSQL 16 + pgvector (向量支援)
*   **前端 (Frontend)**: React 18, Vite, TailwindCSS (高品質 UI/UX 設計)
*   **AI 引擎**: Gemini 2.0 (Embedding/Metadata), Gemma 3 (法規邏輯推論)
*   **容器化**: Docker-compose (一鍵部署所有組件)

---

## 📂 專案結構

```text
.
├── backend                 # FastAPI 後端服務
│   ├── app
│   │   ├── models.py       # 模型定義 (FTS, HNSW, JSONB)
│   │   ├── services/       # 核心服務 (法規分析、文件處理、AI 邏輯)
│   │   ├── routers/        # API 端點 (合規檢查、搜索、DHF 管理)
│   │   └── schemas.py      # 資料驗證模型 (安定性優化)
│   ├── scripts/            # 工具指令 (初始化法規庫、數據遷移)
│   └── uploads/            # 實體檔案存儲區
├── frontend                # React 前端應用 (Vite + Tailwind)
├── docker-compose.yml      # 全系統容器化配置
└── README.md               # 本文件
```

---

## ⚡ 快速開始

### 1. 環境配置

於 `backend/.env` 中設定您的 Google AI API Key：

```env
DATABASE_URL=postgresql+asyncpg://dms_user:dms_password_2026@db:5432/dms
GOOGLE_API_KEY=您的_GEMINI_API_KEY
```

### 2. 啟動系統

```bash
docker-compose up --build
```

### 3. 初始化數據 (首次運行)

為了使用合規分析功能，請進入 backend 容器並執行法規庫種植腳本：

```bash
docker exec -it dms-backend python -m app.scripts.seed_compliance
```

---

## 🗄️ 資料庫遷移 (Alembic)

我們的專案使用了 `Alembic` 作為資料庫遷移與版本控管工具。請確保所有的 Schema 變更都透過更改 `app.models.py` 後，使用自動產生遷移檔來執行。

### 1. 產生新的遷移檔

當修改了 `models.py` 後，在 `backend/` 下執行：

```bash
alembic revision --autogenerate -m "您的變更說明"
```

這會在 `alembic/versions/` 產生指令搞。建議打開此檔案做人工確認。

### 2. 套用變更，升級資料庫

```bash
alembic upgrade head
```

### 3. 退回上一個版本 (Rollback)

```bash
alembic downgrade -1
```

---

## 🔐 安全與合規性

*   **ISO 13485 支援**：內建設計開發歷史檔案 (DHF) 與產品主文檔 (MDF) 的管理邏輯，並支援分類化的品質文件編號體系。
*   **資料完整性與稽核**：透過強大的稽核日誌紀錄 (Audit Logs)，追蹤從上傳、修改到狀態變更的每一個細節。配合全域操作者狀態管理，可精確記錄每次變更的執行人員。
*   **權限與身分識別**：支援 Admin/Editor/Viewer 角色的權限劃分，並提供模擬操作者切換機制以利於流程測試與身分指派。

---

## 📜 授權

本專案採用內部研發授權，禁止未經許可的轉載與商業應用。
