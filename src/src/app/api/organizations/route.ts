/**
 * Assessment v7.6 — Organization collection routes.
 *
 * Spec refs:
 *  - docs/specs/v7.6/01-schema.md (Organization)
 *  - docs/specs/v7.6/02-service-layer-rules.md (canAccessOrganization)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createOrganizationSchema,
} from "@/lib/validations";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const where: { deletedAt: null; ownerCoachId?: string } = {
      deletedAt: null,
    };
    if (!isPrivilegedRole(actor.role)) {
      // Coaches can only see organizations they own.
      if (!actor.coachId) {
        return NextResponse.json({ success: true, data: [] });
      }
      where.ownerCoachId = actor.coachId;
    }

    const orgs = await db.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: orgs });
  } catch (error) {
    console.error("Error listing organizations:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list organizations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    // Coaches must have a coachId. Admin/staff can create but must specify owner — for
    // v1 we only support coach self-creation; admin-on-behalf is a follow-on.
    if (!actor.coachId) {
      return NextResponse.json(
        { success: false, error: "Only coaches can create organizations" },
        { status: 403 }
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

    const validation = createOrganizationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    try {
      const org = await db.organization.create({
        data: {
          name: data.name,
          externalId: data.externalId ?? null,
          ownerCoachId: actor.coachId,
        },
      });

      await logAudit({
        entityType: "Organization",
        entityId: org.id,
        action: "CREATE",
        performedBy: actor.email,
        changes: { name: org.name, externalId: org.externalId },
      });

      return NextResponse.json(
        { success: true, data: org },
        { status: 201 }
      );
    } catch (error) {
      // P2002: unique constraint failure on externalId
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
    console.error("Error creating organization:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create organization" },
      { status: 500 }
    );
  }
}
