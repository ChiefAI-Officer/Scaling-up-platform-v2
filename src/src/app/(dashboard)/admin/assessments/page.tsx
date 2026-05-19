/**
 * Assessments lane landing page (wireframe 24 right pane).
 *
 * Three stat cards + a Getting Started right-rail panel. Stats come from
 * lib/assessments/dashboard-stats.ts so the queries can be reused / tested
 * independently of the page surface.
 */

export const dynamic = "force-dynamic";

import { getAssessmentsDashboardStats } from "@/lib/assessments/dashboard-stats";

export default async function AdminAssessmentsLandingPage() {
  // The parent layout already enforces admin/staff. We rely on that guard so
  // this page stays a thin stats-renderer.
  const stats = await getAssessmentsDashboardStats();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Assessments</h1>
        <p className="text-sm text-muted-foreground">
          Manage organizations, access groups, templates, and campaigns. The
          sidebar is the entry point for every assessment-tool surface.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Active Campaigns"
            value={stats.activeCampaigns}
            testId="stat-active-campaigns"
          />
          <StatCard
            label="Templates Published"
            value={stats.templatesPublished}
            testId="stat-templates-published"
          />
          <StatCard
            label="Submissions MTD"
            value={stats.submissionsMTD}
            testId="stat-submissions-mtd"
          />
        </div>

        <aside className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Getting Started
          </h2>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal pl-5">
            <li>Create or edit a template under Templates.</li>
            <li>Publish a version.</li>
            <li>
              Add the template to an Access Group containing your coaches.
            </li>
            <li>
              Coaches with that group can launch campaigns via the wizard.
            </li>
          </ol>
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card/50 px-4 py-3"
      data-testid={testId}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
