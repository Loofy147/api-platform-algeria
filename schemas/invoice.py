# schemas/invoice.py
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, validator

class InvoiceItemBase(BaseModel):
    product_id: Optional[UUID] = None
    description: str
    quantity: int
    unit_price: float
    vat_rate: Optional[float] = 19.0

class InvoiceItemCreate(InvoiceItemBase):
    pass

class InvoiceItemRead(InvoiceItemBase):
    id: UUID
    total_price: float

    class Config:
        orm_mode = True

class InvoiceBase(BaseModel):
    customer_id: UUID
    status: Optional[str] = "draft"
    due_date: Optional[datetime] = None
    notes: Optional[str] = None

class InvoiceCreate(InvoiceBase):
    items: List[InvoiceItemCreate]

class InvoiceUpdate(BaseModel):
    status: Optional[str] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None

class InvoiceRead(InvoiceBase):
    id: UUID
    tenant_id: UUID
    invoice_number: str
    subtotal: float
    vat_amount: float
    total_amount: float
    issue_date: datetime
    items: List[InvoiceItemRead]

    class Config:
        orm_mode = True
