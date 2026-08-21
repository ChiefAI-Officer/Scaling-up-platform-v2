# Scaling Up Full Frozen Phase Peers — Architecture Design

**Date:** 2026-08-21

**Status:** Approved direction; written review pending; implementation not started

**Scope:** Scaling Up Full assessment only

**Deployment state:** Evidence-backed proposal; not deployed or available for live-product testing

## 1. Purpose

Make the Scaling Up Full **Peers** comparison truthful, phase-aware, reproducible,
and distinct from personalized Feedback.

For every newly scored result on the new governed template version, the platform
must:

1. select one governed peer value per scored question using the same organizational
   phase already frozen for phase-aware Feedback;
2. freeze all selected peer values and their catalogue provenance into the score
   result;
3. render Peers from that frozen result without consulting mutable benchmark rows;
4. retain the existing baseline meaning for historical results without rewriting,
   backfilling, or repinning them; and
5. fail closed when a phase-aware peer catalogue or frozen snapshot is incomplete.

## 2. Evidence truth

The complete five-phase Esperto evidence contains 55 reports and 3,355 governed
question rows: five phases × scores 0–10 × 61 questions.

- Within a phase, the peer vector is invariant across scores 0–10.
- P1, P2, P3, and P5 share one baseline vector.
- P4 uses a distinct delegation-phase vector.
- P3 → P4 changes 56 of 61 question values.
- P4 → P5 changes the same 56 values back to the baseline vector.
- Q27, Q30, Q38, Q41, and Q57 are unchanged across that boundary.
- Q01 is 6.3 in the baseline vector and 6.6 in P4.
- Six mail-disabled boundary reports independently confirmed the phase mapping at
  headcounts 8, 9, 25, 26, 150, and 151.

The governing evidence and checksums are recorded in:

- `docs/research/esperto-peer-vector-five-phase-csv-audit-2026-08-21.md`
- `docs/research/esperto-peer-vector-boundary-report-manifest-2026-08-21.csv`
- `docs/research/esperto-feedback-five-phase-full-matrix-2026-08-20.csv`
- `docs/research/esperto-peer-benchmark-sources.md`

The evidence proves a **phase-selected governed reference**. It does not prove an
industry-, geography-, campaign-, or cohort-matched benchmark.

## 3. Decisions

### D1 — Peers and Feedback remain separate concepts

Feedback is phase-and-score-specific authored guidance. Peers is a governed numeric
reference vector selected by phase. A respondent's score changes Feedback selection
inside a phase, but it does not change that phase's peer vector.

### D2 — Keep the phase mapping explicit even when payloads deduplicate

The template version must explicitly declare entries for P1, P2, P3, P4, and P5.
P1/P2/P3/P5 may reference one shared baseline payload and P4 may reference one shared
delegation payload, but the five phase assignments must not be inferred from a
default or fallback.

This prevents a missing P4 mapping from silently becoming baseline and preserves the
observed P4 → P5 return.

### D3 — The immutable template version owns the phase catalogue

For the new governed version, phase peer data lives with question content in
`AssessmentTemplateVersion.questions` JSON, alongside the existing
`phaseRecommendations` data. This is the authoritative scoring input.

The implementation must not add a new mutable database snapshot subsystem. Version
JSON already supplies the required immutable content boundary and content hash.

### D4 — Scoring freezes values and provenance

The scorer selects the exact phase entry after the organizational phase is resolved.
It freezes:

- each question's selected peer value in `result.perQuestion`;
- the selected phase;
- a stable source/catalogue identifier; and
- a deterministic content hash for the peer snapshot.

The report renderer reads only this frozen data for new phase-aware results. It must
not re-resolve the current phase or query `AssessmentBenchmark` for those results.

### D5 — Historical results retain legacy baseline semantics without mutation

Existing results and pinned campaigns are not rewritten or repinned. Historical
Scaling Up Full results that lack a frozen phase-peer snapshot render against the
executable 2026-08-14 legacy baseline constant.

This freezes the meaning already supplied by the current seeded vector while avoiding
a historical backfill. It does not upgrade an old result to the new phase-aware
catalogue.

### D6 — Retire mutable benchmark rows from the Scaling Up Full render path

