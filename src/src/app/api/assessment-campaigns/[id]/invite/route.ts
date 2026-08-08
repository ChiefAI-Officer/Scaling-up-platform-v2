/**
 * Assessment v7.6 — Manual invitation send: LATE-ADD / RESEND path (Task D + Wave D R1-M6).
 *
 * POST body:
 *   { respondentIds?: string[] }  // omit to invite all active participants
 *
 * Wave D (R1-M6): the campaign's INITIAL bulk send is now performed automatically
 * by the Wave-D Inngest fan-out (a later task). This route is therefore the
 * *late-add / resend* path only — it serves sending to specific late-added
 * recipients (or re-sending) AFTER the initial auto-send has completed
 * (`invitesSentAt` set). A bulk early-send of a campaign that has NOT yet done
 * its automatic initial send (`invitesSentAt IS NULL`) is REJECTED with 409, so
 * a coach cannot double-send / bypass the fan-out.
 *
 * The per-recipient create+send logic is shared with the fan-out via
 * `sendInvitesBatch` (lib/assessments/invite-send.ts). Per-respondent semantics:
 *   - "sent"            — new invitation row created OR existing PENDING row
 *                         re-keyed with a fresh raw token and emailed
 *   - "already-invited" — row already exists in SENT/VIEWED/SUBMITTED status
 *                         OR has been revoked (revokedAt set)
 *   - "send-failed"     — row written (status PENDING) but SMTP throw —
 *                         caller can call /resend later
 *
 * Hard cap: 25 respondents per request (INVITE_BATCH_CAP). Above that returns 400.
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
  resolveCoachName,
  resolveCoachLogo,
} from "@/lib/assessments/invitation-email";
import { isInviteEmailChromeEnabled } from "@/lib/assessments/wave-p-flags";
import {
  prepareAssessmentInvitationEmail,
  sendAssessmentInvitationEmail,
} from "@/services/notifications";
import {
  createStableOriginalTokenAdapter,
  sendInvitesBatch,
  StableInvitationCleanupAuditError,
  StableInvitationQuarantineError,
  INVITE_BATCH_CAP,
} from "@/lib/assessments/invite-send";
import { waveDAutoSendEnabled } from "@/lib/assessments/wave-d-feature-flags";
import { isStableInvitationLinksEnabled } from "@/lib/assessments/wave-j65-flags";
import { inngest } from "@/inngest/client";
import { STABLE_INVITATION_REJECTION_RETRY_EVENT } from "@/inngest/functions/stable-invitation-rejection-retry-event";
import {
  persistStableInvitationRejectionRepairPending,
  type StableInvitationRejectionOutboxDb,
} from "@/lib/assessments/stable-invitation-rejection-outbox";

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
            alias: true,
            name: true,
            invitationSubject: true,
            invitationBodyMarkdown: true,
          },
        },
        organization: {
          select: {
            name: true,
            owner: {
              select: { firstName: true, lastName: true, profileImage: true },
            },
          },
        },
        creatorCoach: {
          select: { firstName: true, lastName: true, profileImage: true },
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
    if (campaign.organizationId === null) {
      return NextResponse.json(
        { success: false, error: "Campaign organization is required" },
        { status: 409 }
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

    // Wave D (R1-M6): when auto-send is ON, the initial bulk send is automatic
    // (the fan-out). Until it has completed (`invitesSentAt` set), this manual
    // route must not perform a bulk early-send — that would double-send / bypass
    // the fan-out. It only serves late-add / resend AFTER the automatic initial
    // send. The gate is auto-send-flag-gated: with the flag OFF (the default,
    // dark merge) there is NO automatic send to defer to, so the manual /invite
    // must work for an unsent campaign exactly as on origin/main — gating it
    // would strand the coach with a permanent 409 (the core new-campaign flow).
    if (waveDAutoSendEnabled() && campaign.invitesSentAt == null) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This campaign will send its invitations automatically; manual bulk send is disabled until the initial send completes.",
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

    if (targets.length > INVITE_BATCH_CAP) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many recipients in one call. Split into multiple calls (max ${INVITE_BATCH_CAP}).`,
        },
        { status: 400 }
      );
    }

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    const coachName = resolveCoachName(
      campaign.creatorCoach ?? null,
      campaign.organization?.owner ?? null
    );
    const organizationName = campaign.organization?.name ?? null;
    const templateName = campaign.template?.name ?? null;

    // Wave P — invitation-email chrome (#2.1 coach logo + #2.4 larger CTA).
    // Flag evaluated ONCE per send; logo identity MIRRORS resolveCoachName
    // (creator coach ?? org owner — the owner IS a Coach row).
    const chrome = isInviteEmailChromeEnabled({
      organizationId: campaign.organizationId,
      templateId: campaign.templateId,
    })
      ? ("waveP" as const)
      : ("legacy" as const);
    const { coachLogoUrl, logoRejectedReason } = resolveCoachLogo(
      campaign.creatorCoach ?? null,
      campaign.organization?.owner ?? null
    );
    // PII-free observability: variant + logo-gate outcome only — NEVER the URL.
    console.log("[assessment-invite] email-chrome", {
      campaignId,
      chromeVariant: chrome,
      logoIncluded: chrome === "waveP" && logoRejectedReason === null,
      logoRejectedReason,
    });
    const stableLinksEnabled = isStableInvitationLinksEnabled(campaign.alias);

    // Shared per-recipient create+send (also used by the Wave-D fan-out).
    let inviteResult;
    try {
      inviteResult = await sendInvitesBatch(
        {
          db,
          sendEmail: sendAssessmentInvitationEmail,
          ...(stableLinksEnabled
            ? {
                prepareEmail: (data) =>
                  prepareAssessmentInvitationEmail({
                    ...data,
                    redactErrors: true,
                    coalesceVerification: true,
                  }),
                stableTokens: createStableOriginalTokenAdapter(db),
                enqueueRejectedQuarantineRetry: async (input) => {
                  await inngest.send({
                    id: `stable-invitation-rejection-${input.tokenId}`,
                    name: STABLE_INVITATION_REJECTION_RETRY_EVENT,
                    data: input,
                  });
                },
                persistRejectedCleanupAudit: (input) =>
                  persistStableInvitationRejectionRepairPending(
                    db as unknown as StableInvitationRejectionOutboxDb,
                    {
                      invitationId: input.invitationId,
                      tokenId: input.tokenId,
                      performedBy: actor.email,
                    },
                  ),
              }
            : {}),
        },
        {
          campaign: {
            id: campaign.id,
            name: campaign.name,
            alias: campaign.alias,
            closeAt: campaign.closeAt,
            invitationSubject: campaign.invitationSubject,
            invitationBodyMarkdown: campaign.invitationBodyMarkdown,
            invitationBodyHtml: campaign.invitationBodyHtml,
            template: {
              alias: campaign.template.alias,
              invitationSubject: campaign.template.invitationSubject,
              invitationBodyMarkdown: campaign.template.invitationBodyMarkdown,
            },
          },
          recipients: targets.map((p) => ({
            respondentId: p.respondentId,
            respondent: {
              id: p.respondent!.id,
              firstName: p.respondent!.firstName,
              lastName: p.respondent!.lastName,
              email: p.respondent!.email,
            },
          })),
          baseUrl: appUrl,
          organizationName,
          coachName,
          templateName,
          chrome,
          coachLogoUrl,
          stableLinksEnabled,
        },
      );
    } catch (error) {
      if (error instanceof StableInvitationCleanupAuditError) {
        console.error("[assessment-invite] cleanup audit persistence failed", {
          campaignId,
          disposition: "CRITICAL_AUDIT_PERSIST_FAILED",
        });
        return NextResponse.json(
          {
            success: false,
            error: "Failed to persist invitation cleanup audit",
          },
          { status: 503 },
        );
      }
      if (error instanceof StableInvitationQuarantineError) {
        console.error("[assessment-invite] rejected token quarantine failed", {
          campaignId,
          disposition: "DEFINITE_REJECTION_QUARANTINE_EXHAUSTED",
        });
        return NextResponse.json(
          {
            success: false,
            error: "Failed to quarantine rejected invitation token",
          },
          { status: 503 },
        );
      }
      throw error;
    }
    const { results } = inviteResult;

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
