-- ============================================================
-- QMS 文件管理系統 — 資料庫效能與結構優化遷移腳本
-- 版本：v2.0.0
-- 適用資料庫：PostgreSQL 14+ with pgvector >= 0.5.0
-- 執行方式：psql -U <user> -d <database> -f migration.sql
-- 注意：所有 DDL 操作均使用 IF NOT EXISTS / IF EXISTS 保證冪等性
-- ============================================================

BEGIN;

-- ============================================================
-- 前置檢查：確認 pgvector 版本 >= 0.5.0（HNSW 索引需求）
-- ============================================================
DO $$
DECLARE
    v_version TEXT;
    v_major   INT;
    v_minor   INT;
BEGIN
    SELECT extversion INTO v_version
    FROM pg_extension
    WHERE extname = 'vector';

    IF v_version IS NULL THEN
        RAISE EXCEPTION '[ABORT] pgvector extension not installed. Run: CREATE EXTENSION vector;';
    END IF;

    v_major := SPLIT_PART(v_version, '.', 1)::INT;
    v_minor := SPLIT_PART(v_version, '.', 2)::INT;

    IF v_major < 1 AND v_minor < 5 THEN
        RAISE EXCEPTION '[ABORT] pgvector >= 0.5.0 required for HNSW index. Current: %', v_version;
    END IF;

    RAISE NOTICE '[OK] pgvector version: %', v_version;
END $$;


-- ============================================================
-- Step 0：前置資料完整性確認
-- 在加入 UniqueConstraint 前，必須確保無重複版本號資料
-- ============================================================
DO $$
DECLARE
    dup_count INT;
BEGIN
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT document_id, version_number
        FROM document_versions
        GROUP BY document_id, version_number
        HAVING COUNT(*) > 1
    ) dups;

    IF dup_count > 0 THEN
        RAISE WARNING '[WARNING] Found % duplicate (document_id, version_number) pairs in document_versions.', dup_count;
        RAISE WARNING 'Run the following to inspect: SELECT document_id, version_number, COUNT(*) FROM document_versions GROUP BY 1,2 HAVING COUNT(*) > 1;';
        RAISE WARNING 'The UniqueConstraint migration (Step 3) will be SKIPPED to prevent failure.';
        -- 不中止，讓後續 Step 3 的 DO $$ 自行判斷
    ELSE
        RAISE NOTICE '[OK] No duplicate version numbers found. Safe to add UniqueConstraint.';
    END IF;
END $$;


-- ============================================================
-- Step 1：Document 樂觀鎖欄位 (Optimistic Lock)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'documents' AND column_name = 'row_version'
    ) THEN
        ALTER TABLE documents
            ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;

        -- 為所有現有資料初始化版本號為 1
        UPDATE documents SET row_version = 1 WHERE row_version IS NULL;

        RAISE NOTICE '[OK] Step 1: Added row_version column to documents (Optimistic Lock).';
    ELSE
        RAISE NOTICE '[SKIP] Step 1: row_version already exists in documents.';
    END IF;
END $$;


-- ============================================================
-- Step 2：AuditLog 留存截止日欄位
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_logs' AND column_name = 'retention_expires_at'
    ) THEN
        ALTER TABLE audit_logs
            ADD COLUMN retention_expires_at TIMESTAMPTZ NULL;

        -- 為所有現有日誌設定預設 365 天留存（可依需求調整）
        -- 若需永久保留歷史日誌，請改為不執行此 UPDATE
        -- UPDATE audit_logs
        --     SET retention_expires_at = created_at + INTERVAL '365 days'
        --     WHERE retention_expires_at IS NULL;

        RAISE NOTICE '[OK] Step 2: Added retention_expires_at column to audit_logs.';
        RAISE NOTICE '[INFO] Existing audit logs have NULL retention (permanent). Update manually if needed.';
    ELSE
        RAISE NOTICE '[SKIP] Step 2: retention_expires_at already exists in audit_logs.';
    END IF;
END $$;


-- ============================================================
-- Step 3：DocumentVersion UniqueConstraint（同一文件不重複版本號）
-- ============================================================
DO $$
DECLARE
    dup_count INT;
