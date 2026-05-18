# Wireframe 21 — Admin Access Groups list

**Spec ref**: v7.6 Wave 5, locked May 15-17 2026 (Jeff impromptu meeting + 3 rounds of Codex adversarial review)
**Status**: Locked for Jeff review. Implementation contract for future subagent dispatches.
**Paired HTML**: [`src/public/wireframes-phase2/admin/21-admin-access-groups-list.html`](../../../src/public/wireframes-phase2/admin/21-admin-access-groups-list.html)
**Service-layer dependencies**: `canAccessTemplate` (INTERSECTION), `evaluateAccessChange`, `archiveAccessGroup` / `undeleteAccessGroup` / `hardDeleteAccessGroup`, `ACCESS_POLICY_VERSION` runtime flag (see `docs/specs/v7.6/02-service-layer-rules.md`)

---

## Layout

The screen mirrors the Wave 2 admin chrome (yellow wireframe banner, page heading, left sidebar with the "Assessments · Admin" brand mark, top breadcrumb bar). The sidebar nav highlights "Access Groups" as active. The breadcrumb is `Admin / Access Groups`.

The page body contains, in order from top to bottom:

1. **Page header row.** Title `Access Groups` + subtitle "Grant template access to coaches via group membership. A coach in multiple groups sees only templates that ALL their groups grant (INTERSECTION)." On the right side, a primary `+ New Access Group` button.
2. **Yellow INTERSECTION info banner.** Verbatim copy: "Access Groups grant template access to coaches via INTERSECTION semantics. A coach in multiple groups sees only templates that ALL their groups grant. `ACCESS_POLICY_VERSION` runtime flag controls policy (current: `v1.intersection`). See `docs/specs/v7.6/02-service-layer-rules.md`."
3. **Show-archived toggle row.** A `[x] Show archived` checkbox on the left, a small count summary on the right ("4 active · 1 archived"). Per the locked spec, archived groups are hidden by default in production; in this wireframe the toggle is rendered as ON so reviewers see the archived row visually.
4. **Access Groups table.** Columns: Name | Description | Coaches | Templates | Updated | Manage. Each row's Name is a link, and the Manage column renders a `›` chevron link — both navigate to Wireframe 22 (group detail). Archived rows are rendered at 55% opacity with italic name + `(Archived)` suffix, and the numeric columns show `—`.
5. **Service-layer surface card.** Dashed-border card titled "v7.6 service-layer surface" listing the relevant rules: `AccessGroup` schema, `canAccessTemplate`, `evaluateAccessChange`, `ACCESS_POLICY_VERSION` flag, archive/undelete/hard-delete lifecycle mutations.
6. **End note.** Final dashed grey card calling out: (a) the `+ New Access Group` button is admin-only via `isPrivilegedRole`; (b) the chevron leads to Wireframe 22; (c) aggregate analytics across templates owned by these groups live at Wireframe 23.

## Mock data

| Name                       | Description                                                                              | Coaches | Templates | Updated     | Archived? |
|----------------------------|------------------------------------------------------------------------------------------|---------|-----------|-------------|-----------|
| Scaling Up Coaches         | Default group — full INVITED suite + Scaling Up Assessment                               | 12      | 4         | 2 days ago  | no        |
| Chief AI Officer Coaches   | Restricted track — Scaling Up Assessment only                                            | 3       | 1         | 1 week ago  | no        |
| Beta Test Group            | Internal-only access for QA                                                              | 2       | 2         | 3 days ago  | no        |
| Legacy Pilots              | Archived — kept for audit; coaches still in group lose intersection access               | —       | —         | —           | yes       |

Sidebar nav items (in order): Dashboard, Users, Organizations, Templates, **Access Groups (active)**, Campaigns, Aggregate Report, Public Quizzes.

## Acceptance criteria

- [ ] Page renders the yellow wireframe banner citing v7.6 spec ref + the "← Back to Phase 2 index" link.
- [ ] Page header includes the `+ New Access Group` primary button (top-right).
- [ ] Yellow INTERSECTION info banner is visually distinct (warning/yellow palette) and references `ACCESS_POLICY_VERSION` and `docs/specs/v7.6/02-service-layer-rules.md`.
- [ ] Archived rows are visually muted (≤60% opacity, italic name, `(Archived)` suffix) and show `—` placeholders for numeric/date cells.
- [ ] All 4 mock rows render with the exact strings above; numeric columns are right-aligned with tabular numerals.
- [ ] Clicking the Name link OR the `›` chevron navigates to `22-admin-access-group-detail.html` (Wireframe 22).
- [ ] Service-layer surface card lists at minimum: `canAccessTemplate`, `evaluateAccessChange`, `ACCESS_POLICY_VERSION`, and the three lifecycle mutations (`archiveAccessGroup`, `undeleteAccessGroup`, `hardDeleteAccessGroup`).
- [ ] `+ New Access Group` button is admin-only when implemented (gate via `isPrivilegedRole`); the wireframe end note documents this requirement.
- [ ] Show-archived toggle is present; archived rows are hidden by default in implementation.
- [ ] Renders cleanly at 1280×800 viewport with Tailwind CDN + `_shared.css`.

## Implementation surface

- Files this drives when implemented:
  - `src/src/app/(dashboard)/admin/access-groups/page.tsx` (list view)
  - `src/src/components/access-groups/access-groups-table.tsx` (table presentational component)
  - `src/src/lib/access-control/access-groups.ts` (server-side query that loads groups + counts)
  - `src/src/app/api/access-groups/route.ts` (GET list, POST create)
- Spec cross-refs:
  - `docs/specs/v7.6/02-service-layer-rules.md` — `canAccessTemplate`, `evaluateAccessChange`, `ACCESS_POLICY_VERSION`, lifecycle mutations
  - `docs/specs/v7.6/05-wireframes-wave5.md` — Wave 5 deliverable shape (Wireframe 21)
  - `docs/specs/v7.6/07-bootstrap-runbook.md` — bootstrap policy (existing certified coaches start with zero groups)

---

**Decision provenance**: see `plans/history/v6-v7.5-archive.md` for the full Codex Round changelogs that produced this spec.
