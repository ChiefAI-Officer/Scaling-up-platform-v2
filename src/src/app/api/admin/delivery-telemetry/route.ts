import { NextRequest, NextResponse } from "next/server";
import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (actor.role !== "ADMIN" && actor.role !== "STAFF") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const workshopId = request.nextUrl.searchParams.get("workshopId") || undefined;
  const limitParam = Number(request.nextUrl.searchParams.get("limit") || 100);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;

  const logs = await db.auditLog.findMany({
    where: {
      entityType: "EMAIL_DELIVERY",
      ...(workshopId ? { changes: { contains: `"workshopId":"${workshopId}"` } } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  const data = logs.map((log) => {
    let parsedChanges: Record<string, unknown> | null = null;
    try {
      parsedChanges = JSON.parse(log.changes) as Record<string, unknown>;
    } catch {
      parsedChanges = null;
    }

    return {
      id: log.id,
      action: log.action,
      timestamp: log.timestamp.toISOString(),
      details: parsedChanges,
    };
  });

  return NextResponse.json({ success: true, data });
}
