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
  /**
   * When true, the entry renders as a "Coming soon" placeholder: dimmed,
   * non-competing for active state. The Link still navigates (lands on
   * /portal/assessments) so the row is not a dead end.
   */
  placeholder?: boolean;
}

const ADMIN_ENTRIES: SidebarEntry[] = [
  { href: "/admin/assessments", label: "Dashboard", exact: true },
  // Organizations / Campaigns / Public Quizzes are placeholders until the
  // dedicated admin pages land — the routes don't have page files yet.
  // The Link still navigates (lands on a 404 in dev, which is the desired
  // visual signal alongside the dimmed "(coming soon)" treatment).
  {
    href: "/admin/assessments/organizations",
    label: "Organizations",
    placeholder: true,
  },
  { href: "/admin/assessments/access-groups", label: "Access Groups" },
  { href: "/admin/assessments/templates", label: "Templates" },
  {
    href: "/admin/assessments/campaigns",
    label: "Campaigns",
    placeholder: true,
  },
  {
    href: "/admin/assessments/public-quizzes",
    label: "Public Quizzes",
    placeholder: true,
  },
  { href: "/admin/assessments/aggregate", label: "Aggregate Report" },
];

const COACH_ENTRIES: SidebarEntry[] = [
  { href: "/portal/assessments", label: "My Campaigns", exact: true },
  {
    href: "/portal/members",
    label: "Members",
  },
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
                placeholder={entry.placeholder}
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
                placeholder={entry.placeholder}
              />
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}
