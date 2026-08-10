# Admin-Owned Invited Welcome Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute this plan task-by-task.

**Goal:** Let ADMIN/STAFF author every assessment template's invited Welcome screen in Build, freeze that content into future invited campaigns, and remove report-style decisions from coach campaign creation and management without changing existing campaigns or public quizzes.

**Architecture:** A strict, versioned `InvitedWelcomeConfigV1` contract owns defaults, legacy fallbacks, authoring validation, safe interpolation, and defensive reads. `AssessmentTemplate.invitedWelcomeDefault` is the future-campaign default; every new INVITED insertion path copies a validated config into immutable `AssessmentCampaign.invitedWelcomeSnapshot` inside its creation transaction. Snapshot persistence starts with the additive migration even while presentation is dark. One kill-first feature flag controls admin authoring, participant payload/rendering, and coach report-style ownership. Flag off preserves today's admin, coach, and respondent output; PUBLIC campaign paths never read or write the invited snapshot.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL JSONB + trigger, Zod, Tailwind/shadcn tokens, Jest + React Testing Library, Turbopack.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-10-invited-welcome-authoring-and-coach-report-style-simplification.md`.
- Work in `/Users/diushianstand/Scaling-up-platform-v2/.worktrees/invited-welcome-authoring-design`; run app commands from its `src/` directory.
- This worktree uses the canonical checkout's dependencies. For commands below:

  ```bash
  SCALING_DEPS=/Users/diushianstand/Scaling-up-platform-v2/src/node_modules
  export NODE_PATH="$SCALING_DEPS"
  ```

- Red first, then the smallest implementation, then green. Commit after every numbered task.
- Do not alter `AssessmentTemplateVersion`, `contentHash`, publish behavior, report renderers, PUBLIC Welcome behavior, existing report-style storage, or first-completion locks.
- `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL` always wins over `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED`.
- Snapshot writes are not feature-gated after the migration. UI/API exposure, participant rendering, and coach report-style restrictions are feature-gated.
- Never serialize authored Welcome text to logs. Validation logs may contain campaign/template IDs and issue codes only.
- Preserve unrelated worktree changes. Do not update production flags, deploy, or mutate production data during implementation.

---

## File Map

### New files

- `src/src/lib/assessments/invited-welcome-config.ts` — types, strict authoring schema, defensive persisted schema, frozen defaults, legacy alias resolution, normalization, interpolation.
- `src/src/lib/assessments/invited-welcome-snapshot.ts` — server-only transactional template reload and snapshot resolver.
- `src/src/lib/assessments/invited-welcome-backfill-verifier.ts` — pure row validation and launch-count aggregation.
- `src/src/lib/assessments/wave-admin-owned-assessment-presentation-flags.ts` — coordinated enable/kill gate.
- `src/src/components/assessments/InvitedWelcomeCard.tsx` — shared invited card body used by participant rendering and admin preview.
- `src/src/components/admin/template-editor/WelcomeScreenCard.tsx` — collapsed/expanded authoring card and field errors.
- `src/prisma/migrations/20260810160000_add_invited_welcome_snapshots/migration.sql` — nullable columns, exact legacy backfill, immutability trigger.
- `src/scripts/verify-invited-welcome-backfill.ts` — read-only Prisma wrapper around the shared launch verifier.
- `src/src/__tests__/lib/assessments/invited-welcome-config.test.ts`
- `src/src/__tests__/lib/assessments/invited-welcome-snapshot.test.ts`
- `src/src/__tests__/lib/assessments/invited-welcome-backfill-verifier.test.ts`
- `src/src/__tests__/lib/assessments/wave-admin-owned-assessment-presentation-flags.test.ts`
- `src/src/__tests__/prisma/invited-welcome-snapshot-migration.test.ts`
- `src/src/__tests__/api/admin/assessment-templates/invited-welcome-default.test.ts`
- `src/src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx`
- `src/src/__tests__/components/admin/template-editor/welcome-screen-save.test.tsx`
- `src/src/__tests__/api/assessment-campaigns/invited-welcome-snapshot.test.ts`
- `src/src/__tests__/api/assessment-campaigns/me-invited-welcome.test.ts`
- `src/src/__tests__/assessments/invited-welcome-snapshot-render.test.tsx`
- `src/src/__tests__/lib/assessments/esperto-import/invited-welcome-snapshot.test.ts`
- `src/public/wireframes-phase2/admin/26-admin-template-editor-welcome.html`
- `docs/wireframes-phase2/wave7/26-admin-template-editor-welcome.md`
- `docs/adr/0033-admin-owned-invited-welcome-snapshots.md`
- `docs/runbooks/admin-owned-assessment-presentation-rollout.md`

### Modified files

