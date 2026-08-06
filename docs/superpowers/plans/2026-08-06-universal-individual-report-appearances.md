# Universal Individual Report Appearances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to execute this plan one task at a
> time, with a fresh implementer and a fresh reviewer for every task.

**Goal:** Make Classic, Executive Boardroom, and Modern Dashboard available for
every individual assessment report while preserving each assessment's canonical
facts, ownership rules, first-completion lock, and unrelated output families.

**Architecture:** Existing scored/qualitative classification and fact builders
remain authoritative. They adapt into a new instrument-neutral
`IndividualReportPresentation` made of optional semantic blocks. Classic keeps
its current scored and qualitative render paths; the two alternate renderers
consume the neutral presentation. Server-side availability, authorization,
inheritance, and locking stay authoritative.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma/PostgreSQL, Jest,
Testing Library, Playwright preview capture, Tailwind/CSS print styles.

**Approved design:**
`docs/superpowers/specs/2026-08-06-universal-individual-report-appearances-design.md`

**Fixed review point:** `72c8e0f5`

## Global constraints

- Use red-green-refactor at the seams named in each task. Observe the intended
  test fail before implementation.
- Do not rewrite either Classic renderer. Classic remains the exact fallback
  when unavailable, killed, invalid, unknown, or failed safely.
- Do not change assessment classification, scoring, findings, recommendations,
  frozen results, group reports, longitudinal reports, or email HTML.
- Do not infer facts or render empty blocks. A missing semantic block collapses
  completely.
- Do not add a top-level navigation item.
- Admin/Staff own template defaults and admin-owned public campaigns. The exact
  owning coach owns coach campaigns. Admin/Staff see coach campaign appearance
  read-only.
- The first successful completion locks the selected campaign appearance in the
  same transaction. Import-created completed campaigns follow the same rule.
- Preserve global flag, exact template/campaign canaries, kill precedence, and
  stored non-Classic values while unavailable.
- Commit each completed task separately.

## Task 1: Universal catalog eligibility and server policy

**Files:**

- Modify: `src/src/lib/assessments/report-style-policy.ts`
- Modify: `src/src/lib/assessments/report-style-registry.ts`
- Modify: `src/src/app/api/admin/assessment-templates/[id]/route.ts`
- Modify: `src/src/app/api/assessment-campaigns/route.ts`
- Modify: `src/src/components/assessments/CampaignWizard.tsx`
- Test: `src/src/__tests__/lib/assessments/report-style-policy.test.ts`
- Test: `src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts`
- Test: `src/src/__tests__/api/assessment-campaigns/campaigns-route.test.ts`
- Test: `src/src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx`

### Steps

- [ ] Add failing policy tests proving arbitrary aliases, null aliases, scored,
  qualitative, and custom templates are eligible; unavailable/invalid values
  still resolve to Classic.
- [ ] Add failing API tests proving any template accepts any valid catalog
  default when available and every invited campaign snapshots an authorized
  explicit choice or the template default.
- [ ] Remove the `scaling-up-full` alias allowlist from server policy and all
  client/API callers. Keep `isReportStyleEligible` only if it remains a
  compatibility helper that expresses universal template eligibility.
- [ ] Keep availability in `isReportStylesEnabled({templateId, campaignId})`;
  clients receive the exact server decision and never inspect aliases.
- [ ] Make `resolveCampaignReportStyle` distinguish an explicit choice even when
  it equals the template default, because provenance is based on intent, not
  value inequality.
- [ ] Replace Scaling Up-specific catalog descriptions with
  instrument-neutral copy while preserving keys, labels, and paper formats.
- [ ] Run:
  `npx jest src/__tests__/lib/assessments/report-style-policy.test.ts src/__tests__/api/admin/assessment-templates/templates-crud.test.ts src/__tests__/api/assessment-campaigns/campaigns-route.test.ts src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx --runInBand`
- [ ] Run TypeScript and lint for changed files.
- [ ] Commit as
  `feat(assessments): make report appearance eligibility universal`.

