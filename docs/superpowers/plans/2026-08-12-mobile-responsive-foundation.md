# Mobile Responsive Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate full-page horizontal overflow throughout the authenticated coach and admin product while preserving every action, permission, URL, user state, and wide-screen workflow.

**Architecture:** Add one default-off, kill-switchable responsive presentation gate at the application root, then build shared page-header, data-view, action-menu, tab, dialog, and data-region contracts beneath it. Migrate coach and admin domains onto those contracts in bounded reviewable tasks; use one Playwright route inventory to prove that the document fits at compact, tablet, zoom-equivalent, and desktop widths.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Radix UI, Jest/Testing Library, Playwright 1.57, `@axe-core/playwright`.

## Global Constraints

- Compact is **320–639 px**; medium is **640–1023 px**; wide is **1024 px and above**.
- Also exercise **260 px and 300 px** effective-width probes for iPhone 11 Safari Page Zoom; these are zoom acceptance cases, not new layout breakpoints.
- At every required width, `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
- Only deliberately wide data regions may scroll horizontally, and those regions must be bounded and labeled.
- Interactive targets are at least **44 × 44 CSS pixels** unless an equivalent accessible target surrounds the visible glyph.
- No capability may disappear at a breakpoint; secondary information may collapse but must remain reachable.
- Preserve filters, sorting, pagination, selection, route/query state, unsaved drafts, validation errors, and practical focus across resize and rotation.
- Do not change APIs, database schema, authorization, role checks, mutation semantics, or URL contracts.
- Ship default-OFF behind `WAVE_MOBILE_RESPONSIVE_ENABLED`; `WAVE_MOBILE_RESPONSIVE_KILL` hard-overrides the enable flag.
- Flag OFF must preserve the current visual and behavioral output; new responsive selectors remain inert without the root gate.
- Do not hide defects with `overflow-x: hidden` or `overflow-x: clip` on `html`, `body`, an authenticated shell, or a page root.
- Preserve responsive individual reports; wide report data may keep its existing bounded inner scroller.
- Run commands from `/Users/diushianstand/Scaling-up-platform-v2/src` unless a step says otherwise.
- Before each code push, run targeted Jest tests, ESLint on changed files, `node scripts/check-migration-safety.mjs`, and `CI=true npx next build --turbopack`.

---

## File and Responsibility Map

| Area | Files | Responsibility |
| --- | --- | --- |
| Gate | `src/src/lib/mobile-responsive-flags.ts` | Default-off enable/kill resolver, read at render time |
| Root/shell | `src/src/app/layout.tsx`, `src/src/app/(dashboard)/layout.tsx`, `src/src/app/(portal)/layout.tsx`, `src/src/app/globals.css` | Root gate, authenticated width containment, compact headers, navigation and touch rules |
| Shared UI | `src/src/components/ui/page-header.tsx`, `responsive-data-view.tsx`, `responsive-actions-menu.tsx`, `table.tsx`, `tabs.tsx`, `dialog.tsx` | Reusable presentation contracts used by both roles |
| Coach workshops | portal workshop pages plus `workshop-list-filters.tsx` | Compact cards, stacked actions, contained detail data |
| Assessments | campaign list/detail/wizard, assessment sidebar/layout, template editor shell | Compact section navigation, action prioritization, wizard progress and editor reflow |
| People | `members-teams-view.tsx` and both host pages | Drill-in compact flow and minimum-width tablet split view |
| Admin collections | workshops, files, coaches, templates, surveys, workflows, registrations, financials, categories, partners, bio, contacts | Record-card compact presentation and bounded comparison tables |
| Regression harness | `src/e2e/helpers/overflow.ts`, `src/e2e/mobile-responsive-*.spec.ts` | Route inventory, overflow diagnostics, reachability, state and viewport matrix |
| Acceptance/SoT | `docs/qa/mobile-responsive-wave-1.md`, `CLAUDE.md`, `plans/CHANGELOG.md` | Physical-device evidence, launch/kill procedure and production history |

---

### Task 1: Add the Responsive Gate and Overflow Diagnostic Harness

**Files:**
- Create: `src/src/lib/mobile-responsive-flags.ts`
- Create: `src/src/__tests__/lib/mobile-responsive-flags.test.ts`
- Create: `src/e2e/helpers/overflow.ts`
- Create: `src/e2e/mobile-responsive-shell.spec.ts`
- Modify: `src/src/app/layout.tsx:1-39`
- Modify: `src/src/app/(dashboard)/layout.tsx:1-123`
- Modify: `src/src/app/(portal)/layout.tsx:1-98`
- Modify: `src/src/app/globals.css:1-225`

**Interfaces:**
- Produces: `isMobileResponsiveEnabled(): boolean`.
- Produces: `assertNoDocumentOverflow(page: Page, label: string): Promise<void>`.
- Produces: root marker `body[data-mobile-responsive="on"]` and authenticated marker `[data-auth-shell]`.
- Consumes: existing admin and coach authorization unchanged.

- [ ] **Step 1: Write the failing flag tests**

```ts
// src/src/__tests__/lib/mobile-responsive-flags.test.ts
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

const originalEnabled = process.env.WAVE_MOBILE_RESPONSIVE_ENABLED;
const originalKill = process.env.WAVE_MOBILE_RESPONSIVE_KILL;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.WAVE_MOBILE_RESPONSIVE_ENABLED;
  else process.env.WAVE_MOBILE_RESPONSIVE_ENABLED = originalEnabled;
  if (originalKill === undefined) delete process.env.WAVE_MOBILE_RESPONSIVE_KILL;
  else process.env.WAVE_MOBILE_RESPONSIVE_KILL = originalKill;
});

