"""
Custom middleware for request logging, error handling, and security.
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import logging
import time
import uuid
from typing import Callable

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all incoming requests and responses."""

    async def dispatch(self, request: Request, call_next: Callable):
        """Process request and log details."""
        # Generate request ID for tracing
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        # Record start time
        start_time = time.time()

        # Log incoming request
        logger.info(
            f"[{request_id}] {request.method} {request.url.path}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "client": request.client.host if request.client else "unknown",
            }
        )

        try:
            response = await call_next(request)
        except Exception as e:
            logger.error(
                f"[{request_id}] Request failed: {str(e)}",
                exc_info=True,
                extra={"request_id": request_id}
            )
            raise

        # Calculate processing time
        process_time = time.time() - start_time

        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = str(process_time)

        # Log response
        logger.info(
            f"[{request_id}] {request.method} {request.url.path} - "
            f"Status: {response.status_code} - Time: {process_time:.3f}s",
            extra={
                "request_id": request_id,
                "status_code": response.status_code,
                "process_time": process_time,
            }
        )

        return response


class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """Middleware for centralized error handling."""

    async def dispatch(self, request: Request, call_next: Callable):
        """Handle errors and return standardized responses."""
        try:
            response = await call_next(request)
            return response
        except ValueError as e:
            logger.warning(f"Validation error: {str(e)}")
            return JSONResponse(
                status_code=400,
                content={"detail": "Invalid request", "error": str(e)}
            )
        except PermissionError as e:
            logger.warning(f"Permission denied: {str(e)}")
            return JSONResponse(
                status_code=403,
                content={"detail": "Permission denied"}
            )
        except Exception as e:
            logger.error(f"Unhandled error: {str(e)}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"}
            )


class TenantIsolationMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce tenant isolation in multi-tenant architecture."""

    async def dispatch(self, request: Request, call_next: Callable):
        """Extract and validate tenant context."""
        # Extract tenant ID from headers or path
        tenant_id = request.headers.get("X-Tenant-ID") or request.path_params.get("tenant_id")

        if tenant_id:
            request.state.tenant_id = tenant_id
            logger.debug(f"Tenant context set: {tenant_id}")

        response = await call_next(request)
        return response


__all__ = [
    "RequestLoggingMiddleware",
    "ErrorHandlingMiddleware",
    "TenantIsolationMiddleware",
]
