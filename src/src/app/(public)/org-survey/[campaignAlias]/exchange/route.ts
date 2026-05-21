/**
 * Assessment v7.6 — INVITED-mode token-exchange route (Task D).
 *
 * Receives the raw token (from the email link's URL fragment) as a JSON POST
 * body, validates the invitation against ALL lifecycle gates, mints a sealed
 * iron-session cookie path-scoped to /org-survey/{alias}, then returns 204.
 *
 * Lifecycle gates (any failure → 410):
 *   1. invitation.revokedAt IS NULL
 *   2. now < invitation.expiresAt
 *   3. invitation.status !== SUBMITTED
 *   4. campaign.status === ACTIVE
 *   5. now >= campaign.openAt
 *   6. campaign.closeAt is null OR now < campaign.closeAt
 *
 * Idempotency: status transitions PENDING|SENT → VIEWED. Already-VIEWED
 * stays VIEWED (no regression, no second flip).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/assessments/invitation-tokens";
import { getInvitationSession } from "@/lib/assessments/invitation-cookie";

const ExchangeBodySchema = z.object({
  token: z.string().min(1),
});

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function gateFailed(): NextResponse {
  return NextResponse.json(
    { success: false, error: "This survey is no longer available." },
    { status: 410, headers: NO_STORE_HEADERS }
  );
}

function gateNotYetOpen(openAt: Date): NextResponse {
  return NextResponse.json(
    {
      success: false,
      code: "NOT_YET_OPEN",
      openAt: openAt.toISOString(),
      error: `This survey hasn't opened yet. It opens ${openAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`,
    },
    { status: 425, headers: NO_STORE_HEADERS }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignAlias: string }> }
) {
  try {
    const { campaignAlias } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const parsed = ExchangeBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const tokenHash = hashToken(parsed.data.token);
    const invitation = await db.assessmentInvitation.findUnique({
      where: { tokenHash },
      include: {
        campaign: {
          select: {
            id: true,
            alias: true,
            status: true,
            openAt: true,
            closeAt: true,
          },
        },
      },
    });

    // Either no row, or row belongs to a DIFFERENT campaign (alias guard).
    if (!invitation || invitation.campaign.alias !== campaignAlias) {
      return NextResponse.json(
        { success: false, error: "Invitation not found" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const now = new Date();

    if (invitation.revokedAt !== null) return gateFailed();
    if (now >= invitation.expiresAt) return gateFailed();
    if (invitation.status === "SUBMITTED") return gateFailed();
    if (invitation.campaign.status !== "ACTIVE") return gateFailed();
    if (now < invitation.campaign.openAt)
      return gateNotYetOpen(invitation.campaign.openAt);
    if (
      invitation.campaign.closeAt !== null &&
      now >= invitation.campaign.closeAt
    ) {
      return gateFailed();
    }

    // VIEWED monotonicity: only flip from PENDING/SENT. Never regress from
    // VIEWED back to anything else; never flip SUBMITTED (already gated above).
    if (
      invitation.status === "PENDING" ||
      invitation.status === "SENT"
    ) {
      await db.assessmentInvitation.update({
        where: { id: invitation.id },
        data: { status: "VIEWED" },
      });
    }

    const session = await getInvitationSession(campaignAlias);
    session.invitationId = invitation.id;
    session.campaignAlias = campaignAlias;
    session.expiresAt = invitation.expiresAt.toISOString();
    await session.save();

    return new NextResponse(null, {
      status: 204,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("[assessment-exchange] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to exchange token" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
