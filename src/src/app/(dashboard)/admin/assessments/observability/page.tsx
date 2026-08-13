/**
 * Admin observability dashboard (v1, DB-derived).
 *
 * Honest framing per spec 06: v1 ships static; v1.5 wires to a real
 * time-series UI. This page reports counters derived directly from the DB
 * so operators have a live signal even before Vercel/Inngest metrics are
 * wired.
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { ObservabilityDashboard } from "@/components/admin/ObservabilityDashboard";
import { PeerBenchmarkStatusPanel } from "@/components/admin/PeerBenchmarkStatusPanel";
import { ImportHealthPanel } from "@/components/admin/ImportHealthPanel";
import { PageHeader } from "@/components/ui/page-header";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

export default async function AdminObservabilityPage() {
  const mobileResponsiveEnabled = isMobileResponsiveEnabled();
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  return (
    <div
      className={
        mobileResponsiveEnabled ? "min-w-0 max-w-full space-y-6" : "space-y-6"
      }
    >
      {mobileResponsiveEnabled ? (
        <PageHeader
          responsiveEnabled
          title="Observability"
          description="v1 — DB-derived counters. Esperto historical-import observability is live below; the remaining Vercel/Inngest metrics and alert gates still wire in v1.5."
        />
      ) : (
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Observability</h1>
          <p className="text-sm text-muted-foreground">
            v1 — DB-derived counters. Esperto historical-import observability
            (durable signals + the alert cron&apos;s own decisions) is now live
            in the panel below; the other 7 Vercel/Inngest metrics + 6 alert gates
            (see <code>docs/specs/v7.6/06-observability.md</code>) still wire in
            v1.5.
          </p>
        </header>
      )}
      <ObservabilityDashboard responsiveEnabled={mobileResponsiveEnabled} />
      <PeerBenchmarkStatusPanel />
      <ImportHealthPanel responsiveEnabled={mobileResponsiveEnabled} />
    </div>
  );
}
