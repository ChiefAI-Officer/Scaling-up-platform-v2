/**
 * GET/PUT /api/transactional-emails/[type] — admin+staff editor for the
 * system-driven transactional email template.
 *
 * ENH-MAY6-11 (v1): only REGISTRATION_CONFIRMATION supported. THANKS_FOR_
 * ATTENDING deferred until a scheduler ships in v2.
 *
 * Round 2 M3: subject is bounded (200 chars, no control chars), body is
 * bounded (50KB) to prevent abusing the editor for unbounded HTML insertion.
 *
 * Round 3 H1: PUT requires the row's current `version` for optimistic
 * concurrency. If two admins edit in parallel, the second save gets 409
 * with the current version so the UI can prompt "reload and retry".
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";

const ALLOWED_TYPES = ["REGISTRATION_CONFIRMATION"] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

function isAllowedType(s: string): s is AllowedType {
  return (ALLOWED_TYPES as readonly string[]).includes(s);
}

const putBodySchema = z.object({
  subject: z
    .string()
    .min(1, "Subject is required")
    .max(200, "Subject must be 200 characters or fewer")
    .refine((s) => !/[\x00-\x1F\x7F]/.test(s), {
      message: "Subject contains control characters",
    }),
  body: z
    .string()
    .min(1, "Body is required")
    .max(50 * 1024, "Body must be 50KB or smaller"),
  version: z.number().int().nonnegative().optional(), // omitted on first save
});

async function gate(): Promise<
  | { ok: true; actor: { userId: string; role: string } }
  | { ok: false; status: 401 | 403 }
> {
  const actor = await getApiActor();
  if (!actor) return { ok: false, status: 401 };
  if (!isPrivilegedRole(actor.role)) return { ok: false, status: 403 };
  return { ok: true, actor: { userId: actor.userId, role: actor.role } };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const g = await gate();
  if (!g.ok) {
    return NextResponse.json(
      { success: false, error: g.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: g.status },
    );
  }
  const { type } = await params;
  if (!isAllowedType(type)) {
    return NextResponse.json(
      { success: false, error: "Unknown emailType" },
      { status: 400 },
    );
  }
  const row = await db.transactionalEmailTemplate.findUnique({
    where: { emailType: type },
  });
  return NextResponse.json({ success: true, data: row ?? null });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const g = await gate();
  if (!g.ok) {
    return NextResponse.json(
      { success: false, error: g.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: g.status },
    );
  }
  const { type } = await params;
  if (!isAllowedType(type)) {
    return NextResponse.json(
      { success: false, error: "Unknown emailType" },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await request.json().catch(() => ({}))) as any;
  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await db.transactionalEmailTemplate.findUnique({
    where: { emailType: type },
  });

  // Round 3 H1: optimistic concurrency. If the row exists, the client must
  // submit the version it just read. Mismatch → 409 with the current state.
  if (existing && parsed.data.version !== existing.version) {
    return NextResponse.json(
      {
        success: false,
        error: "Conflict — another admin saved this template. Reload to see latest.",
        currentVersion: existing.version,
      },
      { status: 409 },
    );
  }

  const nextVersion = existing ? existing.version + 1 : 1;
  const updated = await db.transactionalEmailTemplate.upsert({
    where: { emailType: type },
    create: {
      emailType: type,
      subject: parsed.data.subject,
      body: parsed.data.body,
      updatedBy: g.actor.userId,
      version: 1,
    },
    update: {
      subject: parsed.data.subject,
      body: parsed.data.body,
      updatedBy: g.actor.userId,
      version: nextVersion,
      previousSubject: existing?.subject ?? null,
      previousBody: existing?.body ?? null,
    },
  });

  await db.auditLog.create({
    data: {
      entityType: "TransactionalEmailTemplate",
      entityId: updated.id,
      action: existing ? "UPDATE" : "CREATE",
      performedBy: g.actor.userId,
      changes: JSON.stringify({
        emailType: type,
        version: updated.version,
      }),
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
