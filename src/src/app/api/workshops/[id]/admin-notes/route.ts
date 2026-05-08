/**
 * ENH-MAY6-2: Admin notes for a workshop. Admin/Staff only.
 *
 * Side table over a Workshop column intentionally — coach-facing Prisma
 * includes on Workshop never reach this row, so adminNotes can never leak
 * via accidental select:* / include:{workshop:true} on the coach surface.
 *
 * The route is deliberately separate from PATCH /api/workshops/[id] so the
 * privacy boundary is structural (no shared allowlist / no shared field
 * routing).
 */

import { NextResponse } from "next/server";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

const MAX_BODY_LEN = 5000;

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPrivilegedRole(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: workshopId } = await ctx.params;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const body = (payload as { body?: unknown })?.body;
  if (typeof body !== "string") {
    return NextResponse.json(
      { error: "body must be a string" },
      { status: 400 }
    );
  }
  if (body.length > MAX_BODY_LEN) {
    return NextResponse.json(
      { error: `body exceeds ${MAX_BODY_LEN} characters` },
      { status: 400 }
    );
  }

  const workshop = await db.workshop.findUnique({
    where: { id: workshopId },
    select: { id: true },
  });
  if (!workshop) {
    return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
  }

  const note = await db.workshopAdminNote.upsert({
    where: { workshopId },
    create: { workshopId, body, updatedBy: actor.userId },
    update: { body, updatedBy: actor.userId },
  });

  await db.auditLog.create({
    data: {
      action: "WORKSHOP_ADMIN_NOTE_UPDATE",
      entityType: "Workshop",
      entityId: workshopId,
      performedBy: actor.userId,
      changes: JSON.stringify({ length: body.length }),
    },
  }).catch(() => {
    // Audit failure is non-fatal — note has already been saved.
  });

  return NextResponse.json({ success: true, note });
}
