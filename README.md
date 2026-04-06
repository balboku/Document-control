# 文件管理系統 (DMS) — 高效能 AI 驅議、ISO 13485 合規架構

這是一個基於 **FastAPI**、**SQLAlchemy (非同步)** 與 **Postgres (pgvector)** 建立的醫療器材品質管理系統 (QMS/DHF)。系統整合了 **Gemini 2.0** 與 **Gemma 3** 模型，提供業界領先的文件自動化處理與法規合規性分析。

---

## 🚀 核心優化特性 (V2.0)

為了符合 ISO 13485 醫療器材品質管理標準，並優化巨量資料的處理速度，系統實作了以下核心優化：

1.  **高效率向量搜尋 (HNSW + halfvec)**：針對 3072 維的 Gemini 向量，採用 `pgvector 0.7+` 的半精度轉型技術 (`halfvec`) 突破維度限制，並透過 HNSW 索引確保在海量文件中進行語義比對時，延遲保持在毫秒級別。
2.  **RRF 混合搜尋 (Hybrid Search) 與智慧分頁**：結合 PostgreSQL `tsvector`（全文檢索）與 `pgvector`（語義搜尋），並使用 **Reciprocal Rank Fusion (RRF)** 演算法自動融合排名。後端實作高效能 Python 端切片分頁 (Skip/Limit)，前端提供視覺化 Pagination 與關鍵字自動高亮 (Highlighting) 體驗。
3.  **基礎設施防護圈 (PgBouncer)**：在核心資料庫前加入 **PgBouncer (6432 埠)** 連線池管理器，採用交易池 (`transaction`) 模式，支援 FastAPI 高併發下的上千個並行連線，同時將資料庫負載維持在低穩定連線數。
4.  **巨量資料按月分區 (Table Partitioning)**：考量醫療法規要求長期留存稽核日誌，`AuditLog` 已實作按月分區 (`Range Partitioning`)。此架構確保了即使日誌增長至百萬級別，查詢效能依然穩定，且舊資料「瞬間刪除」不鎖表。
5.  **ORM 自動化軟刪除過濾**：透過 SQLAlchemy 2.0 的 `primaryjoin` 與 `back_populates` 進階應用，系統在進行物件關聯載入（如 `document.versions`）時會自動排除 `deleted_at` 不為空的資料。這在開發層級杜絕了對已刪除資料的誤讀風險，保證資料純淨。
6.  **原生 UUID 產生策略進化**：所有 UUID 產生權重已由應用服務端移交至 PostgreSQL 資料庫層級，使用 `server_default=text("gen_random_uuid()")`。此舉在高併發写入情境下顯著降低了 Python 端 CPU 運算成本與 I/O 溝通。
7.  **外鍵與效能索引全面補齊**：對 `Document` 及其關連表的所有 Foreign Key 欄位均補足了實體索引。搭配 `joinedload` 策略，多重 JOIN 的查詢成本從 $O(N)$ 降至 $O(\log N)$。
8.  **樂觀鎖 (Optimistic Locking)**：為檔案模型新增 `row_version` 控制機制，防止非同步與多人協作時的寫入衝突 (StaleDataError)，確保設計變更 (Change Control) 的資料完整性。
9.  **版本唯一性限制 (UQ)**：實作強制性的 `(document_id, version_number)` 唯一性約束，從資料庫底層杜絕重複版本號產生的品質風險。
10. **軟刪除與完整稽核軌跡**：符合醫療器材產業規範，所有文件刪除皆為標記式軟刪除，完整保留變更歷史與 `deleted_at` 稽核點。

---

## 🛠️ 技術棧

*   **後端 (Backend)**: FastAPI, SQLAlchemy 2.0 (Async), Pydantic v2
*   **資料庫 (Database)**: PostgreSQL 16 + pgvector (向量支援) + **PgBouncer (連線池管理)**
*   **前端 (Frontend)**: React 18, Vite, TailwindCSS (高品質 UI/UX 設計)
*   **AI 引擎**: Gemini 2.0 (Embedding/Metadata), Gemma 3 (法規邏輯推論)
*   **容器化**: Docker-compose (一鍵部署所有組件，包含交易級池化)

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
DATABASE_URL=postgresql+asyncpg://dms_user:dms_password_2026@pgbouncer:6432/dms
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

## 📅 分區表維護 (Partitioning Maintenance)

系統中的 `AuditLog` 採用按月分區。當進入新的月份時，需要執行對應的 SQL 以建立新的實體分區表（本系統遷移檔已預置 2026/04 與 05 範例）：

```sql
-- 建立新月份分區示例
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs 
FOR VALUES FROM ('2026-06-01 00:00:00') TO ('2026-07-01 00:00:00');
```

---

## 🔐 安全與合規性

*   **ISO 13485 支援**：內建設計開發歷史檔案 (DHF) 與產品主文檔 (MDF) 的管理邏輯，並支援分類化的品質文件編號體系。
*   **資料完整性與稽核**：透過強大的稽核日誌紀錄 (Audit Logs)，追蹤從上傳、修改到狀態變更的每一個細節。配合全域操作者狀態管理，可精確記錄每次變更的執行人員。
*   **權限與身分識別**：支援 Admin/Editor/Viewer 角色的權限劃分，並提供模擬操作者切換機制以利於流程測試與身分指派。

---

## 📜 授權

本專案採用內部研發授權，禁止未經許可的轉載與商業應用。
