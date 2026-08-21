# Scaling Up Full Frozen Phase Peers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every future governed, report-eligible Scaling Up Full CEO result freeze and render the exact Esperto peer vector selected by its organizational phase, while historical reports retain the 2026-08-14 baseline and Layout A preserves the approved question → You/Peers bars → feedback sequence.

**Architecture:** Compile the committed 3,355-row five-phase CSV into a deterministic, browser-safe TypeScript catalogue, attach an explicit P1–P5 value to each slider in the same immutable template edition as phase-aware Feedback, and freeze the selected values plus source provenance inside `ScoreResult`. New Scaling Up Full reports build Peers only from that frozen snapshot; genuinely historical results use the executable legacy baseline, corrupt declared snapshots fail closed, and LVA keeps its existing database-backed path.

**Tech Stack:** TypeScript, Next.js App Router, Zod, Prisma JSON template versions, Jest, React Testing Library, Playwright/browser report checks, existing template-content-hash and audit-log infrastructure.

**Spec:** `docs/superpowers/specs/2026-08-21-su-full-frozen-phase-peers-design.md`

## Global Constraints

- The audited source is exactly `docs/research/esperto-feedback-five-phase-full-matrix-2026-08-20.csv`: 3,355 rows, 55 phase/score reports, and 61 governed questions per report.
- P1/P2/P3/P5 use fingerprint `fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd`; P4 uses `ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff`.
- Keep P1, P2, P3, P4, and P5 explicit in template JSON even though four phases share one vector; no runtime default phase or inferred equivalence is allowed.
- Phase-aware Feedback and Peers ship in one forward-only immutable Scaling Up Full edition; do not create competing drafts.
- Freeze `peerValue` per scored question and `{ sourceId, contentHash, phase }` once in `ScoreResult`; new reports must not consult mutable `AssessmentBenchmark` rows.
- The individual Full report and its FTE phase driver are CEO-only. A governed CEO result without a resolvable phase fails closed; non-CEO submissions omit the peer snapshot and continue through the existing no-report scoring path.
- Historical results with neither a snapshot nor any `peerValue` use the executable `2026-08-14.esperto-controlled-v1` baseline without rewriting results or repinning campaigns.
- A declared but incomplete, invalid, or hash-mismatched snapshot omits Peers and emits a structured reason; it must not fall back to baseline or query mutable rows.
- LVA benchmark lookup and rendering remain byte-for-byte unchanged.
- Layout A means question, clearly labelled You/Peers bars, then frozen feedback. Preserve Scaling Up branding, the landscape architecture, and the 26-page contract; the local prototype is not application code.
- The disclosure is exactly: `Peers are a governed benchmark snapshot selected by organizational phase and frozen when this result was scored. This is not an industry-, geography-, or cohort-matched comparison.`
- Do not add a dependency or Prisma migration.
- Draft creation, publication, push, PR, deploy, activation, production mutation, and external communications are separate approval gates. This implementation plan authorizes none of them.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/src/lib/assessments/su-full-phase-peer-catalogue-generator.ts` | Pure CSV parser, evidence validation, vector hashing, and deterministic module generation |
| `src/scripts/generate-su-full-phase-peer-catalogue.ts` | Repository-root CLI wrapper for the committed CSV and generated module |
| `src/src/lib/assessments/su-full-phase-peer-catalogue.ts` | Generated production catalogue, explicit five-phase mapping, source ID, and audited hashes |
| `src/src/lib/assessments/scoring.ts` | Generic schema validation, exact phase selection, and result freezing |
| `src/src/lib/assessments/su-full-phase-feedback-edition.ts` | One guarded draft/publish lifecycle that attaches Feedback and Peers together |
| `src/src/lib/assessments/su-full-peer-presentation.ts` | Frozen-snapshot renderer plus explicit historical fallback |
| `src/src/lib/assessments/peer-report-resolver.ts` | SU Full database bypass and unchanged LVA database path |
| `src/src/components/assessments/su-full-landscape/*` | Layout A and truthful phase-snapshot disclosure |

---

### Task 1: Compile the Audited Five-Phase Peer Catalogue

**Files:**
- Create: `src/src/lib/assessments/su-full-phase-peer-catalogue-generator.ts`
- Create: `src/src/lib/assessments/su-full-phase-peer-catalogue.ts`
- Create: `src/scripts/generate-su-full-phase-peer-catalogue.ts`
- Create: `src/src/__tests__/lib/assessments/su-full-phase-peer-catalogue.test.ts`
- Modify: `src/package.json:5-45`
- Read only: `docs/research/esperto-feedback-five-phase-full-matrix-2026-08-20.csv`

**Interfaces:**
- Produces: `compilePhasePeerCatalogue(csv: string): CompiledPhasePeerCatalogue`
- Produces: `renderPhasePeerCatalogueModule(catalogue: CompiledPhasePeerCatalogue): string`
- Produces: `hashPhasePeerVector(vector: Readonly<Record<string, number>>): string`
- Produces: `SU_FULL_PHASE_PEER_SOURCE_ID = "2026-08-20.esperto-five-phase-peers-v1"`
- Produces: `SU_FULL_PHASE_PEER_CONTENT_HASHES: Readonly<Record<GrowthPhaseNumber, string>>`
- Produces: `buildPhasePeerBenchmarks(stableKey: string): readonly PhasePeerBenchmark[]`
- Produces: `getGovernedPeerValue(stableKey: string, phase: GrowthPhaseNumber): number | null`
- Consumes: canonical stable-key order from `SU_FULL_QUESTION_BENCHMARKS`.

- [ ] **Step 1: Write the failing compiler and integrity tests**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compilePhasePeerCatalogue,
  renderPhasePeerCatalogueModule,
} from "@/lib/assessments/su-full-phase-peer-catalogue-generator";

const csv = readFileSync(
  join(process.cwd(), "../docs/research/esperto-feedback-five-phase-full-matrix-2026-08-20.csv"),
  "utf8",
);

it("compiles all audited reports into five score-invariant phase vectors", () => {
  const compiled = compilePhasePeerCatalogue(csv);
  expect(compiled.sourceRowCount).toBe(3355);
  expect(compiled.reportCount).toBe(55);
  expect(Object.keys(compiled.phaseVectors)).toEqual(["1", "2", "3", "4", "5"]);
  for (const phase of [1, 2, 3, 4, 5] as const) {
    expect(Object.keys(compiled.phaseVectors[phase])).toHaveLength(61);
  }
  expect(compiled.contentHashes).toEqual({
    1: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
    2: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
    3: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
    4: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
    5: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  });
  expect(compiled.phaseVectors[1].Q01).toBe(6.3);
  expect(compiled.phaseVectors[4].Q01).toBe(6.6);
});

it("renders byte-identical TypeScript on repeated compilation", () => {
  const first = renderPhasePeerCatalogueModule(compilePhasePeerCatalogue(csv));
  const second = renderPhasePeerCatalogueModule(compilePhasePeerCatalogue(csv));
  expect(second).toBe(first);
});
```

Also add mutation cases that remove a row, duplicate a phase/score/question row, change one score's peer value, use a value outside `0..10`, and change a phase label. Assert the compiler throws a message beginning `SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE` or `SU_FULL_PHASE_PEERS_HASH_MISMATCH`.

- [ ] **Step 2: Run the focused test and verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/lib/assessments/su-full-phase-peer-catalogue.test.ts --runInBand
```

Expected: FAIL because the compiler and generated catalogue modules do not exist.

- [ ] **Step 3: Implement the dependency-free CSV compiler**

Use an RFC4180 line parser because feedback text contains commas. Reject embedded newlines explicitly; the governed file has one physical row per record.

```ts
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE: unterminated CSV quote");
  cells.push(cell);
  return cells;
}
```

Group rows by phase and score, require 11 score groups per phase and Q01–Q61 exactly once per group, then compare every score vector in a phase against score 0. Export `hashPhasePeerVector`; it must hash the stable serialization `Q01=6.3\n...\nQ61=<value>\n` with `createHash("sha256")`, including the final newline. The resulting fingerprints must equal the two audited hashes above. The generated module must hold two frozen vectors internally but export an explicit five-phase map.

- [ ] **Step 4: Add the CLI and package script**

```ts
const sourcePath = resolve(process.cwd(), "../docs/research/esperto-feedback-five-phase-full-matrix-2026-08-20.csv");
const outputPath = resolve(process.cwd(), "src/lib/assessments/su-full-phase-peer-catalogue.ts");
const output = renderPhasePeerCatalogueModule(
  compilePhasePeerCatalogue(readFileSync(sourcePath, "utf8")),
);
writeFileSync(outputPath, output, "utf8");
```

Add this exact `package.json` script:

```json
"generate:scaling-up-full-phase-peers": "npx tsx scripts/generate-su-full-phase-peer-catalogue.ts"
```

- [ ] **Step 5: Generate once and prove regeneration is clean**

```bash
npm run generate:scaling-up-full-phase-peers
cp src/lib/assessments/su-full-phase-peer-catalogue.ts /tmp/su-full-phase-peer-catalogue.ts
npm run generate:scaling-up-full-phase-peers
cmp /tmp/su-full-phase-peer-catalogue.ts src/lib/assessments/su-full-phase-peer-catalogue.ts
npx jest src/__tests__/lib/assessments/su-full-phase-peer-catalogue.test.ts --runInBand
```

Expected: `cmp` exits 0 and the focused suite passes.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/generate-su-full-phase-peer-catalogue.ts src/lib/assessments/su-full-phase-peer-catalogue-generator.ts src/lib/assessments/su-full-phase-peer-catalogue.ts src/__tests__/lib/assessments/su-full-phase-peer-catalogue.test.ts
git commit -m "feat: add governed five-phase peer catalogue"
```

---

### Task 2: Validate and Freeze Phase Peers During Scoring

**Files:**
- Modify: `src/src/lib/assessments/scoring.ts:54-100,194-210,1076-1140,1501-2000`
- Modify: `src/src/lib/assessments/compute-score-result.ts:13-34`
- Modify: `src/src/__tests__/lib/assessments/scoring.test.ts`
- Modify: `src/src/__tests__/lib/assessments/compute-score-result.test.ts`

**Interfaces:**
- Produces: `PhasePeerBenchmarkSchema` and `PhasePeerBenchmark`.
- Extends `SliderLikertQuestion` with `phasePeerBenchmarks?: PhasePeerBenchmark[]`.
- Extends `ScoringConfigSchema` with `phasePeerBenchmarkCatalogue?: { sourceId: string; phases: Array<{ phase: GrowthPhaseNumber; contentHash: string }> }`.
- Extends `PerQuestionResult` with `peerValue?: number`.
- Extends `ScoreResult` with `peerBenchmarkSnapshot?: { sourceId: string; contentHash: string; phase: GrowthPhaseNumber }`.
- Preserves: `computeScoreResult(..., options?: { allowMissingRequired?: boolean; recommendationPhase?: GrowthPhaseNumber })`; the existing `recommendationPhase` is the single phase selector for both Feedback and Peers.

- [ ] **Step 1: Write failing schema and scoring tests**

```ts
const result = scoreSubmission(phasePeerVersion(), completeAnswers(), {
  recommendationPhase: 4,
});

expect(result.perQuestion.find((row) => row.stableKey === "Q01")?.peerValue).toBe(6.6);
expect(result.peerBenchmarkSnapshot).toEqual({
  sourceId: "2026-08-20.esperto-five-phase-peers-v1",
  contentHash: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
  phase: 4,
});
```

Add table tests for P1–P5, two scores in P4 yielding identical peers, P3/P4 differing at Q01, and P5 returning to 6.3. Add negative tests for duplicate phase, only 60 peer rows, non-finite/out-of-range value, missing selected phase metadata, and a selected question row whose phase metadata disagrees. A call without `recommendationPhase` must preserve non-CEO scoring by omitting both `peerValue` and `peerBenchmarkSnapshot`. Assert the exact codes `SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE`, `SU_FULL_PHASE_PEERS_PHASE_MISSING`, or `SU_FULL_PHASE_PEERS_HASH_MISMATCH` through `ScoringValidationError` for malformed or explicitly selected governed data.

- [ ] **Step 2: Run the scoring suites and verify RED**

```bash
npx jest src/__tests__/lib/assessments/scoring.test.ts src/__tests__/lib/assessments/compute-score-result.test.ts --runInBand
```

Expected: FAIL because phase peer fields are not in the schemas or result types.

- [ ] **Step 3: Add the exact additive schemas**

```ts
export const PhasePeerBenchmarkSchema = z.object({
  phase: GrowthPhaseSchema,
  value: z.number().finite().min(0).max(10),
});
export type PhasePeerBenchmark = z.infer<typeof PhasePeerBenchmarkSchema>;

const PhasePeerBenchmarkCatalogueSchema = z.object({
  sourceId: z.string().min(1),
  phases: z.array(z.object({
    phase: GrowthPhaseSchema,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })).length(5),
});
```

Add `phasePeerBenchmarks: z.array(PhasePeerBenchmarkSchema).optional()` to sliders and `phasePeerBenchmarkCatalogue: PhasePeerBenchmarkCatalogueSchema.optional()` to `ScoringConfigBase`. In both runtime and publish refinements, require that catalogue metadata and question peer rows are either absent together or present together, that phases 1–5 occur exactly once, and that every scorable question carries all five values.

- [ ] **Step 4: Freeze the selected values and provenance**

```ts
const peerCatalogue = v.scoringConfig.phasePeerBenchmarkCatalogue;
const selectedPeerPhase = options?.recommendationPhase;
const selectedPeerMetadata = peerCatalogue?.phases.find(
  (row) => row.phase === selectedPeerPhase,
);

if (peerCatalogue && selectedPeerPhase !== undefined && !selectedPeerMetadata) {
  throw new ScoringValidationError("SU_FULL_PHASE_PEERS_PHASE_MISSING", {
    phase: selectedPeerPhase,
  });
}
```

Inside the existing per-question loop, resolve the exact phase row and assign `row.peerValue` only when `selectedPeerPhase` is present. After building the result, emit `peerBenchmarkSnapshot` only when the catalogue is declared, a phase was supplied, and all selected values were frozen. The scorer validates consistent declared metadata; Task 3 and Task 4 perform the cryptographic value-to-hash proof before a governed version can exist.

- [ ] **Step 5: Run focused tests and commit**

```bash
npx jest src/__tests__/lib/assessments/scoring.test.ts src/__tests__/lib/assessments/compute-score-result.test.ts --runInBand
git add src/lib/assessments/scoring.ts src/lib/assessments/compute-score-result.ts src/__tests__/lib/assessments/scoring.test.ts src/__tests__/lib/assessments/compute-score-result.test.ts
git commit -m "feat: freeze phase peers in score results"
```

---

### Task 3: Extend the One Forward-Only Feedback Edition With Peers

**Files:**
- Modify: `src/src/lib/assessments/su-full-phase-feedback-edition.ts:1-1085`
- Modify: `src/src/__tests__/lib/assessments/su-full-phase-feedback-edition.test.ts`
- Modify: `src/scripts/create-scaling-up-full-phase-feedback-draft.ts`
- Modify: `src/scripts/publish-scaling-up-full-phase-feedback-draft.ts`

**Interfaces:**
- Consumes: `buildPhasePeerBenchmarks(stableKey)`, `hashPhasePeerVector(vector)`, and `SU_FULL_PHASE_PEER_CONTENT_HASHES` from Task 1.
- Preserves: `createScalingUpFullPhaseFeedbackDraft(db, actorEmail)` and `publishScalingUpFullPhaseFeedbackDraft(db, draftVersionId, approvedContentHash, actorEmail)`.
- Extends `PhaseFeedbackDraftReceipt` with `peerSourceId`, `peerPhaseContentHashes`, and `phasePeerRecordCount: 305`.
- Produces one draft whose 61 sliders each contain both `phaseRecommendations` and `phasePeerBenchmarks`, and whose scoring config contains the five peer hash records.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
expect(created.phaseBandRecordCount).toBe(1220);
expect(created.phasePeerRecordCount).toBe(305);
expect(created.peerSourceId).toBe("2026-08-20.esperto-five-phase-peers-v1");
expect(created.peerPhaseContentHashes).toEqual({
  1: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  2: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  3: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  4: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
  5: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
});
expect(created.historicRowsMutated).toBe(false);
```

Assert the draft's Q01 has five peer rows with P1=6.3, P4=6.6, P5=6.3. Add refusal tests for a missing Q61, a modified peer value, a modified hash, a second competing draft, stale active-version receipt, changed invitation/report config, and any campaign repin. Preserve every current feedback lifecycle test.

- [ ] **Step 2: Run the lifecycle suite and verify RED**

```bash
npx jest src/__tests__/lib/assessments/su-full-phase-feedback-edition.test.ts --runInBand
```

Expected: FAIL because the receipt and cloned questions contain Feedback only.

- [ ] **Step 3: Attach both catalogues and hash the combined version**

Extend `QuestionRecord` with `phasePeerBenchmarks?: unknown`. Replace the single-purpose attachment with a combined transform:

```ts
function attachPhaseAwareContent(questions: unknown): unknown[] {
  const scored = canonicalScoredQuestions(questions);
  const scoredSet = new Set(scored);
  return (questions as unknown[]).map((rawQuestion) => {
    if (!scoredSet.has(rawQuestion as QuestionRecord)) return rawQuestion;
    const question = rawQuestion as QuestionRecord;
    const stableKey = String(question.stableKey);
    return {
      ...question,
      phaseRecommendations: buildPhaseRecommendations(stableKey),
      phasePeerBenchmarks: buildPhasePeerBenchmarks(stableKey),
    };
  });
}
```

Add `phasePeerBenchmarkCatalogue` to the cloned scoring config with the exact source ID and explicit phases 1–5. Recompute the existing template content hash after both additions. Keep the transaction isolation, actor authorization, idempotency, audit receipt, source-version verification, and zero-repin behavior unchanged.

- [ ] **Step 4: Strengthen draft and publish revalidation**

Before create and again before publish, compare all 305 question/phase values to the compiled catalogue, recompute the vector fingerprints with the Task-1 compiler helper, and require equality with the receipt and scoring-config hashes. Emit the existing audit actions but include the extended receipt. Do not rename the scripts or execute them against any database.

- [ ] **Step 5: Run tests and commit**

```bash
npx jest src/__tests__/lib/assessments/su-full-phase-feedback-edition.test.ts --runInBand
git add src/lib/assessments/su-full-phase-feedback-edition.ts scripts/create-scaling-up-full-phase-feedback-draft.ts scripts/publish-scaling-up-full-phase-feedback-draft.ts src/__tests__/lib/assessments/su-full-phase-feedback-edition.test.ts
git commit -m "feat: govern feedback and peers in one edition"
```

---

### Task 4: Freeze Peers at the Submit Seam and Preserve Them Across JSON Boundaries

**Files:**
- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts:999-1045`
- Modify: `src/src/__tests__/app/org-survey/submit.test.ts`
- Modify: `src/src/__tests__/lib/assessments/respondent-report.test.ts`
- Modify: `src/src/__tests__/lib/assessments/onscreen-result-store.test.ts`

**Interfaces:**
- Consumes: Task-2 `ScoreResult.peerBenchmarkSnapshot` and `perQuestion[].peerValue`.
- Produces: one persisted score result whose `recommendationPhase` and `peerBenchmarkSnapshot.phase` are identical.
- Preserves: fingerprint-based duplicate-submit protection and the single `computeScoreResult` seam.

- [ ] **Step 1: Write failing submit and round-trip tests**

```ts
expect(savedResult.recommendationPhase).toBe(4);
expect(savedResult.peerBenchmarkSnapshot).toEqual({
  sourceId: "2026-08-20.esperto-five-phase-peers-v1",
  contentHash: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
  phase: 4,
});
expect(savedResult.perQuestion).toHaveLength(61);
expect(savedResult.perQuestion.every((row) => Number.isFinite(row.peerValue))).toBe(true);
```

Add P3/P4 boundary CEO submissions, P5 baseline reversion, a non-CEO submission that succeeds with no peer snapshot, missing frozen phase rejection for a CEO, and duplicate submission returning the previously persisted result without rescoring. Serialize and revive a report containing the new fields and assert deep equality for the snapshot and all 61 peer values.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npx jest src/__tests__/app/org-survey/submit.test.ts src/__tests__/lib/assessments/respondent-report.test.ts src/__tests__/lib/assessments/onscreen-result-store.test.ts --runInBand
```

Expected: FAIL because the route's phase-aware marker only recognizes Feedback and fixtures do not carry frozen Peers.

- [ ] **Step 3: Make the version marker cover either governed phase feature**

```ts
const phaseAwareVersion =
  invitation.campaign.template?.alias === SU_FULL_ALIAS &&
  versionParsed.data.questions.some(
    (question) =>
      question.type === "SLIDER_LIKERT" &&
      (question.phaseRecommendations !== undefined ||
        question.phasePeerBenchmarks !== undefined),
  );
```

Keep the current locked phase resolution and the second call to `computeScoreResult(..., { recommendationPhase: phase.number })`. Immediately after scoring a governed peer version, assert the result has 61 finite `peerValue` fields and matching phase provenance; throw `ScoringValidationError("SU_FULL_PHASE_PEERS_RESULT_INCOMPLETE", ...)` before persistence if not.

- [ ] **Step 4: Confirm no custom JSON revival logic is needed**

The new fields contain only strings and numbers. Preserve them through object spread and existing report construction. The tests must prove native `JSON.stringify`/`JSON.parse` plus `reviveOnScreenReport` retains them; do not introduce dates or a second result schema.

- [ ] **Step 5: Run tests and commit**

```bash
npx jest src/__tests__/app/org-survey/submit.test.ts src/__tests__/lib/assessments/respondent-report.test.ts src/__tests__/lib/assessments/onscreen-result-store.test.ts --runInBand
git add 'src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' src/__tests__/app/org-survey/submit.test.ts src/__tests__/lib/assessments/respondent-report.test.ts src/__tests__/lib/assessments/onscreen-result-store.test.ts
git commit -m "feat: persist frozen phase peer snapshots"
```

---

### Task 5: Render Frozen or Historical Peers Without a Mutable SU Full Lookup

**Files:**
- Modify: `src/src/lib/assessments/su-full-question-benchmarks.ts:1-90`
- Modify: `src/src/lib/assessments/su-full-peer-presentation.ts:1-370`
- Modify: `src/src/lib/assessments/peer-report-resolver.ts:120-260`
- Modify: `src/src/__tests__/lib/assessments/su-full-peer-presentation.test.ts`
- Modify: `src/src/__tests__/lib/assessments/peer-report-resolver.test.ts`
- Modify: `src/src/__tests__/fixtures/su-full-landscape.ts`

**Interfaces:**
- Changes: `buildSuFullPeerPresentationResult({ report })` no longer accepts database benchmark rows for Scaling Up Full.
- Changes `SuFullPeerPresentation` provenance to `{ sourceId: string; contentHash: string; phase: GrowthPhaseNumber | null; legacy: boolean }` plus sections.
- Produces reasons: `SNAPSHOT_INCOMPLETE`, `SNAPSHOT_HASH_MISMATCH`, and `LEGACY_BASELINE_INCOMPLETE` alongside existing report-shape reasons.
- Preserves: LVA's `AssessmentBenchmark.findMany({ metricKind: "QUESTION" })` path.

- [ ] **Step 1: Write failing frozen, legacy, corruption, and resolver tests**

```ts
const frozen = buildSuFullPeerPresentationResult({ report: phaseFourReport() });
expect(frozen.status).toBe("ready");
if (frozen.status === "ready") {
  expect(frozen.presentation.provenance).toEqual({
    sourceId: "2026-08-20.esperto-five-phase-peers-v1",
    contentHash: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
    phase: 4,
    legacy: false,
  });
}
expect(db.assessmentBenchmark.findMany).not.toHaveBeenCalled();
```

Add tests proving: changing mutable SU Full benchmark rows has no effect; historical reports use the baseline constant and mark `legacy: true`; a snapshot with 60 values is unavailable; a changed Q01 value under a valid-looking P4 hash returns `SNAPSHOT_HASH_MISMATCH`; P4 values under the baseline hash fail; LVA still performs one database query and returns the same comparison.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npx jest src/__tests__/lib/assessments/su-full-peer-presentation.test.ts src/__tests__/lib/assessments/peer-report-resolver.test.ts --runInBand
```

Expected: FAIL because SU Full currently requires database benchmark rows.

- [ ] **Step 3: Make the current benchmark module explicitly historical**

Keep all 61 values and `SCALING_UP_FULL_TEMPLATE_ALIAS` unchanged. Rename only misleading comments and export an explicit identity:

```ts
export const SU_FULL_LEGACY_PEER_SOURCE_ID = "2026-08-14.esperto-controlled-v1";
export const SU_FULL_LEGACY_PEER_CONTENT_HASH =
  "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd";
```

Remove the stale claim that the vector is phase-invariant or a mutable current reference.

- [ ] **Step 4: Build from the result snapshot with a strict legacy discriminator**

```ts
const hasSnapshot = report.result.peerBenchmarkSnapshot !== undefined;
const frozenRows = report.result.perQuestion.filter(
  (row) => row.peerValue !== undefined,
);

if (!hasSnapshot && frozenRows.length === 0) {
  return buildPresentationFromValues(report, legacyValues, {
    sourceId: SU_FULL_LEGACY_PEER_SOURCE_ID,
    contentHash: SU_FULL_LEGACY_PEER_CONTENT_HASH,
    phase: null,
    legacy: true,
  });
}
if (!hasSnapshot || frozenRows.length !== 61) {
  return unavailable("SNAPSHOT_INCOMPLETE", 61, frozenRows.length);
}
```

For new snapshots, require source ID, selected phase, and hash to match Task-1 constants; compare every frozen peer value to `getGovernedPeerValue(stableKey, phase)`. A mismatch returns `SNAPSHOT_HASH_MISMATCH`. Never repair a result from the catalogue during rendering.

- [ ] **Step 5: Short-circuit SU Full before every template/benchmark query**

In `resolvePeerReportEnhancements`, build SU Full directly from the report before `assessmentBenchmark.findMany`. In the campaign and submission wrappers, detect the preflight's SU Full case and call the direct resolver without looking up campaign/submission template IDs. Keep the current LVA wrapper lookup and query exactly as-is.

Structured logs may contain template alias, reason, expected count, frozen count, source ID, phase, and hash. They must not contain answers, name, email, respondent ID, or the complete result.

- [ ] **Step 6: Run focused tests and commit**

```bash
npx jest src/__tests__/lib/assessments/su-full-peer-presentation.test.ts src/__tests__/lib/assessments/peer-report-resolver.test.ts --runInBand
git add src/lib/assessments/su-full-question-benchmarks.ts src/lib/assessments/su-full-peer-presentation.ts src/lib/assessments/peer-report-resolver.ts src/__tests__/lib/assessments/su-full-peer-presentation.test.ts src/__tests__/lib/assessments/peer-report-resolver.test.ts src/__tests__/fixtures/su-full-landscape.ts
git commit -m "fix: render Scaling Up peers from frozen results"
```

---

### Task 6: Implement Approved Layout A and Truthful Provenance

**Files:**
- Modify: `src/src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx:16-250`
- Modify: `src/src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx:30-160`
- Modify: `src/src/styles/su-report.css:2580-3010`
- Modify: `src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx`
- Modify: `src/src/__tests__/lib/assessments/su-full-landscape-report.test.ts`
- Modify: `src/src/__tests__/lib/assessments/su-full-landscape-render.test.tsx`

**Interfaces:**
- Consumes: `SuFullPeerPresentation.provenance` from Task 5.
- Preserves: `SuFullDetailPairedBars({ chapterKey, question })` with explicit `You` and `Peers` labels.
- Produces: `PeerSnapshotDisclosure({ provenance })` with the exact governed disclosure and a concise `Phase P<n> · <sourceId>` or `Legacy baseline · <sourceId>` provenance line.

- [ ] **Step 1: Write failing component and browser-contract tests**

```tsx
expect(screen.getByText(question.label)).toBeVisible();
const detail = screen.getByTestId(`su-full-detail-${question.stableKey}`);
expect(within(detail).getByText("You")).toBeVisible();
expect(within(detail).getByText("Peers")).toBeVisible();
expect(within(detail).getByText("Frozen feedback")).toBeVisible();
expect(within(detail).getByText("Frozen feedback").compareDocumentPosition(
  within(detail).getByText("Peers"),
) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
```

Assert the exact disclosure string, `Phase P4` for a new P4 result, `Legacy baseline` for a historical result, omission of all Peer UI for an unavailable presentation, 26 pages in browser and PDF modes, no clipping at 1280×720 and 390×844, and identical numeric Peer values in on-screen and print markup.

- [ ] **Step 2: Run focused report tests and verify RED**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-browser.test.tsx src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/__tests__/lib/assessments/su-full-landscape-render.test.tsx --runInBand
```

Expected: FAIL on the old mutable/current disclosure and missing provenance.

- [ ] **Step 3: Implement Layout A in the existing typed component tree**

Keep the current detail order and make it explicit:

```tsx
<article data-testid={`su-full-detail-${question.stableKey}`}>
  <h3>{question.label}</h3>
  <SuFullDetailPairedBars chapterKey={page.chapterKey} question={question} />
  <p className="su-full-landscape-feedback">
    <strong>Frozen feedback</strong> {question.recommendation}
  </p>
</article>
```

Do not copy HTML or CSS from `src/public/prototypes/su-full-phase-peers-prototype.html`. Adjust only existing landscape selectors so labels are unambiguous, bar/value contrast passes current accessibility tests, long feedback wraps, and print page breaks remain stable.

- [ ] **Step 4: Replace the disclosure and show provenance**

```ts
const PEER_DISCLOSURE =
  "Peers are a governed benchmark snapshot selected by organizational phase and frozen when this result was scored. This is not an industry-, geography-, or cohort-matched comparison.";
```

Render it on the peer dashboard and question-detail section. Show source/phase as subordinate provenance, not a marketing claim. Do not show phase provenance when Peers was omitted because of corruption.

- [ ] **Step 5: Run report tests and perform local visual verification**

```bash
npx jest src/__tests__/components/assessments/su-full-landscape-browser.test.tsx src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/__tests__/lib/assessments/su-full-landscape-render.test.tsx --runInBand
```

Then run the existing browser-render harness used by `su-full-landscape-browser.test.tsx`, inspect P3, P4, P5, historical, and corrupt fixtures at desktop/mobile/print sizes, and save only the standard test artifacts. Confirm question → bars → feedback, explicit You/Peers labels, P4 Q01=6.6, P5 Q01=6.3, and 26 pages.

- [ ] **Step 6: Commit**

```bash
git add src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx src/styles/su-report.css src/__tests__/components/assessments/su-full-landscape-browser.test.tsx src/__tests__/lib/assessments/su-full-landscape-report.test.ts src/__tests__/lib/assessments/su-full-landscape-render.test.tsx
git commit -m "feat: apply approved phase peer report layout"
```

---

### Task 7: Close Local Verification and Release Evidence Without Shipping

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-08-21-su-full-frozen-phase-peers-design.md`
- Create: `docs/research/su-full-frozen-phase-peers-local-verification-2026-08-21.md`
- Delete: `src/public/prototypes/su-full-phase-peers-prototype.html`

**Interfaces:**
- Consumes: all prior task commits.
- Produces: one local verification receipt containing exact commands, exit codes, generated catalogue hashes, visual fixtures inspected, and explicit `not pushed / no PR / not published / not deployed / not activated` state.
- Produces no remote, database, deployment, flag, email, or Slack side effect.

- [ ] **Step 1: Run the complete targeted regression set**

```bash
npx jest \
  src/__tests__/lib/assessments/su-full-phase-peer-catalogue.test.ts \
  src/__tests__/lib/assessments/scoring.test.ts \
  src/__tests__/lib/assessments/compute-score-result.test.ts \
  src/__tests__/lib/assessments/su-full-phase-feedback-edition.test.ts \
  src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/lib/assessments/respondent-report.test.ts \
  src/__tests__/lib/assessments/onscreen-result-store.test.ts \
  src/__tests__/lib/assessments/su-full-peer-presentation.test.ts \
  src/__tests__/lib/assessments/peer-report-resolver.test.ts \
  src/__tests__/components/assessments/su-full-landscape-browser.test.tsx \
  src/__tests__/lib/assessments/su-full-landscape-report.test.ts \
  src/__tests__/lib/assessments/su-full-landscape-render.test.tsx \
  --runInBand
```

Expected: all listed suites pass.

- [ ] **Step 2: Run static and repository gates**

```bash
npm run generate:scaling-up-full-phase-peers
git diff --exit-code -- src/lib/assessments/su-full-phase-peer-catalogue.ts
npx eslint \
  src/lib/assessments/su-full-phase-peer-catalogue-generator.ts \
  src/lib/assessments/su-full-phase-peer-catalogue.ts \
  scripts/generate-su-full-phase-peer-catalogue.ts \
  src/lib/assessments/scoring.ts \
  src/lib/assessments/compute-score-result.ts \
  src/lib/assessments/su-full-phase-feedback-edition.ts \
  'src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  src/lib/assessments/su-full-question-benchmarks.ts \
  src/lib/assessments/su-full-peer-presentation.ts \
  src/lib/assessments/peer-report-resolver.ts \
  src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx \
  src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

Expected: clean regeneration, ESLint exit 0, migration safety exit 0, Turbopack build exit 0.

- [ ] **Step 3: Record evidence and update the source of truth**

The verification receipt must include the current commit, the two audited vector hashes, counts `3355 / 55 / 61 / 305`, the exact test summary, browser/PDF screenshots or artifact paths, and the five-state release ledger:

```text
Implementation: local branch only
Push: not authorized
PR: not authorized
Draft creation/publication: not executed
Deploy/activation/production mutation: not executed
```

Update the `CLAUDE.md` anchors and prepend a detailed `plans/CHANGELOG.md` entry only after every command above has passed. Change the design status to `Implemented and locally verified; release gates pending` only then.

- [ ] **Step 4: Remove the throwaway prototype after the typed report passes visual review**

Delete only `src/public/prototypes/su-full-phase-peers-prototype.html`. If `src/public/prototypes/` becomes empty, remove the empty directory. The meeting evidence, design, plan, and verification receipt remain as the durable decision record.

- [ ] **Step 5: Run final hygiene checks and commit locally**

```bash
git diff --check
git status --short --branch
git add CLAUDE.md plans/CHANGELOG.md docs/superpowers/specs/2026-08-21-su-full-frozen-phase-peers-design.md docs/research/su-full-frozen-phase-peers-local-verification-2026-08-21.md
git commit -m "docs: record frozen phase peers verification"
git status --short --branch
```

Expected: the branch is clean and ahead locally. Stop. Do not push, create a PR, run either lifecycle script, publish, deploy, activate, mutate production, or send external communications.

---

## Post-Implementation Release Gates (Not Authorized by This Plan)

After Task 7, obtain separate explicit decisions in this order:

1. independent whole-diff standards and spec-compliance reviews;
2. authorization to push and create a PR;
3. required GitHub checks: Build and Migration Safety Gate;
4. authorization to create the combined governed draft;
5. human review of the draft receipt and approved content hash;
6. authorization to publish the draft without repinning historical campaigns;
7. authorization to deploy/activate; and
8. mail-disabled production smoke evidence for P3, P4, P5, historical, and corrupt-snapshot handling.

Each gate needs its own receipt. A passed local build or approved PR does not imply permission for a later gate.
