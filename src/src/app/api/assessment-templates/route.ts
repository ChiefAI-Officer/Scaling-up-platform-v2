/**
 * Assessment v7.6 — Assessment template listing.
 *
 * Spec refs:
 *  - docs/specs/v7.6/02-service-layer-rules.md (canAccessTemplate, INTERSECTION)
 *
 * Admin/staff: all non-deleted templates.
 * Coach: INTERSECTION RBAC — only templates that EVERY active AccessGroup
 * the coach belongs to grants. Implemented in JS off two cheap queries to
 * avoid raw SQL. Heavy `questions/sections/scoring` JSON intentionally
 * excluded; consumers must fetch a specific template detail route for that.
 *
 * Wave D (Task 6b): `resultsEmailApproved` is computed server-side via
 * `isResultsEmailApproved` and returned to the wizard so the #15 toggle can
 * self-disable when the template's approval hash does not match. The raw
 * hash is NEVER exposed to the client.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { isResultsEmailApproved } from "@/lib/assessments/results-email-approval";

interface TemplateSummary {
  id: string;
  name: string;
  alias: string;
  description: string | null;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  /** True only when the results-email content is approved AND the hash matches. */
  resultsEmailApproved: boolean;
}

export async function GET(request: NextRequest) {
  try {
    // Touch request.url to satisfy the unused-arg lint and keep route
    // handler signature aligned with other GET routes.
    void request.url;
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    if (isPrivilegedRole(actor.role)) {
      const templates = await db.assessmentTemplate.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          alias: true,
          description: true,
          aggregationMode: true,
          resultsEmailContentApproved: true,
          resultsEmailContentApprovedHash: true,
          resultsEmailSubject: true,
          resultsEmailBodyMarkdown: true,
        },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({
        success: true,
        data: templates.map((t) => ({
          id: t.id,
          name: t.name,
          alias: t.alias,
          description: t.description,
          aggregationMode: t.aggregationMode,
          resultsEmailApproved: isResultsEmailApproved(t),
        })) satisfies TemplateSummary[],
      });
    }

    // Coach path — INTERSECTION RBAC.
    if (!actor.coachId) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Step 1 — load the coach's active group IDs.
    const groupRows = await db.accessGroupCoach.findMany({
      where: { coachId: actor.coachId },
      include: { accessGroup: { select: { id: true, deletedAt: true } } },
    });
    const activeGroupIds = groupRows
      .filter((r) => r.accessGroup.deletedAt === null)
      .map((r) => r.accessGroupId);

    if (activeGroupIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Step 2 — load every AccessGroupTemplate row in those groups and
    // count grants per template. A template is accessible iff every
    // active group of the coach grants it (count === activeGroupIds.length).
    const grantRows = await db.accessGroupTemplate.findMany({
      where: { accessGroupId: { in: activeGroupIds } },
      select: { templateId: true, accessGroupId: true },
    });

    const grantCount = new Map<string, Set<string>>();
    for (const row of grantRows) {
      if (!grantCount.has(row.templateId)) {
        grantCount.set(row.templateId, new Set<string>());
      }
      grantCount.get(row.templateId)!.add(row.accessGroupId);
    }

    const accessibleTemplateIds: string[] = [];
    for (const [templateId, groups] of grantCount) {
      if (groups.size === activeGroupIds.length) {
        accessibleTemplateIds.push(templateId);
      }
    }

    if (accessibleTemplateIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const templates = await db.assessmentTemplate.findMany({
      where: { id: { in: accessibleTemplateIds }, deletedAt: null },
      select: {
        id: true,
        name: true,
        alias: true,
        description: true,
        aggregationMode: true,
        resultsEmailContentApproved: true,
        resultsEmailContentApprovedHash: true,
        resultsEmailSubject: true,
        resultsEmailBodyMarkdown: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: templates.map((t) => ({
        id: t.id,
        name: t.name,
        alias: t.alias,
        description: t.description,
        aggregationMode: t.aggregationMode,
        resultsEmailApproved: isResultsEmailApproved(t),
      })) satisfies TemplateSummary[],
    });
  } catch (error) {
    console.error("Error listing assessment templates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list templates" },
      { status: 500 }
    );
  }
}
