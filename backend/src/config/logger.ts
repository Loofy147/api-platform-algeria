// ============================================================================
// LOGGER - Production-grade structured logging with Pino
// ============================================================================

import pino from 'pino';
import pinoHttp from 'pino-http';
import { config } from './index';

// ============================================================================
// BASE LOGGER
// ============================================================================

export const logger = pino({
  level: config.logLevel,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }),
});

// ============================================================================
// HTTP LOGGER MIDDLEWARE
// ============================================================================

export const httpLogger = pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'info';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      // Don't log headers in production (security)
      ...(config.isDevelopment && { headers: req.headers }),
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
  // Don't log health checks
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
});

// ============================================================================
// UTILITY LOGGERS
// ============================================================================

export const dbLogger = logger.child({ module: 'database' });
export const authLogger = logger.child({ module: 'auth' });
export const cacheLogger = logger.child({ module: 'cache' });
export const eventLogger = logger.child({ module: 'events' });

// ============================================================================
// LOG HELPER FUNCTIONS
// ============================================================================

export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error({
    err: error,
    ...context,
  });
};

export const logPerformance = (operation: string, durationMs: number, metadata?: Record<string, any>) => {
  logger.info({
    operation,
    durationMs,
    ...metadata,
  });
};

// ============================================================================
// PERFORMANCE TIMER
// ============================================================================

export const createTimer = (operation: string) => {
  const start = Date.now();

  return {
    end: (metadata?: Record<string, any>) => {
      const duration = Date.now() - start;
      logPerformance(operation, duration, metadata);
      return duration;
    },
  };
};

// Example usage:
// const timer = createTimer('fetch_products');
// const products = await productRepository.findAll();
// timer.end({ count: products.length });
