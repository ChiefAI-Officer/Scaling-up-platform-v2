/**
 * F4 — Scoring & Tiers tab (Checkpoint 3).
 *
 * Wireframe spec: src/public/wireframes-phase2/admin/18-admin-template-editor-logic.html
 *
 * Plan: ~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md (F4 + Gap D)
 *
 * Structure (the WF18 "deferred logic" placeholders — the Peer Benchmarks
 * ghost card + its explanation card — were removed in Wave W leftovers,
 * spec 19z: superseded by the live Wave S peer-averages panel; the earlier
 * Conditional Sections ghost went in Wave W, spec 19w D5):
 *   1. Scoring Configuration card (Tier Metric + Pass Threshold)
 *   2. Tiers table (Order/minMetric/maxMetric/Label/Message/Action)
 *   3. Per-domain tiers (Gap D — not in WF, plan-driven D2 extension)
 */

"use client";

import React, { useCallback, useMemo } from "react";

import { scoreSubmission } from "@/lib/assessments/scoring";

// ─── Types ──────────────────────────────────────────────────────────────

export type TierMetric = "countAchieved" | "overallTotal" | "overallAvg";
export type RollupOverall =
  | "meanOfQuestions"
  | "meanOfSections"
  | "meanOfDomains";

export interface TierRow {
  minMetric: number;
  maxMetric?: number;
  label: string;
  message: string;
}

export interface ScoringConfigShape {
  tierMetric: TierMetric;
  passThreshold: number;
  tiers: TierRow[];
  rollup?: { overall?: RollupOverall };
  scaleUpScore?: boolean;
  domains?: Array<{
    key: string;
    label: string;
    tiers: TierRow[];
  }>;
  [key: string]: unknown;
}

export interface ScoringTiersTabSection {
  stableKey: string;
  sortOrder: number;
  name: string;
  domain?: string;
}

export interface ScoringTiersTabQuestion {
  stableKey: string;
  sortOrder: number;
  sectionStableKey: string;
  type: "SLIDER_LIKERT";
  label: string;
  isRequired: boolean;
  scale: {
    min: number;
    max: number;
    step: number;
    anchorMin: string;
    anchorMax: string;
  };
}

export interface ScoringTiersTabProps {
  sections: ScoringTiersTabSection[];
  questions: ScoringTiersTabQuestion[];
  scoringConfig: ScoringConfigShape;
  isReadOnly: boolean;
  onScoringConfigChange: (next: ScoringConfigShape) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function getGlobalMetricMode(
  tierMetric: TierMetric,
  rollupOverall: RollupOverall | undefined,
): "integer" | "fractional" {
  if (rollupOverall) return "fractional";
  if (tierMetric === "overallAvg") return "fractional";
  return "integer";
}

interface TilingIssue {
  message: string;
}

function validateTiersClient(
  tiers: TierRow[],
  mode: "integer" | "fractional",
  surfaceLabel: string,
): TilingIssue | null {
  if (tiers.length === 0) {
    return { message: `${surfaceLabel}: add at least one tier.` };
  }
  for (const t of tiers) {
    if (!t.label.trim() || !t.message.trim()) {
      return {
        message: `${surfaceLabel}: every tier needs a label and a message.`,
      };
    }
    if (t.maxMetric !== undefined && t.maxMetric < t.minMetric) {
      return {
        message: `${surfaceLabel}: tier "${t.label}" max (${t.maxMetric}) is less than min (${t.minMetric}).`,
      };
    }
  }
  const sorted = [...tiers]
    .map((t, idx) => ({ idx, ...t }))
    .sort((a, b) => a.minMetric - b.minMetric);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.maxMetric === undefined) {
      return {
        message: `${surfaceLabel}: only the highest tier may omit max (open-ended).`,
      };
    }
    const expected = mode === "integer" ? a.maxMetric + 1 : a.maxMetric;
    if (b.minMetric !== expected) {
      if (mode === "integer") {
        return {
          message: `${surfaceLabel}: tier "${a.label}" ends at ${a.maxMetric}; tier "${b.label}" must start at ${expected} (no gap, no overlap).`,
        };
      }
      return {
        message:
          b.minMetric > expected
            ? `${surfaceLabel}: gap between tier "${a.label}" (max ${a.maxMetric}) and tier "${b.label}" (min ${b.minMetric}) — tiers must touch.`
            : `${surfaceLabel}: overlap between tier "${a.label}" (max ${a.maxMetric}) and tier "${b.label}" (min ${b.minMetric}).`,
      };
    }
  }
  return null;
}