## Task 2: Instrument-neutral individual presentation model

**Files:**

- Create: `src/src/lib/assessments/individual-report-presentation.ts`
- Create: `src/src/__tests__/lib/assessments/individual-report-presentation.test.ts`
- Modify: `src/src/lib/assessments/scored-report-view-model.ts`
- Modify: `src/src/lib/assessments/qualitative-report-model.ts`
- Test: `src/src/__tests__/lib/assessments/scored-report-view-model.test.ts`
- Test: `src/src/__tests__/lib/assessments/qualitative-report-model.test.ts`

### Contract

Implement a readonly discriminated model:

```ts
type IndividualReportPresentation = Readonly<{
  identity: ReportIdentity;
  blocks: readonly IndividualReportBlock[];
  provenance: ReportProvenance;
}>;

type IndividualReportBlock =
  | ScoreSummaryBlock
  | MetricGroupBlock
  | QualitativeScaleBlock
  | ThemeBlock
  | FindingBlock
  | RecommendationBlock
  | NarrativeResponseBlock
  | AdditionalResponseBlock
  | CoachCtaBlock
  | ClosingBlock;
```

Each block has a literal `kind`, authored labels, canonical values, and stable
keys where available. A block is emitted only when it has meaningful canonical
content.

### Steps

- [ ] Add failing scored tests that compare every emitted label, value,
  precision, finding, recommendation, response, CTA decision, and provenance to
  the existing scored view model.
- [ ] Add failing qualitative tests proving scales, chosen labels, themes,
  findings, narratives, recommendations, and provenance are preserved without
  score/tier/scorecard blocks.
- [ ] Add a sparse-custom fixture with only authored prompts and narrative
  answers; assert it emits no synthetic metric, tier, status, finding,
  recommendation, or CTA.
- [ ] Implement scored and qualitative adapters over the existing canonical
  builders. Do not duplicate scoring or report-type classification.
- [ ] Freeze the returned presentation and block arrays to retain the current
  frozen-model contract.
- [ ] Add invariant tests proving all three styles receive the same presentation
  object for one report and malformed optional input drops only the affected
  optional block.
- [ ] Run:
  `npx jest src/__tests__/lib/assessments/individual-report-presentation.test.ts src/__tests__/lib/assessments/scored-report-view-model.test.ts src/__tests__/lib/assessments/qualitative-report-model.test.ts --runInBand`
- [ ] Run TypeScript and lint for changed files.
- [ ] Commit as
  `feat(assessments): add neutral individual report presentation`.

## Task 3: Adaptive alternate renderers and explicit dispatch

**Files:**

- Modify: `src/src/components/assessments/BrandedReport.tsx`
- Modify: `src/src/components/assessments/report-styles/ExecutiveBoardroomReport.tsx`
- Modify: `src/src/components/assessments/report-styles/ModernDashboardReport.tsx`
- Modify: `src/src/components/assessments/report-styles/ReportSharedContent.tsx`
- Modify: `src/src/app/globals.css`
- Test: `src/src/__tests__/components/assessments/report-style-renderers.test.tsx`
- Test: `src/src/__tests__/components/assessments/report-style-print-contract.test.tsx`
- Test: `src/src/__tests__/components/assessments/qualitative-report.test.tsx`

### Steps

- [ ] Add a renderer matrix that covers scored, qualitative, and sparse custom
  presentations in both alternate appearances.
- [ ] Assert no Five Decisions, numeric score, tier, scorecard, empty card, or
  placeholder heading is produced unless the neutral model emitted that fact.
- [ ] Assert every emitted semantic block appears once with unchanged authored
  text and values.
- [ ] Refactor shared content to render neutral block kinds. Keep
  appearance-specific composition in the two appearance components.
- [ ] Move qualitative routing after style resolution: Classic still delegates
  to the existing `QualitativeReport`; alternate styles adapt the existing
  qualitative model into the neutral presentation.
