# ADR-0022 — Restricted historical import: per-instrument policy registry (batchKind selection, `mat` schema-identity gate, completeness policy)

**Status:** Accepted (Wave X, spec 19x).
**Date:** 2026-07-07
**Context owner:** assessment module (Esperto replacement)

## Context

Wave O built the restricted-individual historical import for exactly one instrument (SU-Full): the
route helpers hardcoded the template alias, the request schema hardcoded one `batchKind` literal, and
the per-respondent completeness gate derived its key set from `isRequired` — correct for a scored
instrument where partial scores mislead. Wave X adds LVA and Rockefeller, which forced three durable
decisions about how instruments differ:

1. **Selection.** How does a batch declare which instrument it is, safely across client versions —
   and how do we catch a wrong file, given 32 of Rockefeller's 40 raw Q-codes are also SU-Full codes?
2. **Schema identity.** A crosswalk binds Q-codes positionally against ONE form version. Raw-key
   shape cannot prove a historical export came from the form version the crosswalk was verified
   against (Esperto could have revised an instrument with the same codes meaning different things).
3. **Completeness.** Inheriting SU-Full's required-set gate would skip a qualitative LVA respondent
   wholesale over one blank required TEXT despite a complete 16-factor matrix — with no
   misleading-score rationale, historical data would be silently lost.

## Decision — one registry record per instrument (`restricted-instruments.ts`)

`RESTRICTED_INSTRUMENTS` is the adapter boundary. Each record owns:

- **`batchKind` (selection).** The request's versioned selector — the route zod accepts exactly the
  registry's batchKinds. A stale client can only ever send the SU-Full batchKind, so stale-safety is
  free. Selection is the *intent*; **shape detection is the guard**: an export's answer keys must be
  a subset of the instrument's key universe (crosswalk `map ∪ droppedKeys` — Esperto's JSON omits
  empty keys per-key, so subset, never equality) AND contain ≥1 key *distinctive* to that instrument
  (universe minus the other instruments' universes — both sets data-derived from the crosswalks, so
  they can never drift from the mappings). Detection alone never routes. SU-Full's entry is
  `shapeChecked: false`: Wave O shipped without the anchor requirement, its exhaustiveness guard
  already hard-fails foreign keys, and enforcing anchors retroactively could turn a legitimate
  partial file's per-respondent skip into a whole-batch block.
- **`knownMats` (schema-identity gate).** The export's `mat` field identifies the Esperto
  assessment. HARD membership rule: a `mat` enters `knownMats` ONLY if the crosswalk was verified
  against an export bearing that exact `mat` — never extended with unverified values, which would
  defeat the gate. `null` = no gate. Predeclared fallback: if the controlled verification export's
  `mat` differs from the historical sample's, `mat` is per-campaign/batch-scoped (unenumerable) and
  cannot key schema identity — the gate stays off for that instrument and schema drift falls to the
  remaining tripwires (shape detector, exhaustiveness hard-fail, per-type value domains). SU-Full
  keeps `knownMats: null` (Wave O byte-identity; retrofit is a ledgered follow-on).
- **`completeness` policy.** `"required-set"` (SU-Full, Rockefeller — scored; the `isRequired`
  filter, exactly Wave O's behavior) vs `"slider-core-set"` (LVA — qualitative; the SLIDER_LIKERT
  questions only: the 16-factor matrix IS the instrument, blank texts import as unanswered and the
  reports' answered-only rule handles display).
- **Flag gating.** SU-Full stays on the independent Wave O flag; LVA + Rockefeller share the Wave X
  flag (`WAVE_X_ESPERTO_LVA_ROCK_IMPORT_*`). Killing one wave never touches the other's instruments.
  Per-instrument go-live additionally decouples from the flag via the per-crosswalk `locked` gate
  (`crosswalk-locked` plan refusal): one flag flip, each instrument goes live when ITS crosswalk
  locks.
- **`externalIdPrefix`.** Campaign idempotency namespace: `esperto:sufull:` / `esperto:lva:` /
  `esperto:rockhabits:` `<cid>:<roundLabelSlug>`. The by-externalId quarantine script is
  prefix-agnostic by construction.
- **Optional per-instrument consistency probe** (warn-only, never blocks): LVA's Q16a↔Q17
  correlation check.

**Deliberately NOT per-instrument** (Codex C5, partial): version pinning (latest-published, one rule
for all) and value coercion (type-driven; the Wave X MULTI_CHOICE index decode is a TYPE capability
— comma-separated 1-based indices into the pinned version's option order — reusable by any future
MC-bearing instrument, not an LVA special case).

## Consequences

- Adding a fourth instrument = one crosswalk + one registry record + a UI option; no route surgery.
- The wrong-file failure mode (LVA file uploaded under the Rockefeller selection, or vice versa) is
  a whole-batch 400 at preview with a named reason — nothing written, ever.
- An unverified Esperto form revision cannot silently import through a stale crosswalk once that
  instrument's `mat` gate is armed; where `mat` proves unusable, the exhaustiveness guard remains
  the hard stop for shape drift (any unknown key blocks the batch).
- LVA respondents with a complete factor matrix but blank texts import (qualitative data preserved);
  scored instruments keep the strict gate (no partial scores). The two policies are explicit,
  named, and per-instrument — future instruments must choose one consciously.
- SU-Full behavior is byte-identical by construction (its registry entry reproduces the Wave O
  constants; the entire Wave O test suite passes unchanged), so this refactor is non-killable
  hardening — kill = revert-commit, per the Wave Q flag rule (flags gate capability, never
  persisted-data correctness).

## Alternatives rejected

- **Parallel per-instrument route helpers** — 3× the code, three places to fix pipeline bugs.
- **Blind auto-detection routing (no explicit selection)** — the Rockefeller⊂SU-Full code overlap
  makes ambiguity real; intent must come from the operator.
- **Treating unverifiable `mat`s as enumerable form versions** — would block all legitimate history
  behind an unenumerable key.
- **One shared completeness rule** — either loses qualitative history (required-set for LVA) or
  weakens scored-import integrity (core-set for SU-Full/Rockefeller).
