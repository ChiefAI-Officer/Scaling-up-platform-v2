/**
 * Members & Teams — coach portal page (Slice 1, read-only).
 *
 * Server component: loads the coach's organizations from the DB
 * and renders the two-panel MembersTeamsView client component.
 *
 * Pattern matches /portal/assessments/page.tsx:
 *   - requireCoach() for auth
 *   - db.* for data loading
 *   - FadeUp for animation
 *   - brand tokens for styling
 */

import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import { FadeUp } from "@/components/ui/animated";
import {
  MembersTeamsView,
  type OrgSummary,
} from "@/components/organizations/members-teams-view";

export default async function MembersPage() {
  const { coach } = await requireCoach();

  const organizations = await db.organization.findMany({
    where: { ownerCoachId: coach.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, ownerCoachId: true, externalId: true },
  });

  const items: OrgSummary[] = organizations.map((o) => ({
    id: o.id,
    name: o.name,
    ownerCoachId: o.ownerCoachId,
    externalId: o.externalId,
  }));

  return (
    <div className="space-y-6">
      <FadeUp>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Members &amp; Teams</h1>
          <p className="text-muted-foreground">
            Manage your company structure, teams, and members.
          </p>
        </div>
      </FadeUp>

      <FadeUp delay={0.1}>
        <MembersTeamsView initialOrganizations={items} />
      </FadeUp>
    </div>
  );
}
