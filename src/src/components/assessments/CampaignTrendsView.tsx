"use client";

/**
 * Assessment v7.6 — Coach trends view (Task H).
 *
 * Client component. Receives the server-fetched LongitudinalTrend and
 * renders:
 *   - header card (template, org, campaign counts, version banner)
 *   - empty state (zero campaigns)
 *   - single-campaign state (stats card + "need 2+" banner)
 *   - multi-campaign view:
 *       • composite-score SVG line chart (X = openAt, Y = meanCountAchieved)
 *       • per-section trend table (sections × campaigns; cell shading by delta)
 *       • per-question sparkline grid (collapsible, default closed)
 *
 * Wireframe: public/wireframes/10-trends-page.html
 *
 * Design notes
 * ────────────
 * - Pure-SVG charts so we don't pull in a chart library for one page.
 * - All semantic colors come from Tailwind tokens (no hardcoded hex).
 * - Hard date guards: the props may arrive as Date instances (server) OR
 *   ISO strings (if any callsite ever JSON-roundtrips). We normalize on
 *   read.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import type { LongitudinalTrend } from "@/lib/assessments/trends";

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function formatShortDate(v: Date | string): string {
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function trendTone(
  current: number,
  previous: number | null,
): "up" | "down" | "flat" | "none" {
  if (previous === null) return "none";
  const delta = current - previous;
  if (Math.abs(delta) < 0.05) return "flat";
  return delta > 0 ? "up" : "down";
}

function trendCellClasses(tone: "up" | "down" | "flat" | "none"): string {
  switch (tone) {
    case "up":
      return "bg-success/10 text-success";
    case "down":
      return "bg-destructive/10 text-destructive";
    case "flat":
      return "bg-warning/10 text-warning";
    case "none":
    default:
      return "bg-muted/30 text-muted-foreground";
  }
}

// ────────────────────────────────────────────────────────────────────────
// Public component
// ────────────────────────────────────────────────────────────────────────

export interface CampaignTrendsViewProps {
  trend: LongitudinalTrend;
}

export function CampaignTrendsView({ trend }: CampaignTrendsViewProps) {
  const {
    template,
    organization,
    campaigns,
    questionSparklines,
    hasMultipleVersions,
    excludedCampaignCount,
    latestVersion,
  } = trend;

  const [questionsOpen, setQuestionsOpen] = useState(false);

  // Build the section axis off campaign[0]'s section keys (all campaigns
  // share the same template version, so the section list is stable).
  const sectionDefs = useMemo(() => {
    if (campaigns.length === 0) return [];
    // Aggregate section names from the most recent campaign's submissions.
    const seen = new Map<string, { stableKey: string; name: string }>();
    for (const c of campaigns) {
      for (const s of c.submissions) {
        for (const ps of s.perSection) {
          if (!seen.has(ps.stableKey)) {
            seen.set(ps.stableKey, { stableKey: ps.stableKey, name: ps.name });
          }
        }
      }
    }
    return Array.from(seen.values());
  }, [campaigns]);

  // Per-section per-campaign mean of `averagePoints`.
  const sectionMeansByCampaign = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const c of campaigns) {
      const perSectionAcc: Record<string, { sum: number; n: number }> = {};
      for (const s of c.submissions) {
        for (const ps of s.perSection) {
          if (!perSectionAcc[ps.stableKey]) {
            perSectionAcc[ps.stableKey] = { sum: 0, n: 0 };
          }
          perSectionAcc[ps.stableKey].sum += ps.averagePoints;
          perSectionAcc[ps.stableKey].n += 1;
        }
      }
      const m: Record<string, number> = {};
      for (const [k, v] of Object.entries(perSectionAcc)) {
        m[k] = v.n === 0 ? 0 : v.sum / v.n;
      }
      out[c.campaign.id] = m;
    }
    return out;
  }, [campaigns]);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Trends · {template.alias}
            </p>
            <h1 className="text-2xl font-bold text-foreground">
              {template.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {organization.name} · v{latestVersion.versionNumber}{" "}
              {latestVersion.language}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="text-foreground font-medium">
              {campaigns.length}{" "}
              {campaigns.length === 1 ? "campaign" : "campaigns"}
            </p>
            {excludedCampaignCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {excludedCampaignCount} excluded (older version)
              </p>
            )}
          </div>
        </div>

        {hasMultipleVersions && (
          <div className="mt-4 flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Multiple template versions exist. Only campaigns on the latest
              version (v{latestVersion.versionNumber}) are included so the
              question set is comparable.
            </p>
          </div>
        )}
      </div>

      {/* STATE 1: no campaigns */}
      {campaigns.length === 0 && <EmptyState />}

      {/* STATE 2: single campaign */}
      {campaigns.length === 1 && (
        <SingleCampaignState campaign={campaigns[0]} />
      )}

      {/* STATE 3: multi-campaign */}
      {campaigns.length >= 2 && (
        <>
          <CompositeLineChart campaigns={campaigns} />
          <PerSectionTable
            campaigns={campaigns}
            sectionDefs={sectionDefs}
            sectionMeansByCampaign={sectionMeansByCampaign}
          />
          <PerQuestionSparklines
            open={questionsOpen}
            onToggle={() => setQuestionsOpen((v) => !v)}
            sparklines={questionSparklines}
          />
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Empty state
// ────────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="bg-card border border-border rounded-xl p-12 text-center">
      <h3 className="text-lg font-semibold text-foreground mb-2">
        No campaigns to compare yet
      </h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        Trends compare submissions across multiple campaigns for the same
        template and organization. Run your first campaign to start
        collecting data.
      </p>
      <a
        href="/portal/assessments/new"
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
      >
        Start a campaign
      </a>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Single-campaign state
// ────────────────────────────────────────────────────────────────────────

function SingleCampaignState({
  campaign,
}: {
  campaign: LongitudinalTrend["campaigns"][number];
}) {
  return (
    <div className="space-y-4">
      <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-start gap-2 text-sm text-warning">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Trends require 2+ campaigns for the same template + organization.
          Run another campaign to see a comparison.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          {campaign.campaign.name}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {formatShortDate(campaign.campaign.openAt)} ·{" "}
          {campaign.submissions.length}{" "}
          {campaign.submissions.length === 1 ? "submission" : "submissions"}
        </p>
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Mean count achieved"
            value={roundTo(campaign.meanCountAchieved, 1)}
          />
          <StatCard
            label="Mean overall total"
            value={roundTo(campaign.meanOverallTotal, 1)}
          />
          <StatCard
            label="Mean overall avg"
            value={roundTo(campaign.meanOverallAverage, 2)}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/30 border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Composite line chart (SVG, no library)
// ────────────────────────────────────────────────────────────────────────

function CompositeLineChart({
  campaigns,
}: {
  campaigns: LongitudinalTrend["campaigns"];
}) {
  // Chart geometry — fixed viewBox for SVG, scales nicely with CSS width.
  const W = 800;
  const H = 240;
  const PAD_L = 60;
  const PAD_R = 32;
  const PAD_T = 24;
  const PAD_B = 48;

  const values = campaigns.map((c) => c.meanCountAchieved);
  const maxValue = Math.max(1, ...values);
  // Round y-max up to a clean step (1, 5, 10, 20, 40…).
  const yMax = niceCeiling(maxValue);

  const n = campaigns.length;
  const xStep = (W - PAD_L - PAD_R) / Math.max(1, n - 1);

  const points = campaigns.map((c, i) => {
    const x = PAD_L + i * xStep;
    const y =
      PAD_T +
      (1 - c.meanCountAchieved / yMax) * (H - PAD_T - PAD_B);
    return { x, y, value: c.meanCountAchieved, campaign: c.campaign };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Y-axis labels at 0, 25%, 50%, 75%, 100%.
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    yPx: PAD_T + (1 - t) * (H - PAD_T - PAD_B),
    label: roundTo(t * yMax, 1),
  }));

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Composite score over time
        </h2>
        <p className="text-sm text-muted-foreground">
          Mean count achieved per campaign · higher is better
        </p>
      </div>
      <div className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-60"
          role="img"
          aria-label="Composite trend chart"
        >
          {/* Gridlines + Y-axis labels */}
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

          {/* Polyline */}
          <polyline
            points={polylinePoints}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-primary"
          />

          {/* Data points + labels */}
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={5}
                strokeWidth={3}
                className="fill-card stroke-primary"
              />
              <text
                x={p.x}
                y={p.y - 10}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-semibold"
              >
                {roundTo(p.value, 1)}
              </text>
              <text
                x={p.x}
                y={H - PAD_B + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {formatShortDate(p.campaign.openAt)}
              </text>
              <text
                x={p.x}
                y={H - PAD_B + 30}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {p.campaign.alias}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function niceCeiling(value: number): number {
  // Round up to a clean increment for chart readability.
  if (value <= 1) return 1;
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  if (value <= 20) return 20;
  if (value <= 40) return 40;
  if (value <= 50) return 50;
  if (value <= 100) return 100;
  // For arbitrarily large values, round up to the next power-of-10
  // multiple of {1, 2, 5}.
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

// ────────────────────────────────────────────────────────────────────────
// Per-section trend table
// ────────────────────────────────────────────────────────────────────────

function PerSectionTable({
  campaigns,
  sectionDefs,
  sectionMeansByCampaign,
}: {
  campaigns: LongitudinalTrend["campaigns"];
  sectionDefs: Array<{ stableKey: string; name: string }>;
  sectionMeansByCampaign: Record<string, Record<string, number>>;
}) {
  if (sectionDefs.length === 0) {
    return null;
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 overflow-x-auto">
      <h2 className="text-lg font-semibold text-foreground mb-1">
        Per-section trend
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Mean of section averages per campaign · cell shading shows change
        vs. previous campaign
      </p>
      <table className="w-full text-sm" data-testid="trends-section-table">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-3 py-2 font-semibold text-foreground">
              Section
            </th>
            {campaigns.map((c) => (
              <th
                key={c.campaign.id}
                className="text-right px-3 py-2 font-semibold text-foreground whitespace-nowrap"
              >
                {formatShortDate(c.campaign.openAt)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sectionDefs.map((sec) => (
            <tr key={sec.stableKey}>
              <td className="px-3 py-2 text-foreground font-medium">
                {sec.name}
              </td>
              {campaigns.map((c, idx) => {
                const value = sectionMeansByCampaign[c.campaign.id]?.[sec.stableKey] ?? 0;
                const prevValue =
                  idx === 0
                    ? null
                    : sectionMeansByCampaign[campaigns[idx - 1].campaign.id]?.[
                        sec.stableKey
                      ] ?? null;
                const tone = trendTone(value, prevValue);
                return (
                  <td
                    key={c.campaign.id}
                    className={`px-3 py-2 text-right font-mono ${trendCellClasses(tone)}`}
                  >
                    {roundTo(value, 2)}
                    {tone === "up" && (
                      <span className="ml-1 text-xs">↑</span>
                    )}
                    {tone === "down" && (
                      <span className="ml-1 text-xs">↓</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Per-question sparkline grid (collapsible)
// ────────────────────────────────────────────────────────────────────────

function PerQuestionSparklines({
  open,
  onToggle,
  sparklines,
}: {
  open: boolean;
  onToggle: () => void;
  sparklines: LongitudinalTrend["questionSparklines"];
}) {
  const entries = Object.entries(sparklines);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between p-6 hover:bg-muted/30 transition-colors text-left"
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Per-question detail
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {entries.length} questions · click to{" "}
            {open ? "collapse" : "expand"}
          </p>
        </div>
        {open ? (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border p-6 grid gap-3 sm:grid-cols-2">
          {entries.map(([stableKey, series]) => (
            <SparklineCard
              key={stableKey}
              stableKey={stableKey}
              series={series}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SparklineCard({
  stableKey,
  series,
}: {
  stableKey: string;
  series: LongitudinalTrend["questionSparklines"][string];
}) {
  if (series.length === 0) {
    return null;
  }

  const W = 100;
  const H = 32;
  const PAD = 4;

  const values = series.map((p) => p.mean);
  const maxV = Math.max(1, ...values);
  const minV = Math.min(0, ...values);
  const range = maxV - minV || 1;

  const xStep = (W - PAD * 2) / Math.max(1, series.length - 1);
  const points = series
    .map((p, i) => {
      const x = PAD + i * xStep;
      const y = PAD + (1 - (p.mean - minV) / range) * (H - PAD * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const first = series[0].mean;
  const last = series[series.length - 1].mean;
  const tone = trendTone(last, first);

  const truncatedKey =
    stableKey.length > 28 ? `${stableKey.slice(0, 28)}…` : stableKey;

  return (
    <div className="border border-border rounded-lg p-3 grid grid-cols-[1fr_auto_auto] items-center gap-3">
      <span
        className="text-xs font-medium text-foreground truncate"
        title={stableKey}
      >
        {truncatedKey}
      </span>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-20 h-8"
        role="img"
        aria-label={`Trend for ${stableKey}`}
      >
        <polyline
          points={points}
          fill="none"
          strokeWidth={2}
          className={
            tone === "up"
              ? "stroke-success"
              : tone === "down"
                ? "stroke-destructive"
                : "stroke-warning"
          }
        />
      </svg>
      <span
        className={`text-xs font-semibold ${
          tone === "up"
            ? "text-success"
            : tone === "down"
              ? "text-destructive"
              : "text-muted-foreground"
        }`}
      >
        {tone === "up" && `+${roundTo(last - first, 2)} ↑`}
        {tone === "down" && `${roundTo(last - first, 2)} ↓`}
        {(tone === "flat" || tone === "none") && "flat"}
      </span>
    </div>
  );
}
