import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { isCanonicalAdminEmail } from "@/lib/auth/auth";

/**
 * Wave Q (#7, ADR-0018) — GET /api/admin/admin-users
 *
 * ADMIN-only listing of LIVE (deletedAt: null) ADMIN/STAFF users for the
 * admin-settings "Admin Users" card. Read-only, so it is available regardless
 * of the WAVE_Q flag (only the REMOVE capability is flag-gated).
 *
 * Each row carries `self` / `canonical` so the client can suppress the Remove
 * button on rows the DELETE endpoint would reject anyway.
 */
export async function GET() {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    if (actor.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const users = await db.user.findMany({
      where: {
        deletedAt: null,
        role: { in: ["ADMIN", "STAFF"] },
      },
      orderBy: { email: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        coachProfile: { select: { id: true } },
      },
    });

    const data = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      hasCoachProfile: user.coachProfile !== null,
      self: user.id === actor.userId,
      canonical: isCanonicalAdminEmail(user.email),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching admin users:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch admin users" },
      { status: 500 }
    );
  }
}
