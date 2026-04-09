import uuid

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from app.config import get_settings


settings = get_settings()

database_url = make_url(settings.database_url)
is_pgbouncer = "pgbouncer" in (database_url.host or "").lower() or database_url.port == 6432

engine_kwargs = {
    "echo": False,
    "pool_pre_ping": True,
}

if is_pgbouncer:
    # PgBouncer transaction pooling does not work well with SQLAlchemy's default
    # asyncpg prepared statement behavior and pooled DBAPI connections.
    if "prepared_statement_cache_size" not in database_url.query:
        database_url = database_url.update_query_dict({"prepared_statement_cache_size": "0"})

    engine_kwargs["poolclass"] = NullPool
    engine_kwargs["connect_args"] = {
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
    }
else:
    engine_kwargs.update(
        pool_size=20,
        max_overflow=10,
        pool_recycle=1800,
    )

engine = create_async_engine(database_url, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
