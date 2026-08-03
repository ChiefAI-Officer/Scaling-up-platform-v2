import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getApiActor,
  isPrivilegedRole,
  type ApiActor,
} from "@/lib/auth/authorization";
import {
  OperatorServiceError,
  type OperatorServiceErrorCode,
} from "@/lib/assessments/assessment-email-intent-operator";
import { db } from "@/lib/db";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
} as const;

const querySchema = z
  .object({
    status: z.literal("HELD").default("HELD"),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(50))
      .optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();

const cursorSchema = z
  .object({
    heldAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    id: z.string().min(1),
  })
  .strict();

const provenanceSchema = z.object({
  templateId: z.string().min(1),
  versionId: z.string().min(1),
  templateAlias: z.string().min(1),
  reportType: z.string().min(1),
  rendererContractVersion: z.number().int(),
});

type HeldIntentListRow = {
  id: string;
  version: number;
  submissionId: string;
  campaignId: string;
  recipientRole: string;
  emailType: string;
  maskedRecipient: string;
  holdReason: string;
  createdAt: Date;
  heldAt: Date;
  expiresAt: Date;
  contentProvenance: unknown;
};

type HeldIntentCursor = z.infer<typeof cursorSchema>;

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

function operatorErrorResponse(error: unknown): Response {
  if (error instanceof OperatorServiceError) {
    return privateJson(
      { error: error.code },
      operatorErrorStatus(error.code),
    );
  }
  return privateJson({ error: "INTERNAL_ERROR" }, 500);
}

function queryInput(searchParams: URLSearchParams): unknown {
  const input: Record<string, string> = {};
  for (const key of searchParams.keys()) {
    const values = searchParams.getAll(key);
    if (values.length !== 1) {
      return { invalidDuplicateParameter: key };
    }
    input[key] = values[0];
  }
  return input;
}

function decodeCursor(value: string): HeldIntentCursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const result = cursorSchema.safeParse(decoded);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function encodeCursor(row: HeldIntentListRow): string {
  return Buffer.from(
    JSON.stringify({
      heldAt: row.heldAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      id: row.id,
    }),
  ).toString("base64url");
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requirePrivilegedActor(request);
    if ("response" in auth) return auth.response;

    const parsedQuery = querySchema.safeParse(
      queryInput(new URL(request.url).searchParams),
    );
    if (!parsedQuery.success) {
      return privateJson({ error: "INVALID_REQUEST" }, 400);
    }
    const cursor = parsedQuery.data.cursor
      ? decodeCursor(parsedQuery.data.cursor)
      : undefined;
    if (parsedQuery.data.cursor && !cursor) {
      return privateJson({ error: "INVALID_REQUEST" }, 400);
    }

    const limit = parsedQuery.data.limit ?? 25;
    const keyset = cursor
      ? Prisma.sql`
          AND (
            "heldAt" > ${new Date(cursor.heldAt)}
            OR (
              "heldAt" = ${new Date(cursor.heldAt)}
              AND "createdAt" > ${new Date(cursor.createdAt)}
            )
            OR (
              "heldAt" = ${new Date(cursor.heldAt)}
              AND "createdAt" = ${new Date(cursor.createdAt)}
              AND "id" > ${cursor.id}
            )
          )
        `
      : Prisma.empty;
    const rows = await db.$queryRaw<HeldIntentListRow[]>(Prisma.sql`
      SELECT
        "id",
        "version",
        "submissionId",
        "campaignId",
        "recipientRole",
        "emailType",
        CASE
          WHEN POSITION('@' IN "recipientEmail") > 1
          THEN LEFT("recipientEmail", 1) || '***@' ||
               SPLIT_PART("recipientEmail", '@', 2)
          ELSE '***'
        END AS "maskedRecipient",
        "holdReason",
        "createdAt",
        "heldAt",
        "expiresAt",
        "contentProvenance"
      FROM "assessment_email_delivery_intents"
      WHERE "status" = 'HELD'
      ${keyset}
      ORDER BY "heldAt" ASC, "createdAt" ASC, "id" ASC
      LIMIT ${limit + 1}
    `);

    const hasNextPage = rows.length > limit;
    const page = rows.slice(0, limit);
    const data = page.map((row) => {
      const parsedProvenance = provenanceSchema.parse(row.contentProvenance);
      return {
        id: row.id,
        version: row.version,
        submissionId: row.submissionId,
        campaignId: row.campaignId,
        recipientRole: row.recipientRole,
        emailType: row.emailType,
        maskedRecipient: row.maskedRecipient,
        holdReason: row.holdReason,
        createdAt: row.createdAt.toISOString(),
        heldAt: row.heldAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        provenance: {
          templateId: parsedProvenance.templateId,
          versionId: parsedProvenance.versionId,
          templateAlias: parsedProvenance.templateAlias,
          reportType: parsedProvenance.reportType,
          rendererContractVersion:
            parsedProvenance.rendererContractVersion,
        },
      };
    });

    return privateJson({
      data,
      nextCursor:
        hasNextPage && page.length > 0
          ? encodeCursor(page[page.length - 1])
          : null,
    });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
