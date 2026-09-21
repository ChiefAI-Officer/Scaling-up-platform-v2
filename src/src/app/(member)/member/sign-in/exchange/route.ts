import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAuditStrict } from "@/lib/audit";
import { isMemberPortalEnabled } from "@/lib/members/flags";
import { resolveMemberIdentity } from "@/lib/members/identity";
import { redeemMemberSignInToken } from "@/lib/members/sign-in-token";
import { getMemberSession, toMemberSessionPayload } from "@/lib/members/session";

const exchangeSchema = z.object({ token: z.string().min(20).max(4096) });

function invalid(request: Request): NextResponse {
  return NextResponse.redirect(new URL("/member/sign-in?state=invalid", request.url), 303);
}

export async function POST(request: Request): Promise<Response> {
  if (!isMemberPortalEnabled()) return new Response(null, { status: 404 });

  let parsed: z.ZodSafeParseResult<{ token: string }>;
  try {
    const form = new URLSearchParams(await request.text());
    parsed = exchangeSchema.safeParse({ token: form.get("token") });
  } catch {
    return invalid(request);
  }
  if (!parsed.success) return invalid(request);

  const redeemed = await redeemMemberSignInToken(
    db as unknown as Parameters<typeof redeemMemberSignInToken>[0],
    parsed.data.token,
    async (normalizedEmail) => {
      const identity = await resolveMemberIdentity(
        db as unknown as Parameters<typeof resolveMemberIdentity>[0],
        normalizedEmail,
      );
      return identity.members.length > 0;
    },
  );
  if (!redeemed) return invalid(request);

  try {
    const session = await getMemberSession();
    Object.assign(
      session,
      toMemberSessionPayload(redeemed.normalizedEmail, redeemed.redeemedAt),
    );
    await logAuditStrict({
      entityType: "MemberSignInToken",
      entityId: redeemed.tokenId,
      action: "MEMBER_LINK_REDEEMED",
      performedBy: redeemed.normalizedEmail,
      changes: { kind: "member-sign-in" },
    });
    await session.save();
  } catch {
    return invalid(request);
  }

  return NextResponse.redirect(new URL("/member/home", request.url), 303);
}
