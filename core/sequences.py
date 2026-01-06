# core/sequences.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from uuid import UUID

from models.core import TenantSequence

async def get_next_sequence_value(
    db: AsyncSession, tenant_id: UUID, sequence_name: str
) -> int:
    """
    Gets the next value for a tenant-specific sequence.
    """
    # Use FOR UPDATE to lock the row and prevent race conditions
    stmt = (
        select(TenantSequence)
        .where(
            TenantSequence.organization_id == tenant_id,
            TenantSequence.name == sequence_name,
        )
        .with_for_update()
    )
    result = await db.execute(stmt)
    sequence = result.scalar_one_or_none()

    if sequence:
        sequence.last_value += 1
        await db.merge(sequence)
        await db.flush()
        return sequence.last_value
    else:
        # Create the sequence if it doesn't exist
        new_sequence = TenantSequence(
            organization_id=tenant_id, name=sequence_name, last_value=1
        )
        db.add(new_sequence)
        await db.flush()
        return 1
