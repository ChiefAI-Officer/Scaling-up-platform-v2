/**
 * Admin Survey Templates List — /admin/surveys
 * Lists all survey templates with CRUD actions.
 */

import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/authorization";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import { PageHeader } from "@/components/ui/page-header";
import { SurveyTemplatesView } from "./survey-templates-view";

async function SurveyTemplatesList({ responsiveEnabled }: { responsiveEnabled: boolean }) {
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
            className={responsiveEnabled ? "inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90" : "inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"}
          >
            + Create Template
          </Link>
        </div>
      </div>
    );
  }

  return <SurveyTemplatesView templates={templates} responsiveEnabled={responsiveEnabled} />;
}

export default function AdminSurveysPage() {
  const responsiveEnabled = isMobileResponsiveEnabled();
  return (
    <div className={responsiveEnabled ? "min-w-0 max-w-full space-y-6" : "space-y-6"}>
      {responsiveEnabled ? <PageHeader responsiveEnabled title="Survey Templates" description="Build custom surveys to collect pre/post-event feedback and NPS scores." actions={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Link href="/admin/surveys/aggregate" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">Aggregated Results</Link><Link href="/admin/surveys/templates/new" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">+ Create Template</Link></div>} /> : <div className="flex items-center justify-between">
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
      </div>}

      <div className="rounded-lg bg-card shadow">
        <Suspense
          fallback={
            <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
              Loading templates...
            </div>
          }
        >
          <SurveyTemplatesList responsiveEnabled={responsiveEnabled} />
        </Suspense>
      </div>
    </div>
  );
}
