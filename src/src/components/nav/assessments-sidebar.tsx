/**
 * AssessmentsSidebar — server-rendered sidebar for the /admin/assessments
 * lane (wireframe 24).
 *
 * Renders:
 *   - Admin section (visible to ADMIN + STAFF), one entry per admin surface,
 *     with the Aggregate Report row gated by canAccessAggregateReport (admin/staff
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
  // Wave Z: all admin entries are now real routes. Organizations + Campaigns
  // (their admin pages landed in PR-2) and Public Campaigns (wired in Z-1 to
  // the existing /admin/assessments/public-campaigns page — the glossary avoids
  // "quiz") are no longer "(coming soon)" placeholders. The `placeholder` prop
  // remains supported for any future unbuilt entry.
  { href: "/admin/assessments/organizations", label: "Organizations" },
  { href: "/admin/assessments/access-groups", label: "Access Groups" },
  { href: "/admin/assessments/templates", label: "Templates" },
  { href: "/admin/assessments/campaigns", label: "Campaigns" },
  { href: "/admin/assessments/public-campaigns", label: "Public Campaigns" },
  { href: "/admin/assessments/import", label: "Import" },
  // #85: the observability dashboard (import health + DB-derived counters) was
  // built but never linked — operators had to know the URL. Sits next to Import
  // since it surfaces import-health signals. ADMIN/STAFF-only, like this section.
  { href: "/admin/assessments/observability", label: "Observability" },
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
