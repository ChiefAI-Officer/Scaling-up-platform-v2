/**
 * Assessment v7.6 — Send invitations to campaign participants (Task D).
 *
 * POST body:
 *   { respondentIds?: string[] }  // omit to invite all active participants
 *
 * Per-respondent semantics:
 *   - "sent"            — new invitation row created OR existing PENDING row
 *                         re-keyed with a fresh raw token and emailed
 *   - "already-invited" — row already exists in SENT/VIEWED/SUBMITTED status
 *                         OR has been revoked (revokedAt set)
 *   - "send-failed"     — row written (status PENDING) but SMTP throw —
 *                         caller can call /resend later
 *
 * Hard cap: 25 respondents per request. Above that returns 400.
 * The cap exists to keep SMTP latency inside Vercel's 30s budget; the
 * UI is expected to chunk larger lists.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import {
  generateRawToken,
  hashToken,
} from "@/lib/assessments/invitation-tokens";
import { sendAssessmentInvitationEmail } from "@/services/notifications";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const BATCH_CAP = 25;

const InviteBodySchema = z.object({
  respondentIds: z.array(z.string().min(1)).optional(),
});

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
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const campaign = await db.assessmentCampaign.findUnique({
      where: { id: campaignId },
      include: {
        template: {
          select: {
            invitationSubject: true,
            invitationBodyMarkdown: true,
          },
        },
        participants: {
          include: {
            respondent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Defense-in-depth: a closed campaign or one historically imported from
    // Esperto (externalId set, namespaced "esperto:<id>" per ADR-0006) must
    // never send invitation email. Refuse BEFORE any invitation row is
    // written or any email is sent.
    if (campaign.status === "CLOSED" || campaign.externalId != null) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot send invitations for a closed or imported campaign",
        },
        { status: 409 }
      );
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is allowed — defaults to invite-all-participants.
      body = {};
    }
    const parsed = InviteBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues },
        { status: 400 }
      );
    }
    const { respondentIds: requestedIds } = parsed.data;

    // Resolve target respondent set from participants.
    const activeParticipants = campaign.participants.filter(
      (p) => p.respondent && p.respondent.deletedAt === null
    );

    let targets = activeParticipants;
    if (requestedIds && requestedIds.length > 0) {
      const wanted = new Set(requestedIds);
      targets = activeParticipants.filter((p) => wanted.has(p.respondentId));
    }

    if (targets.length === 0) {
      return NextResponse.json(
        { success: false, error: "No matching participants to invite" },
        { status: 400 }
      );
    }

    if (targets.length > BATCH_CAP) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many recipients in one call. Split into multiple calls (max ${BATCH_CAP}).`,
        },
        { status: 400 }
      );
    }

    // Load existing invitation rows for this campaign + target subset.
    const existing = await db.assessmentInvitation.findMany({
      where: {
        campaignId,
        respondentId: { in: targets.map((t) => t.respondentId) },
      },
    });
    const existingByRespondentId = new Map(
      existing.map((row) => [row.respondentId, row])
    );

    const closeAt = campaign.closeAt;
    const fallbackExpiresAt = new Date(Date.now() + NINETY_DAYS_MS);
    const expiresAt = closeAt ?? fallbackExpiresAt;

    const results: Array<{
      respondentId: string;
      status: "sent" | "already-invited" | "send-failed";
    }> = [];

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    for (const participant of targets) {
      const respondent = participant.respondent!;
      const prior = existingByRespondentId.get(participant.respondentId);

      // Existing row: only PENDING is re-sendable here (SENT/VIEWED already
      // have a valid token in flight — use /resend to bump those without
      // rotating the token).
      if (prior && prior.status !== "PENDING") {
        results.push({
          respondentId: participant.respondentId,
          status: "already-invited",
        });
        continue;
      }
      if (prior && prior.revokedAt) {
        results.push({
          respondentId: participant.respondentId,
          status: "already-invited",
        });
        continue;
      }

      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);

      let invitationRow: { id: string; expiresAt: Date };
      try {
        if (prior) {
          // Re-key PENDING row with a fresh token + refreshed expiresAt.
          invitationRow = await db.assessmentInvitation.update({
            where: { id: prior.id },
            data: {
              tokenHash,
              expiresAt,
              status: "PENDING",
            },
            select: { id: true, expiresAt: true },
          });
        } else {
          invitationRow = await db.assessmentInvitation.create({
            data: {
              campaignId,
              respondentId: participant.respondentId,
              tokenHash,
              status: "PENDING",
              expiresAt,
            },
            select: { id: true, expiresAt: true },
          });
        }
      } catch (writeErr) {
        console.error(
          "[assessment-invite] failed to write invitation row",
          writeErr
        );
        results.push({
          respondentId: participant.respondentId,
          status: "send-failed",
        });
        continue;
      }

      try {
        await sendAssessmentInvitationEmail({
          invitation: invitationRow,
          respondent: {
            id: respondent.id,
            firstName: respondent.firstName,
            lastName: respondent.lastName,
            email: respondent.email,
          },
          campaign: {
            id: campaign.id,
            name: campaign.name,
            alias: campaign.alias,
            closeAt: campaign.closeAt,
          },
          template: {
            invitationSubject:
              campaign.invitationSubject ?? campaign.template.invitationSubject,
            invitationBodyMarkdown:
              campaign.invitationBodyMarkdown ??
              campaign.template.invitationBodyMarkdown,
          },
          rawToken,
          baseUrl: appUrl,
        });

        await db.assessmentInvitation.update({
          where: { id: invitationRow.id },
          data: { status: "SENT", sentAt: new Date() },
        });
        results.push({
          respondentId: participant.respondentId,
          status: "sent",
        });
      } catch (sendErr) {
        console.error(
          "[assessment-invite] SMTP send failed",
          { respondentId: participant.respondentId, invitationId: invitationRow.id },
          sendErr
        );
        // Leave row as PENDING — caller can retry via /resend or re-invite.
        results.push({
          respondentId: participant.respondentId,
          status: "send-failed",
        });
      }
    }

    await logAudit({
      entityType: "AssessmentInvitation",
      entityId: campaignId,
      action: "CREATE",
      performedBy: actor.email,
      changes: {
        campaignId,
        results,
      },
    });

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("Error inviting participants:", error);
    return NextResponse.json(
      { success: false, error: "Failed to invite participants" },
      { status: 500 }
    );
  }
}
