# tests/test_product_repository.py
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

# Important: Import all models so that Base.metadata is populated
from uuid import UUID, uuid4
from models.core import Tenant, User
from models.business import Product, Customer, Invoice, InvoiceItem
from core.database import Base
from repositories.product_repository import ProductRepository

@pytest.mark.asyncio
async def test_create_and_get_product(db_session: AsyncSession):
    """
    Test creating a new product and retrieving it by ID.
    """
    product_repo = ProductRepository()

    tenant_id = UUID("00000000-0000-0000-0000-000000000001")
    product_data = {
        "sku": "TEST-001",
        "name": "Test Product",
        "base_price": 99.99,
        "sale_price": 129.99,
        "tenant_id": tenant_id,
    }

    # Create the product
    new_product = await product_repo.create(db_session, data=product_data)

    assert new_product is not None
    assert new_product.sku == "TEST-001"

    # Retrieve the product by ID
    retrieved_product = await product_repo.get_by_id(db_session, item_id=new_product.id)

    assert retrieved_product is not None
    assert retrieved_product.id == new_product.id
    assert retrieved_product.name == "Test Product"


@pytest.mark.asyncio
async def test_get_all_products_for_tenant(db_session: AsyncSession):
    """
    Test retrieving all products for a specific tenant.
    """
    product_repo = ProductRepository()

    tenant_id = UUID("00000000-0000-0000-0000-000000000001")

    # Create a couple of products for the tenant
    await product_repo.create(db_session, data={
        "sku": "TENANT-A-001", "name": "Product A1", "base_price": 10.0, "sale_price": 15.0, "tenant_id": tenant_id
    })
    await product_repo.create(db_session, data={
        "sku": "TENANT-A-002", "name": "Product A2", "base_price": 20.0, "sale_price": 25.0, "tenant_id": tenant_id
    })

    # Create a product for another tenant to ensure it's not retrieved
    other_tenant = Tenant(id=uuid4(), name="Other Tenant", slug="other-tenant")
    db_session.add(other_tenant)
    await db_session.commit()
    await product_repo.create(db_session, data={
        "sku": "TENANT-B-001", "name": "Product B1", "base_price": 30.0, "sale_price": 35.0, "tenant_id": other_tenant.id
    })

    # Retrieve all products for the tenant
    products = await product_repo.get_all_for_tenant(db_session, tenant_id=tenant_id)

    assert len(products) == 2
    assert {p.sku for p in products} == {"TENANT-A-001", "TENANT-A-002"}