BEGIN
    -- 再次確認無重複資料才執行
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT document_id, version_number
        FROM document_versions
        GROUP BY document_id, version_number
        HAVING COUNT(*) > 1
    ) dups;

    IF dup_count > 0 THEN
        RAISE WARNING '[SKIP] Step 3: Duplicate version numbers exist (%  pairs). UniqueConstraint NOT added.', dup_count;
        RAISE WARNING 'Fix duplicates first, then re-run this migration.';
    ELSIF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_doc_version_number'
          AND conrelid = 'document_versions'::regclass
    ) THEN
        RAISE NOTICE '[SKIP] Step 3: Constraint uq_doc_version_number already exists.';
    ELSE
        ALTER TABLE document_versions
            ADD CONSTRAINT uq_doc_version_number
            UNIQUE (document_id, version_number);

        RAISE NOTICE '[OK] Step 3: Added UniqueConstraint uq_doc_version_number on document_versions.';
    END IF;
END $$;


-- ============================================================
-- Step 4：HNSW 向量索引
-- 針對 3072 維 Gemini Embedding 向量，使用餘弦相似度
-- 參數說明：
--   m=24            每節點最大連線數，3072 維建議 16~32（24 為平衡點）
--   ef_construction=200   建構精度，值越高索引品質越好（建構時間較長）
--
-- 重要：HNSW 建構期間記憶體用量高，建議離峰時段執行
-- 建議預先設定：SET maintenance_work_mem = '2GB';
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'document_chunks'
          AND indexname = 'idx_chunks_embedding_hnsw'
    ) THEN
        RAISE NOTICE '[INFO] Step 4: Building HNSW index (m=24, ef_construction=200). This may take a while...';
    ELSE
        RAISE NOTICE '[SKIP] Step 4: HNSW index idx_chunks_embedding_hnsw already exists.';
    END IF;
END $$;

-- 建議先設定記憶體上限（可依伺服器規格調整）
SET maintenance_work_mem = '1GB';

-- CONCURRENTLY 不鎖表，允許並行讀寫（不可在 transaction 中使用，故放在 BEGIN 外面）
-- 注意：此指令需在事務外執行
COMMIT;

-- HNSW 索引建立（必須在事務外執行 CONCURRENTLY）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_embedding_hnsw
    ON document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 24, ef_construction = 200);

-- 恢復到新事務繼續執行後續步驟
BEGIN;


-- ============================================================
-- Step 5：AuditLog 留存期索引（Partial Index）
-- 只索引有設定 retention_expires_at 的日誌（Partial Index 更節省空間）
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_retention_expires
    ON audit_logs (retention_expires_at)
    WHERE retention_expires_at IS NOT NULL;

-- 跳出事務建立 CONCURRENTLY 索引
COMMIT;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_details_version
    ON audit_logs ((details->>'version'))
    WHERE details ? 'version';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_details_file_name
    ON audit_logs ((details->>'file_name'))
    WHERE details ? 'file_name';

BEGIN;


-- ============================================================
-- Step 6：執行期向量搜尋參數設定
-- ef_search 控制 HNSW 查詢時的探索廣度（值越高精度越高，速度越慢）
-- 建議透過 PostgreSQL 設定檔或連線參數設定，此處供參考
-- ============================================================
DO $$
BEGIN
    -- 在 postgresql.conf 或 ALTER SYSTEM 中設定：
    -- hnsw.ef_search = 100  （預設 40，建議 QMS 場景設為 80~120）
    RAISE NOTICE '[INFO] Step 6: Recommended: SET hnsw.ef_search = 100 in postgresql.conf';
    RAISE NOTICE '[INFO] Or per-query: SET LOCAL hnsw.ef_search = 100;';
END $$;


