const CLEAN_RESPONDENT_REPORT_HREF =
  /^\/assessments\/[^/?#]+\/respondents\/[^/?#]+\/report$/;

function capabilityToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const localHost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]" ||
      url.hostname.endsWith(".test");
    if (
      url.username ||
      url.password ||
      url.pathname !== "/assessments/self-report" ||
      url.search !== "" ||
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && localHost))
    ) {
      return null;
    }
    const token = url.hash.match(/^#t=(.+)$/)?.[1];
    return token ? decodeURIComponent(token) : null;
  } catch {
    return null;
  }
}

function cleanReportHref(value: unknown): string | null {
  return typeof value === "string" &&
    CLEAN_RESPONDENT_REPORT_HREF.test(value)
    ? value
    : null;
}

export async function exchangeCeoReportAccessToken(
  token: string,
): Promise<string | null> {
  try {
    const response = await fetch("/assessments/self-report/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return null;
    const body = await response.json() as { href?: unknown };
    return cleanReportHref(body.href);
  } catch {
    return null;
  }
}

/**
 * Exchanges an on-screen server capability without returning or retaining the
 * raw bearer URL. The only successful output is an exact clean report href.
 */
export async function exchangeCeoReportAccessUrl(
  capabilityUrl: unknown,
): Promise<string | null> {
  const token = capabilityToken(capabilityUrl);
  return token ? exchangeCeoReportAccessToken(token) : null;
}
