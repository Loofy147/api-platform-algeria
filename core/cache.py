"""
Cache management module using Redis.
Provides caching utilities for performance optimization and session management.
"""

import redis.asyncio as redis
import json
import logging
from typing import Optional, Any

from config import settings

logger = logging.getLogger(__name__)

# Global cache instance
cache_client = None


async def init_cache():
    """Initialize Redis cache connection."""
    global cache_client

    try:
        cache_client = await redis.from_url(
            settings.REDIS_URL,
            encoding="utf8",
            decode_responses=True,
            health_check_interval=30,
        )

        # Test connection
        await cache_client.ping()
        logger.info("Cache (Redis) connection established")

    except Exception as e:
        logger.error(f"Failed to initialize cache: {str(e)}")
        raise


async def close_cache():
    """Close cache connection."""
    global cache_client

    if cache_client:
        await cache_client.close()
        logger.info("Cache connection closed")


async def get_cache(key: str) -> Optional[Any]:
    """Retrieve value from cache."""
    if cache_client is None:
        logger.warning("Cache client not initialized")
        return None

    try:
        value = await cache_client.get(key)
        if value:
            return json.loads(value)
        return None
    except Exception as e:
        logger.error(f"Cache get error for key {key}: {str(e)}")
        return None


async def set_cache(
    key: str,
    value: Any,
    ttl: Optional[int] = None
) -> bool:
    """Store value in cache with optional TTL."""
    if cache_client is None:
        logger.warning("Cache client not initialized")
        return False

    try:
        ttl = ttl or settings.REDIS_CACHE_TTL
        await cache_client.setex(
            key,
            ttl,
            json.dumps(value)
        )
        return True
    except Exception as e:
        logger.error(f"Cache set error for key {key}: {str(e)}")
        return False


async def delete_cache(key: str) -> bool:
    """Delete value from cache."""
    if cache_client is None:
        return False

    try:
        await cache_client.delete(key)
        return True
    except Exception as e:
        logger.error(f"Cache delete error for key {key}: {str(e)}")
        return False


async def clear_cache_pattern(pattern: str) -> int:
    """Delete all keys matching a pattern."""
    if cache_client is None:
        return 0

    try:
        keys = await cache_client.keys(pattern)
        if keys:
            return await cache_client.delete(*keys)
        return 0
    except Exception as e:
        logger.error(f"Cache pattern delete error for pattern {pattern}: {str(e)}")
        return 0


__all__ = [
    "init_cache",
    "close_cache",
    "get_cache",
    "set_cache",
    "delete_cache",
    "clear_cache_pattern",
]
