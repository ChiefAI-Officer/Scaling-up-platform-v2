import { escapeHtml } from "@/lib/templates/interpolate-content-html";

export const MEMBER_PORTAL_DISCOVERY_COPY =
  "See all your assessments and reports in one place.";
export const MEMBER_PORTAL_DISCOVERY_ACTION = "Open the member portal";
export const MEMBER_PORTAL_SIGN_IN_PATH = "/member/sign-in";

function safePortalUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.username || url.password) return null;
    const localHost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]" ||
      url.hostname.endsWith(".test");
    if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function memberPortalSignInUrl(appUrl: string): string | null {
  try {
    return safePortalUrl(new URL(MEMBER_PORTAL_SIGN_IN_PATH, appUrl).href);
  } catch {
    return null;
  }
}

export function renderMemberPortalDiscoveryEmail(url: string | null | undefined): string {
  const href = url ? safePortalUrl(url) : null;
  if (!href) return "";
  return `<p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;text-align:center;margin:20px 0;color:#374151;font-size:14px;">${MEMBER_PORTAL_DISCOVERY_COPY} <a href="${escapeHtml(href)}" style="color:#522583;text-decoration:underline;font-weight:700;">${MEMBER_PORTAL_DISCOVERY_ACTION}</a></p>`;
}