-- ============================================================
-- Step 7：建立稽核日誌清理函式（PostgreSQL Function）
-- 可配合 pg_cron 或外部排程器定期執行
-- ============================================================
CREATE OR REPLACE FUNCTION purge_expired_audit_logs(
    p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
    status          TEXT,
    eligible_count  BIGINT,
    purged_count    BIGINT,
    message         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER  -- 使用函式定義者的權限，確保安全性
AS $$
DECLARE
    v_eligible BIGINT;
    v_purged   BIGINT := 0;
BEGIN
    -- 計算符合清除條件的日誌數量
    SELECT COUNT(*) INTO v_eligible
    FROM audit_logs
    WHERE retention_expires_at IS NOT NULL
      AND retention_expires_at < NOW();

    IF p_dry_run THEN
        RETURN QUERY SELECT
            'dry_run'::TEXT,
            v_eligible,
            0::BIGINT,
            FORMAT('Dry run: %s logs would be purged. Call with dry_run=FALSE to execute.', v_eligible);
        RETURN;
    END IF;

    IF v_eligible = 0 THEN
        RETURN QUERY SELECT
            'success'::TEXT,
            0::BIGINT,
            0::BIGINT,
            'No expired audit logs to purge.'::TEXT;
        RETURN;
    END IF;

    -- 執行批次刪除
    WITH deleted AS (
        DELETE FROM audit_logs
        WHERE retention_expires_at IS NOT NULL
          AND retention_expires_at < NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO v_purged FROM deleted;

    RETURN QUERY SELECT
        'success'::TEXT,
        v_eligible,
        v_purged,
        FORMAT('Successfully purged %s expired audit logs.', v_purged);
END;
$$;

-- 授予應用程式使用者執行權限（請替換 your_app_user）
-- GRANT EXECUTE ON FUNCTION purge_expired_audit_logs(BOOLEAN) TO your_app_user;

COMMENT ON FUNCTION purge_expired_audit_logs IS
    'Purge audit logs where retention_expires_at < NOW(). '
    'Use p_dry_run=TRUE (default) for safe preview. '
    'ISO 13485 compliant: only purges logs with explicit expiry date set.';


-- ============================================================
-- Step 8：建立 ANALYZE 統計更新（讓 pg_class.reltuples 準確）
-- 此操作讓 get_documents 的估算 COUNT 更加準確
-- ============================================================
ANALYZE documents;
ANALYZE document_chunks;
ANALYZE document_versions;
ANALYZE audit_logs;


-- ============================================================
-- Step 9：驗證遷移結果
-- ============================================================
DO $$
DECLARE
    v_hnsw_exists    BOOLEAN;
    v_uq_exists      BOOLEAN;
    v_rv_exists      BOOLEAN;
    v_ret_exists     BOOLEAN;
BEGIN
    -- 檢查 HNSW 索引
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'document_chunks'
          AND indexname = 'idx_chunks_embedding_hnsw'
    ) INTO v_hnsw_exists;

    -- 檢查 UniqueConstraint
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_doc_version_number'
    ) INTO v_uq_exists;

    -- 檢查樂觀鎖欄位
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'documents' AND column_name = 'row_version'
    ) INTO v_rv_exists;

    -- 檢查留存欄位
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_logs' AND column_name = 'retention_expires_at'
    ) INTO v_ret_exists;

    RAISE NOTICE '============ Migration Verification ============';
    RAISE NOTICE '[%] HNSW index on document_chunks.embedding',
        CASE WHEN v_hnsw_exists THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '[%] UniqueConstraint uq_doc_version_number',
        CASE WHEN v_uq_exists THEN 'OK' ELSE 'MISSING (may have duplicates)' END;
    RAISE NOTICE '[%] Optimistic lock column documents.row_version',
        CASE WHEN v_rv_exists THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '[%] Audit retention column audit_logs.retention_expires_at',
        CASE WHEN v_ret_exists THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '[OK] purge_expired_audit_logs() function installed';
    RAISE NOTICE '[OK] ANALYZE completed for all affected tables';
    RAISE NOTICE '================================================';

    -- 輸出使用說明
    RAISE NOTICE '';
    RAISE NOTICE 'Usage examples:';
    RAISE NOTICE '  -- Preview purge (safe):';
    RAISE NOTICE '  SELECT * FROM purge_expired_audit_logs(TRUE);';
    RAISE NOTICE '  -- Execute purge:';
    RAISE NOTICE '  SELECT * FROM purge_expired_audit_logs(FALSE);';
    RAISE NOTICE '  -- For pg_cron scheduling (if installed):';
    RAISE NOTICE '  SELECT cron.schedule(''purge-audit-logs'', ''0 2 * * *'', $$SELECT purge_expired_audit_logs(FALSE)$$);';
    RAISE NOTICE '  -- HNSW query tuning (per-session):';
    RAISE NOTICE '  SET hnsw.ef_search = 100;';
END $$;

COMMIT;

-- ============================================================
-- 完整遷移結束
-- ============================================================
