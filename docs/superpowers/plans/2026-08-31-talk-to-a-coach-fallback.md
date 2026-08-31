# Talk-to-a-Coach Fallback Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send every existing on-screen no-coach **Talk to a Coach** fallback covered by Jeff's instruction to his exact coach-matching form while preserving server-verified coach mailto routing and frozen Marketing CTA snapshots.

**Architecture:** Add one assessment-domain URL constant and consume it only in existing no-contact branches. Marketing CTA compilation emits the new URL, while safe loading also recognizes compiler-exact HTML produced with the one legacy URL so published versions remain renderable without a data rewrite.

**Tech Stack:** Next.js 15, React 19, TypeScript, Jest, React Testing Library, Zod, sanitize-html

**Spec:** `docs/superpowers/specs/2026-08-31-talk-to-a-coach-fallback-design.md`

## Global Constraints

- Jeff's exact fallback is `https://coaches.scalingup.com/find-a-coach-contact-form`.
- Preserve the verified Referring coach `mailto:` path and continue trusting only the submit route's verified response.
- Rockefeller is in scope; the unrecoverably clipped additional surface remains an open question.
- Do not change result-email behavior or the separate complimentary-follow-up action.
- Do not rewrite or republish a Template Version, repin a campaign, submit an assessment, or change Production data.
- Do not change any environment variable or feature flag.
- Start from fixed review point `c0c5b68e80128616c2fd7cce28912ef3a55eed1c`; the design commit is `78ac3896`.

---

### Task 1: Lock the corrected fallback at every consumer-visible on-screen seam

**Files:**
- Modify: `src/src/__tests__/components/assessments/PublicMarketingResult.test.tsx`
- Modify: `src/src/__tests__/components/public-quiz-results.test.tsx`
- Modify: `src/src/__tests__/lib/assessments/marketing-cta-compiler.test.ts`
- Modify: `src/src/__tests__/components/assessments/branded-report.test.tsx`
- Modify: `src/src/__tests__/lib/assessments/scored-report-view-model.test.ts`

**Interfaces:**
- Consumes: existing `PublicMarketingResult`, `PublicQuizClient`, `compileMarketingCtaHtml`, `loadSafeMarketingCta`, `BrandedReport`, and `buildScoredReportViewModel` behavior.
- Produces: failing consumer-level expectations for Jeff's exact fallback plus unchanged verified-coach expectations.

- [ ] **Step 1: Change the public Marketing CTA expectation and retain the positive referral control**

In `PublicMarketingResult.test.tsx`, rename the existing test to `resolves the Quick coach action to the verified coach or Jeff's Talk-to-a-Coach form`. Keep the first assertion literal and unchanged:

```ts
expect(screen.getByRole("link", { name: /talk to a coach/i })).toHaveAttribute(
  "href",
  "mailto:coach@example.com",
);
```

Change only the no-coach literal to:

```ts
expect(screen.getByRole("link", { name: /talk to a coach/i })).toHaveAttribute(
  "href",
  "https://coaches.scalingup.com/find-a-coach-contact-form",
);
```

- [ ] **Step 2: Change the real public result-flow no-verification expectation**

In `public-quiz-results.test.tsx`, keep the forged-query setup and server response with `referringCoachEmail: null`. Change its expected link to:

```ts
expect(screen.getByRole("link", { name: /talk to a coach/i })).toHaveAttribute(
  "href",
  "https://coaches.scalingup.com/find-a-coach-contact-form",
);
```

Do not alter the separate test that expects `mailto:verified%40example.com` from the server-verified response.

- [ ] **Step 3: Add current-compiler and legacy-snapshot expectations**

In `marketing-cta-compiler.test.ts`, add a module-level literal for the old Quick preset HTML. It must be the exact compiler output, including both buttons and the dynamic-target marker:

```ts
const LEGACY_QUICK_CTA_HTML =
  '<section class="marketing-cta" data-schema-version="1">' +
  '<a class="marketing-cta__button marketing-cta__button--primary" href="https://scalingup.com" target="_blank" rel="noopener noreferrer">Explore Scaling Up resources</a>' +
  '<a class="marketing-cta__button marketing-cta__button--secondary" href="https://scalingup.com/coaches" data-dynamic-target="referring-coach-or-directory" target="_blank" rel="noopener noreferrer">Talk to a coach</a>' +
  "</section>";
```

