// ============================================================================
// HEALTH CHECK ROUTES - System monitoring endpoints
// ============================================================================

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { checkDatabaseConnection } from '../../config/database';
import { checkRedisConnection } from '../../config/cache';

const router = Router();

// ============================================================================
// BASIC HEALTH CHECK
// ============================================================================

/**
 * GET /health
 * Simple health check - returns 200 if server is running
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
    });
  })
);

// ============================================================================
// DETAILED HEALTH CHECK
// ============================================================================

/**
 * GET /health/detailed
 * Comprehensive health check with all dependencies
 */
router.get(
  '/detailed',
  asyncHandler(async (_req: Request, res: Response) => {
    const [databaseHealthy, cacheHealthy] = await Promise.all([
      checkDatabaseConnection(),
      checkRedisConnection(),
    ]);

    const healthy = databaseHealthy && cacheHealthy;

    const health = {
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      services: {
        api: {
          status: 'operational',
          responseTime: process.hrtime(),
        },
        database: {
          status: databaseHealthy ? 'operational' : 'down',
        },
        cache: {
          status: cacheHealthy ? 'operational' : 'down',
        },
      },
      system: {
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external,
        },
        cpu: process.cpuUsage(),
      },
    };

    // Return 503 if any service is down
    const statusCode = healthy ? 200 : 503;

    res.status(statusCode).json(health);
  })
);

// ============================================================================
// READINESS CHECK (Kubernetes/Docker)
// ============================================================================

/**
 * GET /health/ready
 * Readiness probe - checks if app is ready to serve traffic
 */
router.get(
  '/ready',
  asyncHandler(async (_req: Request, res: Response) => {
    const [databaseReady, cacheReady] = await Promise.all([
      checkDatabaseConnection(),
      checkRedisConnection(),
    ]);

    const ready = databaseReady && cacheReady;

    if (ready) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready' });
    }
  })
);

// ============================================================================
// LIVENESS CHECK (Kubernetes/Docker)
// ============================================================================

/**
 * GET /health/live
 * Liveness probe - checks if app is alive (but may not be ready)
 */
router.get('/live', (_req: Request, res: Response) => {
  res.json({ status: 'alive' });
});

// ============================================================================
// METRICS (Prometheus format)
// ============================================================================

/**
 * GET /health/metrics
 * Basic metrics in Prometheus format
 */
router.get('/metrics', (_req: Request, res: Response) => {
  const metrics = `
# HELP nodejs_process_uptime_seconds Process uptime in seconds
# TYPE nodejs_process_uptime_seconds counter
nodejs_process_uptime_seconds ${process.uptime()}

# HELP nodejs_memory_heap_used_bytes Heap used in bytes
# TYPE nodejs_memory_heap_used_bytes gauge
nodejs_memory_heap_used_bytes ${process.memoryUsage().heapUsed}

# HELP nodejs_memory_heap_total_bytes Heap total in bytes
# TYPE nodejs_memory_heap_total_bytes gauge
nodejs_memory_heap_total_bytes ${process.memoryUsage().heapTotal}

# HELP nodejs_memory_external_bytes External memory in bytes
# TYPE nodejs_memory_external_bytes gauge
nodejs_memory_external_bytes ${process.memoryUsage().external}
  `.trim();

  res.set('Content-Type', 'text/plain');
  res.send(metrics);
});

export default router;
