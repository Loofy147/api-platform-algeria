"""
Configuration management for the API Platform.
Supports environment-based configuration for development, testing, and production.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "API Platform - Business OS for Algeria"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    RELOAD: bool = True

    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/api_platform"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_POOL_RECYCLE: int = 3600

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CACHE_TTL: int = 3600

    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:8080"]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: list = ["*"]
    CORS_ALLOW_HEADERS: list = ["*"]

    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # API Keys
    API_KEY_HEADER: str = "X-API-Key"

    # Localization
    SUPPORTED_LANGUAGES: list = ["en", "ar", "fr"]
    DEFAULT_LANGUAGE: str = "en"

    # Payment Integration
    BARIDI_MOB_API_KEY: Optional[str] = None
    BARIDI_MOB_MERCHANT_ID: Optional[str] = None

    # Notification Services
    SMS_PROVIDER: str = "twilio"  # or other provider
    EMAIL_PROVIDER: str = "sendgrid"
    WHATSAPP_PROVIDER: str = "twilio"

    # Storage
    STORAGE_TYPE: str = "s3"  # or "local"
    S3_BUCKET_NAME: Optional[str] = None
    S3_REGION: Optional[str] = None
    S3_ACCESS_KEY: Optional[str] = None
    S3_SECRET_KEY: Optional[str] = None

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