Add a test proving new compilation uses Jeff's URL and does not contain the legacy destination:

```ts
it("compiles the dynamic no-coach target to Jeff's Talk-to-a-Coach form", () => {
  const html = compileMarketingCtaHtml(
    createMarketingCtaPreset("SCALING_UP_QUICK"),
  );

  expect(html).toContain(
    'href="https://coaches.scalingup.com/find-a-coach-contact-form"',
  );
  expect(html).not.toContain('href="https://scalingup.com/coaches"');
});
```

Add a test proving a compiler-exact legacy snapshot remains loadable:

```ts
it("loads a published Quick snapshot compiled with the legacy fallback", () => {
  const preset = createMarketingCtaPreset("SCALING_UP_QUICK");

  expect(
    loadSafeMarketingCta({
      publicMarketing: {
        marketingCta: {
          ...preset,
          sanitizedHtml: LEGACY_QUICK_CTA_HTML,
        },
      },
    }),
  ).toEqual({ ...preset, sanitizedHtml: LEGACY_QUICK_CTA_HTML });
});
```

Retain the existing tampered-HTML rejection test.

- [ ] **Step 4: Change the Rockefeller Classic fallback expectation**

In `branded-report.test.tsx`, rename the existing Rockefeller fallback test to `falls back to Jeff's Talk-to-a-Coach form when no verified email exists` and expect:

```ts
expect(screen.getByRole("link", { name: /talk to a coach/i })).toHaveAttribute(
  "href",
  "https://coaches.scalingup.com/find-a-coach-contact-form",
);
```

Keep `shows the taker's email and both next-step links` unchanged as the verified-coach positive control.

- [ ] **Step 5: Change the scored view-model null-contact expectation**

In `scored-report-view-model.test.ts`, change the expected `cta.href` for a report with no referring coach to Jeff's exact URL. Keep or add a literal assertion that a report with `referringCoachEmail: "coach@example.com"` still yields `mailto:coach%40example.com`.

- [ ] **Step 6: Run the focused RED suite and verify the expected failures**

Run:

```bash
npx jest \
  src/__tests__/components/assessments/PublicMarketingResult.test.tsx \
  src/__tests__/components/public-quiz-results.test.tsx \
  src/__tests__/lib/assessments/marketing-cta-compiler.test.ts \
  src/__tests__/components/assessments/branded-report.test.tsx \
  src/__tests__/lib/assessments/scored-report-view-model.test.ts \
  --runInBand
```

Expected: FAIL only where current code returns or compiles `https://scalingup.com/coaches`, and where the loader rejects the compiler-exact legacy snapshot after the expected value changes. The verified-coach assertions must remain green.

---

### Task 2: Implement the canonical fallback and frozen-snapshot compatibility

**Files:**
- Create: `src/src/lib/assessments/talk-to-a-coach.ts`
- Modify: `src/src/components/assessments/PublicMarketingResult.tsx`
- Modify: `src/src/components/assessments/ReportNextSteps.tsx`
- Modify: `src/src/lib/assessments/scored-report-view-model.ts`
- Modify: `src/src/lib/assessments/marketing-cta-compiler.ts`

**Interfaces:**
- Consumes: the existing `referringCoachOrDirectory` structured target, verified email values, and `MarketingCtaConfigV1` compiler contract.
- Produces: `TALK_TO_A_COACH_URL: "https://coaches.scalingup.com/find-a-coach-contact-form"`; current compilation with that fallback; safe loading of exact current or exact legacy compiler output.

- [ ] **Step 1: Add the canonical domain constant**

Create `talk-to-a-coach.ts`:

```ts
export const TALK_TO_A_COACH_URL =
  "https://coaches.scalingup.com/find-a-coach-contact-form";
```

- [ ] **Step 2: Use the constant in runtime on-screen fallbacks**

Import `TALK_TO_A_COACH_URL` in `PublicMarketingResult.tsx`, `ReportNextSteps.tsx`, and `scored-report-view-model.ts`.

Replace only these three legacy fallback literals:

```ts
return referringCoachEmail
  ? `mailto:${referringCoachEmail}`
  : TALK_TO_A_COACH_URL;
```

```ts
const coachHref =
  email === ""
    ? TALK_TO_A_COACH_URL
    : `mailto:${encodeURIComponent(email)}`;
```

