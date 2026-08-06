# Scaling Up Full Report Style Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins choose the default individual-report appearance for Scaling Up Full, let the owning coach override it before the first completed response, atomically freeze the campaign choice at first completion, and render the same canonical report facts through Classic, Executive Boardroom, or Modern Dashboard on screen and in browser print/PDF.

**Architecture:** Store an enum default on `AssessmentTemplate` and a copied enum snapshot plus source/lock metadata on `AssessmentCampaign`. Centralize eligibility, catalog resolution, inheritance, conditional updates, and first-completion locking in report-style policy modules. Add `reportStyle` to `RespondentReport`, transform scored reports into one pure `ScoredReportViewModel`, and dispatch only eligible Scaling Up Full reports to a closed renderer registry. Keep the current `BrandedReport` and CSS as the unmodified Classic fallback when the flag is off, killed, ineligible, missing, or invalid.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma/PostgreSQL, Zod, Tailwind/scoped CSS, Jest/Testing Library, Playwright, `next/font`, Vercel feature flags.

## Global Constraints

- The approved design in `docs/superpowers/specs/2026-08-05-report-style-selection-design.md` is the source of truth. Do not add new product scope while implementing.
- This is a gated UI wave. Preserve the approved current admin top navigation and current coach portal sidebar; do not introduce a new shell.
- The first release is limited to the `scaling-up-full` individual scored report on screen and through browser print/download. Qualitative reports, group reports, results-email HTML, and other scored instruments remain unchanged.
- `CLASSIC` is the database default, migration value, flag-off renderer, kill-switch renderer, and defensive fallback.
- The selected style changes presentation only. Titles, metrics, precision, values, findings, recommendations, CTA rules, and included data come from one canonical model.
- No template or campaign request may persist arbitrary CSS, HTML, font, color, image, or renderer identifiers.
- Feature flags gate controls and non-Classic rendering. They must not erase stored selections.
- The first successful submission transaction locks the campaign row before inserting the submission. A failed submission must roll back the lock.
- Never implement the lock as an unchecked read followed by an update.
- Every implementation task starts with a failing test, observes the failure, makes the smallest production change, observes the focused test passing, and commits only that task's files.
- Run commands from `/Users/diushianstand/Scaling-up-platform-v2-report-style-design/src` unless a task says otherwise.
- Source, test, script, and public paths in task file lists are relative to that app root (`src/` in the repository). Top-level `docs/`, `CLAUDE.md`, and `plans/` paths are relative to the repository root.
- Do not claim lint, tests, build, migration safety, visual QA, or production smoke passed unless the command was run and the passing output was observed.

## File and Responsibility Map

### Persistence and policy

- `prisma/schema.prisma` — closed enums and template/campaign columns.
- `prisma/migrations/20260805090000_add_assessment_report_styles/migration.sql` — additive enum/column migration plus deterministic existing-campaign lock backfill.
- `src/lib/assessments/report-style-policy.ts` — catalog keys, eligibility, inheritance/source resolution, validation, and conditional update contract.
- `src/lib/assessments/report-style-lock.ts` — transaction-scoped first-completion lock primitive shared by both submission routes.
- `src/lib/assessments/wave-report-styles-flags.ts` — kill/global/canary resolution with kill precedence.
- `src/lib/assessments/report-style-registry.ts` — closed presentation metadata and renderer keys; no user-authored content.

### Admin and coach controls

- `src/app/api/admin/assessment-templates/[id]/route.ts` — privileged `defaultReportStyle` validation and update.
- `src/components/admin/template-editor/SettingsTab.tsx` — admin default control in the existing ED10 Settings tab.
- `src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts` — template-row state and immediate save lane.
- `src/components/admin/template-editor/TabbedShell.tsx` — threads the default and flag to `SettingsTab` without changing shell navigation.
- `src/components/assessments/ReportStylePicker.tsx` — shared accessible three-card picker and preview tabs.
- `src/components/assessments/CampaignWizard.tsx` — inherited/overridden choice near results-delivery controls.
- `src/app/api/assessment-campaigns/route.ts` — server-authoritative inheritance during create.
- `src/lib/assessments/campaign-detail.ts` — coach detail projection of style/source/lock.
- `src/app/api/assessment-campaigns/[id]/route.ts` — conditional pre-lock campaign update and `409` race response.
- `src/components/assessments/CampaignDetail.tsx` — editable or read-only campaign appearance card in the current portal shell.

### Submission and report rendering

