# Wireframes Wave 5 (+ Wave 2 revisions) — Assessment Tool v7.6

**Spec ref**: v7.6, locked May 15-16 2026 (Jeff impromptu meeting + 3 rounds of Codex adversarial review)
**Status**: Locked. Future revisions land here, NOT in PLAN.md or another spec file.
**Cross-references**: [02-service-layer-rules](./02-service-layer-rules.md), [06-observability](./06-observability.md), [07-bootstrap-runbook](./07-bootstrap-runbook.md)

---

## Locked decisions implemented in this file

- **Decision 4** — Public quizzes = templates + public-mode config (existing `AssessmentCampaign.accessMode` shape already aligned; wireframes 04/10/11/10.5/12/13 stay as-shipped).
- **Decision 5** — NEW: admin aggregate reporting dashboard; v1 ships per-template global only (Wave 5 wireframe 23).
- **Decision 8** — Admin aggregate dashboard MVP shape: template selector + version selector, no filters / no placeholders on day 1.

## Wave 2 revisions (APPROVED with revisions)

Jeff verbatim May 15: *"I'm pretty happy with how they are in there, with the exceptions that we talked about today"*.

Required edits to Wave 2 (`src/public/wireframes-phase2/admin/`):

- **REMOVE** `13-admin-memberships.html` — Jeff: *"a coach is going to be expected to be admins of their own organizations"* (recording timestamp 4:51).
- **REVISE** `12-admin-user-detail.html` — drop the "Memberships" card on the coach detail page (no more per-org membership management at admin level). Replace with a thin "Owned Organizations" read-only list (org names that this coach owns; admin can view, not edit).
- **REDESIGN** `15-admin-template-access.html` — pivot from "per-coach grants table" to "Access Groups index" (list of groups + member count + template count + 'Manage' button per row). Per Jeff at recording timestamp 10:09.

## Wave 5 wireframes — deliverable shape per screen

Target: end of Friday May 22 2026 (addresses Round 1 M-5 + M-8 deliverable ambiguity).

Per screen:
- **HTML wireframe** at `src/public/wireframes-phase2/admin/<NN>-<slug>.html` — same conventions as Waves 1–2 (Tailwind CDN, Plus Jakarta Sans, mock data, wireframe banner citing v7.6 spec, "← Back to Phase 2 index" link, self-contained).
- **Markdown spec** at `docs/wireframes-phase2/wave5/<NN>-<slug>.md` — LLM-readable spec following the per-task section format used by the EXECUTION PLAN sections (path, spec ref, layout, mock data, acceptance criteria). Each markdown file MUST include: (1) v7.6 spec ref + recording timestamp, (2) screen layout description, (3) all mock data values verbatim, (4) acceptance criteria as a numbered list, (5) link to its paired HTML wireframe.

**HTML acceptance criteria (applies to every Wave 5 wireframe):** matches Wave 1–2 quality bar — visible at the documented index path, banner cites v7.6, no broken links to other wireframes, mobile-responsive if a participant-facing screen (Wave 5 has none, but the rule stays), passes a visual review pass against the markdown spec.

## Wave 5 deliverables

1. `admin/21-admin-access-groups-list.html` + `docs/wireframes-phase2/wave5/21-admin-access-groups-list.md`
   - List of groups, "+ New Access Group" button.
   - Columns: Name / Description / Coach count / Template count / Updated.
   - Soft-deleted (archived) groups hidden by default; "Show archived" toggle reveals them.

2. `admin/22-admin-access-group-detail.html` + `docs/wireframes-phase2/wave5/22-admin-access-group-detail.md`
   - Detail view: group metadata.
   - "Coaches in this group" table with add/remove + **"Bulk add certified coaches"** affordance (bootstrap policy — see [07-bootstrap-runbook](./07-bootstrap-runbook.md)).
   - "Templates this group accesses" table with add/remove.
   - Each add/remove triggers a confirmation modal showing `evaluateAccessChange` preview (before/after template set for each affected coach; warns on shrink-to-zero with explicit override).

3. `admin/23-admin-aggregate-report.html` + `docs/wireframes-phase2/wave5/23-admin-aggregate-report.md` — admin aggregate reporting dashboard.
   - **v1 MVP scope** (locked decision 8): template selector → version selector (defaults to latest published) → page renders distribution + per-section means + tier histogram across all submissions for that version.
   - NO time-range chip. NO group filter. NO per-org table.
   - Markdown spec MUST call out "deeper slicers deferred to v1.5" so the implementer doesn't render placeholders.
   - **Version-boundary contract (Round 1 H-7):** the dashboard explicitly aggregates per `AssessmentTemplateVersion`, NOT per template across versions. Rationale: per-section means and `countAchieved` only compare apples-to-apples within a single immutable version. UI: version dropdown labels each option as `v{versionNumber} — published {date}` and badges the latest as `(current)`. Future v1.5 enhancement (NOT in MVP): a "cross-version comparison" view that shows the intersection of stable section keys via `compareVersions(versionA, versionB)` from `template-service.ts`.

4. `admin/24-platform-nav-assessments-entry.html` + `docs/wireframes-phase2/wave5/24-platform-nav-assessments-entry.md`
   - Chrome wireframe showing the "Assessments" entry in the main Scaling Up platform top nav + the sidebar transition when entering the Assessments lane (per Jeff's call: *"appear on the assessments nav bar inside the scaling app platform... moves to the sidebar"*).

5. **W5-T11-revised**: `admin/11-admin-users-list.html` revision + `docs/wireframes-phase2/wave5/11-admin-users-list-revised.md`
   - Adds two filter chips matching the Service-Layer Rules definitions (addresses Round 1 M-5 + Round 2 M-1 + Round 3 M-1):
     - **"Zero effective templates"** — coaches whose computed `canAccessTemplate` returns false for EVERY active template in the platform. Captures certified coaches in multiple groups that intersect to empty (the operationally critical case for INTERSECTION semantics). This is the operationally relevant chip.
     - **"No group memberships"** — coaches with zero `AccessGroupCoach` rows (or all linked groups are archived). Captures the "never been added" case.
   - Acceptance criteria: (a) filter "Zero effective templates" returns a coach who is in two groups whose template sets do NOT overlap; (b) filter "No group memberships" excludes that coach (they DO have memberships, just no effective access); (c) both filters can be combined as an AND for a focused triage view.
   - Implementation note: "Zero effective templates" requires the service to enumerate active templates and call `canAccessTemplate` per coach × template — at v1 scale (<100 coaches × <10 templates) acceptable as a live query; v1.5 can cache.

## Wireframe wave dependency rule (updated)

- **Wave 1**: SHIPPED + APPROVED (May 12)
- **Wave 2**: SHIPPED + APPROVED with 3 revisions queued (May 15, this addendum)
- **Wave 3** (output / report wireframes): **UNBLOCKED** as of May 15 — Wave 2 approval criterion met. Sequencing TBD; not in this addendum's immediate scope.
- **Wave 5**: planned for May 22 EOW (4 new screens above).

---

**Decision provenance**: see `plans/history/v6-v7.5-archive.md` for the full Codex Round changelogs that produced this spec.
