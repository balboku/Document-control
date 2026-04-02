from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://dms_user:dms_password_2026@localhost:5432/dms"
    google_api_key: str = ""
    gemma_model: str = "gemma-3-27b-it"
    embedding_model: str = "gemini-embedding-2-preview"
    upload_dir: str = "./uploads"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
