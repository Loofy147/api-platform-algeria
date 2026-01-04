import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../../common/database';
import crypto from 'crypto';

interface TokenPayload {
  userId: string;
  organizationId: string;
  role: string;
  permissions: string[];
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  private static readonly ACCESS_TOKEN_EXPIRY = '15m';
  private static readonly REFRESH_TOKEN_EXPIRY = '7d';
  private static readonly SALT_ROUNDS = 12;
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  /**
   * Register new user with organization
   */
  static async register(data: {
    email: string;
    password: string;
    fullName: string;
    organizationName: string;
    businessType: string;
  }) {
    // Validate password strength
    this.validatePassword(data.password);

    return await db.transaction(async (client) => {
      // Check if email exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
        [data.email]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('Email already registered');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, this.SALT_ROUNDS);

      // Create organization
      const orgSlug = data.organizationName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const orgResult = await client.query(
        `INSERT INTO organizations (name, slug, business_type, subscription_tier, subscription_status)
         VALUES ($1, $2, $3, 'trial', 'active')
         RETURNING id`,
        [data.organizationName, `${orgSlug}-${Date.now()}`, data.businessType]
      );

      const organizationId = orgResult.rows[0].id;

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, is_active, email_verified_at)
         VALUES ($1, $2, $3, TRUE, NOW())
         RETURNING id, email, full_name`,
        [data.email.toLowerCase(), passwordHash, data.fullName]
      );

      const user = userResult.rows[0];

      // Add user as organization owner
      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, role, joined_at, is_active)
         VALUES ($1, $2, 'owner', NOW(), TRUE)`,
        [organizationId, user.id]
      );

      // Create default location
      await client.query(
        `INSERT INTO locations (organization_id, name, code, is_active)
         VALUES ($1, 'Main Location', 'MAIN', TRUE)`,
        [organizationId]
      );

      // Generate tokens
      const tokens = await this.generateTokens({
        userId: user.id,
        organizationId,
        role: 'owner',
        permissions: ['*']
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          organizationId
        },
        ...tokens
      };
    });
  }

  /**
   * Login user
   */
  static async login(email: string, password: string, ip?: string) {
    const userResult = await db.query(
      `SELECT u.id, u.email, u.full_name, u.password_hash, u.is_active, 
              u.failed_login_attempts, u.locked_until
       FROM users u
       WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL`,
      [email]
    );

    const user = userResult.rows[0];

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60000
      );
      throw new Error(`Account locked. Try again in ${minutesLeft} minutes`);
    }

    // Check if account is active
    if (!user.is_active) {
      throw new Error('Account is inactive');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      // Increment failed attempts
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const lockoutTime = failedAttempts >= this.MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + this.LOCKOUT_DURATION)
        : null;

      await db.query(
        `UPDATE users 
         SET failed_login_attempts = $1, locked_until = $2
         WHERE id = $3`,
        [failedAttempts, lockoutTime, user.id]
      );

      if (lockoutTime) {
        throw new Error('Too many failed attempts. Account locked for 15 minutes');
      }

      throw new Error('Invalid credentials');
    }

    // Get organization membership
    const memberResult = await db.query(
      `SELECT om.organization_id, om.role, om.permissions
       FROM organization_members om
       WHERE om.user_id = $1 AND om.is_active = TRUE
       LIMIT 1`,
      [user.id]
    );

    if (memberResult.rows.length === 0) {
      throw new Error('No active organization membership');
    }

    const member = memberResult.rows[0];

    // Reset failed attempts and update last login
    await db.query(
      `UPDATE users 
       SET failed_login_attempts = 0, locked_until = NULL, 
           last_login_at = NOW(), last_login_ip = $1
       WHERE id = $2`,
      [ip, user.id]
    );

    // Generate tokens
    const tokens = await this.generateTokens({
      userId: user.id,
      organizationId: member.organization_id,
      role: member.role,
      permissions: this.getPermissionsForRole(member.role, member.permissions)
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        organizationId: member.organization_id,
        role: member.role
      },
      ...tokens
    };
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || 'refresh-secret-key'
      ) as TokenPayload & { type: string };

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Verify user still exists and is active
      const userResult = await db.query(
        'SELECT id FROM users WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found or inactive');
      }

      return await this.generateTokens({
        userId: decoded.userId,
        organizationId: decoded.organizationId,
        role: decoded.role,
        permissions: decoded.permissions
      });
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Generate access and refresh tokens
   */
  private static async generateTokens(payload: TokenPayload): Promise<AuthTokens> {
    const accessToken = jwt.sign(
      { ...payload, type: 'access' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: this.ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || 'refresh-secret-key',
      { expiresIn: this.REFRESH_TOKEN_EXPIRY }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60 // 15 minutes in seconds
    };
  }

  /**
   * Get permissions for role
   */
  private static getPermissionsForRole(role: string, customPermissions?: any): string[] {
    const rolePermissions: Record<string, string[]> = {
      owner: ['*'],
      admin: ['*'],
      manager: [
        'products.*', 'sales.*', 'inventory.*', 
        'shifts.*', 'users.read', 'reports.read'
      ],
      supervisor: [
        'products.read', 'sales.*', 'inventory.read', 
        'shifts.*', 'reports.read'
      ],
      staff: [
        'products.read', 'sales.create', 'sales.read', 
        'inventory.read', 'shifts.manage_own'
      ],
      viewer: ['*.read']
    };

    const basePermissions = rolePermissions[role] || [];
    
    if (customPermissions && typeof customPermissions === 'object') {
      return [...basePermissions, ...Object.keys(customPermissions).filter(k => customPermissions[k])];
    }

    return basePermissions;
  }

  /**
   * Validate password strength
   */
  private static validatePassword(password: string): void {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpper || !hasLower || !hasNumber) {
      throw new Error('Password must contain uppercase, lowercase, and numbers');
    }
  }

  /**
   * Generate password reset token
   */
  static async requestPasswordReset(email: string): Promise<string> {
    const userResult = await db.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
      [email]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal if email exists
      return 'If email exists, reset link sent';
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    await db.query(
      `UPDATE users 
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb), 
         '{reset_token}', 
         to_jsonb($1::text)
       ),
       metadata = jsonb_set(
         metadata, 
         '{reset_token_expires}', 
         to_jsonb($2::text)
       )
       WHERE id = $3`,
      [hashedToken, expiresAt.toISOString(), userResult.rows[0].id]
    );

    // In production, send email with token
    return token;
  }

  /**
   * Reset password with token
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    this.validatePassword(newPassword);

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const userResult = await db.query(
      `SELECT id FROM users 
       WHERE metadata->>'reset_token' = $1 
       AND (metadata->>'reset_token_expires')::timestamptz > NOW()
       AND deleted_at IS NULL`,
      [hashedToken]
    );

    if (userResult.rows.length === 0) {
      throw new Error('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    await db.query(
      `UPDATE users 
       SET password_hash = $1,
       metadata = metadata - 'reset_token' - 'reset_token_expires'
       WHERE id = $2`,
      [passwordHash, userResult.rows[0].id]
    );
  }
}
