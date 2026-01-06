// ============================================================================
// AUTHENTICATION - JWT-based authentication middleware
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { UnauthorizedError, ForbiddenError } from './error-handler';
import { authLogger } from '../config/logger';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface JwtPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

// ============================================================================
// TOKEN GENERATION
// ============================================================================

/**
 * Generate access token (short-lived)
 */
export const generateAccessToken = (userId: string, email: string): string => {
  const payload: JwtPayload = {
    userId,
    email,
    type: 'access',
  };

  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  });
};

/**
 * Generate refresh token (long-lived)
 */
export const generateRefreshToken = (userId: string, email: string): string => {
  const payload: JwtPayload = {
    userId,
    email,
    type: 'refresh',
  };

  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
};

/**
 * Generate both tokens
 */
export const generateTokenPair = (userId: string, email: string) => {
  return {
    accessToken: generateAccessToken(userId, email),
    refreshToken: generateRefreshToken(userId, email),
    expiresIn: config.jwt.accessExpiresIn,
  };
};

// ============================================================================
// TOKEN VERIFICATION
// ============================================================================

/**
 * Verify access token
 */
export const verifyAccessToken = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;

    if (decoded.type !== 'access') {
      throw new UnauthorizedError('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid access token');
    }
    throw error;
  }
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;

    if (decoded.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    throw error;
  }
};

// ============================================================================
// PASSWORD HASHING
// ============================================================================

/**
 * Hash password
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, config.security.bcryptRounds);
};

/**
 * Verify password
 */
export const verifyPassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

/**
 * Validate password strength
 */
export const validatePasswordStrength = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password.length < config.security.passwordMinLength) {
    errors.push(`Password must be at least ${config.security.passwordMinLength} characters long`);
  }

  if (config.security.requirePasswordComplexity) {
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Extract token from request headers
 */
const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};

/**
 * Main authentication middleware
 * Verifies JWT token and attaches user to request
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract token
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError('No authentication token provided');
    }

    // Verify token
    const decoded = verifyAccessToken(token);

    // TODO: Verify user exists and is active in database
    // const user = await db('users').where({ id: decoded.userId, is_active: true }).first();
    // if (!user) {
    //   throw new UnauthorizedError('User not found or inactive');
    // }

    // Attach user to request
    (req as AuthenticatedRequest).user = {
      id: decoded.userId,
      email: decoded.email,
      fullName: 'User Name', // TODO: Get from database
    };

    authLogger.debug('User authenticated', {
      userId: decoded.userId,
      email: decoded.email,
    });

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication (doesn't throw if no token)
 * Useful for endpoints that have different behavior for authenticated users
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);

    if (token) {
      const decoded = verifyAccessToken(token);

      (req as AuthenticatedRequest).user = {
        id: decoded.userId,
        email: decoded.email,
        fullName: 'User Name', // TODO: Get from database
      };
    }

    next();
  } catch (error) {
    // Don't throw, just continue without user
    next();
  }
};

// ============================================================================
// ROLE-BASED ACCESS CONTROL
// ============================================================================

export type UserRole = 'owner' | 'admin' | 'manager' | 'supervisor' | 'staff' | 'viewer';

/**
 * Require specific roles
 * Usage: router.post('/products', authenticate, requireRole(['admin', 'manager']), ...)
 */
