/**
 * Assessment v7.6 — report-presentation (Task 2).
 *
 * Pure, side-effect-free presentation helpers for the adaptive BrandedReport.
 * No React, no DB, no I/O — props/values in, primitives out. Every helper is
 * total-tolerant of malformed / partial input (the frozen ScoreResult + the
 * version JSON are treated as untrusted at render time — H10).
 *
 * Helpers
 * ───────
 *  - isNeutralTier(scoringConfig)        → H11 neutral-tier predicate (QSP/LVA)
 *  - domainColor(key)                    → H12 domain → brand color map
 *  - headlineForTierMetric(result, cfg)  → G2 overall-banner adaptation
 */

import type { ScoreResult } from "@/lib/assessments/scoring";

/**
 * H11 — A version is "neutral-tier" when it has a SINGLE tier covering the
 * full metric range with passThreshold === 0 and tierMetric === "overallAvg"
 * (QSP v1/v2, LVA). The report uses this predicate — not a hard-coded template
 * list — to decide "show 'Submitted', suppress band coloring / score-emphasis".
 *
 * Total-tolerant: any malformed config → false (treat as a normal tiered
 * report rather than suppressing the band by accident).
 */
export function isNeutralTier(scoringConfig: unknown): boolean {
  if (!scoringConfig || typeof scoringConfig !== "object") return false;
  const cfg = scoringConfig as Record<string, unknown>;
  if (!Array.isArray(cfg.tiers)) return false;
  return (
    cfg.tiers.length === 1 &&
    cfg.passThreshold === 0 &&
    cfg.tierMetric === "overallAvg"
  );
}

/**
 * H12 — SU Full has FIVE domains (People / Strategy / Execution / Cash / You)
 * but the brand defines only four decision colors. Map each domain to its
 * brand color, with the fifth ("You") → purple and an unknown-domain fallback
 * (neutral grey). Keys are normalized to lower-case + trimmed.
 */
const DOMAIN_COLOR_MAP: Record<string, string> = {
  people: "#f7a600",
  strategy: "#008bd2",
  execution: "#946b36",
  cash: "#95c11f",
  you: "#522583",
};

const UNKNOWN_DOMAIN_COLOR = "#6b6480";

export function domainColor(key: string): string {
  if (typeof key !== "string") return UNKNOWN_DOMAIN_COLOR;
  const norm = key.toLowerCase().trim();
  return DOMAIN_COLOR_MAP[norm] ?? UNKNOWN_DOMAIN_COLOR;
}

export interface TierMetricHeadline {
  /** The big number / metric, e.g. "28 / 40", "Avg 3.2", "72 / 100". */
  primary: string;
  /** The band/status label under the primary, e.g. "Strong", "Submitted". */
  label: string;
}

/**
 * G2 — The overall banner adapts to the template's own tierMetric:
 *   - scaleUpScore present → "{scaleUpScore} / 100" + tier.label or "ScaleUp"
 *   - countAchieved        → "{countAchieved} / {totalItems}" + tier.label
 *   - overallAvg (neutral) → "Avg {overallAverage}" + "Submitted"
 *
 * scaleUpScore takes precedence because SU Full also carries an overallAvg
 * tierMetric but reports its 0–100 ScaleUp Score as the headline number.
 *
 * Total-tolerant of missing fields: a null/partial result or config still
 * produces a sane { primary, label } pair (no throw).
 */
export function headlineForTierMetric(
  result: ScoreResult | null | undefined,
  scoringConfig: unknown,
): TierMetricHeadline {
  const r = (result ?? {}) as Partial<ScoreResult>;
  const cfg =
    scoringConfig && typeof scoringConfig === "object"
      ? (scoringConfig as Record<string, unknown>)
      : {};

  const tierLabel = r.tier?.label;

  // ScaleUp score wins when present (SU Full).
  if (typeof r.scaleUpScore === "number") {
    return {
      primary: `${formatMetric(r.scaleUpScore)} / 100`,
      label: tierLabel && tierLabel.trim() !== "" ? tierLabel : "ScaleUp",
    };
  }

  const tierMetric = cfg.tierMetric;

  if (tierMetric === "countAchieved") {
    const achieved = typeof r.countAchieved === "number" ? r.countAchieved : 0;
    const total = Array.isArray(r.perQuestion) ? r.perQuestion.length : 0;
    return {
      primary: `${achieved} / ${total}`,
      label: tierLabel ?? "",
    };
  }

  if (tierMetric === "overallAvg") {
    const avg = typeof r.overallAverage === "number" ? r.overallAverage : 0;
    return {
      primary: `Avg ${formatMetric(avg)}`,
      label: "Submitted",
    };
  }

  // Fallback — unknown / missing tierMetric. Prefer overallAverage if numeric.
  const avg = typeof r.overallAverage === "number" ? r.overallAverage : 0;
  return {
    primary: `Avg ${formatMetric(avg)}`,
    label: tierLabel ?? "Submitted",
  };
}

/** Compact metric formatting: integers stay whole, fractions trim to 1 dp. */
function formatMetric(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  // 1 decimal place, trimming a trailing ".0" defensively.
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
