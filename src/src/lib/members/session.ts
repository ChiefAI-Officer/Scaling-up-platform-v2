import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeMemberEmail } from "@/lib/members/identity";

export interface MemberSessionPayload {
  normalizedEmail?: string;
  issuedAt?: string;
}

export const MEMBER_SESSION_TTL_SECONDS = 24 * 60 * 60;
const MEMBER_COOKIE_MAX_AGE_SECONDS = MEMBER_SESSION_TTL_SECONDS - 5 * 60;

export function buildMemberSessionOptions(): SessionOptions {
  const password = process.env.MEMBER_SESSION_SECRET;
  if (!password) {
    throw new Error("MEMBER_SESSION_SECRET is not configured. Cannot seal member session.");
  }
  return {
    cookieName: "member-session",
    password,
    ttl: MEMBER_SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/member",
      maxAge: MEMBER_COOKIE_MAX_AGE_SECONDS,
    },
  };
}

export function toMemberSessionPayload(normalizedEmail: string, issuedAt: Date): Required<MemberSessionPayload> {
  return {
    normalizedEmail: normalizeMemberEmail(normalizedEmail),
    issuedAt: issuedAt.toISOString(),
  };
}

export async function getMemberSession(): Promise<IronSession<MemberSessionPayload>> {
  return getIronSession<MemberSessionPayload>(await cookies(), buildMemberSessionOptions());
}

export async function requireMemberSession(): Promise<IronSession<MemberSessionPayload>> {
  const session = await getMemberSession();
  if (!session.normalizedEmail || !session.issuedAt) redirect("/member/sign-in");
  return session;
}
