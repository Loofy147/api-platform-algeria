"""
Business-specific database models for Invoicing, CRM, and Inventory modules.
All models include tenant_id for data isolation.
"""

from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Float, Integer, JSON, Text, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime

from core.database import Base


class Customer(Base):
    """CRM: Customer model."""
    __tablename__ = "customers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    
    name = Column(String(255), nullable=False)
    email = Column(String(255))
    phone = Column(String(20))
    address = Column(Text)
    city = Column(String(100))
    
    # Business specific fields for Algeria
    nif = Column(String(50))  # Numéro d'Identification Fiscale
    rc = Column(String(50))   # Registre du Commerce
    ai = Column(String(50))   # Article d'Imposition
    
    is_active = Column(Boolean, default=True)
    metadata_info = Column(JSON, default={})
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    invoices = relationship("Invoice", back_populates="customer")


class Product(Base):
    """Inventory: Product model."""
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    
    sku = Column(String(100), index=True)
    barcode = Column(String(100), index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    
    # Pricing & Stock
    base_price = Column(Numeric(15, 2), nullable=False)
    sale_price = Column(Numeric(15, 2), nullable=False)
    vat_rate = Column(Numeric(5, 2), default=19.0)  # Default Algerian VAT
    
    stock_quantity = Column(Integer, default=0)
    min_stock_level = Column(Integer, default=5)
    
    category = Column(String(100))
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Invoice(Base):
    """Invoicing: Invoice model."""
    __tablename__ = "invoices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    
    invoice_number = Column(String(50), nullable=False, index=True)
    status = Column(String(20), default="draft")  # draft, sent, paid, cancelled, overdue
    
    # Financials
    subtotal = Column(Numeric(15, 2), nullable=False)
    vat_amount = Column(Numeric(15, 2), nullable=False)
    total_amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), default="DZD")
    
    # Dates
    issue_date = Column(DateTime, default=datetime.utcnow)
    due_date = Column(DateTime)
    paid_at = Column(DateTime)
    
    # Payment Info
    payment_method = Column(String(50))  # cash, baridimob, cib, bank_transfer
    transaction_id = Column(String(100))
    
    notes = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    customer = relationship("Customer", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceItem(Base):
    """Invoicing: Individual items in an invoice."""
    __tablename__ = "invoice_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"))
    
    description = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(15, 2), nullable=False)
    vat_rate = Column(Numeric(5, 2), default=19.0)
    total_price = Column(Numeric(15, 2), nullable=False)
    
    # Relationships
    invoice = relationship("Invoice", back_populates="items")
