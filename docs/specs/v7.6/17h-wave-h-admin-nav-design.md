# Spec 17h — Wave H: Admin Nav → Grouped Dropdowns (+ custom-domain infra sub-item)

> **Status: DESIGN LOCKED (grilled + user-approved, June 22 2026). Gating artifact — not yet built.**
> Prod implementation is GATED on (a) this spec, (b) ADR-0013, (c) a per-wave TDD plan, and
> (d) **owner approval of the preview mockup — GRANTED June 26 2026** (the revised preview promoted **Approvals** to a standalone top-level item so its pending badge is always visible; everything else as drafted).
> Additive: **no schema migration, no new routes, no feature flag** (reversible by revert).

**Source touch-point:** June 22 2026 Fathom call — Jeff asked for a grouped/dropdown admin nav and
"a preview built for me before it goes to prod." Design direction grilled and approved via
AskUserQuestion in the same session (grouped dropdowns; 5-slot domain taxonomy; click-to-open,
menu-only labels; pending-count badges on Approvals + Refunds).

---

## A. Problem

The admin/staff top nav is a **flat 16-item bar** (`src/src/app/(dashboard)/layout.tsx:11-27`,
rendered by `src/src/components/layout/admin-nav-links.tsx` with `overflow-x-auto` horizontal scroll):

```
Dashboard · All Workshops · Templates · Workflows · Surveys · Assessments · Files ·
Partners · Coaches · Approvals · Registrations · Refunds · Emails · Categories · Pricing · Financials
```

It overflows on normal laptop widths (the bar scrolls horizontally), gives no sense of domain
grouping, and surfaces no "needs action" signal on the two operator queues (Approvals, Refunds).

**Note — CLAUDE.md is stale here:** it says "Nav bar has 13 items" and lists a "Bio" item that
no longer exists. Ground truth is the 16-item array above (Assessments, Registrations, Refunds,
Emails were added since). CLAUDE.md's gotcha line is updated as part of this wave's SoT flush.

---

## B. Wireframe-24 reconciliation (→ ADR-0013)

**Wireframes-are-the-spec rule applies.** The relevant locked wireframe is
`docs/wireframes-phase2/wave5/24-platform-nav-assessments-entry.md` +
`src/public/wireframes-phase2/admin/24-platform-nav-assessments-entry.html` (Wave 5, locked
May 15-17 2026). WF24 specified:

1. Add **"Assessments"** as a flat top-nav item between Surveys & Files (→ a flat 14-item bar).
2. Clicking Assessments opens a **dedicated assessments-lane sidebar** (Dashboard / Organizations /
   Access Groups / Templates / Campaigns / Public Quizzes / Aggregate Report), with a COACH "coach
   lane" variant.

**What actually shipped / drifted:** the flat top-nav add happened (and then grew to 16 items); the
assessments lane shipped too (`app/(dashboard)/admin/assessments/layout.tsx` + `page.tsx` +
`components/nav/assessments-sidebar.tsx`, with sub-routes templates / access-groups / aggregate /
public-campaigns / observability / import).

**Wave H override (ADR-0013):** WF24's **flat-add** top-nav model is superseded by **grouped
dropdowns**. WF24's **assessments-lane sidebar is NOT overridden** — it survives intact. In the new
taxonomy the `Assessments →` entry is a **gateway** (arrow, not a dropdown) that navigates *into*
that lane, which keeps its own sidebar. So Wave H changes only the **top-nav chrome**, not the
assessments lane. ADR-0013 records the override + the reasoning so a future reader doesn't "restore"
the flat bar to match the stale wireframe.

---

## C. Locked design

**Taxonomy — 5 domain groups (6 visible top-level entries):**

```
Dashboard   |   Workshops ▾   |   Approvals ⦿   |   Assessments →   |   Automation ▾   |   People ▾   |   Financials ▾
```

- `▾` = click-to-open dropdown menu. `→` = direct link (gateway into the assessments lane).
- **Click opens, label is menu-only** (locked): a group label (`Workshops`, `Automation`, `People`,
  `Financials`) is **not itself a navigable link** — clicking it opens/closes the menu. Only leaf
  items navigate. `Dashboard` and `Assessments →` are direct links (no menu).
- **Pending-count badges** on `Approvals` and `Refunds` leaf items (see §E).

**Full item → group mapping (all 16 current destinations homed; zero new routes):**