```ts
href: contactEmail === null
  ? TALK_TO_A_COACH_URL
  : `mailto:${encodeURIComponent(contactEmail)}`,
```

Do not change email normalization or encoding.

- [ ] **Step 3: Parameterize the internal Marketing CTA compiler fallback**

In `marketing-cta-compiler.ts`, import `TALK_TO_A_COACH_URL` and add:

```ts
const LEGACY_TALK_TO_A_COACH_URL = "https://scalingup.com/coaches";
```

Change the private target compiler to accept the fallback:

```ts
function compileTarget(
  target: LinkTarget,
  talkToCoachUrl: string,
): { href: string; dynamicAttribute?: string } {
  if (target.kind === "referringCoachOrDirectory") {
    return {
      href: talkToCoachUrl,
      dynamicAttribute:
        ' data-dynamic-target="referring-coach-or-directory"',
    };
  }
  // retain the existing url, mailto, and tel branches exactly
}
```

Extract the current body of `compileMarketingCtaHtml` into a private function:

```ts
function compileMarketingCtaHtmlWithCoachFallback(
  cta: MarketingCtaConfigV1,
  talkToCoachUrl: string,
): string {
  // existing parse, structural validation, block compilation, sanitization,
  // and exact sanitizer-equality check
}
```

Both image-link and button calls to `compileTarget` must pass `talkToCoachUrl`.

Keep the exported API stable:

```ts
export function compileMarketingCtaHtml(
  cta: MarketingCtaConfigV1,
): string {
  return compileMarketingCtaHtmlWithCoachFallback(
    cta,
    TALK_TO_A_COACH_URL,
  );
}
```

- [ ] **Step 4: Accept only exact current or exact legacy compiler output**

Update `loadSafeMarketingCta` after schema parsing:

```ts
try {
  const currentCompiled = compileMarketingCtaHtml(parsed.data);
  if (parsed.data.sanitizedHtml === currentCompiled) return parsed.data;

  const legacyCompiled = compileMarketingCtaHtmlWithCoachFallback(
    parsed.data,
    LEGACY_TALK_TO_A_COACH_URL,
  );
  return parsed.data.sanitizedHtml === legacyCompiled ? parsed.data : null;
} catch {
  return null;
}
```

Do not add generic URL replacement, partial matching, or a sanitizer bypass.

- [ ] **Step 5: Run the focused GREEN suite**

Run the same five-suite Jest command from Task 1.

Expected: 5 suites pass; both no-coach paths use Jeff's form, both verified-coach paths retain their original mailto destinations, exact legacy compiled HTML loads, and tampered HTML remains rejected.

- [ ] **Step 6: Run TypeScript checking through the production build type boundary if the focused suite exposes no compiler errors**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Commit the behavior change**

```bash
git add \
  src/src/lib/assessments/talk-to-a-coach.ts \
  src/src/components/assessments/PublicMarketingResult.tsx \
  src/src/components/assessments/ReportNextSteps.tsx \
  src/src/lib/assessments/scored-report-view-model.ts \
  src/src/lib/assessments/marketing-cta-compiler.ts \
  src/src/__tests__/components/assessments/PublicMarketingResult.test.tsx \
  src/src/__tests__/components/public-quiz-results.test.tsx \
  src/src/__tests__/lib/assessments/marketing-cta-compiler.test.ts \
  src/src/__tests__/components/assessments/branded-report.test.tsx \
  src/src/__tests__/lib/assessments/scored-report-view-model.test.ts
git commit -m "fix: correct no-coach report destination"
```

---

### Task 3: Record the change, verify the complete branch, and prepare the PR

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**
- Consumes: the implemented and verified behavior plus the repository's source-of-truth freshness contract.
- Produces: a same-PR implementation receipt that does not claim merge, deployment, or Production verification before those occur.

- [ ] **Step 1: Add the source-of-truth receipt**

Prepend a `plans/CHANGELOG.md` entry with anchor:

```html
<!-- ENTRY_ISO:2026-08-31 ENTRY_SLUG:talk-to-a-coach-fallback-corrected -->
```

Record:

- the no-referral and verified-referral reproduction;
- the stale redirect to the 2020 summit registration;
- Jeff's embedded exact `find-a-coach-contact-form` link;
- Scaling Up Quick and Rockefeller coverage;
- exact-legacy frozen Marketing CTA compatibility without a data rewrite;
- the clipped clause as an open question;
- test/build/lint evidence only after each command actually passes;
- no environment, flag, schema, migration, template, campaign, submission, report, email, or Production-data change.

