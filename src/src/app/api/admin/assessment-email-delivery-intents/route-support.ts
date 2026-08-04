import { NextResponse } from "next/server";
import {
  OperatorServiceError,
  type OperatorServiceErrorCode,
} from "@/lib/assessments/assessment-email-intent-operator";
import {
  getApiActor,
  isPrivilegedRole,
  type ApiActor,
} from "@/lib/auth/authorization";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
} as const;

const CONFLICT_CODES: ReadonlySet<OperatorServiceErrorCode> = new Set([
  "INTENT_NOT_HELD",
  "VERSION_CONFLICT",
  "SNAPSHOT_UNSUPPORTED",
  "RENDERER_UNSUPPORTED",
  "PROVENANCE_INVALID",
  "PAYLOAD_INTEGRITY_FAILED",
  "OUTBOX_OWNERSHIP_CONFLICT",
  "REVIEW_TOKEN_INVALID",
  "REVIEW_TOKEN_ACTOR_MISMATCH",
  "REVIEW_TOKEN_INTENT_MISMATCH",
  "REVIEW_TOKEN_VERSION_MISMATCH",
  "REVIEW_CONTEXT_CHANGED",
]);

export function privateJson(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return NextResponse.json(body, {
    status,
    headers: {
      ...Object.fromEntries(new Headers(headers)),
      ...PRIVATE_HEADERS,
    },
  });
}

export async function requirePrivilegedActor(
  request: Request,
): Promise<{ actor: ApiActor } | { response: Response }> {
  const actor = await getApiActor();
  if (!actor) {
    return { response: privateJson({ error: "UNAUTHENTICATED" }, 401) };
  }
  if (!isPrivilegedRole(actor.role)) {
    return { response: privateJson({ error: "FORBIDDEN" }, 403) };
  }

  const rateLimit = await withRateLimit(request, RateLimits.standard);
  if (!rateLimit.allowed) {
    return {
      response: privateJson(
        { error: "RATE_LIMITED" },
        429,
        rateLimit.headers,
      ),
    };
  }

  return { actor };
}

function operatorErrorStatus(code: OperatorServiceErrorCode): number {
  if (
    code === "RELEASE_REASON_NOT_ALLOWED" ||
    code === "CANCELLATION_REASON_NOT_ALLOWED"
  ) {
    return 400;
  }
  if (code === "INTENT_NOT_FOUND") return 404;
  if (CONFLICT_CODES.has(code)) return 409;
  if (code === "INTENT_EXPIRED" || code === "REVIEW_TOKEN_EXPIRED") {
    return 410;
  }
  if (code === "SENDS_PAUSED") return 423;
  return 500;
}

export function operatorErrorResponse(error: unknown): Response {
  if (error instanceof OperatorServiceError) {
    return privateJson(
      { error: error.code },
      operatorErrorStatus(error.code),
    );
  }
  return privateJson({ error: "INTERNAL_ERROR" }, 500);
}
