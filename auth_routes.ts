import { Router } from 'express';
import { AuthService } from './auth.service';
import { validateRequest } from '../../middleware/validation';
import { 
  registerSchema, 
  loginSchema, 
  refreshTokenSchema,
  passwordResetRequestSchema,
  passwordResetSchema 
} from './auth.validation';
import { ResponseHandler } from '../../common/responses';
import { rateLimiter } from '../../middleware/rateLimiter';

const router = Router();

/**
 * POST /api/v1/auth/register
 * Register new user with organization
 */
router.post(
  '/register',
  rateLimiter({ windowMs: 60000, max: 5 }), // 5 requests per minute
  validateRequest(registerSchema),
  async (req, res, next) => {
    try {
      const result = await AuthService.register(req.body);
      
      ResponseHandler.success(res, {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn
      }, 201, {
        message: 'Registration successful'
      });
    } catch (error) {
      if ((error as Error).message.includes('already registered')) {
        return ResponseHandler.error(
          res,
          'Email already registered',
          'EMAIL_EXISTS',
          409
        );
      }
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/login
 * Login user
 */
router.post(
  '/login',
  rateLimiter({ windowMs: 60000, max: 10 }), // 10 requests per minute
  validateRequest(loginSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const ip = req.ip || req.socket.remoteAddress;
      
      const result = await AuthService.login(email, password, ip);
      
      ResponseHandler.success(res, {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn
      });
    } catch (error) {
      const message = (error as Error).message;
      
      if (message.includes('locked')) {
        return ResponseHandler.error(
          res,
          message,
          'ACCOUNT_LOCKED',
          423
        );
      }
      
      if (message.includes('Invalid credentials') || message.includes('inactive')) {
        return ResponseHandler.error(
          res,
          'Invalid email or password',
          'INVALID_CREDENTIALS',
          401
        );
      }
      
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/refresh
 * Refresh access token
 */
router.post(
  '/refresh',
  rateLimiter({ windowMs: 60000, max: 20 }), // 20 requests per minute
  validateRequest(refreshTokenSchema),
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      const tokens = await AuthService.refreshToken(refreshToken);
      
      ResponseHandler.success(res, tokens);
    } catch (error) {
      return ResponseHandler.error(
        res,
        'Invalid or expired refresh token',
        'INVALID_REFRESH_TOKEN',
        401
      );
    }
  }
);

/**
 * POST /api/v1/auth/password-reset/request
 * Request password reset
 */
router.post(
  '/password-reset/request',
  rateLimiter({ windowMs: 60000, max: 3 }), // 3 requests per minute
  validateRequest(passwordResetRequestSchema),
  async (req, res, next) => {
    try {
      const { email } = req.body;
      await AuthService.requestPasswordReset(email);
      
      // Always return success to prevent email enumeration
      ResponseHandler.success(res, {
        message: 'If email exists, password reset link has been sent'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/password-reset/confirm
 * Reset password with token
 */
router.post(
  '/password-reset/confirm',
  rateLimiter({ windowMs: 60000, max: 5 }), // 5 requests per minute
  validateRequest(passwordResetSchema),
  async (req, res, next) => {
    try {
      const { token, password } = req.body;
      await AuthService.resetPassword(token, password);
      
      ResponseHandler.success(res, {
        message: 'Password reset successful'
      });
    } catch (error) {
      if ((error as Error).message.includes('Invalid or expired')) {
        return ResponseHandler.error(
          res,
          'Invalid or expired reset token',
          'INVALID_RESET_TOKEN',
          400
        );
      }
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/logout
 * Logout user (client-side token removal, optional server-side token blacklist)
 */
router.post('/logout', async (req, res) => {
  // In a production system, you might want to:
  // 1. Blacklist the token in Redis
  // 2. Clear any server-side sessions
  // For JWT, logout is primarily client-side
  
  ResponseHandler.success(res, {
    message: 'Logged out successfully'
  });
});

/**
 * GET /api/v1/auth/me
 * Get current user profile
 */
router.get('/me', async (req, res, next) => {
  try {
    const userId = (req as any).user?.userId;
    
    if (!userId) {
      return ResponseHandler.error(
        res,
        'Not authenticated',
        'NOT_AUTHENTICATED',
        401
      );
    }
    
    const { db } = await import('../../common/database');
    const result = await db.query(
      `SELECT u.id, u.email, u.full_name, u.avatar_url, u.preferred_language,
              om.organization_id, om.role, o.name as organization_name
       FROM users u
       JOIN organization_members om ON u.id = om.user_id AND om.is_active = TRUE
       JOIN organizations o ON om.organization_id = o.id
       WHERE u.id = $1 AND u.deleted_at IS NULL
       LIMIT 1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return ResponseHandler.error(
        res,
        'User not found',
        'USER_NOT_FOUND',
        404
      );
    }
    
    ResponseHandler.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
