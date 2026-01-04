# api/routes/products.py
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_tenant_id
from models.business import Product
from repositories.product_repository import ProductRepository
from schemas.product import ProductCreate, ProductRead, ProductUpdate

router = APIRouter()

def get_product_repo():
    return ProductRepository()


@router.post(
    "/",
    response_model=ProductRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new product for a tenant.",
)
async def create_product(
    product_in: ProductCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    product_repo: ProductRepository = Depends(get_product_repo),
):
    """
    Creates a new product within the context of a specific tenant.
    """
    # Check for duplicate SKU
    existing_product = await product_repo.find_by_sku(db, sku=product_in.sku, tenant_id=tenant_id)
    if existing_product:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A product with this SKU already exists for this tenant.",
        )

    # Create the product
    product_data = product_in.dict()
    product_data["tenant_id"] = tenant_id
    new_product = await product_repo.create(db, data=product_data)
    return new_product


@router.get(
    "/",
    response_model=List[ProductRead],
    summary="Get all products for a tenant.",
)
async def get_all_products(
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    skip: int = 0,
    limit: int = 100,
    product_repo: ProductRepository = Depends(get_product_repo),
):
    """
    Retrieves a list of all products belonging to a specific tenant.
    """
    products = await product_repo.get_all_for_tenant(db, tenant_id=tenant_id, skip=skip, limit=limit)
    return products


@router.get(
    "/{product_id}",
    response_model=ProductRead,
    summary="Get a specific product by its ID.",
)
async def get_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    product_repo: ProductRepository = Depends(get_product_repo),
):
    """
    Retrieves a single product by its unique ID, ensuring it belongs to the correct tenant.
    """
    product = await product_repo.get_by_id_and_tenant(
        db, item_id=product_id, tenant_id=tenant_id
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )
    return product


@router.put(
    "/{product_id}",
    response_model=ProductRead,
    summary="Update a product.",
)
async def update_product(
    product_id: UUID,
    product_in: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    product_repo: ProductRepository = Depends(get_product_repo),
):
    """
    Updates the details of an existing product, ensuring it belongs to the correct tenant.
    """
    product = await product_repo.get_by_id_and_tenant(
        db, item_id=product_id, tenant_id=tenant_id
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    updated_product = await product_repo.update(
        db, db_obj=product, data=product_in.dict(exclude_unset=True)
    )
    return updated_product


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a product.",
)
async def delete_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id),
    product_repo: ProductRepository = Depends(get_product_repo),
):
    """
    Deletes a product from the database, ensuring it belongs to the correct tenant.
    """
    product = await product_repo.get_by_id_and_tenant(
        db, item_id=product_id, tenant_id=tenant_id
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    await product_repo.delete(db, db_obj=product)
    return
