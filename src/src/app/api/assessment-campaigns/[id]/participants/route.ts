/**
 * Assessment v7.6 — Campaign participants.
 *
 * POST: batch-assigns respondents. Computes teamPathAtAdd (root-to-leaf
 * snapshot) per respondent. CEO assignment is atomic — any prior CEO row
 * in the same campaign is un-set inside the same transaction. Idempotent:
 * already-attached respondents are silently skipped.
 * DELETE: removes a single respondent from the campaign. Only valid in DRAFT.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assignCampaignParticipantsSchema } from "@/lib/validations";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

interface TeamRow {
  id: string;
  name: string;
  parentTeamId: string | null;
  deletedAt: Date | null;
}

/**
 * Walk parentTeamId from a leaf up to the root, then reverse so the array
 * reads root → leaf. Soft-deleted ancestors are skipped (treated as if
 * not present). Cycle-guard via a seen-set caps the walk at the size of
 * the provided lookup map.
 */
export function buildTeamPath(
  startTeamId: string | null,
  teamsById: Map<string, TeamRow>
): { ids: string[]; labels: string[] } {
  if (!startTeamId) return { ids: [], labels: [] };
  const ids: string[] = [];
  const labels: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = startTeamId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = teamsById.get(cursor);
    if (!node) break;
    if (node.deletedAt === null) {
      ids.push(node.id);
      labels.push(node.name);
    }
    cursor = node.parentTeamId;
  }
  ids.reverse();
  labels.reverse();
  return { ids, labels };
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

    const { id: campaignId } = await params;
    const allowed = await canManageCampaign(
      asAccessDb(db),
      actor,
      campaignId,
      "write"
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    const campaign = await db.assessmentCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, organizationId: true, status: true },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }
    if (campaign.status !== "DRAFT") {
      return NextResponse.json(
        {
          success: false,
          error: "Participants can only be assigned in DRAFT status",
        },
        { status: 409 }
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

    const validation = assignCampaignParticipantsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }
    const data = validation.data;

    // Validate all respondentIds belong to the campaign's organization.
    const respondents = await db.orgRespondent.findMany({
      where: {
        id: { in: data.respondentIds },
        organizationId: campaign.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        teamId: true,
        firstName: true,
        lastName: true,
      },
    });
    if (respondents.length !== data.respondentIds.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            "One or more respondentIds do not belong to this campaign's organization",
        },
        { status: 400 }
      );
    }

    // Load all (non-deleted) teams in the org for path computation.
    const teams = (await db.orgTeam.findMany({
      where: { organizationId: campaign.organizationId },
      select: { id: true, name: true, parentTeamId: true, deletedAt: true },
    })) as TeamRow[];
    const teamsById = new Map<string, TeamRow>();
    for (const t of teams) teamsById.set(t.id, t);

    // Load existing participants — for idempotency we skip respondents
    // already attached.
    const existing = await db.assessmentCampaignParticipant.findMany({
      where: { campaignId },
      select: { respondentId: true },
    });
    const existingIds = new Set(existing.map((p) => p.respondentId));

    const respondentsToAdd = respondents.filter((r) => !existingIds.has(r.id));

    const created = await db.$transaction(async (tx) => {
      // If CEO is being (re-)assigned, un-set any prior CEO atomically.
      if (data.ceoRespondentId) {
        await tx.assessmentCampaignParticipant.updateMany({
          where: { campaignId, isCEO: true },
          data: { isCEO: false },
        });
      }

      // Single batched insert (no per-row N+1). The created rows are never read
      // back — only the count feeds `added`/`skipped` — so createMany is exact.
      const createData = respondentsToAdd.map((r) => {
        const path = buildTeamPath(r.teamId, teamsById);
        return {
          campaignId,
          respondentId: r.id,
          isCEO: data.ceoRespondentId === r.id,
          teamPathAtAdd: path.ids,
          teamLabelsAtAdd: path.labels,
        };
      });

      const result = await tx.assessmentCampaignParticipant.createMany({
        data: createData,
      });

      // If the chosen CEO is an *already-existing* participant, set its
      // flag here. (We just un-set every prior CEO above.)
      if (
        data.ceoRespondentId &&
        existingIds.has(data.ceoRespondentId)
      ) {
        await tx.assessmentCampaignParticipant.update({
          where: {
            campaignId_respondentId: {
              campaignId,
              respondentId: data.ceoRespondentId,
            },
          },
          data: { isCEO: true },
        });
      }

      return result.count;
    });

    await logAudit({
      entityType: "AssessmentCampaignParticipant",
      entityId: campaignId,
      action: "CREATE",
      performedBy: actor.email,
      changes: {
        campaignId,
        addedRespondentIds: respondentsToAdd.map((r) => r.id),
        skippedRespondentIds: data.respondentIds.filter((id) =>
          existingIds.has(id)
        ),
        ceoRespondentId: data.ceoRespondentId ?? null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          added: created,
          skipped: data.respondentIds.length - created,
          ceoRespondentId: data.ceoRespondentId ?? null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error assigning participants:", error);
    return NextResponse.json(
      { success: false, error: "Failed to assign participants" },
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

    const { id: campaignId } = await params;
    const { searchParams } = new URL(request.url);
    const respondentId = searchParams.get("respondentId");
    if (!respondentId) {
      return NextResponse.json(
        { success: false, error: "respondentId query param required" },
        { status: 400 }
      );
    }

    const allowed = await canManageCampaign(
      asAccessDb(db),
      actor,
      campaignId,
      "write"
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    const campaign = await db.assessmentCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }
    if (campaign.status !== "DRAFT") {
      return NextResponse.json(
        {
          success: false,
          error: "Participants can only be removed in DRAFT status",
        },
        { status: 409 }
      );
    }

    const existing = await db.assessmentCampaignParticipant.findUnique({
      where: {
        campaignId_respondentId: { campaignId, respondentId },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Participant not found" },
        { status: 404 }
      );
    }

    await db.assessmentCampaignParticipant.delete({
      where: {
        campaignId_respondentId: { campaignId, respondentId },
      },
    });

    await logAudit({
      entityType: "AssessmentCampaignParticipant",
      entityId: campaignId,
      action: "DELETE",
      performedBy: actor.email,
      changes: { campaignId, respondentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing participant:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove participant" },
      { status: 500 }
    );
  }
}
