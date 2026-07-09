# Spec 19ab — Wave Z: wire the three "coming soon" Assessments admin pages

> **Status:** SCOPED + /grill-with-docs (7 product decisions) + /grill-me (6 impl decisions) + /co-validate ×2 (round 2 caught a ship-broken dead-end + simplified the detail page — reversed the shared-helper call) — awaiting user greenlight (gated wave). No code yet.
> **Roadmap:** Jul-8 progress-report target #3 of 3 (the last one). Targets #1 (Wave U3 email findings) and #2 (templates-list View==Edit) are LAUNCHED.
> **Wave home:** Wave Z (next letter after Wave Y). Spec seq `19ab` (after `19aa`).

## Context / the reframe

The Assessments sidebar (`assessments-sidebar.tsx`) marks three entries `placeholder:true`, so they render dimmed and **404 on click**: **Organizations** (`/admin/assessments/organizations`), **Campaigns** (`/admin/assessments/campaigns`), **Public Quizzes** (`/admin/assessments/public-quizzes`).

Investigation (2026-07-08) shows these are **NOT build-from-scratch** — the backend and most UI already exist; the pages are unbuilt/unwired shells:

- **Public Quizzes** is **already built and orphaned.** A complete admin page lives at `/admin/assessments/public-campaigns` (`PublicCampaignsManager` — lists + creates PUBLIC-access campaigns = public quizzes; public-facing routes `/quiz/[alias]` + `/org-survey/[alias]` are live). The sidebar points a 404 placeholder at `/public-quizzes` *instead of* linking the real page. Wireframe `20-admin-public-wizard-flow.html` matches it.
- **Campaigns** — full `assessment-campaigns` API + `CampaignsListWithFilter` (groups campaigns by company) + `CampaignDetail` + `CampaignWizard`. Coaches already get this at `/portal/assessments` (own campaigns). No admin equivalent. **No dedicated wireframe.**
- **Organizations** — full `/api/organizations` API (`[id]`, respondents, teams, bulk) + a complete `components/organizations/` suite (`MembersTeamsView`, add/edit member+team, import). Coaches manage their orgs at `/portal/members`. No admin equivalent. **No dedicated wireframe.**

**Authorization is already admin-ready** (verified, so this stays a thin-shell wave, not an authz project):
- `canAccessOrganization()` returns `true` for `isPrivilegedRole(actor.role)` → admin/STAFF already have full access to any org via all org routes ([id], respondents, teams, bulk).
- `assessment-campaigns` GET drops the `createdByCoachId` filter for privileged actors (admin sees ALL campaigns); `assessment-campaigns/[id]` and sub-routes allow any campaign for privileged actors. No authz change needed.

## Decisions (grilled + confirmed by user 2026-07-08)

1. **Public Quizzes → rewire** to the existing `/admin/assessments/public-campaigns` page (drop the placeholder). Not a new page.
2. **Campaigns → all-campaigns oversight list** reusing `CampaignsListWithFilter` fed ALL campaigns, with drill-down into `CampaignDetail`. Management actions already live on `CampaignDetail`; this page is the admin monitor + entry.
3. **Organizations → all-orgs directory + manage** reusing `MembersTeamsView` fed ALL orgs, so admin/STAFF view + manage members/teams for any company.

