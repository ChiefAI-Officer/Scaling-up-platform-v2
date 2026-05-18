/**
 * Assessment v7.6 — /api/assessment-campaigns/[id]/respondents.
 *
 * GET (Task F):
 *   Returns the campaign overview (stats + header info) AND the full
 *   respondent table in a single round-trip so the page renders without
 *   a waterfall.
 *
 * POST (Task L):
 *   Adds an existing OrgRespondent (from the campaign's Organization) to
 *   the campaign's participant set after creation. Status semantics:
 *     - DRAFT  → create participant row only
 *     - ACTIVE → create participant row + PENDING invitation row (no SMTP
 *                here; coach uses Resend / bulk Invite to actually send).
 *                This keeps the request fast and out of the SMTP latency
 *                budget — the wizard's bulk-invite path is the place to
 *                send email.
 *     - CLOSED → 409 (terminal state)
 *
 * Auth:
 *   - 401 unauthenticated.
 *   - 404 if canManageCampaign(actor, id, "read"|"write") === false.
 *     (We return 404 — not 403 — so a coach probing other coaches'
 *     campaign IDs can't distinguish "not yours" from "doesn't exist".
 *     Same pattern as Task I's close route.)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import {
  asCampaignDetailDb,
  getCampaignOverview,
  getCampaignRespondents,
} from "@/lib/assessments/campaign-detail";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import {
  generateRawToken,
  hashToken,
} from "@/lib/assessments/invitation-tokens";
import { buildTeamPath } from "@/app/api/assessment-campaigns/[id]/participants/route";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const AddRespondentBodySchema = z.object({
  orgRespondentId: z.string().min(1),
});

export async function GET(
  _request: NextRequest,
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

    const allowed = await canManageCampaign(
      asAccessDb(db),
      actor,
      id,
      "read"
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    const detailDb = asCampaignDetailDb(db);
    const [overview, respondents] = await Promise.all([
      getCampaignOverview(detailDb, id),
      getCampaignRespondents(detailDb, id),
    ]);

    return NextResponse.json({
      success: true,
      data: { overview, respondents },
    });
  } catch (error) {
    console.error("Error fetching campaign respondents:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch campaign respondents" },
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

    const { id: campaignId } = await params;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    const parsed = AddRespondentBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid body",
        },
        { status: 400 }
      );
    }
    const { orgRespondentId } = parsed.data;

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
      select: {
        id: true,
        organizationId: true,
        status: true,
        closeAt: true,
      },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }
    if (campaign.status === "CLOSED") {
      return NextResponse.json(
        {
          success: false,
          code: "CAMPAIGN_CLOSED",
          error: "Cannot add respondents to a closed campaign",
        },
        { status: 409 }
      );
    }

    const respondent = await db.orgRespondent.findUnique({
      where: { id: orgRespondentId },
      select: {
        id: true,
        organizationId: true,
        teamId: true,
        firstName: true,
        lastName: true,
        email: true,
        deletedAt: true,
      },
    });
    if (!respondent || respondent.deletedAt !== null) {
      return NextResponse.json(
        { success: false, error: "Respondent not found" },
        { status: 404 }
      );
    }
    if (respondent.organizationId !== campaign.organizationId) {
      return NextResponse.json(
        {
          success: false,
          code: "WRONG_ORGANIZATION",
          error: "Respondent belongs to a different organization",
        },
        { status: 422 }
      );
    }

    const existing = await db.assessmentCampaignParticipant.findUnique({
      where: {
        campaignId_respondentId: {
          campaignId,
          respondentId: orgRespondentId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          code: "ALREADY_PARTICIPANT",
          error: "Respondent is already a participant on this campaign",
        },
        { status: 409 }
      );
    }

    // Snapshot teamPath at add-time (matches the participants route convention).
    const teams = await db.orgTeam.findMany({
      where: { organizationId: campaign.organizationId },
      select: { id: true, name: true, parentTeamId: true, deletedAt: true },
    });
    const teamsById = new Map<
      string,
      { id: string; name: string; parentTeamId: string | null; deletedAt: Date | null }
    >();
    for (const t of teams) teamsById.set(t.id, t);
    const path = buildTeamPath(respondent.teamId, teamsById);

    // Decide whether to mint an invitation row. Per spec: only ACTIVE
    // campaigns get an invitation row here. DRAFT skips; CLOSED was
    // rejected above.
    const mintInvitation = campaign.status === "ACTIVE";

    const result = await db.$transaction(async (tx) => {
      const participant = await tx.assessmentCampaignParticipant.create({
        data: {
          campaignId,
          respondentId: orgRespondentId,
          isCEO: false,
          teamPathAtAdd: path.ids,
          teamLabelsAtAdd: path.labels,
        },
        select: {
          id: true,
          campaignId: true,
          respondentId: true,
          isCEO: true,
          addedAt: true,
        },
      });

      let invitation: { id: string; status: string; expiresAt: Date } | null =
        null;
      if (mintInvitation) {
        const rawToken = generateRawToken();
        const tokenHash = hashToken(rawToken);
        const fallbackExpiresAt = new Date(Date.now() + NINETY_DAYS_MS);
        const expiresAt = campaign.closeAt ?? fallbackExpiresAt;
        const row = await tx.assessmentInvitation.create({
          data: {
            campaignId,
            respondentId: orgRespondentId,
            tokenHash,
            status: "PENDING",
            expiresAt,
          },
          select: { id: true, status: true, expiresAt: true },
        });
        invitation = row;
      }

      return { participant, invitation };
    });

    await logAudit({
      entityType: "AssessmentCampaignParticipant",
      entityId: result.participant.id,
      action: "CREATE",
      performedBy: actor.email,
      changes: {
        campaignId,
        respondentId: orgRespondentId,
        invitationCreated: result.invitation !== null,
        campaignStatus: campaign.status,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          participant: result.participant,
          invitation: result.invitation,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error adding respondent to campaign:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add respondent to campaign" },
      { status: 500 }
    );
  }
}
