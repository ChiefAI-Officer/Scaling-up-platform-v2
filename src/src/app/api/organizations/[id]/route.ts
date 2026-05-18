/**
 * Assessment v7.6 — Organization detail routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateOrganizationSchema } from "@/lib/validations";
import { getApiActor } from "@/lib/auth/authorization";
import {
  canAccessOrganization,
  asAccessDb,
} from "@/lib/assessments/access-control";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const allowed = await canAccessOrganization(asAccessDb(db), actor, id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    const org = await db.organization.findUnique({ where: { id } });
    if (!org || org.deletedAt !== null) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: org });
  } catch (error) {
    console.error("Error fetching organization:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch organization" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const allowed = await canAccessOrganization(asAccessDb(db), actor, id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const validation = updateOrganizationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;
    const updateData: { name?: string; externalId?: string | null } = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.externalId !== undefined) {
      updateData.externalId =
        data.externalId === null || data.externalId === ""
          ? null
          : data.externalId;
    }

    try {
      const org = await db.organization.update({
        where: { id },
        data: updateData,
      });

      await logAudit({
        entityType: "Organization",
        entityId: id,
        action: "UPDATE",
        performedBy: actor.email,
        changes: updateData as Record<string, unknown>,
      });

      return NextResponse.json({ success: true, data: org });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "An organization with that externalId already exists",
          },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Error updating organization:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update organization" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const allowed = await canAccessOrganization(asAccessDb(db), actor, id);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    await db.organization.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      entityType: "Organization",
      entityId: id,
      action: "DELETE",
      performedBy: actor.email,
    });

    return NextResponse.json({
      success: true,
      message: "Organization deleted",
    });
  } catch (error) {
    console.error("Error deleting organization:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete organization" },
      { status: 500 }
    );
  }
}