| Group | Leaf item | Route | Notes |
|---|---|---|---|
| **Dashboard** (link) | Dashboard | `/admin/dashboard` | standalone |
| **Workshops ▾** | All Workshops | `/workshops` | |
| | Registrations | `/admin/registrations` | |
| | Surveys | `/admin/surveys` | ⚑ workshop feedback surveys (NOT the Assessments module) |
| | *— Configuration —* | | menu section header |
| | Templates | `/templates` | landing-page templates |
| | Categories | `/admin/categories` | |
| | Pricing | `/admin/pricing` | |
| **Approvals ⦿** (link) | Approvals | `/admin/approvals` | **standalone top-level** (owner decision June 26 2026) · **pending badge** always visible |
| **Assessments →** (link) | (gateway) | `/admin/assessments` | opens the assessments lane + its own sidebar (unchanged) |
| **Automation ▾** | Workflows | `/admin/workflows` | |
| | Emails | `/admin/transactional-emails` | |
| | Files | `/admin/files` | ⚑ delivered via workflow steps |
| **People ▾** | Coaches | `/coaches` | |
| | Partners | `/partners` | |
| **Financials ▾** | Financials | `/admin/financials` | |
| | Refunds ⦿ | `/admin/refunds-needed` | **pending badge** |

**⚑ Flagged placements (resolve in the preview review with the owner — defensible either way):**
- **Approvals** → **standalone top-level link** (owner decision, June 26 2026 preview review): pulled OUT of every group so its pending badge stays on-screen — it is the operator's daily action queue. Supersedes the earlier Workshops▾-vs-People▾ option.
- **Surveys** → Workshops▾ (chosen: post-event workshop feedback, JV-13 — distinct from the
  Assessments module). Naming-confusion risk with "Assessments"; consider a "Workshop Surveys" relabel.
- **Files** → Automation▾ (chosen: workflow-step file delivery). Alt: Workshops▾.
- **Financials** refined from the locked bare "Financials" label to a small **▾** so Refunds (and its
  badge) has a home. If the owner prefers Refunds elsewhere, Financials reverts to a standalone link.

---

## D. Scope & role visibility

- **Surface:** the **ADMIN/STAFF dashboard top nav only** (`(dashboard)/layout.tsx`). The layout
  already redirects COACH → `/unauthorized` (`layout.tsx:41-43`), so this nav is admin/staff-only.
  The **coach portal nav is untouched**; the **assessments-lane sidebar is untouched**.
- **No per-item role gating added.** Current posture is layout-level gating only; Wave H keeps it.
  (STAFF sees the same nav as ADMIN, matching today.)
- **Mobile/tablet:** `AdminMobileNav` (hamburger, below `lg`) gets the same grouped structure as
  collapsible sections — **collapsed by default, with the group containing the current route
  auto-expanded** (Codex review). Badges show in mobile too.

---

## E. Badge data sources (grounded in existing queries)

Both counts are fetched **server-side in `layout.tsx`** (already an async server component holding
the session) and passed into the client nav components as props. **A zero count renders no badge**
(no empty pill).

- **Refunds badge** — exact filter behind `/admin/refunds-needed`:
  ```ts
  db.registration.count({
    where: { paymentStatus: "COMPLETED", refundedAt: null, workshop: { status: "CANCELED" } },
  })
  ```
- **Approvals badge** — the approvals page defaults to the `PENDING` filter (it's a client component
  hitting `/api/approvals`, so the layout needs its own count):
  ```ts
  db.approvalQueue.count({ where: { status: "PENDING" } })
  ```
  *Plan must verify the Prisma model accessor (`approvalQueue`) + the `status` enum value.* Open
  question (flag): should the badge also count `INFO_REQUESTED` / `COUNTER_OFFERED` (other
  open-action states)? Default = `PENDING` only; revisit if Suzanne wants the broader signal.

