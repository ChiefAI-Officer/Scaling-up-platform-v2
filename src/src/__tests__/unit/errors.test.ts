/**
 * Unit tests for error handling utilities
 */

import {
  AppError,
  Errors,
  isAppError,
  formatErrorResponse,
  getErrorStatusCode,
} from "@/lib/errors";

describe("AppError", () => {
  it("should create error with correct properties", () => {
    const error = new AppError("VALIDATION_ERROR", "Invalid input", 400, {
      field: "email",
    });

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Invalid input");
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: "email" });
    expect(error.isOperational).toBe(true);
  });

  it("should serialize to JSON correctly", () => {
    const error = new AppError("NOT_FOUND", "Resource not found", 404);
    const json = error.toJSON();

    expect(json).toEqual({
      code: "NOT_FOUND",
      message: "Resource not found",
      statusCode: 404,
      details: undefined,
    });
  });

  it("should be an instance of Error", () => {
    const error = new AppError("INTERNAL_ERROR", "Something went wrong", 500);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe("Error Factories", () => {
  describe("Errors.validation", () => {
    it("should create validation error with 400 status", () => {
      const error = Errors.validation("Invalid email format", { field: "email" });
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: "email" });
    });
  });

  describe("Errors.notFound", () => {
    it("should create not found error with resource name", () => {
      const error = Errors.notFound("Workshop");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toBe("Workshop not found");
      expect(error.statusCode).toBe(404);
    });

    it("should create not found error with resource name and ID", () => {
      const error = Errors.notFound("Workshop", "ws-123");
      expect(error.message).toBe("Workshop with ID ws-123 not found");
      expect(error.details).toEqual({ resource: "Workshop", id: "ws-123" });
    });
  });

  describe("Errors.unauthorized", () => {
    it("should create unauthorized error with default message", () => {
      const error = Errors.unauthorized();
      expect(error.code).toBe("UNAUTHORIZED");
      expect(error.message).toBe("Authentication required");
      expect(error.statusCode).toBe(401);
    });

    it("should create unauthorized error with custom message", () => {
      const error = Errors.unauthorized("Session expired");
      expect(error.message).toBe("Session expired");
    });
  });

  describe("Errors.forbidden", () => {
    it("should create forbidden error with default message", () => {
      const error = Errors.forbidden();
      expect(error.code).toBe("FORBIDDEN");
      expect(error.statusCode).toBe(403);
    });
  });

  describe("Errors.conflict", () => {
    it("should create conflict error", () => {
      const error = Errors.conflict("Email already exists", { email: "test@example.com" });
      expect(error.code).toBe("CONFLICT");
      expect(error.statusCode).toBe(409);
    });
  });

  describe("Errors.rateLimited", () => {
    it("should create rate limited error with retry info", () => {
      const error = Errors.rateLimited(60);
      expect(error.code).toBe("RATE_LIMITED");
      expect(error.statusCode).toBe(429);
      expect(error.details).toEqual({ retryAfter: 60 });
    });
  });

  describe("Errors.internal", () => {
    it("should create internal error with default message", () => {
      const error = Errors.internal();
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe("An unexpected error occurred");
    });
  });

  describe("Errors.serviceUnavailable", () => {
    it("should create service unavailable error", () => {
      const error = Errors.serviceUnavailable("Database");
      expect(error.code).toBe("SERVICE_UNAVAILABLE");
      expect(error.statusCode).toBe(503);
      expect(error.details).toEqual({ service: "Database" });
    });
  });
});

describe("isAppError", () => {
  it("should return true for AppError instances", () => {
    const error = new AppError("NOT_FOUND", "Not found", 404);
    expect(isAppError(error)).toBe(true);
  });

  it("should return false for regular Error instances", () => {
    const error = new Error("Something went wrong");
    expect(isAppError(error)).toBe(false);
  });

  it("should return false for non-Error objects", () => {
    expect(isAppError({ message: "error" })).toBe(false);
    expect(isAppError("error")).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});

describe("formatErrorResponse", () => {
  it("should format AppError correctly", () => {
    const error = Errors.notFound("Workshop", "123");
    const response = formatErrorResponse(error);

    expect(response.success).toBe(false);
    expect(response.error.code).toBe("NOT_FOUND");
    expect(response.error.statusCode).toBe(404);
  });

  it("should format regular Error as internal error", () => {
    const error = new Error("Database connection failed");
    const response = formatErrorResponse(error);

    expect(response.success).toBe(false);
    expect(response.error.code).toBe("INTERNAL_ERROR");
    expect(response.error.statusCode).toBe(500);
    expect(response.error.message).toBe("Database connection failed");
  });

  it("should handle unknown error types", () => {
    const response = formatErrorResponse("string error");

    expect(response.success).toBe(false);
    expect(response.error.code).toBe("INTERNAL_ERROR");
    expect(response.error.statusCode).toBe(500);
  });
});

describe("getErrorStatusCode", () => {
  it("should return status code from AppError", () => {
    const error = Errors.forbidden();
    expect(getErrorStatusCode(error)).toBe(403);
  });

  it("should return 500 for unknown errors", () => {
    expect(getErrorStatusCode(new Error("test"))).toBe(500);
    expect(getErrorStatusCode("string")).toBe(500);
    expect(getErrorStatusCode(null)).toBe(500);
  });
});