- `src/app/(public)/org-survey/[campaignAlias]/submit/route.ts` — invited first-completion freeze.
- `src/app/api/quiz/[campaignAlias]/submit/route.ts` — public first-completion freeze.
- `src/lib/assessments/respondent-report.ts` — carries the campaign snapshot into the frozen report model.
- `src/lib/assessments/report-email.ts`, `src/components/assessments/public-quiz-client.tsx`, and `src/lib/assessments/onscreen-result-store.ts` — construction/serialization seams that must compile with the required style field while email rendering stays unchanged.
- `src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx` and `src/app/(report)/assessments/public-submissions/[submissionId]/report/page.tsx` — standalone individual report hosts that retain their current route chrome and access gates.
- `src/lib/assessments/scored-report-view-model.ts` — pure canonical scored-report transformation.
- `src/components/assessments/BrandedReport.tsx` — legacy Classic branch and top-level eligible-style dispatch.
- `src/components/assessments/report-styles/ClassicReport.tsx` — view-model adapter enabled only after parity proof.
- `src/components/assessments/report-styles/ExecutiveBoardroomReport.tsx` — approved boardroom composition.
- `src/components/assessments/report-styles/ModernDashboardReport.tsx` — approved dashboard composition.
- `src/styles/su-report-executive.css` and `src/styles/su-report-dashboard.css` — scoped screen/US-Letter print rules that cannot affect Classic.
- `src/lib/assessments/assessment-fonts.ts` and `src/app/(report)/layout.tsx` — bundled/self-hosted Playfair Display and Inter variables.

### Safe previews and QA

- `src/lib/assessments/report-style-preview-fixture.ts` — committed synthetic ABC Corp canonical view model; never imports Prisma or a respondent loader.
- `src/app/(dashboard)/admin/surveys/report-style-preview/page.tsx` — authenticated synthetic-only render target for reviewed preview capture.
- `scripts/capture-report-style-previews.mjs` — Playwright capture of Cover, Summary, and Detail for all three styles.
- `public/report-style-previews/<style>/<page>.webp` — nine generated, committed preview assets.
- `e2e/report-styles.spec.ts` — real-render accessibility, viewport, and print checks.

---

### Task 1: Add the additive schema and migration backfill

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260805090000_add_assessment_report_styles/migration.sql`
- Create: `src/__tests__/prisma/report-style-migration.test.ts`

**Interfaces:** Produces Prisma enums `AssessmentReportStyle`, `AssessmentReportStyleSource`; produces `AssessmentTemplate.defaultReportStyle`; produces `AssessmentCampaign.reportStyle`, `reportStyleSource`, and `reportStyleLockedAt`.

- [ ] Write a static migration test that reads the schema and migration SQL and asserts the exact enum members, defaults, non-null columns, and earliest-submission backfill.

```ts
expect(schema).toContain("enum AssessmentReportStyle");
expect(schema).toContain("EXECUTIVE_BOARDROOM");
expect(schema).toContain("defaultReportStyle");
expect(sql).toContain('MIN("submittedAt")');
expect(sql).toContain('GROUP BY "campaignId"');
```

- [ ] Run `npx jest src/__tests__/prisma/report-style-migration.test.ts --runInBand` and verify it fails because the enum, fields, and migration do not exist.
- [ ] Add the exact Prisma enums and fields from the approved design, all defaulting to Classic/template-default.
- [ ] Add migration SQL that creates both PostgreSQL enum types, adds non-null defaulted columns, and backfills only `reportStyleLockedAt` for campaigns that already have submissions.

```sql
UPDATE "assessment_campaigns" AS c
SET "reportStyleLockedAt" = first_submission."submittedAt"
FROM (
  SELECT "campaignId", MIN("submittedAt") AS "submittedAt"
  FROM "assessment_submissions"
  GROUP BY "campaignId"
) AS first_submission
WHERE c."id" = first_submission."campaignId";
```

- [ ] Run the focused Jest test and `npx prisma validate`; verify both pass.
- [ ] Run `node scripts/check-migration-safety.mjs`; verify the migration is accepted as additive.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): persist report style policy"`.

### Task 2: Define the closed catalog, eligibility policy, and feature flags

**Files:**

- Create: `src/lib/assessments/report-style-registry.ts`
- Create: `src/lib/assessments/report-style-policy.ts`
- Create: `src/lib/assessments/wave-report-styles-flags.ts`
- Create: `src/__tests__/lib/assessments/report-style-policy.test.ts`
- Create: `src/__tests__/lib/assessments/wave-report-styles-flags.test.ts`

**Interfaces:** Consumes Prisma-compatible string keys and `{templateAlias, templateId?, campaignId?}`; produces `REPORT_STYLE_KEYS`, metadata lookup, safe Classic fallback, eligibility, inheritance/source resolution, and flag availability.

- [ ] Write policy tests for the three exact keys, immutable metadata, `scaling-up-full` eligibility, Classic fallback for unknown/ineligible keys, and inheritance/source semantics.

```ts
expect(resolveCampaignReportStyle(undefined, "MODERN_DASHBOARD")).toEqual({
  reportStyle: "MODERN_DASHBOARD",
  reportStyleSource: "TEMPLATE_DEFAULT",
});
expect(resolveCampaignReportStyle("CLASSIC", "MODERN_DASHBOARD")).toEqual({
  reportStyle: "CLASSIC",
  reportStyleSource: "CAMPAIGN_OVERRIDE",
});
```

- [ ] Write flag tests for default-off, global enable, template/campaign canary, and kill precedence. Use exact-ID comma-separated canary values and restore `process.env` after each test.
- [ ] Run both suites and verify module-not-found failures.
- [ ] Implement a readonly registry with label, description, paper format, three preview URLs, and a renderer key. Validate keys with a type guard; never cast untrusted strings into the enum.

