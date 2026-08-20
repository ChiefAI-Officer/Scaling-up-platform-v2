# Scaling Up Full Phase-Aware Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make future Scaling Up Full CEO submissions freeze the current Esperto feedback paragraph selected by organizational phase, score band, and question, while correcting all four live phase boundaries and preserving every historic report.

**Architecture:** Keep phase-aware content inside the immutable `AssessmentTemplateVersion.questions` JSON; no relational schema migration is needed. Add an optional five-phase recommendation structure beside the legacy score-only `recommendations`, resolve it only when a frozen phase is supplied at scoring time, and continue storing the chosen paragraph in `ScoreResult.perQuestion[].recommendation`. Create and verify a new draft first; publishing it is a separate approval-gated activation release for future campaigns only.

**Tech Stack:** TypeScript, Next.js, Zod, Prisma JSON template versions, Jest, existing content-hash/audit-log/version-publish infrastructure.

**Spec:** `docs/research/jeff-feedback-response-change-closeout-2026-08-20.md`

## Global Constraints

- Current live phase bands are exactly `P1 1–8`, `P2 9–25`, `P3 26–50`, `P4 51–150`, and `P5 151+` under the 2026-08-20 fixed `ScaleUp2` / `enUS` source profile.
- Current live feedback bands are exactly `0–4`, `5–6`, `7–8`, and `9–10` in every phase; the 3,355-cell audit found zero within-band violations.
- Canonical content is the 1,220-row `docs/research/esperto-feedback-five-phase-band-catalogue-2026-08-20.csv`; do not hand-edit or infer wording.
- Preserve published versions, campaign version pins, submission answers, and frozen `ScoreResult.perQuestion[].recommendation` values byte-for-byte.
- Preserve legacy phase rendering as well: old template versions and frozen results without a phase snapshot continue using the legacy `1–7 / 8–24 / 25–49 / 50–149 / 150+` helper contract; only the new phase-aware edition uses the current-live bands.
- The phase-aware path is CEO-only today: `Q_FTE_CONTRACT` is CEO-only, respondent self-report access is CEO-only, and current group-report construction does not consume per-question recommendations.
- A phase-aware question without a supplied phase must omit `recommendation`; it must never silently fall back to a possibly wrong phase.
- Keep the governed Peers snapshot and every benchmark table/code path unchanged.
- Draft creation, publish, Production deploy, and activation are separate receipts. The implementation branch must stop with the new edition unactivated unless the user explicitly approves the publish release.
- No new dependency and no Prisma migration.

---

### Task 1: Correct the shared growth-phase contract

**Files:**
- Modify: `src/src/lib/assessments/su-full-phase.ts`
- Modify: `src/src/__tests__/lib/assessments/su-full-phase.test.ts`

**Interfaces:**
- Produces: `SU_FULL_PHASE_DRIVER_KEY = "Q_FTE_CONTRACT"`
- Preserves: `computeGrowthPhase(contractFte: number): GrowthPhase | null` with the legacy bands for pinned historic versions.
- Produces: `computeCurrentGrowthPhase(contractFte: number): GrowthPhase | null` with live bands `1–8 / 9–25 / 26–50 / 51–150 / 151+`.
- Produces: `currentGrowthPhaseFromAnswers(answers: readonly { stableKey: string; value: unknown }[]): GrowthPhase | null`.

- [ ] **Step 1: Write the failing exact-boundary tests**

```ts
expect(computeCurrentGrowthPhase(8)?.number).toBe(1);
expect(computeCurrentGrowthPhase(9)?.number).toBe(2);
expect(computeCurrentGrowthPhase(25)?.number).toBe(2);
expect(computeCurrentGrowthPhase(26)?.number).toBe(3);
expect(computeCurrentGrowthPhase(50)?.number).toBe(3);
expect(computeCurrentGrowthPhase(51)?.number).toBe(4);
expect(computeCurrentGrowthPhase(150)?.number).toBe(4);
expect(computeCurrentGrowthPhase(151)?.number).toBe(5);
expect(computeGrowthPhase(8)?.number).toBe(2);
expect(computeGrowthPhase(50)?.number).toBe(4);
```

