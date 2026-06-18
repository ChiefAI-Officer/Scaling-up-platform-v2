/**
 * Assessment v7.6 Wave F #22 — coach/admin-gated campaign GROUP report PAGE (T8).
 *
 * Server component. URL: /assessments/[id]/report
 * (sibling to the per-respondent report; same (report) brand-scoped route group,
 * so it renders WITHOUT any portal sidebar/nav — see (report)/layout.tsx, which
 * imports su-report.css).
 *
 * This is the SECURITY INTEGRATION for the team group report — a bulk-PII
 * surface. It ties together the pieces built in T1/T2/T6/T7:
 *
 *  1) FLAG GATE FIRST (T2): isGroupReportEnabled(actor, {id}) — default-OFF.
 *     A disabled campaign → notFound() (404), BEFORE any DB work. (We pass only
 *     {id} from params; the canary also matches actor.coachId or the global
 *     flag. org/createdBy aren't known pre-load, which is fine — the loader's
 *     canViewGroupReport is the real authorization gate.)
 *  2) RATE-LIMIT BEFORE THE EXPENSIVE LOAD: a per-actor+campaign+IP key, keyed
 *     to this report URL. Exceeded → notFound() (fail-closed — indistinguishable
 *     from a missing report, same enumeration-safe 404 as the per-respondent
 *     page). A rate-limiter outage does NOT block the request.
 *  3) AUTHORIZED LOAD (T6): getCampaignGroupReport runs canViewGroupReport (the
 *     STRICTER bulk-PII gate) + the whole fetch in one snapshot.
 *       forbidden     → notFound() (no existence leak).
 *       notApplicable → a clean "invited campaigns only" panel.
 *       empty         → the branded empty-state panel.
 *       ok            → audit (fail-closed) then render <GroupReport>.
 *  4) AUDIT (T8, CRITICAL — fail-CLOSED): a GROUP_REPORT_VIEW AuditLog row is
 *     written DIRECTLY via db.auditLog.create (NOT the fail-open logAudit
 *     wrapper). A write failure THROWS — no silent render of bulk PII. We
 *     capture the full provenance (versionId, contentHash, ceoParticipantId,
 *     counts, submissionIds) + IP/UA.
 *
 * H15 (cache/PII): dynamic = "force-dynamic" + revalidate = 0 keep the page out
 *   of any static/edge cache. The real `Cache-Control: private, no-store`
 *   response header is layered in middleware (T9).
 *
 * Display props (assessmentName/companyName/versionLabel) are threaded through
 * the loader's provenance (read in the SAME snapshot — no second round-trip).
 * ceoName is derived from the model's CEO respondent row.
 */

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { isGroupReportEnabled } from "@/lib/assessments/wave-f-flags";
import { getCampaignGroupReport } from "@/lib/assessments/group-report";
import { checkRateLimitAsync, RateLimits } from "@/lib/rate-limit";
import type { AuditAction } from "@/lib/audit";
import {
  GroupReport,
  GroupReportEmpty,
} from "@/components/assessments/GroupReport";

