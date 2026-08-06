export const MAX_TEMPLATE_INTERNAL_ID_LENGTH = 80;

export function generateTemplateInternalId(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const truncated = normalized.slice(0, MAX_TEMPLATE_INTERNAL_ID_LENGTH);

  if (!truncated.endsWith("-")) return truncated;

  return `${truncated.slice(0, -1)}${normalized
    .slice(MAX_TEMPLATE_INTERNAL_ID_LENGTH)
    .replace(/^-+/, "")
    .charAt(0)}`;
}

export function templateInternalIdForAttempt(
  base: string,
  attempt: number,
): string {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("attempt must be at least 1");
  }
  if (attempt === 1) return base;
  const suffix = `-${attempt}`;
  const stem = base
    .slice(0, MAX_TEMPLATE_INTERNAL_ID_LENGTH - suffix.length)
    .replace(/-+$/g, "");
  return `${stem}${suffix}`;
}