```ts
export const REPORT_STYLE_KEYS = [
  "CLASSIC",
  "EXECUTIVE_BOARDROOM",
  "MODERN_DASHBOARD",
] as const;
export type ReportStyleKey = (typeof REPORT_STYLE_KEYS)[number];
```

- [ ] Implement `isReportStyleEligible(alias)`, `effectiveReportStyle({alias, storedStyle, available})`, and `resolveCampaignReportStyle(explicit, templateDefault)` as pure functions.
- [ ] Implement `isReportStylesEnabled({templateId, campaignId})` with `WAVE_REPORT_STYLES_KILL` overriding `WAVE_REPORT_STYLES_ENABLED` and `WAVE_REPORT_STYLES_CANARY`.
- [ ] Run both focused suites and `npx eslint` on the five files; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): define report style policy"`.

### Task 3: Add the privileged admin default update boundary

**Files:**

- Modify: `src/app/api/admin/assessment-templates/[id]/route.ts`
- Modify: `src/__tests__/api/admin/assessment-templates/templates-crud.test.ts`
- Modify: `src/__tests__/api/admin/assessment-templates/templates-route.test.ts`

**Interfaces:** `PATCH /api/admin/assessment-templates/:id` consumes optional `defaultReportStyle: ReportStyleKey`; returns the saved template row. Any report-style write requires the feature to be available, and non-Classic values additionally require exact alias `scaling-up-full`.

- [ ] Add route tests covering privileged update, unauthenticated/unauthorized rejection, invalid key `400`, non-Classic request on another alias `400`, feature-off rejection of every report-style write with `400 REPORT_STYLE_UNAVAILABLE`, and an available-feature `CLASSIC` reset.
- [ ] Run the two focused API suites and verify the new expectations fail because the schema strips or rejects the new field.
- [ ] Extend the route-local Zod PATCH schema with `z.enum(REPORT_STYLE_KEYS)` and include `defaultReportStyle` in its typed update object.
- [ ] Load the template alias before accepting a non-Classic value; return a stable `400` body such as `{ error: "REPORT_STYLE_NOT_ELIGIBLE" }` for ineligible aliases.
- [ ] Gate every `defaultReportStyle` write with `isReportStylesEnabled({templateId: id})`; a kill/off response must preserve the stored choice. Retain Classic only as the effective rendering fallback.
- [ ] Ensure audit changes record only the enum key, never preview or report content.
- [ ] Run both focused suites and ESLint on the route/tests; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(admin): allow Scaling Up report style default"`.

### Task 4: Build the reusable accessible picker and preview-error contract

**Files:**

- Create: `src/components/assessments/ReportStylePicker.tsx`
- Create: `src/__tests__/components/assessments/report-style-picker.test.tsx`

**Interfaces:** `ReportStylePicker` consumes `{value, onChange, disabled, sourceLabel?, lockedAt?}` and emits a catalog key. It reads only the static preview URLs from the registry; it never loads report data.

- [ ] Write component tests for a three-option keyboard-operable radio group, selected state, disabled/read-only state, Cover/Summary/Detail tabs, preview load error plus Retry, and a still-usable selection after image failure.
- [ ] Run the suite and verify it fails because the component does not exist.
- [ ] Implement card selection with native radio inputs or full roving-radio semantics, visible focus, `aria-checked`, and text labels that do not rely on color.
- [ ] Implement preview tabs as buttons and image error state scoped to the selected style/page. Retry should remount the image via an incremented key; it must not clear the current selection.
- [ ] Run the focused suite and component ESLint; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): add safe report style picker"`.

### Task 5: Put the admin default control in the existing ED10 Settings tab

**Files:**

- Modify: `src/app/(dashboard)/admin/surveys/templates/[id]/page.tsx`
- Modify: `src/components/admin/template-editor/TabbedShell.tsx`
- Modify: `src/components/admin/template-editor/SettingsTab.tsx`
- Modify: `src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts`
- Modify: `src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx`
- Create: `src/__tests__/components/admin/template-editor/report-style-default.test.tsx`

**Interfaces:** Extends template props/state with `defaultReportStyle: ReportStyleKey`; extends `TemplateRowPatch` and `SettingsRowPatch`; saves through existing `handleTemplateRowSave` to the admin template PATCH route.

- [ ] Add tests proving the control appears only for exact alias `scaling-up-full` when ED10 and report styles are available, uses the current horizontal admin shell unchanged, explains “future campaigns only,” saves through the immediate template-row lane, and remains absent/byte-equivalent for other aliases or flag-off.
- [ ] Run the new suite plus ED10 golden snapshots and observe the missing-control failure with existing snapshots still green.
- [ ] Select `defaultReportStyle` on the admin page and thread it through `TabbedShellProps`, `useTemplateEditorDraft.templateValues`, `TemplateRowPatch`, and `SettingsTabTemplateValues`.
- [ ] Add a `Default report appearance` card to `SettingsTab` after Audience and before email controls. Reuse `ReportStylePicker`; label the save action `Save default`.
- [ ] On success, mirror the returned enum into local server-truth state so the card is clean; surface API errors inline without changing the selection.
- [ ] Update the ED10 approved golden snapshot only for the intended Settings-tab addition. Confirm the top nav and assessment sidebar markup do not change.
- [ ] Run both focused suites and ESLint; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(admin): expose default report appearance"`.