export const requireRole = (allowedRoles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const organizationId = (req as any).organizationId;

      if (!user || !organizationId) {
        throw new UnauthorizedError('Authentication required');
      }

      // TODO: Get user's role from database
      // const membership = await db('organization_members')
      //   .where({ user_id: user.id, organization_id: organizationId, is_active: true })
      //   .first();
      //
      // if (!membership) {
      //   throw new ForbiddenError('Not a member of this organization');
      // }
      //
      // if (!allowedRoles.includes(membership.role)) {
      //   throw new ForbiddenError('Insufficient permissions');
      // }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Require specific permission
 * Usage: router.delete('/products/:id', authenticate, requirePermission('products.delete'), ...)
 */
export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const organizationId = (req as any).organizationId;

      if (!user || !organizationId) {
        throw new UnauthorizedError('Authentication required');
      }

      // TODO: Check permissions from database
      // const membership = await db('organization_members')
      //   .where({ user_id: user.id, organization_id: organizationId, is_active: true })
      //   .first();
      //
      // if (!membership) {
      //   throw new ForbiddenError('Not a member of this organization');
      // }
      //
      // const hasPermission = checkPermission(membership.role, membership.permissions, permission);
      //
      // if (!hasPermission) {
      //   throw new ForbiddenError(`Permission denied: ${permission}`);
      // }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// ============================================================================
// PERMISSION CHECKER (Helper function)
// ============================================================================

/**
 * Check if user has permission based on role and custom permissions
 */
export const checkPermission = (
  role: UserRole,
  customPermissions: Record<string, boolean>,
  requiredPermission: string
): boolean => {
  // Owner has all permissions
  if (role === 'owner') {
    return true;
  }

  // Check custom permissions first
  if (customPermissions[requiredPermission] !== undefined) {
    return customPermissions[requiredPermission];
  }

  // Role-based permissions
  const rolePermissions: Record<UserRole, string[]> = {
    owner: ['*'], // All permissions
    admin: [
      'products.*',
      'customers.*',
      'sales.*',
      'inventory.*',
      'reports.*',
      'users.read',
      'users.create',
      'users.update',
    ],
    manager: [
      'products.*',
      'customers.*',
      'sales.*',
      'inventory.read',
      'inventory.update',
      'reports.read',
    ],
    supervisor: ['products.read', 'customers.*', 'sales.*', 'inventory.read', 'reports.read'],
    staff: ['products.read', 'customers.read', 'sales.create', 'sales.read'],
    viewer: ['products.read', 'customers.read', 'sales.read', 'inventory.read', 'reports.read'],
  };

  const permissions = rolePermissions[role] || [];

  // Check wildcard permissions
  if (permissions.includes('*')) {
    return true;
  }

  // Check exact permission
  if (permissions.includes(requiredPermission)) {
    return true;
  }

  // Check wildcard module permissions (e.g., 'products.*' matches 'products.read')
  const [module] = requiredPermission.split('.');
  if (permissions.includes(`${module}.*`)) {
    return true;
  }

  return false;
};

// ============================================================================
// ACCOUNT LOCKOUT (Security)
// ============================================================================

/**
 * Record failed login attempt
 * Returns true if account should be locked
 */
export const recordFailedLogin = async (userId: string): Promise<boolean> => {
  // TODO: Implement with database
  // const user = await db('users').where({ id: userId }).first();
  // const attempts = user.failed_login_attempts + 1;
  //
  // if (attempts >= config.security.maxLoginAttempts) {
  //   const lockoutUntil = new Date(Date.now() + config.security.lockoutDurationMinutes * 60 * 1000);
  //   await db('users').where({ id: userId }).update({
  //     failed_login_attempts: attempts,
  //     locked_until: lockoutUntil,
  //   });
  //   return true;
  // }
  //
  // await db('users').where({ id: userId }).update({ failed_login_attempts: attempts });
  return false;
};

/**
 * Reset failed login attempts
 */
export const resetFailedLogins = async (userId: string): Promise<void> => {
  // TODO: Implement with database
  // await db('users').where({ id: userId }).update({
  //   failed_login_attempts: 0,
  //   locked_until: null,
  // });
};

/**
 * Check if account is locked
 */
export const isAccountLocked = async (userId: string): Promise<boolean> => {
  // TODO: Implement with database
  // const user = await db('users').where({ id: userId }).first();
  // if (!user.locked_until) return false;
  // return new Date() < new Date(user.locked_until);
  return false;
};
