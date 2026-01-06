# schemas/customer.py
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class CustomerBase(BaseModel):
    """
    Base schema for customer data.
    """
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    nif: Optional[str] = None
    rc: Optional[str] = None
    ai: Optional[str] = None


class CustomerCreate(CustomerBase):
    """
    Schema for creating a new customer.
    """
    pass


class CustomerUpdate(CustomerBase):
    """
    Schema for updating an existing customer.
    """
    pass


class CustomerRead(CustomerBase):
    """
    Schema for reading customer data.
    """
    id: UUID
    tenant_id: UUID

    class Config:
        orm_mode = True
