/**
 * Assessment v7.6 — Admin coach autocomplete.
 *
 * GET /api/admin/coaches?search=…&excludeGroupId=…
 *
 * Returns a lightweight coach summary list for the AccessGroup detail
 * "+ Add Coach" autocomplete. Admin/staff only. Returns at most 25 rows.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";

const MAX_RESULTS = 25;

export async function GET(request: NextRequest) {
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

    const params = request.nextUrl.searchParams;
    const search = (params.get("search") ?? "").trim();
    const excludeGroupId = params.get("excludeGroupId") ?? null;

    let excludedCoachIds: string[] = [];
    if (excludeGroupId) {
      const rows = await db.accessGroupCoach.findMany({
        where: { accessGroupId: excludeGroupId },
        select: { coachId: true },
      });
      excludedCoachIds = rows.map((r) => r.coachId);
    }

    const where = {
      ...(excludedCoachIds.length > 0 && {
        id: { notIn: excludedCoachIds },
      }),
      ...(search.length > 0 && {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const coaches = await db.coach.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        certificationStatus: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: MAX_RESULTS,
    });

    return NextResponse.json({ success: true, data: coaches });
  } catch (error) {
    console.error("Error listing admin coaches:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list coaches" },
      { status: 500 },
    );
  }
}