function computeMidpointPreview(
  sections: ScoringTiersTabSection[],
  questions: ScoringTiersTabQuestion[],
  scoringConfig: ScoringConfigShape,
): { score: number; tier: string | null } | null {
  try {
    const answers = questions.map((q) => {
      const mid = (q.scale.min + q.scale.max) / 2;
      const value = q.scale.step === 1 ? Math.round(mid) : mid;
      return { stableKey: q.stableKey, value };
    });
    const result = scoreSubmission(
      { sections, questions, scoringConfig } as Parameters<
        typeof scoreSubmission
      >[0],
      answers,
    );
    return {
      score: result.tierMetricValue,
      tier: result.tier?.label ?? null,
    };
  } catch {
    return null;
  }
}

// ─── Tier table sub-component (reused for global + per-domain) ──────────

interface TierTableProps {
  tiers: TierRow[];
  onChange: (next: TierRow[]) => void;
  isReadOnly: boolean;
  testIdPrefix: string;
}

function TierTable({ tiers, onChange, isReadOnly, testIdPrefix }: TierTableProps) {
  const updateTier = (idx: number, patch: Partial<TierRow>) => {
    const next = tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    onChange(next);
  };
  const removeTier = (idx: number) => {
    if (tiers.length <= 1) return;
    onChange(tiers.filter((_, i) => i !== idx));
  };
  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const nextMin = last?.maxMetric ?? 0;
    onChange([
      ...tiers,
      { minMetric: nextMin, maxMetric: nextMin + 1, label: "", message: "" },
    ]);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm" aria-label="Tier definitions">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-16">
                Order
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-24">
                minMetric
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-24">
                maxMetric
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-40">
                Label
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Message
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-24">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, idx) => (
              <tr
                key={idx}
                data-testid={`${testIdPrefix}-row-${idx}`}
                className="border-t border-border"
              >
                <td className="px-3 py-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
                    {idx + 1}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={tier.minMetric}
                    onChange={(e) =>
                      updateTier(idx, { minMetric: Number(e.target.value) })
                    }
                    disabled={isReadOnly}
                    data-testid={`${testIdPrefix}-min-${idx}`}
                    className="wf-input disabled:opacity-60"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={tier.maxMetric ?? ""}
                    onChange={(e) =>
                      updateTier(idx, {
                        maxMetric:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    disabled={isReadOnly}
                    data-testid={`${testIdPrefix}-max-${idx}`}
                    className="wf-input disabled:opacity-60"
                    placeholder="(unbounded)"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={tier.label}
                    onChange={(e) =>
                      updateTier(idx, { label: e.target.value })
                    }
                    disabled={isReadOnly}
                    data-testid={`${testIdPrefix}-label-${idx}`}
                    className="wf-input disabled:opacity-60"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={tier.message}
                    onChange={(e) =>
                      updateTier(idx, { message: e.target.value })
                    }
                    disabled={isReadOnly}
                    data-testid={`${testIdPrefix}-message-${idx}`}
                    className="wf-input disabled:opacity-60"
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => removeTier(idx)}
                    disabled={isReadOnly || tiers.length <= 1}
                    className="text-xs px-2 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addTier}
        disabled={isReadOnly}
        className="wf-btn wf-btn-secondary disabled:opacity-50"
      >
        + Add Tier
      </button>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────

export function ScoringTiersTab({
  sections,
  questions,
  scoringConfig,
  isReadOnly,
  onScoringConfigChange,
}: ScoringTiersTabProps) {
  const tierMetric = scoringConfig.tierMetric;
  const passThreshold = scoringConfig.passThreshold;
  const tiers = scoringConfig.tiers ?? [];
  const domains = useMemo(() => scoringConfig.domains ?? [], [scoringConfig.domains]);
  const rollupOverall = scoringConfig.rollup?.overall;

  const updateConfig = useCallback(
    (patch: Partial<ScoringConfigShape>) => {
      onScoringConfigChange({ ...scoringConfig, ...patch });
    },
    [scoringConfig, onScoringConfigChange],
  );

  const handleTiersChange = (next: TierRow[]) => updateConfig({ tiers: next });
  const handleDomainTiersChange = (domainKey: string, next: TierRow[]) => {
    updateConfig({
      domains: domains.map((d) =>
        d.key === domainKey ? { ...d, tiers: next } : d,
      ),
    });
  };

  // Validation
  const globalMode = getGlobalMetricMode(tierMetric, rollupOverall);
  const globalIssue = validateTiersClient(tiers, globalMode, "Global tiers");
  const domainIssues = useMemo(() => {
    const out: TilingIssue[] = [];
    for (const d of domains) {
      // Per-domain tiers always fractional
      const issue = validateTiersClient(
        d.tiers,
        "fractional",
        `Domain "${d.label}"`,
      );
      if (issue) out.push(issue);
    }
    return out;
  }, [domains]);

  const firstIssue = globalIssue ?? domainIssues[0] ?? null;

  // Live preview
  const preview = useMemo(
    () => computeMidpointPreview(sections, questions, scoringConfig),
    [sections, questions, scoringConfig],
  );

  return (
    <div className="space-y-8">
      {/* Inline validation alert (block save) */}
      {firstIssue && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {firstIssue.message}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────
          Section 1 — Scoring Configuration (editable per WF18)
          ────────────────────────────────────────────────────────────── */}
      <section className="wf-card space-y-4" style={{ padding: "1.5rem" }}>
        <header className="space-y-1">
          <h3 className="wf-card-title">
            Scoring Configuration
          </h3>
          <p className="text-sm text-muted-foreground">
            How responses convert into a headline metric and tier message.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label
              htmlFor="tier-metric"
              className="wf-label"
            >
              Tier Metric
            </label>
            <select
              id="tier-metric"
              value={tierMetric}
              onChange={(e) =>
                updateConfig({ tierMetric: e.target.value as TierMetric })
              }
              disabled={isReadOnly}
              className="wf-input disabled:opacity-60"
            >
              <option value="countAchieved">
                countAchieved — Count of questions with score ≥ passThreshold
              </option>
              <option value="overallTotal">
                overallTotal — Sum of all numeric values
              </option>
              <option value="overallAvg">
                overallAvg — Mean of all numeric values
              </option>
            </select>
            <p className="text-xs text-muted-foreground">
              Drives the headline metric the tier ranges resolve against.
            </p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="pass-threshold"
              className="wf-label"
            >
              Pass Threshold
            </label>
            <input
              id="pass-threshold"
              type="number"
              value={passThreshold}
              onChange={(e) =>
                updateConfig({ passThreshold: Number(e.target.value) })
              }
              disabled={isReadOnly}
              min={0}
              step={1}
              className="wf-input disabled:opacity-60"
            />
            <p className="text-xs text-muted-foreground">
              A question counts as &ldquo;achieved&rdquo; when its score ≥ this
              value. Rockefeller uses 2 (on a 0–3 scale).
            </p>
          </div>
        </div>

        {/* Tiers table */}
        <div className="space-y-3 pt-2">
          <header className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">Tiers</h4>
            <p className="text-xs text-muted-foreground">
              Each tier defines a metric range + label + message shown on the
              results page. Tiers must cover the full metric domain with no
              gaps or overlaps (Zod refine enforces this on save).
            </p>
          </header>
          <TierTable
            tiers={tiers}
            onChange={handleTiersChange}
            isReadOnly={isReadOnly}
            testIdPrefix="global-tier"
          />

          {/* Validation hint card */}
          <div
            role="note"
            className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground"
          >
            <p className="font-semibold text-foreground mb-1">
              Validation rules (Zod refine on save)
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>
                All tiers&apos; <code>[minMetric, maxMetric]</code> ranges must
                cover <code>[0, maxPossibleMetric]</code>.
              </li>
              <li>No gaps allowed between consecutive tiers.</li>
              <li>No overlaps allowed.</li>
              <li>
                <code>maxMetric</code> of the last tier may be omitted (treated
                as unbounded).
              </li>
            </ul>
          </div>

          {/* Live preview card */}
          <div
            data-testid="tier-preview"
            className="wf-card"
            style={{ padding: "0.75rem 1rem" }}
          >
            <p className="text-sm font-semibold text-foreground mb-1">
              Preview — Tier Resolution
            </p>
            {preview ? (
              <div className="text-sm">
                <span className="text-muted-foreground">
                  Midpoint-answer simulation:
                </span>{" "}
                <span className="font-medium">
                  score = {preview.score.toFixed(2)}
                </span>{" "}
                →{" "}
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                  tier: {preview.tier ?? "(unresolved)"}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Preview unavailable — provide sample submission
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Preview uses midpoint-answer simulation against the scoring
              engine.
            </p>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          Section 2 — Per-domain tiers (Gap D, D2 extension)
          ────────────────────────────────────────────────────────────── */}
      {domains.length > 0 && (
        <section className="space-y-4">
          <header className="space-y-1">
            <h3 className="wf-card-title">
              Per-domain tiers
            </h3>
            <p className="text-sm text-muted-foreground">
              Resolved per domain when this template has a nested rollup. Same
              touching/coverage rules per domain.
            </p>
          </header>
          {domains.map((domain) => (
            <div
              key={domain.key}
              data-testid={`domain-card-${domain.key}`}
              className="rounded-xl border border-border bg-card p-6 space-y-3"
            >
              <header>
                <h4 className="text-sm font-semibold text-foreground">
                  {domain.label}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({domain.key})
                  </span>
                </h4>
              </header>
              <TierTable
                tiers={domain.tiers ?? []}
                onChange={(next) => handleDomainTiersChange(domain.key, next)}
                isReadOnly={isReadOnly}
                testIdPrefix={`domain-tier-${domain.key}`}
              />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
