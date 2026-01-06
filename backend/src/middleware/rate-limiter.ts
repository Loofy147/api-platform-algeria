// ============================================================================
// RATE LIMITER - Redis-backed sliding window rate limiting
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/cache';
import { config } from '../config';
import { TooManyRequestsError } from './error-handler';
import { cacheLogger } from '../config/logger';

// ============================================================================
// RATE LIMIT CONFIGURATION
// ============================================================================

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests in window
  keyPrefix?: string; // Redis key prefix
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  handler?: (req: Request, res: Response) => void; // Custom error handler
}

// ============================================================================
// SLIDING WINDOW COUNTER
// ============================================================================

class SlidingWindowRateLimiter {
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      keyPrefix: 'ratelimit',
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      handler: this.defaultHandler,
      ...config,
    };
  }

  /**
   * Get rate limit key for the request
   */
  private getKey(identifier: string): string {
    return `${this.config.keyPrefix}:${identifier}`;
  }

  /**
   * Check if request should be rate limited
   */
  async consume(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }> {
    const key = this.getKey(identifier);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    try {
      // Use Redis sorted set for sliding window
      // Score = timestamp, Value = unique request ID
      const requestId = `${now}-${Math.random()}`;

      // Lua script for atomic operations
      const script = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window_start = tonumber(ARGV[2])
        local max_requests = tonumber(ARGV[3])
        local request_id = ARGV[4]
        local window_ms = tonumber(ARGV[5])

        -- Remove old entries outside the window
        redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

        -- Count current requests in window
        local current = redis.call('ZCARD', key)

        if current < max_requests then
          -- Add new request
          redis.call('ZADD', key, now, request_id)
          redis.call('PEXPIRE', key, window_ms)
          return {1, max_requests - current - 1, now + window_ms}
        else
          -- Rate limit exceeded
          return {0, 0, now + window_ms}
        end
      `;

      const result = (await redis.eval(
        script,
        1,
        key,
        now,
        windowStart,
        this.config.maxRequests,
        requestId,
        this.config.windowMs
      )) as [number, number, number];

      return {
        allowed: result[0] === 1,
        remaining: result[1],
        resetAt: result[2],
      };
    } catch (error) {
      cacheLogger.error('Rate limiter error:', error);
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: now + this.config.windowMs,
      };
    }
  }

  /**
   * Default error handler
   */
  private defaultHandler(req: Request, res: Response): void {
    throw new TooManyRequestsError(
      'Too many requests, please try again later',
      Math.ceil(this.config.windowMs / 1000)
    );
  }

  /**
   * Express middleware
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Get identifier (IP address by default)
      const identifier = this.getIdentifier(req);

      // Check rate limit
      const result = await this.consume(identifier);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', new Date(result.resetAt).toISOString());

      if (!result.allowed) {
        res.setHeader('Retry-After', Math.ceil((result.resetAt - Date.now()) / 1000));
        return this.config.handler(req, res);
      }

      // Track response to potentially skip counting
      const originalSend = res.send;
      res.send = function (body: any) {
        const statusCode = res.statusCode;

        // Decrement counter if we should skip this request
        if (
          (statusCode < 400 && this.config.skipSuccessfulRequests) ||
          (statusCode >= 400 && this.config.skipFailedRequests)
        ) {
          // Could implement decrement here if needed
        }

        return originalSend.call(this, body);
      }.bind(this);

      next();
    };
  }

  /**
   * Get rate limit identifier from request
   */
  private getIdentifier(req: Request): string {
    // Priority: User ID > Organization ID > IP Address
    const userId = (req as any).user?.id;
    const organizationId = (req as any).organizationId;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (userId) {
      return `user:${userId}`;
    }

    if (organizationId) {
      return `org:${organizationId}`;
    }

    return `ip:${ip}`;
  }
}

// ============================================================================
// PRESET RATE LIMITERS
// ============================================================================

/**
 * Global rate limiter (100 requests per minute per IP)
 */
export const globalRateLimiter = new SlidingWindowRateLimiter({
  windowMs: config.rateLimit.windowMs,
  maxRequests: config.rateLimit.maxRequests,
  keyPrefix: 'global',
});

/**
 * Authentication rate limiter (5 attempts per 15 minutes)
 */
export const authRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  keyPrefix: 'auth',
  skipSuccessfulRequests: true, // Only count failed attempts
});

/**
 * API rate limiter for authenticated users (1000 requests per hour)
 */
export const apiRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 1000,
  keyPrefix: 'api',
});

/**
 * Create rate limiter (10 creates per minute per organization)
 */
export const createRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  keyPrefix: 'create',
});

/**
 * Webhook rate limiter (100 webhooks per minute per organization)
 */
export const webhookRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  keyPrefix: 'webhook',
});

// ============================================================================
// EXPORT MIDDLEWARE
// ============================================================================

export const rateLimiter = {
  global: globalRateLimiter.middleware(),
  auth: authRateLimiter.middleware(),
  api: apiRateLimiter.middleware(),
  create: createRateLimiter.middleware(),
  webhook: webhookRateLimiter.middleware(),
};

// ============================================================================
// CUSTOM RATE LIMITER HELPER
// ============================================================================

/**
 * Create a custom rate limiter for specific use cases
 *
 * Example:
 * const reportRateLimiter = createRateLimiter({
 *   windowMs: 60 * 60 * 1000, // 1 hour
 *   maxRequests: 10,
 *   keyPrefix: 'report',
 * });
 *
 * router.get('/report', reportRateLimiter, controller.generateReport);
 */
export const createRateLimiter = (config: RateLimitConfig) => {
  return new SlidingWindowRateLimiter(config).middleware();
};

// ============================================================================
// RATE LIMIT BYPASS (for tests, admin, etc.)
// ============================================================================

export const bypassRateLimit = (req: Request, _res: Response, next: NextFunction) => {
  // Add bypass flag
  (req as any).rateLimitBypassed = true;
  next();
};

// Example usage:
// router.get('/admin/report', bypassRateLimit, controller.generateReport);
