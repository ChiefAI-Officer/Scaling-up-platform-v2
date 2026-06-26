/**
 * Admin/staff top-nav information architecture (Wave H).
 *
 * Single source of truth shared by the desktop (admin-nav-links) and mobile
 * (admin-mobile-nav) render paths and their tests. Pure data + helpers — no React.
 *
 * Taxonomy (Spec 17h §C, owner-approved June 26 2026):
 *   Dashboard | Workshops ▾ | Approvals ⦿ | Assessments | Automation ▾ | People ▾ | Financials ▾
 *
 * Group labels are menu-only (they do not navigate); only leaves and the two
 * direct links (Dashboard, Approvals) + the Assessments link navigate.
 */

export type BadgeKey = "approvals" | "refunds";

/** Live pending counts fetched server-side; a 0 renders no badge. */
export type BadgeCounts = Record<BadgeKey, number>;

export interface NavLeaf {
  label: string;
  href: string;
  badge?: BadgeKey;
}

export interface NavSection {
  /** Optional section header rendered inside the panel (e.g. "Configuration"). */
  heading?: string;
  items: NavLeaf[];
}

export interface NavGroup {
  kind: "group";
  label: string;
  /** Rolled-up badge shown on the CLOSED group trigger (mirrors a nested leaf). */
  badge?: BadgeKey;
  sections: NavSection[];
}

export interface NavLink {
  kind: "link";
  label: string;
  href: string;
  badge?: BadgeKey;
}

export type NavEntry = NavGroup | NavLink;

export const ADMIN_NAV: NavEntry[] = [
  { kind: "link", label: "Dashboard", href: "/admin/dashboard" },
  {
    kind: "group",
    label: "Workshops",
    sections: [
      {
        items: [
          { label: "All Workshops", href: "/workshops" },
          { label: "Registrations", href: "/admin/registrations" },
          { label: "Workshop Surveys", href: "/admin/surveys" },
        ],
      },
      {
        heading: "Configuration",
        items: [
          { label: "Templates", href: "/templates" },
          { label: "Categories", href: "/admin/categories" },
          { label: "Pricing", href: "/admin/pricing" },
        ],
      },
    ],
  },
  { kind: "link", label: "Approvals", href: "/admin/approvals", badge: "approvals" },
  { kind: "link", label: "Assessments", href: "/admin/assessments" },
  {
    kind: "group",
    label: "Automation",
    sections: [
      {
        items: [
          { label: "Workflows", href: "/admin/workflows" },
          { label: "Emails", href: "/admin/transactional-emails" },
          { label: "Files", href: "/admin/files" },
        ],
      },
    ],
  },
  {
    kind: "group",
    label: "People",
    sections: [
      {
        items: [
          { label: "Coaches", href: "/coaches" },
          { label: "Partners", href: "/partners" },
        ],
      },
    ],
  },
  {
    kind: "group",
    label: "Financials",
    badge: "refunds",
    sections: [
      {
        items: [
          { label: "Financials", href: "/admin/financials" },
          { label: "Refunds", href: "/admin/refunds-needed", badge: "refunds" },
        ],
      },
    ],
  },
];

/** Flat list of every leaf in a group (across its sections), in nav order. */
export function groupLeaves(group: NavGroup): NavLeaf[] {
  return group.sections.flatMap((s) => s.items);
}

/** All navigable destinations (links + every group leaf), in nav order. */
export function adminNavHrefs(): string[] {
  const out: string[] = [];
  for (const entry of ADMIN_NAV) {
    if (entry.kind === "link") out.push(entry.href);
    else for (const leaf of groupLeaves(entry)) out.push(leaf.href);
  }
  return out;
}
