/**
 * Admin Survey Templates List — /admin/surveys
 * Lists all survey templates with CRUD actions.
 */

import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authorization";
import { SURVEY_TYPE_LABELS } from "@/lib/survey-types";
import type { SurveyType } from "@/lib/survey-types";

async function SurveyTemplatesList() {
  await requireAdmin();

  const templates = await db.surveyTemplate.findMany({
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      _count: { select: { surveys: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
        <h3 className="text-lg font-medium text-foreground">No survey templates</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first survey template to start collecting feedback.
        </p>
        <div className="mt-6">
          <Link
            href="/admin/surveys/templates/new"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Create Template
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-muted">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Questions
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Responses
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {templates.map((template) => (
            <tr key={template.id} className="hover:bg-accent">
              <td className="px-6 py-4">
                <div>
                  <div className="text-sm font-medium text-foreground">{template.name}</div>
                  {template.description && (
                    <div className="text-sm text-muted-foreground">{template.description}</div>
                  )}
                </div>
              </td>
              <td className="px-6 py-4">
                <span className="inline-flex rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-medium text-info">
                  {SURVEY_TYPE_LABELS[template.surveyType as SurveyType] || template.surveyType}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-foreground">
                {template.questions.length}
              </td>
              <td className="px-6 py-4 text-sm text-foreground">
                {template._count.surveys}
              </td>
              <td className="px-6 py-4">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    template.isActive
                      ? "bg-success/10 text-success"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {template.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/surveys/templates/${template.id}`}
                    className="text-sm font-medium text-primary hover:text-primary/80"
                  >
                    Edit
                  </Link>
                  {template._count.surveys > 0 && (
                    <Link
                      href={`/admin/surveys/templates/${template.id}?tab=results`}
                      className="text-sm font-medium text-success hover:text-success/80"
                    >
                      Results
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminSurveysPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Survey Templates</h1>
          <p className="text-muted-foreground">
            Build custom surveys to collect pre/post-event feedback and NPS scores.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/surveys/aggregate"
            className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Aggregated Results
          </Link>
          <Link
            href="/admin/surveys/templates/new"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Create Template
          </Link>
        </div>
      </div>

      <div className="rounded-lg bg-card shadow">
        <Suspense
          fallback={
            <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
              Loading templates...
            </div>
          }
        >
          <SurveyTemplatesList />
        </Suspense>
      </div>
    </div>
  );
}
