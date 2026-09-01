# Public Assessment Contact Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe per-template public contact-field configuration and persist configured values without changing the public assessment's ordering or downstream presentation.

**Architecture:** A pure versioned configuration module is the shared source of truth for the client renderer and submit-route validator. The client renders the resolved field definitions; the server independently resolves the same config from the database-loaded template alias, validates a closed set of keys, and persists the validated object in existing JSON storage.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Prisma 5, Jest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-01-public-assessment-contact-fields-design.md`

## Global Constraints

- Resolve only from `campaign.template.alias`; never use the URL/campaign alias.
- Keep `intro -> info -> form`; do not implement end-loaded capture.
- Do not render Coach Email, add an admin editor, write `publicConfig`, change `org-survey`, or surface new fields downstream.
- Server configuration is authoritative for requiredness and accepted keys.
- Every field has an explicit `maxLength`.
- Use one RED -> GREEN vertical slice at a time; do not batch imagined tests.

---

### Task 1: Versioned contact configuration

**Files:**
- Create: `src/src/lib/assessments/public-contact-config.ts`
- Create: `src/src/__tests__/lib/assessments/public-contact-config.test.ts`

**Interfaces:**
- Produces: `PublicContactFieldKey`, `PublicContactField`, `PublicContactConfig`, `GENERIC_PUBLIC_CONTACT_CONFIG`, `LEGACY_PUBLIC_CONTACT_CONFIG_BY_ALIAS`, `resolvePublicContactConfig(alias)`, `buildPublicContactConfig(input)`, and `parsePublicContactValues(alias, input)`.

- [x] **Step 1: Write the failing resolver tests** for `scaling-up-quick`, `sunhub-quick-quiz`, an unmapped alias, and `constructor`/`__proto__`/`toString`; assert the full template has ten fields and the generic/mini configuration has exactly `firstName,lastName,email`.
- [x] **Step 2: Run** `npx jest src/__tests__/lib/assessments/public-contact-config.test.ts --runInBand` and verify module-not-found RED.
- [x] **Step 3: Implement the minimal V1 schemas, frozen defaults, own-property resolver, and cloning**. Build Country options from the English country labels shipped by the existing `react-phone-number-input` dependency and retain only two-letter ISO keys.
- [x] **Step 4: Run the focused test and verify GREEN**.
- [x] **Step 5: Add a failing seed guard** importing `ALIAS` and `SUNHUB_QUICK_QUIZ_ALIAS`, then implement/export map keys so the guard passes.
- [x] **Step 6: Add failing validator tests** for required/optional fields, limits, email normalization, and unknown keys; implement `parsePublicContactValues` as a strict dynamic Zod object and verify GREEN.

### Task 2: Field-agnostic About-you renderer

**Files:**
- Modify: `src/src/components/assessments/public-quiz-client.tsx`
- Modify: `src/src/__tests__/assessments/public-quiz-pager.test.tsx`

**Interfaces:**
- Consumes: `resolvePublicContactConfig(templateAlias)` and typed contact values from Task 1.
- Produces: the existing submit request with `publicTaker` expanded only for configured fields.

- [x] **Step 1: Add a failing mini/default rendering test** proving only three fields render and the POST shape remains the legacy three values.
- [x] **Step 2: Run the pager suite and observe RED**, then replace three scalar states/hardcoded controls with a typed value map and definition-driven renderer; verify GREEN.
- [x] **Step 3: Add a failing `scaling-up-quick` UI test** asserting ten controls, State optional, Country a select with `Select...`, Number of employees a text input, all explicit maximum lengths, and no Coach Email.
- [x] **Step 4: Implement the smallest input/select branches and verify GREEN**.
- [x] **Step 5: Add a failing consent-copy assertion**, update the disclosure to cover all supplied contact information and link the Privacy Policy, then verify GREEN.

### Task 3: Trusted dynamic server validation and persistence

**Files:**
- Modify: `src/src/app/api/quiz/[campaignAlias]/submit/route.ts`
- Modify: `src/src/__tests__/api/quick-assessment-submit.test.ts`

**Interfaces:**
- Consumes: `parsePublicContactValues(campaign.template.alias, raw.publicTaker)`.
- Produces: a validated contact-value object used for identity, report/email identity, audit identity, and `AssessmentSubmission.publicTaker` persistence.

- [x] **Step 1: Add a failing test where Campaign alias and template alias disagree**; `campaign.alias`/route alias looks full but `template.alias` is mini, and extra full fields must be rejected. Run the named test and verify RED.
- [x] **Step 2: Split envelope parsing from configured contact parsing after Campaign load**, select the real template alias, and verify GREEN.
- [x] **Step 3: Add one failing required-field test** for `scaling-up-quick` missing Phone; implement server-derived requiredness and verify 400 GREEN.
- [x] **Step 4: Add one failing optional-field test** with State absent; implement optional handling and verify successful persistence GREEN.
- [x] **Step 5: Add a failing additive persistence test** for all ten configured values; persist the full validated object and verify GREEN.
- [x] **Step 6: Add a failing idempotency test** showing the same key with a changed configured field returns 409; update stable identity to include every validated contact key and verify GREEN.

### Task 4: Existing-reader compatibility

**Files:**
- Modify: `src/src/__tests__/api/admin/public-campaigns/submissions-route.test.ts`
- Modify: `src/src/__tests__/api/admin/assessments/aggregate-submissions-csv.test.ts`
- Modify: `src/src/__tests__/api/quick-assessment-submit.test.ts`

**Interfaces:**
- Consumes: additive `publicTaker` JSON.
- Produces: unchanged legacy list/CSV/report-email identity output.

- [x] **Step 1: Add Phone/Company/Country to admin-list fixtures** and assert the exact existing response object remains unchanged; run and verify GREEN without production edits.
- [x] **Step 2: Add additive keys to a public aggregate-CSV fixture** and assert only the existing name/email columns appear; run and verify GREEN without production edits.
- [x] **Step 3: Assert report/email model inputs still receive the original firstName/lastName/email identity while persistence keeps additive keys**; run the submit suite and verify GREEN.

### Task 5: Source-of-truth and gates

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

- [x] **Step 1: Prepend a factual changelog entry** describing implemented behavior, explicit exclusions, and verification evidence; update `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` in `CLAUDE.md` to match.
- [x] **Step 2: Run focused suites:** `npx jest src/__tests__/lib/assessments/public-contact-config.test.ts src/__tests__/assessments/public-quiz-pager.test.tsx src/__tests__/api/quick-assessment-submit.test.ts src/__tests__/api/admin/public-campaigns/submissions-route.test.ts src/__tests__/api/admin/assessments/aggregate-submissions-csv.test.ts --runInBand`.
- [x] **Step 3: Run changed-file ESLint** with `npx eslint` and the exact changed TypeScript/TSX test paths.
- [x] **Step 4: Run** `CI=true npm run build` **and record the exact exit/output**.
- [x] **Step 5: Run** `git diff --check`, inspect `git diff --stat` and `git status --short`, then re-read the spec acceptance and report every out-of-scope decision explicitly.