- `src/prisma/schema.prisma`
- `src/src/lib/assessments/welcome-copy.ts`
- `src/src/components/assessments/assessment-welcome.tsx`
- `src/src/components/assessments/org-survey-client.tsx`
- `src/src/app/(public)/org-survey/[campaignAlias]/me/route.ts`
- `src/src/app/api/admin/assessment-templates/route.ts`
- `src/src/app/api/admin/assessment-templates/[id]/route.ts`
- `src/src/lib/assessments/seed-template-version.ts`
- `src/prisma/seed-scaling-up-full-assessment.ts`
- `src/src/app/api/assessment-campaigns/route.ts`
- `src/src/app/api/assessment-campaigns/[id]/route.ts`
- `src/src/app/api/assessment-templates/route.ts`
- `src/src/lib/assessments/esperto-import/results-commit.ts`
- `src/src/lib/assessments/esperto-import/restricted-commit.ts`
- `src/src/components/admin/template-editor/TabbedShell.tsx`
- `src/src/components/admin/template-editor/FormsBuilder.tsx`
- `src/src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts`
- `src/src/components/admin/template-editor/hooks/useTemplateEditorModel.ts`
- `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx`
- `src/src/components/assessments/CampaignWizard.tsx`
- `src/src/app/(portal)/portal/assessments/new/page.tsx`
- `src/src/components/assessments/CampaignDetail.tsx`
- `src/src/app/(portal)/portal/assessments/[id]/page.tsx`
- `src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts`
- `src/src/__tests__/seed/seed-template-version.test.ts`
- `src/src/__tests__/seed/scaling-up-full.test.ts`
- `src/src/__tests__/api/assessment-campaigns/campaigns-route.test.ts`
- `src/src/__tests__/api/assessment-campaigns/detail-route.test.ts`
- `src/src/__tests__/components/admin/template-editor/FormsBuilder.test.tsx`
- `src/src/__tests__/components/admin/template-editor/useTemplateEditorDraft.ed10-split-save.test.ts`
- `src/src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx`
- `src/src/__tests__/components/assessments/campaign-detail-report-style.test.tsx`
- `src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx`
- `src/src/__tests__/assessments/welcome-lede.test.tsx`
- `src/src/__tests__/assessments/assessment-welcome.test.tsx`
- `src/src/__tests__/lib/assessments/welcome-copy.test.ts`
- `docs/adr/0026-welcome-screen-copy-is-code-owned.md`
- `CONTEXT.md`
- `CLAUDE.md`
- `plans/CHANGELOG.md`

---

## Task 0 — Baseline and flag-off golden pins

**Files:** Existing tests only; add no product code.

- [ ] Run the current Welcome, editor, coach report-style, template API, campaign API, import, public-campaign, and public-quiz suites. Record exact counts in the implementation receipt.

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/.worktrees/invited-welcome-authoring-design/src
  SCALING_DEPS=/Users/diushianstand/Scaling-up-platform-v2/src/node_modules
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/jest" \
    src/__tests__/assessments/assessment-welcome.test.tsx \
    src/__tests__/assessments/welcome-lede.test.tsx \
    src/__tests__/components/admin/template-editor/FormsBuilder.test.tsx \
    src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx \
    src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx \
    src/__tests__/components/assessments/campaign-detail-report-style.test.tsx \
    src/__tests__/api/assessment-campaigns/campaigns-route.test.ts \
    src/__tests__/api/assessment-campaigns/detail-route.test.ts \
    src/__tests__/api/admin-public-campaigns.test.ts \
    --runInBand
  ```

  Expected: all selected suites pass; do not proceed from a red baseline.

- [ ] Add flag-off assertions to the existing golden/parity suites before changing behavior: no `Welcome screen` builder card; coach wizard and detail still contain the current Report appearance UI; `/me` omits `invitedWelcome`.
- [ ] Run the new pins and confirm they pass against HEAD.
- [ ] Commit: `test(assessments): pin presentation ownership flag-off behavior`.

## Task 1 — Domain contract and coordinated feature flag

**Files:** Create `invited-welcome-config.ts`, `wave-admin-owned-assessment-presentation-flags.ts`, and their tests; modify `welcome-copy.ts` without changing its exported legacy behavior.

- [ ] Write failing flag tests for default off, accepted truthy values (`1`, `true`, `TRUE`, `yes`), runtime env rereads, and kill-over-enable precedence.
- [ ] Implement `isAdminOwnedAssessmentPresentationEnabled()` using the same `isOn` semantics as `wave-ed10-flags.ts`.
- [ ] Write failing contract tests for these exact exports:

  ```ts
  export interface InvitedWelcomeConfigV1 {
    schemaVersion: 1;
    eyebrow: string;
    headingTemplate: string;
    ledeParagraphs: string[];
    sharingHeading: string;
    scoresHeading: string;
    scoresDescription: string;
    ctaLabel: string;
    finePrint: string | null;
  }

  export type InvitedWelcomeAuthoringInputV1 = Omit<
    InvitedWelcomeConfigV1,
    "schemaVersion" | "finePrint"
  >;
  ```

- [ ] Pin the generic config to today's visible invited card: `You're invited`, `{{campaignName}}`, current generic lede, `How your answers are shared`, `Your category scores`, `See where the team stands across each category.`, `Start the assessment`, and `finePrint: null`.
- [ ] Pin every legacy alias. `RockHabits` and `scaling-up-full` keep two paragraphs and the resume note; `leadership-vision-alignment`, `qsp-v2`, and `five-dysfunctions` keep one bespoke paragraph and the resume note; `qsp-v1`, `scaling-up-quick`, missing, unknown, and inherited object keys use the generic config with no separate fine print.
- [ ] Add authoring validation tests: trim strings, normalize CRLF, 60/160/1000/2500/120/120/400/80 boundaries, one-to-four paragraphs, required `{{campaignName}}`, reject all other `{{token}}` values, reject control characters, and reject `schemaVersion`/`finePrint` when they appear in an authoring request. Unknown non-owned authoring keys are stripped.
- [ ] Add defensive-read tests: accept only `schemaVersion: 1`; strip unknown persisted keys; unknown versions, malformed arrays, and invalid text return a typed failure rather than partial content.
- [ ] Add interpolation tests proving all occurrences of `{{campaignName}}` are replaced as text and never interpreted as markup.
- [ ] Implement the contract. Keep `resolveWelcomeLede()` and `shouldShowResumeNote()` as compatibility wrappers over `resolveLegacyInvitedWelcomeConfig()` so existing flag-off code and tests remain byte-identical.
- [ ] Run:

  ```bash
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/jest" \
    src/__tests__/lib/assessments/invited-welcome-config.test.ts \
    src/__tests__/lib/assessments/wave-admin-owned-assessment-presentation-flags.test.ts \
    src/__tests__/lib/assessments/welcome-copy.test.ts --runInBand
  ```

  Expected: all pass.

