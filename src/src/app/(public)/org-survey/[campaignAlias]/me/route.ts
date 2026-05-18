/**
 * Assessment v7.6 — INVITED-mode form-data fetch (Task D).
 *
 * Reads the iron-session cookie set by /exchange, re-validates lifecycle
 * gates against the DB (never trust the cookie's expiresAt for gating —
 * the cookie is just an identifier), then returns the questions+sections
 * the respondent needs to render the form.
 *
 * Returns:
 *   { campaign: { name, alias }, version: { language }, sections, questions }
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

    return NextResponse.json(
      {
        success: true,
        data: {
          campaign: {
            name: invitation.campaign.name,
            alias: invitation.campaign.alias,
          },
          version: { language: invitation.campaign.version.language },
          sections: invitation.campaign.version.sections,
          questions: invitation.campaign.version.questions,
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
