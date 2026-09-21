import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getInvitationSession } from "@/lib/assessments/invitation-cookie";
import {
  classifyInvitationExchangeAvailability,
  type InvitationWithCampaign,
} from "@/lib/assessments/stable-invitation-tokens";
import { isMemberPortalEnabled } from "@/lib/members/flags";
import { resolveMemberIdentity } from "@/lib/members/identity";
import { getMemberSession } from "@/lib/members/session";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

type EvaluationOpenTx = Parameters<typeof resolveMemberIdentity>[0] & {
  assessmentInvitation: {
    findUnique(args: Record<string, unknown>): Promise<InvitationWithCampaign | null>;
    update(args: {
      where: { id: string };
      data: { status: "VIEWED" };
    }): Promise<unknown>;
  };
};

type EvaluationOpenDb = {
  $transaction<T>(callback: (tx: EvaluationOpenTx) => Promise<T>): Promise<T>;
};

function hidden(): NextResponse {
  return new NextResponse(null, { status: 404, headers: NO_STORE_HEADERS });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  if (!isMemberPortalEnabled()) return hidden();
  const memberSession = await getMemberSession();
  if (!memberSession.normalizedEmail || !memberSession.issuedAt) return hidden();

  const { invitationId } = await params;
  const now = new Date();
  const invitation = await (db as unknown as EvaluationOpenDb).$transaction(async (tx) => {
    const identity = await resolveMemberIdentity(tx, memberSession.normalizedEmail!);
    const ownIds = new Set(identity.members.map((member) => member.respondentId));
    if (ownIds.size === 0) return null;

    const candidate = await tx.assessmentInvitation.findUnique({
      where: { id: invitationId },
      include: {
        campaign: {
          select: {
            id: true,
            alias: true,
            status: true,
            openAt: true,
            closeAt: true,
            deletedAt: true,
          },
        },
      },
    });
    if (!candidate || !ownIds.has(candidate.respondentId)) return null;
    if (classifyInvitationExchangeAvailability(candidate, now) !== "USABLE") return null;

    if (candidate.status === "PENDING" || candidate.status === "SENT") {
      await tx.assessmentInvitation.update({
        where: { id: candidate.id },
        data: { status: "VIEWED" },
      });
    }
    return candidate;
  });

  if (!invitation) return hidden();

  const invitationSession = await getInvitationSession(invitation.campaign.alias);
  invitationSession.invitationId = invitation.id;
  invitationSession.campaignAlias = invitation.campaign.alias;
  invitationSession.expiresAt = invitation.expiresAt.toISOString();
  await invitationSession.save();

  const destination = new URL(
    `/org-survey/${encodeURIComponent(invitation.campaign.alias)}`,
    request.url,
  );
  return NextResponse.redirect(destination, 307);
}