- [ ] **Step 2: Run the focused tests and confirm the old assumptions fail**

Run from `src/`:

```bash
npx jest src/__tests__/lib/assessments/su-full-phase.test.ts --runInBand
```

Expected: `computeCurrentGrowthPhase` is absent before implementation; all existing legacy assertions remain green.

- [ ] **Step 3: Update the bands, driver constant, answer resolver, and provenance comments**

```ts
export const SU_FULL_PHASE_DRIVER_KEY = "Q_FTE_CONTRACT";

export const CURRENT_GROWTH_PHASE_BANDS = [
  { number: 1, name: "Pioneering", min: 1, max: 8 },
  { number: 2, name: "Organization", min: 9, max: 25 },
  { number: 3, name: "Management", min: 26, max: 50 },
  { number: 4, name: "Delegation", min: 51, max: 150 },
  { number: 5, name: "Standardization", min: 151, max: null },
] as const;
```

`currentGrowthPhaseFromAnswers` must accept only a finite numeric value for the exact driver key and delegate to `computeCurrentGrowthPhase`. Do not change the default behavior of `computeGrowthPhase`.

- [ ] **Step 4: Run the focused tests and commit**

```bash
npx jest src/__tests__/lib/assessments/su-full-phase.test.ts --runInBand
git add src/src/lib/assessments/su-full-phase.ts src/src/__tests__/lib/assessments/su-full-phase.test.ts
git commit -m "fix: align Scaling Up growth phase boundaries"
```

---

### Task 2: Add a phase-aware recommendation schema and pure resolver

**Files:**
- Modify: `src/src/lib/assessments/scoring.ts`
- Modify: `src/src/__tests__/lib/assessments/scoring.test.ts`

**Interfaces:**
- Produces: `GrowthPhaseRecommendationSchema`
- Produces on slider questions: `phaseRecommendations?: Array<{ phase: 1 | 2 | 3 | 4 | 5; bands: RecommendationBand[] }>`
- Extends: `scoreSubmission(..., options?: { allowMissingRequired?: boolean; recommendationPhase?: 1 | 2 | 3 | 4 | 5 })`
- Extends: `ScoreResult` with optional frozen `recommendationPhase?: 1 | 2 | 3 | 4 | 5`; emit it only when the option is supplied.

- [ ] **Step 1: Write failing schema and resolution tests**

Cover all of these exact cases:

```ts
expect(scoreAt({ phase: 1, value: 4 }).recommendation).toBe("P1 low");
expect(scoreAt({ phase: 2, value: 5 }).recommendation).toBe("P2 middle");
expect(scoreAt({ phase: 5, value: 10 }).recommendation).toBe("P5 top");
expect(scoreWithoutPhase().recommendation).toBeUndefined();
expect(legacyScoreOnlyQuestion().recommendation).toBe("legacy");
```

Publish validation must reject missing/duplicate phases, any phase whose bands do not tile `0–10`, placeholder/blank/oversized text, and a question carrying malformed mixed phase shapes.

- [ ] **Step 2: Run the focused scoring tests and verify RED**

```bash
npx jest src/__tests__/lib/assessments/scoring.test.ts --runInBand
```

- [ ] **Step 3: Implement the additive schema and precedence rule**

```ts
if (q.phaseRecommendations?.length) {
  const phaseRow = q.phaseRecommendations.find(
    (row) => row.phase === options?.recommendationPhase,
  );
  row.recommendation = phaseRow?.bands.find(
    (band) => value >= band.minScore && value <= band.maxScore,
  )?.text;
} else {
  row.recommendation = q.recommendations?.find(
    (band) => value >= band.minScore && value <= band.maxScore,
  )?.text;
}
```

Never use legacy `recommendations` as fallback when `phaseRecommendations` exists but no phase was supplied.

- [ ] **Step 4: Run the focused tests and commit**

```bash
npx jest src/__tests__/lib/assessments/scoring.test.ts --runInBand
git add src/src/lib/assessments/scoring.ts src/src/__tests__/lib/assessments/scoring.test.ts
git commit -m "feat: resolve feedback by organizational phase"
```

---

### Task 3: Freeze the audited current-source catalogue as executable content

