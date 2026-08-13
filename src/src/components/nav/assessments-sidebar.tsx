/**
 * AssessmentsSidebar — server-rendered sidebar for the /admin/assessments
 * lane (wireframe 24).
 *
 * Renders:
 *   - Admin section (visible to ADMIN + STAFF), one entry per admin surface,
 *     with the Aggregate Report row gated by canAccessAggregateReport (admin/staff
 *     in v1, but spec'd as a distinct predicate so future tightening lands
 *     in one place).
 *   - Coach-lane section (visible to COACH only) with entries pointing at
 *     the existing /portal/assessments surface.
 *
 * Implementation contract: docs/wireframes-phase2/wave5/24-platform-nav-assessments-entry.md.
 */

import type { Session } from "next-auth";
import { AssessmentsNavLink } from "@/components/nav/assessments-nav-link";
import {
  AssessmentsCompactNav,
  type AssessmentsNavEntry,
} from "@/components/nav/assessments-compact-nav";
import {
  isPrivilegedRole,
  normalizeRole,
} from "@/lib/auth/access-control";
import { canAccessAggregateReport } from "@/lib/assessments/access-control";
import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";

interface AssessmentsSidebarProps {
  session: Session;
  responsiveEnabled?: boolean;
}

type SidebarEntry = AssessmentsNavEntry;

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
  {
    href: "/admin/assessments/delivery-holds",
    label: "Delivery Holds",
  },
  { href: "/admin/assessments/aggregate", label: "Aggregate Report" },
];

const COACH_ENTRIES: SidebarEntry[] = [
  { href: "/portal/assessments", label: "My Campaigns", exact: true },
  { href: "/portal/members", label: "Members" },
];

const REFERRED_RESULTS_ENTRY: SidebarEntry = {
  href: "/portal/assessments/referred-results",
  label: "Referred Results",
};

export function AssessmentsSidebar({
  session,
  responsiveEnabled = false,
}: AssessmentsSidebarProps) {
  const rawRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const role = normalizeRole(rawRole);
  const showAdminSection = isPrivilegedRole(role);
  const showCoachSection = role === "COACH";
  const coachEntries =
    showCoachSection && isReferredResultsEnabled()
      ? [
          COACH_ENTRIES[0],
          REFERRED_RESULTS_ENTRY,
          ...COACH_ENTRIES.slice(1),
        ]
      : COACH_ENTRIES;

  const adminEntries = ADMIN_ENTRIES.filter((entry) => {
    if (entry.href === "/admin/assessments/aggregate") {
      return canAccessAggregateReport({ role });
    }
    return true;
  });
  const entries = showAdminSection
    ? adminEntries
    : showCoachSection
      ? coachEntries
      : [];

  const sidebar = (
    <aside
      className={
        responsiveEnabled
          ? "hidden w-full border-border bg-card/40 sm:block sm:w-60 sm:flex-shrink-0 sm:border-r"
          : "w-full md:w-60 md:flex-shrink-0 border-b md:border-b-0 md:border-r border-border bg-card/40"
      }
      aria-label="Assessments navigation"
    >
      <nav className="p-3 md:p-4 space-y-6">
        {showAdminSection && (
          <div className="space-y-1">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Assessments
            </p>
            {entries.map((entry) => (
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
            {entries.map((entry) => (
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

  if (!responsiveEnabled) return sidebar;

  return (
    <>
      <AssessmentsCompactNav entries={entries} />
      {sidebar}
    </>
  );
}
