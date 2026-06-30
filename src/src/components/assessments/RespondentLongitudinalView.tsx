"use client";

/**
 * Assessment v7.6 — Wave N (#23) — per-respondent longitudinal VIEW.
 *
 * Client component. Receives the server-fetched `RespondentLongitudinalOutcome`
 * (the page resolves authz/flag/audit; this only RENDERS) and shows ONE person's
 * results across the campaigns they completed for the same scored assessment.
 *
 * Rendered per the sign-off mockup — coach-portal BLUE app chrome (Tailwind
 * tokens, NOT the `su-public-brand` report styling):
 *   - header: name · company · assessment · "N assessments, <first>–<last>"
 *   - overall-score trend line (inline SVG, dated x-axis, emphasized endpoint)
 *   - per-section / per-domain table: cols = dated campaigns, cells = value +
 *     ▲/▼ delta; a "different version" badge where `deltaComparable === false`
 *   - tier-movement row ONLY where a tier exists on >=1 point
 *   - version note (multi-version / all-different-versions)
 *   - states: notApplicable (qualitative), empty (no submissions), and the
 *     `comparableCount === 0` "need ≥2 to compare" note
 *
 * Design notes
 * ────────────
 * - Pure-SVG trend line (no chart library, mirrors CampaignTrendsView).
 * - All semantic colors come from Tailwind tokens (no hardcoded hex) so the
 *   blue portal chrome stays consistent (ADR-0005 scoping is N/A here — these
 *   are portal tokens, not the scoped report brand).
 * - `submittedAt` may arrive as a Date (server) OR an ISO string (if a callsite
 *   JSON-roundtrips); we normalize on read.
 */