- [ ] Commit: `feat(assessments): define invited Welcome presentation contract`.

## Task 2 — Additive persistence, exact backfill, trigger, and verifier

**Files:** Modify `schema.prisma`; create migration, migration test, and verifier script.

- [ ] Write a failing plain-text migration test asserting:
  - `AssessmentTemplate.invitedWelcomeDefault Json?` and `AssessmentCampaign.invitedWelcomeSnapshot Json?` exist;
  - both database columns are nullable JSONB;
  - template backfill targets every non-deleted template;
  - campaign backfill targets every `accessMode = 'INVITED'` row without filtering status or `deletedAt`;
  - PUBLIC rows are never updated;
  - every known alias literal and exact legacy paragraph is present;
  - the trigger is created only after campaign backfill and rejects changes to a non-null snapshot;
  - no `AssessmentTemplateVersion` table or `contentHash` is touched.
- [ ] Add the nullable Prisma fields next to `defaultReportStyle` and `publicConfig` respectively.
- [ ] Write `migration.sql` in this order:
  1. add both nullable JSONB columns;
  2. construct the generic V1 JSON object with `jsonb_build_object`;
  3. update non-deleted templates with a `CASE template.alias` that embeds the exact arrays from `WELCOME_LEDE_BY_ALIAS` and the exact resume-note rule;
  4. update every INVITED campaign by joining its template and applying the same `CASE`, including DRAFT, ACTIVE, CLOSED, imported, and soft-deleted rows;
  5. leave PUBLIC rows null;
  6. create `assessment_campaign_block_invited_welcome_snapshot_mutation()` and `assessment_campaign_invited_welcome_snapshot_immutability_trigger`.

  The trigger condition is:

  ```sql
  IF OLD."invitedWelcomeSnapshot" IS NOT NULL
     AND NEW."invitedWelcomeSnapshot" IS DISTINCT FROM OLD."invitedWelcomeSnapshot" THEN
    RAISE EXCEPTION 'AssessmentCampaign invited Welcome snapshot is immutable once set (campaign=%).', OLD.id;
  END IF;
  ```

- [ ] Make the backfill rerun-safe by updating only null target columns. Keep the trigger function `CREATE OR REPLACE` and drop/recreate only the named trigger if the migration test harness reapplies the file.
- [ ] Implement pure aggregation in `invited-welcome-backfill-verifier.ts` using the shared persisted-config validator. Write `verify-invited-welcome-backfill.ts` as a read-only Prisma query/printing wrapper. It must print one JSON object containing `templatesTotal`, `templatesNonDeleted`, `templatesNull`, `templatesInvalid`, `invitedCampaignsTotal`, `invitedCampaignsNull`, `invitedCampaignsInvalid`, `publicCampaignsTotal`, `publicCampaignsWithSnapshot`, and `byTemplateAlias`; exit 1 if non-deleted template null/invalid, invited null/invalid, or public-with-snapshot is nonzero.
- [ ] Add a test for verifier aggregation using injected rows; no live database is required for Jest. Run the production verifier with `NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/tsx" scripts/verify-invited-welcome-backfill.ts` only against an explicitly selected environment during rollout.
- [ ] Run migration tests and safety:

  ```bash
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/jest" \
    src/__tests__/prisma/invited-welcome-snapshot-migration.test.ts \
    src/__tests__/lib/assessments/invited-welcome-backfill-verifier.test.ts --runInBand
  node scripts/check-migration-safety.mjs --migration=20260810160000_add_invited_welcome_snapshots
  ```

  Expected: tests pass; safety prints no unapproved destructive operations.