### Task 6: Inherit or override the style during campaign creation

**Files:**

- Modify: `src/lib/validations.ts`
- Modify: `src/app/api/assessment-templates/route.ts`
- Modify: `src/app/api/assessment-campaigns/route.ts`
- Modify: `src/app/(portal)/portal/assessments/new/page.tsx`
- Modify: `src/components/assessments/CampaignWizard.tsx`
- Modify: `src/__tests__/api/assessment-campaigns/campaigns-route.test.ts`
- Create: `src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx`

**Interfaces:** Template list adds `defaultReportStyle`; campaign create accepts optional `reportStyle`; server persists resolved `reportStyle` plus `reportStyleSource` in every create lane (`createWaveD` and legacy create paths).

- [ ] Add API tests for no explicit choice copying the current template default, same explicit choice recording `TEMPLATE_DEFAULT`, different explicit choice recording `CAMPAIGN_OVERRIDE`, invalid/ineligible choices returning `400`, flag-off forcing Classic, and both Wave-D and legacy create lanes writing the same fields.
- [ ] Add wizard tests for a Scaling Up Full-only panel near results delivery, inherited labeling, coach override labeling, draft resume, review summary, and absence for other templates/flag-off.
- [ ] Run the focused API and component suites and observe failures.
- [ ] Extend `createAssessmentCampaignSchema` with the optional closed enum. Add `defaultReportStyle` to the template-list select/response used by the wizard, and pass a server-computed `reportStylesEnabled` prop from the new-campaign page.
- [ ] Extend `campaignCreateData(alias)` so the server computes style/source from the freshly loaded template, not from browser labels.

```ts
const stylePolicy = resolveCampaignReportStyle(
  available ? data.reportStyle : undefined,
  available ? template.defaultReportStyle : "CLASSIC",
);
```

- [ ] Add `reportStyle` to `CampaignWizardState`, draft serialization/hydration, template-selection initialization, create request, and Review. Reset it when the template changes to an ineligible instrument.
- [ ] Render `ReportStylePicker` in the Schedule/results-delivery area and describe whether the current value came from the admin default or coach selection.
- [ ] Run the focused suites and ESLint; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): choose report style at campaign creation"`.

### Task 7: Add campaign-detail projection and conditional pre-lock updates

**Files:**

- Modify: `src/lib/assessments/campaign-detail.ts`
- Modify: `src/app/(portal)/portal/assessments/[id]/page.tsx`
- Modify: `src/app/api/assessment-campaigns/[id]/route.ts`
- Modify: `src/components/assessments/CampaignDetail.tsx`
- Modify: `src/__tests__/api/assessment-campaigns/detail-route.test.ts`
- Create: `src/__tests__/components/assessments/campaign-detail-report-style.test.tsx`

**Interfaces:** `CampaignOverview.campaign` adds required `templateAlias`, `reportStyle`, `reportStyleSource`, and `reportStyleLockedAt`; PATCH accepts optional `reportStyle` and returns `409 REPORT_STYLE_LOCKED` when the conditional update affects zero rows.

- [ ] Add service/API tests for projected fields, owner update before lock, cross-coach rejection through existing authorization, admin intervention before lock, ineligible template rejection, flag-off rejection, and conditional-update `409` after lock.
- [ ] Add component tests for an editable appearance section in the current coach portal, saving an override, a persistent read-only picker after lock, lock timestamp, and the exact race explanation.
- [ ] Run both suites and observe failures.
- [ ] Extend the campaign detail model and page projection with the four fields. Pass server-computed availability into `CampaignDetail`; do not recompute ownership or eligibility in the client.
- [ ] Extend the PATCH schema and implement style changes in a dedicated branch before the generic update. Use `updateMany` with `{id, reportStyleLockedAt: null}` and set `reportStyleSource: "CAMPAIGN_OVERRIDE"`.

```ts
const changed = await db.assessmentCampaign.updateMany({
  where: { id, reportStyleLockedAt: null },
  data: { reportStyle: requested, reportStyleSource: "CAMPAIGN_OVERRIDE" },
});
if (changed.count === 0) return NextResponse.json(
  { error: "REPORT_STYLE_LOCKED", message: LOCKED_MESSAGE },
  { status: 409 },
);
```

- [ ] Add the campaign appearance panel near the existing results/email settings. On `409`, refresh the route and show the final locked value instead of reverting to stale client state.
- [ ] Run the focused suites and ESLint; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): manage campaign report appearance"`.

### Task 8: Create one transaction-scoped first-completion lock primitive

**Files:**

- Create: `src/lib/assessments/report-style-lock.ts`
- Create: `src/__tests__/lib/assessments/report-style-lock.test.ts`
- Create: `integration-tests/report-style-lock.pg.test.ts`

**Interfaces:** Exports `lockReportStyleForFirstCompletion(tx, campaignId, submittedAt): Promise<void>`. It consumes a narrow transaction interface with Prisma's tagged `$executeRaw`, executes inside the caller's existing transaction, and obtains the campaign row lock before any other transactional read/write.