For Scaling Up Full only, `AssessmentBenchmark` question rows cease to be a render-time
source of truth. The new frozen path and the legacy executable fallback replace that
lookup.

LVA and other assessment types retain their existing benchmark behavior. Admin peer
editing must not imply that editing a mutable row can alter a governed Scaling Up Full
report. Any Scaling Up Full editor surface for these rows must be removed, disabled,
or explicitly identified as legacy-only before activation.

This decision supersedes the Scaling Up Full portions of D5/D6 and the “current
reference” render-time behavior in
`2026-08-17-su-full-individual-peer-comparison-design.md`. It does not supersede LVA
behavior.

### D7 — Completeness is enforced at authoring, scoring, and rendering boundaries

A phase-aware catalogue is valid only if:

- all five phases appear exactly once;
- all 61 governed slider keys appear exactly once in every resolved phase vector;
- every value is finite and inside the permitted score scale;
- shared payload references resolve;
- the deterministic catalogue/content hash matches; and
- the selected scoring phase has an exact entry.

Publish validation and scoring reject an incomplete catalogue. Rendering a result that
declares a frozen snapshot but has missing/corrupt peer values must omit the Peers
enhancement and emit a structured diagnostic; it must never query mutable rows or
substitute the baseline.

### D8 — The report disclosure states what is actually matched

The report should say:

> Peers are a governed benchmark snapshot selected by organizational phase and frozen
> when this result was scored. This is not an industry-, geography-, or cohort-matched
> comparison.

The display may additionally show a concise source date or catalogue edition. It must
not claim a level of peer matching the evidence does not establish.

### D9 — Ship as one forward-only governed edition

Extend the existing dark phase-feedback edition lifecycle so the next immutable
Scaling Up Full version contains both:

- five-phase Feedback; and
- five-phase Peers.

Do not create competing drafts that separately own the two phase-aware features. The
lifecycle must clone the active version, attach both catalogues, recompute the content
hash, and preserve existing campaign pins.

Creation, publication, deployment, feature activation, and production verification
remain separate approval gates. This design does not authorize any of them.

### D10 — No production or communications side effects during design closeout

The local visual guide and this design document are review artifacts only. Do not
push, create a PR, deploy, activate flags, mutate Platform Production, or send external
mail/Slack from this stage.

## 4. Planned data contract

Names may be refined during the implementation plan, but the ownership and invariants
are fixed by this design.

```ts
type PhasePeerBenchmark = {
  phase: GrowthPhaseNumber;
  value: number;
};

type GovernedSliderQuestion = {
  stableKey: string;
  phaseRecommendations?: GrowthPhaseRecommendation[];
  phasePeerBenchmarks?: PhasePeerBenchmark[];
};

type FrozenPeerBenchmarkSnapshot = {
  sourceId: string;
  contentHash: string;
  phase: GrowthPhaseNumber;
};

type PerQuestionResult = {
  // existing fields omitted
  peerValue?: number;
};

type ScoreResult = {
  // existing fields omitted
  recommendationPhase?: GrowthPhaseNumber;
  peerBenchmarkSnapshot?: FrozenPeerBenchmarkSnapshot;
};
```

For compact storage, a version-building utility may deduplicate the two unique vectors
internally. The validated question schema must still present one exact value for every
phase and question to scoring; runtime code must not infer phase equivalence.

## 5. Data flow

### New phase-aware results

1. The immutable version supplies phase-aware Feedback and Peers.
2. The existing phase resolver selects and freezes `recommendationPhase`.
3. Scoring resolves the exact `phasePeerBenchmarks` row for each scored slider.
4. Scoring freezes `peerValue` per question plus snapshot provenance at result level.
5. Submit persists the score result as one immutable unit.
6. Report construction joins frozen respondent values with frozen peer values.
7. PDF and on-screen views render the same frozen presentation.

### Historical results

1. The stored result has no `peerBenchmarkSnapshot` and no frozen `peerValue` fields.
2. The Scaling Up Full resolver identifies it as legacy.
3. The report uses the executable 2026-08-14 baseline vector by stable key.
4. No stored row, version pin, or historical result is changed.

## 6. Planned code map

