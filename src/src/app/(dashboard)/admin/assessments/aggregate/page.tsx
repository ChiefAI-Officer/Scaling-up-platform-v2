/**
 * Admin Aggregate Report dashboard (Wave 5 wireframe 23).
 *
 * Spec refs:
 *  - docs/specs/v7.6/05-wireframes-wave5.md — MVP shape (2 selectors only).
 *  - docs/specs/v7.6/02-service-layer-rules.md — canAccessAggregateReport.
 *
 * Server component shell — enforces admin/staff gate at request time, then
 * delegates rendering to the client component that handles selectors + fetch.
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { AssessmentsAggregateReport } from "@/components/admin/AssessmentsAggregateReport";

export default async function AdminAggregateReportPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  return (
    <div>
      {/* Breadcrumb — WF23 */}
      <div className="wf-breadcrumb">
        <a href="/admin/dashboard">Admin</a>
        <span className="wf-breadcrumb-sep">/</span>
        <a href="/admin/assessments">Assessments</a>
        <span className="wf-breadcrumb-sep">/</span>
        <span className="wf-breadcrumb-current">Aggregate Report</span>
      </div>

      {/* Page header — WF23 */}
      <div className="wf-page-header-row">
        <div>
          <h2 className="wf-page-title">Aggregate Report</h2>
          <p className="wf-page-subtitle-strong">
            Per-template, per-version aggregate statistics across all
            submissions in the platform. Admin-only — coaches and
            respondents never see this view.
          </p>
        </div>
      </div>

      {/* Anonymity banner — WF23 */}
      <div className="wf-intersection-banner">
        <strong>Admin bypasses CEO_ONLY anonymity in aggregate.</strong>{" "}
        Coaches and respondents still respect <code>aggregationMode</code>{" "}
        (see <code>canAccessAggregateReport</code> service-layer rule).
        This dashboard is gated to <code>ADMIN</code> / <code>STAFF</code>{" "}
        roles only.
      </div>

      <AssessmentsAggregateReport />
    </div>
  );
}
