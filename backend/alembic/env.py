import asyncio
import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# 1. 將目前的 backend 資料夾放入 sys.path，否則會發生 ModuleNotFoundError
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.config import get_settings
from app.models import Base

# Alembic Config Object
config = context.config

# 如果有 alembic.ini 且包含 log 設置，載入 logging 設定
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()

# 2. 動態載入資料庫連線字串，取代 alembic.ini 中的硬編碼
config.set_main_option("sqlalchemy.url", settings.database_url)

# 3. 指定 target_metadata 讓 Alembic 能對照 Model 進行自動生成
target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """在離線模式 (Offline mode) 執行遷移。"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection: Connection) -> None:
    """執行實際連線的操作"""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations() -> None:
    """建立非同步 Engine 並執行遷移。"""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

def run_migrations_online() -> None:
    """在連線模式 (Online mode) 執行非同步遷移。"""
    asyncio.run(run_async_migrations())

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
