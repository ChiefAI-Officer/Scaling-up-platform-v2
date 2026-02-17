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
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
        <h3 className="text-lg font-medium text-gray-900">No survey templates</h3>
        <p className="mt-1 text-sm text-gray-500">
          Create your first survey template to start collecting feedback.
        </p>
        <div className="mt-6">
          <Link
            href="/admin/surveys/templates/new"
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Create Template
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Questions
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Responses
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {templates.map((template) => (
            <tr key={template.id} className="hover:bg-gray-50">
              <td className="px-6 py-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">{template.name}</div>
                  {template.description && (
                    <div className="text-sm text-gray-500">{template.description}</div>
                  )}
                </div>
              </td>
              <td className="px-6 py-4">
                <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                  {SURVEY_TYPE_LABELS[template.surveyType as SurveyType] || template.surveyType}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {template.questions.length}
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {template._count.surveys}
              </td>
              <td className="px-6 py-4">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    template.isActive
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {template.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/surveys/templates/${template.id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    Edit
                  </Link>
                  {template._count.surveys > 0 && (
                    <Link
                      href={`/admin/surveys/templates/${template.id}?tab=results`}
                      className="text-sm font-medium text-green-600 hover:text-green-800"
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
          <h1 className="text-2xl font-bold text-gray-900">Survey Templates</h1>
          <p className="text-gray-600">
            Build custom surveys to collect pre/post-event feedback and NPS scores.
          </p>
        </div>
        <Link
          href="/admin/surveys/templates/new"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Create Template
        </Link>
      </div>

      <div className="rounded-lg bg-white shadow">
        <Suspense
          fallback={
            <div className="flex min-h-[200px] items-center justify-center text-gray-500">
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
