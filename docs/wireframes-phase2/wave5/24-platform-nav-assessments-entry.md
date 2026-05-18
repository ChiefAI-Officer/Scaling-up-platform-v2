# Wireframe 24 — Platform Nav: Assessments entry (chrome only)

**Spec ref**: v7.6 Wave 5, locked May 15-17 2026 (Jeff impromptu meeting + 3 rounds of Codex adversarial review). Source: Jeff's May 15 standing call — *"appear on the assessments nav bar inside the scaling app platform… moves to the sidebar."*
**Status**: Locked for Jeff review. Implementation contract for future subagent dispatches.
**Paired HTML**: [`src/public/wireframes-phase2/admin/24-platform-nav-assessments-entry.html`](../../../src/public/wireframes-phase2/admin/24-platform-nav-assessments-entry.html)
**Service-layer dependencies**: `canAccessAggregateReport` (admin/staff gate for the sidebar's Aggregate Report entry), `isPrivilegedRole` (admin chrome). See `docs/specs/v7.6/02-service-layer-rules.md`.

---

## Layout

A **chrome-only** integration wireframe demonstrating how the Assessment Tool plugs into the existing Scaling Up Platform v2 dashboard nav. NO mock business data beyond nav labels and a couple of placeholder dashboard stat cards for visual orientation.

Page body, top to bottom:

1. **Yellow info banner** quoting Jeff verbatim ("appear on the assessments nav bar inside the scaling app platform… moves to the sidebar") and identifying the implementation surface: `src/src/app/(dashboard)/layout.tsx` and `src/src/components/nav/`.
2. **Split view** — two side-by-side panes labeled BEFORE / AFTER:
   - **LEFT pane** (`Default state — workshop platform`): renders the existing 14-item top nav (Dashboard, All Workshops [active], Bio, Templates, Workflows, Surveys, **Assessments** [new — dashed yellow highlight], Files, Partners, Coaches, Approvals, Categories, Pricing, Financials). NO sidebar. Main area shows the workshop dashboard's existing stat cards + skeleton list rows.
   - **RIGHT pane** (`After clicking Assessments — assessments lane`): same 14-item top nav with **Assessments** now active (solid primary highlight). A new sidebar appears on the left with assessment-lane nav: Dashboard / Organizations / Access Groups / Templates / Campaigns / Public Quizzes / Aggregate Report. Plus a "Coach lane" section below (My Campaigns / My Organizations) shown only when actor is COACH. Main area shows an Assessments dashboard with stat cards (Active campaigns, Templates, Submissions MTD).
3. **Transition arrow note** under the split view, restating: "Top nav stays put. The platform pivots from no-sidebar (workshops lane) to sidebar-revealed (assessments lane)."
4. **Acceptance + implementation card** — dashed-border card with bulleted spec covering:
   - Position of the new "Assessments" entry (between Surveys and Files, suggested).
   - Existing 13 nav items remain unchanged.
   - Route convention (`/assessments` for coach lane, `/admin/assessments` for admin context).
   - The assessment lane introduces the first dashboard-route sidebar (visually parallel to coach portal's existing sidebar but with assessment-specific nav).
   - Role gating: top nav entry visible to ADMIN + STAFF + COACH; Aggregate Report sidebar entry visible only to ADMIN + STAFF via `canAccessAggregateReport`; Coach-lane section visible only to COACH.
5. **End note** documenting implementation files: `src/src/app/(dashboard)/layout.tsx` (top nav addition), `src/src/app/(dashboard)/assessments/layout.tsx` (new sidebar shell), `src/src/components/nav/assessments-sidebar.tsx` (sidebar nav component).

## Mock data

This is a chrome wireframe — only nav labels and minimal stat-card placeholders.

**Top nav items (14, in order, both panes):**

Dashboard / All Workshops / Bio / Templates / Workflows / Surveys / **Assessments** (NEW) / Files / Partners / Coaches / Approvals / Categories / Pricing / Financials.

**Assessment-lane sidebar (RIGHT pane, top section "Assessments"):**

Dashboard (active) / Organizations / Access Groups / Templates / Campaigns / Public Quizzes / Aggregate Report.

**Assessment-lane sidebar — Coach-lane section (RIGHT pane, bottom):**

My Campaigns / My Organizations.

**Stat-card placeholders:**

- LEFT pane (workshops dashboard): Active 23 / Pending 4 / Revenue MTD $48k.
- RIGHT pane (assessments dashboard): Active campaigns 7 / Templates 5 / Submissions MTD 144.

## Acceptance criteria

- [ ] Yellow wireframe banner cites v7.6 spec ref + "Chrome only — no mock data beyond nav labels" note.
- [ ] Split view shows two panes labeled BEFORE / AFTER (or equivalent default-state / assessments-lane labels).
- [ ] LEFT pane: top nav shows all 14 items in the listed order; "Assessments" is highlighted as a NEW entry (dashed yellow border); "All Workshops" is the active item; NO sidebar appears.
- [ ] RIGHT pane: top nav shows all 14 items; "Assessments" is now the active item (solid primary highlight); a sidebar appears on the left with the listed 7 assessment-lane entries plus a Coach-lane group.
- [ ] Existing 13 nav items remain unchanged across both panes (verified by side-by-side comparison).
- [ ] Top nav uses `overflow-x-auto` (mobile responsive) — the new "Assessments" entry shrinks/scrolls with the rest of the nav.
- [ ] Acceptance + implementation card lists at minimum: nav position rule, route convention, sidebar introduction note, role gating (ADMIN/STAFF/COACH visibility per entry), `canAccessAggregateReport` gate.
- [ ] End note documents implementation files: `src/src/app/(dashboard)/layout.tsx`, `src/src/app/(dashboard)/assessments/layout.tsx`, `src/src/components/nav/assessments-sidebar.tsx`.
- [ ] No mock business data on the page beyond a small set of stat-card placeholders for visual orientation.
- [ ] Renders cleanly at 1280×800 with Tailwind CDN + `_shared.css`.

## Implementation surface

- Files this drives when implemented:
  - `src/src/app/(dashboard)/layout.tsx` — add "Assessments" entry to the existing 13-item top nav between Surveys and Files; preserve `overflow-x-auto` mobile behavior.
  - `src/src/app/(dashboard)/assessments/layout.tsx` — NEW: dashboard-lane child layout that renders the assessment sidebar.
  - `src/src/components/nav/assessments-sidebar.tsx` — NEW: client component for the sidebar nav; reads session role and conditionally renders the Aggregate Report entry (admin/staff) and Coach-lane group (coach).
  - `src/src/app/(dashboard)/assessments/page.tsx` — landing dashboard for the assessments lane (target route from the top nav click).
- Spec cross-refs:
  - `docs/specs/v7.6/02-service-layer-rules.md` — `canAccessAggregateReport` (admin/staff), `isPrivilegedRole` (admin chrome)
  - `docs/specs/v7.6/05-wireframes-wave5.md` — Wave 5 deliverable shape (Wireframe 24)
  - Wireframes 21, 22, 23 — sidebar entries link to these screens
  - `CLAUDE.md` — "Nav bar has 13 items" gotcha (will become 14 after this lands)

---

**Decision provenance**: see `plans/history/v6-v7.5-archive.md` for the full Codex Round changelogs that produced this spec.
