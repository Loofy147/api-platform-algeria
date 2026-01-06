// ============================================================================
// ERROR HANDLER - Centralized error handling middleware
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

// ============================================================================
// CUSTOM ERROR CLASSES
// ============================================================================

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad Request', details?: any) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429, 'TOO_MANY_REQUESTS', { retryAfter });
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_SERVER_ERROR');
  }
}

// ============================================================================
// ERROR RESPONSE FORMATTER
// ============================================================================

interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    details?: any;
    stack?: string;
  };
}

const formatErrorResponse = (error: AppError, includeStack: boolean = false): ErrorResponse => {
  const response: ErrorResponse = {
    error: {
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      statusCode: error.statusCode,
    },
  };

  if (error.details) {
    response.error.details = error.details;
  }

  if (includeStack && error.stack) {
    response.error.stack = error.stack;
  }

  return response;
};

// ============================================================================
// ZOD VALIDATION ERROR HANDLER
// ============================================================================

const handleZodError = (error: ZodError): ValidationError => {
  const details = error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));

  return new ValidationError('Validation failed', details);
};

// ============================================================================
// DATABASE ERROR HANDLER
// ============================================================================

const handleDatabaseError = (error: any): AppError => {
  // PostgreSQL error codes
  const pgErrorCodes: Record<string, () => AppError> = {
    '23505': () => new ConflictError('A record with this value already exists', {
      constraint: error.constraint,
    }),
    '23503': () => new BadRequestError('Referenced record does not exist', {
      constraint: error.constraint,
    }),
    '23502': () => new BadRequestError('Required field is missing', {
      column: error.column,
    }),
    '22P02': () => new BadRequestError('Invalid data format'),
  };

  const handler = pgErrorCodes[error.code];
  if (handler) {
    return handler();
  }

  // Default database error
  return new InternalServerError('Database operation failed');
};

// ============================================================================
// GLOBAL ERROR HANDLER MIDDLEWARE
// ============================================================================

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let error: AppError;

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    error = handleZodError(err);
  }
  // Handle our custom errors
  else if (err instanceof AppError) {
    error = err;
  }
  // Handle database errors
  else if (err.name === 'QueryFailedError' || (err as any).code) {
    error = handleDatabaseError(err);
  }
  // Handle unknown errors
  else {
    error = new InternalServerError(err.message || 'An unexpected error occurred');
    error.stack = err.stack;
  }

  // Log error
  logger.error({
    err: error,
    req: {
      method: req.method,
      url: req.url,
      query: req.query,
      body: req.body,
      ip: req.ip,
      userId: (req as any).user?.id,
      organizationId: (req as any).organizationId,
    },
  });

  // Send response
  const includeStack = process.env.NODE_ENV === 'development';
  const response = formatErrorResponse(error, includeStack);

  // Add retry-after header for rate limit errors
  if (error.statusCode === 429 && error.details?.retryAfter) {
    res.setHeader('Retry-After', error.details.retryAfter);
  }

  res.status(error.statusCode).json(response);
};

// ============================================================================
// 404 NOT FOUND HANDLER
// ============================================================================

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};

// ============================================================================
// ASYNC HANDLER WRAPPER
// ============================================================================

/**
 * Wraps async route handlers to automatically catch errors
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============================================================================
// VALIDATION HELPER
// ============================================================================

/**
 * Validate request data against Zod schema
 */
export const validateRequest = <T>(
  schema: any,
  data: any,
  fieldName: string = 'data'
): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw handleZodError(error);
    }
    throw new ValidationError(`Invalid ${fieldName}`);
  }
};

// Example usage:
// const createProductSchema = z.object({ name: z.string(), price: z.number() });
// const validated = validateRequest(createProductSchema, req.body, 'product');
