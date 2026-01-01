"""
Health check endpoints for monitoring API status.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

from core.database import get_db
from core.cache import cache_client
from schemas.base import BaseResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=BaseResponse)
async def health_check():
    """Basic health check endpoint."""
    return BaseResponse(
        success=True,
        message="API is operational",
        data={"status": "healthy"}
    )


@router.get("/detailed", response_model=BaseResponse)
async def detailed_health_check(db: AsyncSession = Depends(get_db)):
    """Detailed health check including database and cache status."""
    health_status = {
        "api": "healthy",
        "database": "unknown",
        "cache": "unknown",
    }

    # Check database
    try:
        result = await db.execute(text("SELECT 1"))
        health_status["database"] = "healthy"
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        health_status["database"] = "unhealthy"

    # Check cache
    try:
        if cache_client:
            await cache_client.ping()
            health_status["cache"] = "healthy"
        else:
            health_status["cache"] = "not_initialized"
    except Exception as e:
        logger.error(f"Cache health check failed: {str(e)}")
        health_status["cache"] = "unhealthy"

    # Determine overall status
    all_healthy = all(
        v == "healthy" for k, v in health_status.items() if k != "cache"
    )

    return BaseResponse(
        success=all_healthy,
        message="Health check completed",
        data=health_status
    )


@router.get("/ready", response_model=BaseResponse)
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """Readiness check for deployment orchestration."""
    try:
        # Check database connectivity
        await db.execute(text("SELECT 1"))

        # Check cache connectivity
        if cache_client:
            await cache_client.ping()

        return BaseResponse(
            success=True,
            message="API is ready to serve traffic",
            data={"ready": True}
        )
    except Exception as e:
        logger.error(f"Readiness check failed: {str(e)}")
        return BaseResponse(
            success=False,
            message="API is not ready",
            data={"ready": False, "error": str(e)}
        )


@router.get("/live", response_model=BaseResponse)
async def liveness_check():
    """Liveness check for deployment orchestration."""
    return BaseResponse(
        success=True,
        message="API is alive",
        data={"alive": True}
    )


__all__ = ["router"]
