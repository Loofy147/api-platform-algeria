import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import pino from 'pino-http';
import { globalRateLimiter, ipRateLimiter } from './middleware/rateLimiter';
import { sanitizeRequest } from './middleware/validation';
import { errorHandler } from './middleware/error';
import v1Routes from './v1';
import authRoutes from './v1/auth/auth.routes';

dotenv.config();

const app = express();
const isDevelopment = process.env.NODE_ENV === 'development';

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Helmet - Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true
}));

// CORS - Configure based on environment
const corsOptions = {
  origin: isDevelopment 
    ? '*' 
    : (process.env.ALLOWED_ORIGINS || '').split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Compression
app.use(compression());

// Body parsing with size limits
app.use(express.json({ 
  limit: '10mb',
  strict: true
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Request ID and logging
const logger = pino({
  redact: {
    paths: ['req.headers.authorization', 'req.body.password'],
    remove: true
  }
});

app.use(logger);

// Add request ID
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] as string || 
           `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ============================================================================
// RATE LIMITING
// ============================================================================

// Global rate limiter
app.use(globalRateLimiter);

// IP-based rate limiter (stricter for unauthenticated requests)
app.use(ipRateLimiter(1000)); // 1000 requests per 15 minutes per IP

// ============================================================================
// INPUT SANITIZATION
// ============================================================================

app.use(sanitizeRequest);

// ============================================================================
// HEALTH CHECK (No authentication required)
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health/ready', async (req, res) => {
  try {
    // Check database connection
    const { db } = await import('./common/database');
    await db.query('SELECT 1');
    
    res.json({ 
      status: 'ready',
      checks: {
        database: 'ok'
      }
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'not_ready',
      checks: {
        database: 'error'
      }
    });
  }
});

// ============================================================================
// API ROUTES
// ============================================================================

// Authentication routes (no /api prefix for auth)
app.use('/api/v1/auth', authRoutes);

// Main API routes
app.use('/api/v1', v1Routes);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id
    }
  });
});

// Global error handler
app.use(errorHandler);

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║  🏗️  NINA PROJECT - Business OS API          ║
║                                               ║
║  Server:      Running on port ${PORT}           ║
║  Environment: ${process.env.NODE_ENV || 'development'}                    ║
║  Time:        ${new Date().toISOString()}     ║
║                                               ║
║  Ready to accept requests                     ║
║                                               ║
╚═══════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');

    try {
      // Close database connections
      // Close Redis connections
      const { closeRateLimiter } = await import('./middleware/rateLimiter');
      await closeRateLimiter();
      
      console.log('Resources cleaned up');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to exit the process
  // process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

export default app;
