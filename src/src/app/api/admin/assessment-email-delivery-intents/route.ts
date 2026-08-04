import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  operatorErrorResponse,
  privateJson,
  requirePrivilegedActor,
} from "@/app/api/admin/assessment-email-delivery-intents/route-support";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

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

const provenanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    templateId: z.string().min(1),
    versionId: z.string().min(1),
    templateAlias: z.string().min(1),
    reportType: z.string().min(1),
    approvalHash: z.string().nullable(),
    rendererContractVersion: z.literal(1),
    sourceCommit: z.string().min(1),
    renderInputHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

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
      const parsedProvenance = provenanceSchema.safeParse(
        row.contentProvenance,
      );
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
        provenance: parsedProvenance.success
          ? {
              templateId: parsedProvenance.data.templateId,
              versionId: parsedProvenance.data.versionId,
              templateAlias: parsedProvenance.data.templateAlias,
              reportType: parsedProvenance.data.reportType,
              rendererContractVersion:
                parsedProvenance.data.rendererContractVersion,
            }
          : null,
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