- [ ] Replace implicit “non-Executive means Dashboard” dispatch with an
  exhaustive switch. Unknown or malformed keys resolve to Classic and produce
  only IDs/alias/archetype/style in diagnostics.
- [ ] Add print assertions: Classic A4 remains unchanged; both alternate styles
  declare US Letter; long content wraps; missing blocks produce no blank
  columns/pages; mobile composition has no horizontal-scroll requirement.
- [ ] Run:
  `npx jest src/__tests__/components/assessments/report-style-renderers.test.tsx src/__tests__/components/assessments/report-style-print-contract.test.tsx src/__tests__/components/assessments/qualitative-report.test.tsx --runInBand`
- [ ] Run TypeScript and lint for changed files.
- [ ] Commit as
  `feat(assessments): render adaptive individual report appearances`.

## Task 4: Coach ownership and admin read-only campaign detail

**Files:**

- Modify: `src/src/app/api/assessment-campaigns/[id]/route.ts`
- Modify: `src/src/lib/assessments/campaign-detail.ts`
- Modify: `src/src/components/assessments/CampaignDetail.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx`
- Modify: `src/src/app/(portal)/portal/assessments/[id]/page.tsx`
- Test: `src/src/__tests__/api/assessment-campaigns/detail-route.test.ts`
- Test: `src/src/__tests__/components/assessments/campaign-detail-report-style.test.tsx`
- Test: `src/src/__tests__/app/admin-campaign-detail-page.test.tsx`

### Steps

- [ ] Add failing route tests for owning coach pre-lock success, cross-coach
  `403`, Admin/Staff coach-owned `403`, invalid key `400`, and every actor
  post-lock `409`.
- [ ] Isolate appearance authorization from broad campaign management:
  `COACH` requires exact campaign coach ownership; privileged actors may only
  write through the admin-owned public-campaign path in Task 5.
- [ ] Preserve the current style-only `updateMany` condition on
  `reportStyleLockedAt: null`, and return the final locked appearance in the
  `409` response.
- [ ] Pass an explicit `canEditReportAppearance` capability into
  `CampaignDetail`; do not derive it from role in the client.
- [ ] Render the selected appearance, provenance, and lock time for every
  campaign. Show the picker/save action only to the exact owner while available
  and unlocked.
- [ ] On the Admin coach-campaign page, show the appearance card read-only and
  expose no save request path.
- [ ] Run:
  `npx jest src/__tests__/api/assessment-campaigns/detail-route.test.ts src/__tests__/components/assessments/campaign-detail-report-style.test.tsx src/__tests__/app/admin-campaign-detail-page.test.tsx --runInBand`
- [ ] Run TypeScript and lint for changed files.
- [ ] Commit as
  `fix(assessments): enforce report appearance ownership`.

## Task 5: Public campaign inheritance, override, and management UI

**Files:**

- Modify: `src/src/app/api/admin/public-campaigns/route.ts`
- Create: `src/src/app/api/admin/public-campaigns/[id]/report-style/route.ts`
- Modify: `src/src/app/(dashboard)/admin/assessments/public-campaigns/page.tsx`
- Modify: `src/src/components/admin/PublicCampaignsManager.tsx`
- Test: `src/src/__tests__/api/admin-public-campaigns.test.ts`
- Create:
  `src/src/__tests__/api/admin/public-campaigns/report-style-route.test.ts`
- Test:
  `src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx`

### Steps

- [ ] Add failing creation tests proving omitted choice snapshots the template
  default with `TEMPLATE_DEFAULT`, and an explicit valid choice snapshots
  `CAMPAIGN_OVERRIDE`.
- [ ] Validate the closed catalog and exact server availability. With the flag
  off or kill active, ignore no values silently: reject a crafted non-Classic
  write while still creating inherited Classic campaigns where appropriate.
- [ ] Select `defaultReportStyle` from the template and persist
  `reportStyle`, `reportStyleSource`, and null `reportStyleLockedAt` in both
  alias-collision create branches.