**Files:**
- Create: `src/src/lib/assessments/su-full-phase-feedback-catalogue.ts`
- Create: `src/scripts/generate-su-full-phase-feedback-catalogue.ts`
- Create: `src/src/__tests__/lib/assessments/su-full-phase-feedback-catalogue.test.ts`
- Read-only source: `docs/research/esperto-feedback-five-phase-band-catalogue-2026-08-20.csv`

**Interfaces:**
- Produces: `SU_FULL_PHASE_FEEDBACK_SOURCE_ID = "2026-08-20.esperto-five-phase-v1"`
- Produces: `SU_FULL_PHASE_FEEDBACK: Readonly<Record<GrowthPhaseNumber, Readonly<Record<string, readonly RecommendationBand[]>>>>`
- Produces: `buildPhaseRecommendations(stableKey: string): PhaseRecommendation[]`

- [ ] **Step 1: Write failing integrity tests**

Assert exactly five phases, 61 canonical question keys in each phase, four bands per question, ranges `0–4 / 5–6 / 7–8 / 9–10`, 1,220 nonblank records, no duplicate phase/question/band key, and exact known sentinels from P1/Q01/0–4, P4/Q36/5–6, and P5/Q24/9–10.

- [ ] **Step 2: Implement the deterministic generator**

The script must read the committed CSV, reject any unexpected column/count/range/duplicate/blank, map `Q01..Q61` to the existing canonical `stableKey` order, and write stable TypeScript. It must never read Downloads or network data.

- [ ] **Step 3: Generate once, rerun, and prove byte stability**

```bash
npx tsx scripts/generate-su-full-phase-feedback-catalogue.ts
shasum -a 256 src/lib/assessments/su-full-phase-feedback-catalogue.ts
npx tsx scripts/generate-su-full-phase-feedback-catalogue.ts
git diff --exit-code -- src/lib/assessments/su-full-phase-feedback-catalogue.ts
npx jest src/__tests__/lib/assessments/su-full-phase-feedback-catalogue.test.ts --runInBand
```

- [ ] **Step 4: Commit**

```bash
git add src/scripts/generate-su-full-phase-feedback-catalogue.ts src/src/lib/assessments/su-full-phase-feedback-catalogue.ts src/src/__tests__/lib/assessments/su-full-phase-feedback-catalogue.test.ts
git commit -m "feat: add audited five-phase feedback catalogue"
```

---

### Task 4: Create a guarded forward-only draft lifecycle

**Files:**
- Create: `src/src/lib/assessments/su-full-phase-feedback-edition.ts`
- Create: `src/scripts/create-scaling-up-full-phase-feedback-draft.ts`
- Create: `src/scripts/publish-scaling-up-full-phase-feedback-draft.ts`
- Create: `src/src/__tests__/lib/assessments/su-full-phase-feedback-edition.test.ts`
- Reference: `src/src/lib/assessments/su-full-feedback-bands.ts`

**Interfaces:**
- Produces: `createScalingUpFullPhaseFeedbackDraft(db, actorEmail)`
- Produces: `publishScalingUpFullPhaseFeedbackDraft(db, draftVersionId, actorEmail)`
- Draft receipt must include source ID, before/after content hashes, 61 question count, 1,220 phase-band record count, phase boundaries, and `historicRowsMutated: false`.

- [ ] **Step 1: Write failing draft/publish guard tests**

Test idempotent draft creation, exact active-edition source, refusal on non-SU-Full alias/language, wrong question order, missing catalogue key, wrong phase/range/count, blank actor, changed invitation/report/scoring config, already-published draft, stale active version, and any attempt to mutate an existing published version.

- [ ] **Step 2: Implement draft creation by cloning the active published version**

For every scored question, attach `buildPhaseRecommendations(stableKey)`. Preserve legacy recommendations for old admin/read compatibility, but the Task-2 precedence rule must make the phase catalogue authoritative in the new version. Recompute the standard content hash and write an audit log in the same transaction.

- [ ] **Step 3: Implement a separate publish command**

Publishing must re-read and revalidate the draft inside the transaction, ensure the active published predecessor still matches the draft receipt, publish only the draft, and never repin an existing campaign.