- **Cost (honest):** two `count()` queries when the layout renders. Approvals (`status=PENDING`) is cheap;
  the **refunds count joins Registration→Workshop and is NOT index-backed** (no migration in scope, so we
  don't add one). Acceptable at this data scale (thousands of registrations); fail-soft; revisit with an
  index or short cache only if it shows as a slow query. (Corrected per Codex review — earlier drafts
  wrongly called it "indexed".)
- **Freshness:** in App Router a layout does NOT re-render on soft navigation between sibling pages, so
  badges reflect the count as of the last full layout render (login / hard reload / `router.refresh()`).
  The approvals respond flow gets a `router.refresh()` so the Approvals badge self-heals when the queue
  is cleared (the refund flow already refreshes). Badges are **not** live-polled.
- **Resilience:** the count fetch is fail-soft — on any DB error it logs and returns zeros (no badge),
  so a transient blip never 500s the admin shell (the layout wraps every admin page).

---

## F. Implementation surface (no new routes, no migration)

- **Modify** `src/src/app/(dashboard)/layout.tsx` — replace the flat `navLinks` array with a grouped
  structure; add the two server-side count queries; pass groups + counts to the nav components.
- **Rework** `src/src/components/layout/admin-nav-links.tsx` — render grouped dropdowns
  (click-to-open, menu-only labels, badges, active-group highlight, keyboard a11y). Hand-roll the
  **disclosure-navigation pattern** (WAI-ARIA's recommended pattern for site nav — NOT `role="menu"`),
  with a **single `openGroup` state in `AdminNavLinks`** so only one panel is open at a time *by
  construction* (keyboard activation fires `click`, not `mousedown`, so per-group state would otherwise
  leave two panels open — Codex review); close on Esc / outside-click / focus-leaving-the-nav:
  a `<button aria-expanded aria-controls>` per group toggling a labelled panel of plain `<Link>`s; Tab
  traverses, Esc closes + returns focus to the trigger, visible focus ring, `aria-current` on the active
  leaf, arrow-key cycling as a progressive enhancement. (Radix `@radix-ui/react-dropdown-menu` is
  installed but rejected — the `menu` role is wrong for nav + Radix dropdowns are flaky under jsdom.)
- **Rework** `src/src/components/layout/admin-mobile-nav.tsx` — same grouped structure, collapsible.
- **New** nav-model module (e.g. `src/src/lib/nav/admin-nav-model.ts`) — the grouped structure as a
  typed contract `{ label, href?, items?: [...], badge?: "approvals" | "refunds" }`, so both render
  paths + tests share one source of truth.
- **Brand:** match the **existing admin theme** (blue `text-primary` wordmark, `bg-card` sticky bar,
  shadcn pills) — this is NOT the purple assessment brand. Faithful to current chrome.

**Reversibility:** pure component/layout change + a model module. Revert the commit to restore the
flat bar. No data, no schema, no flag.

---

## G. Custom-domain infra sub-item (H-infra) — tagged, not a build

`platform.scalingup.com` as the canonical app domain. **~0 application code:**
- `scripts/push-env-to-vercel.mjs:17` — set the canonical URL for `APP_URL` / `NEXTAUTH_URL`.
- Vercel: add the custom domain to the project; DNS CNAME at the registrar; redeploy.
- **Coordination risk:** `APP_URL` is baked into outbound links (workshop landing, **assessment
  invitation emails**, password-reset, calendar links). Flipping it changes every generated link.
  Sequence: add domain (both hostnames resolve) → flip env → redeploy → verify a fresh invite/reset
  link resolves on the new host → retire the old hostname only after confirming.
- **Ops action, not a TDD build wave** — but homed in Wave H per "everything in a wave." Can ship
  before or after the nav code (independent). No rollback coupling with the nav change.

---

## H. Test strategy (for the per-wave TDD plan)

New `__tests__/components/admin-nav.test.tsx` (none exist today — `git`-confirmed only
`coach-nav.test.ts` + `public-layout.test.tsx`):
- Renders all 5 groups; each group's leaves appear in its menu.
- Group label is menu-only: clicking `Workshops` toggles the menu, does **not** navigate.
- `Dashboard` and `Assessments →` navigate directly (no menu).
- Active-state: the group containing the current route is highlighted; the active leaf has
  `aria-current="page"`.
- Badge: count > 0 renders the pill with the number; count === 0 renders **no** pill.
- a11y (disclosure pattern): `aria-expanded` + `aria-controls` toggle; Esc closes AND returns focus to
  the trigger; focus ring visible; active leaf has `aria-current="page"`; arrow-key cycling is a
  progressive enhancement (Tab is primary). NOT `role="menu"/"menubar"`.
- Mobile nav renders the same groups + badges, collapsible.
- Nav-model unit test: the model homes all 16 known routes exactly once (guards against an orphaned
  or duplicated route when items move).
- Badge-count query unit tests (Refunds filter; Approvals PENDING count).

---

## I. Non-goals (Wave H)

- No new pages/routes (every destination already exists).
- No schema migration, no feature flag.
- No per-item role gating; no change to the COACH redirect.
- No change to the assessments-lane sidebar or the coach portal nav.
- No relabeling of leaf items beyond the optional "Workshop Surveys" clarification (decide in review).

---

## J. Sequence

1. Spec 17h (this) + ADR-0013 — **done**.
2. Preview mockup (single self-contained HTML, faithful to admin brand) → **owner approval**.
3. Per-wave TDD plan (`17h-wave-h-admin-nav-implementation-plan.md`) — written **after** the nod so
   it plans against the confirmed mapping.
4. Subagent-driven TDD build on `feat/wave-h-admin-nav` → whole-branch review → merge → SoT flush
   (incl. fixing the stale CLAUDE.md nav-count gotcha).
5. H-infra (custom domain) — independent ops step, any time.

## K. Open confirmations — RESOLVED (owner preview review, June 26 2026)
1. **Approvals → standalone top-level link** (pulled out of Workshops▾) so its pending badge is always visible.
2. **Surveys / Files / Financials placements confirmed as drafted:** Surveys under Workshops▾ (relabeled
   "Workshop Surveys"), Files under Automation▾, Financials a ▾ dropdown with Refunds nested.
3. **Approvals badge = `PENDING` only** (the `INFO_REQUESTED` / `COUNTER_OFFERED` broadening was declined).
4. **"Workshop Surveys" relabel confirmed.**
5. **Deferred (owner: keep as-is for now):** Refunds stays nested under Financials▾; promoting it beside
   Approvals for action-queue symmetry is a one-line tweak if revisited.
