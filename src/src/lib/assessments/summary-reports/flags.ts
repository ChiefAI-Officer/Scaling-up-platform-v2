const isOn = (value: string | undefined): boolean =>
  ["1", "true", "TRUE", "yes"].includes(value ?? "");

function canaryMatches(value: string | undefined, campaignId: string): boolean {
  return (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(campaignId);
}

export function resolveSummaryReportingState(
  env: NodeJS.ProcessEnv,
  campaignId: string,
): { enabled: boolean; killed: boolean } {
  const killed = isOn(env.SUMMARY_REPORTING_KILL);

  if (killed) return { enabled: false, killed: true };

  return {
    enabled:
      isOn(env.SUMMARY_REPORTING_ENABLED) ||
      canaryMatches(env.SUMMARY_REPORTING_CANARY, campaignId),
    killed: false,
  };
}
