#!/usr/bin/env python3
"""Migration runner — executes all DB optimization steps via psycopg2."""
import sys
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT, ISOLATION_LEVEL_DEFAULT

DSN = "host=localhost port=5432 dbname=dms user=dms_user password=dms_password_2026"

def ok(msg):   print(f"  [ OK ] {msg}")
def skip(msg): print(f"  [SKIP] {msg}")
def err(msg):  print(f"  [ERR ] {msg}")
def info(msg): print(f"  [INFO] {msg}")


def ddl(conn, label, sql):
    """Run DDL inside a transaction, auto-skip on duplicate object/column."""
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        ok(label)
    except (psycopg2.errors.DuplicateObject,
            psycopg2.errors.DuplicateColumn,
            psycopg2.errors.DuplicateTable) as e:
        conn.rollback()
        skip(f"{label} — already exists")
    except Exception as e:
        conn.rollback()
        err(f"{label}: {e}")


def concurrent(conn, label, sql):
    """Run CREATE INDEX CONCURRENTLY (must be outside transaction)."""
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        ok(label)
    except psycopg2.errors.DuplicateObject:
        skip(f"{label} — already exists")
    except Exception as e:
        err(f"{label}: {e}")
    finally:
        conn.set_isolation_level(ISOLATION_LEVEL_DEFAULT)


def autocommit_exec(conn, label, sql):
    """Run a single statement in autocommit mode."""
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        ok(label)
    except Exception as e:
        err(f"{label}: {e}")
    finally:
        conn.set_isolation_level(ISOLATION_LEVEL_DEFAULT)


def check(conn, label, sql):
    """Return True if query returns at least one row."""
    with conn.cursor() as cur:
        cur.execute(sql)
        exists = cur.fetchone() is not None
    conn.commit()
    return exists


