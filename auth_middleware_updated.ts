import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ResponseHandler } from '../common/responses';

interface TokenPayload {
  userId: string;
  organizationId: string;
  role: string;
  permissions: string[];
  type: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Authenticate JWT token
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ResponseHandler.error(
        res,
        'Authentication required',
        'UNAUTHORIZED',
        401
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'your-secret-key'
      ) as TokenPayload;

      // Verify it's an access token
      if (decoded.type !== 'access') {
        return ResponseHandler.error(
          res,
          'Invalid token type',
          'INVALID_TOKEN_TYPE',
          401
        );
      }

      // Attach user info to request
      req.user = decoded;
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return ResponseHandler.error(
          res,
          'Token expired',
          'TOKEN_EXPIRED',
          401
        );
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return ResponseHandler.error(
          res,
          'Invalid token',
          'INVALID_TOKEN',
          401
        );
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Set tenant context for database queries
 */
export const setTenant = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const organizationId = req.user?.organizationId;

  if (!organizationId) {
    return ResponseHandler.error(
      res,
      'Organization context required',
      'NO_TENANT_CONTEXT',
      403
    );
  }

  // The organizationId will be used by the repository pattern
  // and passed to database queries for tenant isolation
  next();
};

/**
 * Check if user has required permission
 */
export const requirePermission = (...requiredPermissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return ResponseHandler.error(
        res,
        'Authentication required',
        'UNAUTHORIZED',
        401
      );
    }

    const userPermissions = req.user.permissions || [];

    // Check for wildcard permission (admin/owner)
    if (userPermissions.includes('*')) {
      return next();
    }

    // Check each required permission
    const hasPermission = requiredPermissions.some(permission => {
      // Exact match
      if (userPermissions.includes(permission)) {
        return true;
      }

      // Wildcard match (e.g., 'products.*' matches 'products.create')
      const [resource, action] = permission.split('.');
      if (userPermissions.includes(`${resource}.*`)) {
        return true;
      }

      return false;
    });

    if (!hasPermission) {
      return ResponseHandler.error(
        res,
        'Insufficient permissions',
        'FORBIDDEN',
        403,
        {
          required: requiredPermissions,
          provided: userPermissions
        }
      );
    }

    next();
  };
};

/**
 * Check if user has specific role
 */
export const requireRole = (...allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return ResponseHandler.error(
        res,
        'Authentication required',
        'UNAUTHORIZED',
        401
      );
    }

    const userRole = req.user.role;

    if (!allowedRoles.includes(userRole)) {
      return ResponseHandler.error(
        res,
        `Required role: ${allowedRoles.join(' or ')}`,
        'FORBIDDEN',
        403
      );
    }

    next();
  };
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    ) as TokenPayload;

    if (decoded.type === 'access') {
      req.user = decoded;
    }
  } catch (error) {
    // Silently fail for optional auth
  }

  next();
};

/**
 * Verify that the resource belongs to the user's organization
 */
export const verifyResourceOwnership = (
  resourceOrgIdGetter: (req: Request) => string | undefined
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userOrgId = req.user?.organizationId;
    const resourceOrgId = resourceOrgIdGetter(req);

    if (!userOrgId || !resourceOrgId) {
      return ResponseHandler.error(
        res,
        'Invalid request',
        'INVALID_REQUEST',
        400
      );
    }

    if (userOrgId !== resourceOrgId) {
      return ResponseHandler.error(
        res,
        'Access denied',
        'FORBIDDEN',
        403
      );
    }

    next();
  };
};
