# tests/test_customer_repository.py
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from uuid import uuid4

# Important: Import all models so that Base.metadata is populated
from models.core import Tenant, User
from models.business import Product, Customer, Invoice, InvoiceItem
from core.database import Base
from repositories.customer_repository import CustomerRepository

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
        # Create a mock tenant
        tenant_id = UUID("00000000-0000-0000-0000-000000000001")
        mock_tenant = Tenant(id=tenant_id, name="Test Tenant", slug="test-tenant")
        session.add(mock_tenant)
        await session.commit()

        yield session

    # Drop all tables after the test
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_create_and_get_customer(db_session: AsyncSession):
    """
    Test creating a new customer and retrieving it by ID.
    """
    customer_repo = CustomerRepository()

    tenant_id = UUID("00000000-0000-0000-0000-000000000001")
    customer_data = {
        "name": "Test Customer",
        "email": "test@example.com",
        "tenant_id": tenant_id,
    }

    # Create the customer
    new_customer = await customer_repo.create(db_session, data=customer_data)

    assert new_customer is not None
    assert new_customer.name == "Test Customer"
    assert new_customer.email == "test@example.com"

    # Retrieve the customer by ID
    retrieved_customer = await customer_repo.get_by_id(db_session, item_id=new_customer.id)

    assert retrieved_customer is not None
    assert retrieved_customer.id == new_customer.id
    assert retrieved_customer.name == "Test Customer"


@pytest.mark.asyncio
async def test_find_customer_by_email(db_session: AsyncSession):
    """
    Test finding a customer by their email address.
    """
    customer_repo = CustomerRepository()

    tenant_id = UUID("00000000-0000-0000-0000-000000000001")
    customer_data = {
        "name": "Test Customer",
        "email": "findme@example.com",
        "tenant_id": tenant_id,
    }

    await customer_repo.create(db_session, data=customer_data)

    # Find the customer by email
    found_customer = await customer_repo.find_by_email(
        db_session, email="findme@example.com", tenant_id=tenant_id
    )

    assert found_customer is not None
    assert found_customer.email == "findme@example.com"

    # Test that a customer with the same email in another tenant is not found
    other_tenant = Tenant(id=uuid4(), name="Other Tenant", slug="other-tenant")
    db_session.add(other_tenant)
    await db_session.commit()
    not_found_customer = await customer_repo.find_by_email(
        db_session, email="findme@example.com", tenant_id=other_tenant.id
    )
    assert not_found_customer is None


@pytest.mark.asyncio
async def test_get_all_customers_for_tenant(db_session: AsyncSession):
    """
    Test retrieving all customers for a specific tenant.
    """
    customer_repo = CustomerRepository()

    tenant_id = UUID("00000000-0000-0000-0000-000000000001")

    # Create a couple of customers for the tenant
    await customer_repo.create(db_session, data={
        "name": "Customer A1", "email": "a1@example.com", "tenant_id": tenant_id
    })
    await customer_repo.create(db_session, data={
        "name": "Customer A2", "email": "a2@example.com", "tenant_id": tenant_id
    })

    # Create a customer for another tenant to ensure it's not retrieved
    other_tenant = Tenant(id=uuid4(), name="Other Tenant", slug="other-tenant")
    db_session.add(other_tenant)
    await db_session.commit()
    await customer_repo.create(db_session, data={
        "name": "Customer B1", "email": "b1@example.com", "tenant_id": other_tenant.id
    })

    # Retrieve all customers for the tenant
    customers = await customer_repo.get_all_for_tenant(db_session, tenant_id=tenant_id)

    assert len(customers) == 2
    assert {c.email for c in customers} == {"a1@example.com", "a2@example.com"}
