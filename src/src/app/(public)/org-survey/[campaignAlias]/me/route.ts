/**
 * Assessment v7.6 — INVITED-mode form-data fetch (Task D).
 *
 * Reads the iron-session cookie set by /exchange, re-validates lifecycle
 * gates against the DB (never trust the cookie's expiresAt for gating —
 * the cookie is just an identifier), then returns the questions+sections
 * the respondent needs to render the form.
 *
 * Returns:
 *   { campaign: { name, alias, organizationName }, version: { language }, sections, questions }
 *
 * Any lifecycle-gate failure → 410. No session → 401.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getInvitationSession } from "@/lib/assessments/invitation-cookie";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function gateFailed(): NextResponse {
  return NextResponse.json(
    { success: false, error: "This survey is no longer available." },
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
    if (invitation.campaign.deletedAt !== null) return gateFailed();
    if (invitation.revokedAt !== null) return gateFailed();
    if (now >= invitation.expiresAt) return gateFailed();
    if (invitation.status === "SUBMITTED") return gateFailed();
    if (invitation.campaign.status !== "ACTIVE") return gateFailed();
    if (now < invitation.campaign.openAt) return gateFailed();
    if (
      invitation.campaign.closeAt !== null &&
      now >= invitation.campaign.closeAt
    ) {
      return gateFailed();
    }

    // Return ALL question types — the client's QuestionInput component
    // handles rendering for SLIDER_LIKERT, TEXT, NUMBER, and MULTI_CHOICE.
    const allQuestions = invitation.campaign.version.questions as Array<
      Record<string, unknown>
    >;

    return NextResponse.json(
      {
        success: true,
        data: {
          // Opaque per-respondent id (the invitation cuid) for keying the
          // client-side localStorage draft. The invitation id is scoped to
          // THIS respondent's own authenticated session, so returning it to
          // that same respondent is not a leak (localStorage is per-origin/
          // per-browser anyway). NOT PII — never the email/name.
          respondentKey: invitation.id,
          campaign: {
            name: invitation.campaign.name,
            alias: invitation.campaign.alias,
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
