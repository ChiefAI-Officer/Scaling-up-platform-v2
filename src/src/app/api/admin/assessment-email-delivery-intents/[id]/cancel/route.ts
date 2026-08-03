import { NextResponse } from "next/server";
import { z } from "zod";
import {
  OperatorServiceError,
  cancelHeldIntent,
  productionAssessmentEmailIntentOperatorDeps,
  type OperatorServiceErrorCode,
} from "@/lib/assessments/assessment-email-intent-operator";
import {
  getApiActor,
  isPrivilegedRole,
  type ApiActor,
} from "@/lib/auth/authorization";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.object({ id: z.string().min(1) }).strict();
const cancelSchema = z
  .object({
    expectedVersion: z.number().int(),
    reasonCode: z.enum([
      "DELIVERY_NO_LONGER_AUTHORIZED",
      "RECIPIENT_SUPERSEDED",
      "CAMPAIGN_RETIRED",
      "DUPLICATE_CONFIRMED",
      "POLICY_DECISION",
    ]),
  })
  .strict();
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

type RouteContext = {
  params: Promise<{ id: string }>;
};

function privateJson(
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

async function requirePrivilegedActor(
  request: Request,
): Promise<{ actor: ApiActor } | { response: Response }> {
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
  const actor = await getApiActor();
  if (!actor) {
    return { response: privateJson({ error: "UNAUTHENTICATED" }, 401) };
  }
  if (!isPrivilegedRole(actor.role)) {
    return { response: privateJson({ error: "FORBIDDEN" }, 403) };
  }
  return { actor };
}

function operatorErrorStatus(code: OperatorServiceErrorCode): number {
  if (
    code === "RELEASE_REASON_NOT_ALLOWED" ||
    code === "CANCELLATION_REASON_NOT_ALLOWED"
  ) return 400;
  if (code === "INTENT_NOT_FOUND") return 404;
  if (CONFLICT_CODES.has(code)) return 409;
  if (code === "INTENT_EXPIRED" || code === "REVIEW_TOKEN_EXPIRED") return 410;
  if (code === "SENDS_PAUSED") return 423;
  return 500;
}

function operatorErrorResponse(error: unknown): Response {
  if (error instanceof OperatorServiceError) {
    return privateJson({ error: error.code }, operatorErrorStatus(error.code));
  }
  return privateJson({ error: "INTERNAL_ERROR" }, 500);
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const auth = await requirePrivilegedActor(request);
    if ("response" in auth) return auth.response;

    const parsedParams = paramsSchema.safeParse(await context.params);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return privateJson({ error: "INVALID_REQUEST" }, 400);
    }
    const parsedBody = cancelSchema.safeParse(body);
    if (!parsedParams.success || !parsedBody.success) {
      return privateJson({ error: "INVALID_REQUEST" }, 400);
    }

    const resolution = await cancelHeldIntent(
      productionAssessmentEmailIntentOperatorDeps({
        reviewTokenSecret:
          process.env.ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET,
      }),
      {
        intentId: parsedParams.data.id,
        actor: { userId: auth.actor.userId },
        expectedVersion: parsedBody.data.expectedVersion,
        reasonCode: parsedBody.data.reasonCode,
      },
    );
    return privateJson({
      data: {
        intentId: resolution.intentId,
        status: resolution.status,
        version: resolution.version,
        outboxId: resolution.outboxId,
        existingOutboxWon: resolution.existingOutboxWon,
      },
    });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
