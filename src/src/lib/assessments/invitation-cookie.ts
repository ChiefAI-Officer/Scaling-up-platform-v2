/**
 * Assessment v7.6 — Invitation iron-session cookie helper.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md (Task D).
 *
 * The exchange route swaps the URL-fragment token for this short-lived
 * sealed cookie. The cookie is path-scoped to `/org-survey/{alias}` so
 * that a coach signed into the dashboard on the same browser can never
 * have the survey cookie leak onto admin routes.
 */
import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";

export interface InvitationSessionPayload {
  invitationId: string;
  campaignAlias: string;
  expiresAt: string; // ISO timestamp — invitation.expiresAt at exchange time
}

const TTL_SECONDS = 1800; // 30 minutes — iron-session seal expiry
const COOKIE_MAX_AGE_SECONDS = 1740; // 29 minutes — cookie maxAge (slightly < TTL)

/**
 * Build iron-session options scoped to a specific campaign alias.
 * The `path` lock means a single browser can hold concurrent invitation
 * sessions for different campaigns without them clobbering each other.
 */
export function buildInvitationSessionOptions(
  campaignAlias: string,
): SessionOptions {
  const password = process.env.ASSESSMENT_SESSION_SECRET;
  if (!password) {
    throw new Error(
      "ASSESSMENT_SESSION_SECRET is not configured. Cannot seal invitation session.",
    );
  }
  return {
    cookieName: "assessment-session",
    password,
    ttl: TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: `/org-survey/${campaignAlias}`,
      maxAge: COOKIE_MAX_AGE_SECONDS,
    },
  };
}

/**
 * Resolve the iron-session for the given campaign alias.
 * Awaits Next.js 16 async `cookies()`.
 */
export async function getInvitationSession(
  campaignAlias: string,
): Promise<IronSession<InvitationSessionPayload>> {
  const opts = buildInvitationSessionOptions(campaignAlias);
  const cookieStore = await cookies();
  return getIronSession<InvitationSessionPayload>(cookieStore, opts);
}
