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
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">
          Assessment Aggregate Report
        </h1>
        <p className="text-sm text-muted-foreground">
          Roll-up across all submissions for a single template + version.
          v1 MVP per spec — deeper slicers (time-range, group, per-org) are
          deferred to v1.5.
        </p>
      </header>

      <AssessmentsAggregateReport />
    </div>
  );
}
