import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { ResponseHandler } from '../common/responses';

// Redis client for rate limiting
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false
});

redis.on('error', (err) => {
  console.error('Redis rate limiter error:', err);
});

interface RateLimiterOptions {
  windowMs: number;      // Time window in milliseconds
  max: number;           // Max requests per window
  keyPrefix?: string;    // Redis key prefix
  skipFailedRequests?: boolean; // Don't count failed requests
  skipSuccessfulRequests?: boolean; // Don't count successful requests
}

/**
 * Redis-based rate limiter middleware
 * Uses sliding window algorithm for accurate rate limiting
 */
export const rateLimiter = (options: RateLimiterOptions) => {
  const {
    windowMs,
    max,
    keyPrefix = 'rl:',
    skipFailedRequests = false,
    skipSuccessfulRequests = false
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get identifier (IP or user ID if authenticated)
      const identifier = (req as any).user?.userId || req.ip || 'unknown';
      const key = `${keyPrefix}${identifier}:${req.path}`;

      const now = Date.now();
      const windowStart = now - windowMs;

      // Remove old entries and count current requests using Redis transaction
      const pipeline = redis.pipeline();
      
      // Remove entries outside the window
      pipeline.zremrangebyscore(key, 0, windowStart);
      
      // Count requests in current window
      pipeline.zcard(key);
      
      // Execute pipeline
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Redis pipeline failed');
      }

      const currentCount = results[1][1] as number;

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', max.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - currentCount).toString());
      res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

      // Check if limit exceeded
      if (currentCount >= max) {
        const retryAfter = Math.ceil((windowStart + windowMs - now) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());

        return ResponseHandler.error(
          res,
          'Too many requests, please try again later',
          'RATE_LIMIT_EXCEEDED',
          429,
          {
            retryAfter,
            limit: max,
            window: `${windowMs / 1000}s`
          }
        );
      }

      // Add current request to the window
      await redis.zadd(key, now, `${now}:${Math.random()}`);
      
      // Set expiry on the key
      await redis.expire(key, Math.ceil(windowMs / 1000));

      // Track response to potentially not count failed/successful requests
      if (skipFailedRequests || skipSuccessfulRequests) {
        const originalSend = res.send;
        res.send = function (data: any) {
          const statusCode = res.statusCode;
          
          const shouldRemove = 
            (skipFailedRequests && statusCode >= 400) ||
            (skipSuccessfulRequests && statusCode < 400);

          if (shouldRemove) {
            // Remove the request we just added
            redis.zremrangebyscore(key, now, now).catch(err => {
              console.error('Failed to remove rate limit entry:', err);
            });
          }

          return originalSend.call(this, data);
        };
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      // On error, allow the request through (fail open)
      next();
    }
  };
};

/**
 * Global rate limiter for all routes
 */
export const globalRateLimiter = rateLimiter({
  windowMs: 60 * 1000,    // 1 minute
  max: 100,               // 100 requests per minute per IP
  keyPrefix: 'rl:global:'
});

/**
 * Strict rate limiter for sensitive routes
 */
export const strictRateLimiter = rateLimiter({
  windowMs: 60 * 1000,    // 1 minute
  max: 5,                 // 5 requests per minute
  keyPrefix: 'rl:strict:',
  skipSuccessfulRequests: true  // Only count failed attempts
});

/**
 * IP-based rate limiter to prevent abuse
 */
export const ipRateLimiter = (maxPerWindow: number = 1000) => rateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: maxPerWindow,
  keyPrefix: 'rl:ip:'
});

/**
 * Clean up rate limiter resources
 */
export const closeRateLimiter = async () => {
  await redis.quit();
};
