import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../index';
import { db } from '../../common/database';

describe('Authentication System', () => {
  let testUserId: string;
  let testOrgId: string;
  let accessToken: string;
  let refreshToken: string;

  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'SecureP@ss123',
    fullName: 'Test User',
    organizationName: 'Test Organization',
    businessType: 'retail'
  };

  // ============================================================================
  // REGISTRATION TESTS
  // ============================================================================

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe(testUser.email.toLowerCase());

      // Save for later tests
      testUserId = response.body.data.user.id;
      testOrgId = response.body.data.user.organizationId;
      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    it('should reject duplicate email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...testUser,
          email: `weak-${Date.now()}@example.com`,
          password: 'weak'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...testUser,
          email: 'invalid-email'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `missing-${Date.now()}@example.com`
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================================
  // LOGIN TESTS
  // ============================================================================

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data.user.id).toBe(testUserId);
    });

    it('should reject incorrect password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject non-existent email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should lock account after multiple failed attempts', async () => {
      const wrongEmail = `locktest-${Date.now()}@example.com`;
      
      // First register
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...testUser,
          email: wrongEmail
        })
        .expect(201);

      // Try 5 failed logins
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: wrongEmail,
            password: 'WrongPassword123'
          });
      }

      // 6th attempt should be locked
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: wrongEmail,
          password: 'WrongPassword123'
        })
        .expect(423);

      expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
    });
  });

  // ============================================================================
  // TOKEN TESTS
  // ============================================================================

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh access token successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  // ============================================================================
  // PROTECTED ROUTE TESTS
  // ============================================================================

  describe('GET /api/v1/auth/me', () => {
    it('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testUserId);
      expect(response.body.data.email).toBe(testUser.email.toLowerCase());
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================================
  // PASSWORD RESET TESTS
  // ============================================================================

  describe('Password Reset', () => {
    let resetToken: string;

    it('should request password reset', async () => {
      const response = await request(app)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: testUser.email })
        .expect(200);

      expect(response.body.success).toBe(true);

      // In tests, we need to get the token from database
      const result = await db.query(
        "SELECT metadata->>'reset_token' as token FROM users WHERE id = $1",
        [testUserId]
      );
      resetToken = result.rows[0]?.token;
    });

    it('should reset password with valid token', async () => {
      if (!resetToken) {
        return; // Skip if token not available
      }

      const response = await request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          token: resetToken,
          password: 'NewSecureP@ss456'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should login with new password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'NewSecureP@ss456'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // RATE LIMITING TESTS
  // ============================================================================

  describe('Rate Limiting', () => {
    it('should rate limit excessive requests', async () => {
      const testEmail = `rate-${Date.now()}@example.com`;

      // Make multiple rapid requests
      const requests = [];
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app)
            .post('/api/v1/auth/login')
            .send({
              email: testEmail,
              password: 'WrongPassword123'
            })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);

      expect(rateLimited).toBe(true);
    });
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
      await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    if (testOrgId) {
      await db.query('DELETE FROM organizations WHERE id = $1', [testOrgId]);
    }
  });
});

// ============================================================================
// PERMISSION TESTS
// ============================================================================

describe('Permission System', () => {
  let ownerToken: string;
  let staffToken: string;
  let orgId: string;

  beforeAll(async () => {
    // Create owner account
    const ownerResponse = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `owner-${Date.now()}@example.com`,
        password: 'OwnerP@ss123',
        fullName: 'Owner User',
        organizationName: 'Permission Test Org',
        businessType: 'retail'
      });

    ownerToken = ownerResponse.body.data.accessToken;
    orgId = ownerResponse.body.data.user.organizationId;

    // TODO: Create a staff user and get their token
    // This would require implementing user invitation/creation endpoint
  });

  it('should allow owner to access all resources', async () => {
    const response = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  it('should reject unauthorized access', async () => {
    const response = await request(app)
      .get('/api/v1/products')
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