- [ ] Write a unit contract test using a narrow transaction stub that asserts the lock operation is awaited before the test's simulated submission create.
- [ ] Write a PostgreSQL integration test with two clients/transactions proving deterministic ordering: update-first freezes the new value; freeze-first causes the conditional coach update to affect zero rows; rollback leaves `reportStyleLockedAt` null.
- [ ] Run the unit test and observe module-not-found. Run the PG test only when its existing test DB env is available; otherwise record it as not run, not passed.
- [ ] Implement the primitive using one parameterized `UPDATE` that always targets the campaign row and preserves an existing timestamp with `COALESCE`. PostgreSQL obtains the row lock for both first and repeated completions.

```sql
UPDATE "assessment_campaigns"
SET "reportStyleLockedAt" = COALESCE("reportStyleLockedAt", $2)
WHERE "id" = $1;
```

- [ ] Keep SQL parameterized through Prisma's tagged template API; never interpolate IDs into raw SQL text.
- [ ] Run the unit suite and the PG suite when available; verify expected ordering.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): add atomic report style freeze"`.

### Task 9: Freeze invited campaigns inside successful submission transactions

**Files:**

- Modify: `src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`
- Modify: `src/__tests__/app/org-survey/submit.test.ts`
- Modify: `src/__tests__/app/org-survey/submit-onscreen-results.test.ts`

**Interfaces:** The invited submit transaction calls `lockReportStyleForFirstCompletion(tx, campaignId, submittedAt)` as the first awaited operation inside the transaction, before its under-lock invitation reload, `assessmentSubmission.create`, and dependent outbox/intent writes. Any later failed check rolls the lock back.

- [ ] Add tests that capture transaction call order, assert lock-before-create, assert the same `submittedAt` is used for lock and submission, and simulate a later transaction failure to prove no out-of-transaction lock call occurs.
- [ ] Run both focused suites and observe the missing call/order failure.
- [ ] Call the shared lock primitive as the first awaited operation inside the existing `$transaction` callback, using the preloaded campaign ID and chosen `submittedAt`; then perform the existing under-lock invitation/campaign checks. A rejected check must throw/return through rollback, never commit the lock alone.
- [ ] Do not add a second transaction and do not move scoring, email rendering, or authorization outside their current safety boundaries.
- [ ] Run both focused suites and ESLint; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): freeze invited report style on completion"`.

### Task 10: Freeze public campaigns inside idempotent submission transactions

**Files:**

- Modify: `src/app/api/quiz/[campaignAlias]/submit/route.ts`
- Modify: `src/__tests__/api/quick-assessment-submit.test.ts`

**Interfaces:** Every new public submission persistence lane calls the same lock primitive as the first awaited operation inside its transaction; pure idempotent replay performs no new lock/write.

- [ ] Add tests for lock-before-create, rollback coupling, and no lock mutation during an idempotent replay.
- [ ] Run the focused suite and observe failures.
- [ ] Insert the lock call at the top of `persistSubmission`'s transaction before referral resolution or the submission insert. If referral validation later fails, the transaction must roll back the style lock.
- [ ] Ensure both normal and concurrent-retry branches continue using `persistSubmission`; do not duplicate the freeze implementation.
- [ ] Run the focused suite and ESLint; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): freeze public report style on completion"`.

### Task 11: Carry the campaign style through every RespondentReport construction seam

**Files:**

- Modify: `src/lib/assessments/respondent-report.ts`
- Modify: `src/lib/assessments/report-email.ts`
- Modify: `src/components/assessments/public-quiz-client.tsx`
- Modify: `src/lib/assessments/onscreen-result-store.ts`
- Modify: `src/__tests__/lib/assessments/respondent-report.test.ts`
- Modify: `src/__tests__/assessments/report-email.test.ts`
- Modify: `src/__tests__/app/assessment-respondent-report-page.test.tsx`

**Interfaces:** `RespondentReport.reportStyle` is required and uses the closed app-level `ReportStyleKey`. Every stored and ephemeral construction receives the campaign snapshot; constructors never reread the mutable template default and never silently default a missing required field. Email output remains byte-equivalent.

- [ ] Add loader/model tests asserting a stored Modern Dashboard value survives `getRespondentReport` and `buildStoredRespondentReport`. Make the field required in every input and update every fixture/construction site; do not add an optional legacy-input escape hatch that hides omissions from TypeScript.
- [ ] Add an email snapshot/parity assertion proving `reportStyle` does not change results-email HTML.
- [ ] Run focused suites and let TypeScript/Jest reveal every missing construction site.
- [ ] Add `reportStyle` to `RawSubmission.campaign`, `StoredRespondentReportInput.campaign`, the Prisma select, and the returned object.
- [ ] Extend `BuildRespondentReportArgs` in `report-email.ts` and the public quiz client construction. Use the campaign snapshot; never read the mutable template default while rendering.
- [ ] Keep on-screen serialization/revival lossless. Reject/normalize unknown serialized values to Classic at the renderer boundary, not by mutating stored report facts.
- [ ] Run focused suites, `npx tsc --noEmit` if available, and ESLint; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): propagate frozen report style"`.

### Task 12: Extract the canonical scored-report view model

**Files:**

