# All Public Welcome Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every schema-valid Template Welcome configuration authoritative for every existing and future Public Campaign, including values equal to seeded or backfilled defaults.

**Architecture:** Keep the existing Campaign-to-Template relation and `PublicQuizClient` renderer. Simplify the server-side resolver to one trust boundary: normalize persisted JSON with `invitedWelcomeConfigSchema`, return the normalized value when valid, and return `null` only when absent or malformed. Remove alias/baseline comparison; retain all INVITED snapshot behavior unchanged.

**Tech Stack:** TypeScript, Zod, Next.js App Router, React Testing Library, Jest.

**Spec:** `docs/superpowers/specs/2026-09-01-all-public-presentation-design.md`

**Command working directory:** Run Jest, ESLint, migration-safety, and build commands from the app root, `src/`. File paths below are repository-root-relative.

## Global Constraints

- Public Welcome content comes only from the Campaign's related `AssessmentTemplate.invitedWelcomeDefault`.
- `template.alias`, `campaign.alias`, and URL aliases never select Welcome copy.
- Parse schema v1 through `invitedWelcomeConfigSchema` before returning it so `sharingDescription` and schema v2 defaults are present.
- Missing or malformed JSON continues to use the anonymous Public presentation and Campaign description.
- Do not change `invitedWelcomeSnapshot`, ADR-0033 INVITED semantics, `org-survey/[campaignAlias]/me/route.ts`, contact collection, report HTML, schemas, migrations, flags, or editors.

---

### Task 1: Make valid persisted Welcome configurations authoritative

**Files:**
- Modify: `src/src/__tests__/lib/assessments/public-welcome-config.test.ts`
- Modify: `src/src/lib/assessments/public-welcome-config.ts`

**Interfaces:**
- Consumes: arbitrary persisted `AssessmentTemplate.invitedWelcomeDefault` JSON.
- Produces: `resolvePublicWelcomeConfig(stored: unknown): InvitedWelcomeConfig | null`.

- [x] **Step 1: Write the failing normalization/authority tests**

Replace the old "baseline means unedited" expectations. Assert that the exact schema-v1 migration backfill returns schema v2 with the schema default `sharingDescription`; assert that schema-v2 values from `resolveLegacyInvitedWelcomeConfig` are returned for `sunhub-quick-quiz`, `scaling-up-quick`, `scaling-up-full`, and an unknown alias; retain edited single-field cases and absent/malformed rejection.

- [x] **Step 2: Run the resolver test and verify RED**

Run: `npx jest src/__tests__/lib/assessments/public-welcome-config.test.ts --runInBand`

Expected: the schema-v1 and baseline authority cases fail because the current resolver returns `null` after canonical baseline comparison.

- [x] **Step 3: Simplify the resolver**

Parse with `invitedWelcomeConfigSchema.safeParse(stored)`. Return `parsed.data` on success and `null` on failure. Remove `resolveLegacyInvitedWelcomeConfig`, `canonicalJson`, and the `templateAlias` argument from production code.

- [x] **Step 4: Run the resolver test and verify GREEN**

Run the command from Step 2 and expect all cases to pass.

### Task 2: Prove the public server page uses Template data for every alias class

**Files:**
- Modify: `src/src/__tests__/app/public-quiz-page-referred-results.test.tsx`
- Modify: `src/src/app/(public)/quiz/[campaignAlias]/page.tsx`

**Interfaces:**
- Consumes: the Campaign query's related Template and its stored Welcome JSON.
- Produces: normalized `welcomeConfig` in `PublicQuizClient` props when valid.

- [x] **Step 1: Write failing page-boundary tests**

Change the schema-v1 backfill test to require a normalized schema-v2 `welcomeConfig` while retaining `campaignDescription`. Add table-driven cases for a generic template alias, `sunhub-quick-quiz`, and `scaling-up-quick`; each must receive the related Template's valid stored value irrespective of alias. Keep malformed input prop omission.

- [x] **Step 2: Run the page suite at the server/client boundary**

Run: `npx jest src/__tests__/app/public-quiz-page-referred-results.test.tsx --runInBand`

Execution note: this integration assertion was added after Task 1 reached GREEN,
so it passed immediately. The resolver RED in Task 1 is the recorded failing
evidence for the baseline-equivalent behavior; no separate page RED is claimed.

- [x] **Step 3: Remove alias selection from the call site**

Call `resolvePublicWelcomeConfig(campaign.template.invitedWelcomeDefault)` with no alias. Do not alter the Campaign query, anonymous fallback props, report HTML props, or referred-results logic.

- [x] **Step 4: Run the page suite and resolver suite and verify GREEN**

Run: `npx jest src/__tests__/lib/assessments/public-welcome-config.test.ts src/__tests__/app/public-quiz-page-referred-results.test.tsx --runInBand`

### Task 3: Lock complete client rendering and invited isolation

**Files:**
- Modify only if coverage is missing: `src/src/__tests__/assessments/public-quiz-pager.test.tsx`
- Test only: existing invited Welcome suites located with `rg -l 'invitedWelcomeSnapshot' src/src/__tests__`

- [x] **Step 1: Verify the renderer acceptance seam**

The Public client test must assert eyebrow, interpolated heading, every lede paragraph, sharing heading and description, scores heading and description, CTA label, fine print presence/absence, and derived question/section/scale facts. Add only missing assertions.

- [x] **Step 2: Run Public renderer and INVITED regression suites**

Run the focused Public pager suite plus the existing invited snapshot/API suites. Expected: valid public configs render completely and all INVITED immutable-snapshot tests remain unchanged and green.

### Task 4: Amend the decision record and source of truth

**Files:**
- Modify: `docs/adr/0033-admin-owned-invited-welcome-snapshots.md`
- Modify: `CONTEXT.md`
- Modify: `docs/superpowers/specs/2026-09-01-public-welcome-live-design.md`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

- [x] **Step 1: Amend only ADR-0033's PUBLIC clause**

State that schema-valid Template Welcome data is authoritative for Public Campaigns even when equal to a seed/backfill baseline; only absent/malformed data falls back. Preserve INVITED snapshot language byte-for-byte where practical.

- [x] **Step 2: Mark Option C superseded and update glossary/SoT**

Link the new approved design. Record the evidence, root cause, public-only correction, tests, and explicit exclusions. Do not claim deployment or Production cutover before they occur.

### Task 5: Verify, review, and ship the code release

**Files:** all files changed in Tasks 1–4.

- [x] **Step 1: Run focused suites**

Run the resolver, public-page, Public pager, and INVITED regression suites with `--runInBand`.

- [x] **Step 2: Run repository gates**

From `src/`, run changed-file `npx eslint`, `node scripts/check-migration-safety.mjs`, `git diff --check`, and exact `CI=true npm run build`.

- [x] **Step 3: Review the fixed-point diff**

Review `origin/main...HEAD` on specification and standards axes. Confirm no contact, invited, org-survey, report, schema, migration, or flag changes.

- [ ] **Step 4: Commit, push, and open a protected-branch PR**

Wait for required Build and Migration Safety checks, merge only when green, then verify the exact Production deployment and canonical health aliases before beginning the separate SunHub data cutover plan.
