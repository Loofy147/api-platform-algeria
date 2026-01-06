// ============================================================================
// TENANT CONTEXT - Multi-tenant isolation middleware
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError, BadRequestError } from './error-handler';
import { logger } from '../config/logger';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TenantRequest extends Request {
  user: {
    id: string;
    email: string;
    fullName: string;
  };
  organizationId: string;
  organizationSlug?: string;
}

// ============================================================================
// TENANT CONTEXT MIDDLEWARE
// ============================================================================

/**
 * Extract and validate organization context
 * Must be used after authenticate middleware
 *
 * Organization can be specified via:
 * 1. X-Organization-ID header (preferred)
 * 2. Query parameter: ?organizationId=xxx
 * 3. Route parameter: /api/v1/orgs/:organizationId/...
 */
export const tenantContext = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Ensure user is authenticated
    const user = (req as any).user;
    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Extract organization ID from various sources
    const organizationId =
      req.headers['x-organization-id'] as string ||
      (req.query.organizationId as string) ||
      (req.params.organizationId as string);

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(organizationId)) {
      throw new BadRequestError('Invalid organization ID format');
    }

    // TODO: Verify user has access to this organization
    // const membership = await db('organization_members')
    //   .where({
    //     user_id: user.id,
    //     organization_id: organizationId,
    //     is_active: true,
    //   })
    //   .first();
    //
    // if (!membership) {
    //   throw new ForbiddenError('Access denied to this organization');
    // }

    // Attach organization context to request
    (req as TenantRequest).organizationId = organizationId;

    // Optionally attach organization details if needed
    // const organization = await db('organizations').where({ id: organizationId }).first();
    // (req as TenantRequest).organizationSlug = organization.slug;

    logger.debug('Tenant context established', {
      userId: user.id,
      organizationId,
    });

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional tenant context (doesn't throw if no organization)
 * Useful for endpoints that can work both with and without organization context
 */
export const optionalTenantContext = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return next();
    }

    const organizationId =
      req.headers['x-organization-id'] as string ||
      (req.query.organizationId as string) ||
      (req.params.organizationId as string);

    if (organizationId) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(organizationId)) {
        return next(new BadRequestError('Invalid organization ID format'));
      }

      // TODO: Verify access
      (req as TenantRequest).organizationId = organizationId;
    }

    next();
  } catch (error) {
    next();
  }
};

// ============================================================================
// TENANT-AWARE QUERY BUILDER
// ============================================================================

/**
 * Helper to automatically inject organization_id in queries
 * Prevents accidental cross-tenant data access
 */
export const withTenantScope = (query: any, organizationId: string) => {
  return query.where({ organization_id: organizationId });
};

/**
 * Decorator for repository methods to automatically scope queries
 */
export const TenantScoped = (
  target: any,
  propertyName: string,
  descriptor: PropertyDescriptor
) => {
  const originalMethod = descriptor.value;

  descriptor.value = function (organizationId: string, ...args: any[]) {
    // Ensure organizationId is always the first parameter
    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    return originalMethod.apply(this, [organizationId, ...args]);
  };

  return descriptor;
};

// ============================================================================
// TENANT ISOLATION VALIDATION
// ============================================================================

/**
 * Verify that a resource belongs to the organization
 * Call this before updating/deleting resources
 */
export const verifyResourceOwnership = async (
  tableName: string,
  resourceId: string,
  organizationId: string
): Promise<boolean> => {
  // TODO: Implement with database
  // const resource = await db(tableName)
  //   .where({
  //     id: resourceId,
  //     organization_id: organizationId,
  //   })
  //   .first();
  //
  // return !!resource;
  return true;
};

/**
 * Middleware to verify resource ownership before operations
 * Usage: router.delete('/products/:id', authenticate, tenantContext, verifyOwnership('products'), ...)
 */
export const verifyOwnership = (tableName: string, resourceIdParam: string = 'id') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = (req as TenantRequest).organizationId;
      const resourceId = req.params[resourceIdParam];

      if (!organizationId) {
        throw new UnauthorizedError('Organization context required');
      }

      if (!resourceId) {
        throw new BadRequestError(`Resource ID parameter '${resourceIdParam}' not found`);
      }

      const hasAccess = await verifyResourceOwnership(tableName, resourceId, organizationId);

      if (!hasAccess) {
        throw new ForbiddenError('Resource not found or access denied');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// ============================================================================
// ORGANIZATION SWITCHER
// ============================================================================

/**
 * Get all organizations a user has access to
 */
export const getUserOrganizations = async (userId: string) => {
  // TODO: Implement with database
  // return db('organization_members')
  //   .join('organizations', 'organization_members.organization_id', 'organizations.id')
  //   .where({
  //     'organization_members.user_id': userId,
  //     'organization_members.is_active': true,
  //     'organizations.deleted_at': null,
  //   })
  //   .select(
  //     'organizations.id',
  //     'organizations.name',
  //     'organizations.slug',
  //     'organization_members.role'
  //   );
  return [];
};

// ============================================================================
// TENANT CONTEXT HELPERS
// ============================================================================

/**
 * Get current organization from request
 */
export const getOrganizationId = (req: Request): string | null => {
  return (req as TenantRequest).organizationId || null;
};

/**
 * Assert organization context exists (throw if not)
 */
export const requireOrganizationContext = (req: Request): string => {
  const organizationId = getOrganizationId(req);

  if (!organizationId) {
    throw new UnauthorizedError('Organization context required');
  }

  return organizationId;
};

// ============================================================================
// QUERY FILTER HELPERS
// ============================================================================

/**
 * Apply tenant filter to Knex query builder
 * Usage: const products = await applyTenantFilter(db('products'), req).where({ is_active: true });
 */
export const applyTenantFilter = (query: any, req: Request) => {
  const organizationId = getOrganizationId(req);

  if (!organizationId) {
    throw new UnauthorizedError('Organization context required for this operation');
  }

  return query.where('organization_id', organizationId);
};

/**
 * Apply soft delete filter
 * Usage: const products = await applySoftDeleteFilter(db('products'));
 */
export const applySoftDeleteFilter = (query: any) => {
  return query.whereNull('deleted_at');
};

/**
 * Apply both tenant and soft delete filters
 */
export const applyStandardFilters = (query: any, req: Request) => {
  return applySoftDeleteFilter(applyTenantFilter(query, req));
};

// ============================================================================
// EXAMPLE USAGE IN REPOSITORY
// ============================================================================

/*
class ProductRepository {
  // Manual approach
  async findAll(organizationId: string) {
    return db('products')
      .where({ organization_id: organizationId })
      .whereNull('deleted_at');
  }

  // Using helper
  async findAllWithHelper(req: Request) {
    return applyStandardFilters(db('products'), req);
  }

  // Using decorator
  @TenantScoped
  async findById(organizationId: string, productId: string) {
    return db('products')
      .where({ organization_id: organizationId, id: productId })
      .whereNull('deleted_at')
      .first();
  }
}
*/