- Create: `src/lib/assessments/scored-report-view-model.ts`
- Create: `src/lib/assessments/report-style-preview-fixture.ts`
- Create: `src/__tests__/lib/assessments/scored-report-view-model.test.ts`
- Create: `src/__tests__/lib/assessments/report-style-preview-fixture.test.ts`
- Modify: `src/lib/assessments/report-presentation.ts`

**Interfaces:** `buildScoredReportViewModel(report: RespondentReport): ScoredReportViewModel` is pure and owns all renderer-independent strings, values, lists, and degraded behavior.

- [ ] Write table-driven tests from normal, partial, degraded, long-text, and recommendation fixtures. Pin overall weighted average separately from Five Decisions `averageAcrossSections` to prevent formula drift.
- [ ] Assert strength/priority selection, section/question ordering, labels, recommendation text, additional responses, CTA eligibility, provenance, and optional coach branding.
- [ ] Write fixture tests that serialize the synthetic ABC Corp model and reject known production identifiers, email patterns, IDs, and any import of `@/lib/db` or `respondent-report` from the fixture source.
- [ ] Run the new suite and observe module-not-found.
- [ ] Move parsing/derivation currently embedded in `BrandedReport.tsx` into the pure builder: parsed sections, per-question lookup, orphan rows, decision groups, scorecard rows, recommendations, and additional responses.

```ts
export interface ScoredReportViewModel {
  identity: { assessmentName: string; campaignLabel: string | null; respondentName: string; companyName: string };
  summary: { headline: string; overallAverage: number; overallTotal: number; answeredItems: number; sectionCount: number };
  decisions: Array<{ stableKey: string; label: string; averageAcrossSections: number }>;
  sections: ScoredReportSectionView[];
  recommendations: ScoredReportRecommendationGroup[];
  additionalResponses: Array<{ label: string; answer: string }>;
  degraded: boolean;
}
```

- [ ] Reuse `headlineForTierMetric`, `domainColor`, `reportConfigFor`, and existing recommendation/findings helpers rather than reimplementing business rules.
- [ ] Add the fixed synthetic ABC Corp facts, recommendations, and long-text cases as a complete `ScoredReportViewModel`; freeze the export in development so a renderer cannot mutate it.
- [ ] Run the focused suite and ESLint; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "refactor(assessments): centralize scored report presentation"`.

### Task 13: Add renderer dispatch while preserving the legacy Classic fallback

**Files:**

- Modify: `src/components/assessments/BrandedReport.tsx`
- Modify: `src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx`
- Modify: `src/app/(report)/assessments/public-submissions/[submissionId]/report/page.tsx`
- Create: `src/components/assessments/report-styles/ClassicReport.tsx`
- Create: `src/components/assessments/report-styles/ExecutiveBoardroomReport.tsx`
- Create: `src/components/assessments/report-styles/ModernDashboardReport.tsx`
- Create: `src/components/assessments/report-styles/ReportSharedContent.tsx`
- Create: `src/__tests__/components/assessments/report-style-renderers.test.tsx`
- Modify: `src/__tests__/app/assessment-respondent-report-page.test.tsx`

**Interfaces:** `BrandedReport` keeps its public props. Eligible feature-enabled Scaling Up Full reports build one view model and dispatch by the resolved registry key; all other cases execute the existing legacy component path.

- [ ] Before changing production code, capture the current Classic DOM/snapshot for a representative Scaling Up Full report with the new flag unset.
- [ ] Add tests for qualitative/non-SU reports remaining on existing paths, flag-off Classic parity, kill Classic parity, unknown-key Classic fallback plus privacy-safe diagnostic, and all three eligible renderer selections.
- [ ] Add cross-renderer assertions that canonical title, values, recommendation text, included section keys, and CTA eligibility are identical even when order/layout differs.
- [ ] Run the focused suites and observe missing-renderer failures while the newly captured Classic snapshot passes.
- [ ] Rename the current body to an internal `LegacyClassicReport` without changing its markup. Add an outer dispatch that returns that exact branch for flag-off, kill, ineligible alias, Classic fallback, or registry failure.
- [ ] Implement the two new renderers against `ScoredReportViewModel` only. Share semantic table/list primitives where they prevent content drift; keep style composition separate.
- [ ] Add the Classic view-model adapter only after a DOM-equivalence test compares it to `LegacyClassicReport`. If parity cannot be proven, keep Classic dispatch on `LegacyClassicReport` and record the adapter as unused follow-up rather than weakening the fallback.
- [ ] Emit diagnostics containing only campaign/provenance ID, template alias, and invalid style key. Never include respondent identity or report content.
- [ ] Run focused suites and ESLint; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): render curated report styles"`.

### Task 14: Implement isolated typography, screen layouts, and print contracts

**Files:**

- Modify: `src/lib/assessments/assessment-fonts.ts`
- Modify: `src/app/(report)/layout.tsx`
- Create: `src/styles/su-report-executive.css`
- Create: `src/styles/su-report-dashboard.css`
- Modify: `src/components/assessments/report-styles/ExecutiveBoardroomReport.tsx`
- Modify: `src/components/assessments/report-styles/ModernDashboardReport.tsx`
- Modify: `src/components/assessments/report-styles/ReportSharedContent.tsx`
- Modify: `src/__tests__/components/assessments/report-style-renderers.test.tsx`
- Create: `src/__tests__/components/assessments/report-style-print-contract.test.tsx`

