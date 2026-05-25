"use client";

/**
 * Admin Aggregate Report — Wave 5 wireframe 23.
 *
 * Spec refs:
 *  - docs/specs/v7.6/05-wireframes-wave5.md — MVP shape: 2 selectors + 4 stat
 *    cards + tier histogram + per-section means + sparkline. NO time-range
 *    chip, NO group filter, NO per-org breakdown.
 *  - docs/specs/v7.6/02-service-layer-rules.md — admin/staff bypasses
 *    CEO_ONLY (operator-mode).
 *
 * Selection model:
 *  - Template dropdown lists ALL non-deleted templates (admin scope).
 *  - Version dropdown filters to the selected template and defaults to the
 *    latest published (first row, since /versions sorts desc by publishedAt).
 *  - On (template, version) selection: fetch /api/admin/assessments/aggregate.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatTimestamp } from "@/lib/utils";

interface TemplateSummary {
  id: string;
  name: string;
  alias: string;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
}

interface VersionSummary {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string;
}

interface AggregateReport {
  templateId: string;
  versionId: string;
  totalSubmissions: number;
  distinctOrgs: number;
  avgCountAchieved: number;
  avgOverallTotal: number;
  avgOverallAverage: number;
  tierHistogram: Array<{ label: string; message: string; count: number }>;
  perSectionMeans: Array<{
    stableKey: string;
    name: string;
    totalPointsAvg: number;
    averagePointsAvg: number;
  }>;
  submissionsOverTime: Array<{ date: string; count: number }>;
}

function tierColorClass(label: string): string {
  // Map common tier labels to semantic tokens. Anything unrecognised falls
  // through to a neutral muted bar so the UI never blows up on a new tier.
  const lower = label.toLowerCase();
  if (lower.includes("low") || lower.includes("poor") || lower.includes("bad")) {
    return "bg-destructive/20";
  }
  if (lower.includes("ok") || lower.includes("medium") || lower.includes("fair")) {
    return "bg-warning/20";
  }
  if (lower.includes("great") || lower.includes("excellent") || lower.includes("high")) {
    return "bg-success/20";
  }
  return "bg-muted";
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}

/**
 * D2.1 — null-safe number formatter for per-domain `averagePoints`.
 *
 * The scoring engine emits `averagePoints: null` when a domain has zero
 * answered sections (Codex round 2 #1 — distinguish "no data" from
 * "scored 0"). Whenever this report begins rendering `perDomain[]` rows,
 * the renderer MUST use this helper (or equivalent null-aware logic) to
 * avoid showing "0" or "NaN" for empty domains.
 *
 * Exported for unit testing + future per-domain UI work.
 */
export function formatNullableNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (!Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}

// TODO (D2 follow-on): the aggregate report does not yet render per-domain
// rows. When that lands, every cell that displays `perDomain[i].averagePoints`
// MUST route through `formatNullableNumber` to gracefully render the null
// case as "—" instead of "0" / "NaN".

