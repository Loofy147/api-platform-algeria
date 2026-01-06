# tests/test_invoice_repository.py
import pytest
from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from models.core import Tenant

from repositories.invoice_repository import InvoiceRepository
from repositories.customer_repository import CustomerRepository
from schemas.invoice import InvoiceCreate, InvoiceItemCreate

@pytest.mark.asyncio
async def test_create_invoice_with_items(db_session: AsyncSession):
    invoice_repo = InvoiceRepository()
    customer_repo = CustomerRepository()

    tenant_id = UUID("00000000-0000-0000-0000-000000000001")
    customer = await customer_repo.create(
        db_session,
        data={"name": "Test Customer", "tenant_id": tenant_id},
    )

    invoice_data = InvoiceCreate(
        customer_id=customer.id,
        items=[
            InvoiceItemCreate(description="Item 1", quantity=2, unit_price=10.0),
            InvoiceItemCreate(description="Item 2", quantity=1, unit_price=20.0),
        ],
    )

    invoice = await invoice_repo.create_with_items(
        db_session, invoice_data=invoice_data, tenant_id=tenant_id
    )

    assert invoice is not None
    assert invoice.customer_id == customer.id
    assert invoice.subtotal == 40.0
    assert invoice.vat_amount == 7.6
    assert invoice.total_amount == 47.6
    assert len(invoice.items) == 2
    assert invoice.invoice_number == "INV-1"

    # Create a second invoice to check for correct sequencing
    invoice2 = await invoice_repo.create_with_items(
        db_session, invoice_data=invoice_data, tenant_id=tenant_id
    )
    assert invoice2.invoice_number == "INV-2"

@pytest.mark.asyncio
async def test_get_all_invoices_for_tenant(db_session: AsyncSession):
    invoice_repo = InvoiceRepository()
    customer_repo = CustomerRepository()

    tenant_id = UUID("00000000-0000-0000-0000-000000000001")
    customer = await customer_repo.create(
        db_session,
        data={"name": "Test Customer", "tenant_id": tenant_id},
    )

    # Create a couple of invoices for the tenant
    await invoice_repo.create_with_items(
        db_session,
        invoice_data=InvoiceCreate(
            customer_id=customer.id,
            items=[InvoiceItemCreate(description="Item 1", quantity=1, unit_price=10.0)],
        ),
        tenant_id=tenant_id,
    )
    await invoice_repo.create_with_items(
        db_session,
        invoice_data=InvoiceCreate(
            customer_id=customer.id,
            items=[InvoiceItemCreate(description="Item 2", quantity=1, unit_price=20.0)],
        ),
        tenant_id=tenant_id,
    )

    # Create an invoice for another tenant to ensure it's not retrieved
    other_tenant = Tenant(id=uuid4(), name="Other Tenant", slug="other-tenant")
    db_session.add(other_tenant)
    await db_session.commit()
    other_customer = await customer_repo.create(
        db_session,
        data={"name": "Other Customer", "tenant_id": other_tenant.id},
    )
    await invoice_repo.create_with_items(
        db_session,
        invoice_data=InvoiceCreate(
            customer_id=other_customer.id,
            items=[InvoiceItemCreate(description="Item 3", quantity=1, unit_price=30.0)],
        ),
        tenant_id=other_tenant.id,
    )

    invoices = await invoice_repo.get_all_for_tenant(db_session, tenant_id=tenant_id)

    assert len(invoices) == 2

@pytest.mark.asyncio
async def test_get_invoice_by_id_and_tenant(db_session: AsyncSession):
    invoice_repo = InvoiceRepository()
    customer_repo = CustomerRepository()

    tenant_id = UUID("00000000-0000-0000-0000-000000000001")
    customer = await customer_repo.create(
        db_session,
        data={"name": "Test Customer", "tenant_id": tenant_id},
    )

    invoice = await invoice_repo.create_with_items(
        db_session,
        invoice_data=InvoiceCreate(
            customer_id=customer.id,
            items=[InvoiceItemCreate(description="Item 1", quantity=1, unit_price=10.0)],
        ),
        tenant_id=tenant_id,
    )

    retrieved_invoice = await invoice_repo.get_by_id_and_tenant(
        db_session, item_id=invoice.id, tenant_id=tenant_id
    )

    assert retrieved_invoice is not None
    assert retrieved_invoice.id == invoice.id

    # Test that an invoice from another tenant is not retrieved
    not_found_invoice = await invoice_repo.get_by_id_and_tenant(
        db_session, item_id=invoice.id, tenant_id=uuid4()
    )
    assert not_found_invoice is None
