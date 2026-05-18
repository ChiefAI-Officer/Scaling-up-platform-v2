/**
 * Assessment v7.6 — Coach trends page (Task H).
 *
 * Server component shell:
 *   - reads ?templateId & ?organizationId from the URL
 *   - if either is missing, renders a 2-selector form (Template + Org)
 *     populated from server-side queries
 *   - if both present, gates via canAccessOrganization (404→redirect),
 *     fetches getLongitudinalTrend(), hands off to <CampaignTrendsView/>.
 *
 * Wireframe: public/wireframes/10-trends-page.html
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LineChart } from "lucide-react";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import { normalizeRole } from "@/lib/auth/access-control";
import type { ApiActor } from "@/lib/auth/access-control";
import {
  asAccessDb,
  canAccessOrganization,
  canAccessTemplate,
} from "@/lib/assessments/access-control";
import {
  asTrendsDb,
  getLongitudinalTrend,
} from "@/lib/assessments/trends";
import { CampaignTrendsView } from "@/components/assessments/CampaignTrendsView";

interface PageProps {
  searchParams: Promise<{
    templateId?: string;
    organizationId?: string;
  }>;
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const { coach, session } = await requireCoach();
  const params = await searchParams;
  const templateId = params.templateId;
  const organizationId = params.organizationId;

  const actor: ApiActor = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: normalizeRole(session.user.role ?? "COACH"),
    coachId: coach.id,
  };

  // Selector form: at least one param missing → render the picker.
  if (!templateId || !organizationId) {
    return (
      <TrendsSelector
        actor={actor}
        prefillTemplateId={templateId}
        prefillOrganizationId={organizationId}
      />
    );
  }

  // Auth: coach must own the org (or admin). On a deny, redirect back to
  // the picker — same UX as canManageCampaign deny on /portal/assessments/[id].
  const allowed = await canAccessOrganization(
    asAccessDb(db),
    actor,
    organizationId,
  );
  if (!allowed) {
    redirect("/portal/assessments/trends");
  }

  let trend;
  try {
    trend = await getLongitudinalTrend(asTrendsDb(db), templateId, organizationId);
  } catch {
    // Template missing or org missing → bounce back to picker. The service
    // throws on these; we don't want a 500 here.
    redirect("/portal/assessments/trends");
  }

  return (
    <div className="space-y-4">
      <Link
        href="/portal/assessments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Assessments
      </Link>
      <CampaignTrendsView trend={trend} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Selector form — server component. No JS required. GET → reload with
// search params.
// ────────────────────────────────────────────────────────────────────────

async function TrendsSelector({
  actor,
  prefillTemplateId,
  prefillOrganizationId,
}: {
  actor: ApiActor;
  prefillTemplateId?: string;
  prefillOrganizationId?: string;
}) {
  // Load orgs the coach owns (admin sees all).
  const orgs = await db.organization.findMany({
    where:
      actor.role === "COACH"
        ? { ownerCoachId: actor.coachId ?? "__none__", deletedAt: null }
        : { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Load templates the coach can access. We re-use the same predicate the
  // template list API uses. Admin sees all non-deleted; coach: INTERSECTION
  // — filter in JS off the predicate.
  const allTemplates = await db.assessmentTemplate.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, alias: true },
    orderBy: { name: "asc" },
  });

  let templates: Array<{ id: string; name: string; alias: string }> = [];
  if (actor.role === "ADMIN" || actor.role === "STAFF") {
    templates = allTemplates;
  } else {
    // Filter to those the coach has access to.
    const accessDb = asAccessDb(db);
    const grants = await Promise.all(
      allTemplates.map(async (t) => ({
        t,
        ok: await canAccessTemplate(accessDb, actor, t.id),
      })),
    );
    templates = grants.filter((g) => g.ok).map((g) => g.t);
  }

  return (
    <div className="space-y-6">
      <Link
        href="/portal/assessments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Assessments
      </Link>

      <div className="bg-card border border-border rounded-xl p-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-primary/10 text-primary rounded-lg p-3">
            <LineChart className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Trends</h1>
            <p className="text-sm text-muted-foreground">
              Pick a template and organization to see year-over-year scoring.
            </p>
          </div>
        </div>

        {templates.length === 0 || orgs.length === 0 ? (
          <div className="bg-muted/40 border border-border rounded-lg p-6 text-sm text-muted-foreground">
            {orgs.length === 0 ? (
              <p>
                You don&apos;t own any organizations yet. Create an
                organization first via the{" "}
                <Link
                  href="/portal/assessments/new"
                  className="text-primary hover:underline"
                >
                  campaign wizard
                </Link>
                .
              </p>
            ) : (
              <p>
                You don&apos;t have template access yet. Ask an admin to add
                you to an Access Group.
              </p>
            )}
          </div>
        ) : (
          <form method="GET" className="space-y-4">
            <div>
              <label
                htmlFor="trend-template"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Template
              </label>
              <select
                id="trend-template"
                name="templateId"
                defaultValue={prefillTemplateId ?? ""}
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="" disabled>
                  Select a template…
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="trend-org"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Organization
              </label>
              <select
                id="trend-org"
                name="organizationId"
                defaultValue={prefillOrganizationId ?? ""}
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="" disabled>
                  Select an organization…
                </option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              View Trends
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
