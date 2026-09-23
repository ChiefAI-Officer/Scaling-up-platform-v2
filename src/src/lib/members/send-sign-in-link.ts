/**
 * The single issue-and-dispatch entry point for member sign-in links.
 * AssessmentEmailOutbox cannot carry these messages: it is submission-scoped
 * and unique on (submissionId, recipientRole). Durable dispatch is a follow-on.
 */
import { SU_LOGO_CID, SU_LOGO_PNG } from "@/lib/assets/invitation-logo";
import { prepareEmailViaSMTP } from "@/lib/smtp-transport";
import { resolveMemberIdentity } from "@/lib/members/identity";
import { issueMemberSignInToken, type MemberTokenIssuer } from "@/lib/members/sign-in-token";
import { renderMemberSignInEmail } from "@/lib/members/sign-in-email";
import { after } from "next/server";

type SignInLinkDb = {
  orgRespondent: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<
      Array<{
        id: string;
        organizationId: string;
        teamId: string | null;
        roleType: string | null;
      }>
    >;
    findUnique(args: {
      where: { id: string };
      select: { firstName: true };
    }): Promise<{ firstName: string } | null>;
  };
  memberSignInToken: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
};

function emitSendFailure(error: unknown): void {
  console.info(
    JSON.stringify({
      marker: "member_signin.send_failed",
      errorClass: error instanceof Error ? error.constructor.name : "unknown",
    }),
  );
}

export async function sendMemberSignInLink(
  db: SignInLinkDb,
  input: {
    email: string;
    via: MemberTokenIssuer;
    byUserId?: string | null;
    campaignId?: string | null;
    now?: Date;
  },
): Promise<{ issued: boolean }> {
  const identity = await resolveMemberIdentity(db, input.email);
  if (identity.members.length === 0) return { issued: false };

  const now = input.now ?? new Date();
  const issued = await issueMemberSignInToken(db, {
    normalizedEmail: identity.normalizedEmail,
    issuedVia: input.via,
    issuedByUserId: input.byUserId,
    campaignId: input.campaignId,
    now,
  });
  const greeting = await db.orgRespondent.findUnique({
    where: { id: identity.members[0].respondentId },
    select: { firstName: true },
  });

  await db.auditLog.create({
    data: {
      entityType: "MemberSignInToken",
      entityId: issued.tokenId,
      action: "MEMBER_LINK_ISSUED",
      performedBy: input.byUserId ?? identity.normalizedEmail,
      changes: JSON.stringify({ issuedVia: input.via, campaignId: input.campaignId ?? null }),
    },
  });

  try {
    const email = renderMemberSignInEmail({
      firstName: greeting?.firstName ?? "",
      rawToken: issued.rawToken,
      appUrl: process.env.APP_URL ?? "http://localhost:3000",
      issuedAt: now,
      expiresAt: issued.expiresAt,
    });
    const prepared = prepareEmailViaSMTP({
      to: identity.normalizedEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [
        {
          filename: "scaling-up.png",
          content: SU_LOGO_PNG,
          contentType: "image/png",
          cid: SU_LOGO_CID,
        },
      ],
      telemetry: {
        recipientRole: "CUSTOM",
        metadata: {
          emailType: "MEMBER_SIGN_IN_LINK",
          issuedVia: input.via,
          campaignId: input.campaignId ?? null,
          tokenId: issued.tokenId,
        },
      },
      redactErrors: true,
    });
    after(async () => {
      try {
        await prepared.send();
      } catch (error) {
        emitSendFailure(error);
      }
    });
  } catch (error) {
    emitSendFailure(error);
  }

  return { issued: true };
}
