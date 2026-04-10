export function stripPlaceholders(text: string | undefined): string {
  if (!text) return "";
  if (/\{\{[^}]+\}\}/.test(text)) {
    console.warn(`[template-utils] Unresolved placeholder: ${text.substring(0, 80)}`);
  }
  return text.replace(/\{\{[^}]+\}\}/g, "").replace(/\s{2,}/g, " ").trim();
}
