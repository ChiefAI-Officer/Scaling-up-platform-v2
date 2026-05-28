/**
 * Assessment v7.6 — Respondent collection routes.
 * Composite dedupe via (organizationId, dedupeSource, dedupeValue).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRespondentSchema } from "@/lib/validations";
import { getApiActor } from "@/lib/auth/authorization";
import {
  canAccessOrganization,
  asAccessDb,
} from "@/lib/assessments/access-control";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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

    const { id: organizationId } = await params;
    const allowed = await canAccessOrganization(
      asAccessDb(db),
      actor,
      organizationId
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    const where: {
      organizationId: string;
      deletedAt: null;
      teamId?: string;
    } = {
      organizationId,
      deletedAt: null,
    };
    if (teamId) where.teamId = teamId;

    const respondents = await db.orgRespondent.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return NextResponse.json({ success: true, data: respondents });
  } catch (error) {
    console.error("Error listing respondents:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list respondents" },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const { id: organizationId } = await params;
    const allowed = await canAccessOrganization(
      asAccessDb(db),
      actor,
      organizationId
    );
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

    const validation = createRespondentSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;
    const normalizedEmail = normalizeEmail(data.email);

    // Validate teamId belongs to org if provided.
    if (data.teamId) {
      const team = await db.orgTeam.findUnique({
        where: { id: data.teamId },
      });
      if (
        !team ||
        team.organizationId !== organizationId ||
        team.deletedAt !== null
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "teamId does not belong to this organization",
          },
          { status: 400 }
        );
      }
    }

    const externalId = data.externalId ?? null;
    const dedupeSource = externalId ? "external" : "email";
    const dedupeValue = externalId ?? normalizedEmail;

    try {
      const respondent = await db.orgRespondent.create({
        data: {
          organizationId,
          teamId: data.teamId ?? null,
          roleType: data.roleType ?? null,
          email: data.email,
          normalizedEmail,
          firstName: data.firstName,
          lastName: data.lastName,
          jobTitle: data.jobTitle ?? null,
          externalId,
          dedupeSource,
          dedupeValue,
        },
      });

      await logAudit({
        entityType: "OrgRespondent",
        entityId: respondent.id,
        action: "CREATE",
        performedBy: actor.email,
        changes: {
          organizationId,
          email: respondent.email,
          dedupeSource,
        },
      });

      return NextResponse.json(
        { success: true, data: respondent },
        { status: 201 }
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        const existing = await db.orgRespondent.findFirst({
          where: {
            organizationId,
            dedupeSource,
            dedupeValue,
          },
        });
        return NextResponse.json(
          {
            success: false,
            error: "Respondent already exists for this organization",
            existingId: existing?.id ?? null,
          },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Error creating respondent:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create respondent" },
      { status: 500 }
    );
  }
}
