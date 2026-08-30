# Public Mini-Quiz Assessment Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both shipped ESPERTO assessment destinations with the verified Scaling Up public 32-question campaign while preserving immutable published snapshots.

**Architecture:** A small configuration module owns the canonical public origin and verified `scaling-up-quick` campaign alias, deriving one absolute HTTPS destination. The existing report configuration and Full Marketing preset import that value. Tests exercise both consumer-visible outputs and reject the vendor hostname.

**Tech Stack:** TypeScript, Next.js, Jest, Prisma/PostgreSQL (read-only audit only).

**Spec:** `docs/superpowers/specs/2026-08-30-public-quiz-link-design.md`

## Global Constraints

- Branch from fresh `origin/main` in an isolated worktree.
- Do not change any environment variable, feature flag, or Production data.
- Published Template Versions remain immutable; no version or campaign is created, repinned, or updated.
- The target campaign is the read-only verified ACTIVE PUBLIC `scaling-up-quick` campaign alias `scaling_up_quick_pub_260610041810`.
- Keep the follow-up and books destinations unchanged.
- Run `CI=true npm run build`, focused Jest suites, and ESLint on every changed TypeScript file before push.

---

### Task 1: Canonical public assessment destination and regression guard

**Files:**
- Create: `src/src/lib/assessments/public-assessment-destinations.ts`
- Modify: `src/src/lib/assessments/report-config.ts`
- Modify: `src/src/lib/assessments/marketing-cta.ts`
- Modify: `src/src/__tests__/lib/assessments/report-config.test.ts`
- Modify: `src/src/__tests__/lib/assessments/marketing-cta.test.ts`
- Modify: `src/src/__tests__/assessments/report-email.test.ts`
- Modify: `src/src/__tests__/components/assessments/branded-report.test.tsx`
- Modify: `src/src/__tests__/components/public-quiz-results.test.tsx`

**Interfaces:**
- Produces: `SCALING_UP_QUICK_PUBLIC_CAMPAIGN` with `templateAlias`, `campaignAlias`, and derived `href`.
- Consumes: the exported `href` in `reportConfigFor("sunhub-quick-quiz")` and `createMarketingCtaPreset("FULL_MARKETING")`.

- [ ] **Step 1: Write the failing consumer tests**

Update the SunHub report-config expectation and Full Marketing preset expectation to the literal verified URL:

```ts
"https://scaling-up-platform-v2.vercel.app/quiz/scaling_up_quick_pub_260610041810"
```

Update the existing report-email, BrandedReport, and public-quiz-result consumer assertions to the same hand-verified literal. Those assertions prove the action reaches every shipped SunHub result surface rather than only the configuration objects.

Add one regression test that collects URL destinations from `reportConfigFor("sunhub-quick-quiz").publicResultActions` and all URL targets from `createMarketingCtaPreset("FULL_MARKETING").blocks`, then asserts:

```ts
expect(destinations.map((href) => new URL(href).hostname)).not.toContain(
  "scalinguptoolkit.com",
);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd src
npx jest src/__tests__/lib/assessments/report-config.test.ts src/__tests__/lib/assessments/marketing-cta.test.ts src/__tests__/assessments/report-email.test.ts src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/components/public-quiz-results.test.tsx --runInBand
```

Expected: FAIL because both existing outputs still equal `https://scalinguptoolkit.com/s/ScaleUpQA`.

- [ ] **Step 3: Add the minimal configuration module**

Create the module with the verified campaign identity and a URL derived from one canonical origin:

```ts
const CANONICAL_PUBLIC_APP_ORIGIN =
  "https://scaling-up-platform-v2.vercel.app";

const templateAlias = "scaling-up-quick";
const campaignAlias = "scaling_up_quick_pub_260610041810";

export const SCALING_UP_QUICK_PUBLIC_CAMPAIGN = Object.freeze({
  templateAlias,
  campaignAlias,
  href: new URL(
    `/quiz/${encodeURIComponent(campaignAlias)}`,
    CANONICAL_PUBLIC_APP_ORIGIN,
  ).toString(),
});
```

- [ ] **Step 4: Replace both vendor destinations**

Import `SCALING_UP_QUICK_PUBLIC_CAMPAIGN` in `report-config.ts` and `marketing-cta.ts`. Use its `href` for the SunHub action and `FULL_DESTINATIONS.assessment` respectively. Do not change the other destinations or action copy.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the same Jest command from Step 2. Expected: both suites pass with zero failures.

- [ ] **Step 6: Commit the behavior and tests**

```bash
git add src/src/lib/assessments/public-assessment-destinations.ts src/src/lib/assessments/report-config.ts src/src/lib/assessments/marketing-cta.ts src/src/__tests__/lib/assessments/report-config.test.ts src/src/__tests__/lib/assessments/marketing-cta.test.ts src/src/__tests__/assessments/report-email.test.ts src/src/__tests__/components/assessments/branded-report.test.tsx src/src/__tests__/components/public-quiz-results.test.tsx
git commit -m "fix(assessments): link mini quiz to public assessment"
```

### Task 2: Source-of-truth receipt and verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**
- Consumes: the completed code diff and read-only audit evidence.
- Produces: a durable implementation and blast-radius record without claiming a Production deployment.

- [ ] **Step 1: Record the implementation and audit**

Prepend a CHANGELOG entry describing the verified target, the five published unpinned frozen snapshots, the active SunHub v1 campaign, the no-write decision, tests, and PR status. Update only the `CLAUDE.md` `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor and its brief prose to name this implementation PR; do not claim deployment or live release.

- [ ] **Step 2: Run all required verification gates**

From `src/` run:

```bash
npx jest src/__tests__/lib/assessments/report-config.test.ts src/__tests__/lib/assessments/marketing-cta.test.ts src/__tests__/assessments/report-email.test.ts src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/components/public-quiz-results.test.tsx --runInBand
npx eslint src/lib/assessments/public-assessment-destinations.ts src/lib/assessments/report-config.ts src/lib/assessments/marketing-cta.ts src/__tests__/lib/assessments/report-config.test.ts src/__tests__/lib/assessments/marketing-cta.test.ts src/__tests__/assessments/report-email.test.ts src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/components/public-quiz-results.test.tsx
CI=true npm run build
```

Expected: every command exits 0; Jest reports zero failing suites/tests; ESLint reports no warnings or errors; the build completes successfully.

- [ ] **Step 3: Commit the source-of-truth receipt**

```bash
git add CLAUDE.md plans/CHANGELOG.md docs/superpowers/specs/2026-08-30-public-quiz-link-design.md docs/superpowers/plans/2026-08-30-public-quiz-link.md
git commit -m "docs: record public quiz link correction"
```

- [ ] **Step 4: Review and deliver**

Run the repository's two-axis code review against the recorded base `f84ad2ed7ce070a314d8bd75ad19254dc36a1544`. Fix all actionable findings, rerun affected gates, commit fixes, and repeat until both Standards and Spec axes have no actionable findings. Re-fetch `origin/main`, re-check issue #261, push `codex/387-item-2-public-quiz-link`, and open a PR that links #387 and includes the read-only blast-radius report.