# ──────────────────────────────────────────
def main():
    print("\n" + "="*58)
    print("  QMS Database Migration v2.0")
    print("="*58)

    try:
        conn = psycopg2.connect(DSN)
        conn.autocommit = False
        ok("Connected to dms @ localhost:5432\n")
    except Exception as e:
        err(f"Cannot connect: {e}")
        sys.exit(1)

    # ── Step 0: Pre-flight ───────────────────────────
    print("Step 0: Pre-flight (duplicate version check)")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM (
                SELECT document_id, version_number
                FROM document_versions
                GROUP BY document_id, version_number
                HAVING COUNT(*) > 1
            ) dups
        """)
        dup_count = cur.fetchone()[0]
    conn.commit()
    add_unique = (dup_count == 0)
    if add_unique:
        ok("No duplicate version numbers — UniqueConstraint safe to add")
    else:
        err(f"{dup_count} duplicate (document_id, version_number) pairs found")
        skip("UniqueConstraint will be skipped")

    # ── Step 1: Optimistic Lock ──────────────────────
    print("\nStep 1: Optimistic Lock — documents.row_version")
    ddl(conn, "ADD COLUMN row_version",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1")

    # ── Step 2: Audit Retention Column ──────────────
    print("\nStep 2: Audit Log — retention_expires_at column")
    ddl(conn, "ADD COLUMN retention_expires_at",
        "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ NULL")

    # ── Step 3: UniqueConstraint ─────────────────────
    print("\nStep 3: DocumentVersion UniqueConstraint")
    if add_unique:
        ddl(conn, "ADD CONSTRAINT uq_doc_version_number",
            """ALTER TABLE document_versions
               ADD CONSTRAINT uq_doc_version_number
               UNIQUE (document_id, version_number)""")
    else:
        skip("Skipped due to duplicate data")

    # ── Step 4: HNSW Index ───────────────────────────
    print("\nStep 4: HNSW vector index (m=24, ef_construction=200)")
    info("This may take a moment for large tables...")
    autocommit_exec(conn, "SET maintenance_work_mem = 1GB",
                    "SET maintenance_work_mem = '1GB'")
    concurrent(conn, "CREATE INDEX idx_chunks_embedding_hnsw",
        """CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_embedding_hnsw
           ON document_chunks
           USING hnsw (embedding vector_cosine_ops)
           WITH (m = 24, ef_construction = 200)""")

    # ── Step 5: Partial Indexes ──────────────────────
    print("\nStep 5: Partial indexes on audit_logs")
    concurrent(conn, "CREATE INDEX idx_audit_retention_expires",
        """CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_retention_expires
           ON audit_logs (retention_expires_at)
           WHERE retention_expires_at IS NOT NULL""")
    concurrent(conn, "CREATE INDEX idx_audit_details_version",
        """CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_details_version
           ON audit_logs ((details->>'version'))
           WHERE details ? 'version'""")
    concurrent(conn, "CREATE INDEX idx_audit_details_file_name",
        """CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_details_file_name
           ON audit_logs ((details->>'file_name'))
           WHERE details ? 'file_name'""")

    # ── Step 6: purge_expired_audit_logs() function ──
    print("\nStep 6: Install purge_expired_audit_logs() function")
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    with conn.cursor() as cur:
        try:
            cur.execute(r"""
                CREATE OR REPLACE FUNCTION purge_expired_audit_logs(
                    p_dry_run BOOLEAN DEFAULT TRUE
                )
                RETURNS TABLE (
                    status         TEXT,
                    eligible_count BIGINT,
                    purged_count   BIGINT,
                    message        TEXT
                )
                LANGUAGE plpgsql SECURITY DEFINER
                AS $func$
                DECLARE
                    v_eligible BIGINT;
                    v_purged   BIGINT := 0;
                BEGIN
                    SELECT COUNT(*) INTO v_eligible
                    FROM audit_logs
                    WHERE retention_expires_at IS NOT NULL
                      AND retention_expires_at < NOW();

                    IF p_dry_run THEN
                        RETURN QUERY SELECT 'dry_run'::TEXT, v_eligible, 0::BIGINT,
                            FORMAT('Dry run: %s logs would be purged.', v_eligible);
                        RETURN;
                    END IF;

                    IF v_eligible = 0 THEN
                        RETURN QUERY SELECT 'success'::TEXT, 0::BIGINT, 0::BIGINT,
                            'No expired audit logs to purge.'::TEXT;
                        RETURN;
                    END IF;

                    WITH deleted AS (
                        DELETE FROM audit_logs
                        WHERE retention_expires_at IS NOT NULL
                          AND retention_expires_at < NOW()
                        RETURNING id
                    )
                    SELECT COUNT(*) INTO v_purged FROM deleted;

                    RETURN QUERY SELECT 'success'::TEXT, v_eligible, v_purged,
                        FORMAT('Purged %s expired audit logs.', v_purged);
                END;
                $func$
            """)
            ok("purge_expired_audit_logs() installed")
        except Exception as e:
            err(f"Function install: {e}")
    conn.set_isolation_level(ISOLATION_LEVEL_DEFAULT)

    # ── Step 7: ANALYZE ──────────────────────────────
    print("\nStep 7: ANALYZE affected tables")
    for tbl in ["documents", "document_versions", "document_chunks", "audit_logs"]:
        autocommit_exec(conn, f"ANALYZE {tbl}", f"ANALYZE {tbl}")

    # ── Step 8: Verification ─────────────────────────
    print("\nStep 8: Verification")
    results = {
        "HNSW index (idx_chunks_embedding_hnsw)":
            "SELECT 1 FROM pg_indexes WHERE tablename='document_chunks' AND indexname='idx_chunks_embedding_hnsw'",
        "UniqueConstraint (uq_doc_version_number)":
            "SELECT 1 FROM pg_constraint WHERE conname='uq_doc_version_number'",
        "Optimistic lock col (documents.row_version)":
            "SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='row_version'",
        "Retention col (audit_logs.retention_expires_at)":
            "SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='retention_expires_at'",
        "Retention partial index":
            "SELECT 1 FROM pg_indexes WHERE indexname='idx_audit_retention_expires'",
        "JSONB path index (details->>version)":
            "SELECT 1 FROM pg_indexes WHERE indexname='idx_audit_details_version'",
        "purge_expired_audit_logs() function":
            "SELECT 1 FROM pg_proc WHERE proname='purge_expired_audit_logs'",
    }
    all_passed = True
    for label, sql in results.items():
        found = check(conn, label, sql)
        if found:
            ok(label)
        else:
            err(f"MISSING: {label}")
            all_passed = False

    print("\n" + "="*58)
    if all_passed:
        print("  All steps completed successfully!")
    else:
        print("  Completed with missing items — check errors above.")
    print("="*58 + "\n")

    conn.close()
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
