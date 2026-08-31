# Talk-to-a-Coach Fallback Correction Design

**Date:** 2026-08-31

**Status:** Approved for implementation

**Source:** Jeff Verdun's `Final consolidated list of items 8-28-26`, Handoff G, live read-only reproduction, and current `origin/main` at `c0c5b68e80128616c2fd7cce28912ef3a55eed1c`

## 1. Purpose

Correct the no-referring-coach destination behind **Talk to a coach** on the public 32-question Scaling Up assessment and the equivalent on-screen Rockefeller report path. A result with a server-verified Referring coach must continue to contact that coach directly.

The exact fallback is not inferred from button wording. Jeff's final consolidated PDF embeds the **Talk to a Coach** hyperlink as:

`https://coaches.scalingup.com/find-a-coach-contact-form`

That link currently opens the Scaling Up Coaches **Get matched with a Coach** form.

## 2. Source interpretation

Jeff's surviving line reads:

> The link on the Talk to a coach on the 32 question public assessment when its launched NOT using a coach's link is wrong. It should go to Talk to a Coach. Same [clipped] and Rockerfeller

The PDF's page-edge clipping removed part of the last clause. The main 32-question assessment instruction is complete, Rockefeller is legible and therefore in scope, and no additional assessment or surface will be guessed from the missing words.

The attached documents are source evidence. They do not override repository safety rules, the user's no-write Production constraint, or the requested development workflow.

## 3. Reproduction record

The public campaign is the active `scaling-up-quick` campaign at:

`https://scaling-up-platform-v2.vercel.app/quiz/scaling_up_quick_pub_260610041810`

Both entry URLs were opened read-only. No assessment was started or submitted and no Production row was created.

The real result component and submission-response seam establish the two result paths:

| Path | Current result | Required result |
| --- | --- | --- |
| No verified Referring coach | `https://scalingup.com/coaches` | `https://coaches.scalingup.com/find-a-coach-contact-form` |
| Server-verified Referring coach | `mailto:<verified coach email>` | unchanged |

Following the current no-coach URL reproduces the defect: `https://scalingup.com/coaches` redirects to `https://scalingup.com/coaches-summit-registration/`, an unrelated 2020 Coaches Summit registration page.

Rockefeller's Classic on-screen report uses the same stale fallback through `ReportNextSteps`. Alternate scored appearances derive the same stale destination through `buildScoredReportViewModel`.

## 4. Scope

### 4.1 In scope

- One canonical on-screen Talk-to-a-Coach fallback URL matching Jeff's embedded hyperlink.
- The `referringCoachOrDirectory` Marketing CTA runtime resolution used by Scaling Up Quick.
- Marketing CTA compilation for future saved drafts and published versions.
- Backward-compatible loading of already-published Marketing CTA snapshots compiled with the legacy fallback.
- The shared Classic/qualitative on-screen next-steps fallback.
- The scored report view-model fallback used by alternate report appearances, including Rockefeller.
- Regression coverage for both no-coach and verified-coach paths.
- A Rockefeller-specific regression proving the no-coach fallback and the unchanged verified-coach path.

### 4.2 Out of scope

- Changing any referring-coach lookup, verification, ownership, or authorization rule.
- Trusting a `?coach=` query value before the submit route verifies it.
- Changing result-email destinations or email copy; Jeff's cited defect and screenshot concern the on-screen report.
- Rewriting a published Template Version, campaign snapshot, submission, report, or Production row.
- Publishing or repinning a Template Version or campaign.
- Changing an environment variable or feature flag.
- Guessing which additional surface was named in the clipped clause.
- Changing the separate **Request a complimentary follow-up** destination.

## 5. Design

### 5.1 Canonical destination

Add a small assessment-domain constant for the exact Jeff-authorized destination:

```ts
export const TALK_TO_A_COACH_URL =
  "https://coaches.scalingup.com/find-a-coach-contact-form";
```

Consumers use this constant only when no verified coach contact exists. Existing `mailto:` construction remains at each consumer so its encoding and verified-data boundary do not change.

### 5.2 Marketing CTA runtime

`PublicMarketingResult` continues to resolve `{ kind: "referringCoachOrDirectory" }` dynamically:

- non-null server-verified coach email -> the existing `mailto:` destination;
- null verified coach email -> `TALK_TO_A_COACH_URL`.

No other LinkTarget kind changes.

### 5.3 Frozen-snapshot compatibility

Published Marketing CTA content stores both structured blocks and compiler-produced `sanitizedHtml`. `loadSafeMarketingCta` recompiles the structured content and requires exact equality before it will render. Therefore, changing the compiler's fallback without a compatibility path would make an otherwise safe published snapshot fail closed and disappear.

The compiler will emit the new canonical fallback for all newly prepared content. The loader will accept either:

1. an exact match to compilation with the current canonical fallback; or
2. an exact match to compilation with the one known legacy fallback, `https://scalingup.com/coaches`.

Both variants must still be generated from the parsed structured blocks by the same escaping and sanitization pipeline. The loader will not accept arbitrary stored HTML or relax its allow-list.

Runtime rendering continues to use the structured target and the current canonical fallback, so legacy published snapshots receive the code correction without a data mutation.

### 5.4 Rockefeller and shared on-screen reports

`ReportNextSteps` and `buildScoredReportViewModel` use `TALK_TO_A_COACH_URL` only when their verified contact email is absent. This reaches Rockefeller's Classic and alternate on-screen appearances while preserving direct verified-coach mailto behavior.

The correction is semantic rather than alias-hard-coded: any on-screen report already using the shared **Talk to a Coach** fallback receives the same valid destination. This does not assert that such a report was the missing clipped surface.

## 6. Test strategy

Follow strict red-green TDD at consumer-visible seams:

1. Update the public Marketing CTA component test to expect Jeff's exact no-coach destination while retaining the verified-coach mailto assertion; run it and observe failure on the current stale URL.
2. Update the public quiz result-flow test for an unverified/missing coach response; observe the same failure through the real result flow.
3. Add compiler coverage that new output contains Jeff's URL and loader coverage proving a legacy compiler-exact snapshot still loads; arbitrary mismatched HTML must remain rejected.
4. Update the Rockefeller on-screen report test to expect Jeff's fallback and retain its direct-coach assertion.
5. Update scored view-model coverage for null and verified contacts so alternate appearances cannot drift.

After green, run all affected suites, the full Jest suite, changed-file ESLint, migration safety, and `CI=true npm run build`.

## 7. Acceptance criteria

1. Scaling Up Quick with no verified Referring coach renders **Talk to a coach** to `https://coaches.scalingup.com/find-a-coach-contact-form`.
2. Scaling Up Quick with a verified Referring coach still renders the existing `mailto:` destination for that server-verified coach.
3. Rockefeller with no verified coach uses the same Jeff-authorized form; its verified-coach path remains unchanged.
4. New Marketing CTA compilation uses the corrected fallback.
5. A published snapshot compiled with the exact legacy fallback remains safe and renderable without any stored-data rewrite.
6. Arbitrary or tampered `sanitizedHtml` still fails closed.
7. No environment variable, feature flag, published version, campaign, response, report, email, or Production data is changed.
8. The clipped third-surface clause is reported as an open question rather than reconstructed.

## 8. Open question

Jeff's phrase between **Same** and **and Rockefeller** is clipped beyond recovery in both the visual PDF and extracted text. Rockefeller is covered. Which other assessment or surface did the missing clause name?