- [ ] Add a privileged, admin-owned-public-only conditional update endpoint.
  Require `accessMode: PUBLIC`, no coach owner, availability, valid catalog key,
  and `reportStyleLockedAt: null`; return `409` if completion wins.
- [ ] Add the compact picker and inheritance copy to public-campaign creation,
  include the selected appearance in the review/submit payload, and expose the
  full picker in the existing management row until locked.
- [ ] After lock, leave the selected card, provenance, timestamp, and approved
  lock explanation visible and read-only.
- [ ] Run:
  `npx jest src/__tests__/api/admin-public-campaigns.test.ts src/__tests__/api/admin/public-campaigns/report-style-route.test.ts src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx --runInBand`
- [ ] Run TypeScript and lint for changed files.
- [ ] Commit as
  `feat(assessments): add public campaign report appearance control`.

## Task 6: Transactional completion and import locking

**Files:**

- Modify: `src/src/lib/assessments/report-style-lock.ts`
- Modify: `src/src/app/api/quiz/[campaignAlias]/submit/route.ts`
- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`
- Modify: `src/src/lib/assessments/esperto-import/results-commit.ts`
- Modify: `src/src/lib/assessments/esperto-import/restricted-commit.ts`
- Test: `src/src/__tests__/lib/assessments/report-style-lock.test.ts`
- Test: `src/src/__tests__/api/quiz/submit-post.test.ts`
- Test: `src/src/__tests__/app/org-survey/submit.test.ts`
- Test: `src/src/__tests__/app/org-survey/submit-onscreen-results.test.ts`
- Test:
  `src/src/__tests__/lib/assessments/esperto-import/results-commit.test.ts`
- Test:
  `src/src/__tests__/lib/assessments/esperto-import/restricted-commit.test.ts`

### Steps

- [ ] Add a failing public-submit race test: the pre-read sees Classic, an
  authorized save commits Executive, and the completion transaction must lock
  and build its immediate result with Executive.
- [ ] Change the lock helper to return the final transactional campaign
  appearance after acquiring the row-ordering lock. Use that returned snapshot
  for appearance-dependent immediate result/report models.
- [ ] Preserve ordering: save-first freezes saved value; completion-first makes
  the save return `409`; submission rollback rolls back the lock.
- [ ] Keep email HTML visually unchanged; only its canonical input may carry the
  final frozen appearance.
- [ ] Add import tests proving campaigns created with completed submissions set
  appearance/source and lock at the earliest imported submission time in the
  same transaction.
- [ ] Prove import retries preserve the stored appearance and lock
  idempotently. Do not add a production data repair migration.
- [ ] Run:
  `npx jest src/__tests__/lib/assessments/report-style-lock.test.ts src/__tests__/api/quiz/submit-post.test.ts src/__tests__/app/org-survey/submit.test.ts src/__tests__/app/org-survey/submit-onscreen-results.test.ts src/__tests__/lib/assessments/esperto-import/results-commit.test.ts src/__tests__/lib/assessments/esperto-import/restricted-commit.test.ts --runInBand`
- [ ] Run TypeScript and lint for changed files.
- [ ] Commit as
  `fix(assessments): freeze final report appearance on completion`.

## Task 7: Universal entry-point coverage and regression isolation

**Files:**

- Modify:
  `src/src/app/(report)/assessments/public-submissions/[submissionId]/report/page.tsx`
- Modify:
  `src/src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx`
- Modify: `src/src/components/assessments/org-survey-client.tsx`
- Modify: `src/src/components/assessments/public-quiz-client.tsx`
- Modify: `src/src/lib/assessments/respondent-report.ts`
- Modify: `src/src/lib/assessments/public-referrals.ts`
- Test: `src/src/__tests__/app/assessment-respondent-report-page.test.tsx`
- Test:
  `src/src/__tests__/app/assessment-respondent-report-page.wave-s.test.tsx`
- Test: `src/src/__tests__/app/public-submission-report-page.test.tsx`
- Test: `src/src/__tests__/api/quick-assessment-submit.test.ts`
- Test: `src/src/__tests__/assessments/report-email.test.ts`
- Test: `src/src/__tests__/assessments/report-email-qualitative.test.ts`
- Test: `src/src/__tests__/lib/assessments/respondent-longitudinal.test.ts`

### Steps

- [ ] Build an entry-point matrix covering scored, qualitative, and sparse
  custom reports for invited on-screen, invited authenticated, public
  immediate, public authenticated/referral, Coach view, and Admin view.
- [ ] Pass exact server availability and the campaign snapshot into
  `BrandedReport` at every individual entry point. Do not make page components
  read environment variables client-side.
- [ ] Assert selected style remains identical between immediate and later
  authenticated views.
- [ ] Add negative regression assertions proving group/aggregate and
  longitudinal/trend paths never import or dispatch appearance renderers.
- [ ] Snapshot or semantic-assert results-email and short notification HTML for
  non-Classic stored styles; output must remain byte/structure equivalent to
  Classic email behavior.
- [ ] Run the entry-point and regression suites listed above with
  `--runInBand`.
- [ ] Run TypeScript and lint for changed files.
- [ ] Commit as
  `test(assessments): cover universal report appearance entry points`.

## Task 8: Preview anatomies, visual QA fixtures, and repository closeout

**Files:**

- Modify: `src/src/lib/assessments/report-style-preview-fixture.ts`
- Modify:
  `src/src/app/(dashboard)/admin/surveys/report-style-preview/page.tsx`
- Modify: `src/scripts/capture-report-style-previews.mjs`
- Modify: `src/public/report-style-previews/**`
- Test:
  `src/src/__tests__/lib/assessments/report-style-preview-fixture.test.ts`
- Test: `src/src/__tests__/app/report-style-preview-page.test.tsx`
- Test: `src/src/__tests__/scripts/capture-report-style-previews.test.ts`
- Test: `src/src/__tests__/e2e/report-style-e2e-contract.test.ts`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

### Steps

- [ ] Add scored, qualitative, and sparse-custom synthetic preview anatomies,
  each with Cover, Summary, and Detail variants for all three appearances.
- [ ] Route preview fixtures through the same presentation adapters and
  appearance renderers used by real individual reports.
- [ ] Update preview metadata/selection so the existing template report family
  and capabilities select a representative anatomy; no production records or
  authored customer content may enter an asset.
- [ ] Preserve selection/save when an image fails and expose
  `Preview unavailable` plus retry.
- [ ] Add maximum-length and missing-block fixtures; assert no empty cards,
  blank columns, color-only status, or inaccessible selected/read-only state.
- [ ] Capture the committed WebP assets and run the script's PDF/page assertions
  for Classic A4 and alternate US Letter output.
- [ ] Update the source-of-truth timestamp/slug and prepend a complete changelog
  entry describing scope, flags, canaries, exclusions, data behavior, and
  verification.
- [ ] Run targeted preview/e2e tests, then:
  `node scripts/check-migration-safety.mjs`.
- [ ] Run all changed-file ESLint checks.
- [ ] Run the full Jest suite once, from a fresh process:
  `npm test -- --runInBand`.
- [ ] Run the repository typecheck if present in `package.json`.
- [ ] Run the production build gate:
  `CI=true npx next build --turbopack`.
- [ ] Commit as
  `chore(assessments): close universal appearance rollout`.

## Final review and handoff

- [ ] Confirm `git diff 72c8e0f5...HEAD` is non-empty and limited to approved
  scope.
- [ ] Run two independent code reviews against `72c8e0f5`: Standards
  (`AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, repository conventions, smell
  baseline) and Spec (the approved design and this plan).
- [ ] Route every actionable finding back through a fresh implementer, rerun
  affected checks, and repeat review until neither axis has actionable findings.
- [ ] Run verification-before-completion using fresh command output.
- [ ] Report the branch, commits, exact gates, baseline flakes if any, and any
  remaining deployment action. Do not push, create a PR, merge, or deploy unless
  separately authorized.