- [ ] Commit: `feat(assessments): persist immutable invited Welcome snapshots`.

## Task 3 — Template defaults for creation and ADMIN/STAFF save

**Files:** Modify both admin template routes, seed helper, template CRUD tests; create the dedicated Welcome API suite.

- [ ] Write failing template-create tests proving manual and simplified creation persist `GENERIC_INVITED_WELCOME_CONFIG`, and the object is outside the version `contentHash` input.
- [ ] Update `POST /api/admin/assessment-templates` so `tx.assessmentTemplate.create` writes the generic config as `Prisma.InputJsonValue` for both create modes.
- [ ] Update `ensureTemplateVersionContent()` so a newly inserted seeded template writes `resolveLegacyInvitedWelcomeConfig(c.alias)`. Never overwrite `invitedWelcomeDefault` on an existing template during reseed. Update the direct Scaling Up Full template-create branch to write its exact alias config as well; the search `rg -n "assessmentTemplate\.(create|upsert)" src/src src/prisma --glob '!**/__tests__/**'` must leave no production template-create path without either an explicit default or a documented dev-only exception.
- [ ] Write failing PATCH tests for ADMIN and STAFF success, coach 403, unauthenticated 401, flag-off 403 `ADMIN_OWNED_PRESENTATION_DISABLED`, field limits, paragraph round-trip, unknown-key stripping, and forged `schemaVersion`/`finePrint` rejection with `INVITED_WELCOME_SERVER_FIELDS_FORBIDDEN`.
- [ ] Extend `PatchTemplateBodySchema` with optional `invitedWelcomeDefault` authoring input. Inspect the raw nested object before Zod stripping to reject the two server-owned keys. When the feature is active, merge validated author input with `schemaVersion: 1` and the existing config's `finePrint`; if the existing config is absent/invalid, preserve `resolveLegacyInvitedWelcomeConfig(template.alias).finePrint`.
- [ ] Extend the existing template select with `alias` and `invitedWelcomeDefault`; write the whole validated object atomically and audit only the new object, without logging authored text to console.
- [ ] Confirm `defaultReportStyle` admin editing remains unchanged.
- [ ] Run:

  ```bash
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/jest" \
    src/__tests__/api/admin/assessment-templates/templates-crud.test.ts \
    src/__tests__/api/admin/assessment-templates/invited-welcome-default.test.ts \
    src/__tests__/seed/seed-template-version.test.ts \
    src/__tests__/seed/scaling-up-full.test.ts --runInBand
  ```

- [ ] Commit: `feat(admin): save assessment Welcome defaults`.

## Task 4 — Visual specification before UI implementation

**Files:** Create/update the canonical wireframe pair; add no product UI code yet.

- [ ] Build `26-admin-template-editor-welcome.html` with four review states in the real Build context: desktop collapsed, desktop expanded, 1024px expanded stacked, and resulting invited respondent Welcome. Include the existing header card above and Section 1 below so card scale is reviewable in context. Use `Example campaign` as the non-production preview heading value.
- [ ] Document the chosen state, field ownership, no card-level save, future-campaign helper copy, system-derived facts/protected disclosure, and coach report-style removals in the Markdown companion.
- [ ] Review the wireframe against the approved design before Task 6 starts. Confirm the card is collapsed by default, is nearly full canvas width without swallowing the rest of Build, contains no `Automatic`/`Protected` boxes, and has no `Save Welcome screen` action.
- [ ] Commit: `docs(assessments): specify invited Welcome authoring states`.

## Task 5 — Shared invited card and participant snapshot rendering

**Files:** Create `InvitedWelcomeCard.tsx`; modify welcome building blocks, `/me`, participant client, and Welcome tests.

