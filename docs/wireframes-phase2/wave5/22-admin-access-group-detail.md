# Wireframe 22 — Admin Access Group detail (with evaluateAccessChange preview)

**Spec ref**: v7.6 Wave 5, locked May 15-17 2026 (Jeff impromptu meeting + 3 rounds of Codex adversarial review)
**Status**: Locked for Jeff review. Implementation contract for future subagent dispatches.
**Paired HTML**: [`src/public/wireframes-phase2/admin/22-admin-access-group-detail.html`](../../../src/public/wireframes-phase2/admin/22-admin-access-group-detail.html)
**Service-layer dependencies**: `canAccessTemplate` (INTERSECTION), `evaluateAccessChange` (transactional guard), `archiveAccessGroup` / `undeleteAccessGroup` / `hardDeleteAccessGroup`, `canManageCampaign` (revocation semantics for active campaigns), `AuditLog` transactional writes (NOT `logAudit()` wrapper). See `docs/specs/v7.6/02-service-layer-rules.md`.

---

## Layout

The screen reuses the Wave 2 admin chrome (sidebar with "Access Groups" highlighted as active, top breadcrumb `Admin / Access Groups / Scaling Up Coaches`).

Page body, top to bottom:

1. **Page header row.** Title `Scaling Up Coaches` followed by an inline `Active` status pill (green). Right side: secondary buttons `Archive group` and `Edit metadata`.
2. **Group metadata card.** Read-only attribute grid. Two columns: Name, ACCESS_POLICY_VERSION (renders the value `v1.intersection` as code), Description (spans both columns), Created by, Created at, Updated at, Archived/deletedAt (renders italic "— not archived" when null).
3. **Coaches in this group** section. Header text "Coaches in this group" + subtitle "4 of 12 shown. Removing a coach runs the access-change guard against their remaining groups." Buttons on the right: `Bulk add certified coaches` (secondary, per bootstrap policy in `07-bootstrap-runbook.md`) and `+ Add Coach` (primary). Table with columns: Name | Email | Joined | Action (Remove button).
4. **Templates this group accesses** section. Header text + subtitle "Removing a template runs the access-change guard against ALL coaches in this group." Right side: `+ Add Template` (primary). Table with columns: Template name | Alias | Coaches gaining access | Coaches losing access if removed | Action (Remove button). The "Scaling Up Assessment" row carries a 👑 CEO_ONLY glyph next to the name.
5. **evaluateAccessChange preview panel — STATIC.** Rendered inline (NOT a click-driven modal) so reviewers see the structure. Panel chrome is bordered in warning yellow with a header strip showing the title "Access change preview — review before saving" plus an italic hint "Triggered automatically when admin removes a coach or template".
   - **Context line** explains the proposed change: "Remove template `Vision Alignment` from group `Scaling Up Coaches`" + a description of how `evaluateAccessChange` runs (SERIALIZABLE isolation, advisory locks, BLOCKED_ZERO_ACCESS guard).
   - **Two columns**: BEFORE | AFTER. Each lists the same 4 sample coaches with their effective template sets and a count line ("4 templates · in 1 group" before, "3 templates (-1) · in 1 group" after). The struck-through "Vision Alignment" in AFTER is rendered red with `line-through`.
   - **Summary callout** (green): "Summary across all 12 affected coaches: all 12 drop from 4 → 3 effective templates. Zero coaches hit zero-access — no BLOCKED_ZERO_ACCESS 409 fires. Active campaigns using Vision Alignment stay manageable in read-only mode per canManageCampaign revocation rules."
   - **Force-this-change toggle** (illustrative): unchecked checkbox + explanation that the toggle is only required when a coach would hit zero AND owns campaigns/orgs; checking writes `AuditLog.action="FORCE_ZERO"` with a mandatory reason field.
   - **Action row**: secondary `Cancel` + primary `Confirm change`.
6. **Service-layer surface card** (dashed border): lists the rules referenced — `canAccessTemplate`, `evaluateAccessChange` (transaction semantics), lifecycle mutations, `canManageCampaign` revocation, `BLOCKED_ZERO_ACCESS` / `force=true` flow.
7. **End note**: documents that the preview is STATIC in the wireframe; in production it triggers on any Remove click; Cancel reverts; Confirm runs the transaction and emits the `assessment.access.change.outcome` metric per `06-observability.md`.

## Mock data

**Group metadata:**

| Field | Value |
|-------|-------|
| Name | Scaling Up Coaches |
| ACCESS_POLICY_VERSION | `v1.intersection` |
| Description | Default group — full INVITED suite + Scaling Up Assessment |
| Created by | admin@scalingup.com |
| Created at | May 16, 2026 09:14 EDT |
| Updated at | May 15, 2026 16:42 EDT (2 days ago) |
| deletedAt | null ("— not archived") |

**Coaches in this group (4 of 12 shown):**

| Name | Email | Joined |
|------|-------|--------|
| Sarah Mitchell | sarah.mitchell@scalingup.com | May 16, 2026 |
| James Park | james.park@scalingup.com | May 16, 2026 |
| Diane Chen | diane.chen@scalingup.com | May 16, 2026 |
| Marcus Webb | marcus.webb@scalingup.com | May 16, 2026 |

