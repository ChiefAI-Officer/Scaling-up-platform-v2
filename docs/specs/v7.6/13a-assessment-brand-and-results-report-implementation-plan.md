# Assessment Brand Polish + Branded Results Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Per-task TDD (failing test first); per-task gate `CI=true npx next build --turbopack` + targeted tests. Steps use `- [ ]` checkboxes.

**Goal:** Brand the participant quiz to an "application feel" and make a branded, printable **Results report** ("the PDF") the coach/admin's canonical view of a completion (replacing the raw `stableKey` view) — closing Jeff's 2026-06-05 asks #1 and #2.

**Architecture:** A coach/admin-gated **print page in its own route group** (`(report)`, *outside* `(portal)` so it inherits no sidebar) renders a `BrandedReport` built from the frozen `ScoreResult` + the pinned version's `questions`/`sections`/`scoringConfig` + raw `answers` + company/assessment names — all fetched through **one authorization-enforcing loader that runs the access check + fetch in a single transaction**. The report **adapts to each template's scoring shape** and shows an **"Additional responses"** section for non-slider answers. The quiz gets a branded shell (progress integrated *into* `SectionPager`) + restyled title/intro slides + a restyled (not replaced) slider. **Rollout is phased** (additive Phase 1; retire the raw view + `/result` in Phase 2 after telemetry). **Zero schema migrations.**

**Tech Stack:** Next.js App Router (Turbopack), TypeScript, Prisma/Neon, **Jest + @testing-library/react** (the repo uses Jest, not Vitest). Source under `src/src/`; run commands from `/Users/diushianstand/Scaling-up-platform-v2/src`.

**Branch:** `feat/assessment-brand-results-report` (off `main`, work in repo directly — not a worktree).

**Design spec:** [13-assessment-brand-and-results-report.md](13-assessment-brand-and-results-report.md) (grill G1–G8 + claudex hardening H1–H17). Approved mockups: `/tmp/su-assessment-mockups/{report,quiz}.html`.

---

## Conventions

- **Naming:** `BrandedReport`, route group `(report)`, lib `getRespondentReport`. Reserve "aggregate report" for the cohort dashboard.
- **No migration in any task.** If a task seems to need a column (incl. a Prisma-enum audit action — H17), stop and use a String value / existing value instead.
- **Brand scoping (ADR-0005):** only the report/quiz wrapper carries `.su-public-brand` / `.su-assessment-brand`. Never touch global `:root` / `.wf-scope`.
- **Adaptive rendering (G2):** ratings always; green-check only when `passThreshold > 0`; overall keyed on `tierMetric`.
- **Neutral-tier predicate (H11):** single full-range tier + `passThreshold===0` + `tierMetric==="overallAvg"` → "Submitted", suppress band.
- **Untrusted JSON (H10):** parse/coerce at render; degrade on missing labels / null domain avg / duplicate `stableKey` (first-wins + dev warn), never silent-collapse.
- **Phased rollout (H13):** Tasks 1–10 are **Phase 1** (additive — raw view + `/result` stay, deprecated + logged). **Task 11 is Phase 2** (a *separate later release* that removes them after the deprecated-`/result` hit counter is zero).
- **Tests are Jest** (`*.test.ts(x)`, `npm test -- <pattern>`).

---

## Task 1 — `getRespondentReport(db, actor, campaignId, respondentId)` — authorized in one transaction [H2/H3/H4/H9/H10/H14, round-1 #5]

**Files:**
- Create: `src/src/lib/assessments/respondent-report.ts`
- Test: `src/src/__tests__/lib/assessments/respondent-report.test.ts`

The **single authorized entry point** for report data — access check + enriched fetch in **one `db.$transaction`** (H14), no separate unauthenticated loader.

