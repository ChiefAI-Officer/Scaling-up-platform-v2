/** Accept HTTPS URLs, plus HTTP on explicitly local development hosts. */
export function safeAbsoluteWebUrl(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.username || url.password) return null;
    const localHost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]" ||
      url.hostname.endsWith(".test");
    if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
