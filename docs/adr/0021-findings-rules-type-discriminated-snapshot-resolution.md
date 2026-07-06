# ADR-0021 — Findings rules: type-discriminated shape on `recommendations[]`, snapshot-at-scoring resolution

**Status:** Proposed (Wave U, spec 19u) — becomes Accepted when Wave U merges.
**Date:** 2026-07-05
**Context owner:** assessment module (Esperto replacement)

## Context

Jeff's July-1 item #11 asks for "logic to present findings from an assessment — drive report content or recommendations based on respondent answers." The platform already had exactly one findings mechanism: `recommendations[]` score bands on `SLIDER_LIKERT` questions (`{minScore, maxScore, text}`), resolved **at scoring time** into the frozen `ScoreResult` and rendered in scored reports — 305 live Esperto-verbatim bands on SU-Full, authorable only via a seed script. Qualitative templates (LVA/QSP — most of Jeff's usage) had no findings path, and NUMBER/MULTI_CHOICE questions (newly authorable since Wave T / ADR-0020) had no rule shape at all.

Two decisions needed durable recording.

## Decision 1 — the question's type discriminates the rule shape

`recommendations[]` stays the single findings field, but its item shape is owned by the per-type question schema:

- `SLIDER_LIKERT` and `NUMBER`: **bands** `{minScore, maxScore, text}`. Sliders keep the publish-time full-tiling requirement (contiguous coverage of the scale); NUMBER bands need only be non-overlapping — the domain is unbounded, so gaps are legal and an unmatched value simply produces no finding.
- `MULTI_CHOICE`: **option rules** `{optionKey, text}` — each *selected* option with a rule contributes its finding (per-option, no combination matching). `optionKey` must exist on the question at publish.
- `TEXT`: no rules (free text cannot be conditioned on).

There is **no `kind` field**. A question has exactly one type, the type is locked once published (ADR-0020), so the shape can never be ambiguous — and the 305 already-published SU-Full band objects validate unchanged, with zero migration.

Rejected alternatives: a sibling `findings[]` field (two overlapping concepts, unclear migration for existing bands); an explicit `kind` discriminator (a second source of truth that can contradict the question type and needs cross-validation anyway).

## Decision 2 — uniform snapshot-at-scoring, with a back-compat duality for sliders

All rule kinds resolve **at scoring time**: `scoreSubmission` runs the pure `resolveFindings(questions, answersByKey)` (`lib/assessments/findings.ts`) **unconditionally** for every submission — every template kind persists a frozen `result` (qualitative templates score to a neutral tier, ADR-0002) — and freezes the output as `result.findings: ResolvedFinding[]` (empty when the version has no rules). The Wave U feature flag gates authoring and rendering only, never the snapshot write (flags gate capability, not data correctness).

Two deliberate consequences:

- **Slider duality.** The legacy per-row `row.recommendation` keeps being written and remains what scored reports render for sliders (existing SU-Full submissions predate `result.findings` and must render unchanged). Renderers select to avoid double-display: scored reports take sliders from `row.recommendation` and non-sliders from `result.findings`; qualitative reports take all kinds from `result.findings`.
- **No retroactivity, ever.** A finding a respondent's report showed is frozen with the submission. Later resolver fixes, rule edits (only reachable via a new published version anyway), or flag flips cannot rewrite already-issued reports — a flag kill merely hides the findings sections while the snapshots persist inert.

This direction came out of co-validation (Codex): the spec's first draft resolved non-slider findings at render time, which would have required expanding the report-loader/`QuestionMeta` contract (which deliberately strips `recommendations`) and made issued reports drift under flag changes. Snapshot-at-scoring matches the existing slider precedent instead.

Rejected alternatives: render-time resolution (drift + contract expansion, above); unifying by moving sliders to render time too (changes live SU-Full behavior; breaks the frozen-result stance ADR-0016 relies on).

## Consequences

- Findings reach reports only through a **newly published version** (versions pin) — existing campaigns never change, matching every content change since Wave P.
- Rule text is **reword-class** (editable on inherited questions in a draft; no identity, crosswalk, trends, or benchmark impact).
- "Recompute findings for old submissions" is not a feature this design permits for any rule kind — frozen findings are immutable history by design (a deliberate property, not a limitation to engineer around).
- Validation strictness ladder: draft save = shape-only; publish = strict (tiling / non-overlap / optionKey-exists / sentinel rejection); runtime = lenient (skip, never throw).
- Rendering: individual reports only (scored: merged into "What to work on next"; qualitative: a consolidated findings section). Group reports and the results emails are untouched; the qualitative email's byte-identical guard (Wave S) stays in force.

## Pointers

Spec `docs/specs/v7.6/19u-wave-u-findings-logic-design.md` · engine `lib/assessments/scoring.ts` + `lib/assessments/findings.ts` · related ADR-0001 (stableKey continuity), ADR-0016 (frozen results), ADR-0019 (peer benchmarks), ADR-0020 (question identity locks).