**Interfaces:** New renderer roots use `.su-report--executive` and `.su-report--dashboard`; new CSS is nested beneath those roots. Classic continues using existing `su-report.css` and A4 rules. New styles use named US Letter pages.

- [ ] Add static/DOM tests for unique style roots, explicit non-color status labels, page-break marker classes, recurring provenance/confidentiality regions, and no new-style selector that targets bare `.su-report`.
- [ ] Run the suite and observe failures.
- [ ] Add `Playfair_Display` and `Inter` through `next/font/google` in `assessment-fonts.ts`; expose CSS variables from the report layout so runtime printing uses bundled build assets rather than remote font requests.
- [ ] Build Executive Boardroom as restrained editorial pages: serif display headings, dark navy/charcoal, warm accent, generous whitespace, cover/summary/detail page composition.
- [ ] Build Modern Dashboard as compact data-forward pages: Inter typography, card/grid score summaries, explicit labels, cover/summary/detail composition.
- [ ] Add named page rules and style-scoped print declarations.

```css
@page executive-report { size: Letter; margin: 0.55in; }
.su-report--executive .report-page { page: executive-report; }
@page dashboard-report { size: Letter; margin: 0.45in; }
.su-report--dashboard .report-page { page: dashboard-report; }
```

- [ ] Keep `src/styles/su-report.css` unchanged except for a necessary import boundary approved by parity tests. Confirm its existing Classic `@page` remains A4.
- [ ] Run focused tests, ESLint, and a production build of font resolution; verify pass.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): style boardroom and dashboard reports"`.

### Task 15: Generate and wire the nine synthetic preview assets

**Files:**

- Create: `src/app/(dashboard)/admin/surveys/report-style-preview/page.tsx`
- Modify: `src/components/assessments/BrandedReport.tsx`
- Create: `scripts/capture-report-style-previews.mjs`
- Create: `public/report-style-previews/classic/{cover,summary,detail}.webp`
- Create: `public/report-style-previews/executive-boardroom/{cover,summary,detail}.webp`
- Create: `public/report-style-previews/modern-dashboard/{cover,summary,detail}.webp`
- Modify: `src/lib/assessments/report-style-registry.ts`
- Create: `src/__tests__/app/report-style-preview-page.test.tsx`

**Interfaces:** The preview page accepts only catalog style/page query values and renders the committed synthetic fixture. The capture script writes the nine exact registry paths. No respondent/campaign loader is reachable from this route.

- [ ] Add a route test that mocks `@/lib/db` and `getRespondentReport` to throw if imported, then proves the page renders all three styles exclusively from the synthetic fixture and rejects unknown query values.
- [ ] Run the route test and observe module-not-found.
- [ ] Implement the admin-authenticated preview page with a print/capture mode that renders exactly one representative page at a deterministic viewport. Mock only the auth boundary in unit tests; production code must not import Prisma, a campaign, a submission, or a respondent-report loader.
- [ ] Implement the Playwright script to iterate the three styles × three pages, wait for `document.fonts.ready`, capture the renderer root, convert/write WebP, and fail if any output is absent or zero bytes.
- [ ] Start the local app with the feature enabled, run `node scripts/capture-report-style-previews.mjs`, and inspect all nine outputs. Do not commit placeholder images.
- [ ] Point registry preview URLs to the committed files and rerun the picker tests.
- [ ] Run the route/picker suites and ESLint; verify pass.
- [ ] Stage only the generated assets and files listed for this task, review `git diff --cached`, then commit with `git commit -m "feat(assessments): add synthetic report style previews"`.

### Task 16: Complete integration, accessibility, visual, and print verification

**Files:**

- Create: `e2e/report-styles.spec.ts`
- Create: `scripts/render-report-style-qa.cjs`
- Create: `scripts/report-style-e2e-server-contract.cjs`
- Create: `scripts/start-report-style-e2e.mjs`
- Modify: `playwright.config.ts`
- Create: `src/__tests__/e2e/report-style-e2e-contract.test.ts`
- Modify: `src/app/(dashboard)/admin/surveys/report-style-preview/page.tsx`
- Modify: `src/__tests__/app/report-style-preview-page.test.tsx`
- Modify: `src/lib/assessments/report-style-preview-fixture.ts`
- Modify: `src/__tests__/app/assessment-respondent-report-page.test.tsx`
- Modify: `src/__tests__/app/public-submission-report-page.test.tsx`
- Modify: `src/__tests__/app/group-report-route.test.tsx`
- Modify: `src/__tests__/assessments/report-email.test.ts`
- Modify: `src/__tests__/components/admin/template-editor/report-style-default.test.tsx`
- Modify: `src/__tests__/components/assessments/campaign-detail-report-style.test.tsx`
- Create: `docs/qa/2026-08-05-report-style-visual-matrix.md`

**Interfaces:** Playwright covers admin default → campaign inheritance → coach override → first completion → locked picker → on-screen report → print for both new styles. QA matrix records observed artifacts, not anticipated results.

