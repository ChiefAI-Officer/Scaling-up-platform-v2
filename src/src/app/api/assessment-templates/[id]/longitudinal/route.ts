/**
 * Assessment v7.6 — GET /api/assessment-templates/[id]/longitudinal (Task H).
 *
 * Returns year-over-year trend for a (template, organization) pair. Backs
 * the `/portal/assessments/trends` page.
 *
 * Query params:
 *   - organizationId (required) — 400 if missing.
 *
 * Auth:
 *   - 401 if not authenticated.
 *   - 404 if canAccessOrganization(actor, organizationId) === false.
 *     We return 404 (not 403) so a coach probing other coaches' org IDs
 *     can't distinguish "not yours" from "doesn't exist".
 *
 * Spec refs:
 *  - docs/specs/v7.6/02-service-layer-rules.md — canAccessOrganization,
 *    admin/staff bypass.
 *  - public/wireframes/10-trends-page.html
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canAccessOrganization,
} from "@/lib/assessments/access-control";
import {
  asTrendsDb,
  getLongitudinalTrend,
} from "@/lib/assessments/trends";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { id: templateId } = await params;

    const organizationId =
      request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId is required" },
        { status: 400 },
      );
    }

    const allowed = await canAccessOrganization(
      asAccessDb(db),
      actor,
      organizationId,
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    const trend = await getLongitudinalTrend(
      asTrendsDb(db),
      templateId,
      organizationId,
    );

    return NextResponse.json({ success: true, data: trend });
  } catch (error) {
    console.error("Error building longitudinal trend:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build longitudinal trend" },
      { status: 500 },
    );
  }
}
