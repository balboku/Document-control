# 文件管理系統 (DMS) — 高效能 AI 驅議、ISO 13485 合規架構

這是一個基於 **FastAPI**、**SQLAlchemy (非同步)** 與 **Postgres (pgvector)** 建立的醫療器材品質管理系統 (QMS/DHF)。系統整合了 **Gemini 2.0** 與 **Gemma 3** 模型，提供業界領先的文件自動化處理與法規合規性分析。

---

## 🚀 核心優化特性 (V2.0)

為了符合 ISO 13485 醫療器材品質管理標準，並優化巨量資料的處理速度，系統實作了以下核心優化：

1.  **高效率向量搜尋 (HNSW + halfvec)**：針對 3072 維的 Gemini 向量，採用 `pgvector 0.7+` 的半精度轉型技術 (`halfvec`) 突破維度限制，並透過 HNSW 索引確保在海量文件中進行語義比對時，延遲保持在毫秒級別。
2.  **RRF 混合搜尋 (Hybrid Search)**：結合 PostgreSQL `tsvector`（全文檢索）與 `pgvector`（語義搜尋），並使用 **Reciprocal Rank Fusion (RRF)** 演算法自動融合排名，確保專有名詞（如文件編號）與語意概念都能被精確檢索。
3.  **樂觀鎖 (Optimistic Locking)**：為檔案模型新增 `row_version` 控制機制，防止非同步與多人協作時的寫入衝突 (StaleDataError)，確保設計變更 (Change Control) 的資料完整性。
4.  **智慧分頁與計數優化**：在無過濾條件時改用 `pg_class.reltuples` 估算總數，大幅降低大數據表的全表掃描 I/O 成本。
5.  **JSONB 效能與稽核優化**：稽核日誌 (Audit Log) 已升級為 `JSONB` 並建立 Partial Index，支持對 `details` 中特定版本號、檔名的極速檢索，並內建 ISO 13485 要求的過期日誌自動清理機制 (`purge_expired_audit_logs`)。
6.  **版本唯一性限制 (UQ)**：實作強制性的 `(document_id, version_number)` 唯一性約束，從資料庫底層杜絕重複版本號產生的品質風險。
7.  **軟刪除與完整稽核軌跡**：符合醫療器材產業規範，所有文件刪除皆為標記式軟刪除，完整保留變更歷史與 `deleted_at` 稽核點。

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

## 🔐 安全與合規性

*   **ISO 13485 支援**：內建設計開發歷史檔案 (DHF) 與產品主文檔 (MDF) 的管理邏輯。
*   **資料完整性**：透過強大的稽核日誌紀錄 (Audit Logs)，追蹤從上傳、修改到狀態變更的每一個細節。
*   **存取控制**：支援 Admin/Editor/Viewer 角色的權限劃分。

---

## 📜 授權

本專案採用內部研發授權，禁止未經許可的轉載與商業應用。
