"""
Database connection and initialization module.
Handles SQLAlchemy setup with connection pooling and multi-tenancy support.
"""

from sqlalchemy import create_engine, event, pool
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
import logging

from config import settings

logger = logging.getLogger(__name__)

# Database engine and session factory
engine = None
async_engine = None
SessionLocal = None
Base = declarative_base()


async def init_db():
    """Initialize database connection with async support."""
    global async_engine, SessionLocal

    try:
        # Create async engine with connection pooling
        async_engine = create_async_engine(
            settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"),
            echo=settings.DEBUG,
            pool_size=settings.DATABASE_POOL_SIZE,
            max_overflow=settings.DATABASE_MAX_OVERFLOW,
            pool_recycle=settings.DATABASE_POOL_RECYCLE,
            pool_pre_ping=True,
        )

        # Create session factory
        SessionLocal = async_sessionmaker(
            async_engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )

        # Test connection
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        logger.info("Database connection pool initialized")

    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise


async def get_db():
    """Dependency for getting database session."""
    if SessionLocal is None:
        raise RuntimeError("Database not initialized")

    async with SessionLocal() as session:
        try:
            yield session
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {str(e)}")
            raise
        finally:
            await session.close()


async def close_db():
    """Close database connection."""
    global async_engine

    if async_engine:
        await async_engine.dispose()
        logger.info("Database connection closed")


# SQLAlchemy Base class for all models
__all__ = ["Base", "SessionLocal", "get_db", "init_db", "close_db"]
