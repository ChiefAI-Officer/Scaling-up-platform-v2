import { checkRateLimitStrict, type RateLimitConfig } from "@/lib/rate-limit";

const RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const SAFE_ERROR_CLASSES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "URIError",
  "EvalError",
  "AggregateError",
  "Object",
  "Array",
]);

export function summaryReportErrorClass(error: unknown): string {
  if (!(error instanceof Error)) {
    const constructorName = error?.constructor?.name;
    return typeof constructorName === "string" &&
      SAFE_ERROR_CLASSES.has(constructorName)
      ? constructorName
      : typeof error;
  }
  const constructorName = error.constructor?.name;
  return typeof constructorName === "string" &&
    SAFE_ERROR_CLASSES.has(constructorName)
    ? constructorName
    : "Error";
}

export function summaryReportJson(
  body: unknown,
  status: number,
  additionalHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...RESPONSE_HEADERS, ...additionalHeaders },
  });
}

export function summaryReportNotFound(
  additionalHeaders: Record<string, string> = {},
): Response {
  return summaryReportJson({ error: "Not found" }, 404, additionalHeaders);
}

function rateLimitHeaders(
  config: RateLimitConfig,
  result: { remaining: number; resetAt: number; retryAfter?: number },
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(config.maxRequests),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
    ...(result.retryAfter === undefined
      ? {}
      : { "Retry-After": String(result.retryAfter) }),
  };
}

export async function checkSummaryReportRateLimit(input: {
  actorUserId: string;
  campaignId: string;
  operation: "list" | "candidates" | "create" | "artifact";
  config: RateLimitConfig;
}): Promise<{ headers: Record<string, string> } | { response: Response }> {
  try {
    const result = await checkRateLimitStrict(
      `summary-report:${input.operation}:${input.actorUserId}:${input.campaignId}`,
      input.config,
    );
    const headers = rateLimitHeaders(input.config, result);
    if (!result.success) {
      return {
        response: summaryReportJson(
          { error: "Too many summary-report requests. Try again later." },
          429,
          headers,
        ),
      };
    }
    return { headers };
  } catch (error) {
    try {
      console.error(
        JSON.stringify({
          event: "summary-report-rate-limit-failed",
          operation: input.operation,
          errorClass: summaryReportErrorClass(error),
        }),
      );
    } catch {
      // Observability must not change the safe route result.
    }
    return {
      response: summaryReportJson(
        { error: "Summary reporting is temporarily unavailable." },
        503,
      ),
    };
  }
}