- [ ] Write a failing `InvitedWelcomeCard` test proving it renders eyebrow, interpolated heading, all lede paragraphs, editable sharing/scores headings, scores description, CTA label plus the system arrow, system-owned named-answer disclosure, current time/count/section/scale derivation, and optional fine print.
- [ ] Add `scoresLabel` to `WelcomeExpectations`; default it to `Your category scores` so the public caller's rendered DOM does not change.
- [ ] Implement `InvitedWelcomeCard` as a presentational component. It receives a validated config, campaign name, questions, sections, and `onStart`; it owns no fetching or persistence.
- [ ] Write failing `/me` tests: flag off omits `invitedWelcome`; flag on emits only a validated campaign snapshot; invalid/missing/unknown-version snapshot resolves through the frozen legacy alias fallback; no template default is exposed.
- [ ] Extend the `/me` response only when the coordinated flag is active. Use the campaign scalar `invitedWelcomeSnapshot`; do not query or read `template.invitedWelcomeDefault`. Log only IDs and validation issue codes on fallback.
- [ ] Extend `SurveyData` with optional `invitedWelcome`. In `OrgSurveyClient`, preserve the existing JSX path verbatim when the feature is off. When on, resolve the emitted config and render `InvitedWelcomeCard`; if the payload is absent/invalid, render a locally resolved legacy config rather than a blank screen.
- [ ] Prove new authored copy renders as React text: a `<strong>text</strong>` value appears literally and creates no `strong` element.
- [ ] Re-run the existing public Welcome and public quiz suites to prove `public-quiz-client.tsx` is untouched.
- [ ] Run:

  ```bash
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/jest" \
    src/__tests__/api/assessment-campaigns/me-invited-welcome.test.ts \
    src/__tests__/assessments/invited-welcome-snapshot-render.test.tsx \
    src/__tests__/assessments/welcome-lede.test.tsx \
    src/__tests__/assessments/assessment-welcome.test.tsx \
    src/__tests__/assessments/public-quiz-pager.test.tsx \
    src/__tests__/assessments/public-quiz-thank-you.test.tsx \
    src/__tests__/components/public-quiz-results.test.tsx --runInBand
  ```

- [ ] Commit: `feat(assessments): render invited Welcome campaign snapshots`.

## Task 6 — Build-tab Welcome authoring card and top-level Save Draft

**Files:** Create `WelcomeScreenCard.tsx`; modify editor types/model/draft hook/FormsBuilder/server page and editor tests.

- [ ] Write failing card tests for collapsed-by-default state, `Welcome screen`, `First screen respondents see`, shortened lede, `Before Section 1`, the exact future-campaign helper copy, expand/collapse, all seven fields, one textarea-to-paragraph-array mapping, no fine-print/disclosure/fact fields, no `Automatic`/`Protected` boxes, no card-level Save button, live preview, narrow stack order, and read-only published state.
- [ ] Build the preview with the shared `InvitedWelcomeCard`, `Example campaign`, and the editor's current question/section arrays so time, count, scale, and rating-description copy use the same derivation functions as respondents. Pass a no-op preview CTA and mark it non-actionable.
- [ ] Add `invitedWelcomeDefault?: InvitedWelcomeConfigV1` to `TemplateEditorTabbedTemplate`, `welcome?: boolean` to `DirtyFlags`, and `adminOwnedPresentationEnabled?: boolean` to the editor props. Server-select the template JSON, defensively resolve it, and pass the server-computed flag.
- [ ] Hydrate `welcomeValues` separately from `templateValues`. Add `handleWelcomeFieldChange()` that updates the authoring input and marks only `dirtyFlags.welcome`.
- [ ] Before dispatching any Save Draft request, validate the current Welcome config when `dirtyFlags.welcome` is true. On failure, keep values and dirty state, show field errors in the card, and toast `Could not save Welcome screen`; dispatch no PATCH.
- [ ] Change the template PATCH condition to `dirtyFlags.metadata || dirtyFlags.welcome`. Include metadata keys only when metadata is dirty; include `invitedWelcomeDefault` only when Welcome is dirty. Use failed-surface text `Welcome screen`, `assessment details`, or `assessment details and Welcome screen` according to the flags. Clear Welcome dirty state only after the persisted response succeeds.
- [ ] Insert `<WelcomeScreenCard>` immediately after `<FormHeaderCard>` in both the normal and zero-section `FormsBuilder` paths. Gate it with `adminOwnedPresentationEnabled`; because FormsBuilder is the ED9 Build surface, the card is inert whenever ED9/single-column mode is not active.
- [ ] Keep the fixed card outside DnD/Sortable contexts so it cannot be reordered, duplicated, or deleted.
- [ ] Compare the implemented card with the Task 4 wireframe before styling changes. Use only existing semantic tokens; no hardcoded product colors.
- [ ] Add accessibility coverage: semantic expand button with `aria-expanded`/`aria-controls`, field labels and error associations, keyboard operation, logical source order (fields then preview on narrow screens), visible focus, no nested interactive controls, and a preview CTA that cannot start an assessment.
- [ ] Add a save test proving a simultaneous version success plus Welcome PATCH failure does not show `Draft saved` and keeps Welcome dirty for retry.
- [ ] Run:

  ```bash
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/jest" \
    src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx \
    src/__tests__/components/admin/template-editor/welcome-screen-save.test.tsx \
    src/__tests__/components/admin/template-editor/FormsBuilder.test.tsx \
    src/__tests__/components/admin/template-editor/useTemplateEditorDraft.ed10-split-save.test.ts \
    src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx --runInBand
  ```

