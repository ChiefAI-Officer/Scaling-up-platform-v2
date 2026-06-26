# Wave H — Admin Nav Grouped Dropdowns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, overflowing 16-item admin/staff top nav with grouped click-to-open dropdowns, a standalone **Approvals** action link, and always-visible pending-count badges on Approvals + Refunds — zero new routes, no migration, no feature flag.

**Architecture:** A single typed nav-model module (`lib/nav/admin-nav-model.ts`) is the source of truth for both render paths. Desktop (`admin-nav-links.tsx`) and mobile (`admin-mobile-nav.tsx`) use the **disclosure-navigation pattern** (WAI-ARIA's recommended pattern for site nav — NOT `role="menu"/"menubar"`): a `<button aria-expanded aria-controls>` per group toggling a labelled panel of plain `<Link>`s; Tab traverses, Esc closes and returns focus to the trigger, the active leaf gets `aria-current`, arrow-key cycling is a progressive enhancement. **A single `openGroup` state lives in `AdminNavLinks`** (one panel open at a time *by construction* — see "Codex review" below). The server layout fetches two `count()` queries via `lib/nav/admin-nav-badges.ts` and passes a `BadgeCounts` prop; a zero count renders no badge.

**Why hand-rolled (not the installed Radix `@radix-ui/react-dropdown-menu`):** Radix gives free menu keyboard semantics, but (a) the repo's nav precedent is hand-rolled, (b) the `menu` role is the *wrong* primitive for site navigation, and (c) Radix dropdowns are flaky to interaction-test under jsdom. The disclosure pattern is correct for nav and fully testable with `fireEvent`.

**Badge freshness (decided):** badges reflect the count as of the last full layout render (login, hard reload, or `router.refresh()`). In App Router a layout does **not** re-render on soft navigation between sibling pages — so the approvals respond flow gets a `router.refresh()` (Task 5) to self-heal the Approvals badge the moment the queue is cleared (the refund flow already does this). Badges are **not** live-polled.

**Badge query cost (honest):** two `count()` queries when the layout renders. The approvals count (`status = PENDING`) is cheap. The **refunds count joins `Registration` → `Workshop` on `paymentStatus`/`refundedAt`/`workshop.status` and is NOT backed by a dedicated index — and no migration is in scope, so we do not add one.** At this product's data scale (a coaching-workshop platform — thousands of registrations, not millions) a filtered count is sub-10ms and acceptable. The fetch is fail-soft (Task 2). If this ever shows up as a slow query, revisit with an index (a later migration) or a short `unstable_cache` — out of scope here.

**Codex review (folded in, 2026-06-26):** a staff-eng pass via `/co-validate` produced six accepted changes, all reflected below: (1) `set -o pipefail` on the gate commands so a piped failure can't read as green; (2) **single `openGroup` state** so keyboard activation can't leave two panels open; (3) a **real browser smoke** at desktop/mobile widths before PR (jsdom can't catch overflow/z-index/responsive); (4) the honest "not indexed" cost note above; (5) **SoT flush lands in the PR**, not post-merge; (6) **mobile groups collapse by default**, active group auto-expanded.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, Tailwind + shadcn tokens, Jest + @testing-library/react (jsdom), `fireEvent` for interaction (note: `@testing-library/user-event` is **not** installed). Browser smoke via Playwright MCP or a running dev server.

**Source of truth:** Spec [`17h-wave-h-admin-nav-design.md`](./17h-wave-h-admin-nav-design.md) (owner-approved June 26 2026: Approvals promoted to a standalone top-level link) + [ADR-0013](../../adr/0013-grouped-admin-nav-supersedes-wireframe-24-flat-add.md).

**Final taxonomy (7 top-level entries):**
```
Dashboard │ Workshops ▾ │ Approvals ⦿ │ Assessments → │ Automation ▾ │ People ▾ │ Financials ▾
```

**Out of scope (do NOT build here):** the H-infra custom-domain step (`platform.scalingup.com`) is an ops task (Spec 17h §G). No per-item role gating; the COACH→`/unauthorized` redirect is unchanged.

---

## File structure

| File | Responsibility |
|---|---|
| `src/src/lib/nav/admin-nav-model.ts` | **Create.** Typed nav model (`NavEntry[]`) + helpers (`adminNavHrefs`, `groupLeaves`). Pure data, no React. |
| `src/src/lib/nav/admin-nav-badges.ts` | **Create.** `getAdminNavBadgeCounts()` → `{ approvals, refunds }`; fail-soft. |
| `src/src/components/layout/admin-nav-links.tsx` | **Rework.** Desktop grouped disclosure nav; single `openGroup` state. |
| `src/src/components/layout/admin-mobile-nav.tsx` | **Rework.** Mobile grouped collapsible sections (collapsed by default, active group expanded). |
| `src/src/app/(dashboard)/admin/approvals/page.tsx` | **Modify.** `router.refresh()` on respond success so the badge self-heals. |
| `src/src/app/(dashboard)/layout.tsx` | **Modify.** Fetch counts; pass `counts` prop; drop flat `navLinks`. |
| `src/src/__tests__/lib/admin-nav-model.test.ts` | **Create.** Model homes all 16 routes; Approvals standalone. |
| `src/src/__tests__/lib/admin-nav-badges.test.ts` | **Create.** Count-query shape + zero + fail-soft. |
| `src/src/__tests__/components/admin-nav-links.test.tsx` | **Create.** Desktop render/interaction/a11y/badge/single-open. |
| `src/src/__tests__/components/admin-mobile-nav.test.tsx` | **Create.** Mobile render/collapse/active-expand/badge. |

All shell commands run from `/Users/diushianstand/Scaling-up-platform-v2/src`. Run a single test with `npx jest <path>`.

---

## Task 0: Branch

- [ ] **Step 1: Create the feature branch off current `main`**

```bash
cd /Users/diushianstand/Scaling-up-platform-v2
git checkout main && git pull
git checkout -b feat/wave-h-admin-nav
```

---

## Task 1: Nav model module

**Files:**
- Create: `src/src/lib/nav/admin-nav-model.ts`
- Test: `src/src/__tests__/lib/admin-nav-model.test.ts`

- [ ] **Step 1: Write the failing test**

`src/src/__tests__/lib/admin-nav-model.test.ts`:

```ts
import {
  ADMIN_NAV,
  adminNavHrefs,
  groupLeaves,
  type NavGroup,
  type NavLink,
} from "@/lib/nav/admin-nav-model";

const EXPECTED_HREFS = [
  "/admin/dashboard",
  "/workshops",
  "/admin/registrations",
  "/admin/surveys",
  "/templates",
  "/admin/categories",
  "/admin/pricing",
  "/admin/approvals",
  "/admin/assessments",
  "/admin/workflows",
  "/admin/transactional-emails",
  "/admin/files",
  "/coaches",
  "/partners",
  "/admin/financials",
  "/admin/refunds-needed",
];

describe("admin-nav-model", () => {
  it("homes all 16 known routes exactly once", () => {
    const hrefs = adminNavHrefs();
    expect(hrefs).toHaveLength(16);
    expect(new Set(hrefs).size).toBe(16);
    expect([...hrefs].sort()).toEqual([...EXPECTED_HREFS].sort());
  });

  it("Approvals is a standalone top-level link with the approvals badge", () => {
    const approvals = ADMIN_NAV.find(
      (e): e is NavLink => e.kind === "link" && e.label === "Approvals"
    );
    expect(approvals).toBeDefined();
    expect(approvals?.href).toBe("/admin/approvals");
    expect(approvals?.badge).toBe("approvals");
  });

  it("Workshops group does NOT contain Approvals and uses the 'Workshop Surveys' label", () => {
    const workshops = ADMIN_NAV.find(
      (e): e is NavGroup => e.kind === "group" && e.label === "Workshops"
    )!;
    const leaves = groupLeaves(workshops);
    expect(leaves.map((l) => l.label)).not.toContain("Approvals");
    expect(leaves.find((l) => l.href === "/admin/surveys")?.label).toBe("Workshop Surveys");
  });

  it("Assessments is a gateway link into its own lane", () => {
    const assessments = ADMIN_NAV.find(
      (e): e is NavLink => e.kind === "link" && e.label === "Assessments"
    );
    expect(assessments?.gateway).toBe(true);
    expect(assessments?.href).toBe("/admin/assessments");
  });

  it("Financials group carries a rolled-up refunds badge and nests Refunds", () => {
    const fin = ADMIN_NAV.find(
      (e): e is NavGroup => e.kind === "group" && e.label === "Financials"
    )!;
    expect(fin.badge).toBe("refunds");
    const refunds = groupLeaves(fin).find((l) => l.label === "Refunds");
    expect(refunds?.href).toBe("/admin/refunds-needed");
    expect(refunds?.badge).toBe("refunds");
  });
});
```

- [ ] **Step 2: Run it; verify it fails** — `npx jest src/__tests__/lib/admin-nav-model.test.ts` → FAIL (module not found).

- [ ] **Step 3: Create the model module**

`src/src/lib/nav/admin-nav-model.ts`:

```ts
/**
 * Admin/staff top-nav information architecture (Wave H).
 *
 * Single source of truth shared by the desktop (admin-nav-links) and mobile
 * (admin-mobile-nav) render paths and their tests. Pure data + helpers — no React.
 *
 * Taxonomy (Spec 17h §C, owner-approved June 26 2026):
 *   Dashboard | Workshops ▾ | Approvals ⦿ | Assessments → | Automation ▾ | People ▾ | Financials ▾
 *
 * Group labels are menu-only (they do not navigate); only leaves and the two
 * direct links (Dashboard, Approvals) + the Assessments gateway navigate.
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
  /** Renders the "→" gateway affordance (the Assessments lane). */
  gateway?: boolean;
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
  { kind: "link", label: "Assessments", href: "/admin/assessments", gateway: true },
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

/** All navigable destinations (links + gateway + every group leaf), in nav order. */
export function adminNavHrefs(): string[] {
  const out: string[] = [];
  for (const entry of ADMIN_NAV) {
    if (entry.kind === "link") out.push(entry.href);
    else for (const leaf of groupLeaves(entry)) out.push(leaf.href);
  }
  return out;
}
```

- [ ] **Step 4: Run it; verify it passes** — `npx jest src/__tests__/lib/admin-nav-model.test.ts` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/nav/admin-nav-model.ts "src/src/__tests__/lib/admin-nav-model.test.ts"
git commit -m "feat(nav): typed admin nav model (Wave H) — Approvals standalone, all 16 routes homed"
```

---

## Task 2: Badge-count fetcher (fail-soft)

**Files:**
- Create: `src/src/lib/nav/admin-nav-badges.ts`
- Test: `src/src/__tests__/lib/admin-nav-badges.test.ts`

- [ ] **Step 1: Write the failing test**

`src/src/__tests__/lib/admin-nav-badges.test.ts`:

```ts
const approvalCount = jest.fn();
const registrationCount = jest.fn();

jest.mock("@/lib/db", () => ({
  db: {
    approvalQueue: { count: (...a: unknown[]) => approvalCount(...a) },
    registration: { count: (...a: unknown[]) => registrationCount(...a) },
  },
}));

import { getAdminNavBadgeCounts } from "@/lib/nav/admin-nav-badges";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getAdminNavBadgeCounts", () => {
  it("counts PENDING approvals and unrefunded paid regs on canceled workshops", async () => {
    approvalCount.mockResolvedValue(3);
    registrationCount.mockResolvedValue(2);

    const counts = await getAdminNavBadgeCounts();
    expect(counts).toEqual({ approvals: 3, refunds: 2 });

    expect(approvalCount).toHaveBeenCalledWith({ where: { status: "PENDING" } });
    expect(registrationCount).toHaveBeenCalledWith({
      where: {
        paymentStatus: "COMPLETED",
        refundedAt: null,
        workshop: { status: "CANCELED" },
      },
    });
  });

  it("returns zeros when nothing is pending", async () => {
    approvalCount.mockResolvedValue(0);
    registrationCount.mockResolvedValue(0);
    expect(await getAdminNavBadgeCounts()).toEqual({ approvals: 0, refunds: 0 });
  });

  it("fails soft to zeros (never throws) when a count query rejects", async () => {
    approvalCount.mockRejectedValue(new Error("db down"));
    registrationCount.mockResolvedValue(2);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const counts = await getAdminNavBadgeCounts();
    expect(counts).toEqual({ approvals: 0, refunds: 0 });
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it; verify it fails** — `npx jest src/__tests__/lib/admin-nav-badges.test.ts` → FAIL (module not found).

- [ ] **Step 3: Create the fetcher**

`src/src/lib/nav/admin-nav-badges.ts`:

```ts
import { db } from "@/lib/db";
import type { BadgeCounts } from "@/lib/nav/admin-nav-model";

/**
 * Server-side pending counts for the two operator-queue badges.
 *  - approvals: open approval-queue rows (status PENDING)
 *  - refunds:   paid registrations on CANCELED workshops not yet refunded
 *               (mirrors the /admin/refunds-needed page filter exactly)
 *
 * Fail-soft: these badges are decorative, but this runs in the admin layout
 * that wraps EVERY admin page. A thrown count must never 500 the shell, so on
 * any error we log and return zeros (a zero renders no badge).
 *
 * Cost note: the refunds filter joins Registration -> Workshop and is NOT
 * index-backed (no migration in scope). Acceptable at this data scale; revisit
 * with an index or short cache only if it shows up as a slow query.
 */
export async function getAdminNavBadgeCounts(): Promise<BadgeCounts> {
  try {
    const [approvals, refunds] = await Promise.all([
      db.approvalQueue.count({ where: { status: "PENDING" } }),
      db.registration.count({
        where: {
          paymentStatus: "COMPLETED",
          refundedAt: null,
          workshop: { status: "CANCELED" },
        },
      }),
    ]);
    return { approvals, refunds };
  } catch (err) {
    console.error("getAdminNavBadgeCounts failed; rendering no badges", err);
    return { approvals: 0, refunds: 0 };
  }
}
```

- [ ] **Step 4: Run it; verify it passes** — `npx jest src/__tests__/lib/admin-nav-badges.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/nav/admin-nav-badges.ts "src/src/__tests__/lib/admin-nav-badges.test.ts"
git commit -m "feat(nav): fail-soft Approvals/Refunds pending-count fetcher (Wave H)"
```

---

## Task 3: Desktop grouped nav (disclosure, single open state)

**Files:**
- Modify (full rewrite): `src/src/components/layout/admin-nav-links.tsx`
- Test: `src/src/__tests__/components/admin-nav-links.test.tsx`

**Key design (Codex #3):** `AdminNavLinks` owns a single `openGroup: string | null`. Each `GroupMenu` is *controlled* (`isOpen`/`onOpen`/`onClose`). Opening one group sets `openGroup` to it, which closes any other **by construction** — so keyboard activation (which fires `click`, not `mousedown`) can never leave two panels open. Outside-click + focus-leaving-the-nav close the open group at the `AdminNavLinks` level; Esc closes + returns focus to the trigger at the panel level.

- [ ] **Step 1: Write the failing test**

`src/src/__tests__/components/admin-nav-links.test.tsx`:

```tsx
let mockPathname = "/admin/dashboard";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import { render, screen, fireEvent, within } from "@testing-library/react";
import { AdminNavLinks } from "@/components/layout/admin-nav-links";
import type { BadgeCounts } from "@/lib/nav/admin-nav-model";

const COUNTS: BadgeCounts = { approvals: 3, refunds: 2 };

function renderNav(counts: BadgeCounts = COUNTS, path = "/admin/dashboard") {
  mockPathname = path;
  return render(<AdminNavLinks counts={counts} />);
}

beforeEach(() => {
  mockPathname = "/admin/dashboard";
});

describe("AdminNavLinks (desktop, Wave H)", () => {
  it("renders the 4 group triggers + Dashboard, Approvals, Assessments", () => {
    renderNav();
    for (const g of ["Workshops", "Automation", "People", "Financials"]) {
      expect(screen.getByRole("button", { name: new RegExp(g, "i") })).toBeInTheDocument();
    }
    expect(screen.getByText("Dashboard").closest("a")).not.toBeNull();
    expect(screen.getByText("Approvals").closest("a")).not.toBeNull();
    expect(screen.getByText("Assessments").closest("a")).not.toBeNull();
  });

  it("group label is a button (not a link) that toggles a panel without navigating", () => {
    renderNav();
    const trigger = screen.getByRole("button", { name: /Workshops/i });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("All Workshops")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group", { name: /Workshops/i });
    expect(within(panel).getByText("All Workshops")).toBeInTheDocument();
    expect(within(panel).getByText("Workshop Surveys")).toBeInTheDocument();
    expect(within(panel).getByText("Configuration")).toBeInTheDocument();
  });

  it("only one group is open at a time (opening a second closes the first)", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /Workshops/i }));
    expect(screen.getByRole("group", { name: /Workshops/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Automation/i }));
    expect(screen.queryByRole("group", { name: /Workshops/i })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Automation/i })).toBeInTheDocument();
  });

  it("shows the Approvals pending badge at the top level", () => {
    renderNav();
    const approvals = screen.getByText("Approvals").closest("a")!;
    expect(within(approvals).getByText("3")).toBeInTheDocument();
  });

  it("hides a badge when the count is zero", () => {
    renderNav({ approvals: 0, refunds: 0 });
    const approvals = screen.getByText("Approvals").closest("a")!;
    expect(within(approvals).queryByText("0")).not.toBeInTheDocument();
    const financials = screen.getByRole("button", { name: /Financials/i });
    expect(within(financials).queryByText(/\d/)).not.toBeInTheDocument();
  });

  it("rolls the Refunds badge onto the closed Financials trigger; shows it on the leaf when open", () => {
    renderNav();
    const financials = screen.getByRole("button", { name: /Financials/i });
    expect(within(financials).getByText("2")).toBeInTheDocument();

    fireEvent.click(financials);
    const panel = screen.getByRole("group", { name: /Financials/i });
    const refundsLeaf = within(panel).getByText("Refunds").closest("a")!;
    expect(within(refundsLeaf).getByText("2")).toBeInTheDocument();
    expect(within(financials).queryByText("2")).not.toBeInTheDocument();
  });

  it("highlights the active group and marks the active leaf aria-current", () => {
    renderNav(COUNTS, "/workshops");
    const trigger = screen.getByRole("button", { name: /Workshops/i });
    expect(trigger.className).toMatch(/text-primary/);

    fireEvent.click(trigger);
    const panel = screen.getByRole("group", { name: /Workshops/i });
    const leaf = within(panel).getByText("All Workshops").closest("a")!;
    expect(leaf).toHaveAttribute("aria-current", "page");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    renderNav();
    const trigger = screen.getByRole("button", { name: /Workshops/i });
    fireEvent.click(trigger);
    const panel = screen.getByRole("group", { name: /Workshops/i });

    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("group", { name: /Workshops/i })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(trigger);
  });

  it("cycles focus among panel links with ArrowDown (enhancement)", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /Workshops/i }));
    const panel = screen.getByRole("group", { name: /Workshops/i });
    const links = within(panel).getAllByRole("link");
    links[0].focus();
    expect(document.activeElement).toBe(links[0]);
    fireEvent.keyDown(links[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(links[1]);
  });
});
```

- [ ] **Step 2: Run it; verify it fails** — `npx jest src/__tests__/components/admin-nav-links.test.tsx` → FAIL (still the flat `links`-prop bar).

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/src/components/layout/admin-nav-links.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavLinkActive } from "@/lib/nav-utils";
import {
  ADMIN_NAV,
  groupLeaves,
  type BadgeCounts,
  type BadgeKey,
  type NavGroup,
  type NavLink as NavLinkEntry,
} from "@/lib/nav/admin-nav-model";

const BADGE_NOUN: Record<BadgeKey, string> = {
  approvals: "pending approvals",
  refunds: "refunds needing action",
};

const itemBase =
  "inline-flex items-center px-2 py-2 rounded-md text-sm font-medium transition-colors duration-200 whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

function CountBadge({ badge, counts }: { badge: BadgeKey; counts: BadgeCounts }) {
  const count = counts[badge];
  if (!count || count <= 0) return null;
  return (
    <span
      className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-destructive-foreground tabular-nums"
      aria-label={`${count} ${BADGE_NOUN[badge]}`}
    >
      {count}
    </span>
  );
}

function TopLink({ entry, counts }: { entry: NavLinkEntry; counts: BadgeCounts }) {
  const pathname = usePathname();
  const isActive = isNavLinkActive(pathname, entry.href);
  return (
    <Link
      href={entry.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        itemBase,
        isActive
          ? "bg-primary/10 text-primary font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
      )}
    >
      {entry.label}
      {entry.gateway ? <span aria-hidden className="ml-1 opacity-70">→</span> : null}
      {entry.badge ? <CountBadge badge={entry.badge} counts={counts} /> : null}
    </Link>
  );
}

function GroupMenu({
  group,
  counts,
  isOpen,
  onOpen,
  onClose,
}: {
  group: NavGroup;
  counts: BadgeCounts;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const isActive = groupLeaves(group).some((leaf) => isNavLinkActive(pathname, leaf.href));

  // Progressive enhancement: focus the first link when the panel opens.
  useEffect(() => {
    if (isOpen) panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
  }, [isOpen]);

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      onClose();
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const links = Array.from(panelRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    if (links.length === 0) return;
    const idx = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next =
      e.key === "ArrowDown"
        ? links[(idx + 1) % links.length]
        : links[(idx - 1 + links.length) % links.length];
    next.focus();
  }

  // Active state takes precedence over the open/hover treatment so an active
  // group reads as "active" (primary tint), never merely "open".
  const triggerTone = isActive
    ? "bg-primary/10 text-primary font-semibold"
    : isOpen
      ? "bg-accent text-foreground font-semibold"
      : "text-muted-foreground hover:text-foreground hover:bg-accent/60";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => (isOpen ? onClose() : onOpen())}
        className={cn(itemBase, "gap-1.5", triggerTone)}
      >
        {group.label}
        {!isOpen && group.badge ? <CountBadge badge={group.badge} counts={counts} /> : null}
        <span aria-hidden className="text-[10px] opacity-70">▾</span>
      </button>

      {isOpen ? (
        <div
          id={menuId}
          ref={panelRef}
          role="group"
          aria-label={group.label}
          onKeyDown={onPanelKeyDown}
          className="absolute left-0 top-full z-50 mt-2 min-w-[224px] rounded-md border bg-card p-1.5 shadow-lg"
        >
          {group.sections.map((section, si) => (
            <div key={si}>
              {section.heading ? (
                <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.heading}
                </div>
              ) : null}
              {section.items.map((leaf) => {
                const leafActive = isNavLinkActive(pathname, leaf.href);
                return (
                  <Link
                    key={leaf.href}
                    href={leaf.href}
                    aria-current={leafActive ? "page" : undefined}
                    onClick={onClose}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset",
                      leafActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-accent"
                    )}
                  >
                    <span>{leaf.label}</span>
                    {leaf.badge ? <CountBadge badge={leaf.badge} counts={counts} /> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminNavLinks({ counts }: { counts: BadgeCounts }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Close the open group on click outside the nav, on focus leaving the nav
  // (keyboard Tab-away), or on Escape anywhere. A single openGroup guarantees
  // only one panel is open at a time.
  useEffect(() => {
    if (!openGroup) return;
    const close = () => setOpenGroup(null);
    function onPointer(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) close();
    }
    function onFocusOut(e: FocusEvent) {
      if (navRef.current && !navRef.current.contains(e.relatedTarget as Node | null)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    const node = navRef.current;
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    node?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      node?.removeEventListener("focusout", onFocusOut);
    };
  }, [openGroup]);

  return (
    <div ref={navRef} className="hidden lg:ml-6 lg:flex lg:items-center lg:space-x-0.5">
      {ADMIN_NAV.map((entry) =>
        entry.kind === "link" ? (
          <TopLink key={entry.href} entry={entry} counts={counts} />
        ) : (
          <GroupMenu
            key={entry.label}
            group={entry}
            counts={counts}
            isOpen={openGroup === entry.label}
            onOpen={() => setOpenGroup(entry.label)}
            onClose={() => setOpenGroup(null)}
          />
        )
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it; verify it passes** — `npx jest src/__tests__/components/admin-nav-links.test.tsx` → PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/src/components/layout/admin-nav-links.tsx "src/src/__tests__/components/admin-nav-links.test.tsx"
git commit -m "feat(nav): desktop grouped disclosure nav, single open-group state + a11y (Wave H)"
```

---

## Task 4: Mobile grouped nav (collapsed by default, active expanded)

**Files:**
- Modify (full rewrite): `src/src/components/layout/admin-mobile-nav.tsx`
- Test: `src/src/__tests__/components/admin-mobile-nav.test.tsx`

**Codex #6:** groups start **collapsed**; the group containing the current route auto-expands.

- [ ] **Step 1: Write the failing test**

`src/src/__tests__/components/admin-mobile-nav.test.tsx`:

```tsx
let mockPathname = "/admin/dashboard";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));
jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

import { render, screen, fireEvent, within } from "@testing-library/react";
import { AdminMobileNav } from "@/components/layout/admin-mobile-nav";
import type { BadgeCounts } from "@/lib/nav/admin-nav-model";

const COUNTS: BadgeCounts = { approvals: 3, refunds: 2 };

function open(counts: BadgeCounts = COUNTS, path = "/admin/dashboard") {
  mockPathname = path;
  render(<AdminMobileNav counts={counts} email="suzanne@scalingup.com" />);
  fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
}

beforeEach(() => {
  mockPathname = "/admin/dashboard";
});

describe("AdminMobileNav (Wave H)", () => {
  it("is collapsed until the hamburger is clicked", () => {
    render(<AdminMobileNav counts={COUNTS} email="x@y.com" />);
    expect(screen.queryByText("Workshops")).not.toBeInTheDocument();
  });

  it("shows group headers + standalone links when open, with groups collapsed", () => {
    open();
    expect(screen.getByText("Workshops")).toBeInTheDocument(); // header
    expect(screen.getByText("Approvals")).toBeInTheDocument(); // standalone link
    expect(screen.getByText("Assessments")).toBeInTheDocument();
    // Collapsed by default → leaves hidden until the header is tapped.
    expect(screen.queryByText("All Workshops")).not.toBeInTheDocument();
  });

  it("expands a group when its header is clicked", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Workshops/i }));
    expect(screen.getByText("All Workshops")).toBeInTheDocument();
  });

  it("auto-expands the group containing the current route", () => {
    open(COUNTS, "/workshops");
    // Workshops contains /workshops → expanded on open, no tap needed.
    expect(screen.getByText("All Workshops")).toBeInTheDocument();
  });

  it("shows the Approvals badge (standalone) and the Refunds badge once Financials is expanded", () => {
    open();
    const approvals = screen.getByText("Approvals").closest("a")!;
    expect(within(approvals).getByText("3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Financials/i }));
    const refunds = screen.getByText("Refunds").closest("a")!;
    expect(within(refunds).getByText("2")).toBeInTheDocument();
  });

  it("hides badges when counts are zero", () => {
    open({ approvals: 0, refunds: 0 });
    const approvals = screen.getByText("Approvals").closest("a")!;
    expect(within(approvals).queryByText("0")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it; verify it fails** — `npx jest src/__tests__/components/admin-mobile-nav.test.tsx` → FAIL (flat `links`-prop list).

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/src/components/layout/admin-mobile-nav.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Menu, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavLinkActive } from "@/lib/nav-utils";
import {
  ADMIN_NAV,
  groupLeaves,
  type BadgeCounts,
  type BadgeKey,
  type NavGroup,
} from "@/lib/nav/admin-nav-model";

const BADGE_NOUN: Record<BadgeKey, string> = {
  approvals: "pending approvals",
  refunds: "refunds needing action",
};

function MobileBadge({ badge, counts }: { badge: BadgeKey; counts: BadgeCounts }) {
  const count = counts[badge];
  if (!count || count <= 0) return null;
  return (
    <span
      className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-destructive-foreground tabular-nums"
      aria-label={`${count} ${BADGE_NOUN[badge]}`}
    >
      {count}
    </span>
  );
}

function MobileGroup({
  group,
  counts,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  counts: BadgeCounts;
  pathname: string;
  onNavigate: () => void;
}) {
  // Collapsed by default; auto-expanded when it contains the current route.
  const containsActive = groupLeaves(group).some((leaf) => isNavLinkActive(pathname, leaf.href));
  const [open, setOpen] = useState(containsActive);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span className="flex items-center">
          {group.label}
          {!open && group.badge ? <MobileBadge badge={group.badge} counts={counts} /> : null}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : "")}
        />
      </button>
      {open
        ? group.sections.flatMap((section) =>
            section.items.map((leaf) => {
              const active = isNavLinkActive(pathname, leaf.href);
              return (
                <Link
                  key={leaf.href}
                  href={leaf.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between rounded-lg py-2 pl-6 pr-3 text-sm font-medium",
                    active
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground hover:bg-accent/60"
                  )}
                >
                  <span>{leaf.label}</span>
                  {leaf.badge ? <MobileBadge badge={leaf.badge} counts={counts} /> : null}
                </Link>
              );
            })
          )
        : null}
    </div>
  );
}

export function AdminMobileNav({ counts, email }: { counts: BadgeCounts; email: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {open ? (
        <div className="absolute top-16 inset-x-0 bg-card border-b shadow-lg z-50">
          <div className="px-4 py-3 space-y-1 max-h-[calc(100vh-4rem)] overflow-y-auto">
            {ADMIN_NAV.map((entry) => {
              if (entry.kind === "link") {
                const active = isNavLinkActive(pathname, entry.href);
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium",
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground hover:bg-accent/60"
                    )}
                  >
                    <span>
                      {entry.label}
                      {entry.gateway ? <span aria-hidden className="ml-1 opacity-70">→</span> : null}
                    </span>
                    {entry.badge ? <MobileBadge badge={entry.badge} counts={counts} /> : null}
                  </Link>
                );
              }
              return (
                <MobileGroup
                  key={entry.label}
                  group={entry}
                  counts={counts}
                  pathname={pathname}
                  onNavigate={close}
                />
              );
            })}

            <div className="border-t pt-2 mt-2 space-y-1">
              <p className="px-3 py-1 text-xs text-muted-foreground">{email}</p>
              <Link
                href="/admin/settings"
                onClick={close}
                className="block px-3 py-2 rounded-lg text-foreground hover:bg-accent text-sm font-medium"
              >
                Settings
              </Link>
              <button
                onClick={() => {
                  close();
                  void signOut({ callbackUrl: "/login" });
                }}
                className="block w-full text-left px-3 py-2 rounded-lg text-destructive hover:bg-destructive/10 text-sm font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run it; verify it passes** — `npx jest src/__tests__/components/admin-mobile-nav.test.tsx` → PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/src/components/layout/admin-mobile-nav.tsx "src/src/__tests__/components/admin-mobile-nav.test.tsx"
git commit -m "feat(nav): mobile grouped nav — collapsed by default, active group expanded (Wave H)"
```

---

## Task 5: Approvals badge self-heal

**Files:**
- Modify: `src/src/app/(dashboard)/admin/approvals/page.tsx`

The approvals page updates its own list optimistically but does NOT refresh server components, so the layout's Approvals badge stays stale after the operator clears the queue. Add `router.refresh()` (re-renders the layout → re-runs the badge count) on respond success. No new unit test (one-line UI side-effect; covered by build gate + browser smoke).

- [ ] **Step 1: Import + instantiate the router** — add `import { useRouter } from "next/navigation";` and, inside the page component beside the other hooks, `const router = useRouter();`.

- [ ] **Step 2: Refresh after a successful respond** — in `handleAction`, immediately after the optimistic `setApprovals((prev) => ...)` block, add:

```tsx
      // Re-render the layout so the nav Approvals badge reflects the new count.
      router.refresh();
```

If `handleCounterOfferSubmit` (or any handler) issues its own `/respond` fetch instead of delegating to `handleAction`, add the same `router.refresh();` on its success path (a counter-offer moves a row out of `PENDING`).

- [ ] **Step 3: Verify + commit** — `npx tsc --noEmit` (no new errors); `npx eslint "src/app/(dashboard)/admin/approvals/page.tsx"` (clean).

```bash
git add "src/src/app/(dashboard)/admin/approvals/page.tsx"
git commit -m "fix(approvals): router.refresh() on respond so the nav badge self-heals (Wave H)"
```

---

## Task 6: Wire the layout

**Files:**
- Modify: `src/src/app/(dashboard)/layout.tsx`

No unit test (server component, excluded from jest coverage); verified by build gate + browser smoke.

- [ ] **Step 1:** After the `SignOutButton` import (line ~9), add `import { getAdminNavBadgeCounts } from "@/lib/nav/admin-nav-badges";`.
- [ ] **Step 2:** Delete the flat `navLinks` const (lines ~11–28).
- [ ] **Step 3:** After the `if (!session.user?.role || session.user.role === "COACH") { redirect("/unauthorized"); }` block, add `const counts = await getAdminNavBadgeCounts();`.
- [ ] **Step 4:** Change the usages to `<AdminNavLinks counts={counts} />` and `<AdminMobileNav counts={counts} email={session.user.email || ""} />`.
- [ ] **Step 5:** `npx tsc --noEmit` (no errors), then:

```bash
git add "src/src/app/(dashboard)/layout.tsx"
git commit -m "feat(nav): wire grouped nav + badge counts into the dashboard layout (Wave H)"
```

---

## Task 7: Gate, lint, browser smoke, whole-branch review

> **Codex #1 — exit codes must not be masked.** A `cmd | tail` pipe returns `tail`'s exit code (0), so a failed build/test reads as green. Use `set -o pipefail` (or run unpiped). Run each in a subshell so `pipefail` doesn't leak.

- [ ] **Step 1: Targeted tests (4 suites, 23 tests)**

```bash
npx jest src/__tests__/lib/admin-nav-model.test.ts \
  src/__tests__/lib/admin-nav-badges.test.ts \
  src/__tests__/components/admin-nav-links.test.tsx \
  src/__tests__/components/admin-mobile-nav.test.tsx
```
Expected: 4 suites, **23 tests**, all PASS (5 + 3 + 9 + 6).

- [ ] **Step 2: ESLint on every changed file (0 errors, 0 warnings)**

```bash
npx eslint \
  src/lib/nav/admin-nav-model.ts \
  src/lib/nav/admin-nav-badges.ts \
  src/components/layout/admin-nav-links.tsx \
  src/components/layout/admin-mobile-nav.tsx \
  "src/app/(dashboard)/admin/approvals/page.tsx" \
  "src/app/(dashboard)/layout.tsx" \
  src/__tests__/lib/admin-nav-model.test.ts \
  src/__tests__/lib/admin-nav-badges.test.ts \
  src/__tests__/components/admin-nav-links.test.tsx \
  src/__tests__/components/admin-mobile-nav.test.tsx
```

- [ ] **Step 3: Full Vercel-parity build gate — exit code MUST be honoured**

```bash
( set -o pipefail; CI=true npx next build --turbopack 2>&1 | tail -20 ) || echo "BUILD FAILED (nonzero exit)"
```
Expected: build completes AND no "BUILD FAILED" line. If "BUILD FAILED" prints, the build did not pass regardless of what the tail shows.

- [ ] **Step 4: Full suite — confirm zero NEW failures, exit code honoured**

```bash
( set -o pipefail; npm test 2>&1 | tail -25 ) || echo "JEST nonzero exit (expected if pre-existing failures exist)"
```
The new 23 tests pass; any pre-existing failures are unchanged in count + identity (do NOT `git stash` to prove this — reason about them by name/domain).

- [ ] **Step 5: Real browser smoke (Codex #5 — jsdom cannot catch this)**

Run the app (or use Playwright MCP) and verify on a real admin page:
- **Desktop 1280px:** all 7 entries fit on one row, no horizontal scroll/clip; open a group → panel overlays content (z-index correct), opening a second group closes the first; Approvals + Financials badges show.
- **Desktop 1024px (the `lg` breakpoint — the tight case):** confirm the bar does **not** clip or overflow into the right cluster. **If it clips, raise the desktop/mobile split from `lg` to `xl`** (`xl:flex` on `AdminNavLinks`, `xl:hidden` on the hamburger) and re-smoke.
- **Mobile (~390px):** hamburger opens the drawer; groups collapsed except the active one; badges render; Sign Out works.
- COACH still redirects to `/unauthorized` (log in as a coach or confirm the guard is untouched).

- [ ] **Step 6: Whole-branch adversarial review** — `review-loop` skill (or `superpowers:requesting-code-review`) against the branch diff. Address actionable findings; re-run Steps 1–5 after any fix.

---

## Task 8: SoT flush (in the PR), then PR + merge

> **Codex #2 — SoT lands in the PR, not post-merge,** so it merges atomically and the CLAUDE.md↔CHANGELOG freshness test passes on the PR's `Build` check.

- [ ] **Step 1: SoT flush commit on the feature branch**
  - Bump `CLAUDE.md` `LAST_UPDATED_ISO` / `LAST_UPDATED_SLUG` anchor + the Project-Context prose line (date = PR/merge day).
  - **Fix the stale gotcha:** replace the "Nav bar has 13 items" / "Bio" line with the Wave H ground truth (7 top-level entries: Dashboard, Workshops▾, Approvals, Assessments→, Automation▾, People▾, Financials▾; group labels menu-only; Approvals/Refunds carry pending badges; single open-group; disclosure pattern).
  - Prepend a full entry to `plans/CHANGELOG.md` (newest first, `<!-- ENTRY_ISO ... -->` anchor).

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(sot): Wave H grouped admin nav — CLAUDE.md anchor + CHANGELOG + nav-count gotcha fix"
```

- [ ] **Step 2: Push** (triggers the review-loop hook + Notion task → In progress)

```bash
git push -u origin feat/wave-h-admin-nav
```

- [ ] **Step 3: Open the PR** (`gh pr create`; merging is owner-only via the web UI). The PR diff now includes the SoT flush.
- [ ] **Step 4: Owner merges** via GitHub web UI → "Update branch" (if `main` moved) → wait for `Build` + `Migration Safety Gate` → "Squash and merge".
- [ ] **Step 5: Notion task → Done** (`notion-task` skill; assignee `gabriel@chiefaiofficer.com`).

---

## Spec-coverage self-review

- **Grouped dropdowns / menu-only labels / leaves navigate** → Task 3 (`GroupMenu` trigger is a `<button>`, leaves are `<Link>`).
- **Approvals standalone top-level + always-visible badge** → Task 1 model + Task 3 `TopLink`.
- **Single panel open at a time (keyboard-safe)** → Task 3 single `openGroup` state + the "only one group open" test.
- **Assessments gateway (→), lane untouched** → Task 1 `gateway: true`; no change to `assessments-sidebar.tsx` or lane routes.
- **Badges from existing queries; zero → no badge; fail-soft** → Task 2 (+ tests).
- **Approvals badge = PENDING only** → Task 2 query.
- **Badge freshness** → Task 5 `router.refresh()`; not-live-polled (documented).
- **Badge cost honesty** → header note: refunds count is not index-backed, no migration, acceptable at scale.
- **Mobile: grouped, collapsed by default, active group expanded** → Task 4 (+ tests).
- **a11y (disclosure):** `aria-expanded`/`aria-controls`, Esc closes + returns focus, focusout/outside-click close, visible focus ring, `aria-current`, arrow-key enhancement → Task 3. NOT `role="menu"`.
- **Overflow verified in a real browser** at 1024/1280/mobile; `lg`→`xl` fallback documented → Task 7 Step 5.
- **Validation exit codes honoured** (`set -o pipefail`) → Task 7 Steps 3–4.
- **SoT in the PR (atomic), stale gotcha fixed** → Task 8.
- **No new routes / no migration / no flag / revert-safe** → component + layout + lib + one approvals line.
- **Out of scope:** H-infra custom domain; per-item role gating.

No placeholders. Type names consistent: `BadgeCounts`, `BadgeKey`, `NavEntry`/`NavGroup`/`NavLink` (aliased `NavLinkEntry` in the desktop component), `groupLeaves`, `adminNavHrefs`, `getAdminNavBadgeCounts`.
```
