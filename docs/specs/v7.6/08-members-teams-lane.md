# 08 — Members & Teams Lane (Setup-First "Flip")

> **Status (May 27 2026)**: Current priority. Supersedes the pre-flip campaign-creation flow. Implementation on branch `feat/assessment-setup-first` via subagent-driven development. Engine + seeds (Rockefeller / QSP v1+v2 / Scaling Up Full / LVA) already in prod and unaffected.

## Context

May 26 2026 Zoom — Jeff stopped feature work: the assessment module's order of operations is wrong. Today a coach creates a campaign and types people in *while* building it. Flip it: set up **Company → Team → Users first**, as their own lane, then a campaign just **picks an existing company + a subset of its users**.

Why: **reuse** (set people up once; future modules — e.g. one-page strategic plan — point at the same structure), **targeting** (send to *some* people, not all), **tracking** (coach sees companies they support + per-campaign who's done vs. who to nag).

**Reference = Esperto Assessments** (esperto.one), white-labeled "Scaling Up Toolkit" at scalinguptoolkit.com — the **incumbent we're replacing** (contract expires July 1 2026). Walked live May 27: nav Home/Members/Campaigns/Reports; **no separate Organization object** (a Company is a Team with `type=Company` at the root of one unified tree); members carry a **Level**; Add Campaign wizard = Variant → Details → **Participants (check members from the team tree)** → Overview. Screenshot workbook: `From Jeff/APP_scaling up assessemnt/navigation.xlsx`.

This is mostly **new UI on existing APIs** + a **wizard rewire**. No schema migration (`OrgRespondent.roleType` is an existing nullable column) — but a **legacy-data compatibility pass** is required.

## Relationship to the v7.6 roadmap

Consistent with the destination (replace Esperto by July 1) and contradicts none of the 9 locked v7.6 decisions — it **operationalizes decision #1** (coaches manage orgs + participants) with a UI the wireframe waves never specified, and relies on decision #3 (`Organization.ownerCoachId`). It changes the near-term *course*: priority shift, campaign-creation contract rewired to pick-existing, v1.5 "coach My Clients overview" pulled forward (Slice 5), and `navigation.xlsx`/Esperto UX added as a spec source. Access Groups (decisions #2/#6/#7) are orthogonal and untouched.

## Locked decisions (grilled + Codex/self review, May 27)

1. **(A+) Company = our `Organization`** (zero migration; campaigns keep `organizationId` FK), *presented* Esperto-style as a unified team tree with the company as the root node. Diverge from Esperto only where it allows cross-company campaigns / a single all-companies workspace — neither asked for.
2. **Single unified Members screen** `/portal/members`: companies as root nodes; expand → lazy-load that company's `OrgTeam` tree; select node → members panel; "not associated with any team" bucket per company. **Typed node contract** `{ kind: "organization" | "team" | "unassigned" }` so edits/deletes/breadcrumbs/imports branch cleanly.
3. **One "Add Team" modal** (Type = Company/Department/Team/Folder). Type=Company at root → `POST /api/organizations`; other types → `POST /api/organizations/[id]/teams`. **Guards:** Company is root-only; an existing `OrgTeam`'s type may NOT change to Company; a sub-team may NOT be reparented to root (schema can't convert a team into an Organization).
4. **Levels = Esperto's 6 exactly** (Leadership team member / Employee / Guest / CEO/Founder with team / CEO/Founder alone / CEO/Founder) on `roleType`; **exact slugs pulled from Esperto's member CSV export** (don't guess). Sequenced after the vertical slice (metadata, not contract-critical).
5. **Level *suggests* the campaign CEO; never silently sets it.** Pre-suggest a CEO/Founder-Level member; **require explicit single-CEO confirmation before save** (0 or >1 in selection → force a pick). The partial unique index is a guardrail, not product logic. (Same slice as #4.)
6. **Wizard picks an existing company only** (CTA to Members lane if none); no inline org creation.
7. **Member Import + single Add + CSV export**; defer xlsx/json/deactivate-all. **CSV idempotency explicit**: dedupe `(organizationId, normalizedEmail)` case/whitespace-insensitive, preserve campaign history, never duplicate by casing — verify existing bulk route enforces this; document.
8. **Post-creation participant add (CampaignDetail) = add-existing ONLY in v1** (no quick-add — avoids polluting the roster while the coach thinks they're adding "just to this campaign"). Persistent quick-add lives in the **wizard** with explicit "adds to {Company}'s roster" labeling.
9. **Nav "Members", heading "Members & Teams"** (Esperto-verbatim). Don't otherwise touch the sidebar.
10. **Coach landing augmentation only** (companies + per-campaign metrics total/new/invited/started/completed); defer Esperto Home chart/clock/calendar.
11. **Keep current wizard email handling**; defer Esperto Mail-timing controls.
12. **Coach lane first; visual = our brand components** (presentable by default); pixel-faithful Esperto layout deferred to Slice 2.

**Staged-progress mapping** (`AssessmentInvitation.status`): new = PENDING & `sentAt` null · invited = SENT · started = VIEWED · completed = SUBMITTED · REVOKED excluded.

## Reused backend (do NOT rebuild)

- Models (`src/prisma/schema.prisma`): `Organization(ownerCoachId)`, `OrgTeam`(hierarchical `parentTeamId`, `type`, `name`, `description`), `OrgRespondent`(`email`, `firstName`, `lastName`, `jobTitle`, `roleType` nullable, `teamId`), `AssessmentCampaign(organizationId` NOT NULL`)`, `AssessmentCampaignParticipant(isCEO`, partial-unique one CEO/campaign`)`.
- APIs (tested, `src/src/__tests__/api/organizations/`): `/api/organizations` CRUD; `/api/organizations/[id]/teams` CRUD + tree-build + cycle-detection + soft-delete cascade; `/api/organizations/[id]/respondents` CRUD; `/api/organizations/[id]/respondents/bulk` (CSV, team-path auto-create, skip/merge, 500 cap).
- Zod `src/src/lib/validations.ts` (team/respondent/campaign; `bulkRespondents` deprecated). CSV parser `src/src/lib/assessments/respondent-csv.ts`.
- Nav `src/src/components/nav/assessments-sidebar.tsx` (coach "My Organizations" placeholder L73-74 → repoint `/portal/members`).
- `CampaignWizard.tsx` (Step2 inline-create → removed; server helper `processBulkRespondentsForCreate` kept for BC). `CampaignDetail.tsx`. Coach landing `src/src/app/(portal)/portal/assessments/page.tsx`.

## Implementation — contract-first vertical slice

Prove the flip end-to-end first (de-risks the wizard rewire + legacy data); presentable brand components; pixel-faithful polish after. Each slice = shippable, gated by `CI=true npx next build --turbopack` + tests; TDD; subagent-driven development.

- **Slice 1 (THE FLIP, demoable):** `/portal/members` (list companies, Add Team dual-create + guards, Add Member single, members list, typed node contract, sidebar repoint) + wizard Step0 pick-existing-company / Step2 pick-existing-members (no quick-add yet; manual CEO) / `saveCampaign` drops `bulkRespondents` + CampaignDetail add-existing-only + **regression & legacy-data tests**.
- **Slice 2:** Members & Teams UX polish — unified lazy-load tree (company-as-root, unassigned bucket), pixel-faithful layout + brand colors, edit modals.
- **Slice 3:** Levels + CEO suggestion — `src/src/lib/assessments/respondent-levels.ts` (6 + Esperto slugs), respondent Zod `roleType`, Level column/form, suggested-CEO with explicit confirm.
- **Slice 4:** Bulk import (reuse route; idempotency) + CSV export + persistent quick-add (wizard, roster labeling).
- **Slice 5:** Coach landing companies + per-campaign metrics; CampaignDetail Team column + staged-progress icons.

## Risks
1. Wizard rewire (Slice 1) = breakage hot-spot; keep `processBulkRespondentsForCreate`/`bulkRespondents` (optional, deprecated); update tests, don't delete.
2. Legacy-data compat: existing inline-created campaigns, null `roleType`, orphan/no-team respondents, soft-deleted teams, existing participants must render + be selectable. Verify in Slice 1.
3. Add Team dual-create branch (#3): one modal → two endpoints; unit-test both paths + edit/move guards.
4. Heterogeneous tree (#2): typed node contract.
5. CEO designation (#5): never silent; explicit confirm.

## Out of scope (v1)
Add Team Signup/registration tab; top-level Reports lane + Summary Reports wizard; Edit-Campaign advanced tabs (Notifications/Relations/Mail-Log/Access); Esperto Home chart/clock/calendar; xlsx/json export + deactivate-all; Esperto wizard Mail-timing controls; admin-lane mirror.
