"use client";

/**
 * Assessment v7.6 — AssessmentResultView (Task F).
 *
 * Pure rendering component for a frozen ScoreResult plus the version's
 * scoringConfig + sections (for tier labels + section display names).
 *
 * Spec/wireframe refs:
 *  - public/wireframes/08-individual-results-expanded.html
 *  - public/wireframes-phase2/revisions/08-revised-individual-results.html
 *
 * Design notes
 * ────────────
 *  - Tier label is normalized case-insensitively to pick the banner
 *    colour token: "Low" → destructive, "OK" → warning, "Great" →
 *    success. Anything else falls back to the neutral muted style.
 *  - Per-question detail is collapsible (default closed) because
 *    Rockefeller has 40 rows — the table is the primary thing.
 *  - No DB / network calls — props in, JSX out. Caller is responsible
 *    for fetching.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Check, X } from "lucide-react";
import type { ScoreResult } from "@/lib/assessments/scoring";

interface VersionSection {
  stableKey: string;
  name: string;
  sortOrder: number;
}

interface VersionScoringConfig {
  tierMetric: "countAchieved" | "overallTotal" | "overallAvg";
  passThreshold: number;
  tiers: Array<{
    minMetric: number;
    maxMetric?: number;
    label: string;
    message: string;
  }>;
}

export interface AssessmentResultViewProps {
  result: ScoreResult;
  version: {
    sections: VersionSection[] | unknown;
    scoringConfig: VersionScoringConfig | unknown;
  };
  /**
   * #21 — stableKey → question text map. When present, the per-question detail
   * renders the human-readable label as the primary text and keeps the bare
   * code as a small muted secondary. Falls back to the code when a key is
   * missing.
   */
  questionByKey?: Record<string, string>;
}

// Defensive coercion. The version payload arrives as Prisma JSON (`unknown`).
function asSections(s: unknown): VersionSection[] {
  if (!Array.isArray(s)) return [];
  return s.filter(
    (x): x is VersionSection =>
      typeof x === "object" &&
      x !== null &&
      typeof (x as VersionSection).stableKey === "string" &&
      typeof (x as VersionSection).name === "string",
  );
}

function classifyTier(label: string | null | undefined): {
  bg: string;
  text: string;
  ring: string;
} {
  if (!label) {
    return {
      bg: "bg-muted",
      text: "text-muted-foreground",
      ring: "ring-border",
    };
  }
  const norm = label.toLowerCase().trim();
  if (norm === "low" || norm === "poor" || norm === "weak") {
    return {
      bg: "bg-destructive/10",
      text: "text-destructive",
      ring: "ring-destructive/20",
    };
  }
  if (norm === "ok" || norm === "fair" || norm === "average") {
    return {
      bg: "bg-warning/10",
      text: "text-warning",
      ring: "ring-warning/20",
    };
  }
  if (norm === "great" || norm === "excellent" || norm === "strong") {
    return {
      bg: "bg-success/10",
      text: "text-success",
      ring: "ring-success/20",
    };
  }
  return {
    bg: "bg-primary/10",
    text: "text-primary",
    ring: "ring-primary/20",
  };
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function AssessmentResultView({
  result,
  version,
  questionByKey,
}: AssessmentResultViewProps) {
  const [expanded, setExpanded] = useState(false);
  const sections = asSections(version.sections);
  const sectionNameByKey = new Map<string, string>();
  for (const s of sections) sectionNameByKey.set(s.stableKey, s.name);

  const tierTone = classifyTier(result.tier?.label);

  return (
    <div className="space-y-4" data-testid="assessment-result-view">
      {/* Tier banner */}
      <div
        className={`rounded-lg ring-1 ${tierTone.bg} ${tierTone.ring} px-4 py-3 flex items-start gap-3`}
        data-testid="tier-banner"
      >
        <div className="flex-1 min-w-0">
          <div
            className={`text-xs font-bold uppercase tracking-wider ${tierTone.text}`}
          >
            {result.tier?.label ?? "—"}
          </div>
          <div className="mt-1 text-sm text-foreground font-medium">
            {result.tier?.message ?? "No tier resolved for this submission."}
          </div>
        </div>
        <div className={`text-right ${tierTone.text}`}>
          <div className="text-2xl font-bold tabular-nums">
            {formatNumber(result.tierMetricValue)}
          </div>
          <div className="text-xs uppercase tracking-wide opacity-80">
            metric
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div
        className="grid grid-cols-3 gap-3"
        data-testid="result-stats-row"
      >
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Count achieved
          </div>
          <div className="mt-1 text-xl font-bold text-foreground tabular-nums">
            {result.countAchieved}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Total points
          </div>
          <div className="mt-1 text-xl font-bold text-foreground tabular-nums">
            {result.overallTotal}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Average
          </div>
          <div className="mt-1 text-xl font-bold text-foreground tabular-nums">
            {formatNumber(result.overallAverage)}
          </div>
        </div>
      </div>

      {/* Per-section table */}
      <div
        className="rounded-lg border border-border bg-card overflow-hidden"
        data-testid="per-section-table"
      >
        <div className="px-4 py-2 bg-muted/40 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            By section
          </h3>
        </div>
        {result.perSection.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground text-center">
            No sectioned questions in this template.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/20">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Section
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Total
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Average
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Achieved
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.perSection.map((s) => {
                const displayName =
                  sectionNameByKey.get(s.stableKey) ?? s.name ?? s.stableKey;
                return (
                  <tr key={s.stableKey}>
                    <td className="px-4 py-2 text-foreground">
                      {displayName}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.totalPoints}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatNumber(s.averagePoints)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-1 rounded bg-success/10 text-success text-xs font-medium px-2 py-0.5 ring-1 ring-success/20">
                        {s.achievedCount} / {s.totalCount}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Per-question collapsible detail */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2 flex items-center justify-between text-sm font-semibold text-foreground hover:bg-muted/30"
          aria-expanded={expanded}
          data-testid="per-question-toggle"
        >
          <span>Per-question detail ({result.perQuestion.length})</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        {expanded && (
          <div
            className="border-t border-border"
            data-testid="per-question-detail"
          >
            <ul className="divide-y divide-border">
              {result.perQuestion.map((q) => {
                const label = questionByKey?.[q.stableKey];
                return (
                <li
                  key={q.stableKey}
                  className="px-4 py-2 flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 flex flex-col">
                    <span
                      className="text-foreground"
                      data-testid={`per-question-label-${q.stableKey}`}
                    >
                      {label ?? q.stableKey}
                    </span>
                    {label ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {q.stableKey}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="tabular-nums font-medium text-foreground">
                      {q.value}
                    </span>
                    {q.achieved ? (
                      <Check
                        className="w-4 h-4 text-success"
                        aria-label="achieved"
                      />
                    ) : (
                      <X
                        className="w-4 h-4 text-muted-foreground"
                        aria-label="not achieved"
                      />
                    )}
                  </span>
                </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default AssessmentResultView;
