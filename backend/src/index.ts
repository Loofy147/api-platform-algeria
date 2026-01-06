// ============================================================================
// MAIN APPLICATION - Production-grade Express API
// ============================================================================

import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { config } from './config';
import { logger, httpLogger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { rateLimiter } from './middleware/rate-limiter';
import { authenticate } from './middleware/auth';
import { tenantContext } from './middleware/tenant-context';

// Import routes
import authRoutes from './routes/v1/auth.routes';
import healthRoutes from './routes/v1/health.routes';
import productRoutes from './routes/v1/products.routes';
import customerRoutes from './routes/v1/customers.routes';
import salesRoutes from './routes/v1/sales.routes';

// ============================================================================
// APPLICATION SETUP
// ============================================================================

const app: Application = express();

// ============================================================================
// SECURITY MIDDLEWARE (First Priority)
// ============================================================================

// Helmet - Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// CORS - Configure allowed origins
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (config.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-ID'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// ============================================================================
// GENERAL MIDDLEWARE
// ============================================================================

// Request logging
app.use(httpLogger);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Response compression
app.use(compression());

// Trust proxy (for rate limiting, IP detection behind reverse proxy)
app.set('trust proxy', 1);

// ============================================================================
// GLOBAL RATE LIMITING
// ============================================================================

app.use(rateLimiter.global);

// ============================================================================
// API ROUTES
// ============================================================================

// Health check (no auth required)
app.use('/health', healthRoutes);

// API v1 routes
const apiV1 = express.Router();

// Authentication routes (no auth required)
apiV1.use('/auth', authRoutes);

// Protected routes (require authentication)
apiV1.use('/products', authenticate, tenantContext, productRoutes);
apiV1.use('/customers', authenticate, tenantContext, customerRoutes);
apiV1.use('/sales', authenticate, tenantContext, salesRoutes);

// Mount API v1
app.use(`/api/${config.apiVersion}`, apiV1);

// API documentation redirect
app.get('/docs', (_req: Request, res: Response) => {
  res.redirect('/api/v1/docs');
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Business OS API',
    version: config.apiVersion,
    status: 'operational',
    documentation: '/docs',
    health: '/health',
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received, starting graceful shutdown...`);

  server.close(() => {
    logger.info('HTTP server closed');

    // Close database connections
    // db.destroy() - implement when adding database pool

    // Close Redis connection
    // redis.quit() - implement when adding Redis

    logger.info('All connections closed, exiting...');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// ============================================================================
// START SERVER
// ============================================================================

const server = app.listen(config.port, () => {
  logger.info(`🚀 Server running on port ${config.port}`);
  logger.info(`📍 Environment: ${config.nodeEnv}`);
  logger.info(`🔒 Security: Enabled`);
  logger.info(`📊 API Version: ${config.apiVersion}`);
  logger.info(`🌐 CORS Origins: ${config.allowedOrigins.join(', ')}`);
});

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('unhandledRejection', (reason: Error) => {
  logger.error('Unhandled Promise Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

export default app;
