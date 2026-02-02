/**
 * Custom error classes and error handling utilities
 * Provides structured error responses for consistent API behavior
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE";

export interface AppErrorDetails {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  statusCode: number;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): AppErrorDetails {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      statusCode: this.statusCode,
    };
  }
}

// Pre-defined error factories
export const Errors = {
  validation: (message: string, details?: Record<string, unknown>) =>
    new AppError("VALIDATION_ERROR", message, 400, details),

  notFound: (resource: string, id?: string) =>
    new AppError(
      "NOT_FOUND",
      id ? `${resource} with ID ${id} not found` : `${resource} not found`,
      404,
      { resource, id }
    ),

  unauthorized: (message = "Authentication required") =>
    new AppError("UNAUTHORIZED", message, 401),

  forbidden: (message = "You don't have permission to perform this action") =>
    new AppError("FORBIDDEN", message, 403),

  conflict: (message: string, details?: Record<string, unknown>) =>
    new AppError("CONFLICT", message, 409, details),

  badRequest: (message: string, details?: Record<string, unknown>) =>
    new AppError("BAD_REQUEST", message, 400, details),

  rateLimited: (retryAfter?: number) =>
    new AppError("RATE_LIMITED", "Too many requests. Please try again later.", 429, {
      retryAfter,
    }),

  internal: (message = "An unexpected error occurred") =>
    new AppError("INTERNAL_ERROR", message, 500),

  serviceUnavailable: (service: string) =>
    new AppError("SERVICE_UNAVAILABLE", `${service} is temporarily unavailable`, 503, {
      service,
    }),
};

// Type guard to check if error is AppError
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// Format error for API response
export function formatErrorResponse(error: unknown): {
  success: false;
  error: AppErrorDetails;
} {
  if (isAppError(error)) {
    return {
      success: false,
      error: error.toJSON(),
    };
  }

  // Handle unknown errors
  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  return {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message,
      statusCode: 500,
    },
  };
}

// Get status code from error
export function getErrorStatusCode(error: unknown): number {
  if (isAppError(error)) {
    return error.statusCode;
  }
  return 500;
}