import { useMemo } from "react";
import { ArrowLeft, AlertTriangle, LineChart, Info } from "lucide-react";
import Link from "next/link";
import type {
  RespondentLongitudinalOutcome,
  RespondentLongitudinalPoint,
} from "@/lib/assessments/respondent-longitudinal";

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function formatShortDate(v: Date | string): string {
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** A signed delta string with an arrow, or null when not comparable. */
function deltaLabel(delta: number | undefined): {
  text: string;
  tone: "up" | "down" | "flat";
} | null {
  if (typeof delta !== "number") return null;
  if (Math.abs(delta) < 0.005) return { text: "0", tone: "flat" };
  if (delta > 0) return { text: `+${roundTo(delta, 2)}`, tone: "up" };
  return { text: `${roundTo(delta, 2)}`, tone: "down" };
}

function deltaToneClass(tone: "up" | "down" | "flat"): string {
  switch (tone) {
    case "up":
      return "text-success";
    case "down":
      return "text-destructive";
    case "flat":
    default:
      return "text-muted-foreground";
  }
}

function niceCeiling(value: number): number {
  if (value <= 1) return 1;
  if (value <= 3) return 3;
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  if (value <= 20) return 20;
  if (value <= 50) return 50;
  if (value <= 100) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

// ────────────────────────────────────────────────────────────────────────
// Public component
// ────────────────────────────────────────────────────────────────────────

export interface RespondentLongitudinalViewProps {
  outcome: RespondentLongitudinalOutcome;
}

export function RespondentLongitudinalView({
  outcome,
}: RespondentLongitudinalViewProps) {
  return (
    <div className="space-y-6" data-testid="respondent-longitudinal-view">
      <Link
        href="/portal/assessments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Assessments
      </Link>

      {outcome.kind === "notApplicable" && <NotApplicableCard />}
      {outcome.kind === "empty" && <EmptyCard />}
      {outcome.kind === "ok" && <OkView data={outcome.data} />}
      {/* forbidden never reaches this component — the page 404s. Defensive: */}
      {outcome.kind === "forbidden" && <EmptyCard />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// notApplicable — qualitative template
// ────────────────────────────────────────────────────────────────────────

function NotApplicableCard() {
  return (
    <div
      className="bg-card border border-border rounded-xl p-12 text-center"
      data-testid="longitudinal-not-applicable"
    >
      <div className="inline-flex items-center justify-center bg-muted/40 text-muted-foreground rounded-full w-12 h-12 mb-4">
        <Info className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        Comparison isn&apos;t available for this assessment
      </h3>
      <p className="text-muted-foreground max-w-md mx-auto">
        This is a qualitative assessment — its responses aren&apos;t scored, so
        there&apos;s no overall score or section average to track over time.
        Longitudinal comparison is available for scored assessments only.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// empty — matched person has no plottable submissions
// ────────────────────────────────────────────────────────────────────────

function EmptyCard() {
  return (
    <div
      className="bg-card border border-border rounded-xl p-12 text-center"
      data-testid="longitudinal-empty"
    >
      <div className="inline-flex items-center justify-center bg-muted/40 text-muted-foreground rounded-full w-12 h-12 mb-4">
        <LineChart className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        No submissions to compare yet
      </h3>
      <p className="text-muted-foreground max-w-md mx-auto">
        This person hasn&apos;t completed this assessment in any campaign yet.
        Once they submit, their results will appear here for comparison.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ok — the longitudinal view
// ────────────────────────────────────────────────────────────────────────

function OkView({
  data,
}: {
  data: Extract<RespondentLongitudinalOutcome, { kind: "ok" }>["data"];
}) {
  const {
    respondent,
    companyName,
    assessment,
    points,
    comparableCount,
    bounded,
    hasMultipleVersions,
  } = data;

  const firstDate = points.length > 0 ? formatShortDate(points[0].submittedAt) : "—";
  const lastDate =
    points.length > 0
      ? formatShortDate(points[points.length - 1].submittedAt)
      : "—";

  // Section/domain axis: union of stableKeys in first-seen order across points.
  const rowDefs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of points) {
      for (const r of p.rows) {
        if (!seen.has(r.stableKey)) seen.set(r.stableKey, r.name);
      }
    }
    return Array.from(seen.entries()).map(([stableKey, name]) => ({
      stableKey,
      name,
    }));
  }, [points]);

  // Does any point carry a real tier? (SU-Full has none — ADR-0015.)
  const hasTier = useMemo(
    () => points.some((p) => typeof p.overall.tier === "string"),
    [points],
  );

  // All-different-versions: >1 version AND nothing comparable.
  const allDifferentVersions = hasMultipleVersions && comparableCount === 0;
  const needMoreToCompare = comparableCount === 0;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Comparison across campaigns · {assessment.alias}
            </p>
            <h1 className="text-2xl font-bold text-foreground">
              {respondent.name || "Respondent"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {[companyName, respondent.jobTitle].filter(Boolean).join(" · ") ||
                "—"}
            </p>
            <p className="text-sm text-foreground mt-1">{assessment.name}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-foreground font-medium">
              {points.length}{" "}
              {points.length === 1 ? "assessment" : "assessments"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {firstDate}–{lastDate}
            </p>
          </div>
        </div>

        {bounded && (
          <div className="mt-4 flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p data-testid="longitudinal-bounded-note">
              Showing the latest {bounded.shown} of {bounded.total} campaigns.
            </p>
          </div>
        )}

        {needMoreToCompare && (
          <div
            className="mt-4 flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning"
            data-testid="longitudinal-need-two"
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              {allDifferentVersions
                ? "Every submission used a different assessment version, so values are shown but not compared. Two submissions on the same version are needed to compute change."
                : points.length <= 1
                  ? "Only one submission so far — values are shown, but at least two comparable submissions are needed to show change over time."
                  : "No two submissions share a comparable assessment version yet, so values are shown without change indicators."}
            </p>
          </div>
        )}

        {hasMultipleVersions && !allDifferentVersions && (
          <div className="mt-4 flex items-start gap-2 bg-muted/40 border border-border rounded-lg p-3 text-sm text-muted-foreground">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p data-testid="longitudinal-version-note">
              Some assessments used an earlier version; change indicators are
              shown only between comparable versions.
            </p>
          </div>
        )}
      </div>

      {/* OVERALL TREND LINE */}
      <OverallTrendLine points={points} />

      {/* PER-SECTION / DOMAIN TABLE */}
      <div className="bg-card border border-border rounded-xl p-6 overflow-x-auto">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Section detail over time
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Each value is the section average for that campaign · arrows show
          change vs. the previous comparable campaign.
        </p>
        <table
          className="w-full text-sm"
          data-testid="longitudinal-section-table"
        >
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-semibold text-foreground">
                Section
              </th>
              {points.map((p, idx) => (
                <th
                  key={p.campaignId}
                  className="text-right px-3 py-2 font-semibold text-foreground whitespace-nowrap"
                >
                  <div>{formatShortDate(p.submittedAt)}</div>
                  <div
                    className="text-[10px] font-normal text-muted-foreground truncate max-w-[10rem]"
                    title={p.campaignLabel}
                  >
                    {p.campaignLabel}
                  </div>
                  {/* "different version" marks a genuine cross-version transition:
                      a column that has a prior column (idx > 0) but no same-version
                      predecessor to delta against. The baseline column (idx 0) is
                      non-comparable simply because nothing precedes it — NOT a
                      version change — so it gets no badge. Degraded columns carry
                      the "*" marker instead. */}
                  {idx > 0 && !p.degraded && p.overall.deltaComparable === false && (
                    <span
                      className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      data-testid="longitudinal-version-badge"
                    >
                      different version
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {/* OVERALL row */}
            <tr className="bg-muted/20">
              <td className="px-3 py-2 text-foreground font-semibold">
                Overall average
              </td>
              {points.map((p) => (
                <Cell
                  key={p.campaignId}
                  value={p.overall.average}
                  delta={p.overall.deltaComparable ? p.overall.delta : undefined}
                  degraded={p.degraded}
                />
              ))}
            </tr>

            {/* Per-section / domain rows */}
            {rowDefs.map((def) => (
              <tr key={def.stableKey}>
                <td className="px-3 py-2 text-foreground font-medium">
                  {def.name}
                </td>
                {points.map((p) => {
                  const row = p.rows.find((r) => r.stableKey === def.stableKey);
                  if (!row) {
                    return (
                      <td
                        key={p.campaignId}
                        className="px-3 py-2 text-right text-muted-foreground font-mono"
                      >
                        —
                      </td>
                    );
                  }
                  return (
                    <Cell
                      key={p.campaignId}
                      value={row.value}
                      delta={row.deltaComparable ? row.delta : undefined}
                    />
                  );
                })}
              </tr>
            ))}

            {/* TIER-MOVEMENT row — only where a real tier exists. */}
            {hasTier && (
              <tr
                className="bg-muted/20"
                data-testid="longitudinal-tier-row"
              >
                <td className="px-3 py-2 text-foreground font-semibold">
                  Tier
                </td>
                {points.map((p) => (
                  <td
                    key={p.campaignId}
                    className="px-3 py-2 text-right text-foreground"
                  >
                    {p.overall.tier ?? "—"}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// A table cell: value + optional delta arrow.
// ────────────────────────────────────────────────────────────────────────

function Cell({
  value,
  delta,
  degraded,
}: {
  value: number;
  delta: number | undefined;
  degraded?: boolean;
}) {
  const d = deltaLabel(delta);
  return (
    <td className="px-3 py-2 text-right font-mono text-foreground">
      <span>{roundTo(value, 2)}</span>
      {d && (
        <span className={`ml-1 text-xs ${deltaToneClass(d.tone)}`}>
          {d.tone === "up" && "▲"}
          {d.tone === "down" && "▼"}
          {d.text}
        </span>
      )}
      {degraded && (
        <span
          className="ml-1 text-warning"
          title="This campaign had more than one submission for this person; the latest is shown."
        >
          *
        </span>
      )}
    </td>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Overall trend line (SVG, no library) — dated x-axis, emphasized endpoint.
// ────────────────────────────────────────────────────────────────────────

function OverallTrendLine({
  points,
}: {
  points: RespondentLongitudinalPoint[];
}) {
  // Degraded (malformed-result) points have no trustworthy value (average left
  // at 0); plotting them would draw a fabricated plunge. Exclude them from the
  // trend entirely — they remain visible + flagged in the table (ADR-0016
  // "skip the bad column").
  const valid = points.filter((p) => !p.degraded);

  // Prefer the ScaleUp 0-100 score where present (SU-Full/Quick), else the
  // overall average.
  const useScaleUp =
    valid.length > 0 &&
    valid.every((p) => typeof p.overall.scaleUpScore === "number");
  const series = valid.map((p) =>
    useScaleUp ? (p.overall.scaleUpScore as number) : p.overall.average,
  );

  const W = 800;
  const H = 240;
  const PAD_L = 56;
  const PAD_R = 32;
  const PAD_T = 24;
  const PAD_B = 56;

  const maxValue = Math.max(1, ...series);
  const yMax = niceCeiling(maxValue);
  const n = valid.length;
  const xStep = (W - PAD_L - PAD_R) / Math.max(1, n - 1);

  const plotted = valid.map((p, i) => {
    const value = series[i];
    const x = n === 1 ? (W - PAD_L - PAD_R) / 2 + PAD_L : PAD_L + i * xStep;
    const y = PAD_T + (1 - value / yMax) * (H - PAD_T - PAD_B);
    return { x, y, value, point: p };
  });

  const polylinePoints = plotted.map((p) => `${p.x},${p.y}`).join(" ");

  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    yPx: PAD_T + (1 - t) * (H - PAD_T - PAD_B),
    label: roundTo(t * yMax, useScaleUp ? 0 : 1),
  }));

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Overall score over time
        </h2>
        <p className="text-sm text-muted-foreground">
          {useScaleUp
            ? "ScaleUp score (provisional) per campaign · higher is better"
            : "Overall average per campaign · higher is better"}
        </p>
      </div>
      <div className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-60"
          role="img"
          aria-label="Overall score trend"
          data-testid="longitudinal-trend-chart"
        >
          {yLabels.map((row, i) => (
            <g key={i}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={row.yPx}
                y2={row.yPx}
                strokeDasharray="3 4"
                className="stroke-border"
              />
              <text
                x={PAD_L - 8}
                y={row.yPx + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {row.label}
              </text>
            </g>
          ))}

          {plotted.length >= 2 && (
            <polyline
              points={polylinePoints}
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-primary"
            />
          )}

          {plotted.map((p, i) => {
            const isEndpoint = i === plotted.length - 1;
            return (
              <g key={p.point.campaignId}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isEndpoint ? 7 : 5}
                  strokeWidth={3}
                  className={
                    isEndpoint
                      ? "fill-primary stroke-primary"
                      : "fill-card stroke-primary"
                  }
                />
                <text
                  x={p.x}
                  y={p.y - 12}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-semibold"
                >
                  {roundTo(p.value, useScaleUp ? 0 : 2)}
                </text>
                <text
                  x={p.x}
                  y={H - PAD_B + 18}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {formatShortDate(p.point.submittedAt)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
