/**
 * API Route Handler Wrapper
 * Provides consistent error handling, logging, and rate limiting for all API routes
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, UserRole, canAccess } from "./auth";
import { AppError, Errors, formatErrorResponse, getErrorStatusCode } from "./errors";
import { logger } from "./logger";
import {
  checkRateLimit,
  getClientIdentifier,
  RateLimits,
  RateLimitResult,
} from "./rate-limit";

type ApiHandler<T = unknown> = (
  request: NextRequest,
  context: ApiContext
) => Promise<T>;

interface ApiContext {
  params?: Record<string, string>;
  session?: {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: UserRole;
    };
  } | null;
}

interface ApiHandlerOptions {
  // Require authentication
  requireAuth?: boolean;
  // Required role (uses role hierarchy)
  requiredRole?: UserRole;
  // Rate limiting configuration key
  rateLimit?: keyof typeof RateLimits;
  // Allow public access (skip auth check even if requireAuth is true)
  allowPublic?: boolean;
}

/**
 * Wrap an API route handler with standard middleware
 */
export function createApiHandler<T>(
  handler: ApiHandler<T>,
  options: ApiHandlerOptions = {}
) {
  return async (
    request: NextRequest,
    { params }: { params?: Promise<Record<string, string>> } = {}
  ): Promise<NextResponse> => {
    const startTime = Date.now();
    const method = request.method;
    const path = request.nextUrl.pathname;

    try {
      // Log incoming request
      logger.apiRequest(method, path, {
        userAgent: request.headers.get("user-agent"),
      });

      // Rate limiting
      if (options.rateLimit) {
        const clientId = getClientIdentifier(request);
        const rateLimitKey = `${options.rateLimit}:${clientId}:${path}`;
        const rateLimitConfig = RateLimits[options.rateLimit];
        const result: RateLimitResult = checkRateLimit(rateLimitKey, rateLimitConfig);

        if (!result.success) {
          throw Errors.rateLimited(result.retryAfter);
        }
      }

      // Authentication check
      let session = null;
      if (options.requireAuth && !options.allowPublic) {
        session = await getServerSession(authOptions);

        if (!session?.user) {
          throw Errors.unauthorized();
        }

        // Role check
        if (options.requiredRole && !canAccess(session.user.role, options.requiredRole)) {
          throw Errors.forbidden();
        }
      } else if (!options.allowPublic) {
        // Try to get session even if not required (for logging)
        session = await getServerSession(authOptions);
      }

      // Resolve params if they're a promise (Next.js 15+)
      const resolvedParams = params ? await params : undefined;

      // Execute handler
      const result = await handler(request, {
        params: resolvedParams,
        session,
      });

      // Log successful response
      const duration = Date.now() - startTime;
      logger.apiResponse(method, path, 200, duration);

      // Return success response
      return NextResponse.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log error
      if (error instanceof Error) {
        logger.apiError(method, path, error, { duration });
      }

      // Format error response
      const errorResponse = formatErrorResponse(error);
      const statusCode = getErrorStatusCode(error);

      logger.apiResponse(method, path, statusCode, duration);

      // Add rate limit headers if applicable
      const headers: Record<string, string> = {};
      if (error instanceof AppError && error.code === "RATE_LIMITED" && error.details?.retryAfter) {
        headers["Retry-After"] = String(error.details.retryAfter);
      }

      return NextResponse.json(errorResponse, {
        status: statusCode,
        headers,
      });
    }
  };
}

/**
 * Helper to parse and validate request body
 */
export async function parseBody<T>(
  request: NextRequest,
  validator: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: { issues: unknown[] } } }
): Promise<T> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw Errors.badRequest("Invalid JSON in request body");
  }

  const result = validator.safeParse(body);

  if (!result.success) {
    throw Errors.validation("Validation failed", {
      issues: result.error?.issues,
    });
  }

  return result.data as T;
}

/**
 * Helper to get query parameters
 */
export function getQueryParams(request: NextRequest): Record<string, string> {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}
