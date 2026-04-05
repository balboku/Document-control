# 文件管理系統 (DMS) — 高效能 AI 驅議、ISO 13485 合規架構

這是一個基於 **FastAPI**、**SQLAlchemy (非同步)** 與 **Postgres (pgvector)** 建立的醫療器材品質管理系統 (QMS/DHF)。系統整合了 **Gemini 2.0** 與 **Gemma 3** 模型，提供業界領先的文件自動化處理與法規合規性分析。

---

## 🚀 核心優化特性

為了符合 ISO 13485 醫療器材品質管理標準，並優化巨量資料的處理速度，系統實作了以下核心優化：

1.  **AI 法規合規分析 (NEW)**：透過語義搜尋技術，自動將專案文件與 ISO 13485 條款進行關聯，識別合規差距 (Gap Analysis) 並提供專業的 AI 改進建議。
2.  **高效率向量搜尋 (HNSW)**：針對 3072 維的向量資料加入 HNSW 索引，確保在海量文件中進行語義比對時，延遲保持在毫秒級別。
3.  **Schema 穩定性設計 (NEW)**：採用繼承式 Pydantic 模型 (DocumentResponse vs DocumentWithMdfResponse)，優化 API 序列化過程，防止非同步環境下的延遲加載 (Lazy Loading) 錯誤。
4.  **JSONB + GIN 索引**：核心元數據（關鍵字、AI 分析結論、稽核日誌）均存儲於 `JSONB` 格式，支持極速的高級結構化檢索。
5.  **軟刪除與完整稽核軌跡**：符合醫療器材產業規範，所有文件刪除皆為標記式軟刪除，完整保留變更歷史與 `deleted_at` 稽核點。
6.  **游標分頁與大文本延遲載入**：在大數據量場景下提供穩定的查詢性能，避免記憶體與 I/O 的過度消耗。

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