- [ ] **Step 4: Run tests and commit without executing either Production script**

```bash
npx jest src/__tests__/lib/assessments/su-full-phase-feedback-edition.test.ts --runInBand
git add src/src/lib/assessments/su-full-phase-feedback-edition.ts src/scripts/create-scaling-up-full-phase-feedback-draft.ts src/scripts/publish-scaling-up-full-phase-feedback-draft.ts src/src/__tests__/lib/assessments/su-full-phase-feedback-edition.test.ts
git commit -m "feat: add phase feedback edition lifecycle"
```

---

### Task 5: Freeze the CEO phase into submission-time feedback resolution

**Files:**
- Modify: `src/src/lib/assessments/compute-score-result.ts`
- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`
- Modify: `src/src/components/assessments/section-pager.tsx`
- Modify: `src/src/lib/assessments/su-full-landscape-report.ts`
- Modify: `src/src/__tests__/app/org-survey/submit.test.ts`
- Modify: `src/src/__tests__/lib/assessments/compute-score-result.test.ts`
- Modify: `src/src/__tests__/lib/assessments/respondent-report.test.ts`
- Modify: `src/src/__tests__/assessments/section-pager-phase-tile.test.tsx`
- Modify: `src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts`

**Interfaces:**
- Extends: `computeScoreResult(..., options?: { allowMissingRequired?: boolean; recommendationPhase?: GrowthPhaseNumber })`
- Consumes: `currentGrowthPhaseFromAnswers(prunedAnswers)` and forwards `phase.number` only for an authorized SU-Full CEO on a phase-aware version.
- Produces: frozen `ScoreResult.perQuestion[].recommendation`; report readers remain lookup-free.
- Produces: frozen `ScoreResult.recommendationPhase`; new reports render that phase, while old results without it retain legacy phase computation.

- [ ] **Step 1: Write failing submit-path tests**

Cover P1/P2/P3/P4/P5 CEO submissions at headcounts `8/9/26/51/151`, exact band edges `4/5/6/7/8/9/10`, and assert the persisted result contains the catalogue sentinel for the resolved phase. Assert a phase-aware CEO submission with missing/invalid required FTE fails rather than selecting a fallback.

- [ ] **Step 2: Write frozen-history and audience tests**

Assert legacy versions still resolve legacy `recommendations`; an existing stored submission renders its already-frozen paragraph after the active version changes; a non-CEO phase-aware submission does not receive a guessed phase recommendation; and CEO-only respondent report authorization remains unchanged.

- [ ] **Step 3: Pass the phase through the one scoring seam**

Resolve from the pruned `Q_FTE_CONTRACT` answer only after the existing locked `isCEO` decision and only when the pinned question payload contains `phaseRecommendations`. The survey phase tile must choose the current resolver only for that same phase-aware payload. The landscape report must prefer frozen `ScoreResult.recommendationPhase` and use the legacy helper only when the frozen field is absent. Do not query another submission, the active template, mutable organization state, or current catalogue during report rendering.

- [ ] **Step 4: Run tests and commit**

```bash
npx jest src/__tests__/app/org-survey/submit.test.ts src/__tests__/lib/assessments/compute-score-result.test.ts src/__tests__/lib/assessments/respondent-report.test.ts src/__tests__/assessments/section-pager-phase-tile.test.tsx src/__tests__/lib/assessments/su-full-landscape-report.test.ts --runInBand
git add src/src/lib/assessments/compute-score-result.ts src/src/app/'(public)'/org-survey/'[campaignAlias]'/submit/route.ts src/src/components/assessments/section-pager.tsx src/src/lib/assessments/su-full-landscape-report.ts src/src/__tests__/app/org-survey/submit.test.ts src/src/__tests__/lib/assessments/compute-score-result.test.ts src/src/__tests__/lib/assessments/respondent-report.test.ts src/src/__tests__/assessments/section-pager-phase-tile.test.tsx src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts
git commit -m "feat: freeze phase-aware CEO feedback at submission"
```

---

### Task 6: Prove report fidelity and prepare a dark release receipt

**Files:**
- Modify: `src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts`
- Modify: `src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Create: `docs/research/su-full-phase-feedback-implementation-receipt-2026-08-20.md`

