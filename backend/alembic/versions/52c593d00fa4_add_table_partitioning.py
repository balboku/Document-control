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
    # 建立 2026 年 4 月與 5 月的 AuditLog 範圍分區表 (Range Partitioning)
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs_2026_04 PARTITION OF audit_logs 
        FOR VALUES FROM ('2026-04-01 00:00:00') TO ('2026-05-01 00:00:00');
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs_2026_05 PARTITION OF audit_logs 
        FOR VALUES FROM ('2026-05-01 00:00:00') TO ('2026-06-01 00:00:00');
    """)

def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_logs_2026_04;")
    op.execute("DROP TABLE IF EXISTS audit_logs_2026_05;")
