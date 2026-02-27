/**
 * Aggregated Survey Results — /admin/surveys/aggregate
 *
 * Cross-workshop aggregated view of survey responses per template.
 * Shows combined stats, per-question breakdowns, and workshop-level drill-down.
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authorization";
import { getSurveyResults } from "@/lib/survey-service";
import { SURVEY_TYPE_LABELS } from "@/lib/survey-types";
import type { SurveyType } from "@/lib/survey-types";
import { FadeUp } from "@/components/ui/animated";

interface PageProps {
  searchParams: Promise<{ templateId?: string }>;
}

export default async function AggregateSurveyResultsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { templateId } = await searchParams;

  // Fetch all templates with response counts
  const templates = await db.surveyTemplate.findMany({
    where: { isActive: true },
    include: {
      _count: { select: { surveys: true } },
      questions: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  // Get aggregated results for selected template (or first with responses)
  const selectedId = templateId || templates.find((t) => t._count.surveys > 0)?.id;
  const results = selectedId ? await getSurveyResults(selectedId) : null;

  // Get per-workshop breakdown for the selected template
  let workshopBreakdown: Array<{
    workshopId: string;
    workshopTitle: string;
    workshopCode: string;
    responseCount: number;
    avgNps: number | null;
  }> = [];

  if (selectedId) {
    const surveys = await db.survey.findMany({
      where: { templateId: selectedId, completedAt: { not: null } },
      select: {
        workshopId: true,
        npsScore: true,
        workshop: { select: { title: true, workshopCode: true } },
      },
    });

    const byWorkshop = new Map<string, { title: string; code: string; npsScores: number[]; count: number }>();
    for (const s of surveys) {
      const existing = byWorkshop.get(s.workshopId) || {
        title: s.workshop.title,
        code: s.workshop.workshopCode,
        npsScores: [],
        count: 0,
      };
      existing.count++;
      if (s.npsScore !== null) existing.npsScores.push(s.npsScore);
      byWorkshop.set(s.workshopId, existing);
    }

    workshopBreakdown = Array.from(byWorkshop.entries())
      .map(([workshopId, data]) => ({
        workshopId,
        workshopTitle: data.title,
        workshopCode: data.code,
        responseCount: data.count,
        avgNps:
          data.npsScores.length > 0
            ? Math.round((data.npsScores.reduce((a, b) => a + b, 0) / data.npsScores.length) * 10) / 10
            : null,
      }))
      .sort((a, b) => b.responseCount - a.responseCount);
  }

  const selectedTemplate = templates.find((t) => t.id === selectedId);

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link href="/admin/surveys" className="hover:text-foreground">Survey Templates</Link>
              <span>/</span>
              <span className="text-foreground">Aggregated Results</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Aggregated Survey Results</h1>
            <p className="text-muted-foreground">Cross-workshop survey analytics</p>
          </div>
        </div>
      </FadeUp>

      {/* Template Selector */}
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <Link
            key={t.id}
            href={`/admin/surveys/aggregate?templateId=${t.id}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              t.id === selectedId
                ? "bg-blue-600 text-white"
                : "bg-card border border-border text-foreground hover:bg-accent"
            }`}
          >
            {t.name}
            <span className="ml-1.5 text-xs opacity-75">({t._count.surveys})</span>
          </Link>
        ))}
      </div>

      {!results && (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <h3 className="text-lg font-medium text-foreground">No survey data</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a survey template with responses, or create surveys first.
          </p>
        </div>
      )}

      {results && selectedTemplate && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Survey Type</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {SURVEY_TYPE_LABELS[results.surveyType as SurveyType] || results.surveyType}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Responses</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{results.totalResponses}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Workshops</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{workshopBreakdown.length}</p>
            </div>
          </div>

          {/* Per-Question Stats */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Question Breakdown</h2>
            {results.questionStats.map((q) => (
              <div key={q.questionId} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-foreground">{q.label}</p>
                    <p className="text-xs text-muted-foreground">{q.type} &middot; {q.totalResponses} responses</p>
                  </div>
                  {q.avgNumeric !== undefined && (
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">{q.avgNumeric.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.type === "NPS" ? "avg NPS" : "avg rating"}
                      </p>
                    </div>
                  )}
                </div>

                {q.distribution && Object.keys(q.distribution).length > 0 && (
                  <div className="space-y-2">
                    {Object.entries(q.distribution)
                      .sort(([, a], [, b]) => b - a)
                      .map(([value, count]) => {
                        const pct = q.totalResponses > 0 ? Math.round((count / q.totalResponses) * 100) : 0;
                        return (
                          <div key={value} className="flex items-center gap-3">
                            <div className="w-24 text-sm text-foreground truncate" title={value}>
                              {value}
                            </div>
                            <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                              <div
                                className="bg-blue-500 h-full rounded-full transition-all"
                                style={{ width: `${Math.max(pct, 2)}%` }}
                              />
                            </div>
                            <div className="w-10 text-right text-sm font-medium text-foreground">{count}</div>
                            <div className="w-10 text-right text-xs text-muted-foreground">{pct}%</div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Per-Workshop Breakdown */}
          {workshopBreakdown.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">Results by Workshop</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Workshop</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Responses</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Avg NPS</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {workshopBreakdown.map((w) => (
                      <tr key={w.workshopId} className="hover:bg-accent">
                        <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{w.workshopCode || "---"}</td>
                        <td className="px-4 py-3">
                          <Link href={`/workshops/${w.workshopId}`} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                            {w.workshopTitle}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground text-right">{w.responseCount}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          {w.avgNps !== null ? (
                            <span className={w.avgNps >= 8 ? "text-green-600 font-semibold" : w.avgNps >= 6 ? "text-foreground" : "text-red-600"}>
                              {w.avgNps}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <Link
                            href={`/admin/surveys/templates/${selectedId}?tab=results&workshopId=${w.workshopId}`}
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
