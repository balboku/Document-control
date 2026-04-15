"""FastAPI main application entry point."""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base
from app.config import get_settings
from app.routers import settings, documents, search, export, mdf, compliance, parts


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings_config = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Create upload directory
    os.makedirs(settings_config.upload_dir, exist_ok=True)
    
    # Create database tables
    async with engine.begin() as conn:
        from sqlalchemy import text
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
    
    logger.info("✅ Database tables created")
    logger.info(f"✅ Upload directory: {os.path.abspath(settings_config.upload_dir)}")
    logger.info("🚀 Document Management System started!")
    
    yield
    
    # Shutdown
    await engine.dispose()
    logger.info("👋 Application shutdown")


app = FastAPI(
    title="AI 文件管理系統",
    description="AI-Driven Document Management System with semantic search",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(settings.router)
app.include_router(documents.router)
app.include_router(search.router)
app.include_router(export.router)
app.include_router(mdf.router)
app.include_router(compliance.router)
app.include_router(parts.router)  # 零件承認管理 (PPAP) 模組



@app.get("/")
async def root():
    return {
        "name": "AI 文件管理系統",
        "version": "1.0.0",
        "status": "running",
    }


@app.get("/api/health")
async def health():
    return {"status": "healthy"}
