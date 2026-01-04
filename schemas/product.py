# schemas/product.py
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class ProductBase(BaseModel):
    """
    Base schema for product data.
    """
    sku: Optional[str] = None
    barcode: Optional[str] = None
    name: str
    description: Optional[str] = None
    base_price: float
    sale_price: float
    vat_rate: Optional[float] = 19.0
    stock_quantity: Optional[int] = 0
    min_stock_level: Optional[int] = 5
    category: Optional[str] = None


class ProductCreate(ProductBase):
    """
    Schema for creating a new product.
    """
    pass


class ProductUpdate(ProductBase):
    """
    Schema for updating an existing product.
    """
    pass


class ProductRead(ProductBase):
    """
    Schema for reading product data.
    """
    id: UUID
    tenant_id: UUID

    class Config:
        orm_mode = True
