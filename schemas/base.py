"""
Base schemas and response models for API responses.
"""

from pydantic import BaseModel, Field
from typing import Optional, Generic, TypeVar, List
from datetime import datetime

T = TypeVar('T')


class BaseResponse(BaseModel):
    """Standard API response wrapper."""

    success: bool = Field(..., description="Whether the request was successful")
    message: Optional[str] = Field(None, description="Response message")
    data: Optional[dict] = Field(None, description="Response data")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "message": "Request successful",
                "data": {},
                "timestamp": "2024-01-01T00:00:00"
            }
        }


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated response wrapper."""

    success: bool = Field(True, description="Whether the request was successful")
    data: List[T] = Field(..., description="List of items")
    total: int = Field(..., description="Total number of items")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Number of items per page")
    total_pages: int = Field(..., description="Total number of pages")
    has_next: bool = Field(..., description="Whether there is a next page")
    has_previous: bool = Field(..., description="Whether there is a previous page")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "data": [],
                "total": 100,
                "page": 1,
                "page_size": 20,
                "total_pages": 5,
                "has_next": True,
                "has_previous": False
            }
        }


class ErrorResponse(BaseModel):
    """Error response model."""

    success: bool = Field(False, description="Whether the request was successful")
    error: str = Field(..., description="Error message")
    error_code: Optional[str] = Field(None, description="Error code")
    details: Optional[dict] = Field(None, description="Additional error details")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "success": False,
                "error": "Invalid request",
                "error_code": "INVALID_REQUEST",
                "details": {},
                "timestamp": "2024-01-01T00:00:00"
            }
        }


class TimestampedModel(BaseModel):
    """Base model with timestamp fields."""

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class PaginationParams(BaseModel):
    """Pagination parameters."""

    page: int = Field(1, ge=1, description="Page number")
    page_size: int = Field(20, ge=1, le=100, description="Items per page")

    @property
    def skip(self) -> int:
        """Calculate skip value for database queries."""
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        """Get limit value."""
        return self.page_size


__all__ = [
    "BaseResponse",
    "PaginatedResponse",
    "ErrorResponse",
    "TimestampedModel",
    "PaginationParams",
]
