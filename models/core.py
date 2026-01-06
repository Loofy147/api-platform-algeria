"""
Core database models for multi-tenancy, users, and roles.
"""

from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Table, JSON, Enum, Integer, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
import enum

from core.database import Base


class SubscriptionPlan(str, enum.Enum):
    """Subscription plans for tenants."""
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class UserRole(str, enum.Enum):
    """User roles within a tenant."""
    OWNER = "owner"
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"
    VIEWER = "viewer"


# Association table for user-tenant relationship
user_tenant_association = Table(
    "user_tenant_association",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True),
    Column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id"), primary_key=True),
    Column("role", String, default=UserRole.USER),
    Column("is_active", Boolean, default=True),
    Column("created_at", DateTime, default=datetime.utcnow),
)


class Tenant(Base):
    """
    Tenant model representing an organization or business.
    Supports multi-tenancy through shared database with tenant_id isolation.
    """
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(String(500))
    
    # Subscription details
    plan = Column(Enum(SubscriptionPlan), default=SubscriptionPlan.STARTER)
    is_active = Column(Boolean, default=True)
    
    # Configuration & Metadata
    settings = Column(JSON, default={})
    metadata_info = Column(JSON, default={})
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    users = relationship("User", secondary=user_tenant_association, back_populates="tenants")
    modules = relationship("TenantModule", back_populates="tenant")

    def __repr__(self):
        return f"<Tenant(name='{self.name}', slug='{self.slug}')>"


class User(Base):
    """
    User model for authentication and profile information.
    Users can belong to multiple tenants.
    """
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    
    first_name = Column(String(100))
    last_name = Column(String(100))
    phone_number = Column(String(20))
    
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    
    # Localization
    preferred_language = Column(String(5), default="en")  # en, ar, fr
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime)

    # Relationships
    tenants = relationship("Tenant", secondary=user_tenant_association, back_populates="users")

    def __repr__(self):
        return f"<User(email='{self.email}')>"


class Module(Base):
    """
    Available modules in the platform (Invoicing, CRM, etc.).
    """
    __tablename__ = "modules"

    id = Column(String(50), primary_key=True)  # e.g., 'invoicing', 'crm'
    name = Column(String(100), nullable=False)
    description = Column(String(500))
    base_price = Column(JSON)  # Price per plan
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Module(name='{self.name}')>"


class TenantModule(Base):
    """
    Association between tenants and enabled modules.
    """
    __tablename__ = "tenant_modules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    module_id = Column(String(50), ForeignKey("modules.id"), nullable=False)
    
    is_enabled = Column(Boolean, default=True)
    activated_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    
    # Module-specific configuration for this tenant
    config = Column(JSON, default={})

    # Relationships
    tenant = relationship("Tenant", back_populates="modules")
    module = relationship("Module")

    def __repr__(self):
        return f"<TenantModule(tenant_id='{self.tenant_id}', module_id='{self.module_id}')>"


class TenantSequence(Base):
    """
    Tracks the last used value for a named sequence for each tenant.
    """
    __tablename__ = "tenant_sequences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    name = Column(String(50), nullable=False)
    last_value = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_tenant_sequence_name"),
    )