function buildSparklinePoints(
  series: Array<{ date: string; count: number }>,
  width: number,
  height: number,
): string {
  if (series.length === 0) return "";
  if (series.length === 1) {
    const y = height / 2;
    return `0,${y} ${width},${y}`;
  }
  const maxCount = Math.max(...series.map((p) => p.count), 1);
  const stepX = width / (series.length - 1);
  return series
    .map((point, i) => {
      const x = i * stepX;
      const y = height - (point.count / maxCount) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function AssessmentsAggregateReport() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>("");

  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string>("");

  const [report, setReport] = useState<AggregateReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Load templates once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/assessment-templates");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          success: boolean;
          data: TemplateSummary[];
        };
        if (!cancelled) {
          setTemplates(body.data ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setTemplatesError(e instanceof Error ? e.message : "Failed to load templates");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load versions whenever templateId changes.
  useEffect(() => {
    if (!templateId) {
      setVersions([]);
      setVersionId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setVersionsError(null);
        const res = await fetch(
          `/api/admin/assessment-templates/${encodeURIComponent(templateId)}/versions`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          success: boolean;
          data: VersionSummary[];
        };
        if (!cancelled) {
          const list = body.data ?? [];
          setVersions(list);
          // Versions are returned desc by publishedAt; first row is latest.
          setVersionId(list.length > 0 ? list[0].id : "");
        }
      } catch (e) {
        if (!cancelled) {
          setVersionsError(e instanceof Error ? e.message : "Failed to load versions");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  // Fetch the aggregate report whenever both selectors resolve.
  useEffect(() => {
    if (!templateId || !versionId) {
      setReport(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setReportLoading(true);
      setReportError(null);
      try {
        const params = new URLSearchParams({ templateId, versionId });
        const res = await fetch(
          `/api/admin/assessments/aggregate?${params.toString()}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          success: boolean;
          data: AggregateReport;
        };
        if (!cancelled) setReport(body.data);
      } catch (e) {
        if (!cancelled) {
          setReportError(e instanceof Error ? e.message : "Failed to load report");
          setReport(null);
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, versionId]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const latestVersionId = versions[0]?.id ?? null;

  return (
    <div className="space-y-6">
      {/* Selectors */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="template-select"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Template
              </label>
              <select
                id="template-select"
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={templates.length === 0}
              >
                <option value="">— Select a template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.alias})
                    {t.aggregationMode === "CEO_ONLY" ? " · CEO_ONLY" : ""}
                  </option>
                ))}
              </select>
              {templatesError && (
                <p className="mt-1 text-xs text-destructive">{templatesError}</p>
              )}
            </div>
            <div>
              <label
                htmlFor="version-select"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Version
              </label>
              <select
                id="version-select"
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
                disabled={versions.length === 0}
              >
                {versions.length === 0 && <option value="">No published versions</option>}
                {versions.map((v) => {
                  const label = `v${v.versionNumber} · ${v.language} · published ${formatTimestamp(
                    v.publishedAt,
                  )}`;
                  const isLatest = v.id === latestVersionId;
                  return (
                    <option key={v.id} value={v.id}>
                      {label}
                      {isLatest ? " (current)" : ""}
                    </option>
                  );
                })}
              </select>
              {versionsError && (
                <p className="mt-1 text-xs text-destructive">{versionsError}</p>
              )}
            </div>
          </div>

          {/* Operator-mode banner */}
          <div
            className="wf-intersection-banner"
            style={{ padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}
            role="status"
          >
            <strong className="font-semibold">Admin operator mode.</strong>{" "}
            Admin bypasses CEO_ONLY anonymity in aggregate. Coaches and
            respondents still respect <code>aggregationMode</code> (see{" "}
            <code>docs/specs/v7.6/02-service-layer-rules.md</code>).
          </div>

          {selectedTemplate?.aggregationMode === "CEO_ONLY" && (
            <p className="text-xs text-muted-foreground">
              This template is configured as <strong>CEO_ONLY</strong> for
              non-admin viewers. The aggregate below ignores that visibility
              gate because you are admin/staff.
            </p>
          )}

          {/* CSV exports — disabled until both selectors resolve. */}
          <div className="flex flex-wrap gap-2 pt-1" data-testid="aggregate-export-buttons">
            <ExportLink
              label="Export summary (CSV)"
              templateId={templateId}
              versionId={versionId}
              path="/api/admin/assessments/aggregate/export.csv"
              testId="export-aggregate-summary-csv"
            />
            <ExportLink
              label="Export submissions (CSV)"
              templateId={templateId}
              versionId={versionId}
              path="/api/admin/assessments/aggregate/submissions.csv"
              testId="export-aggregate-submissions-csv"
            />
          </div>
        </CardContent>
      </Card>

      {/* Loading / error */}
      {reportError && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-destructive">
              Failed to load report: {reportError}
            </p>
          </CardContent>
        </Card>
      )}

      {reportLoading && !report && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">Loading report…</p>
          </CardContent>
        </Card>
      )}

      {/* No template selected */}
      {!templateId && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              Select a template above to view its aggregate report.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {report && report.totalSubmissions === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No submissions yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This template version has no submitted responses. The roll-up
              will appear here once respondents complete the assessment for
              campaigns running against this version.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats + visuals */}
      {report && report.totalSubmissions > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total submissions" value={report.totalSubmissions} />
            <StatCard label="Distinct organizations" value={report.distinctOrgs} />
            <StatCard
              label="Avg countAchieved"
              value={formatNumber(report.avgCountAchieved)}
            />
            <StatCard
              label="Avg overallTotal"
              value={formatNumber(report.avgOverallTotal)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tier distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.tierHistogram.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No tiers configured on this template version.
                </p>
              )}
              {report.tierHistogram.map((tier) => {
                const maxCount = Math.max(
                  ...report.tierHistogram.map((t) => t.count),
                  1,
                );
                const pct = (tier.count / maxCount) * 100;
                const colorClass = tierColorClass(tier.label);
                return (
                  <div key={tier.label} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">
                          {tier.label}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {tier.message}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {tier.count}
                      </span>
                    </div>
                    <div
                      className="h-3 w-full rounded-full bg-muted/40 overflow-hidden"
                      role="presentation"
                    >
                      <div
                        className={`h-full ${colorClass}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Per-section means</CardTitle>
            </CardHeader>
            <CardContent>
              {report.perSectionMeans.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sections configured on this template version.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Section</th>
                        <th className="py-2 pr-4 font-medium">Name</th>
                        <th className="py-2 pr-4 font-medium text-right">
                          Avg total (per section)
                        </th>
                        <th className="py-2 font-medium text-right">
                          Avg per question
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.perSectionMeans.map((section) => (
                        <tr key={section.stableKey} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                            {section.stableKey}
                          </td>
                          <td className="py-2 pr-4 text-foreground">
                            {section.name}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {formatNumber(section.totalPointsAvg)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatNumber(section.averagePointsAvg)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Submissions over time</CardTitle>
            </CardHeader>
            <CardContent>
              {report.submissionsOverTime.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timeline data.</p>
              ) : (
                <div className="space-y-2">
                  <svg
                    viewBox="0 0 400 80"
                    className="w-full h-20 text-primary"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Submissions over time sparkline"
                  >
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={buildSparklinePoints(
                        report.submissionsOverTime,
                        400,
                        80,
                      )}
                    />
                  </svg>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{report.submissionsOverTime[0].date}</span>
                    <span>
                      {
                        report.submissionsOverTime[
                          report.submissionsOverTime.length - 1
                        ].date
                      }
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ExportLink({
  label,
  path,
  templateId,
  versionId,
  testId,
}: {
  label: string;
  path: string;
  templateId: string;
  versionId: string;
  testId: string;
}) {
  const disabled = !templateId || !versionId;
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="wf-btn wf-btn-secondary"
        style={{ opacity: 0.6, cursor: "not-allowed" }}
        data-testid={testId}
      >
        {label}
      </button>
    );
  }
  const params = new URLSearchParams({ templateId, versionId });
  const qs = params.toString();
  return (
    <a
      href={`${path}?${qs}`}
      download
      className="wf-btn wf-btn-secondary"
      data-testid={testId}
    >
      {label}
    </a>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="wf-stat-card">
      <div className="wf-stat-label">{label}</div>
      <div className="wf-stat-value tabular-nums">{value}</div>
    </div>
  );
}
