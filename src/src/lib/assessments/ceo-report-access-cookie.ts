import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";

export interface CeoReportSessionPayload {
  focusCampaignId: string;
  focusSubmissionId: string;
  invitationId: string;
  respondentId: string;
  expiresAt: string;
}

const SEAL_TTL_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_MAX_AGE_SECONDS = SEAL_TTL_SECONDS - 60;
const MIN_SECRET_LENGTH = 32;

function reportAccessSecret(): string {
  const secret = process.env.ASSESSMENT_REPORT_ACCESS_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      "ASSESSMENT_REPORT_ACCESS_SECRET must be configured with at least 32 characters.",
    );
  }
  return secret;
}

/** Cookie options are exact-path scoped so this capability never reaches adjacent routes. */
export function buildCeoReportSessionOptions(
  campaignId: string,
  respondentId: string,
): SessionOptions {
  return {
    cookieName: "assessment-report-self",
    password: reportAccessSecret(),
    ttl: SEAL_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: `/assessments/${encodeURIComponent(campaignId)}/respondents/${encodeURIComponent(respondentId)}/report`,
      maxAge: COOKIE_MAX_AGE_SECONDS,
    },
  };
}

export async function getCeoReportAccessSession(
  campaignId: string,
  respondentId: string,
): Promise<IronSession<CeoReportSessionPayload>> {
  return getIronSession<CeoReportSessionPayload>(
    await cookies(),
    buildCeoReportSessionOptions(campaignId, respondentId),
  );
}