**Interfaces:**
- Consumes only frozen recommendations from `ScoreResult`.
- Produces a branch receipt stating whether a draft was created and explicitly stating `published: false`, `activated: false`, and `Peers changed: false`.

- [ ] **Step 1: Add all-phase report regression fixtures**

For at least one question that changes at every adjacent phase, assert five frozen report outputs at the same score show the five audited texts. Add a 482-character representative paragraph to the Chromium/PDF density fixture and assert no clipping.

- [ ] **Step 2: Run the complete release gates**

From `src/`:

```bash
npx eslint src/lib/assessments/su-full-phase.ts src/lib/assessments/scoring.ts src/lib/assessments/compute-score-result.ts src/lib/assessments/su-full-phase-feedback-catalogue.ts src/lib/assessments/su-full-phase-feedback-edition.ts src/app/'(public)'/org-survey/'[campaignAlias]'/submit/route.ts scripts/generate-su-full-phase-feedback-catalogue.ts scripts/create-scaling-up-full-phase-feedback-draft.ts scripts/publish-scaling-up-full-phase-feedback-draft.ts
npm test -- --runInBand
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

Expected: zero ESLint errors; every Jest suite/test/snapshot passes; migration safety reports no new migration; build completes with TypeScript and all static pages.

- [ ] **Step 3: Perform the branch risk review**

Verify `git diff --check origin/main...HEAD`, no benchmark/peer changes, no published-version update, no existing campaign repin, no submission mutation, no new environment flag, no secret/token/PDF/PNG tracked artifact, and exact 1,220-record catalogue parity with the research CSV.

- [ ] **Step 4: Record the dark receipt and commit**

Update the SoT anchor/changelog with the exact HEAD and gate counts. State that publishing the draft is still a separate approval-gated activation release.

```bash
git add CLAUDE.md plans/CHANGELOG.md docs/research/su-full-phase-feedback-implementation-receipt-2026-08-20.md src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx
git commit -m "docs: record phase-aware feedback dark release"
```

---

### Task 7: Separate activation release after explicit approval

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Modify: `docs/research/su-full-phase-feedback-implementation-receipt-2026-08-20.md`

**Interfaces:**
- Consumes the exact reviewed draft ID and content hash from Task 4.
- Produces a published edition for future campaigns only; existing campaign pins and frozen submissions remain unchanged.

- [ ] **Step 1: Re-run the exact pre-publish gates on the reviewed HEAD**

Use the Task-6 commands and require a clean worktree.

- [ ] **Step 2: Publish only the approved draft**

Load the exact reviewed values from the signed approval receipt into task-specific environment variables, then run:

```bash
test -n "$SU_FULL_PHASE_FEEDBACK_APPROVED_DRAFT_ID"
test -n "$SU_FULL_PHASE_FEEDBACK_APPROVED_CONTENT_HASH"
test -n "$SU_FULL_PHASE_FEEDBACK_APPROVED_ACTOR"
npx tsx scripts/publish-scaling-up-full-phase-feedback-draft.ts --i-know-this-is-prod
```

The approval must supply `SU_FULL_PHASE_FEEDBACK_APPROVED_DRAFT_ID`,
`SU_FULL_PHASE_FEEDBACK_APPROVED_CONTENT_HASH`, and
`SU_FULL_PHASE_FEEDBACK_APPROVED_ACTOR` through the approval-scoped environment.
The script must reject blank, stale, or mismatched inputs and any ad-hoc
`--draft-version-id`, `--content-hash`, `--approved-content-hash`, or `--actor`
override.

- [ ] **Step 3: Verify Production without mutating historic data**

Create one new dedicated mail-disabled campaign pinned to the new edition, complete boundary/sentinel CEO cases, verify the landscape report paragraphs against the catalogue, verify all 61 Peers remain the governed snapshot, and re-open an old pinned report to prove its frozen feedback is unchanged.

- [ ] **Step 4: Record the activation receipt**

Document the published version ID/hash, new-campaign pin, old-campaign pin, sentinel results, 61-Peer parity, deployment URL/SHA, smoke timestamp, and rollback instruction (stop creating new campaigns on the edition; never rewrite submissions).
