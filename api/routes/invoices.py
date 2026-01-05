# api/routes/invoices.py
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_tenant_id
from repositories.invoice_repository import InvoiceRepository
from schemas.invoice import InvoiceCreate, InvoiceRead, InvoiceUpdate

router = APIRouter()

def get_invoice_repo():
    return InvoiceRepository()

@router.post(
    "/",
    response_model=InvoiceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new invoice for a tenant.",
)
async def create_invoice(
    invoice_in: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    invoice_repo: InvoiceRepository = Depends(get_invoice_repo),
):
    new_invoice = await invoice_repo.create_with_items(
        db, invoice_data=invoice_in, tenant_id=tenant_id
    )
    return new_invoice

@router.get(
    "/",
    response_model=List[InvoiceRead],
    summary="Get all invoices for a tenant.",
)
async def get_all_invoices(
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    skip: int = 0,
    limit: int = 100,
    invoice_repo: InvoiceRepository = Depends(get_invoice_repo),
):
    invoices = await invoice_repo.get_all_for_tenant(
        db, tenant_id=tenant_id, skip=skip, limit=limit
    )
    return invoices

@router.get(
    "/{invoice_id}",
    response_model=InvoiceRead,
    summary="Get a specific invoice by its ID.",
)
async def get_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    invoice_repo: InvoiceRepository = Depends(get_invoice_repo),
):
    invoice = await invoice_repo.get_by_id_and_tenant(
        db, item_id=invoice_id, tenant_id=tenant_id
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found."
        )
    return invoice

@router.put(
    "/{invoice_id}",
    response_model=InvoiceRead,
    summary="Update an invoice.",
)
async def update_invoice(
    invoice_id: UUID,
    invoice_in: InvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    invoice_repo: InvoiceRepository = Depends(get_invoice_repo),
):
    invoice = await invoice_repo.get_by_id_and_tenant(
        db, item_id=invoice_id, tenant_id=tenant_id
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found."
        )

    updated_invoice = await invoice_repo.update(
        db, db_obj=invoice, data=invoice_in.dict(exclude_unset=True)
    )
    return updated_invoice

@router.delete(
    "/{invoice_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an invoice.",
)
async def delete_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    invoice_repo: InvoiceRepository = Depends(get_invoice_repo),
):
    invoice = await invoice_repo.get_by_id_and_tenant(
        db, item_id=invoice_id, tenant_id=tenant_id
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found."
        )

    await invoice_repo.delete(db, db_obj=invoice)
    return
