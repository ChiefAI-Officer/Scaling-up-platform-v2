import { escapeHtml } from "@/lib/templates/interpolate-content-html";
import { safeAbsoluteWebUrl } from "@/lib/safe-absolute-web-url";

export const MEMBER_PORTAL_DISCOVERY_COPY =
  "See all your assessments and reports in one place.";
export const MEMBER_PORTAL_DISCOVERY_ACTION = "Open the member portal";
export const MEMBER_PORTAL_SIGN_IN_PATH = "/member/sign-in";

export function memberPortalSignInUrl(appUrl: string): string | null {
  try {
    return safeAbsoluteWebUrl(new URL(MEMBER_PORTAL_SIGN_IN_PATH, appUrl).href);
  } catch {
    return null;
  }
}

export function renderMemberPortalDiscoveryEmail(url: string | null | undefined): string {
  const href = safeAbsoluteWebUrl(url);
  if (!href) return "";
  return `<p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;text-align:center;margin:20px 0;color:#374151;font-size:14px;">${MEMBER_PORTAL_DISCOVERY_COPY} <a href="${escapeHtml(href)}" style="color:#522583;text-decoration:underline;font-weight:700;">${MEMBER_PORTAL_DISCOVERY_ACTION}</a></p>`;
}
