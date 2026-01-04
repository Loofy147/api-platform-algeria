# repositories/customer_repository.py
from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.repository import BaseRepository
from models.business import Customer


class CustomerRepository(BaseRepository[Customer]):
    """
    Repository for Customer model operations.
    """

    def __init__(self):
        super().__init__(Customer)

    async def find_by_email(
        self, db: AsyncSession, *, email: str, tenant_id: UUID
    ) -> Optional[Customer]:
        """
        Finds a customer by their email for a specific tenant.

        :param db: The async database session.
        :param email: The email of the customer to find.
        :param tenant_id: The ID of the tenant.
        :return: The Customer instance or None if not found.
        """
        query = select(self.model).where(
            self.model.email == email, self.model.tenant_id == tenant_id
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_id_and_tenant(
        self, db: AsyncSession, *, item_id: UUID, tenant_id: UUID
    ) -> Optional[Customer]:
        """
        Retrieves an item by its ID for a specific tenant.
        """
        query = select(self.model).where(
            self.model.id == item_id, self.model.tenant_id == tenant_id
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def get_all_for_tenant(
        self, db: AsyncSession, *, tenant_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Customer]:
        """
        Retrieves all customers for a specific tenant with pagination.

        :param db: The async database session.
        :param tenant_id: The ID of the tenant.
        :param skip: The number of items to skip.
        :param limit: The maximum number of items to return.
        :return: A list of Customer instances.
        """
        query = (
            select(self.model)
            .where(self.model.tenant_id == tenant_id)
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        return result.scalars().all()