**Templates this group accesses:**

| Template name | Alias | Coaches gaining access | Coaches losing access if removed |
|---------------|-------|------------------------|----------------------------------|
| Rockefeller Habits Checklist | rockefeller-habits | 12 | 0 |
| Vision Alignment | vision-alignment | 12 | 12 |
| Quarterly Strategic Priorities v2 | qsp-v2 | 12 | 0 |
| Scaling Up Assessment 👑 | scaling-up-assessment | 12 | 9 |

**Preview content (proposed change = remove `Vision Alignment` from `Scaling Up Coaches`):**

| Coach | Before | After | Delta |
|-------|--------|-------|-------|
| Sarah Mitchell | Rockefeller, Vision Alignment, QSP v2, Scaling Up Assessment | Rockefeller, ~~Vision Alignment~~, QSP v2, Scaling Up Assessment | 4 → 3 (-1) |
| James Park | (same 4) | (same 3) | 4 → 3 (-1) |
| Diane Chen | (same 4) | (same 3) | 4 → 3 (-1) |
| Marcus Webb | (same 4) | (same 3) | 4 → 3 (-1) |

Summary: all 12 affected coaches drop 4 → 3 templates. Zero coaches land at zero. No `BLOCKED_ZERO_ACCESS` fires.

## Acceptance criteria

- [ ] Yellow wireframe banner at top cites v7.6 spec ref + `evaluateAccessChange` static-render note.
- [ ] Breadcrumb reads `Admin / Access Groups / Scaling Up Coaches`; "Access Groups" links back to Wireframe 21.
- [ ] Page title shows group name + green "Active" status pill.
- [ ] Group metadata card renders all 7 fields exactly as listed above, including the `v1.intersection` value in code formatting and italic "— not archived" for null `deletedAt`.
- [ ] Coaches table renders 4 mock rows with the exact strings above; each row has a Remove button.
- [ ] Templates table renders 4 mock rows including the 👑 glyph next to "Scaling Up Assessment".
- [ ] "Bulk add certified coaches" button is present on the coaches table header (per bootstrap policy `07-bootstrap-runbook.md`).
- [ ] **evaluateAccessChange preview is rendered as STATIC content on the page** (not behind a click). The preview MUST show:
  - [ ] The context line naming the proposed mutation
  - [ ] Two columns labeled "Before" and "After"
  - [ ] Per-coach delta in each column with a count line (e.g., "4 templates → 3 templates (-1)")
  - [ ] Struck-through styling for templates being removed in the AFTER column (rendered in destructive red)
  - [ ] A summary callout describing the total impact
  - [ ] A "Force this change anyway" toggle with explanation
  - [ ] Cancel + Confirm action buttons
- [ ] Service-layer surface card lists `canAccessTemplate`, `evaluateAccessChange`, lifecycle mutations, `canManageCampaign` revocation semantics, and the `BLOCKED_ZERO_ACCESS` / `force=true` behavior.
- [ ] End note explicitly describes how the modal triggers in production (Remove button click), what Confirm emits (`assessment.access.change.outcome` metric), and cross-references Wireframe 23 for aggregate analytics.
- [ ] No coach in the BEFORE/AFTER preview is highlighted red unless their AFTER count is zero. In this mock data, no coach hits zero, so no red name appears — the styling exists in CSS but only triggers when AFTER === 0.
- [ ] Renders cleanly at 1280×800 with Tailwind CDN + `_shared.css`.

## Implementation surface

- Files this drives when implemented:
  - `src/src/app/(dashboard)/admin/access-groups/[id]/page.tsx` (detail view server component)
  - `src/src/components/access-groups/access-group-detail.tsx` (client component with state for membership + template mutations)
  - `src/src/components/access-groups/evaluate-access-change-preview.tsx` (preview modal component, opened by Remove handlers)
  - `src/src/lib/access-control/evaluate-access-change.ts` (the SERIALIZABLE transactional guard)
  - `src/src/app/api/access-groups/[id]/coaches/route.ts` (POST add, DELETE remove)
  - `src/src/app/api/access-groups/[id]/templates/route.ts` (POST add, DELETE remove)
  - `src/src/app/api/access-groups/[id]/archive/route.ts` (POST archive, runs same guard)
- Spec cross-refs:
  - `docs/specs/v7.6/02-service-layer-rules.md` — transactional commit shape, advisory-lock ordering, BLOCKED_ZERO_ACCESS / force=true semantics, audit trail rules
  - `docs/specs/v7.6/06-observability.md` — `assessment.access.change.outcome` metric labels (`op ∈ {ADD_COACH, REMOVE_COACH, ADD_TEMPLATE, REMOVE_TEMPLATE, ARCHIVE_GROUP, UNDELETE_GROUP, HARD_DELETE_GROUP, FORCE_ZERO}`)
  - `docs/specs/v7.6/07-bootstrap-runbook.md` — "Bulk add certified coaches" affordance comes from the bootstrap step that must be run after deploy
  - `docs/specs/v7.6/05-wireframes-wave5.md` — Wave 5 deliverable shape (Wireframe 22)

---

**Decision provenance**: see `plans/history/v6-v7.5-archive.md` for the full Codex Round changelogs that produced this spec.