- [ ] Write end-to-end tests for the complete happy path and lock race. Use synthetic test records and stable test IDs; do not depend on production data.
- [ ] Run the existing individual public-submission, qualitative, group-report, and results-email regression suites with the flag off and killed; prove those non-goal surfaces remain unchanged.
- [ ] Add axe checks for the admin picker, coach picker, boardroom report, and dashboard report. Assert keyboard selection and read-only semantics.
- [ ] Add screenshot/print checks at desktop, mobile, and Letter print media for normal, partial, degraded, maximum-length, missing-optional, and long-branding fixtures.
- [ ] Run the focused Jest matrix:

```bash
npx jest \
  src/__tests__/prisma/report-style-migration.test.ts \
  src/__tests__/lib/assessments/report-style-policy.test.ts \
  src/__tests__/lib/assessments/report-style-lock.test.ts \
  src/__tests__/lib/assessments/respondent-report.test.ts \
  src/__tests__/lib/assessments/scored-report-view-model.test.ts \
  src/__tests__/components/assessments/report-style-picker.test.tsx \
  src/__tests__/components/assessments/report-style-renderers.test.tsx \
  src/__tests__/components/assessments/report-style-print-contract.test.tsx \
  src/__tests__/components/admin/template-editor/report-style-default.test.tsx \
  src/__tests__/components/assessments/campaign-detail-report-style.test.tsx \
  src/__tests__/app/assessment-respondent-report-page.test.tsx \
  src/__tests__/app/public-submission-report-page.test.tsx \
  src/__tests__/app/group-report-route.test.tsx \
  src/__tests__/assessments/report-email.test.ts \
  --runInBand
```

- [ ] Run `npx playwright test e2e/report-styles.spec.ts` against a local production build and inspect every captured page. Record page count, clipping, overlaps, blank trailing pages, glyphs, provenance, and body readability in the QA matrix.
- [ ] Verify Classic flag-off and kill screenshots/DOM against the pre-change baseline. Any difference is a release blocker unless separately approved.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "test(assessments): verify report style experience"`.

### Task 17: Run repository gates and prepare dark rollout documentation

**Files:**

- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Create: `docs/runbooks/report-style-rollout.md`
- Modify: `docs/superpowers/specs/2026-08-05-report-style-selection-design.md`
- Modify: `src/src/__tests__/components/assessments/campaign-detail-add-existing.test.tsx`

**Interfaces:** Runbook defines env levers, canary identifiers, validation queries, kill procedure, and the rule that the production default remains Classic until visual acceptance.

- [ ] Write the rollout runbook with exact variables: `WAVE_REPORT_STYLES_ENABLED`, `WAVE_REPORT_STYLES_CANARY`, and `WAVE_REPORT_STYLES_KILL`; include kill precedence and confirmation that killing preserves stored enum values.
- [ ] Document the sequence: migrate/flag off, verify Classic, canary test campaigns, visually accept both new styles, enable picker generally with Classic default, then change default only by deliberate admin action.
- [ ] Update `CLAUDE.md` SoT anchors/prose and prepend a complete `plans/CHANGELOG.md` entry describing scope, flags, migration, tests, and non-goals.
- [ ] Run ESLint on every changed TypeScript/TSX file and fix all errors.
- [ ] Run all targeted Jest suites from Tasks 1–16 and fix failures.
- [ ] Run `node scripts/check-migration-safety.mjs` and verify pass.
- [ ] Run `CI=true npx next build --turbopack` and verify pass.
- [ ] Run `git diff --check` and review `git diff --stat` plus the full diff for unrelated changes, PII in fixtures/assets, and accidental Classic CSS/DOM drift.
- [ ] Stage only the files listed for this task, review `git diff --cached`, then commit with `git commit -m "docs(assessments): prepare report style rollout"`.
- [ ] Request code review using `superpowers:requesting-code-review`; address findings with `superpowers:receiving-code-review`; rerun every affected focused test and the final gates before claiming completion.

## Final Acceptance Checklist

- [ ] Existing campaigns are Classic; campaigns with submissions are locked at their earliest `submittedAt`; campaigns without submissions remain editable.
- [ ] Admin default is present only on Scaling Up Full in the current ED10 Settings tab and affects future campaigns only.
- [ ] Coach can select during creation and edit on campaign detail before the first completion.
- [ ] Owning coach and admin both receive `409` after the atomic lock.
- [ ] Both submission routes lock inside the successful submission transaction before insert; rollback does not strand a lock.
- [ ] On-screen and browser-print output use the same campaign snapshot and renderer.
- [ ] Canonical values, wording, recommendations, and CTA eligibility are identical across styles.
- [ ] Classic flag-off, kill, invalid-key, ineligible-template, and missing-style fallbacks are proven.
- [ ] Qualitative, group, other scored instruments, and results-email HTML are unchanged.
- [ ] Preview artifacts are generated from the committed synthetic fixture and contain no production identifiers or PII.
- [ ] Boardroom and Dashboard pass desktop/mobile/US-Letter visual QA with no clipping, overlap, broken glyphs, blank pages, or missing provenance.
- [ ] Targeted tests, migration safety, ESLint, Turbopack, and diff hygiene pass with observed output.
