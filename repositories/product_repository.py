# repositories/product_repository.py
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.repository import BaseRepository
from models.business import Product


class ProductRepository(BaseRepository[Product]):
    """
    Repository for Product model operations.
    """
    def __init__(self):
        super().__init__(Product)

    async def find_by_sku(self, db: AsyncSession, sku: str, tenant_id: str) -> Optional[Product]:
        """
        Finds a product by its SKU for a specific tenant.

        :param db: The async database session.
        :param sku: The SKU of the product to find.
        :param tenant_id: The ID of the tenant.
        :return: The Product instance or None if not found.
        """
        query = select(self.model).where(self.model.sku == sku, self.model.tenant_id == tenant_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def get_all_for_tenant(
        self, db: AsyncSession, tenant_id: str, *, skip: int = 0, limit: int = 100
    ) -> List[Product]:
        """
        Retrieves all products for a specific tenant with pagination.

        :param db: The async database session.
        :param tenant_id: The ID of the tenant.
        :param skip: The number of items to skip.
        :param limit: The maximum number of items to return.
        :return: A list of Product instances.
        """
        query = select(self.model).where(self.model.tenant_id == tenant_id).offset(skip).limit(limit)
        result = await db.execute(query)
        return result.scalars().all()
