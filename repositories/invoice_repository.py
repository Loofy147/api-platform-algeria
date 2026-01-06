# repositories/invoice_repository.py
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.repository import BaseRepository
from core.sequences import get_next_sequence_value
from models.business import Invoice, InvoiceItem
from schemas.invoice import InvoiceCreate

class InvoiceRepository(BaseRepository[Invoice]):
    def __init__(self):
        super().__init__(Invoice)

    async def create_with_items(
        self, db: AsyncSession, *, invoice_data: InvoiceCreate, tenant_id: UUID
    ) -> Invoice:
        # Calculate totals
        subtotal = sum(
            item.quantity * item.unit_price for item in invoice_data.items
        )
        vat_amount = sum(
            item.quantity * item.unit_price * (item.vat_rate / 100)
            for item in invoice_data.items
        )
        total_amount = subtotal + vat_amount

        # Create the invoice object
        invoice = Invoice(
            tenant_id=tenant_id,
            customer_id=invoice_data.customer_id,
            status=invoice_data.status,
            due_date=invoice_data.due_date,
            notes=invoice_data.notes,
            subtotal=subtotal,
            vat_amount=vat_amount,
            total_amount=total_amount,
            invoice_number=f"INV-{await get_next_sequence_value(db, tenant_id, 'invoice')}",
        )
        db.add(invoice)
        await db.flush()

        # Create the invoice items
        for item_data in invoice_data.items:
            total_price = item_data.quantity * item_data.unit_price
            invoice_item = InvoiceItem(
                invoice_id=invoice.id, **item_data.dict(), total_price=total_price
            )
            db.add(invoice_item)

        await db.flush()
        await db.refresh(invoice)
        return invoice

    async def get_all_for_tenant(
        self, db: AsyncSession, *, tenant_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Invoice]:
        query = (
            select(self.model)
            .where(self.model.tenant_id == tenant_id)
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        return result.scalars().all()

    async def get_by_id_and_tenant(
        self, db: AsyncSession, *, item_id: UUID, tenant_id: UUID
    ) -> Optional[Invoice]:
        query = select(self.model).where(
            self.model.id == item_id, self.model.tenant_id == tenant_id
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()
