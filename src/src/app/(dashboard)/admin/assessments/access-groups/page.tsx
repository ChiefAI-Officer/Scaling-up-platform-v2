/**
 * Admin AccessGroups list page (Wave 5 wireframe 21).
 *
 * Spec refs:
 *  - docs/wireframes-phase2/wave5/21-admin-access-groups-list.md
 *  - docs/specs/v7.6/02-service-layer-rules.md — INTERSECTION semantics
 *
 * Server component shell — enforces admin/staff gate at request time;
 * delegates table + create-dialog rendering to the client component.
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { AccessGroupsList } from "@/components/admin/AccessGroupsList";

export default async function AdminAccessGroupsPage() {
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
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Access Groups</h1>
          <p className="text-sm text-muted-foreground">
            Grant template access to coaches via group membership. A coach in
            multiple groups sees only templates that ALL their groups grant
            (INTERSECTION).
          </p>
        </div>
      </header>

      <AccessGroupsList />
    </div>
  );
}
