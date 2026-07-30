import type {
  PublicResultSummary,
  PublicScoredDomain,
} from "@/lib/assessments/public-referrals";

export const FOUR_DECISION_KEYS = [
  "people",
  "strategy",
  "execution",
  "cash",
] as const;

export const FOUR_DECISION_STYLES: Record<
  (typeof FOUR_DECISION_KEYS)[number],
  { color: string; borderClass: string; stripClass: string }
> = {
  people: {
    color: "#f7a600",
    borderClass: "border-[#f7a600]",
    stripClass: "bg-[#f7a600]",
  },
  strategy: {
    color: "#008bd2",
    borderClass: "border-[#008bd2]",
    stripClass: "bg-[#008bd2]",
  },
  execution: {
    color: "#946b36",
    borderClass: "border-[#946b36]",
    stripClass: "bg-[#946b36]",
  },
  cash: {
    color: "#95c11f",
    borderClass: "border-[#95c11f]",
    stripClass: "bg-[#95c11f]",
  },
};

export function fourDecisionDomains(
  summary: PublicResultSummary | undefined,
): Array<{
  key: (typeof FOUR_DECISION_KEYS)[number];
  domain: PublicScoredDomain;
}> | null {
  if (!summary || summary.kind !== "scored") return null;
  const byKey = new Map(
    summary.domains.map((domain) => [domain.key.toLowerCase(), domain]),
  );
  if (!FOUR_DECISION_KEYS.every((key) => byKey.has(key))) return null;
  return FOUR_DECISION_KEYS.map((key) => ({
    key,
    domain: byKey.get(key)!,
  }));
}
