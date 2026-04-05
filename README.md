# 文件管理系統 (DMS) — 高效能 AI 驅動架構

這是一個基於 **FastAPI**、**SQLAlchemy (非同步)** 與 **PostgreSQL** 建立的現代化文件管理系統。本系統整合了 **pgvector** 進行語義向量搜尋，並使用 **Gemini** 與 **Gemma 3** 模型提供智慧化的文件元數據提取與關聯分析。

---

## 🚀 核心優化特性

為了應對巨量資料並符合嚴格的稽核規範，系統實作了以下六大核心優化：

1.  **HNSW 向量索引**：針對 `pgvector` 的 `embedding` 欄位加入 HNSW (Hierarchical Navigable Small World) 索引，大幅提升高維向量 (3072 維) 的近似最近鄰搜尋速度。
2.  **JSONB + GIN 索引**：將所有 JSON 欄位（關鍵字、AI 元數據、稽核紀錄）轉換為 `JSONB` 格式，並搭配 GIN 索引，實現極速的結構化資料檢索。
3.  **全文檢索 (FTS)**：內建 PostgreSQL 全文檢索功能，透過計算型 `tsvector` 欄位取代傳統 `ILIKE` 模糊搜尋，提供更高精確度且不犧牲效能。
4.  **軟刪除 (Soft Delete)**：所有文件刪除操作均為軟刪除，保留 `deleted_at` 時間戳記與完整的稽核日誌，確保資料追蹤與合規性。
5.  **游標分頁 (Cursor Pagination)**：透過 Base64 編碼的 UUID 游標取代傳統的 `Offset-Limit` 分頁，在大數據量下查詢效能保持穩定，避免效能隨頁數增加而衰減。
6.  **大文本延遲載入 (Deferred Loading)**：文件清單查詢時自動延遲載入 (Defer) 龐大的 `extracted_text` 與分析結果，顯著降低 I/O 負載與記憶體消耗。

---

## 🛠️ 技術棧

*   **後端 (Backend)**: FastAPI, SQLAlchemy 2.0 (Async), Pydantic v2
*   **資料庫 (Database)**: PostgreSQL 16 + pgvector 擴充功能
*   **前端 (Frontend)**: React, Vite, TailwindCSS (快速回應、現代化設計)
*   **AI 整合**: Gemini API (Embedding/Metadata), Gemma 3 (關係分析)
*   **基礎設施**: Docker Compose, Dockerfile (容器化部署)

---

## 📂 專案結構

```text
.
├── backend                 # FastAPI 後端服務
│   ├── app
│   │   ├── models.py       # SQL 模組定義 (包含 FTS, HNSW, JSONB)
│   │   ├── services/       # 業務邏輯 (文件處理、AI 串接)
│   │   ├── routers/        # API 路由 (分頁、搜尋、CRUD)
│   │   └── schemas.py      # Pydantic 資料模型
│   └── init.sql            # 資料庫初始化與擴充功能設定
├── frontend                # React 前端應用 (Vite)
├── docker-compose.yml      # 全系統容器化配置
└── README.md               # 本文件
```

---

## ⚡ 快速開始

### 1. 環境變數設定

在 `backend/.env` 中設定所需的 API 金鑰與資料庫連線資訊：

```env
DATABASE_URL=postgresql+asyncpg://dms_user:dms_password_2026@db:5432/dms
GOOGLE_API_KEY=your_gemini_api_key_here
```

### 2. 使用 Docker 一鍵啟動

```bash
docker-compose up --build
```
這將會啟動：
*   **PostgreSQL (Port 5432)**：預先安裝 pgvector 的資料庫。
*   **Backend (Port 8000)**：提供 Swagger UI (`/docs`)。
*   **Frontend (Port 5173)**：即可從瀏覽器存取系統。

---

## 🔄 資料庫遷移說明

若你是在現有資料庫上更新，請執行 `backend/init.sql` 中註解部分的遷移語句，以啟用所有效能優化欄位與索引：

*   **轉換 JSON 到 JSONB**: 加速元數據查詢。
*   **建立 tsvector 欄位**: 啟用全文檢索。
*   **建立 HNSW 索引**: 優化向量搜尋。

---

## 📝 稽核與合規

系統自動記錄所有文件的 `CREATE`, `UPDATE`, `UPLOAD`, `DOWNLOAD`, `DELETE` 等行為。
*   **刪除行為**：實體檔案與資料庫紀錄皆妥善保存，僅標記 `deleted_at` 並自清單隱藏。
*   **變更歷史**：透過 `audit_logs` 紀錄操作者、詳細內容與時間。

---

## 📜 授權

本專案採用內部私有授權，僅供指定團隊使用。
