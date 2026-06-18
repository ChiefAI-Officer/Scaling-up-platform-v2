/**
 * Assessment v7.6 — coach/admin-gated per-respondent results report PAGE (Task 4).
 *
 * Server component. URL: /assessments/[id]/respondents/[respondentId]/report
 * (the (report) route group does not change the URL — it is a sibling to
 * (portal), so this page renders the brand-scoped report WITHOUT any portal
 * sidebar/nav — see (report)/layout.tsx).
 *
 * Auth (matches the protected-page convention used across the app):
 *  - getApiActor() resolves the actor server-side from the NextAuth session.
 *    Unlike requireCoach(), it does NOT block ADMIN/STAFF — Jeff is an admin
 *    and must be able to view any report. The actual per-campaign decision
 *    (privileged bypass + owning-coach check) lives inside getRespondentReport
 *    via canManageCampaign, so we delegate all authorization there.
 *  - No actor → redirect("/login") (same login path as the rest of the app).
 *  - forbidden OR not-found → notFound() (enumeration-safe: a coach probing a
 *    campaign they don't own gets the same 404 as a missing submission).
 *
 * H15 (cache / PII): `dynamic = "force-dynamic"` + `revalidate = 0` keep the
 *   page from being statically rendered or cached. NOTE: Next's App Router does
 *   NOT let a server-component PAGE set arbitrary response headers (e.g.
 *   `Cache-Control: private, no-store`); that requires middleware or a route
 *   handler. force-dynamic + no auth-less render is the page-level guarantee we
 *   can make here. (A `Cache-Control` header could be layered in middleware if
 *   ever needed.)
 * H16 (ops marker): a structured console.info on every successful view.
 * H17 (audit): a VIEW_REPORT AuditLog row on every successful view.
 */

import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { getRespondentReport } from "@/lib/assessments/respondent-report";
import { reportConfigFor } from "@/lib/assessments/report-config";
import { logAudit, type AuditAction } from "@/lib/audit";
import { checkRateLimitAsync, RateLimits } from "@/lib/rate-limit";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";

// H15: never statically render or cache the report (PII).
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string; respondentId: string }>;
}

export default async function RespondentReportPage({ params }: PageProps) {
  // 1) Resolve the actor server-side. getApiActor reads the NextAuth session
  //    and returns the full ApiActor (role + coachId) that getRespondentReport
  //    needs for its canManageCampaign decision.
  const actor = await getApiActor();
  if (!actor) {
    redirect("/login");
  }

  const { id, respondentId } = await params;

  // 2) Best-effort rate limit (H15). A page can't cleanly return a 429, so we
  //    apply a lightweight per-IP guard keyed to this report URL and degrade to
  //    notFound() if exceeded (indistinguishable from a missing report). We do
  //    NOT block the request path on rate-limiter failure.
  try {
    const hdrs = await headers();
    const ip =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip") ||
      "localhost";
    const rl = await checkRateLimitAsync(
      `report:${ip}`,
      RateLimits.standard,
    );
    if (!rl.success) {
      console.info(
        JSON.stringify({
          marker: "assessment.report.view",
          outcome: "rate-limited",
          role: actor.role,
        }),
      );
      notFound();
    }
  } catch (err) {
    // Rate-limiter unavailable (e.g. headers()/redis hiccup) — do not block.
    if (err instanceof Error && err.message === "NEXT_NOT_FOUND") throw err;
    console.error("[report-page] rate-limit check skipped:", err);
  }

  // 3) Authorized, enriched load. canManageCampaign (inside) permits ADMIN/STAFF
  //    and the owning coach; everyone else → forbidden.
  //    getRespondentReport's first param is a narrow ReportDb interface (a
  //    subset of PrismaClient — $transaction + assessmentSubmission.findFirst).
  //    PrismaClient satisfies it at runtime, but its generic $transaction
  //    overloads don't structurally match the narrow signature, so we bridge
  //    via the helper's own declared parameter type (no `any`, no edits to the
  //    Task-1 loader).
  const reportDb = db as unknown as Parameters<typeof getRespondentReport>[0];
  const res = await getRespondentReport(reportDb, actor, id, respondentId);

  if (res.status === "forbidden" || res.status === "not-found") {
    // Enumeration-safe: same 404 for "you can't see this" and "doesn't exist".
    notFound();
  }

  const { report } = res;

  // H17 — audit the successful view. Mirrors the CSV export route's shape
  // (entityType / action / entityId / performedBy). "VIEW_REPORT" is a
  // free-form action string (AuditLog.action is String — no migration); the
  // cast keeps the helper's typed union honest without touching lib/audit.ts.
  //
  // R2-L8 — #25 removed the visible footer provenance stamp, so the
  // traceability moves into the audit entry: record templateAlias, versionId,
  // contentHash, and the resolved reportType (scored | qualitative) so we can
  // always reconstruct which renderer produced what was shown. JSON-only —
  // no schema change (changes is the existing AuditLog JSON/text column).
  await logAudit({
    entityType: "AssessmentSubmission",
    action: "VIEW_REPORT" as AuditAction,
    entityId: report.provenance.submissionId,
    performedBy: actor.email,
    changes: {
      kind: "respondent-report",
      templateAlias: report.templateAlias ?? null,
      reportType: reportConfigFor(report.templateAlias).reportType,
      versionId: report.provenance.versionId,
      contentHash: report.provenance.contentHash,
    },
  });

  // H16 — structured ops marker for observability.
  console.info(
    JSON.stringify({
      marker: "assessment.report.view",
      outcome: "ok",
      role: actor.role,
      template: report.assessmentName,
    }),
  );

  return (
    <div className="su-report-page">
      <div className="su-report-actions no-print">
        <PrintReportButton />
      </div>
      <BrandedReport report={report} campaignLabel={report.campaignLabel} />
    </div>
  );
}
