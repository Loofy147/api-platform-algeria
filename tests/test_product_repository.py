# tests/test_product_repository.py
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from uuid import uuid4

# Important: Import all models so that Base.metadata is populated
from models.core import Tenant, User
from models.business import Product, Customer, Invoice, InvoiceItem
from core.database import Base
from repositories.product_repository import ProductRepository

# Use an in-memory SQLite database for testing
DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(DATABASE_URL)
TestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=engine, class_=AsyncSession
)

@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncSession:
    """
    Fixture to provide a clean database session for each test function.
    """
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Yield a session to the test
    async with TestingSessionLocal() as session:
        yield session

    # Drop all tables after the test
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_create_and_get_product(db_session: AsyncSession):
    """
    Test creating a new product and retrieving it by ID.
    """
    product_repo = ProductRepository()

    tenant_id = uuid4()
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

    tenant_id = uuid4()

    # Create a couple of products for the tenant
    await product_repo.create(db_session, data={
        "sku": "TENANT-A-001", "name": "Product A1", "base_price": 10.0, "sale_price": 15.0, "tenant_id": tenant_id
    })
    await product_repo.create(db_session, data={
        "sku": "TENANT-A-002", "name": "Product A2", "base_price": 20.0, "sale_price": 25.0, "tenant_id": tenant_id
    })

    # Create a product for another tenant to ensure it's not retrieved
    await product_repo.create(db_session, data={
        "sku": "TENANT-B-001", "name": "Product B1", "base_price": 30.0, "sale_price": 35.0, "tenant_id": uuid4()
    })

    # Retrieve all products for the tenant
    products = await product_repo.get_all_for_tenant(db_session, tenant_id=tenant_id)

    assert len(products) == 2
    assert {p.sku for p in products} == {"TENANT-A-001", "TENANT-A-002"}
