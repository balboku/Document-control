"""add_table_partitioning

Revision ID: 52c593d00fa4
Revises: 3ff6a27b715d
Create Date: 2026-04-06 14:03:03.396343

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52c593d00fa4'
down_revision: Union[str, None] = '3ff6a27b715d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 關閉原先的主鍵並更名（因為 Partition 必須把 Partition Key 加入 Primary Key）
    op.execute("ALTER TABLE audit_logs RENAME TO audit_logs_old;")
    op.execute("ALTER INDEX audit_logs_pkey RENAME TO audit_logs_old_pkey;")
    
    # 建立具有 Partition 屬性的新表
    op.execute("""
        CREATE TABLE audit_logs (
            id UUID DEFAULT gen_random_uuid() NOT NULL,
            document_id UUID,
            action VARCHAR(50) NOT NULL,
            actor_id UUID,
            actor_name VARCHAR(100),
            details JSONB,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
            retention_expires_at TIMESTAMP WITH TIME ZONE,
            PRIMARY KEY (id, created_at)
        ) PARTITION BY RANGE (created_at);
    """)

    # 建立預設分區容納原本存在且不合時間區間的舊資料
    op.execute("CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;")

    # 建立 2026 年 4 月與 5 月的分區
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs_2026_04 PARTITION OF audit_logs 
        FOR VALUES FROM ('2026-04-01 00:00:00') TO ('2026-05-01 00:00:00');
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs_2026_05 PARTITION OF audit_logs 
        FOR VALUES FROM ('2026-05-01 00:00:00') TO ('2026-06-01 00:00:00');
    """)

    # 將舊資料導回新的 Partition 表
    op.execute("INSERT INTO audit_logs SELECT * FROM audit_logs_old;")
    
    # 刪除舊表
    op.execute("DROP TABLE audit_logs_old CASCADE;")

def downgrade() -> None:
    pass
