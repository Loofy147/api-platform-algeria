# core/repository.py
import uuid
from typing import Any, Dict, Generic, List, Optional, Type, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from core.database import Base
ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """
    A generic repository for performing common database operations.
    """

    def __init__(self, model: Type[ModelType]):
        """
        Initializes the repository with a specific SQLAlchemy model.

        :param model: The SQLAlchemy model class.
        """
        self.model = model

    async def get_by_id(self, db: AsyncSession, item_id: Any) -> Optional[ModelType]:
        """
        Retrieves an item by its primary key.

        :param db: The async database session.
        :param item_id: The ID of the item to retrieve.
        :return: The model instance or None if not found.
        """
        query = select(self.model).where(self.model.id == item_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def get_all(self, db: AsyncSession, *, skip: int = 0, limit: int = 100) -> List[ModelType]:
        """
        Retrieves a list of items with pagination.

        :param db: The async database session.
        :param skip: The number of items to skip.
        :param limit: The maximum number of items to return.
        :return: A list of model instances.
        """
        query = select(self.model).offset(skip).limit(limit)
        result = await db.execute(query)
        return result.scalars().all()

    async def create(self, db: AsyncSession, *, data: Dict[str, Any]) -> ModelType:
        """
        Creates a new item in the database.

        :param db: The async database session.
        :param data: A dictionary containing the item's data.
        :return: The newly created model instance.
        """
        # As noted in the project documentation, generate a UUID if one is not provided.
        if 'id' not in data:
            data['id'] = uuid.uuid4()

        db_obj = self.model(**data)
        db.add(db_obj)
        await db.flush()
        await db.refresh(db_obj)
        return db_obj

    async def update(
        self, db: AsyncSession, *, db_obj: ModelType, data: Dict[str, Any]
    ) -> ModelType:
        """
        Updates an existing item in the database.

        :param db: The async database session.
        :param db_obj: The existing model instance to update.
        :param data: A dictionary containing the new data.
        :return: The updated model instance.
        """
        for field, value in data.items():
            setattr(db_obj, field, value)

        db.add(db_obj)
        await db.flush()
        await db.refresh(db_obj)
        return db_obj

    async def delete(self, db: AsyncSession, *, db_obj: ModelType) -> None:
        """
        Deletes an item from the database.

        :param db: The async database session.
        :param db_obj: The database object to delete.
        """
        await db.delete(db_obj)
        await db.flush()