describe("isMobileResponsiveEnabled", () => {
  it("is off by default", () => {
    delete process.env.WAVE_MOBILE_RESPONSIVE_ENABLED;
    delete process.env.WAVE_MOBILE_RESPONSIVE_KILL;
    expect(isMobileResponsiveEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("accepts %s as enabled", (value) => {
    process.env.WAVE_MOBILE_RESPONSIVE_ENABLED = value;
    delete process.env.WAVE_MOBILE_RESPONSIVE_KILL;
    expect(isMobileResponsiveEnabled()).toBe(true);
  });

  it("lets the kill switch win", () => {
    process.env.WAVE_MOBILE_RESPONSIVE_ENABLED = "1";
    process.env.WAVE_MOBILE_RESPONSIVE_KILL = "1";
    expect(isMobileResponsiveEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the flag test and verify RED**

Run: `npx jest src/__tests__/lib/mobile-responsive-flags.test.ts --runInBand`

Expected: FAIL because `@/lib/mobile-responsive-flags` does not exist.

- [ ] **Step 3: Implement the flag resolver**

```ts
// src/src/lib/mobile-responsive-flags.ts
function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isMobileResponsiveEnabled(): boolean {
  if (isOn(process.env.WAVE_MOBILE_RESPONSIVE_KILL)) return false;
  return isOn(process.env.WAVE_MOBILE_RESPONSIVE_ENABLED);
}
```

- [ ] **Step 4: Write the overflow helper and the initial shell regression**

```ts
// src/e2e/helpers/overflow.ts
import { expect, type Page } from "@playwright/test";

type OverflowProbe = {
  viewport: number;
  documentWidth: number;
  offenders: Array<{ selector: string; left: number; right: number; width: number }>;
};

export async function assertNoDocumentOverflow(page: Page, label: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate<OverflowProbe>(() => {
    const viewport = document.documentElement.clientWidth;
    const selectorFor = (element: Element) => {
      const id = element.id ? `#${element.id}` : "";
      const classes = [...element.classList].slice(0, 3).map((name) => `.${name}`).join("");
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { selector: selectorFor(element), left: rect.left, right: rect.right, width: rect.width };
      })
      .filter((item) => item.left < -1 || item.right > viewport + 1)
      .sort((a, b) => b.width - a.width)
      .slice(0, 10);
    return {
      viewport,
      documentWidth: document.documentElement.scrollWidth,
      offenders,
    };
  });

  expect(
    result.documentWidth,
    `${label}: viewport=${result.viewport}, document=${result.documentWidth}, offenders=${JSON.stringify(result.offenders)}`,
  ).toBeLessThanOrEqual(result.viewport + 1);
}
```

```ts
// src/e2e/mobile-responsive-shell.spec.ts
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { assertNoDocumentOverflow } from "./helpers/overflow";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";
const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";

test("admin and coach shells fit a zoom-equivalent 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin|\/dashboard/ });
  await page.goto("/admin/dashboard");
  await expect(page.locator("body")).toHaveAttribute("data-mobile-responsive", "on");
  await assertNoDocumentOverflow(page, "admin dashboard at 320");

  await page.context().clearCookies();
  await loginAs(page, { email: COACH_EMAIL, password: COACH_PASSWORD, expectedUrl: /\/portal/ });
  await page.goto("/portal/home");
  await expect(page.locator("body")).toHaveAttribute("data-mobile-responsive", "on");
  await assertNoDocumentOverflow(page, "coach home at 320");
});
```

Repeat the same two shell assertions at widths 300 and 260 to model the effective viewport produced by 125% and 150% Page Zoom on an iPhone 11-sized screen. The body-marker assertion makes a stale reused development server fail immediately instead of producing misleading flag-off results.

- [ ] **Step 5: Run the shell regression and record the RED evidence**

Run: `WAVE_MOBILE_RESPONSIVE_ENABLED=1 npx playwright test e2e/mobile-responsive-shell.spec.ts --project=chromium`

Expected: FAIL on the current layout when a header/action cluster or page child widens the document; retain the printed offenders in the task notes.

- [ ] **Step 6: Activate the root gate and make both shells width-safe**

In `src/src/app/layout.tsx`, import `isMobileResponsiveEnabled`, evaluate it inside `RootLayout`, and set only the gated marker:

```tsx
const mobileResponsiveEnabled = isMobileResponsiveEnabled();

<body
  data-mobile-responsive={mobileResponsiveEnabled ? "on" : undefined}
  className={`${plusJakarta.variable} ${geistMono.variable} antialiased`}
>
```

Add `data-auth-shell="admin"` and `data-auth-shell="coach"` only when `mobileResponsiveEnabled` is true. Apply any new shell utility classes with `cn(existingClasses, mobileResponsiveEnabled && "min-w-0 max-w-full")`; when false, render the exact current class string and DOM attributes. Under 640 px, keep only hamburger, wordmark, and theme control in the sticky header; account/settings/sign-out remain in the existing drawers.

Add scoped rules—never a document-level overflow clip—to `globals.css`:

```css
body[data-mobile-responsive="on"] [data-auth-shell] {
  min-width: 0;
  max-width: 100%;
}

body[data-mobile-responsive="on"] [data-auth-shell] main,
body[data-mobile-responsive="on"] [data-auth-shell] [data-responsive-container] {
  min-width: 0;
  max-width: 100%;
}

@media (max-width: 639px) {
  body[data-mobile-responsive="on"] [data-auth-shell] main {
    padding-inline: 1rem;
  }

  body[data-mobile-responsive="on"] [data-auth-shell] header [data-compact-hide] {
    display: none;
  }
}
```

Verify the generated `<meta name="viewport">` has `width=device-width` and an initial scale of `1` in the Playwright test; do not disable user scaling or cap maximum scale.

- [ ] **Step 7: Run GREEN checks**

Run:

```bash
npx jest src/__tests__/lib/mobile-responsive-flags.test.ts --runInBand
WAVE_MOBILE_RESPONSIVE_ENABLED=1 npx playwright test e2e/mobile-responsive-shell.spec.ts --project=chromium
npx eslint src/src/lib/mobile-responsive-flags.ts src/src/app/layout.tsx 'src/src/app/(dashboard)/layout.tsx' 'src/src/app/(portal)/layout.tsx' src/e2e/helpers/overflow.ts src/e2e/mobile-responsive-shell.spec.ts
```

Expected: all PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/src/lib/mobile-responsive-flags.ts src/src/__tests__/lib/mobile-responsive-flags.test.ts src/e2e/helpers/overflow.ts src/e2e/mobile-responsive-shell.spec.ts src/src/app/layout.tsx 'src/src/app/(dashboard)/layout.tsx' 'src/src/app/(portal)/layout.tsx' src/src/app/globals.css
git commit -m "feat: add gated responsive shell foundation"
```

---

### Task 2: Build Shared Responsive UI Primitives

**Files:**
- Create: `src/src/components/ui/responsive-data-view.tsx`
- Create: `src/src/components/ui/responsive-actions-menu.tsx`
- Create: `src/src/__tests__/components/ui/responsive-data-view.test.tsx`
- Create: `src/src/__tests__/components/ui/responsive-actions-menu.test.tsx`
- Modify: `src/src/components/ui/page-header.tsx:1-35`
- Modify: `src/src/components/ui/table.tsx:1-57`
- Modify: `src/src/components/ui/tabs.tsx:21-75`
- Modify: `src/src/components/ui/dialog.tsx:28-63`
- Modify: `src/src/app/globals.css`

**Interfaces:**
- Produces: `ResponsiveDataView({ enabled, label, compact, wide, wideFrom })`.
- Produces: `ResponsiveActionsMenu({ label, children })` using Radix Dropdown Menu.
- Produces: `Table` props `regionLabel?: string` and `containerClassName?: string`.
- Produces: optional `responsiveEnabled?: boolean` on `PageHeader`, `Table`, `TabsList`, and `DialogContent`; responsive data hooks render only when that prop is true.
- Consumes: `body[data-mobile-responsive="on"]` from Task 1.

- [ ] **Step 1: Write failing primitive tests**

```tsx
// src/src/__tests__/components/ui/responsive-data-view.test.tsx
import { render, screen } from "@testing-library/react";
import { ResponsiveDataView } from "@/components/ui/responsive-data-view";

it("renders only the existing wide view when the gate is off", () => {
  render(<ResponsiveDataView enabled={false} label="Workshops" compact={<p>Cards</p>} wide={<p>Table</p>} />);
  expect(screen.getByText("Table")).toBeInTheDocument();
  expect(screen.queryByText("Cards")).not.toBeInTheDocument();
});

it("renders labeled compact and wide presenters when enabled", () => {
  render(<ResponsiveDataView enabled label="Workshops" compact={<p>Cards</p>} wide={<p>Table</p>} wideFrom="lg" />);
  expect(screen.getByRole("list", { name: "Workshops" })).toHaveClass("lg:hidden");
  expect(screen.getByTestId("responsive-wide-view")).toHaveClass("hidden", "lg:block");
});
```

```tsx
// src/src/__tests__/components/ui/responsive-actions-menu.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { ResponsiveActionsItem, ResponsiveActionsMenu } from "@/components/ui/responsive-actions-menu";

it("exposes secondary actions from a 44px labeled trigger", () => {
  render(
    <ResponsiveActionsMenu label="More workshop actions">
      <ResponsiveActionsItem asChild><button>Edit workshop</button></ResponsiveActionsItem>
    </ResponsiveActionsMenu>,
  );
  const trigger = screen.getByRole("button", { name: "More workshop actions" });
  expect(trigger).toHaveClass("min-h-11", "min-w-11");
  fireEvent.click(trigger);
  expect(screen.getByRole("button", { name: "Edit workshop" })).toBeVisible();
});
```

- [ ] **Step 2: Run the primitive tests and verify RED**

Run: `npx jest src/__tests__/components/ui/responsive-data-view.test.tsx src/__tests__/components/ui/responsive-actions-menu.test.tsx --runInBand`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement `ResponsiveDataView`**

```tsx
// src/src/components/ui/responsive-data-view.tsx
import type { ReactNode } from "react";

const visibility = {
  sm: { compact: "sm:hidden", wide: "hidden sm:block" },
  md: { compact: "md:hidden", wide: "hidden md:block" },
  lg: { compact: "lg:hidden", wide: "hidden lg:block" },
} as const;

export interface ResponsiveDataViewProps {
  enabled: boolean;
  label: string;
  compact: ReactNode;
  wide: ReactNode;
  wideFrom?: keyof typeof visibility;
}

export function ResponsiveDataView({ enabled, label, compact, wide, wideFrom = "md" }: ResponsiveDataViewProps) {
  if (!enabled) return <>{wide}</>;
  const classes = visibility[wideFrom];
  return (
    <>
      <div role="list" aria-label={label} className={classes.compact}>{compact}</div>
      <div data-testid="responsive-wide-view" className={classes.wide}>{wide}</div>
    </>
  );
}
```

- [ ] **Step 4: Implement the accessible action menu**

Use `@radix-ui/react-dropdown-menu` directly so focus, Escape, outside click, and menu semantics are supplied by the existing dependency:

```tsx
// src/src/components/ui/responsive-actions-menu.tsx
"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

export function ResponsiveActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={label}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-card text-foreground"
      >
        <MoreHorizontal aria-hidden className="h-5 w-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-lg border border-border bg-card p-1 shadow-lg">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export const ResponsiveActionsItem = DropdownMenu.Item;
```

- [ ] **Step 5: Upgrade the existing primitives without changing their flag-off styling**

- Add `responsiveEnabled = false` to `PageHeader`; render `data-responsive-page-header` on the root and `data-responsive-actions` on its action wrapper only when true. Preserve the current class strings and attributes when false.
- Extend `Table` with a labeled, keyboard-focusable scroll region:

```tsx
interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  regionLabel?: string;
  containerClassName?: string;
  responsiveEnabled?: boolean;
}

<div
  role={regionLabel ? "region" : undefined}
  aria-label={regionLabel}
  tabIndex={regionLabel ? 0 : undefined}
  data-responsive-data-region={responsiveEnabled ? "" : undefined}
  className={cn("relative w-full max-w-full overflow-auto rounded-lg border", containerClassName)}
>
```

- Add `responsiveEnabled = false` to `TabsList`; only when true, render `data-responsive-tabs` and its supplied `aria-label="Scrollable sections"`.
- Add `responsiveEnabled = false` to `DialogContent`; only when true, render `data-responsive-dialog` and append `max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto`.
- Only when `DialogContent.responsiveEnabled` is true, append `min-h-11 min-w-11 inline-flex items-center justify-center` to the dialog close target.
- Add scoped compact rules:

```css
@media (max-width: 639px) {
  body[data-mobile-responsive="on"] [data-responsive-page-header] {
    align-items: stretch;
    gap: 1rem;
  }

  body[data-mobile-responsive="on"] [data-responsive-actions] {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    width: 100%;
  }

  body[data-mobile-responsive="on"] [data-responsive-tabs] {
    scroll-padding-inline: 1rem;
    overscroll-behavior-inline: contain;
  }

  body[data-mobile-responsive="on"] [data-touch-target] {
    min-height: 44px;
    min-width: 44px;
  }
}
```

- [ ] **Step 6: Run shared-component GREEN checks**

Run:

```bash
npx jest src/__tests__/components/ui/responsive-data-view.test.tsx src/__tests__/components/ui/responsive-actions-menu.test.tsx src/__tests__/components/admin-mobile-nav.test.tsx src/__tests__/components/nav/assessments-sidebar.test.tsx --runInBand
npx eslint src/src/components/ui/responsive-data-view.tsx src/src/components/ui/responsive-actions-menu.tsx src/src/components/ui/page-header.tsx src/src/components/ui/table.tsx src/src/components/ui/tabs.tsx src/src/components/ui/dialog.tsx
```

Expected: all PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/src/components/ui/responsive-data-view.tsx src/src/components/ui/responsive-actions-menu.tsx src/src/components/ui/page-header.tsx src/src/components/ui/table.tsx src/src/components/ui/tabs.tsx src/src/components/ui/dialog.tsx src/src/app/globals.css src/src/__tests__/components/ui
git commit -m "feat: add shared responsive UI primitives"
```

---

### Task 3: Migrate Coach Workshop and Home Surfaces

**Files:**
- Create: `src/src/__tests__/components/workshops/portal-workshop-list-responsive.test.tsx`
- Modify: `src/src/app/(portal)/portal/home/page.tsx:65-193`
- Modify: `src/src/app/(portal)/portal/workshops/page.tsx:1-78`
- Modify: `src/src/components/workshops/workshop-list-filters.tsx:29-262`
- Modify: `src/src/app/(portal)/portal/workshops/[id]/page.tsx:190-535`
- Modify: `src/src/app/(portal)/portal/workshops/[id]/surveys/page.tsx`
- Modify: `src/src/app/(portal)/portal/registrations/page.tsx`
- Modify: `src/src/app/(portal)/portal/registrations/registrations-client.tsx`
- Modify: `src/src/app/(portal)/portal/follow-up/page.tsx`
- Modify: `src/src/app/(portal)/portal/templates/page.tsx`
- Modify: `src/src/app/(portal)/portal/coach/resources/page.tsx`
- Modify: `src/src/app/(portal)/portal/settings/page.tsx:1-120`
- Modify: `src/src/app/(portal)/portal/request/page.tsx:1-62`
- Modify: `src/src/app/(dashboard)/workshops/new/page.tsx:850-1160`
- Create: `src/e2e/mobile-responsive-coach.spec.ts`
- Test: `src/e2e/mobile-responsive-shell.spec.ts`

**Interfaces:**
- Consumes: `isMobileResponsiveEnabled`, `PageHeader`, `ResponsiveDataView`, `ResponsiveActionsMenu`.
- Produces: `PortalWorkshopListProps.responsiveEnabled?: boolean`.
- Preserves: current client-side search and status-filter state.

- [ ] **Step 1: Write the failing workshop-card test**

Create a fixture with a long title, a counter-offer, a landing URL, registration counts, and price. Render with `responsiveEnabled` both false and true. Assert:

```tsx
const { rerender } = render(<PortalWorkshopList workshops={[fixture]} responsiveEnabled />);
const cards = screen.getByRole("list", { name: "Workshops" });
expect(within(cards).getByText(fixture.title)).toBeInTheDocument();
expect(within(cards).getByText("24 of 40 max")).toBeInTheDocument();
expect(within(cards).getByText(/counter-offer/i)).toBeInTheDocument();
expect(within(cards).getByRole("link", { name: /manage workshop/i })).toHaveAttribute("href", `/portal/workshops/${fixture.id}`);

rerender(<PortalWorkshopList workshops={[fixture]} responsiveEnabled={false} />);
expect(screen.queryByRole("list", { name: "Workshops" })).not.toBeInTheDocument();
expect(screen.getByRole("table")).toBeInTheDocument();
```

Create `mobile-responsive-coach.spec.ts`, log in once per test, and add the first route set: `/portal/home`, `/portal/workshops`, `/portal/request`, `/portal/settings`, plus a discovered populated `/portal/workshops/{id}`. At widths 320 and 390, call `assertNoDocumentOverflow` for each route. Require discovery of the detail link instead of silently skipping it.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx jest src/__tests__/components/workshops/portal-workshop-list-responsive.test.tsx --runInBand
WAVE_MOBILE_RESPONSIVE_ENABLED=1 npx playwright test e2e/mobile-responsive-coach.spec.ts --project=chromium
```

Expected: FAIL because `responsiveEnabled` and the compact list do not exist.

- [ ] **Step 3: Add the compact workshop presenter**

Keep the current table byte-for-byte as the `wide` slot. Add a compact card for each filtered workshop with this fixed information order:

```tsx
<article role="listitem" className="rounded-xl border border-border bg-card p-4">
  <div className="flex min-w-0 items-start justify-between gap-3">
    <div className="min-w-0">
      <Link href={`/portal/workshops/${workshop.id}`} className="font-semibold text-primary break-words">
        {workshop.title}
      </Link>
      <p className="text-sm text-muted-foreground">{formatEventDateUTC(workshop.eventDate)}</p>
    </div>
    <StatusPill status={workshop.status} />
  </div>
  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
    <div><dt className="text-muted-foreground">Registrations</dt><dd>{workshop._count.registrations} of {workshop.maxAttendees} max</dd></div>
    <div><dt className="text-muted-foreground">Format</dt><dd>{workshop.workshopType?.name ?? "—"}</dd></div>
  </dl>
  <Link data-touch-target href={`/portal/workshops/${workshop.id}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-primary-foreground">
    Manage workshop
  </Link>
</article>
```

Render it through `ResponsiveDataView` with `wideFrom="lg"`. Stack the search/filter/clear controls below 640 px and preserve the existing `search`, `statusFilter`, and `showFilters` states.

- [ ] **Step 4: Migrate coach headers, detail actions, and dense sections**

- Replace direct `justify-between` page headers on home and workshops with `PageHeader`.
- Keep one primary action visible: `Request New` on workshops and the current next action on home warning cards.
- In workshop detail, make the heading/status/action area `flex-col sm:flex-row`; allow long title, email, URL, and file names to break; label the registrations table region.
- Stack settings key/value rows below 640 px.
- In `NewWorkshopForm`, change fixed three/six-column grids to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` and stack footer actions on compact widths.
- Stack registration, follow-up, template, resource, and workshop-survey page headers/filters before 640 px; retain their current list/table data inside `ResponsiveDataView` or a labeled data region. Keep registration attendance/unregister mutations and follow-up form state unchanged.
- Evaluate `isMobileResponsiveEnabled()` in each server host and pass the boolean only into components that render an alternate compact DOM.

- [ ] **Step 5: Run coach-route regressions**

Run:

```bash
npx jest src/__tests__/components/workshops/portal-workshop-list-responsive.test.tsx src/__tests__/components/workshop-list-filters.test.tsx src/__tests__/components/new-workshop-format-default.test.tsx --runInBand
WAVE_MOBILE_RESPONSIVE_ENABLED=1 npx playwright test e2e/mobile-responsive-shell.spec.ts e2e/mobile-responsive-coach.spec.ts --project=chromium
npx eslint 'src/src/app/(portal)/portal/home/page.tsx' 'src/src/app/(portal)/portal/workshops/page.tsx' src/src/components/workshops/workshop-list-filters.tsx 'src/src/app/(portal)/portal/workshops/[id]/page.tsx' 'src/src/app/(portal)/portal/workshops/[id]/surveys/page.tsx' 'src/src/app/(portal)/portal/registrations/page.tsx' 'src/src/app/(portal)/portal/registrations/registrations-client.tsx' 'src/src/app/(portal)/portal/follow-up/page.tsx' 'src/src/app/(portal)/portal/templates/page.tsx' 'src/src/app/(portal)/portal/coach/resources/page.tsx' 'src/src/app/(portal)/portal/settings/page.tsx' 'src/src/app/(portal)/portal/request/page.tsx' 'src/src/app/(dashboard)/workshops/new/page.tsx'
```

Expected: all PASS; workshop list, detail, settings, request form, and home fit at 320 and 390 px.

- [ ] **Step 6: Commit Task 3**

```bash
git add 'src/src/app/(portal)/portal/home/page.tsx' 'src/src/app/(portal)/portal/workshops/page.tsx' 'src/src/app/(portal)/portal/workshops/[id]/page.tsx' 'src/src/app/(portal)/portal/workshops/[id]/surveys/page.tsx' 'src/src/app/(portal)/portal/registrations/page.tsx' 'src/src/app/(portal)/portal/registrations/registrations-client.tsx' 'src/src/app/(portal)/portal/follow-up/page.tsx' 'src/src/app/(portal)/portal/templates/page.tsx' 'src/src/app/(portal)/portal/coach/resources/page.tsx' 'src/src/app/(portal)/portal/settings/page.tsx' 'src/src/app/(portal)/portal/request/page.tsx' 'src/src/app/(dashboard)/workshops/new/page.tsx' src/src/components/workshops/workshop-list-filters.tsx src/src/__tests__/components/workshops/portal-workshop-list-responsive.test.tsx src/e2e/mobile-responsive-coach.spec.ts
git commit -m "feat: make coach workshop surfaces responsive"
```

---

### Task 4: Migrate Coach and Admin Campaign Workflows

**Files:**
- Modify: `src/src/app/(portal)/portal/assessments/page.tsx:100-190`
- Modify: `src/src/app/(portal)/portal/assessments/new/page.tsx:1-55`
- Modify: `src/src/app/(portal)/portal/assessments/[id]/page.tsx:160-195`
- Modify: `src/src/app/(portal)/portal/assessments/public-leads/page.tsx`
- Modify: `src/src/app/(portal)/portal/assessments/trends/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/campaigns/page.tsx:65-90`
- Modify: `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx:100-130`
- Modify: `src/src/components/assessments/CampaignsListWithFilter.tsx:60-272`
- Modify: `src/src/components/assessments/CampaignDetail.tsx:1023-1950`
- Modify: `src/src/components/assessments/CampaignWizard.tsx:190-240,832-930,2039-2340`
- Modify: `src/src/styles/wireframes-scoped.css:400-500`
- Test: `src/src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx`
- Test: `src/src/__tests__/components/assessments/campaign-detail-delete.test.tsx`
- Test: `src/src/__tests__/components/assessments/campaign-wizard-d1.test.tsx`
- Modify: `src/e2e/mobile-responsive-coach.spec.ts`

**Interfaces:**
- Produces: optional `responsiveEnabled?: boolean` on `CampaignDetail` and `CampaignWizard`.
- Preserves: campaign draft state, selected organization/template/respondents, scheduling fields, query paths and admin/coach host behavior.

- [ ] **Step 1: Add failing responsive workflow tests**

Add assertions to the existing suites:

```tsx
expect(screen.getByTestId("campaign-step-summary")).toHaveTextContent("Step 1 of 5");
expect(screen.getByTestId("campaign-step-summary")).toHaveTextContent("Organization");
```

For campaign detail, render with `responsiveEnabled` and assert that `View group report` remains the primary visible action, while `View Trends`, `Close campaign`, and `Delete campaign` are reachable through a button named `More campaign actions`. Assert that delete still opens the existing confirmation dialog.

For campaign cards, assert long campaign/company names use `min-w-0` and `break-words`, and every status filter has the `data-touch-target` hook.

Extend `mobile-responsive-coach.spec.ts` before implementing the fix: add `/portal/assessments`, `/portal/assessments/new`, and a required discovered `/portal/assessments/{id}` at 320 and 390 px. This is the browser-level RED for the actual production-shaped workflow.

- [ ] **Step 2: Run the campaign tests and verify RED**

Run:

```bash
npx jest src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx src/__tests__/components/assessments/campaign-detail-delete.test.tsx src/__tests__/components/assessments/campaign-wizard-d1.test.tsx --runInBand
```

Expected: FAIL on missing compact progress and action-menu behavior.

- [ ] **Step 3: Implement compact campaign list and detail priorities**

- Keep campaign identity, status, open date, core metrics, and `View` visible.
- Add `min-w-0`, `break-words`, and compact grid changes without changing filter logic.
- In `CampaignDetail`, use `ResponsiveActionsMenu` only when `responsiveEnabled`; pass the existing buttons/links into its content so their handlers and confirmation dialogs remain unchanged.
- Stack overview identity/status and all editable date controls below 640 px.
- Convert participant rows to cards below 640 px; retain the table in a labeled region at wider widths.

- [ ] **Step 4: Implement compact wizard progress and action stacking**

When `responsiveEnabled` is false, keep the current `<ol className="wf-stepper">` output. When true, render both modes:

```tsx
<div data-testid="campaign-step-summary" className="sm:hidden" aria-live="polite">
  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
    Step {current + 1} of {steps.length}
  </p>
  <p className="mt-1 text-base font-semibold text-foreground">{steps[current]?.title}</p>
</div>
<ol className="wf-stepper hidden sm:flex">
  {steps.map((step) => {
    const done = current > step.id;
    const active = current === step.id;
    return (
      <li
        key={step.id}
        className={`wf-stepper-item${active ? " is-active" : ""}${done ? " is-done" : ""}`}
      >
        <div className="wf-stepper-circle">
          {done ? <Check className="h-4 w-4" /> : step.id + 1}
        </div>
        <span className="wf-stepper-label">{step.title}</span>
      </li>
    );
  })}
</ol>
```

Change the step card to `p-4 sm:p-6`, stack all back/next/save/activate footers below 640 px, and make the primary next/activate action full width on compact. Preserve the draft object and the existing step indexes.

- [ ] **Step 5: Run GREEN checks**

Run:

```bash
npx jest src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx src/__tests__/components/assessments/campaign-detail-delete.test.tsx src/__tests__/components/assessments/campaign-wizard-d1.test.tsx src/__tests__/components/assessments/campaign-wizard-timing.test.tsx --runInBand
npx playwright test e2e/mobile-responsive-coach.spec.ts --project=chromium
npx eslint src/src/components/assessments/CampaignsListWithFilter.tsx src/src/components/assessments/CampaignDetail.tsx src/src/components/assessments/CampaignWizard.tsx 'src/src/app/(portal)/portal/assessments/page.tsx' 'src/src/app/(portal)/portal/assessments/new/page.tsx' 'src/src/app/(portal)/portal/assessments/[id]/page.tsx' 'src/src/app/(portal)/portal/assessments/public-leads/page.tsx' 'src/src/app/(portal)/portal/assessments/trends/page.tsx' 'src/src/app/(dashboard)/admin/assessments/campaigns/page.tsx' 'src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx'
```

Expected: all PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/src/components/assessments/CampaignsListWithFilter.tsx src/src/components/assessments/CampaignDetail.tsx src/src/components/assessments/CampaignWizard.tsx src/src/styles/wireframes-scoped.css 'src/src/app/(portal)/portal/assessments/page.tsx' 'src/src/app/(portal)/portal/assessments/new/page.tsx' 'src/src/app/(portal)/portal/assessments/[id]/page.tsx' 'src/src/app/(portal)/portal/assessments/public-leads/page.tsx' 'src/src/app/(portal)/portal/assessments/trends/page.tsx' 'src/src/app/(dashboard)/admin/assessments/campaigns/page.tsx' 'src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx' src/src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx src/src/__tests__/components/assessments/campaign-detail-delete.test.tsx src/src/__tests__/components/assessments/campaign-wizard-d1.test.tsx src/e2e/mobile-responsive-coach.spec.ts
git commit -m "feat: reflow campaign workflows on compact screens"
```

---

### Task 5: Convert Organization and Member Management to Adaptive Drill-In

**Files:**
- Modify: `src/src/components/organizations/members-teams-view.tsx:85-1026`
- Modify: `src/src/app/(portal)/portal/members/page.tsx:1-55`
- Modify: `src/src/app/(portal)/portal/members/import/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/organizations/page.tsx:1-90`
- Modify: `src/src/__tests__/components/organizations/members-teams-view.test.tsx`
- Modify: `src/src/__tests__/app/admin-organizations-page.test.tsx`

**Interfaces:**
- Produces: `MembersTeamsViewProps.responsiveEnabled?: boolean`.
- Produces: presentation-only `compactDetailOpen: boolean`; the selected domain record remains exclusively in existing `selectedNode`.
- Preserves: loaded team trees, selected node, member fetch results, grouping mode, modal state, and retry behavior.

- [ ] **Step 1: Write failing drill-in and state-preservation tests**

Add these flows to `members-teams-view.test.tsx`:

```tsx
render(<MembersTeamsView initialOrganizations={[ORG_1]} responsiveEnabled />);
expect(screen.getByTestId("members-browse-panel")).toBeVisible();
expect(screen.getByTestId("members-detail-panel")).toHaveClass("hidden", "md:block");

mockFetchForOrg1Teams();
mockFetchRespondents([RESPONDENT_ALICE]);
fireEvent.click(screen.getByRole("button", { name: /^Acme Corp$/i }));
await screen.findByText("Alice Smith");
expect(screen.getByTestId("members-browse-panel")).toHaveClass("hidden", "md:block");
expect(screen.getByRole("button", { name: /back to organizations/i })).toBeVisible();

fireEvent.click(screen.getByRole("button", { name: /back to organizations/i }));
expect(screen.getByRole("button", { name: /^Acme Corp$/i })).toHaveAttribute("aria-pressed", "true");
expect(global.fetch).toHaveBeenCalledTimes(2);
```

Also assert the compact member presenter includes name, email, level, and an always-reachable `Edit Alice Smith` target.

- [ ] **Step 2: Run the member tests and verify RED**

Run: `npx jest src/__tests__/components/organizations/members-teams-view.test.tsx src/__tests__/app/admin-organizations-page.test.tsx --runInBand`

Expected: FAIL because responsive panel props/hooks and back navigation are missing.

- [ ] **Step 3: Implement one selection model with two presentations**

- Add `responsiveEnabled = false` to props.
- Do not add a second selected-node state. `compactDetailOpen` controls only which pane is visible below 768 px; `selectedNode` remains the single source of selected domain data.
- Mark left and right roots with `data-testid="members-browse-panel"` and `data-testid="members-detail-panel"`.
- Under the gate, use `hidden md:block`/`block` visibility so compact drills in and medium/wide can render both panes.
- Add a compact-only `Back to organizations` button that does not clear cached `orgStates` or `members`; it changes only the presented panel. Keep `selectedNode` so returning to detail does not refetch.
- At 768 px and above use `grid-cols-[minmax(16rem,35%)_minmax(0,65%)]`; below it use one column.
- Present members as cards below 640 px and the current table in a labeled region above 640 px.
- Replace hover-only edit affordances with focusable 44 px targets that remain visible on touch widths.

Use a presentation-only boolean separate from the domain selection:

```tsx
const [compactDetailOpen, setCompactDetailOpen] = useState(false);

function showCompactDetail() {
  setCompactDetailOpen(true);
}

<div className={responsiveEnabled ? "grid min-h-[500px] min-w-0 overflow-hidden rounded-xl border border-border bg-card md:grid-cols-[minmax(16rem,35%)_minmax(0,65%)]" : "flex h-full min-h-[500px] rounded-xl border border-border bg-card overflow-hidden"}>
  <div data-testid="members-browse-panel" className={responsiveEnabled && compactDetailOpen ? "hidden min-w-0 md:block" : "min-w-0"}>
    {renderLeftPanel()}
  </div>
  <div data-testid="members-detail-panel" className={responsiveEnabled && !compactDetailOpen ? "hidden min-w-0 md:block" : "min-w-0"}>
    {responsiveEnabled && <button type="button" data-touch-target className="min-h-11 px-3 md:hidden" onClick={() => setCompactDetailOpen(false)}>Back to organizations</button>}
    {renderRightPanel()}
  </div>
</div>
```

At the end of each existing successful organization/team/unassigned selection handler, call `showCompactDetail()`. Do not add or reorder any fetch; the current handlers remain the sole owners of cached team/member records and API calls.

- [ ] **Step 4: Pass the gate from both host pages and run GREEN checks**

Run:

```bash
npx jest src/__tests__/components/organizations/members-teams-view.test.tsx src/__tests__/app/admin-organizations-page.test.tsx --runInBand
npx eslint src/src/components/organizations/members-teams-view.tsx 'src/src/app/(portal)/portal/members/page.tsx' 'src/src/app/(portal)/portal/members/import/page.tsx' 'src/src/app/(dashboard)/admin/assessments/organizations/page.tsx'
```

Expected: all PASS; no extra fetch occurs after compact back/forward presentation changes.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/src/components/organizations/members-teams-view.tsx 'src/src/app/(portal)/portal/members/page.tsx' 'src/src/app/(portal)/portal/members/import/page.tsx' 'src/src/app/(dashboard)/admin/assessments/organizations/page.tsx' src/src/__tests__/components/organizations/members-teams-view.test.tsx src/src/__tests__/app/admin-organizations-page.test.tsx
git commit -m "feat: add responsive member management drill-in"
```

---

### Task 6: Migrate Admin Workshop and File Collections

**Files:**
- Create: `src/src/components/workshops/admin-workshop-record-card.tsx`
- Create: `src/src/__tests__/components/workshops/admin-workshop-record-card.test.tsx`
- Create: `src/src/components/files/file-record-card.tsx`
- Create: `src/src/__tests__/components/files/file-record-card.test.tsx`
- Modify: `src/src/app/(dashboard)/admin/dashboard/page.tsx:138-230`
- Modify: `src/src/app/(dashboard)/workshops/page.tsx:219-425`
- Modify: `src/src/app/(dashboard)/workshops/[id]/page.tsx:140-575`
- Modify: `src/src/app/(dashboard)/admin/files/page.tsx:35-66`
- Modify: `src/src/components/files/file-manager.tsx:208-504`
- Modify: `src/src/components/workshops/admin-workshop-filters.tsx:1-90`
- Modify: `src/src/app/(dashboard)/workshops/[id]/surveys/page.tsx`
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/page.tsx`
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx`
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/duo-landing/page.tsx`
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/registration/page.tsx`
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/thank-you/page.tsx`
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/bio-page/page.tsx`
- Create: `src/e2e/mobile-responsive-admin.spec.ts`

**Interfaces:**
- Produces: `AdminWorkshopRecordCard` with the same links/actions as one current table row.
- Produces: `FileRecordCard` with download and confirmed delete actions.
- Produces: `FileManagerProps.responsiveEnabled?: boolean`.
- Consumes: `ResponsiveDataView`, `ResponsiveActionsMenu`, `PageHeader`.

- [ ] **Step 1: Write failing record-card tests**

For `AdminWorkshopRecordCard`, assert title, coach, start date/time, status, registrations, cost, landing-page state, detail link, and approval/edit action are all rendered. For `FileRecordCard`, assert filename, size, category/workshop, uploader/date, download, and delete remain reachable. Trigger delete and assert the existing confirmation path is used rather than deleting immediately.

```tsx
expect(screen.getByRole("link", { name: workshop.title })).toHaveAttribute("href", `/workshops/${workshop.id}`);
expect(screen.getByText(`${workshop._count.registrations} / ${workshop.maxAttendees}`)).toBeInTheDocument();
expect(screen.getByRole("button", { name: /more workshop actions/i })).toHaveClass("min-h-11");
```

Create `mobile-responsive-admin.spec.ts` with `/admin/dashboard`, `/workshops`, `/admin/files`, and a required discovered `/workshops/{id}` at widths 320 and 390. Call `assertNoDocumentOverflow` on each route before implementation.

- [ ] **Step 2: Run the card tests and verify RED**

Run:

```bash
npx jest src/__tests__/components/workshops/admin-workshop-record-card.test.tsx src/__tests__/components/files/file-record-card.test.tsx --runInBand
WAVE_MOBILE_RESPONSIVE_ENABLED=1 npx playwright test e2e/mobile-responsive-admin.spec.ts --project=chromium
```

Expected: FAIL because both card components are missing.

- [ ] **Step 3: Implement and integrate admin workshop cards**

Move only row-presentation formatting into `AdminWorkshopRecordCard`; keep querying, sorting, filtering, pagination URL construction, and mutation handlers in their current owners. Use `ResponsiveDataView wideFrom="lg"`. Stack pagination into count, page actions, then rows-per-page at compact widths; every page link gets a 44 px target.

Convert dashboard header actions to `PageHeader`; compact stats use one column at 320 px and two columns from 400 px only when their labels fit. In workshop detail, stack title/status/actions, make stats `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, and label the registration table region.

For workshop surveys and every landing-page editor, replace fixed five-column editor/preview grids with `grid-cols-1 xl:grid-cols-5`; editor and preview both receive `min-w-0`, and preview stacks below the form under 1024 px. Stack template selectors and save/preview actions below 640 px without changing their save endpoints or live-preview state.

- [ ] **Step 4: Implement and integrate file cards**

Keep the upload form one column below 640 px, two columns from 640 px, and four columns only at 1024 px. Constrain native file-input text with `min-w-0 max-w-full`. Render `FileRecordCard` below 768 px and the current table above it. Keep upload, download, filter, success, error, deleting, and confirmation state inside `FileManager`.

- [ ] **Step 5: Run GREEN checks**

Run:

```bash
npx jest src/__tests__/components/workshops/admin-workshop-record-card.test.tsx src/__tests__/components/files/file-record-card.test.tsx src/__tests__/admin/workshops-list-columns.test.ts --runInBand
npx playwright test e2e/mobile-responsive-admin.spec.ts --project=chromium
npx eslint src/src/components/workshops/admin-workshop-record-card.tsx src/src/components/files/file-record-card.tsx src/src/components/files/file-manager.tsx src/src/components/workshops/admin-workshop-filters.tsx 'src/src/app/(dashboard)/admin/dashboard/page.tsx' 'src/src/app/(dashboard)/workshops/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/surveys/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/duo-landing/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/registration/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/thank-you/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/bio-page/page.tsx' 'src/src/app/(dashboard)/admin/files/page.tsx'
```

Expected: all PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/src/components/workshops/admin-workshop-record-card.tsx src/src/components/workshops/admin-workshop-filters.tsx src/src/components/files/file-record-card.tsx src/src/components/files/file-manager.tsx 'src/src/app/(dashboard)/admin/dashboard/page.tsx' 'src/src/app/(dashboard)/admin/files/page.tsx' 'src/src/app/(dashboard)/workshops/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/surveys/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/duo-landing/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/registration/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/thank-you/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/bio-page/page.tsx' src/src/__tests__/components/workshops/admin-workshop-record-card.test.tsx src/src/__tests__/components/files/file-record-card.test.tsx src/e2e/mobile-responsive-admin.spec.ts
git commit -m "feat: make admin workshops and files responsive"
```

---

### Task 7: Migrate Remaining Admin Collections

**Files:**
- Create: `src/src/components/ui/responsive-record.tsx`
- Create: `src/src/__tests__/components/ui/responsive-record.test.tsx`
- Modify: `src/src/app/(dashboard)/coaches/page.tsx`
- Modify: `src/src/app/(dashboard)/coaches/[id]/page.tsx`
- Modify: `src/src/app/(dashboard)/coaches/[id]/edit/page.tsx`
- Modify: `src/src/app/(dashboard)/coaches/new/page.tsx`
- Modify: `src/src/app/(dashboard)/contacts/page.tsx`
- Modify: `src/src/components/contacts/contacts-table.tsx`
- Modify: `src/src/app/(dashboard)/partners/page.tsx`
- Modify: `src/src/app/(dashboard)/templates/page.tsx`
- Modify: `src/src/app/(dashboard)/templates/[id]/edit/page.tsx`
- Modify: `src/src/app/(dashboard)/templates/new/page.tsx`
- Modify: `src/src/app/(dashboard)/templates/new/create-template-form.tsx`
- Modify: `src/src/app/(dashboard)/bio/page.tsx`
- Modify: `src/src/app/(dashboard)/bio/[id]/page.tsx`
- Modify: `src/src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/approvals/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/categories/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/pricing/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/financials/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/registrations/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/registrations/registrations-table.tsx`
- Modify: `src/src/app/(dashboard)/admin/refunds-needed/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/settings/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/transactional-emails/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/transactional-emails/[type]/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/transactional-emails/[type]/editor.tsx`
- Modify: `src/src/app/(dashboard)/admin/surveys/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/surveys/aggregate/page.tsx`
- Modify: `src/src/app/(dashboard)/surveys/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/workflows/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/workflows/[id]/page.tsx`
- Modify: `src/src/components/workflows/workflow-timeline.tsx`
- Modify: `src/src/components/surveys/survey-responses-table.tsx`
- Modify: `src/e2e/mobile-responsive-admin.spec.ts`

**Interfaces:**
- Produces: `ResponsiveRecord`, `ResponsiveRecordHeader`, `ResponsiveRecordMeta`, and `ResponsiveRecordActions` as semantic card building blocks.
- Consumes: each route's existing data and actions; no new domain model.

- [ ] **Step 1: Write the failing shared-record test**

```tsx
render(
  <ResponsiveRecord>
    <ResponsiveRecordHeader title="Acme" status={<span>Active</span>} />
    <ResponsiveRecordMeta items={[{ label: "Owner", value: "Maria" }, { label: "Members", value: 12 }]} />
    <ResponsiveRecordActions
      primary={<a href="/acme">Open</a>}
      secondary={<ResponsiveActionsItem asChild><button>Archive</button></ResponsiveActionsItem>}
    />
  </ResponsiveRecord>,
);
expect(screen.getByRole("article")).toHaveClass("min-w-0");
expect(screen.getByText("Owner")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Open" })).toHaveClass("min-h-11");
expect(screen.getByRole("button", { name: /more actions/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx jest src/__tests__/components/ui/responsive-record.test.tsx --runInBand`

Expected: FAIL because the record primitives do not exist.

- [ ] **Step 3: Implement the semantic record-card building blocks**

Implement focused components with `article`, `dl`, `dt`, and `dd` semantics. `ResponsiveRecordActions` always shows its primary node and passes secondary nodes to `ResponsiveActionsMenu`; it does not know any domain types or mutate data.

```tsx
// src/src/components/ui/responsive-record.tsx
import type { ReactNode } from "react";
import { ResponsiveActionsMenu } from "./responsive-actions-menu";

export function ResponsiveRecord({ children }: { children: ReactNode }) {
  return <article className="min-w-0 rounded-xl border border-border bg-card p-4">{children}</article>;
}

export function ResponsiveRecordHeader({ title, status }: { title: ReactNode; status?: ReactNode }) {
  return <header className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0 break-words font-semibold">{title}</div>{status}</header>;
}

export function ResponsiveRecordMeta({ items }: { items: Array<{ label: ReactNode; value: ReactNode }> }) {
  return <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">{items.map((item, index) => <div key={index}><dt className="text-muted-foreground">{item.label}</dt><dd className="break-words text-foreground">{item.value}</dd></div>)}</dl>;
}

export function ResponsiveRecordActions({ primary, secondary, menuLabel = "More actions" }: { primary: ReactNode; secondary?: ReactNode; menuLabel?: string }) {
  return <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2 [&_a:first-child]:min-h-11 [&_a:first-child]:w-full">{primary}{secondary ? <ResponsiveActionsMenu label={menuLabel}>{secondary}</ResponsiveActionsMenu> : null}</div>;
}
```

- [ ] **Step 4: Add the failing admin collection route sweep**

Extend `mobile-responsive-admin.spec.ts` with `/dashboard`, `/coaches`, `/coaches/new`, `/contacts`, `/partners`, `/templates`, `/templates/new`, `/bio`, `/admin/approvals`, `/admin/categories`, `/admin/pricing`, `/admin/financials`, `/admin/refunds-needed`, `/admin/registrations`, `/admin/settings`, `/admin/surveys`, `/admin/surveys/aggregate`, `/admin/transactional-emails`, `/surveys`, and `/admin/workflows` at 320 and 390 px. Require discovered coach detail/edit, bio detail, template edit, workflow detail, and transactional-email editor links. Run the sweep and retain its route/offender RED output.

Run: `WAVE_MOBILE_RESPONSIVE_ENABLED=1 npx playwright test e2e/mobile-responsive-admin.spec.ts --project=chromium`

Expected: FAIL on at least one named collection route, with the widest offenders printed.

- [ ] **Step 5: Convert each remaining collection with an explicit field map**

Use the following compact record contracts; every listed action must remain reachable:

| Surface | Visible compact identity/status/meta | Primary action | Secondary actions |
| --- | --- | --- | --- |
| Coaches | name, email, active state, workshop count | View coach | Edit |
| Contacts | name, email, company, source | View details | Edit, delete |
| Partners | company/name, status, email, phone | Open partner | Existing edit/delete actions |
| Templates | name, type, category, active state | Edit template | Existing activate/archive actions |
| Bios | coach name, title, completion state | View bio | Edit |
| Categories | name, description, template count | Edit | Delete where currently allowed |
| Pricing | tier name, amount, workshop type, active state | Edit | Existing delete/deactivate action |
| Financials | transaction/workshop identity, amount, payment state, date | Open workshop | Existing refund/payment action |
| Registrations | attendee, workshop, paid/attended state | Open registration/workshop | Existing attendance/refund actions |
| Survey templates/results | title, status, response count, updated date | Open | Edit/archive/export where present |
| Workflows | name, trigger, active state, step count | Open workflow | Existing activate/delete actions |

For each file, retain its existing wide table in `ResponsiveDataView`; do not replace horizontal comparison tables at wide widths. Add labeled `Table` regions. Stack filters and pagination below 640 px. Give workflow timeline its own labeled scroll region rather than allowing it to widen the page.

For create/edit/detail pages in this task, use `PageHeader responsiveEnabled`, change fixed multi-column forms to `grid-cols-1 md:grid-cols-2` (adding a third column only at `xl`), apply `min-w-0 break-words` to long email/template/workflow values, and stack save/cancel/destructive actions below 640 px. Transactional-email subject/body editors remain the same controlled inputs and submit to the same endpoint.

Extend `survey-responses-table.test.tsx`, `portal/registrations-client.test.tsx`, and the two workflow-editor suites to assert their compact identity/status metadata and 44 px action targets. The remaining inline server-page presenters are covered by the RED route sweep plus `responsive-record.test.tsx`.

- [ ] **Step 6: Run GREEN checks for all migrated collections**

Run:

```bash
npx jest src/__tests__/components/ui/responsive-record.test.tsx src/__tests__/components/survey-responses-table.test.tsx src/__tests__/portal/registrations-client.test.tsx src/__tests__/components/workflow-editor-survey-email.test.tsx src/__tests__/components/workflow-editor-survey-picker.test.tsx --runInBand
npx playwright test e2e/mobile-responsive-admin.spec.ts --project=chromium
npx eslint src/src/components/ui/responsive-record.tsx 'src/src/app/(dashboard)/dashboard/page.tsx' 'src/src/app/(dashboard)/coaches' 'src/src/app/(dashboard)/contacts/page.tsx' src/src/components/contacts/contacts-table.tsx 'src/src/app/(dashboard)/partners/page.tsx' 'src/src/app/(dashboard)/templates' 'src/src/app/(dashboard)/bio' 'src/src/app/(dashboard)/admin/approvals/page.tsx' 'src/src/app/(dashboard)/admin/categories/page.tsx' 'src/src/app/(dashboard)/admin/pricing/page.tsx' 'src/src/app/(dashboard)/admin/financials/page.tsx' 'src/src/app/(dashboard)/admin/refunds-needed/page.tsx' 'src/src/app/(dashboard)/admin/registrations' 'src/src/app/(dashboard)/admin/settings/page.tsx' 'src/src/app/(dashboard)/admin/surveys' 'src/src/app/(dashboard)/admin/transactional-emails' 'src/src/app/(dashboard)/surveys/page.tsx' 'src/src/app/(dashboard)/admin/workflows' src/src/components/workflows/workflow-timeline.tsx src/src/components/surveys/survey-responses-table.tsx
```

Expected: all relevant suites PASS. If the broad Jest command exposes a known unrelated failure, rerun every directly importing suite individually and record both outputs; never relabel an uninvestigated failure as pre-existing.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/src/components/ui/responsive-record.tsx src/src/__tests__/components/ui/responsive-record.test.tsx 'src/src/app/(dashboard)/dashboard/page.tsx' 'src/src/app/(dashboard)/coaches/page.tsx' 'src/src/app/(dashboard)/coaches/[id]/page.tsx' 'src/src/app/(dashboard)/coaches/[id]/edit/page.tsx' 'src/src/app/(dashboard)/coaches/new/page.tsx' 'src/src/app/(dashboard)/contacts/page.tsx' src/src/components/contacts/contacts-table.tsx 'src/src/app/(dashboard)/partners/page.tsx' 'src/src/app/(dashboard)/templates/page.tsx' 'src/src/app/(dashboard)/templates/[id]/edit/page.tsx' 'src/src/app/(dashboard)/templates/new/page.tsx' 'src/src/app/(dashboard)/templates/new/create-template-form.tsx' 'src/src/app/(dashboard)/bio/page.tsx' 'src/src/app/(dashboard)/bio/[id]/page.tsx' 'src/src/app/(dashboard)/admin/approvals/page.tsx' 'src/src/app/(dashboard)/admin/categories/page.tsx' 'src/src/app/(dashboard)/admin/pricing/page.tsx' 'src/src/app/(dashboard)/admin/financials/page.tsx' 'src/src/app/(dashboard)/admin/refunds-needed/page.tsx' 'src/src/app/(dashboard)/admin/registrations/page.tsx' 'src/src/app/(dashboard)/admin/registrations/registrations-table.tsx' 'src/src/app/(dashboard)/admin/settings/page.tsx' 'src/src/app/(dashboard)/admin/surveys/page.tsx' 'src/src/app/(dashboard)/admin/surveys/aggregate/page.tsx' 'src/src/app/(dashboard)/admin/transactional-emails/page.tsx' 'src/src/app/(dashboard)/admin/transactional-emails/[type]/page.tsx' 'src/src/app/(dashboard)/admin/transactional-emails/[type]/editor.tsx' 'src/src/app/(dashboard)/surveys/page.tsx' 'src/src/app/(dashboard)/admin/workflows/page.tsx' 'src/src/app/(dashboard)/admin/workflows/[id]/page.tsx' src/src/components/workflows/workflow-timeline.tsx src/src/components/surveys/survey-responses-table.tsx src/src/__tests__/components/survey-responses-table.test.tsx src/src/__tests__/portal/registrations-client.test.tsx src/src/__tests__/components/workflow-editor-survey-email.test.tsx src/src/__tests__/components/workflow-editor-survey-picker.test.tsx src/e2e/mobile-responsive-admin.spec.ts
git commit -m "feat: add responsive admin record collections"
```

---

### Task 8: Collapse Assessment Navigation and Reflow the Editor

**Files:**
- Create: `src/src/components/nav/assessments-compact-nav.tsx`
- Create: `src/src/__tests__/components/nav/assessments-compact-nav.test.tsx`
- Modify: `src/src/components/nav/assessments-sidebar.tsx:1-123`
- Modify: `src/src/app/(dashboard)/admin/assessments/layout.tsx:1-41`
- Modify: `src/src/app/(dashboard)/admin/assessments/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/access-groups/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/access-groups/[id]/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/aggregate/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/import/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/observability/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/organizations/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/public-campaigns/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/templates/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/templates/new/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/templates/[id]/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx`
- Modify: `src/src/components/admin/AssessmentTemplatesList.tsx`
- Modify: `src/src/components/admin/AccessGroupsList.tsx`
- Modify: `src/src/components/admin/AccessGroupDetail.tsx`
- Modify: `src/src/components/admin/PublicCampaignsManager.tsx`
- Modify: `src/src/components/admin/ImportHealthPanel.tsx`
- Modify: `src/src/components/admin/ObservabilityDashboard.tsx`
- Modify: `src/src/components/admin/AssessmentsAggregateReport.tsx`
- Modify: `src/src/components/admin/template-editor/TabbedShell.tsx:760-930`
- Modify: `src/src/components/admin/template-editor/SingleColumnFormBuilder.tsx:119-270`
- Modify: `src/src/components/admin/template-editor/FormsBuilder.tsx`
- Modify: `src/src/components/admin/template-editor/QuestionInspector.tsx`
- Modify: `src/src/styles/wireframes-scoped.css`
- Test: `src/src/__tests__/components/nav/assessments-sidebar.test.tsx`
- Test: `src/src/__tests__/components/admin/template-editor/tabbed-shell.wave-ed10.test.tsx`
- Test: `src/src/__tests__/components/admin/template-editor/single-column-a11y.test.tsx`
- Modify: `src/e2e/mobile-responsive-admin.spec.ts`

**Interfaces:**
- Produces: `AssessmentsCompactNav({ entries })`, with current-route label derived through `usePathname`.
- Produces: `AssessmentsSidebarProps.responsiveEnabled?: boolean`.
- Preserves: all current assessment route hrefs, access predicates, editor draft model, commands, focus restoration and flags ED1–ED10.

- [ ] **Step 1: Write failing compact-navigation tests**

```tsx
render(<AssessmentsCompactNav entries={entries} />);
expect(screen.getByRole("button", { name: /assessment section: templates/i })).toHaveAttribute("aria-expanded", "false");
fireEvent.click(screen.getByRole("button", { name: /assessment section: templates/i }));
expect(screen.getByRole("link", { name: "Organizations" })).toHaveAttribute("href", "/admin/assessments/organizations");
expect(screen.getByRole("link", { name: "Templates" })).toHaveAttribute("aria-current", "page");
```

Extend `assessments-sidebar.test.tsx` to prove that gate OFF renders only the current sidebar and gate ON adds compact navigation without changing the filtered entry set for ADMIN, STAFF, or COACH.

Before implementation, extend `mobile-responsive-admin.spec.ts` with every static `/admin/assessments` route from Task 10 plus required discovered access-group, campaign, template-detail, and version-editor routes at 320 and 390 px. Run it once and retain the route/offender RED output.

- [ ] **Step 2: Run navigation tests and verify RED**

Run:

```bash
npx jest src/__tests__/components/nav/assessments-compact-nav.test.tsx src/__tests__/components/nav/assessments-sidebar.test.tsx --runInBand
WAVE_MOBILE_RESPONSIVE_ENABLED=1 npx playwright test e2e/mobile-responsive-admin.spec.ts --project=chromium
```

Expected: FAIL because the compact component and prop do not exist.

- [ ] **Step 3: Implement compact assessment navigation**

Export the already-filtered entry list from `AssessmentsSidebar` to the client component. Render a compact disclosure below 640 px and the current sidebar from 640 px upward only when the responsive gate is enabled. The trigger copy is `Assessment section: {current label}`. Close the disclosure on navigation. Keep all hrefs and `canAccessAggregateReport` filtering unchanged.

- [ ] **Step 4: Write failing editor responsive assertions**

In the existing editor suites, render the active ED9/ED10 configuration with `mobileResponsiveEnabled` and assert:

```tsx
expect(screen.getByRole("tablist", { name: "Template editor tabs" })).toHaveAttribute("data-responsive-tabs");
expect(screen.getByTestId("template-editor-actions")).toHaveClass("flex-col", "sm:flex-row");
expect(screen.getByTestId("single-column-builder")).toHaveClass("min-w-0");
```

Assert the compact Build section toolbar exposes `Add question`, move, and delete through touch-sized controls and retains the same command callbacks.

- [ ] **Step 5: Reflow editor and assessment data surfaces**

- Stack editor title/status/actions below 640 px; keep Save/Publish as primary visible actions and group secondary version/test actions in `ResponsiveActionsMenu`.
- Keep the tab rail horizontally scrollable inside its own labeled region; never let it widen the document.
- Add `min-w-0`, `break-words`, and compact stacked toolbars to `SingleColumnFormBuilder`, `FormsBuilder`, and `QuestionInspector`.
- Stack preview/editor panes below 1024 px; use side-by-side only at 1024 px when both panes fit.
- Convert templates, access groups, public campaigns, import health, and observability lists to `ResponsiveDataView`; retain aggregate report tables in labeled inner scrollers because cross-column comparison is their core task.
- Apply `PageHeader responsiveEnabled` and `min-w-0` to every listed assessment route host so loading, empty, permission, create, detail, and editor states share the same compact container.
- Preserve every ED feature flag and editor command path; the mobile flag gates presentation only.

- [ ] **Step 6: Run assessment/editor GREEN checks**

Run:

```bash
npx jest src/__tests__/components/nav/assessments-compact-nav.test.tsx src/__tests__/components/nav/assessments-sidebar.test.tsx src/__tests__/components/admin/assessment-templates-list-wave-q.test.tsx src/__tests__/components/admin/template-editor/tabbed-shell.wave-ed10.test.tsx src/__tests__/components/admin/template-editor/single-column-a11y.test.tsx src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx --runInBand
npx playwright test e2e/mobile-responsive-admin.spec.ts --project=chromium
npx eslint src/src/components/nav src/src/components/admin/AssessmentTemplatesList.tsx src/src/components/admin/AccessGroupsList.tsx src/src/components/admin/AccessGroupDetail.tsx src/src/components/admin/PublicCampaignsManager.tsx src/src/components/admin/ImportHealthPanel.tsx src/src/components/admin/ObservabilityDashboard.tsx src/src/components/admin/AssessmentsAggregateReport.tsx src/src/components/admin/template-editor 'src/src/app/(dashboard)/admin/assessments'
```

Expected: all PASS; existing ED10 golden snapshots remain unchanged with the mobile flag OFF.

- [ ] **Step 7: Commit Task 8**

```bash
git add src/src/components/nav/assessments-compact-nav.tsx src/src/components/nav/assessments-sidebar.tsx 'src/src/app/(dashboard)/admin/assessments/layout.tsx' 'src/src/app/(dashboard)/admin/assessments/page.tsx' 'src/src/app/(dashboard)/admin/assessments/access-groups/page.tsx' 'src/src/app/(dashboard)/admin/assessments/access-groups/[id]/page.tsx' 'src/src/app/(dashboard)/admin/assessments/aggregate/page.tsx' 'src/src/app/(dashboard)/admin/assessments/import/page.tsx' 'src/src/app/(dashboard)/admin/assessments/observability/page.tsx' 'src/src/app/(dashboard)/admin/assessments/organizations/page.tsx' 'src/src/app/(dashboard)/admin/assessments/public-campaigns/page.tsx' 'src/src/app/(dashboard)/admin/assessments/templates/page.tsx' 'src/src/app/(dashboard)/admin/assessments/templates/new/page.tsx' 'src/src/app/(dashboard)/admin/assessments/templates/[id]/page.tsx' 'src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx' src/src/components/admin/AssessmentTemplatesList.tsx src/src/components/admin/AccessGroupsList.tsx src/src/components/admin/AccessGroupDetail.tsx src/src/components/admin/PublicCampaignsManager.tsx src/src/components/admin/ImportHealthPanel.tsx src/src/components/admin/ObservabilityDashboard.tsx src/src/components/admin/AssessmentsAggregateReport.tsx src/src/components/admin/template-editor/TabbedShell.tsx src/src/components/admin/template-editor/SingleColumnFormBuilder.tsx src/src/components/admin/template-editor/FormsBuilder.tsx src/src/components/admin/template-editor/QuestionInspector.tsx src/src/styles/wireframes-scoped.css src/src/__tests__/components/nav/assessments-compact-nav.test.tsx src/src/__tests__/components/nav/assessments-sidebar.test.tsx src/src/__tests__/components/admin/assessment-templates-list-wave-q.test.tsx src/src/__tests__/components/admin/template-editor/tabbed-shell.wave-ed10.test.tsx src/src/__tests__/components/admin/template-editor/single-column-a11y.test.tsx src/src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx src/e2e/mobile-responsive-admin.spec.ts
git commit -m "feat: make assessment workspace responsive"
```

---

### Task 9: Harden Dialogs, Error States, Touch Targets, and Reports

**Files:**
- Modify: `src/src/components/organizations/add-member-modal.tsx`
- Modify: `src/src/components/organizations/add-team-modal.tsx`
- Modify: `src/src/components/organizations/edit-member-modal.tsx`
- Modify: `src/src/components/organizations/edit-organization-modal.tsx`
- Modify: `src/src/components/organizations/edit-team-modal.tsx`
- Modify: `src/src/components/organizations/import-members-modal.tsx`
- Modify: `src/src/components/workshops/cancel-workshop-dialog.tsx`
- Modify: `src/src/components/workshops/delete-workshop-dialog.tsx`
- Modify: `src/src/app/(dashboard)/workshops/[id]/workshop-actions.tsx`
- Modify: `src/src/app/(portal)/portal/workshops/[id]/page.tsx`
- Modify: `src/src/components/assessments/CampaignWizard.tsx`
- Modify: `src/src/components/assessments/BrandedReport.tsx`
- Modify: `src/src/components/assessments/GroupReport.tsx`
- Modify: `src/src/components/assessments/ScoredGroupReport.tsx`
- Modify: `src/src/components/assessments/QualitativeGroupReport.tsx`
- Modify: `src/src/components/assessments/CampaignTrendsView.tsx`
- Modify: `src/src/components/assessments/RespondentLongitudinalView.tsx`
- Modify: `src/src/styles/su-report.css`
- Create: `src/src/__tests__/components/workshops/responsive-dialogs.test.tsx`
- Test: `src/src/__tests__/components/organizations/add-member-modal.test.tsx`
- Test: `src/src/__tests__/components/organizations/import-members-modal.test.tsx`
- Test: `src/src/__tests__/components/assessments/group-report-render.test.tsx`
- Test: `src/src/__tests__/components/assessments/reports.wave-u.test.tsx`
- Test: `src/src/__tests__/components/campaign-trends-view.test.tsx`
- Test: `src/src/__tests__/components/respondent-longitudinal-view.test.tsx`

**Interfaces:**
- Consumes: gated `DialogContent`, `Table` data regions and touch hooks.
- Preserves: current form values and errors during modal scroll; existing report content and print order.

- [ ] **Step 1: Write failing edge-state tests**

For one organization modal and one destructive workshop dialog, assert the rendered dialog has `data-responsive-dialog`, a reachable close target, an error summary with `role="alert"`, and footer actions that remain in the DOM after validation failure. For reports, assert every wide table has a named region and that the report root has `min-w-0 max-w-full` under the gate.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx jest src/__tests__/components/organizations/add-member-modal.test.tsx src/__tests__/components/organizations/import-members-modal.test.tsx src/__tests__/components/workshops/responsive-dialogs.test.tsx src/__tests__/components/assessments/group-report-render.test.tsx src/__tests__/components/assessments/reports.wave-u.test.tsx src/__tests__/components/campaign-trends-view.test.tsx src/__tests__/components/respondent-longitudinal-view.test.tsx --runInBand
```

Expected: FAIL on missing labels/hooks or compact dialog layout.

- [ ] **Step 3: Harden modal and error layouts**

- Use the shared `DialogContent` viewport cap and internal scrolling.
- Add `responsiveEnabled?: boolean` to every listed modal/dialog. Pass it through to `<DialogContent responsiveEnabled={responsiveEnabled}>` from `MembersTeamsView`, `CampaignWizard`, the portal workshop detail, and `WorkshopActions`; default it to false at every boundary.
- Stack footer actions on compact; primary submit comes first visually and remains last in logical tab order only when that matches the DOM.
- Render field errors inline and add a top summary linking to invalid control IDs for multi-field forms.
- Do not clear form state on a failed request. Disable only the in-flight action and preserve retry.
- Convert compact file/CSV preview tables inside import modals to labeled inner scrollers.

The exact additive contract on every modal is `responsiveEnabled?: boolean`; default it to `false` in the existing function parameter destructure and pass that value to the existing `DialogContent`. No form children, handlers, `open`, or `onClose` expressions change.

- [ ] **Step 4: Guard report layouts without redesigning content**

- Add `min-width: 0; max-width: 100%` to report sections, chart wrappers, legends, and export-action rows.
- Keep group, trend, and longitudinal comparison tables inside named scroll regions.
- Make report header/export actions wrap before they squeeze.
- Scope screen-only changes with `@media screen`; preserve existing print styles and report DOM order.

- [ ] **Step 5: Audit touch targets and keyboard behavior**

Add a Playwright helper that measures visible `button`, `[role=button]`, summary, and action links marked `data-touch-target`. Fail with selector and dimensions when width or height is below 44 px. Exercise Escape/outside-click dismissal and focus restoration for mobile nav, compact assessment nav, action menu, and dialogs.

- [ ] **Step 6: Run GREEN checks**

Run:

```bash
npx jest src/__tests__/components/organizations/add-member-modal.test.tsx src/__tests__/components/organizations/import-members-modal.test.tsx src/__tests__/components/workshops/responsive-dialogs.test.tsx src/__tests__/components/assessments/group-report-render.test.tsx src/__tests__/components/assessments/reports.wave-u.test.tsx src/__tests__/components/assessments/print-report-button.test.tsx src/__tests__/components/campaign-trends-view.test.tsx src/__tests__/components/respondent-longitudinal-view.test.tsx --runInBand
npx eslint src/src/components/organizations src/src/components/workshops/cancel-workshop-dialog.tsx src/src/components/workshops/delete-workshop-dialog.tsx src/src/components/assessments
```

Expected: all PASS.

- [ ] **Step 7: Commit Task 9**

```bash
git add src/src/components/organizations/add-member-modal.tsx src/src/components/organizations/add-team-modal.tsx src/src/components/organizations/edit-member-modal.tsx src/src/components/organizations/edit-organization-modal.tsx src/src/components/organizations/edit-team-modal.tsx src/src/components/organizations/import-members-modal.tsx src/src/components/workshops/cancel-workshop-dialog.tsx src/src/components/workshops/delete-workshop-dialog.tsx 'src/src/app/(dashboard)/workshops/[id]/workshop-actions.tsx' 'src/src/app/(portal)/portal/workshops/[id]/page.tsx' src/src/components/assessments/CampaignWizard.tsx src/src/components/assessments/BrandedReport.tsx src/src/components/assessments/GroupReport.tsx src/src/components/assessments/ScoredGroupReport.tsx src/src/components/assessments/QualitativeGroupReport.tsx src/src/components/assessments/CampaignTrendsView.tsx src/src/components/assessments/RespondentLongitudinalView.tsx src/src/styles/su-report.css src/src/__tests__/components/organizations/add-member-modal.test.tsx src/src/__tests__/components/organizations/import-members-modal.test.tsx src/src/__tests__/components/workshops/responsive-dialogs.test.tsx src/src/__tests__/components/assessments/group-report-render.test.tsx src/src/__tests__/components/assessments/reports.wave-u.test.tsx src/src/__tests__/components/campaign-trends-view.test.tsx src/src/__tests__/components/respondent-longitudinal-view.test.tsx
git commit -m "fix: harden responsive dialogs and reports"
```

---

### Task 10: Enforce the Complete Authenticated Route Matrix

**Files:**
- Modify: `src/e2e/mobile-responsive-coach.spec.ts`
- Modify: `src/e2e/mobile-responsive-admin.spec.ts`
- Create: `src/e2e/mobile-responsive-state.spec.ts`
- Modify: `src/e2e/helpers/overflow.ts`
- Create: `src/e2e/mobile-responsive-visual.spec.ts`
- Create: `src/e2e/mobile-responsive-a11y.spec.ts`
- Modify: `src/playwright.config.ts:34-63`

**Interfaces:**
- Consumes: `assertNoDocumentOverflow` from Task 1 and live links to discover dynamic seeded IDs.
- Produces: compact, medium, tablet-wide and desktop projects; route/viewport/offender output on failure.

- [ ] **Step 1: Add explicit viewport projects**

```ts
// append to projects in src/playwright.config.ts
{
  name: "responsive-compact",
  use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true },
},
{
  name: "responsive-medium",
  use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, hasTouch: true },
},
{
  name: "responsive-tablet-wide",
  use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 }, hasTouch: true },
},
{
  name: "responsive-desktop",
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
},
```

- [ ] **Step 2: Write the complete static inventories**

```ts
const COACH_ROUTES = [
  "/portal/home",
  "/portal/workshops",
  "/portal/request",
  "/portal/assessments",
  "/portal/assessments/new",
  "/portal/assessments/public-leads",
  "/portal/assessments/trends",
  "/portal/members",
  "/portal/members/import",
  "/portal/registrations",
  "/portal/follow-up",
  "/portal/templates",
  "/portal/coach/resources",
  "/portal/settings",
] as const;

const ADMIN_ROUTES = [
  "/dashboard", "/admin/dashboard", "/admin/approvals", "/admin/files", "/admin/financials",
  "/admin/pricing", "/admin/refunds-needed", "/admin/registrations", "/admin/settings",
  "/admin/surveys", "/admin/surveys/aggregate", "/admin/transactional-emails",
  "/admin/workflows", "/admin/assessments", "/admin/assessments/access-groups",
  "/admin/assessments/aggregate", "/admin/assessments/campaigns",
  "/admin/assessments/import", "/admin/assessments/observability",
  "/admin/assessments/organizations", "/admin/assessments/public-campaigns",
  "/admin/assessments/templates", "/admin/assessments/templates/new",
  "/admin/categories", "/coaches", "/coaches/new", "/contacts",
  "/partners", "/surveys", "/templates", "/workshops", "/bio",
] as const;
```

For every route, wait for DOM content and fonts, assert no 404/500 heading, then call `assertNoDocumentOverflow` with role, route, and project name.

Within the compact project, repeat each route at widths `320`, `375`, `390`, and `430`. Within the medium project, repeat at `600`, `768`, and `1023`. Within tablet-wide repeat at `1024` and `1366`; desktop remains `1440`. Use `page.setViewportSize` before navigation so every exact acceptance width is exercised.

- [ ] **Step 3: Discover and test populated dynamic routes**

Resolve real IDs from visible links and require at least one match for each populated seed domain:

```ts
async function firstMatchingHref(page: Page, source: string, pattern: RegExp): Promise<string> {
  await page.goto(source);
  const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")).filter(Boolean) as string[]);
  const match = hrefs.find((href) => pattern.test(href));
  expect(match, `Expected ${source} to expose a link matching ${pattern}`).toBeTruthy();
  return match!;
}
```

Cover:

- coach workshop detail and surveys;
- coach/admin campaign detail and group-report link when present;
- admin workshop detail and landing-page editors;
- coach detail/edit;
- assessment template detail and version editor;
- access-group detail;
- workflow detail;
- survey-template detail;
- transactional-email editor;
- respondent longitudinal/report links when present.

- [ ] **Step 4: Add state-preservation scenarios**

In `mobile-responsive-state.spec.ts`:

1. Set a workshop search/filter, resize 390 → 768 → 390, assert values and result count remain.
2. Select an organization/member context, resize, assert selection and loaded member remain without another fetch.
3. Fill campaign-wizard organization/template state, rotate 390 × 844 → 844 × 390, assert inputs and `Step N of M` remain.
4. Open/dismiss mobile navigation and action menus with keyboard, asserting focus returns to the trigger.
5. Trigger one validation error and one mocked retryable failure, resize, and assert draft/filter state remains.

Create `mobile-responsive-a11y.spec.ts`. On `/portal/home`, `/portal/workshops`, `/portal/members`, `/admin/dashboard`, `/workshops`, `/admin/assessments/organizations`, and the seeded editor, run:

```ts
import AxeBuilder from "@axe-core/playwright";

const results = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
  .analyze();
expect(results.violations).toEqual([]);
```

Then keyboard-drive the coach/admin drawers, compact assessment disclosure, responsive action menu, and one dialog. Assert Escape closes each overlay and focus returns to its trigger. Measure visible action controls marked `data-touch-target`, plus all buttons/menuitems in authenticated navigation and responsive records, and fail with selector plus dimensions below 44 × 44 px.

- [ ] **Step 5: Run the matrix and fix every named offender in its owning component**

Run:

```bash
WAVE_MOBILE_RESPONSIVE_ENABLED=1 npx playwright test e2e/mobile-responsive-coach.spec.ts e2e/mobile-responsive-admin.spec.ts e2e/mobile-responsive-state.spec.ts e2e/mobile-responsive-a11y.spec.ts --project=responsive-compact --project=responsive-medium --project=responsive-tablet-wide --project=responsive-desktop
```

Expected: all PASS. Fix an offender in the smallest shared owning component. Do not add a global overflow clip.

Add `mobile-responsive-visual.spec.ts` with stable screenshots for `/portal/home`, `/portal/workshops`, `/admin/dashboard`, `/workshops`, `/admin/assessments/organizations`, and the seeded assessment editor. Mask timestamps and generated aliases, then assert one compact, one medium, one tablet-wide, and one desktop image per representative role/domain:

```ts
await expect(page).toHaveScreenshot(`${role}-${surface}-${test.info().project.name}.png`, {
  animations: "disabled",
  fullPage: true,
  mask: [page.locator("time"), page.locator("[data-volatile]")],
});
```

Generate the baselines deliberately on the first run, inspect every image, commit them under Playwright's generated snapshot directory, then rerun without `--update-snapshots` and require PASS.

- [ ] **Step 6: Prove the kill switch and desktop parity**

Run the representative desktop screenshots once with ENABLED=0 and once with ENABLED=1/KILL=1; outputs must match the pre-wave baselines. Run the responsive matrix with ENABLED=1/KILL=1 and confirm the original RED failures return, proving the kill switch—not stale build output—controls the presentation.

- [ ] **Step 7: Commit Task 10**

```bash
git add src/e2e/helpers/overflow.ts src/e2e/mobile-responsive-shell.spec.ts src/e2e/mobile-responsive-coach.spec.ts src/e2e/mobile-responsive-admin.spec.ts src/e2e/mobile-responsive-state.spec.ts src/e2e/mobile-responsive-visual.spec.ts src/e2e/mobile-responsive-a11y.spec.ts src/e2e/mobile-responsive-visual.spec.ts-snapshots src/playwright.config.ts
git commit -m "test: gate responsive authenticated route matrix"
```

---

### Task 11: Perform Physical-Device Acceptance and Record Evidence

**Files:**
- Create: `docs/qa/mobile-responsive-wave-1.md`
- Add: `docs/qa/assets/mobile-responsive-wave-1/` screenshots captured during acceptance

**Interfaces:**
- Consumes: deployed preview with `WAVE_MOBILE_RESPONSIVE_ENABLED=1` and kill switch unset.
- Produces: dated evidence for iPhone 11 Safari, iPad Safari, Chrome, Page Zoom, Split View, rotation, touch and keyboard.

- [ ] **Step 1: Create the acceptance document before testing**

Use this exact table structure:

```md
| Device/browser | Mode | Zoom | Coach result | Admin result | Evidence |
| --- | --- | ---: | --- | --- | --- |
| iPhone 11 Safari | Portrait | 100% | Pending | Pending | — |
| iPhone 11 Safari | Portrait | 125% | Pending | Pending | — |
| iPhone 11 Safari | Portrait | 150% | Pending | Pending | — |
| iPhone 11 Safari | Landscape | 100% | Pending | Pending | — |
| iPad Safari | Portrait | 100% | Pending | Pending | — |
| iPad Safari | Landscape | 100% | Pending | Pending | — |
| iPad Safari | 1/2 Split View | 100% | Pending | Pending | — |
| iPad Safari | 1/3 Split View | 100% | Pending | Pending | — |
| Chrome | 390 × 844 | 100% | Pending | Pending | — |
```

- [ ] **Step 2: Execute both-role route sweeps on physical Safari**

For each row: log in as coach and admin, traverse every navigation destination, open one populated workshop/campaign/member/editor/detail surface, open all action menus, and record PASS/FAIL plus screenshot filename. Verify there is no page-level sideways pan and browser chrome is not masking page content.

- [ ] **Step 3: Exercise touch, keyboard, loading, empty, and error behavior**

- Confirm every primary and `More` action is reachable by touch.
- With an iPad keyboard, confirm visible focus and logical order through nav, filters, data records, menus and dialogs.
- Exercise one empty collection, one validation failure, one retryable load failure, and one permission-denied page.
- Confirm rotating or changing Split View preserves search/filter/draft/selection state.
- Increase Safari page text size/larger accessibility text one step and repeat the dashboard, workshop list, members, campaign detail, wizard, and editor checks; record any truncation or unreachable control.

- [ ] **Step 4: Close every failure before marking the table PASS**

For a failure, record route, role, device, zoom, screenshot, and owning component. Return to the owning implementation task, add a failing automated regression, fix, redeploy preview, and rerun the failed physical row.

- [ ] **Step 5: Commit Task 11 evidence**

```bash
git add docs/qa/mobile-responsive-wave-1.md docs/qa/assets/mobile-responsive-wave-1
git commit -m "docs: record mobile responsive acceptance"
```

---

### Task 12: Run Release Gates and Update the Source of Truth

**Files:**
- Modify: `CLAUDE.md` project-context `LAST_UPDATED_ISO` / `LAST_UPDATED_SLUG` anchor and brief summary
- Modify: `plans/CHANGELOG.md` newest-first entry
- Modify: environment documentation only if the repository already tracks these wave variables there

**Interfaces:**
- Consumes: all task commits and physical acceptance evidence.
- Produces: launch-ready default-off wave with documented enable and kill procedure.

- [ ] **Step 1: Run the complete targeted test set**

```bash
npx jest src/__tests__/lib/mobile-responsive-flags.test.ts src/__tests__/components/ui src/__tests__/components/workshops src/__tests__/components/files src/__tests__/components/organizations src/__tests__/components/nav src/__tests__/components/assessments src/__tests__/components/admin --runInBand
```

Expected: PASS for every directly affected suite.

- [ ] **Step 2: Run the complete responsive E2E matrix**

```bash
WAVE_MOBILE_RESPONSIVE_ENABLED=1 npx playwright test e2e/mobile-responsive-shell.spec.ts e2e/mobile-responsive-coach.spec.ts e2e/mobile-responsive-admin.spec.ts e2e/mobile-responsive-state.spec.ts e2e/mobile-responsive-visual.spec.ts e2e/mobile-responsive-a11y.spec.ts --project=responsive-compact --project=responsive-medium --project=responsive-tablet-wide --project=responsive-desktop
```

Expected: PASS with zero full-document overflow failures.

- [ ] **Step 3: Run static, migration, and production-build gates**

```bash
git diff --name-only --diff-filter=ACMR origin/main...HEAD -- '*.ts' '*.tsx' | xargs npx eslint
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

Expected: ESLint PASS, migration safety PASS with no migration, Turbopack build PASS and all static pages generated.

- [ ] **Step 4: Write the changelog entry and project anchor**

Prepend an entry with:

```md
### 2026-08-12 — Mobile responsive foundation Wave 1 <!-- ENTRY_ISO:2026-08-12 ENTRY_SLUG:mobile-responsive-foundation-wave-1 -->

**Status: BUILT, DEFAULT-OFF** behind `WAVE_MOBILE_RESPONSIVE_ENABLED`; `WAVE_MOBILE_RESPONSIVE_KILL` hard-overrides enablement. No schema, API, authorization, or business-flow changes. Authenticated coach/admin route matrix passes at compact, medium, tablet-wide, desktop, and physical iPhone/iPad acceptance dimensions. See `docs/qa/mobile-responsive-wave-1.md` for evidence.
```

Update the CLAUDE anchor to the same ISO date and slug. Do not claim launch until the environment variable is written and the resulting production deployment is verified.

- [ ] **Step 5: Commit Task 12**

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs: record responsive foundation wave"
```

- [ ] **Step 6: Prepare the launch handoff**

Document these independent operations:

1. Deploy the default-off build.
2. Verify flag OFF desktop output and health endpoint.
3. Set `WAVE_MOBILE_RESPONSIVE_ENABLED=1` in the production project; keep `WAVE_MOBILE_RESPONSIVE_KILL` unset.
4. Redeploy and rerun the production coach/admin smoke matrix.
5. If a P0 regression appears, set `WAVE_MOBILE_RESPONSIVE_KILL=1`, redeploy, and confirm the previous UI returns.

Do not perform the production flag write or deployment unless the user explicitly authorizes launch.
