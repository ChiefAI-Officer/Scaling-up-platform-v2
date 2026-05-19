/**
 * AssessmentsSidebar — server-rendered sidebar for the /admin/assessments
 * lane (wireframe 24).
 *
 * Renders:
 *   - Admin section (visible to ADMIN + STAFF) with 7 entries, with the
 *     Aggregate Report row gated by canAccessAggregateReport (also admin/staff
 *     in v1, but spec'd as a distinct predicate so future tightening lands
 *     in one place).
 *   - Coach-lane section (visible to COACH only) with 2 entries pointing at
 *     the existing /portal/assessments surface.
 *
 * Implementation contract: docs/wireframes-phase2/wave5/24-platform-nav-assessments-entry.md.
 */

import type { Session } from "next-auth";
import { AssessmentsNavLink } from "@/components/nav/assessments-nav-link";
import {
  isPrivilegedRole,
  normalizeRole,
} from "@/lib/auth/access-control";
import { canAccessAggregateReport } from "@/lib/assessments/access-control";

interface AssessmentsSidebarProps {
  session: Session;
}

interface SidebarEntry {
  href: string;
  label: string;
  exact?: boolean;
}

const ADMIN_ENTRIES: SidebarEntry[] = [
  { href: "/admin/assessments", label: "Dashboard", exact: true },
  { href: "/admin/assessments/organizations", label: "Organizations" },
  { href: "/admin/assessments/access-groups", label: "Access Groups" },
  { href: "/admin/assessments/templates", label: "Templates" },
  { href: "/admin/assessments/campaigns", label: "Campaigns" },
  { href: "/admin/assessments/public-quizzes", label: "Public Quizzes" },
  { href: "/admin/assessments/aggregate", label: "Aggregate Report" },
];

const COACH_ENTRIES: SidebarEntry[] = [
  { href: "/portal/assessments", label: "My Campaigns", exact: true },
  // Placeholder href until a dedicated org-list portal page lands.
  { href: "/portal/assessments", label: "My Organizations" },
];

export function AssessmentsSidebar({ session }: AssessmentsSidebarProps) {
  const rawRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const role = normalizeRole(rawRole);
  const showAdminSection = isPrivilegedRole(role);
  const showCoachSection = role === "COACH";

  const adminEntries = ADMIN_ENTRIES.filter((entry) => {
    if (entry.href === "/admin/assessments/aggregate") {
      return canAccessAggregateReport({ role });
    }
    return true;
  });

  return (
    <aside
      className="w-full md:w-60 md:flex-shrink-0 border-b md:border-b-0 md:border-r border-border bg-card/40"
      aria-label="Assessments navigation"
    >
      <nav className="p-3 md:p-4 space-y-6">
        {showAdminSection && (
          <div className="space-y-1">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Assessments
            </p>
            {adminEntries.map((entry) => (
              <AssessmentsNavLink
                key={entry.href + entry.label}
                href={entry.href}
                label={entry.label}
                exact={entry.exact}
              />
            ))}
          </div>
        )}

        {showCoachSection && (
          <div className="space-y-1">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Coach lane
            </p>
            {COACH_ENTRIES.map((entry) => (
              <AssessmentsNavLink
                key={entry.href + entry.label}
                href={entry.href}
                label={entry.label}
                exact={entry.exact}
              />
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}
