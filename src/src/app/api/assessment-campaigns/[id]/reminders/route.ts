/**
 * Assessment v7.6 — Send reminder emails to non-responders (Task N).
 *
 * Bulk-friendly reminder send. Defaults to "all pending participants" when
 * no IDs are passed; otherwise restricts to the supplied subset. Reuses the
 * existing invitation row when one is present (status PENDING/SENT/VIEWED)
 * and rotates the cryptographic token on that row — the row id, expiresAt,
 * and status are preserved. Mirrors the security trade-off documented in
 * `/api/assessment-campaigns/[id]/invitations/[invitationId]/resend`:
 * tokenHash is one-way, so the raw token cannot be recovered for an
 * existing row; a fresh raw token is minted and any prior link is
 * invalidated. From the coach's perspective the row is the same row.
 *
 * Body:
 *   { participantIds?: string[] }
 *     - omitted / empty   → target ALL non-submitted, non-removed
 *                            participants on the campaign
 *     - present           → target only those participant ids
 *
 * Campaign must be ACTIVE (DRAFT/CLOSED → 409 CAMPAIGN_NOT_ACTIVE).
 * Per-participant skips do NOT 500 the batch:
 *   - already submitted (invitation SUBMITTED or AssessmentSubmission row)
 *   - no invitation row yet (Task D /invite is the first-send path)
 *   - respondent soft-deleted
 *   - revoked invitation
 *   - SMTP send failure
 *
 * Returns: { sent: number, skipped: number, failed: Array<{participantId, reason}> }.
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

const ReminderBodySchema = z.object({
  participantIds: z.array(z.string().min(1)).optional(),
});

type FailedEntry = { participantId: string; reason: string };

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

    // Parse body — treat missing/invalid as `{}` (default = all pending).
    let rawBody: unknown = {};
    try {
      rawBody = await request.json();
    } catch {
      rawBody = {};
    }
    const parsed = ReminderBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid body",
        },
        { status: 400 }
      );
    }
    const requestedIds = parsed.data.participantIds;

    // Auth-fail hidden as 404 — matches close/Task F pattern.
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
    // never send invitation email. Refuse BEFORE the loop / any send. This
    // takes precedence over the generic CAMPAIGN_NOT_ACTIVE check below so a
    // CLOSED campaign returns the explicit no-send error.
    if (campaign.status === "CLOSED" || campaign.externalId != null) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot send invitations for a closed or imported campaign",
        },
        { status: 409 }
      );
    }
    if (campaign.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, code: "CAMPAIGN_NOT_ACTIVE" },
        { status: 409 }
      );
    }

    // Resolve target participant set — must be active (respondent not
    // soft-deleted) and either explicitly listed or implicitly all.
    const activeParticipants = campaign.participants.filter(
      (p) => p.respondent && p.respondent.deletedAt === null
    );

    let targets = activeParticipants;
    if (requestedIds && requestedIds.length > 0) {
      const wanted = new Set(requestedIds);
      targets = activeParticipants.filter((p) =>
        wanted.has(p.respondentId)
      );
    }

    if (targets.length === 0) {
      // No targets — return a 200 with zeros instead of 400; the UI may
      // call this from a "remind all" button on a fully-submitted campaign.
      await logAudit({
        entityType: "AssessmentInvitation",
        entityId: campaignId,
        action: "UPDATE",
        performedBy: actor.email,
        changes: {
          campaignId,
          action: "reminder-batch",
          sent: 0,
          skipped: 0,
          failed: 0,
          note: "no-targets",
        },
      });
      return NextResponse.json({
        success: true,
        data: { sent: 0, skipped: 0, failed: [] as FailedEntry[] },
      });
    }

    // Existing invitation rows for the target subset.
    const existing = await db.assessmentInvitation.findMany({
      where: {
        campaignId,
        respondentId: { in: targets.map((t) => t.respondentId) },
      },
    });
    const existingByRespondentId = new Map(
      existing.map((row) => [row.respondentId, row])
    );

    // Submissions for the target subset (defensive: catches edge cases
    // where SUBMITTED-status invitation flip lagged or migration data
    // left an inconsistent state).
    const submissions = await db.assessmentSubmission.findMany({
      where: {
        campaignId,
        respondentId: { in: targets.map((t) => t.respondentId) },
      },
      select: { respondentId: true },
    });
    const submittedRespondentIds = new Set(
      submissions
        .map((s) => s.respondentId)
        .filter((id): id is string => Boolean(id))
    );

    const closeAt = campaign.closeAt;
    const fallbackExpiresAt = new Date(Date.now() + NINETY_DAYS_MS);
    const expiresAt = closeAt ?? fallbackExpiresAt;

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    let sent = 0;
    let skipped = 0;
    const failed: FailedEntry[] = [];

    for (const participant of targets) {
      const respondent = participant.respondent!;
      const prior = existingByRespondentId.get(participant.respondentId);

      // Skip: already submitted.
      if (
        submittedRespondentIds.has(participant.respondentId) ||
        (prior && prior.status === "SUBMITTED") ||
        (prior && prior.submittedAt !== null)
      ) {
        skipped += 1;
        continue;
      }
      // Skip: revoked invitation.
      if (prior && prior.revokedAt !== null) {
        skipped += 1;
        continue;
      }
      // Skip: no invitation row yet — reminders only nudge people who
      // were already invited (use /invite to first-send).
      if (!prior) {
        skipped += 1;
        continue;
      }

      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);

      let invitationRow: { id: string; expiresAt: Date };
      try {
        // Reuse the same row — bump resentCount + lastResentAt, refresh
        // expiresAt (in case the prior was minted before the campaign
        // closeAt was set), and rotate the token. Status preserved.
        invitationRow = await db.assessmentInvitation.update({
          where: { id: prior.id },
          data: {
            tokenHash,
            expiresAt,
            resentCount: { increment: 1 },
            lastResentAt: new Date(),
          },
          select: { id: true, expiresAt: true },
        });
      } catch (writeErr) {
        console.error(
          "[assessment-reminders] failed to update invitation row",
          { respondentId: participant.respondentId },
          writeErr
        );
        failed.push({
          participantId: participant.respondentId,
          reason: "write-failed",
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
        sent += 1;
      } catch (sendErr) {
        console.error(
          "[assessment-reminders] SMTP send failed",
          {
            respondentId: participant.respondentId,
            invitationId: invitationRow.id,
          },
          sendErr
        );
        failed.push({
          participantId: participant.respondentId,
          reason: "smtp-failed",
        });
      }
    }

    await logAudit({
      entityType: "AssessmentInvitation",
      entityId: campaignId,
      action: "UPDATE",
      performedBy: actor.email,
      changes: {
        campaignId,
        action: "reminder-batch",
        sent,
        skipped,
        failed: failed.length,
        targets: targets.length,
        requestedIds: requestedIds ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      data: { sent, skipped, failed },
    });
  } catch (error) {
    console.error("Error sending reminders:", error);
    return NextResponse.json(
      { success: false, error: "Failed to send reminders" },
      { status: 500 }
    );
  }
}