// H15: never statically render or cache the report (bulk PII).
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignGroupReportPage({ params }: PageProps) {
  const { id: campaignId } = await params;

  // 1) Resolve the actor server-side. getApiActor reads the NextAuth session
  //    and returns the full ApiActor (role + coachId) the loader's
  //    canViewGroupReport gate needs. A null actor is fine here — the flag gate
  //    and the loader both treat it as non-matching/forbidden.
  const actor = await getApiActor();

  // 2) FLAG GATE FIRST (default-OFF). Disabled → 404, BEFORE any DB work.
  if (!isGroupReportEnabled(actor, { id: campaignId })) {
    notFound();
  }

  // Read IP/UA once — used by both the rate-limit key and the audit row.
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "localhost";
  const userAgent = hdrs.get("user-agent") ?? null;

  // 3) RATE-LIMIT BEFORE the expensive load. Key on the actor identity
  //    (coachId → userId, falling back to "anon") + campaign + IP so a single
  //    actor can't enumerate/scrape group reports. A page can't cleanly return
  //    a 429, so on EXCEEDED we fail closed to notFound() (same 404 as a missing
  //    report). A rate-limiter OUTAGE (redis hiccup) must not block the request.
  const actorKey = actor?.coachId ?? actor?.userId ?? "anon";
  try {
    const rl = await checkRateLimitAsync(
      `group-report:${actorKey}:${campaignId}:${ip}`,
      RateLimits.standard,
    );
    if (!rl.success) {
      console.info(
        JSON.stringify({
          marker: "assessment.group-report.view",
          outcome: "rate-limited",
          role: actor?.role ?? null,
        }),
      );
      notFound();
    }
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_NOT_FOUND") throw err;
    console.error("[group-report-page] rate-limit check skipped:", err);
  }

  // 4) Authorized, enriched load — canViewGroupReport (inside) is the real gate.
  //    generatedAt is allowed at the route boundary; the loader never calls
  //    new Date(). The loader's narrow GroupReportDb is satisfied by the full
  //    Prisma client at runtime; bridge via the helper's own parameter type.
  const reportDb = db as unknown as Parameters<typeof getCampaignGroupReport>[0];
  const generatedAt = new Date();
  const result = await getCampaignGroupReport(
    reportDb,
    actor,
    campaignId,
    generatedAt,
  );

  // forbidden → 404 (enumeration-safe; do NOT reveal existence). No audit.
  if (result.kind === "forbidden") {
    notFound();
  }

  // notApplicable (PUBLIC campaign) → a clean informative panel. No audit.
  if (result.kind === "notApplicable") {
    return (
      <div className="su-report-page">
        <div className="su-group-empty" data-testid="group-report-not-applicable">
          <p className="su-group-empty-title">
            Group report is available for invited campaigns only
          </p>
          <p className="su-group-empty-sub">
            This is a public campaign. The team group report aggregates the
            answers of invited participants, so it does not apply here.
          </p>
        </div>
      </div>
    );
  }

  // empty (zero completions) → branded empty-state panel. No audit (nothing
  // sensitive is rendered; the cohort is empty).
  if (result.kind === "empty") {
    return (
      <div className="su-report-page">
        <GroupReportEmpty />
      </div>
    );
  }

  // ok → write the GROUP_REPORT_VIEW audit FIRST (fail-closed), then render.
  const { report, provenance } = result;

  // CRITICAL — fail-CLOSED audit. Direct db.auditLog.create (NOT the fail-open
  // logAudit wrapper): a write failure THROWS so we never silently render bulk
  // PII without an audit trail. action is a free-form String column (no
  // migration). changes carries the full provenance for as-of reproducibility.
  await db.auditLog.create({
    data: {
      entityType: "AssessmentCampaign",
      entityId: campaignId,
      action: "GROUP_REPORT_VIEW" satisfies AuditAction,
      performedBy: actor?.email ?? "anon",
      changes: JSON.stringify({
        kind: "group-report",
        generatedAt: provenance.generatedAt.toISOString(),
        versionId: provenance.versionId,
        templateAlias: provenance.templateAlias,
        contentHash: provenance.contentHash,
        ceoParticipantId: provenance.ceoParticipantId,
        completedCount: provenance.completedCount,
        invitedCount: provenance.invitedCount,
        submissionIds: provenance.submissionIds,
      }),
      ipAddress: ip,
      userAgent,
    },
  });

  console.info(
    JSON.stringify({
      marker: "assessment.group-report.view",
      outcome: "ok",
      role: actor?.role ?? null,
      template: provenance.templateAlias,
      completed: provenance.completedCount,
    }),
  );

  // CEO display name from the model's CEO respondent (the loader/model own the
  // name snapshot — no extra DB hit).
  const ceoName = report.respondents.find((r) => r.isCEO)?.name ?? null;

  return (
    <div className="su-report-page">
      <GroupReport
        report={report}
        assessmentName={provenance.assessmentName}
        companyName={provenance.companyName}
        generatedAt={provenance.generatedAt}
        completedCount={provenance.completedCount}
        invitedCount={provenance.invitedCount}
        versionLabel={provenance.versionLabel}
        ceoName={ceoName}
      />
    </div>
  );
}
