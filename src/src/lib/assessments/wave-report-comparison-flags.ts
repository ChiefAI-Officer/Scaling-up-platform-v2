export const REPORT_COMPARISON_ALIAS = "scaling-up-full";

function on(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

function tokens(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(/[\s,]+/).map((v) => v.trim()).filter(Boolean));
}

export function isReportComparisonEnabled(scope: {
  organizationId: string;
  templateId: string;
}): boolean {
  if (on(process.env.WAVE_RC_REPORT_COMPARISON_KILL)) return false;
  if (on(process.env.WAVE_RC_REPORT_COMPARISON_ENABLED)) return true;
  const canary = tokens(process.env.WAVE_RC_REPORT_COMPARISON_CANARY);
  return canary.has(scope.organizationId) || canary.has(scope.templateId);
}
