/**
 * Admin — Organizations directory (Wave Z, Z-3).
 *
 * Server-component shell (admin/STAFF gate) that loads ALL non-deleted
 * organizations (not just one coach's) and hands them to the coach
 * `MembersTeamsView`, so admin/STAFF can view + manage members and teams for
 * ANY company. The org member/team/edit/import APIs already admit privileged
 * actors (`canAccessOrganization` → true for privileged), so no route change.
 *
 * Reduced host: `allowOrgCreate={false}` hides the "Add Company or Team" button
 * (its company path `POST /api/organizations` 403s for a non-coach; org-create
 * is out of scope this wave) and `hideEspertoImport` hides the coach-only
 * `/portal/members/import` link (admin has its own /admin/assessments/import).
 * Members/teams load lazily per node-select, so this list query is light.
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import {
  MembersTeamsView,
  type OrgSummary,
} from "@/components/organizations/members-teams-view";

export default async function AdminAssessmentOrganizationsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  const organizations = await db.organization.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      ownerCoachId: true,
      externalId: true,
      // #86 — the owning coach's name drives the admin "by coach" grouping.
      owner: { select: { firstName: true, lastName: true } },
    },
  });

  const items: OrgSummary[] = organizations.map((o) => ({
    id: o.id,
    name: o.name,
    ownerCoachId: o.ownerCoachId,
    ownerCoachName: `${o.owner.firstName} ${o.owner.lastName}`.trim() || null,
    externalId: o.externalId,
  }));

  return (
    <div>
      {/* Breadcrumb */}
      <div className="wf-breadcrumb">
        <a href="/admin/dashboard">Admin</a>
        <span className="wf-breadcrumb-sep">/</span>
        <a href="/admin/assessments">Assessments</a>
        <span className="wf-breadcrumb-sep">/</span>
        <span className="wf-breadcrumb-current">Organizations</span>
      </div>

      {/* Page header */}
      <div className="wf-page-header-row">
        <div>
          <h2 className="wf-page-title">Organizations</h2>
          <p className="wf-page-subtitle-strong">
            Every company across the platform. Select a company to view and
            manage its members and teams. Admin and STAFF only. New companies
            are created by their owning coach.
          </p>
        </div>
      </div>

      <MembersTeamsView
        initialOrganizations={items}
        allowOrgCreate={false}
        hideEspertoImport
        allowGroupByCoach
      />
    </div>
  );
}