**Defensible minor calls (flag if you disagree):**
- Public Quizzes keeps the sidebar **label "Public Quizzes"** but points at `/public-campaigns`; the page's breadcrumb/title changes "Public Campaigns" → "Public Quizzes" for consistency. (Alternative: rename the route — more churn, not worth it.)
- **Org creation is OUT OF SCOPE.** Orgs are coach-owned (`ownerCoachId`, non-null); they're created in the coach/campaign flow. The admin Organizations page views + manages members/teams of EXISTING orgs. (An admin "create org for coach X" flow would need an owner-picker — a separate, later item.)
- Admin campaign detail = a thin admin shell reusing the `CampaignDetail` component (the component's APIs already admit admin). Needed because the only current `CampaignDetail` host is the `requireCoach()` portal page.

## Work items

**Z-1 — Public Campaigns rewire (trivial, presentation). [grill: label resolved]**
- `assessments-sidebar.tsx`: relabel the entry **"Public Quizzes" → "Public Campaigns"** (glossary avoids "quiz"; matches the existing page), set `href:"/admin/assessments/public-campaigns"`, remove `placeholder:true`. Captured in CONTEXT.md ("Public Campaign").
- Existing `public-campaigns/page.tsx` already titled "Public Campaigns" — **no retitle needed.**
- **[grill-me] Smoke-verify before shipping:** the page has been *orphaned* (no nav entry) since Task 8, so render it as admin + confirm the list loads and the create form is intact (ideally a throwaway PUBLIC create on a local pilot) BEFORE the rewire lands. If broken, the fix folds into Z-1 (and Z-1 is no longer "minutes"). Do not rewire blind into an unexercised page.
- New admin pages (Z-2/Z-3) mirror the existing `public-campaigns/page.tsx` gate exactly: `getServerSession` role check → redirect non-ADMIN/STAFF to `/unauthorized`.
- No new page/route/API. Kill = revert.

**Z-2 — Admin Campaigns oversight (thin shells + TWO backward-compatible component props).**
- New `/(dashboard)/admin/assessments/campaigns/page.tsx` — server component, admin/STAFF gate; load all non-deleted **`accessMode = INVITED`** campaigns across ALL companies, **all statuses (DRAFT/ACTIVE/CLOSED, incl. imported historical)**, grouped by org, compute `computeCampaignStatusMetrics`, render `CampaignsListWithFilter` with `detailBasePath="/admin/assessments/campaigns"`. **[grill: scope resolved]** **Exclude `accessMode = PUBLIC`** — a *product* separation (PUBLIC self-enroll campaigns live on the "Public Campaigns" page; the two flows stay distinct), NOT a technical constraint — PUBLIC campaigns DO have a non-null `organizationId` and would group fine (correcting the earlier "org-less" claim). Mirrors the coach "My Campaigns" view (which is INVITED-only) but across every company.
- New `/(dashboard)/admin/assessments/campaigns/[id]/page.tsx` — server component, admin/STAFF gate. **[REVISED by /co-validate round 2 — supersedes the earlier "shared helper / full parity" call]** The admin page calls the **existing shared building blocks directly** — `getCampaignOverview(detailDb, id)`, `getCampaignRespondents(detailDb, id)`, `canViewGroupReport(asAccessDb(db), actor, id)` (admits privileged → group-report link renders + works: the `(report)` layout is auth-free and the report page's own gate admits admin), the custom-slides helper (`isCustomSlidesEnabled` + `toCustomSlides`), and the HTML-email flag. **No portal refactor, no shared wrapper** — these are already shared functions, so calling them directly is drift-free, and the just-recovered-from-a-P0 live coach page is left untouched. The admin page does its OWN `getApiActor()` + `canManageCampaign(read)` check and, on fail, redirects to the **admin** campaigns list (never a `/portal/*` path). **Longitudinal is OMITTED for admin: pass `longitudinalRespondentIds={[]}`** — the per-row "Over time" link (`CampaignDetail:1750`) targets a `requireCoach()`-only route with no admin equivalent, and the eligibility predicate is coach-agnostic so full parity would render live dead-ends (worst on imported multi-round campaigns — the admin page's headline case). Treating admin as a reduced-nav variant (like Trends, already suppressed) fixes it with no new prop and drops an N+1 eligibility loop.
- `CampaignsListWithFilter`: add optional prop `detailBasePath?: string` (default `"/portal/assessments"`); the two hardcoded `/portal/assessments/${c.id}` hrefs live in the child **`CompanySection`** (lines ~92/113) — **thread the prop through `CompanySection`**, not just the top-level function. Backward-compatible.
- **`CampaignDetail` host-context prop (REQUIRED — R-B).** **[grill: authority resolved]** Admin/STAFF get the **FULL management surface** — Close/Discard, Delete (soft, blast-radius confirm), Remove participant, Send Reminders, Resend invite, Activate — on ANY campaign (the APIs already admit privileged actors, so hiding buttons would be theatre; this is an intervention console). The host prop suppresses **only broken navigation**, never actions. `CampaignDetail` hardcodes **five** `requireCoach()`-guarded portal dead-ends that bounce admin→`/dashboard` and **STAFF→`/unauthorized`**: (1) post-delete `router.push("/portal/assessments")` (~L395) → redirect to the admin list via `basePath`; (2) "Back to Assessments" (~L1008) → `basePath`; (3) "View Trends" `/portal/assessments/trends` (~L1031, **no admin trends page**) → suppress; (4) empty-state "Add members" `/portal/members` (~L1879) → suppress; (5) **[co-validate rd2] per-respondent "Over time" longitudinal link** (~L1750 → `/portal/assessments/respondents/[id]/longitudinal`, `requireCoach()`-only, **no admin route**) → **resolved by passing `longitudinalRespondentIds={[]}`** (the link is fully gated by that set — no suppression prop needed). Add a `basePath`/`backHref` prop for (1)+(2), suppress (3)+(4). Backward-compatible (portal passes nothing → current behavior). CLOSED/imported campaigns already auto-disable send/invite internally, so historical rounds stay read-mostly. *(Verified admin-SAFE, NOT suppressed: group-report link, per-respondent report link, CSV exports, custom-slides PATCH, DELETE — all resolve to auth that admits privileged.)*
- `assessments-sidebar.tsx`: "Campaigns" → `href:"/admin/assessments/campaigns"`, remove placeholder.

**Z-3 — Admin Organizations directory + manage (thin shell + one component prop).**
- New `/(dashboard)/admin/assessments/organizations/page.tsx` — server component, admin/STAFF gate; load ALL non-deleted orgs as `OrgSummary[]` (mirror `/portal/members` mapping, minus the coach filter); render `MembersTeamsView` with the new admin-host prop below.
- Org member/team/edit/import-CRUD APIs already admit admin (`canAccessOrganization`), so those work with no route change.
- **`MembersTeamsView` host-context prop (REQUIRED — R-C). [grill: surface resolved]** Admin/STAFF get **full roster management on any org**: add/edit member, member delete/remove, add/edit team, **rename org** (EditOrganizationModal), **CSV member import** (ImportMembersModal → the admin-allowed `respondents/bulk` route). Team creation *under an existing org* stays (uses `canAccessOrganization`). **Hidden in the admin host** (needs the prop): (1) "Add Company" / org-create — `AddTeamModal` company path `POST /api/organizations` **403s** for a non-coach (`organizations/route.ts:74`); orgs are coach-owned (`ownerCoachId`), admin-create would need an owner-picker = out of scope. (2) "Import from Esperto" (~L587) → `/portal/members/import`, a `requireCoach()` bounce (admin has its own `/admin/assessments/import`). **No org-DELETE** — the component exposes none today (the `[id]` DELETE route exists but is unwired here); keep it out (whole-company delete cross-coach = high blast radius). Prop e.g. `allowOrgCreate=false` / `hideEspertoImport`. Backward-compatible (portal passes nothing → current behavior).
- `assessments-sidebar.tsx`: "Organizations" → `href:"/admin/assessments/organizations"`, remove placeholder.

**Z-4 — Sidebar + nav cleanup.**
- After Z-1..Z-3, no `placeholder:true` entries remain. Keep the placeholder rendering path (harmless; a future entry may reuse it) but confirm nothing else depends on those three being placeholders.
- Check `lib/nav/admin-nav-model.ts` — if it also homes these routes, keep it consistent (the assessments sub-nav is `assessments-sidebar.tsx`; verify no drift).

**Z-5 — Tests.** (Test **STAFF explicitly**, not just ADMIN — `requireCoach()` diverges: ADMIN→`/dashboard`, STAFF→`/unauthorized`, so STAFF is the worse case for every portal dead-end being fixed.)
- `assessments-sidebar.test.tsx`: flip the three entries' assertions from placeholder → real hrefs (assert not-dimmed, correct href). The review-loop watches for this assert-flip.
- Admin Campaigns page: renders for ADMIN + STAFF, redirects others; feeds only INVITED campaigns grouped by company (**asserts PUBLIC campaigns are excluded**); drill-down link uses the admin base path.
- Admin campaign detail page: ADMIN + STAFF gate; renders `CampaignDetail`; **Back link + post-delete redirect target the admin base path, NOT `/portal/assessments`**; Trends + members-import affordances suppressed; **no per-respondent "Over time" longitudinal links** (`longitudinalRespondentIds={[]}`) even on an imported multi-round campaign whose respondents would otherwise be eligible; group-report link **present** (admin-safe). `canManageCampaign(read)` fail → redirect to the admin list, not `/portal`.
- `CampaignsListWithFilter`: default href unchanged (portal regression) + `detailBasePath` override threads into `CompanySection`.
- `CampaignDetail`: default (portal) nav unchanged (regression) + admin host props redirect Back/post-delete to the admin base path and hide Trends/members-import.
- Admin Organizations page: ADMIN + STAFF gate; feeds ALL orgs; `MembersTeamsView` renders with org-create + Esperto-import affordances hidden (assert the "Add Company" org-create path and the `/portal/members/import` link are absent in the admin host); default (portal) shows them (regression).
- Public Quizzes: sidebar links `/public-campaigns`; page title reads "Public Quizzes".

## Out of scope
- Org creation from the admin page (owner-picker) — later item.
- Any new campaign/org/quiz capability — this wave only WIRES existing, tested functionality.
- Reworking `CampaignDetail`/`MembersTeamsView`/`PublicCampaignsManager` internals.
- Pagination for very large campaign/org lists (note as a follow-on if counts grow).

## Risks (updated post /co-validate — the two component breakages are now work items, not risks)
- **~~`CampaignDetail`/`MembersTeamsView` coach assumptions~~ → CONFIRMED breakages, budgeted in Z-2 (R-B) + Z-3 (R-C).** Both reused components hardcode `requireCoach()`-guarded portal navigation and (for `MembersTeamsView`) an org-create button that 403s for admin. The mitigation is a backward-compatible host-context prop on each — no longer a "verify during TDD" hope.
- **Query cost (Campaigns list only)** — the all-campaigns metrics query pulls `participants` + `invitations` for every INVITED campaign system-wide (a heavy include, not just row count). Acceptable at current volumes; **pagination / a lighter metrics query is a named follow-on** if campaign counts grow. **Organizations is NOT affected** — its load is a light 4-field org-summary list; members/teams fetch lazily on click (grill-me round 2, #4). The all-orgs left panel is a visual concern only.
- **Flagging** — presentation/wiring only, admin-only surface over data admins already reach via the APIs (no new trust boundary — co-validated); no feature flag (mirrors Wave R/W flagless presentational changes). Kill = revert-commit.
- **Residual `CampaignDetail` verification** — beyond the four hardcoded links found, confirm during TDD that no *other* affordance links into `/portal/*`; the admin host prop must cover all of them.

## Verification
- `CI=true npx next build --turbopack` green.
- Targeted Jest on the sidebar test, the two new admin pages, the list-component prop, and the org page.
- Live Playwright smoke (explicit, on request): as admin, open all three newly-wired entries → Public Quizzes loads the manager, Campaigns lists every company's campaigns + drills into detail, Organizations lists every company + opens members/teams.
- House rules: TDD/subagent-driven; SoT on push (CLAUDE.md anchor + CHANGELOG); Notion task; jest-verified counts.

## Phasing [grill: resolved — split]
Two PRs:
1. **PR-1 = Z-1** (Public Campaigns sidebar rewire) — standalone, ships first/immediately; fixes the orphaned-page bug with a ~3-line change + a sidebar test flip.
2. **PR-2 = Z-2 + Z-3** — the two thin admin pages + the three host-context props + tests, as one reviewed PR.
Both flagless (presentation/wiring); each through TDD + adversarial review + the build gate.

## Grill-me round 2 resolutions (2026-07-08, implementation design tree)
1. ~~**Admin campaign-detail = full parity via a shared helper `buildCampaignDetailProps`.**~~ **SUPERSEDED by /co-validate round 2** — the admin page instead calls the existing shared building blocks DIRECTLY (no portal refactor, no wrapper, zero drift) and **omits longitudinal** (`longitudinalRespondentIds={[]}`). Full parity was actively harmful: it manufactured a 5th portal dead-end (the coach-agnostic "Over time" link) and risked the live coach page for ~4 lines of drift. See §7 round 2 + Z-2. *(Q1 revised)*
2. **List: extract the pure `toCampaignListItems(rows)` mapper** (shared, no metrics drift); each page keeps its own `where` (portal `createdByCoachId`; admin `accessMode:"INVITED"`, all coaches). Defensible engineering call.
3. **Group-report link is SAFE for admin** — the `(report)` layout is auth-free (brand wrapper only) and `viewGroupReport`/`canViewGroupReport` admit privileged, so the link the helper renders for admin works end-to-end. NOT a dead-end (unlike the portal Back/Trends/members links, which R-B still suppresses).
4. **Organizations load is cheap** — `OrgSummary` is 4 scalar fields; `MembersTeamsView` fetches teams/members LAZILY per node-select via the admin-allowed APIs. Admin loading ALL orgs is a light query; the long left panel is a *visual* concern only (pagination = follow-on). Downgraded from a risk.
5. **Z-1 = flip + smoke-verify** the orphaned page before shipping (see Z-1).
6. **Testing by precedent** — server pages tested by importing the default export + mocking `getServerSession` (e.g. `assessment-respondent-report-page.test.tsx`); reused-component tests (`CampaignsListWithFilter.test.tsx`, `members-teams-view.test.tsx`) extended for the new props + guard the portal regression. Test STAFF explicitly.

## Grill resolutions (2026-07-08, /grill-with-docs)
1. **Nav label → "Public Campaigns"** (not "Public Quizzes" — glossary avoids "quiz"; captured in CONTEXT.md). Z-1 = pure rewire, no page retitle.
2. **Admin Campaigns page = `accessMode=INVITED` only, all statuses incl. imported, grouped by company.** PUBLIC excluded as a *product* separation (own page) — corrected the false "org-less" rationale (`organizationId` is non-null).
3. **Admin campaign detail = FULL management surface** (close/delete/remove/reminders/resend) on any campaign; host prop suppresses only broken portal nav.
4. **Admin Organizations = full roster management** (members/teams/rename/CSV import) on any org; **no org create or delete** from this page.
5. **STAFF == ADMIN** on all three pages (matches `isPrivilegedRole` + existing gate; a UI-only ADMIN-carveout would be theatre). Tests still assert STAFF explicitly (worse redirect case).
6. **Audit: already covered** — every campaign/org mutation route logs `performedBy: actor.email`; cross-coach admin actions are traceable with no new work. **No ADR** — this surfaces existing API-layer authority, not a new hard-to-reverse decision.
7. **Phasing: split** — Z-1 standalone PR first, Z-2+Z-3 second.

## §7 — /co-validate (2026-07-08)

Codex env-down (MCP disconnected) → fallback per the co-validate skill: a staff-engineer reviewer subagent WITH repo access (to verify claims against code) + my own independent review, consolidated.

**Verified TRUE:** org auth admin-ready (`canAccessOrganization:210` returns true for privileged; every org sub-route calls it); campaign auth admin-ready (list drops `createdByCoachId` for privileged `:103`; `[id]` + all action sub-routes use `canManageCampaign` → true for privileged); `detailBasePath` is the right minimal change; no `admin-nav-model` drift (homes only `/admin/assessments`); flagless defensible.

**Accepted (folded into the work items above):**
- **R-B (Z-2):** `CampaignDetail` hardcodes `requireCoach()`-guarded portal routes (Back, post-delete `router.push`, Trends [no admin page], members-import) → admin→`/dashboard`, STAFF→`/unauthorized`. Added a required host-context prop + Trends/members suppression. *(reviewer — the main finding)*
- **R-C (Z-3):** `MembersTeamsView` "Add Company" → `POST /api/organizations` 403s for admin, and "Import from Esperto" links to a `requireCoach()` page. Added a required prop to hide both. *(reviewer)*
- **detailBasePath threads through `CompanySection`** (hrefs live in the child), not just the top-level. *(reviewer)*
- **R-A: exclude PUBLIC campaigns** from the admin list — a product separation (they have their own "Public Campaigns" page), NOT a technical break. *(Corrected during grill: PUBLIC campaigns have a non-null `organizationId`; the original "org-less" justification was false.)*
- **Build the admin detail page via the coach-agnostic `getCampaignOverview`/`getCampaignRespondents` + `canManageCampaign("read")`, not `requireCoach`.** *(reviewer — feasibility)*
- **Test STAFF explicitly** (worse case) + note the heavy participants/invitations include. *(both)*

**Overridden:** none.

**Net (round 1):** strategy unchanged (thin shells + reuse); the honest cost is **three backward-compatible host-context props** (`CampaignsListWithFilter.detailBasePath`, `CampaignDetail.basePath`+suppress, `MembersTeamsView.allowOrgCreate`/`hideEspertoImport`), not one — otherwise all three pages render but ship with buttons that dead-end (`/unauthorized` for STAFF) or 403.

### §7 round 2 — /co-validate on the grilled spec (2026-07-08, Codex down → repo-grounded reviewer)

**Accepted:**
- **5th portal dead-end (SHIPS BROKEN):** the per-respondent "Over time" longitudinal link (`CampaignDetail:1750`) targets a `requireCoach()`-only route with no admin equivalent; its eligibility predicate is coach-agnostic, so full parity renders it live for admin — worst on imported multi-round campaigns (the headline case). **Fix:** pass `longitudinalRespondentIds={[]}` for admin (folded into Z-2/R-B).
- **Reverse Q1 (shared helper / full parity):** it touches the just-recovered-from-P0 live coach page for ~4 lines of drift AND manufactures the longitudinal dead-end. **Revised:** admin page calls the existing shared building blocks directly (portal untouched, zero drift), omits longitudinal, does its own `canManageCampaign(read)` + admin-path redirect (a helper must never redirect to a `/portal` path). Folded into Z-2.
- **Verified solid (no action):** all 4 gate functions are correctly admin-permissive; `accessMode:"INVITED"` includes imported (`results-commit.ts:275`, `restricted-commit.ts:522`) + excludes PUBLIC; `toCampaignListItems` mapper clean; group-report/report/CSV/delete links admin-safe; R-C suppression complete.

**Overridden:** none. **Net round 2:** the wave got *simpler and safer* — the portal refactor is dropped entirely; the honest cost is the same three props, minus the longitudinal N+1 on the admin page.

## §8 — Adversarial review
_(pending — after build.)_
