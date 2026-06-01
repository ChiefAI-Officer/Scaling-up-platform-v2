export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function interpolateContentForHtml(
  template: string,
  variables: Record<string, string | null | undefined>
): string {
  let out = template;
  for (const [key, raw] of Object.entries(variables)) {
    const value = raw == null ? "" : raw;
    const escaped = escapeHtml(value);
    out = out.split(`{{${key}}}`).join(escaped);
    out = out.split(`{{ ${key} }}`).join(escaped);
  }
  return out;
}
