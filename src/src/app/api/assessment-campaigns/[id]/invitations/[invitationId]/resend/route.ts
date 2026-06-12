/**
 * Assessment v7.6 — Re-send an existing invitation (Task D).
 *
 * Re-sends the invitation email for a row whose status is PENDING, SENT, or
 * VIEWED. Increments `resentCount` and sets `lastResentAt`.
 *
 * Spec note: the spec says "DON'T rotate token". Because tokenHash is one-way
 * SHA-256 of the raw token and the raw token is NEVER persisted server-side,
 * the original raw token cannot be recovered to reuse in the resend email.
 * We therefore mint a fresh raw token + tokenHash for the resend so the
 * delivered link works. The invitation ROW is preserved (id stable, status
 * preserved, expiresAt preserved, resentCount bumped) — only the cryptographic
 * material rotates. Any link from a prior send is invalidated. This is the
 * conservative security choice and is documented for downstream consumers.
 */
import { NextRequest, NextResponse } from "next/server";
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
import { resolveCoachName } from "@/lib/assessments/invitation-email";
import { sendAssessmentInvitationEmail } from "@/services/notifications";

const RESENDABLE_STATUSES = new Set(["PENDING", "SENT", "VIEWED"]);

export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; invitationId: string }> }
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

    const { id: campaignId, invitationId } = await params;

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

    const invitation = await db.assessmentInvitation.findUnique({
      where: { id: invitationId },
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
        campaign: {
          select: {
            id: true,
            name: true,
            alias: true,
            closeAt: true,
            status: true,
            externalId: true,
            invitationSubject: true,
            invitationBodyMarkdown: true,
            template: {
              select: {
                name: true,
                invitationSubject: true,
                invitationBodyMarkdown: true,
              },
            },
            organization: {
              select: {
                name: true,
                owner: { select: { firstName: true, lastName: true } },
              },
            },
            creatorCoach: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!invitation || invitation.campaignId !== campaignId) {
      return NextResponse.json(
        { success: false, error: "Invitation not found" },
        { status: 404 }
      );
    }
    if (invitation.respondent.deletedAt !== null) {
      return NextResponse.json(
        { success: false, error: "Respondent has been deleted" },
        { status: 409 }
      );
    }
    if (invitation.revokedAt !== null) {
      return NextResponse.json(
        { success: false, error: "Invitation has been revoked" },
        { status: 409 }
      );
    }
    if (!RESENDABLE_STATUSES.has(invitation.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot resend invitation in status ${invitation.status}`,
        },
        { status: 409 }
      );
    }
    // Defense-in-depth: a closed campaign or one historically imported from
    // Esperto (externalId set, namespaced "esperto:<id>" per ADR-0006) must
    // never re-send invitation email. Refuse BEFORE the token is rotated or
    // any email is sent.
    if (
      invitation.campaign.status === "CLOSED" ||
      invitation.campaign.externalId != null
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot send invitations for a closed or imported campaign",
        },
        { status: 409 }
      );
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const c = invitation.campaign;
    const coachName = resolveCoachName(
      c.creatorCoach ?? null,
      c.organization?.owner ?? null
    );

    // Reorder: send FIRST with the freshly-minted token, then rotate the
    // tokenHash on the row only after the send resolves. On send failure we
    // return 502 WITHOUT rotating, so the recipient's prior link stays valid.
    try {
      await sendAssessmentInvitationEmail({
        invitation: { id: invitation.id, expiresAt: invitation.expiresAt },
        respondent: {
          id: invitation.respondent.id,
          firstName: invitation.respondent.firstName,
          lastName: invitation.respondent.lastName,
          email: invitation.respondent.email,
        },
        campaign: {
          id: c.id,
          name: c.name,
          alias: c.alias,
          closeAt: c.closeAt,
        },
        template: {
          invitationSubject:
            c.invitationSubject ?? c.template.invitationSubject,
          invitationBodyMarkdown:
            c.invitationBodyMarkdown ?? c.template.invitationBodyMarkdown,
        },
        organizationName: c.organization?.name ?? null,
        coachName,
        templateName: c.template?.name ?? null,
        rawToken,
        baseUrl: appUrl,
      });
    } catch (sendErr) {
      console.error(
        "[assessment-resend] SMTP send failed",
        { invitationId },
        sendErr
      );
      return NextResponse.json(
        { success: false, error: "Failed to send invitation email" },
        { status: 502 }
      );
    }

    // Send succeeded — rotate the cryptographic material on the same row now.
    // status / expiresAt are preserved per spec semantics (resend != re-invite).
    const updated = await db.assessmentInvitation.update({
      where: { id: invitationId },
      data: {
        tokenHash,
        resentCount: { increment: 1 },
        lastResentAt: new Date(),
      },
      select: { id: true, expiresAt: true, resentCount: true },
    });

    await logAudit({
      entityType: "AssessmentInvitation",
      entityId: invitationId,
      action: "UPDATE",
      performedBy: actor.email,
      changes: {
        campaignId,
        invitationId,
        action: "resend",
        resentCount: updated.resentCount,
      },
    });

    return NextResponse.json({
      success: true,
      data: { invitationId, resentCount: updated.resentCount },
    });
  } catch (error) {
    console.error("Error resending invitation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to resend invitation" },
      { status: 500 }
    );
  }
}