- [ ] Commit: `feat(admin): author invited Welcome screens in Build`.

## Task 7 — Shared transactional snapshot resolver and coach campaign creation

**Files:** Create `invited-welcome-snapshot.ts`; modify coach campaign POST and its tests.

- [ ] Write failing resolver tests proving it reloads `{alias, invitedWelcomeDefault}` by template ID through the supplied transaction client, returns a valid stored default, falls back to exact legacy alias config for null/invalid data, and throws if the template disappears. It must return a fresh serializable object, not a mutable shared constant.
- [ ] Implement `loadInvitedWelcomeSnapshot(tx, templateId)` as the one server-only resolver used by every INVITED insertion path.
- [ ] Write failing route tests for both Wave-D and legacy create paths: snapshot is resolved inside the create transaction; the create data contains it; changing the template default between two requests changes only the second campaign; resolver failure creates no campaign.
- [ ] Make legacy creation transactional even without custom slides so template reload and campaign insertion share one boundary. Resolve the snapshot once per attempted transaction and pass it into `campaignCreateData(alias, invitedWelcomeSnapshot)`; P2002 alias retry reloads the current template default within the retry transaction.
- [ ] Add raw-body detection before Zod stripping. When the coordinated feature is active, any `reportStyle` property returns status 400 with `{ success: false, error: "REPORT_STYLE_ADMIN_OWNED" }` and performs no reads/writes beyond authentication/rate limiting.
- [ ] Under the active flag, derive report style only from freshly loaded `template.defaultReportStyle`, producing `reportStyleSource: TEMPLATE_DEFAULT`. When off, retain today's `resolveCampaignReportStyle(data.reportStyle, template.defaultReportStyle)` behavior exactly.
- [ ] Keep `createAssessmentCampaignSchema.reportStyle` for rollback/backward compatibility; ownership is enforced in the route, not by deleting the schema field.
- [ ] Run:

  ```bash
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/jest" \
    src/__tests__/lib/assessments/invited-welcome-snapshot.test.ts \
    src/__tests__/api/assessment-campaigns/invited-welcome-snapshot.test.ts \
    src/__tests__/api/assessment-campaigns/campaigns-route.test.ts \
    src/__tests__/api/assessment-campaigns/create-autosend.test.ts \
    src/__tests__/api/assessment-campaigns/create-custom-slides.test.ts --runInBand
  ```

- [ ] Commit: `feat(assessments): snapshot Welcome defaults on campaign create`.

## Task 8 — Snapshot historical-import insertion paths

**Files:** Modify both Esperto committers and their tests; add cross-path test.

- [ ] Write failing tests for `results-commit.ts` and `restricted-commit.ts`: a newly inserted historical INVITED campaign receives the current validated template default; reuse of an existing campaign does not mutate its snapshot; null/invalid template defaults resolve to legacy alias copy.
- [ ] Call `loadInvitedWelcomeSnapshot(tx, ctx.templateId)` immediately before each `tx.assessmentCampaign.create` in `results-commit.ts` and `commitCreatePath()` in `restricted-commit.ts`. Persist the result in the same transaction. Extend the restricted transaction interface to expose the template lookup required by the resolver.
- [ ] Do not touch public campaign creation. Add a regression assertion to `admin-public-campaigns.test.ts` that PUBLIC create data has no `invitedWelcomeSnapshot` key and remains null by database default.
- [ ] Search again for production INVITED insertion paths:

  ```bash
  rg -n "assessmentCampaign\.(create|upsert)" src/src src/prisma --glob '!**/__tests__/**'
  ```

  Every production `accessMode: INVITED` create must use the shared resolver; dev-only provisioning/walk scripts may rely on nullable fallback but must be listed in the PR notes. PUBLIC creates must not call it.

- [ ] Run:

  ```bash
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/jest" \
    src/__tests__/lib/assessments/esperto-import/invited-welcome-snapshot.test.ts \
    src/__tests__/lib/assessments/esperto-import/results-commit.test.ts \
    src/__tests__/lib/assessments/esperto-import/restricted-commit.test.ts \
    src/__tests__/api/admin-public-campaigns.test.ts --runInBand
  ```

- [ ] Commit: `feat(import): freeze Welcome copy on historical campaigns`.

## Task 9 — Remove report appearance from the coach wizard

**Files:** Modify coach template listing, wizard, new page, and report-style wizard tests.

