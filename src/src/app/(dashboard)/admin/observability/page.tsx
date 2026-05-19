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

export default async function AdminObservabilityPage() {
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
        <h1 className="text-2xl font-bold text-foreground">Observability</h1>
        <p className="text-sm text-muted-foreground">
          v1 — DB-derived counters. The full spec calls for 7 Vercel/Inngest
          metrics + 6 alert gates (see{" "}
          <code>docs/specs/v7.6/06-observability.md</code>); those wire in v1.5.
        </p>
      </header>
      <ObservabilityDashboard />
    </div>
  );
}
