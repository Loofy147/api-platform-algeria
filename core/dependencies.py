# core/dependencies.py
from uuid import UUID

# This is a mock dependency to simulate getting the tenant ID from an authenticated user.
# In a real application, this would be a more complex dependency that decodes a JWT
# or looks up a session to get the user's tenant.
async def get_tenant_id() -> UUID:
    """
    Returns a hardcoded tenant ID for demonstration purposes.
    """
    # This UUID corresponds to a tenant that can be seeded in the database for testing.
    return UUID("00000000-0000-0000-0000-000000000001")