| Area | Planned responsibility |
| --- | --- |
| `src/src/lib/assessments/su-full-phase-peer-catalogue.ts` | Generated governed catalogue, phase mapping, source ID, and hashes |
| `src/scripts/` catalogue generator/validator | Deterministically produce the TypeScript catalogue from the committed audited CSV |
| `src/src/lib/assessments/scoring.ts` | Validate phase peer rows; select exact phase; freeze values and provenance |
| `src/src/lib/assessments/compute-score-result.ts` | Pass the already resolved phase through the scoring boundary |
| Assessment submit route | Persist the complete score result atomically; preserve duplicate-submit defenses |
| `src/src/lib/assessments/su-full-phase-feedback-edition.ts` | Extend the forward-only edition builder to attach Feedback and Peers together |
| `src/src/lib/assessments/su-full-question-benchmarks.ts` | Become the explicit legacy baseline, with stale “phase invariant” claims removed |
| `src/src/lib/assessments/su-full-peer-presentation.ts` | Build from frozen per-question peers; use legacy baseline only for genuinely old results |
| `src/src/lib/assessments/peer-report-resolver.ts` | Bypass database benchmark lookup for Scaling Up Full; leave LVA unchanged |
| Scaling Up Full report components | Render the precise phase-snapshot disclosure and omit invalid peer enhancements safely |
| Tests and fixtures | Prove all phases, boundaries, hashes, legacy immutability, tamper behavior, and PDF parity |

The exact submit-route and component paths must be resolved and pinned in the
implementation plan before code changes.

## 7. Failure handling and observability

Use stable machine-readable reason codes at the relevant boundaries, including:

- `SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE`
- `SU_FULL_PHASE_PEERS_PHASE_MISSING`
- `SU_FULL_PHASE_PEERS_HASH_MISMATCH`
- `SU_FULL_PHASE_PEERS_RESULT_INCOMPLETE`
- `SU_FULL_PHASE_PEERS_LEGACY_FALLBACK`

Authoring/publish and scoring errors are hard failures. A render-time inconsistency is
a soft presentation failure: preserve the underlying report, omit Peers, surface a
generic user-safe message if needed, and record the detailed reason server-side.

Never log answers, respondent identity, or the complete score result merely to report
a catalogue integrity error.

## 8. Verification contract

### Catalogue tests

- exactly five phase mappings;
- exactly 61 governed keys per phase;
- P1/P2/P3/P5 fingerprints equal the audited baseline fingerprint;
- P4 equals the audited delegation fingerprint;
- 56 P3 → P4 changes and exactly five unchanged keys;
- 56 P4 → P5 reversions;
- peer vectors remain invariant across scores 0–10 in the source matrix;
- generated artefacts are deterministic and clean under regeneration.

### Scoring and persistence tests

- each P1–P5 result freezes the exact audited vector;
- two different scores in the same phase freeze identical peers but may select different
  Feedback;
- the same score at P3 and P4 freezes different Feedback and different peer values;
- P5 returns to baseline;
- missing, duplicate, invalid, or hash-mismatched catalogue data fails closed;
- stored phase and snapshot provenance survive serialization/revival;
- duplicate submission protection remains intact.

### Rendering and compatibility tests

- renderers never query `AssessmentBenchmark` for a phase-aware Scaling Up Full result;
- tampering with mutable benchmark rows cannot alter a new frozen report;
- historical results render the legacy baseline without any data mutation;
- an incomplete declared frozen snapshot omits Peers rather than substituting data;
- on-screen and PDF peer values/disclosures agree;
- the 26-page report shape remains stable;
- LVA benchmark behavior remains unchanged.

### Release gates

Before any code push: targeted tests, changed-file ESLint, migration safety, and
`CI=true npx next build --turbopack`. Before activation: approved visual review,
independent code/spec review, explicit publish/deploy/activation authorization, and a
production smoke plan with mail-disabled evidence accounts.

## 9. Non-goals

- Reconstructing a live cohort from platform submissions.
- Matching by industry, geography, company identity, coach, or campaign.
- Rewriting or repinning historical results.
- Changing LVA peer benchmark semantics.
- Building a general benchmark-snapshot database subsystem.
- Publishing, deploying, activating, or conducting live-product testing in this design
  stage.