- [ ] Pass `adminOwnedPresentationEnabled` from the coach new-campaign server page to `CampaignWizard`.
- [ ] Write flag-on tests proving the wizard shows no Report appearance heading/picker/source copy/review row; draft JSON omits `templateDefaultReportStyle`, `reportStyle`, `reportStyleIntent`, `templateReportStylesEnabled`, and preview capabilities; resumed legacy draft keys are ignored; create payload omits `reportStyle`.
- [ ] Keep the existing flag-off tests byte-identical. Implement the active path conditionally rather than deleting rollback behavior.
- [ ] In active mode, template selection and draft hydration never populate a coach choice. Preserve only the selected `templateId`; the create route owns the current default.
- [ ] In `GET /api/assessment-templates`, when the actor is a coach and the coordinated feature is active, omit `defaultReportStyle`, `reportStylesEnabled`, and `reportStylePreviewCapabilities`, and skip the extra preview-capability query. ADMIN/STAFF payloads and flag-off coach payloads remain unchanged.
- [ ] Run:

  ```bash
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/jest" \
    src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx \
    src/__tests__/components/assessments/campaign-wizard-d1.test.tsx \
    src/__tests__/api/assessment-templates/templates-route.test.ts --runInBand
  ```

- [ ] Commit: `feat(coach): inherit admin report appearance defaults`.

## Task 10 — Remove coach detail controls and enforce report-style ownership

**Files:** Modify campaign detail component, portal page, campaign PATCH route, and tests.

- [ ] Write portal/detail tests proving the active flag suppresses the entire `campaign-report-style-card` before and after first-response lock, including picker, preview, provenance, save action, lock text, and toasts. Existing report links remain.
- [ ] On the coach portal page, compute `reportStylesAvailable` and preview capabilities only when admin-owned presentation is off. Pass false/undefined when active. Leave the admin campaign host's existing read-only appearance display unchanged; this wave introduces no new admin UI.
- [ ] Keep `CampaignDetail`'s rollback-compatible report state/handler for the flag-off coach path and the existing admin host, but ensure the active coach page can never render or invoke it.
- [ ] Write PATCH tests for active mode: COACH gets status 403 `{ success: false, error: "REPORT_STYLE_ADMIN_OWNED" }` with no update/audit; ADMIN and STAFF retain the isolated compatibility write lane, subject to current report-style availability and first-response lock; generic mixed-field requests remain rejected. Flag off preserves exact-owner coach behavior and existing errors.
- [ ] Refactor `patchReportAppearance()` authorization in this order: validate isolated body; load campaign; if coordinated flag active and actor is not privileged, return the stable ownership error; if flag off, require the existing exact coach owner; in both allowed cases retain `canManageCampaign(..., "write")`, feature availability, CAS update, lock response, and audit.
- [ ] Run:

  ```bash
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/jest" \
    src/__tests__/components/assessments/campaign-detail-report-style.test.tsx \
    src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx \
    src/__tests__/app/admin-campaign-detail-page.test.tsx \
    src/__tests__/api/assessment-campaigns/detail-route.test.ts --runInBand
  ```

- [ ] Commit: `feat(coach): remove campaign report appearance controls`.

## Task 11 — ADR, domain language, runbook, and rollout receipts

**Files:** ADR-0026, new ADR-0033, CONTEXT, runbook, CLAUDE, CHANGELOG, approved design status.

- [ ] Mark ADR-0026 `Superseded by ADR-0033`; do not rewrite its historical reasoning.
- [ ] Record in ADR-0033: template-row default vs Template Version, immutable campaign snapshot, non-retroactivity including DRAFT campaigns, PUBLIC separation, migration/backfill/trigger, dark snapshot writes, and admin-owned report-style policy.
- [ ] Update `CONTEXT.md` so `Welcome screen` means an admin-authored assessment-template default copied into an immutable invited-campaign snapshot; distinguish it from section intros, custom slides, invitation email copy, and public Welcome.
- [ ] Write `admin-owned-assessment-presentation-rollout.md` with additive migration deploy, verifier command, default-off smoke, enabled acceptance, kill precedence, rollback behavior, and the invariant that killing presentation does not stop snapshot persistence.
- [ ] Mark the approved design `Status: BUILT` only after implementation and all local gates pass.
- [ ] Before the first production push, prepend a release-ready `plans/CHANGELOG.md` entry and update `CLAUDE.md` `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG`. After merge/deploy/enable, add a separate launch receipt with exact deployment, flag state, verifier counts, health, and visual acceptance. Never pre-claim launch.
- [ ] Run changelog freshness tests.
- [ ] Commit: `docs(assessments): record admin-owned presentation lifecycle`.

## Task 12 — Complete verification and release sequence

**Files:** No feature changes; only fixes justified by failing verification.

- [ ] Run focused suites from Tasks 1–10 with both feature states. For the active run set `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED=1`; for rollback set KILL=1 while enabled remains 1.
- [ ] Run all assessment editor, participant Welcome, coach campaign, campaign API, template API, imports, public campaign, and public quiz suites.
- [ ] Run the existing single-column accessibility suite plus Welcome card accessibility tests. Capture local desktop and 1024px Build screenshots in collapsed/expanded states and desktop/mobile invited Welcome screenshots for the implementation receipt; do not commit temporary screenshots unless the wireframe documentation references them.
- [ ] Generate Prisma client and run typecheck:

  ```bash
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/prisma" generate
  NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/tsc" --noEmit
  ```