Update only the `CLAUDE.md` `LAST_UPDATED_ISO` / `LAST_UPDATED_SLUG` anchor and brief Project Context prose to point at this entry. Before PR creation, describe the status as implemented locally, not merged or deployed.

- [ ] **Step 2: Re-check the shared claim and main freshness before final code verification**

Run:

```bash
git fetch origin
gh issue view 261 --repo ChiefAI-Officer/Scaling-up-platform-v2 --comments
git log --oneline --decorate HEAD..origin/main
```

Expected: item 5 remains claimed by this branch. If `origin/main` moved, inspect overlapping changes before rebasing or merging; do not overwrite concurrent SoT edits.

- [ ] **Step 3: Run focused and full tests**

Run the five-suite focused command from Task 1, then:

```bash
npm test -- --runInBand
```

Expected: all suites and tests pass. If the full suite exhausts disk or times out in a capture-only test, clear only generated Jest/capture caches, rerun the affected failures independently, then rerun the full suite with enough free space; do not report a pass from a partial rerun.

- [ ] **Step 4: Run changed-file ESLint**

Run:

```bash
npx eslint \
  src/components/assessments/PublicMarketingResult.tsx \
  src/components/assessments/ReportNextSteps.tsx \
  src/lib/assessments/scored-report-view-model.ts \
  src/lib/assessments/marketing-cta-compiler.ts \
  src/lib/assessments/talk-to-a-coach.ts \
  src/__tests__/components/assessments/PublicMarketingResult.test.tsx \
  src/__tests__/components/public-quiz-results.test.tsx \
  src/__tests__/lib/assessments/marketing-cta-compiler.test.ts \
  src/__tests__/components/assessments/branded-report.test.tsx \
  src/__tests__/lib/assessments/scored-report-view-model.test.ts
```

Expected: exit 0 with no warnings or errors.

- [ ] **Step 5: Run migration safety and the exact Production-equivalent build**

Run:

```bash
node scripts/check-migration-safety.mjs
CI=true npm run build
```

Expected: migration safety exits 0 and reports the existing migration count; the exact build exits 0 and generates every expected page.

- [ ] **Step 6: Verify the diff and commit the source-of-truth receipt**

Run:

```bash
git diff --check
git status --short
git diff --stat c0c5b68e80128616c2fd7cce28912ef3a55eed1c..HEAD
```

Then commit only the two SoT files:

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs: record talk-to-a-coach fallback fix"
```

- [ ] **Step 7: Run independent review against the fixed point**

Review `c0c5b68e80128616c2fd7cce28912ef3a55eed1c..HEAD` along both axes:

1. standards/correctness/security, especially fail-closed legacy snapshot validation; and
2. spec compliance, especially Jeff's exact URL, Rockefeller coverage, verified-coach preservation, and prohibited writes.

Fix every Critical or Important finding with a new red-green check where behavior changes, rerun affected verification, commit, and repeat review until no actionable findings remain.

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin codex/387-item-5-talk-to-coach
gh pr create \
  --repo ChiefAI-Officer/Scaling-up-platform-v2 \
  --base main \
  --head codex/387-item-5-talk-to-coach \
  --title "Fix no-coach Talk-to-a-Coach destination" \
  --body-file /tmp/talk-to-a-coach-pr-body.md
```

The PR body must include reproduction, root cause, Jeff's exact linked destination, TDD evidence, frozen-snapshot compatibility, Rockefeller coverage, no-write constraints, and the clipped-clause open question.

- [ ] **Step 9: Complete the PR review loop without merging**

Wait for hosted checks. Inspect review comments and unresolved threads. Address actionable findings, rerun the affected gates plus changed-file ESLint, push follow-up commits, and repeat until checks are green and no actionable threads remain. Do not merge unless the user separately authorizes it.

---

## Plan self-review

- **Spec coverage:** Tasks cover both reproduced paths, Jeff's exact destination, Rockefeller, current compilation, exact legacy snapshot compatibility, tamper rejection, prohibited writes, the open question, verification, PR creation, and review loop.
- **Placeholder scan:** Every implementation step includes concrete code, commands, and expected results.
- **Type consistency:** The plan defines one exported string constant, keeps existing public function signatures stable, and confines the fallback parameter to private compiler functions.
