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

import {
  scoreSubmission,
  computeGlobalTierDomain,
  computePerDomainTierContexts,
  validateTierTiling,
  type TierDomain,
} from "@/lib/assessments/scoring";
import {
  FRIENDLY_SCORING_COPY,
  formatFriendlyTilingIssue,
  friendlyMetricLabel,
} from "./scoring-tier-copy";
import { TierBandBar } from "./TierBandBar";

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
  plainLanguageEnabled?: boolean;
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

type ClientTierIssue =
  | { code: "EMPTY" }
  | { code: "MISSING_COPY" }
  | {
      code: "END_BEFORE_START";
      label: string;
      startsAt: number;
      endsAt: number;
    }
  | { code: "EARLY_NO_MAXIMUM" }
  | {
      code: "RANGE_GAP" | "RANGE_OVERLAP";
      currentLabel: string;
      nextLabel: string;
      currentEndsAt: number;
      nextStartsAt: number;
      expectedNextStart: number;
    };

interface TilingIssue {
  message: string;
}

function validateTiersClient(
  tiers: TierRow[],
  mode: "integer" | "fractional",
): ClientTierIssue | null {
  if (tiers.length === 0) {
    return { code: "EMPTY" };
  }
  for (const t of tiers) {
    if (!t.label.trim() || !t.message.trim()) {
      return { code: "MISSING_COPY" };
    }
    if (t.maxMetric !== undefined && t.maxMetric < t.minMetric) {
      return {
        code: "END_BEFORE_START",
        label: t.label,
        startsAt: t.minMetric,
        endsAt: t.maxMetric,
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
      return { code: "EARLY_NO_MAXIMUM" };
    }
    const expected = mode === "integer" ? a.maxMetric + 1 : a.maxMetric;
    if (b.minMetric !== expected) {
      return {
        code: b.minMetric > expected ? "RANGE_GAP" : "RANGE_OVERLAP",
        currentLabel: a.label,
        nextLabel: b.label,
        currentEndsAt: a.maxMetric,
        nextStartsAt: b.minMetric,
        expectedNextStart: expected,
      };
    }
  }
  return null;
}

function formatLegacyClientIssue(
  issue: ClientTierIssue,
  surfaceLabel: string,
  mode: "integer" | "fractional",
): string {
  switch (issue.code) {
    case "EMPTY":
      return `${surfaceLabel}: add at least one tier.`;
    case "MISSING_COPY":
      return `${surfaceLabel}: every tier needs a label and a message.`;
    case "END_BEFORE_START":
      return `${surfaceLabel}: tier "${issue.label}" max (${issue.endsAt}) is less than min (${issue.startsAt}).`;
    case "EARLY_NO_MAXIMUM":
      return `${surfaceLabel}: only the highest tier may omit max (open-ended).`;
    case "RANGE_GAP":
    case "RANGE_OVERLAP":
      if (mode === "integer") {
        return `${surfaceLabel}: tier "${issue.currentLabel}" ends at ${issue.currentEndsAt}; tier "${issue.nextLabel}" must start at ${issue.expectedNextStart} (no gap, no overlap).`;
      }
      return issue.code === "RANGE_GAP"
        ? `${surfaceLabel}: gap between tier "${issue.currentLabel}" (max ${issue.currentEndsAt}) and tier "${issue.nextLabel}" (min ${issue.nextStartsAt}) — tiers must touch.`
        : `${surfaceLabel}: overlap between tier "${issue.currentLabel}" (max ${issue.currentEndsAt}) and tier "${issue.nextLabel}" (min ${issue.nextStartsAt}).`;
  }
}

function formatFriendlyClientIssue(
  issue: ClientTierIssue,
  surfaceLabel: string,
): string {
  switch (issue.code) {
    case "EMPTY":
      return `${surfaceLabel}: add at least one tier.`;
    case "MISSING_COPY":
      return `${surfaceLabel}: every range needs a result name and message.`;
    case "END_BEFORE_START":
      return `${surfaceLabel}: the range "${issue.label}" ends at ${issue.endsAt}, before it starts at ${issue.startsAt}.`;
    case "EARLY_NO_MAXIMUM":
      return `${surfaceLabel}: only the last range can have no maximum.`;
    case "RANGE_GAP":
      return `${surfaceLabel}: "${issue.currentLabel}" ends at ${issue.currentEndsAt}; "${issue.nextLabel}" must start at ${issue.expectedNextStart}.`;
    case "RANGE_OVERLAP":
      return `${surfaceLabel}: "${issue.currentLabel}" ends at ${issue.currentEndsAt}; "${issue.nextLabel}" starts at ${issue.nextStartsAt}, so the ranges overlap.`;
  }
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
  plainLanguageEnabled: boolean;
}

function TierTable({
  tiers,
  onChange,
  isReadOnly,
  testIdPrefix,
  plainLanguageEnabled,
}: TierTableProps) {
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
        <table
          className="w-full text-sm"
          aria-label={plainLanguageEnabled ? "Result ranges" : "Tier definitions"}
        >
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-16">
                Order
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-24">
                {plainLanguageEnabled
                  ? FRIENDLY_SCORING_COPY.startsAt
                  : "minMetric"}
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-24">
                {plainLanguageEnabled
                  ? FRIENDLY_SCORING_COPY.endsAt
                  : "maxMetric"}
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-40">
                {plainLanguageEnabled
                  ? FRIENDLY_SCORING_COPY.resultName
                  : "Label"}
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {plainLanguageEnabled
                  ? FRIENDLY_SCORING_COPY.messageShown
                  : "Message"}
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
                    aria-label={
                      plainLanguageEnabled
                        ? `${FRIENDLY_SCORING_COPY.startsAt} for ${
                            tier.label.trim() || `tier ${idx + 1}`
                          }`
                        : undefined
                    }
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
                    aria-label={
                      plainLanguageEnabled
                        ? `${FRIENDLY_SCORING_COPY.endsAt} for ${
                            tier.label.trim() || `tier ${idx + 1}`
                          }`
                        : undefined
                    }
                    className="wf-input disabled:opacity-60"
                    placeholder={
                      plainLanguageEnabled
                        ? FRIENDLY_SCORING_COPY.noMaximum
                        : "(unbounded)"
                    }
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
                    aria-label={
                      plainLanguageEnabled
                        ? `${FRIENDLY_SCORING_COPY.resultName} for tier ${
                            idx + 1
                          }`
                        : undefined
                    }
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
                    aria-label={
                      plainLanguageEnabled
                        ? `${FRIENDLY_SCORING_COPY.messageShown} for ${
                            tier.label.trim() || `tier ${idx + 1}`
                          }`
                        : undefined
                    }
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
        {plainLanguageEnabled ? FRIENDLY_SCORING_COPY.addTier : "+ Add Tier"}
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
  plainLanguageEnabled = false,
}: ScoringTiersTabProps) {
  const tierMetric = scoringConfig.tierMetric;
  const passThreshold = scoringConfig.passThreshold;
  const tiers = useMemo(
    () => scoringConfig.tiers ?? [],
    [scoringConfig.tiers],
  );
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
  const globalIssueData = validateTiersClient(tiers, globalMode);
  const globalIssue = globalIssueData
    ? {
        message: plainLanguageEnabled
          ? formatFriendlyClientIssue(
              globalIssueData,
              FRIENDLY_SCORING_COPY.overallTiers,
            )
          : formatLegacyClientIssue(
              globalIssueData,
              "Global tiers",
              globalMode,
            ),
      }
    : null;

  // ED5 T16/T17 (B-5) — the REAL metric domain, computed client-side from the
  // slider questions + config (all tab questions are SLIDER_LIKERT). Null when
  // the domain is ambiguous (mixed scales throw) or open-ended (non-finite max):
  // the visual bar is hidden and the domain-span check is skipped, mirroring the
  // publish-time behaviour.
  const globalDomain: TierDomain | null = useMemo(() => {
    try {
      const d = computeGlobalTierDomain(
        questions as unknown as Parameters<typeof computeGlobalTierDomain>[0],
        {
          rollup: scoringConfig.rollup as Parameters<
            typeof computeGlobalTierDomain
          >[1]["rollup"],
          tierMetric,
        },
      );
      return Number.isFinite(d.max) && d.max > d.min ? d : null;
    } catch {
      return null;
    }
  }, [questions, scoringConfig.rollup, tierMetric]);

  // ED5 T16 rider — surface the publish-time domain-SPAN check LIVE (today the
  // client only checks internal contiguity; a non-spanning draft published then
  // 400'd every submit — the Wave V gap). Uses the SAME exported validator.
  const globalDomainIssue: TilingIssue | null = useMemo(() => {
    if (!globalDomain) return null;
    const issues = validateTierTiling(
      tiers as unknown as Parameters<typeof validateTierTiling>[0],
      globalDomain,
    );
    if (issues.length === 0) return null;
    return {
      message: plainLanguageEnabled
        ? formatFriendlyTilingIssue(
            issues[0],
            FRIENDLY_SCORING_COPY.overallTiers,
          )
        : `Global tiers: ${issues[0].message}`,
    };
  }, [globalDomain, plainLanguageEnabled, tiers]);

  // ED5 T18 (B-5) — per-domain metric bounds for the per-domain band bars. The
  // already-exported computePerDomainTierContexts owns the (fractional) domain
  // per key; a domain with no questions / an ambiguous config yields a
  // non-finite max, so its bar is hidden (table only), mirroring publish.
  const perDomainBounds = useMemo(() => {
    const out = new Map<string, TierDomain>();
    if (domains.length === 0) return out;
    try {
      for (const ctx of computePerDomainTierContexts(
        sections as unknown as Parameters<typeof computePerDomainTierContexts>[0],
        questions as unknown as Parameters<typeof computePerDomainTierContexts>[1],
        domains.map((d) => d.key),
      )) {
        if (Number.isFinite(ctx.domain.max) && ctx.domain.max > ctx.domain.min) {
          out.set(ctx.domainKey, ctx.domain);
        }
      }
    } catch {
      /* ambiguous config → no per-domain bars (table stays authoritative) */
    }
    return out;
  }, [sections, questions, domains]);
  const domainIssues = useMemo(() => {
    const out: TilingIssue[] = [];
    for (const d of domains) {
      // Per-domain tiers always fractional
      const issue = validateTiersClient(d.tiers, "fractional");
      if (issue) {
        out.push({
          message: plainLanguageEnabled
            ? formatFriendlyClientIssue(
                issue,
                `${FRIENDLY_SCORING_COPY.areaTiers} — ${d.label}`,
              )
            : formatLegacyClientIssue(
                issue,
                `Domain "${d.label}"`,
                "fractional",
              ),
        });
      }
    }
    return out;
  }, [domains, plainLanguageEnabled]);

  const firstIssue =
    globalIssue ?? globalDomainIssue ?? domainIssues[0] ?? null;

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
            {plainLanguageEnabled
              ? FRIENDLY_SCORING_COPY.title
              : "Scoring Configuration"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {plainLanguageEnabled
              ? "Choose how answers become an overall result and message."
              : "How responses convert into a headline metric and tier message."}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label
              htmlFor="tier-metric"
              className="wf-label"
            >
              {plainLanguageEnabled
                ? FRIENDLY_SCORING_COPY.metricLabel
                : "Tier Metric"}
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
                {plainLanguageEnabled
                  ? friendlyMetricLabel("countAchieved")
                  : "countAchieved — Count of questions with score ≥ passThreshold"}
              </option>
              <option value="overallTotal">
                {plainLanguageEnabled
                  ? friendlyMetricLabel("overallTotal")
                  : "overallTotal — Sum of all numeric values"}
              </option>
              <option value="overallAvg">
                {plainLanguageEnabled
                  ? friendlyMetricLabel("overallAvg")
                  : "overallAvg — Mean of all numeric values"}
              </option>
            </select>
            <p className="text-xs text-muted-foreground">
              {plainLanguageEnabled
                ? "Choose the method used to calculate the overall result."
                : "Drives the headline metric the tier ranges resolve against."}
            </p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="pass-threshold"
              className="wf-label"
            >
              {plainLanguageEnabled
                ? FRIENDLY_SCORING_COPY.passThresholdLabel
                : "Pass Threshold"}
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
              {plainLanguageEnabled ? (
                <>
                  Used only when <strong>Questions passed</strong> is selected.
                </>
              ) : (
                <>
                  A question counts as &ldquo;achieved&rdquo; when its score ≥
                  this value. Rockefeller uses 2 (on a 0–3 scale).
                </>
              )}
            </p>
          </div>
        </div>

        {/* Tiers table */}
        <div className="space-y-3 pt-2">
          <header className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">
              {plainLanguageEnabled
                ? FRIENDLY_SCORING_COPY.overallTiers
                : "Tiers"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {plainLanguageEnabled
                ? "Tiers apply to the whole assessment—not to individual sections. Together, the ranges must cover every possible overall result without gaps."
                : "Each tier defines a metric range + label + message shown on the results page. Tiers must cover the full metric domain with no gaps or overlaps (Zod refine enforces this on save)."}
            </p>
          </header>
          {globalDomain ? (
            <TierBandBar
              tiers={tiers}
              domain={globalDomain}
              mode={globalMode}
              step={globalMode === "integer" ? 1 : 0.1}
              onChange={handleTiersChange}
              isReadOnly={isReadOnly}
              testIdPrefix="global-tier-band"
            />
          ) : (
            <p
              className="text-[0.625rem] italic text-muted-foreground"
              data-testid="global-tier-band-unavailable"
            >
              {plainLanguageEnabled
                ? "The visual range editor is unavailable for the selected method—use the table below."
                : "Visual band editor unavailable for this metric (open-ended or ambiguous domain) — use the table below."}
            </p>
          )}
          <TierTable
            tiers={tiers}
            onChange={handleTiersChange}
            isReadOnly={isReadOnly}
            testIdPrefix="global-tier"
            plainLanguageEnabled={plainLanguageEnabled}
          />

          {/* Validation hint card */}
          <div
            role="note"
            className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground"
          >
            <p className="font-semibold text-foreground mb-1">
              {plainLanguageEnabled
                ? FRIENDLY_SCORING_COPY.publishHelp
                : "Validation rules (Zod refine on save)"}
            </p>
            {plainLanguageEnabled ? (
              <ul className="list-disc list-inside space-y-0.5">
                <li>Every possible overall result must be covered by a range.</li>
                <li>Ranges cannot have gaps.</li>
                <li>Ranges cannot overlap.</li>
                <li>Only the last range may have no maximum.</li>
              </ul>
            ) : (
              <ul className="list-disc list-inside space-y-0.5">
                <li>
                  All tiers&apos; <code>[minMetric, maxMetric]</code> ranges
                  must cover <code>[0, maxPossibleMetric]</code>.
                </li>
                <li>No gaps allowed between consecutive tiers.</li>
                <li>No overlaps allowed.</li>
                <li>
                  <code>maxMetric</code> of the last tier may be omitted
                  (treated as unbounded).
                </li>
              </ul>
            )}
          </div>

          {/* Live preview card */}
          <div
            data-testid="tier-preview"
            className="wf-card"
            style={{ padding: "0.75rem 1rem" }}
          >
            <p className="text-sm font-semibold text-foreground mb-1">
              {plainLanguageEnabled
                ? FRIENDLY_SCORING_COPY.exampleResult
                : "Preview — Tier Resolution"}
            </p>
            {preview ? (
              <div className="text-sm">
                <span className="text-muted-foreground">
                  {plainLanguageEnabled
                    ? "Using middle answers:"
                    : "Midpoint-answer simulation:"}
                </span>{" "}
                <span className="font-medium">
                  score = {preview.score.toFixed(2)}
                </span>{" "}
                →{" "}
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                  {plainLanguageEnabled ? "result" : "tier"}:{" "}
                  {preview.tier ??
                    (plainLanguageEnabled ? "(no matching range)" : "(unresolved)")}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {plainLanguageEnabled
                  ? "Example unavailable — add questions and ranges to see a result"
                  : "Preview unavailable — provide sample submission"}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {plainLanguageEnabled
                ? "This example uses the middle answer for every question."
                : "Preview uses midpoint-answer simulation against the scoring engine."}
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
              {plainLanguageEnabled
                ? FRIENDLY_SCORING_COPY.areaTiers
                : "Per-domain tiers"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {plainLanguageEnabled
                ? "Each area uses ranges that cover every possible result without gaps."
                : "Resolved per domain when this template has a nested rollup. Same touching/coverage rules per domain."}
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
                  {domain.label}
                  {!plainLanguageEnabled && (
                    <>
                      {" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({domain.key})
                      </span>
                    </>
                  )}
                </h4>
              </header>
              {perDomainBounds.has(domain.key) && (
                <TierBandBar
                  tiers={domain.tiers ?? []}
                  domain={perDomainBounds.get(domain.key)!}
                  mode="fractional"
                  step={0.1}
                  onChange={(next) => handleDomainTiersChange(domain.key, next)}
                  isReadOnly={isReadOnly}
                  testIdPrefix={`domain-tier-band-${domain.key}`}
                />
              )}
              <TierTable
                tiers={domain.tiers ?? []}
                onChange={(next) => handleDomainTiersChange(domain.key, next)}
                isReadOnly={isReadOnly}
                testIdPrefix={`domain-tier-${domain.key}`}
                plainLanguageEnabled={plainLanguageEnabled}
              />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