- [ ] Run ESLint on every changed TypeScript/TSX file; run `git diff --check`.
- [ ] Run migration safety across all migrations:

  ```bash
  node scripts/check-migration-safety.mjs
  ```

- [ ] Run the full repository Jest suite and record exact suites/tests/snapshots from output.
- [ ] Run the production-equivalent build with the feature enabled, then with kill overriding enable:

  ```bash
  WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED=1 \
  NODE_PATH="$SCALING_DEPS" CI=true "$SCALING_DEPS/.bin/next" build --turbopack

  WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED=1 \
  WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL=1 \
  NODE_PATH="$SCALING_DEPS" CI=true "$SCALING_DEPS/.bin/next" build --turbopack
  ```

- [ ] Use superpowers:requesting-code-review. Resolve findings with superpowers:receiving-code-review and rerun affected gates.
- [ ] Commit: `test(assessments): verify admin-owned presentation rollout`.
- [ ] Open a protected draft PR. Do not enable the feature until the migration is deployed and `NODE_PATH="$SCALING_DEPS" "$SCALING_DEPS/.bin/tsx" scripts/verify-invited-welcome-backfill.ts` reports zero null/invalid invited rows and zero PUBLIC snapshots.
- [ ] Preview acceptance: ADMIN/STAFF edit and save one non-production template; create two safe invited test campaigns around a template edit and prove campaign A stays unchanged while B gets the new snapshot; confirm coach wizard/detail have no report controls; confirm forged coach create/PATCH errors; confirm PUBLIC quiz output unchanged.
- [ ] Merge dark. Verify migration/backfill and health. Then enable `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED=1` through the approved Vercel REST env path and redeploy.
- [ ] Production acceptance must be bounded: verify an existing invited campaign is unchanged and a newly created authorized test campaign receives the current default; do not alter a customer campaign. Kill rollback must restore old UI/rendering and coach controls while leaving new snapshots stored.

---

## Acceptance Matrix

| Surface | Flag off / killed | Flag on |
|---|---|---|
| Admin Build | Existing ED9 Build, no Welcome card | Welcome card after header, before Section 1 |
| Save | Existing Save Draft payload | Existing Save Draft includes validated authoring input when dirty |
| New INVITED campaign | Snapshot still persisted internally | Snapshot persisted and used |
| Existing INVITED campaign | Legacy code resolver renders | Frozen campaign snapshot renders |
| PUBLIC campaign/quiz | Unchanged, snapshot null | Unchanged, snapshot null |
| Coach wizard | Existing report picker and draft behavior | No picker/state/payload; server inherits admin default |
| Coach detail | Existing appearance card | No appearance card or action |
| Coach forged create | Existing report-style policy | 400 `REPORT_STYLE_ADMIN_OWNED` |
| Coach forged PATCH | Existing exact-owner policy | 403 `REPORT_STYLE_ADMIN_OWNED` |
| ADMIN/STAFF report PATCH | Existing behavior | Compatibility lane retained; no new UI |

## Self-Review

- **Spec coverage:** Admin ownership/UI (§4) → Tasks 3/4/6; structured contract (§5) → Tasks 1/2; save/snapshot/render lifecycle (§6) → Tasks 3/5–8; exact migration (§7) → Task 2; coach simplification (§8) → Tasks 7/9/10; authorization/degraded behavior (§9–10) → Tasks 3/5/7/10; rollout (§11) → Tasks 1/11/12; complete testing (§12) → every task + Task 12; documentation (§14) → Tasks 4/11. Complete.
- **No retroactivity:** migration freezes every existing INVITED campaign before the trigger; later template writes affect only new creation paths. Generic PATCH never accepts the snapshot. Complete.
- **Dark-launch gap:** migration backfills first; all INVITED create paths persist snapshots regardless of feature flag. Complete.
- **PUBLIC isolation:** public creation and rendering are untouched and explicitly regression-tested. Complete.
- **Save semantics:** no card save; dedicated `welcome` dirty surface participates in existing Save Draft and survives a failed template-row write. Complete.
- **Report ownership:** active coach create/PATCH rejected; UI and draft payload removed; admin template default and renderers preserved; privileged compatibility PATCH retained. Complete.
- **Placeholders:** none. Every task names exact files, tests, commands, expected behavior, and commit boundary.
- **Type consistency:** `InvitedWelcomeConfigV1`, `InvitedWelcomeAuthoringInputV1`, `invitedWelcomeDefault`, `invitedWelcomeSnapshot`, `adminOwnedPresentationEnabled`, and `isAdminOwnedAssessmentPresentationEnabled()` are used consistently throughout.
- **Safety ordering:** flag-off pins precede refactors; contract precedes persistence; persistence precedes APIs/UI; all create paths precede feature enablement; docs/verifier precede launch. Complete.
