/**
 * Assessment v7.6 — INVITED-mode form-data fetch (Task D).
 *
 * Reads the iron-session cookie set by /exchange, re-validates lifecycle
 * gates against the DB (never trust the cookie's expiresAt for gating —
 * the cookie is just an identifier), then returns the questions+sections
 * the respondent needs to render the form.
 *
 * Returns:
 *   { campaign: { name, alias, templateAlias, organizationName }, version: { language }, sections, questions }
 *
 * Any lifecycle-gate failure → 410. No session → 401.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getInvitationSession } from "@/lib/assessments/invitation-cookie";
import { isCustomSlidesEnabled } from "@/lib/assessments/wave-m-flags";
import { loadSafeSlides } from "@/lib/assessments/load-safe-slides";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/**
 * 410 — a lifecycle gate refused. Every call site below is reached only AFTER
 * the session checks above (missing/mismatched cookie → 401), so a 410 always
 * implies a live sealed invitation cookie for this campaign.
 *
 * Wave OSR (#71): the 410 now echoes `respondentKey` — the same opaque
 * invitation cuid the 200 path already returns, scoped to the holder's own
 * session, never PII. It is load-bearing, not informational.
 *
 * `sessionStorage` is per-TAB while cookies are per-origin, so "this browser
 * holds a live invitation" does NOT establish WHOSE report sits in a tab's
 * stored slot. Two co-invitees on one browser: A submits in tab 1 (A's report
 * lands in tab 1's slot); B exchanges in tab 2, which replaces the shared
 * cookie and purges only TAB 2's storage; a later reload of tab 1 would 410 on
 * B's cookie and render A's report to B. Echoing the key lets the client
 * require slot-owner == cookie-owner before rehydrating, which closes that.
 */
function gateFailed(respondentKey?: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: "This survey is no longer available.",
      ...(respondentKey ? { respondentKey } : {}),
    },
    { status: 410, headers: NO_STORE_HEADERS }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ campaignAlias: string }> }
) {
  try {
    const { campaignAlias } = await params;
    const session = await getInvitationSession(campaignAlias);

    if (!session.invitationId || session.campaignAlias !== campaignAlias) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const invitation = await db.assessmentInvitation.findUnique({
      where: { id: session.invitationId },
      include: {
        campaign: {
          include: {
            organization: { select: { name: true } },
            template: { select: { alias: true } },
            version: {
              select: {
                id: true,
                language: true,
                questions: true,
                sections: true,
              },
            },
          },
        },
      },
    });

    if (!invitation || invitation.campaign.alias !== campaignAlias) {
      return NextResponse.json(
        { success: false, error: "Invitation not found" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const now = new Date();
    // SEC-M6: a soft-deleted campaign is no longer available.
    if (invitation.campaign.deletedAt !== null) return gateFailed(invitation.id);
    if (invitation.revokedAt !== null) return gateFailed(invitation.id);
    if (now >= invitation.expiresAt) return gateFailed(invitation.id);
    if (invitation.status === "SUBMITTED") return gateFailed(invitation.id);
    if (invitation.campaign.status !== "ACTIVE") return gateFailed(invitation.id);
    if (now < invitation.campaign.openAt) return gateFailed(invitation.id);
    if (
      invitation.campaign.closeAt !== null &&
      now >= invitation.campaign.closeAt
    ) {
      return gateFailed(invitation.id);
    }

    // Return ALL question types — the client's QuestionInput component
    // handles rendering for SLIDER_LIKERT, TEXT, NUMBER, and MULTI_CHOICE.
    const allQuestions = invitation.campaign.version.questions as Array<
      Record<string, unknown>
    >;

    // Wave J-1: resolve whether THIS respondent is the campaign CEO. The flag
    // lives on the AssessmentCampaignParticipant row (unique per
    // campaignId+respondentId, matching this invitation). Drives the SU-Full
    // CEO-only behavior: the CEO sees the S_BACKGROUND FTE section + the
    // growth-phase interstitial; team members do not. Fail-safe: no participant
    // row → not CEO.
    const participant = await db.assessmentCampaignParticipant.findUnique({
      where: {
        campaignId_respondentId: {
          campaignId: invitation.campaignId,
          respondentId: invitation.respondentId,
        },
      },
      select: { isCEO: true },
    });
    const isCEO = participant?.isCEO === true;

    // Wave M (#19): coach-authored custom slides. Gated by the default-OFF flag
    // (campaign-id canary + global enable + hard kill). When ON, parse + SANITIZE
    // server-side (the client never sanitizes — R1-Med-2) and emit a typed
    // SafeSlide[] payload the client weaves via mergeCustomSlides. Flag-off ⇒
    // omit the field entirely so the participant flow is byte-for-byte unchanged.
    const customSlides = isCustomSlidesEnabled(invitation.campaignId)
      ? loadSafeSlides(invitation.campaign.customSlides)
      : undefined;

    return NextResponse.json(
      {
        success: true,
        data: {
          isCEO,
          ...(customSlides && customSlides.length > 0 ? { customSlides } : {}),
          // Opaque per-respondent id (the invitation cuid) for keying the
          // client-side localStorage draft. The invitation id is scoped to
          // THIS respondent's own authenticated session, so returning it to
          // that same respondent is not a leak (localStorage is per-origin/
          // per-browser anyway). NOT PII — never the email/name.
          respondentKey: invitation.id,
          campaign: {
            name: invitation.campaign.name,
            alias: invitation.campaign.alias,
            templateAlias: invitation.campaign.template?.alias ?? null,
            organizationName: invitation.campaign.organization?.name ?? null,
            // Task 6b: expose toggle so the client can branch thank-you copy.
            sendResultsToRespondent: invitation.campaign.sendResultsToRespondent,
          },
          version: { language: invitation.campaign.version.language },
          sections: invitation.campaign.version.sections,
          questions: allQuestions,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[assessment-me] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load survey" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
