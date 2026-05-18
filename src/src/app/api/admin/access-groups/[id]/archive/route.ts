/**
 * Assessment v7.6 — Admin AccessGroup archive (soft-delete).
 *
 * Sets deletedAt=now() on the group. Idempotency: 409 if already archived.
 *
 * Note: archive does NOT run evaluateAccessChange in this slice; the
 * downstream ARCHIVE_GROUP guard exists in the service layer but is
 * deferred to a Wave-6 admin "archive with preview" UX. For now archive
 * is administrative only and writes a plain audit-log entry.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const { id } = await context.params;

    const existing = await db.accessGroup.findUnique({
      where: { id },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Access group not found" },
        { status: 404 },
      );
    }
    if (existing.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: "Access group is already archived",
          code: "ALREADY_ARCHIVED",
        },
        { status: 409 },
      );
    }

    const updated = await db.accessGroup.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, name: true, deletedAt: true },
    });

    await logAudit({
      entityType: "AccessGroup",
      entityId: id,
      action: "DELETE",
      performedBy: actor.userId,
      changes: { archived: true, name: existing.name },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error archiving access group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to archive access group" },
      { status: 500 },
    );
  }
}
