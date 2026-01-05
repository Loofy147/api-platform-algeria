# api/routes/customers.py
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_tenant_id
from models.business import Customer
from repositories.customer_repository import CustomerRepository
from schemas.customer import CustomerCreate, CustomerRead, CustomerUpdate

router = APIRouter()

def get_customer_repo():
    return CustomerRepository()


@router.post(
    "/",
    response_model=CustomerRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new customer for a tenant.",
)
async def create_customer(
    customer_in: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    customer_repo: CustomerRepository = Depends(get_customer_repo),
):
    """
    Creates a new customer within the context of a specific tenant.
    """
    # Check for duplicate email
    if customer_in.email:
        existing_customer = await customer_repo.find_by_email(
            db, email=customer_in.email, tenant_id=tenant_id
        )
        if existing_customer:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A customer with this email already exists for this tenant.",
            )

    # Create the customer
    customer_data = customer_in.dict()
    customer_data["tenant_id"] = tenant_id
    new_customer = await customer_repo.create(db, data=customer_data)
    return new_customer


@router.get(
    "/",
    response_model=List[CustomerRead],
    summary="Get all customers for a tenant.",
)
async def get_all_customers(
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    skip: int = 0,
    limit: int = 100,
    customer_repo: CustomerRepository = Depends(get_customer_repo),
):
    """
    Retrieves a list of all customers belonging to a specific tenant.
    """
    customers = await customer_repo.get_all_for_tenant(
        db, tenant_id=tenant_id, skip=skip, limit=limit
    )
    return customers


@router.get(
    "/{customer_id}",
    response_model=CustomerRead,
    summary="Get a specific customer by their ID.",
)
async def get_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    customer_repo: CustomerRepository = Depends(get_customer_repo),
):
    """
    Retrieves a single customer by their unique ID, ensuring it belongs to the correct tenant.
    """
    customer = await customer_repo.get_by_id_and_tenant(
        db, item_id=customer_id, tenant_id=tenant_id
    )
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )
    return customer


@router.put(
    "/{customer_id}",
    response_model=CustomerRead,
    summary="Update a customer.",
)
async def update_customer(
    customer_id: UUID,
    customer_in: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    customer_repo: CustomerRepository = Depends(get_customer_repo),
):
    """
    Updates the details of an existing customer, ensuring it belongs to the correct tenant.
    """
    customer = await customer_repo.get_by_id_and_tenant(
        db, item_id=customer_id, tenant_id=tenant_id
    )
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )

    updated_customer = await customer_repo.update(
        db, db_obj=customer, data=customer_in.dict(exclude_unset=True)
    )
    return updated_customer


@router.delete(
    "/{customer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a customer.",
)
async def delete_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    customer_repo: CustomerRepository = Depends(get_customer_repo),
):
    """
    Deletes a customer from the database, ensuring it belongs to the correct tenant.
    """
    customer = await customer_repo.get_by_id_and_tenant(
        db, item_id=customer_id, tenant_id=tenant_id
    )
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )
    await customer_repo.delete(db, db_obj=customer)
    return