- [ ] **Step 1 — failing tests.**
  - Owning coach → `{status:"ok", report}` with `respondentName, jobTitle, companyName, assessmentName, submittedAt, result, sections, questionByKey, questionsByKey (type+label), rawAnswers, scoringConfig, provenance{submissionId, versionId, contentHash, templateName}`.
  - ADMIN/STAFF (privileged) → `{status:"ok"}` (NOT blocked).
  - Non-owning coach → `{status:"forbidden"}`; no submission → `{status:"not-found"}`.
  - Duplicate `stableKey` in `version.questions` → first-wins (no throw, dev-warn).
  - **Stale-read (H14):** if ownership (`createdByCoachId`/access) changes between the auth check and the fetch, the call does not return a report — assert via a transaction/predicate test that flips ownership mid-call.
- [ ] **Step 2 — run, verify fail** (`npm test -- respondent-report`).
- [ ] **Step 3 — implement.** `getRespondentReport(db, actor, campaignId, respondentId)` runs inside `db.$transaction(async (tx) => { … })`: (1) `canManageCampaign(asAccessDb(tx), actor, campaignId, "read")` → `forbidden` if false; (2) `tx.assessmentSubmission.findFirst({ where:{campaignId, respondentId}, select:{ id, submittedAt, answers, result, respondent:{select:{firstName,lastName,jobTitle,email}}, campaign:{select:{ name, organization:{select:{name}}, template:{select:{name}}, version:{select:{ id, contentHash, sections, questions, scoringConfig }}} } } })` → `not-found` if null. Build `questionByKey`/`questionsByKey` first-wins. **Read frozen `result`; never re-score.** Coerce `result` to `ScoreResult`; on malformed → `{status:"ok", report:{…degraded, degraded:true}}` (don't throw).
- [ ] **Step 4 — run, verify pass.**
- [ ] **Step 5 — commit** `feat(assessments): authorized enriched respondent-report loader (single-tx)`.

## Task 2 — `BrandedReport` component (adaptive + Additional responses) [G1/G2/G3, H9/H10/H11/H12]

**Files:**
- Create: `src/src/components/assessments/BrandedReport.tsx`
- Create: `src/src/lib/assessments/report-presentation.ts` (`isNeutralTier`, `domainColor`, `headlineForTierMetric`)
- Test: `src/src/__tests__/components/assessments/branded-report.test.tsx`, `src/src/__tests__/lib/assessments/report-presentation.test.ts`

- [ ] **Step 1 — failing tests.**
  - **Rockefeller** (`passThreshold:2`, `countAchieved`, 3 tiers) → "N / M items" + tier band; **green checkmarks**; no recs; no domain cards.
  - **QSP/LVA** neutral (`isNeutralTier`) → "Avg X" under "Submitted"; no band coloring; per-question **rating only, no checks**.
  - **SU Full** (`perDomain`, `scaleUpScore`, recs) → domain-colored cards (**You → purple**, unknown → grey), ScaleUp ring, recommendations.
  - **Additional responses (H9):** LVA-style `rawAnswers` with TEXT/NUMBER/MULTI_CHOICE → an "Additional responses" section with labels; absent when none.
  - Cover: `respondentName`, `companyName`, `assessmentName`, formatted `submittedAt`, logo `img[src="/brand/su-logo-white.svg"]`.
  - Scores table: `your score` + `your per-item average` (`perSection.averagePoints`); **no team-average column**.
  - Missing label → `stableKey` + marker (H10), never crash.
  - `report-presentation` unit tests (predicate, 5-domain color map + fallback, headline per `tierMetric`).
- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement.** Cover; overall (`headlineForTierMetric`; suppress band when `isNeutralTier`; one-line lede); section cards (domain-colored via `domainColor` when `perDomain`, else flat; checks gated on `passThreshold>0`); scores table; recommendations (matched `perQuestion[].recommendation` grouped by section; only if non-empty); **Additional responses** (join `rawAnswers` to `questionsByKey` for non-slider types); conclusion + coach-as-text CTA; footer w/ provenance. Root `.su-public-brand`.
- [ ] **Step 4 — run, verify pass.**
- [ ] **Step 5 — commit** `feat(assessments): adaptive BrandedReport + additional-responses + degradation`.

## Task 3 — Report styles + print (fixed footer + provenance) + Print button [G5/H5]

**Files:**
- Create: `src/src/styles/su-report.css`
- Create: `src/src/components/assessments/PrintReportButton.tsx`
- Test: `src/src/__tests__/components/assessments/print-report-button.test.tsx`

- [ ] **Step 1 — failing test.** Click → `window.print` (mocked) called once; button is `print:hidden`.
- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement.** `su-report.css` report layout. `@media print`: `.su-report-cover{break-after:page}`, `section,.su-report-card{break-inside:avoid}`, `@page{size:A4;margin:14mm}`, a **fixed footer with reserved bottom padding** carrying logo + **provenance** (submission id, version + content hash, generated timestamp); `.no-print{display:none}`. Page numbers (`@page` margin boxes) best-effort. Scope under `.su-public-brand`/`.su-report`.
- [ ] **Step 4 — run, verify pass.**
- [ ] **Step 5 — commit** `feat(assessments): branded report stylesheet (print footer + provenance) + print button`.

## Task 4 — Report route in its own group + auth + audit + ops hardening [H1/H2/H8/H15/H16/H17]

**Files:**
- Create: `src/src/app/(report)/layout.tsx` (minimal: brand css + `.su-public-brand`; **no portal nav**)
- Create: `src/src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx`
- Test: `src/src/__tests__/app/assessment-respondent-report-page.test.tsx`

- [ ] **Step 1 — failing tests.** Anon → 401; ADMIN/STAFF → renders (privileged **allowed**, H2); owning coach → renders; non-owning → **404**; missing submission → 404. **Print regression:** no portal sidebar/nav element (H1). Audit: a `logAudit` is written on a successful view (assert the call). Rate-limit: exceeding the limit → 429 (H15).
- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement.** Server component: `getApiActor()` (401) → `withRateLimit` (H15) → `getRespondentReport(db, actor, id, respondentId)` → `forbidden`/`not-found` → 404 → `ok` → render `<BrandedReport>` + `<PrintReportButton>`. **Audit (H17):** `logAudit({ entityType:"AssessmentSubmission", action:<existing AuditAction e.g. "EXPORT", or "VIEW_REPORT" only if AuditLog.action is a String column — never a Prisma enum migration>, entityId: submissionId, performedBy: actor.id })`. **Cache (H15):** `export const dynamic = "force-dynamic"`, `export const revalidate = 0`, and `Cache-Control: private, no-store` headers. **Ops logging (H16):** structured markers `assessment.report.view{outcome,role,template,degraded}` + `assessment.report.print.clicked`. `(report)/layout.tsx` = sibling of `(portal)`, no portal chrome.
- [ ] **Step 4 — run, verify pass** + `CI=true npx next build --turbopack`.
- [ ] **Step 5 — commit** `feat(assessments): report route (own group) + auth + audit + cache/throttle/ops`.

## Task 5 — Phase 1: report becomes the PRIMARY results action (raw view + `/result` kept, deprecated) [G4/H6/H7/H13/H16]

**Files:**
- Modify: `src/src/components/assessments/CampaignDetail.tsx`
- Modify: `src/src/app/api/assessment-campaigns/[id]/respondents/[respondentId]/result/route.ts` (deprecation marker + hit log; **not** deleted yet)
- Test: extend `campaign-detail-band-pills.test.tsx` (or new `campaign-detail-view-report.test.tsx`)

- [ ] **Step 1 — failing tests.**
  - `hasSubmission` row → the **primary** results action is a plain `<a href=/assessments/${campaignId}/respondents/${respondentId}/report target="_blank" rel="noopener noreferrer">` with **no prefetch** (assert it's not a Next `<Link>`, H6). No submission → absent.
  - The old inline raw `stableKey` expansion is **de-emphasized** (kept as a secondary fallback this release, not the default) — assert the report link is primary.
  - `/result` route still responds but logs an `assessment.report.old_result_api.hit` marker (H16) — assert the deprecation log on a request.
- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement.** Add the plain `<a>` report link as the primary action. Keep `AssessmentResultView` available but de-emphasized (Phase 1). Add a deprecation log line to the `/result` route (do **not** delete — H13). Keep band-pill/status intact.
- [ ] **Step 4 — run, verify pass.**
- [ ] **Step 5 — commit** `feat(assessments): report is the primary results action (phase 1; raw view/API deprecated)`.

## Task 6 — Fix public-flow copy that promises emailed results [round-1 #3]

**Files:** Modify `src/src/app/(public)/quiz/[campaignAlias]/...` (+ `org-survey` thank-you if it implies email); Test on the copy.

- [ ] **Step 1 — investigate + test.** Grep public quiz + thank-you copy for any "email"/"sent to you"/"inbox" promise. If present → test asserting corrected copy ("your coach will follow up"). If already clean → record + **skip** (note it).
- [ ] **Step 2 — run, verify fail** (if needed).
- [ ] **Step 3 — implement.** Rewrite offending copy to match no-auto-email (D3).
- [ ] **Step 4 — run, verify pass.**
- [ ] **Step 5 — commit** `fix(assessments): public-flow copy matches no-auto-email policy`.

## Task 7 — Quiz branded app shell, progress integrated into `SectionPager` [G6/round-1 #8]

**Files:** Modify `src/src/components/assessments/section-pager.tsx`; (optional) `AssessmentShellHeader.tsx` rendered *by* the pager; wire `assessmentName`/`companyName` from both flows. Test `src/src/__tests__/assessments/section-pager.test.tsx`.

- [ ] **Step 1 — failing test.** 10 sections on section 2 → logo, "Section 2 of 10", 10 segments / 2 active; `companyName` undefined (public) → no company text, no crash; segment count + active index track the pager's own state through next/back.
- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement.** Render the branded shell header **inside** `SectionPager` (single source of section state); white logo on purple + Four-Decisions segmented progress + "Section N of M" + optional company. Under `.su-assessment-brand`. Wire both flows.
- [ ] **Step 4 — run, verify pass.**
- [ ] **Step 5 — commit** `feat(assessments): branded app shell integrated into SectionPager (both flows)`.

## Task 8 — Section title / intro slide polish [G8/ADR-0004]

**Files:** Modify `section-pager.tsx` (`view==="intro"`) + `wireframes-scoped.css` (under `.su-assessment-brand`); update `section-pager.test.tsx`.

- [ ] **Step 1 — updated test.** Intro view renders big section number + `partLabel`/`name` + `description` (ADR-0004) + "Begin section", with new class hooks.
- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement.** Restyle intro branch + CSS (domain-colored number, Helvetica Neue title, swoosh). No behavior change (keep `pageHasIntro()` + `section.description`).
- [ ] **Step 4 — run, verify pass.**
- [ ] **Step 5 — commit** `feat(assessments): polished section title/intro slides`.

## Task 9 — Question card + slider restyle (keep slider; honest autosave) [D4/round-2 low]

**Files:** Modify `wireframes-scoped.css` (`.su-assessment-brand .survey-slider*`, `.survey-question*`); `question-input.tsx` (markup/classes only if needed); guard `question-input.test.tsx`.

- [ ] **Step 1 — guard + new test.** Keep `input[type="range"]`, ticks, `is-current`, status line, min selectable. **Add:** "Saved" indicator shows only after a save actually succeeds.
- [ ] **Step 2 — baseline / new test fails.**
- [ ] **Step 3 — implement** CSS-first restyle (purple selected tick, polished track, card spacing, status badge); gate "Saved" on real success. **Do NOT** replace `<input type="range">` (D4).
- [ ] **Step 4 — run, verify pass.**
- [ ] **Step 5 — commit** `feat(assessments): restyle slider + question card; honest autosave status`.

## Task 10 — Phase-1 verification + SoT

- [ ] **Step 1** — `CI=true npx next build --turbopack` clean.
- [ ] **Step 2** — `npm test -- --testPathPatterns="assessment|respondent-report|branded-report|report-presentation|section-pager|question-input|campaign-detail|report-page"`; confirm only the 3 known pre-existing failures remain.
- [ ] **Step 3 — manual Print → PDF** across live templates: **Rockefeller** (checklist + band), **QSP/LVA** (ratings, "Submitted", **Additional responses** for LVA), **SU Full** if a DRAFT submission exists (domains + ScaleUp + recs). Confirm labels (not stableKeys), no team-avg column, cover-own-page, footer provenance, **no portal chrome** (H1), report opens only on click (H6), report page returns `no-store`.
- [ ] **Step 4** — final whole-branch review (`superpowers:requesting-code-review`) → `superpowers:finishing-a-development-branch`.
- [ ] **Step 5 — SoT** on merge to `main`: bump `CLAUDE.md` LAST_UPDATED → `assessment-brand-results-report`; prepend `plans/CHANGELOG.md`; Notion auto-fires.

## Task 11 — Phase 2 (SEPARATE later release): retire raw view + `/result` [H7/H13]

> Do **not** bundle with Phase 1. Ship only after Phase 1 is live and the `assessment.report.old_result_api.hit` counter (H16) reads ~zero for a release.

- [ ] **Step 1 — failing tests.** The inline `AssessmentResultView` raw `stableKey` expansion is **gone** from `CampaignDetail`; a request to `…/result` returns **404/410** (raw `stableKey` JSON no longer fetchable).
- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement.** Grep for all `/result` callers (must be none beyond the retired inline view). Remove the inline view + its `resultsCache` lazy-fetch; delete `AssessmentResultView` + its test if unused; delete/410 the `/result` route + update `result-route.test.ts`.
- [ ] **Step 4 — run, verify pass** + build gate.
- [ ] **Step 5 — commit + SoT** `feat(assessments): retire raw results view + /result API (phase 2)`.

---

## Risks / notes

1. **Route group (H1)** — `(report)` is a *sibling* of `(portal)`, not nested, or it inherits the sidebar. Build-verify no portal chrome on the print page.
2. **Authz in one tx (H2/H3/H14)** — `getRespondentReport(db, actor, …)` runs `canManageCampaign("read")` + the fetch in one `$transaction`; the page uses `getApiActor()`, never `requireCoach()` (which blocks admins).
3. **Phasing (H13)** — Phase 1 (Tasks 1–10) is additive; Phase 2 (Task 11) removes the raw view + `/result` only after telemetry. Never delete `/result` in Phase 1 (version-skew safety for already-loaded JS/bookmarks).
4. **Additional responses (H9)** — LVA's TEXT/NUMBER/MULTI_CHOICE answers must stay visible after the raw view is retired.
5. **Audit zero-migration (H17)** — reuse an existing `AuditAction` (`EXPORT`) or add a String literal; never a Prisma-enum migration.
6. **Cache/PII (H15)** — report route is `no-store` + rate-limited; it serves PII.
7. **Ops signal (H16)** — ship the structured markers (esp. `old_result_api.hit`, which gates Phase 2) even though full dashboards/alerts are deferred to the observability work-stream.
8. **Untrusted JSON (H10)** + **no team-average / no migration** — defensive parse, first-wins duplicate keys; per-item average from frozen `result.perSection.averagePoints`.
9. **Out of scope (claudex):** public-submit idempotency + audit (report is invited-only), localStorage autosave TTL/clear, publish-time stableKey uniqueness — pre-existing/separate; flagged, not fixed here.
