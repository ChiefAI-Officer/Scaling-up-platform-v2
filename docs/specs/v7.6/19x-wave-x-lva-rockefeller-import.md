# 19x — Wave X: LVA + Rockefeller Historical Import (closes P1)

**Status: DRAFT — co-validated TWICE (§9 rounds 1+2; round-2 verdict "fit to build" with the mat
rule tightened — now tightened); grills complete; awaiting user build greenlight. No code before
greenlight. ADR-0022 (per-instrument import policy registry: mat gate + completeness policy) to be
written at build time.**
**Wave home:** Wave X. Spec letter follows 19w. Flag family `WAVE_X_ESPERTO_LVA_ROCK_IMPORT_*`.
**Unblocked by:** Jeff's 2026-07-06 sample exports in `From Jeff/APP_scaling up assessemnt/LVA Peer Data/`
(`LVA_Ind_data.json/.xlsx`, `RockInd_data.json/.xlsx`) — Esperto **restricted-individual** exports.
**GITIGNORED, REAL PII — never commit them or derived copies (D12); fixtures are sanitized (structure
intact, identity/values faked).**

> Naming caveat (flag to Jeff, user decides how): the folder says "LVA Peer Data" but contains NO cohort
> peer averages — `processed` is one respondent's own stats. The Wave S peer-numbers ask stays OPEN.

---

## 1. Goal

Coaches and admins can import a company's historical **Leadership Vision Alignment** and **Rockefeller
Habits Checklist** rounds from Esperto restricted-individual exports — the parked Wave O item 4 and the
last Jeff-blocked roadmap phase (P1). Imports reuse the Wave O pipeline end-to-end (roster-first,
recompute-not-store per ADR-0017, imported = CLOSED per ADR-0006, batch/round semantics, idempotency,
quarantine, Wave V alerting, V-3 imported badge). The work is: one plumbing generalization, two
crosswalks, verification + lock, honest-framing UI, launch walk.

## 2. Ground truth (verified 2026-07-06, this session)

### 2.1 The exports
Both files: `{reportid, date, name, tags, mat, cid, mid, raw, processed}` — classify.ts already detects
`restricted-individual` (`mid`+`raw`+`processed`, no `group*` key). Same `mid` (member) on both files;
`mat` differs per file (`AbOTKKmwk2` LVA / `bbEWkOQMMS` Rock) — evidently the assessment/instrument id.
Verify that reading during build; `mat` is top-level metadata, not an answer key (never crosswalked).
- **LVA raw = 71 keys**: `Q1_1` + `Q1a_2..9` (9 financials) · `Q8–Q15` (8 vision TEXTs) · `Q15A/Q15B`
  (empty in sample — identity unknown, likely conditional follow-ups) · `Q16_1..16` (16-factor matrix,
  values 1–3) · `Q16a` (pick-3 obstacles as comma 1-based indices, e.g. `"15,10,9"`) · `Q17_1..16`
  (per-factor why-texts; only the picked factors are non-empty) · `Q18–Q34` + `Q29a` (S5 tail + S6
  focus block) · `currency`.
- **Rockefeller raw = 40 keys**: `Q1_1..Q10_4` (10 sections × 4 sliders), values exactly {1,2,3};
  `processed` carries per-question/section totals+avgs + `overall_total 80 / overall_avg 2 /
  count_achieved 33` — this respondent's own stats = a free known-answer scoring check.

**The xlsx twins (studied cell-by-cell, 2026-07-06):** each is a single-sheet tabular flattening of
the same respondent (header row = Esperto's canonical column order; NO embedded screenshots, NO peer
data — confirming the folder-name caveat). Two findings the JSON alone could not give:
- **LVA's full key universe is WIDER than the JSON**: the header carries **`Q35` and `Q36`** — absent
  from the JSON entirely because this respondent left them empty (the JSON omits empty keys; the empty
  `Q15A/Q15B/Q33/Q17_*` appear only because Esperto emits them as `""` — so omission behavior is
  per-key, another reason exhaustiveness must cover the union). A crosswalk authored from the JSON
  alone would hard-fail the exhaustiveness guard on the first historical respondent who answered
  Q35/Q36. Canonical column order (evidence, not proof, for the tail): `…Q30, Q31, Q32, Q33,
  currency, Q34, Q35, Q36` — note `currency` sits BETWEEN Q33 and Q34.
- **Rockefeller's xlsx = exactly the 40 raw keys + processed columns** — no unknown raw-like keys;
  the JSON's raw set is the complete universe.

### 2.2 Our templates (prod, read-only verified)
- `leadership-vision-alignment` — v1/v2/v3 published; imports pin **v3** (2026-07-02, Wave P). 67
  questions: S1 9×NUMBER, S2 8×TEXT, S3 16×SLIDER_LIKERT **scale {min:1,max:3}** (matches Esperto 1–3
  exactly — NO transform), S4 1×MULTI_CHOICE (`S4_biggest_obstacles`, options = `FACTOR_STABLE_KEYS`,
  maxChoices 3, isRequired false), S5 16×TEXT `S5_why_*` (isRequired false) + 2 TEXTs, S6 1×NUMBER +
  14×TEXT. Degenerate scoringConfig (single "Submitted" tier) — `scoreSubmission` handles it on every
  live submission today; reports render via the qualitative path.
- `RockHabits` — v1/v2 published; imports pin **v2** (2026-06-02). 40 SLIDER_LIKERT, stableKeys are
  **literally `Q{section}_{question}`** — byte-identical to Esperto's raw codes (Esperto's own variant
  is even NAMED "RockHabits" — its Add-Campaign picker screenshot). Seed scale {min:0,max:3} is
  CORRECT fidelity: the source workbook says "Uses a 4 pt scale" with "All 0s"–"All 3s" test cases
  and the form screenshots show a 4-point "Not true"→"Completely true" slider. The sample's {1,2,3}
  values are respondent-specific — **historical exports may legitimately contain 0s** (tests cover
  0). Bonus decode (informational, never asserted): `count_achieved` = count of answers ≥ 2
  (sample: 33 ✓ — "27 of 40 Sections passed" report copy corroborates the counting concept).

### 2.3 Confirmed self-checks in the samples
- **Q16a decode confirmed**: `"15,10,9"` → exactly the non-empty `Q17_15/Q17_10/Q17_9` why-texts.
  Decode rule: comma-split 1-based indices → `FACTOR_STABLE_KEYS[N-1]` = the pinned version's
  `S4_biggest_obstacles` option keys (same order as `Q16_N`/`Q17_N`).
- **Rockefeller known-answer**: recomputing the sample through `scoreSubmission` must reproduce
  Esperto's own per-section totals/avgs and overall (80 / 2.0).
- **LVA completeness**: today's gate derives from `isRequired` (restricted-route-helpers ~L219),
  which for LVA would demand the S2/S6 required TEXTs too — superseded by D9's per-instrument policy
  (LVA core-set = the 16 S3 sliders). The conditional `S5_why_*` are `isRequired:false` and blank-drop
  keeps them unanswered, mirroring LVA's live conditional visibility.

### 2.4 Pipeline facts that shape the design
- `restricted-route-helpers.ts:46` hardcodes `SU_FULL_TEMPLATE_ALIAS = "scaling-up-full"` — the whole
  restricted path is single-instrument today. **The anchor's "no routing change" was wrong.**
- `CrosswalkEntry` is a pure key→key binding (no value transform); `coerceValue` returns a bare string
  for MULTI_CHOICE; **no locked crosswalk contains a MULTI_CHOICE entry** — MC import is net-new.
- Blanks (absent/null/whitespace-only) coerce to `undefined` and are dropped — already correct for the
  empty `Q17_*`/`Q15A/Q15B` values.
- Wave V alerting + quarantine + V-3 imported badge are keyed on route/manifest/externalId, not the
  SU-Full alias — expected instrument-agnostic; **each verified by test, not assumed** (§7).

### 2.5 Downstream-surface facts (grill-me pass, 2026-07-07)
- **Rockefeller group report: deliberately absent, per Jeff.** `wave-f-flags.ts` records Jeff's
  2026-06-18 decision: group report on LVA only, NOT on scored Rockefeller (mockup over-showed).
  Esperto's source folder contains a "Full Team" Rockefeller PDF, so the capability question may
  return after imports — ledgered (§8), not a Wave X gap.
- **Longitudinal:** imported Rockefeller rounds feed per-respondent longitudinal automatically
  (scored + same pinned version, ADR-0016); LVA is qualitative → excluded by design.
- **Imported LVA rounds render the LVA group report** under the live Wave F flag (alias-allowlisted,
  already on) — the walk verifies with Jeff's sample (N=1 → whatever the N-threshold yields is the
  correct behavior, not a defect).
- **No emails, ever, from imports** (Wave O invariant, inherited): no results email, no invitations.
- **Export `name`/`tags` fields are metadata**: identity comes from the roster via `mid`; a test
  asserts `name` never reaches any persisted structure (PII rule).
- **Version pinning across old rounds is safe:** historical rounds import against latest-published
  (LVA v3 / Rock v2); stableKeys are version-stable (ADR-0001; Wave P was reword-class only), so old
  answers render under current labels — the accepted ADR-0001 premise.

## 3. Decisions (user-locked 2026-07-06)

- **D1 — Both instruments in one wave.** The routing generalization is shared plumbing built once;
  Rockefeller's crosswalk is near-identity and comes almost free.
- **D2 — Instrument registry, not parallel routes.** One shared code path;
  `RESTRICTED_INSTRUMENTS: RestrictedInstrument[]` with per-instrument
  `{instrumentKey, batchKind, templateAlias, isEnabled(opts), externalIdPrefix, uiLabel,
  detectShape(rawKeys), knownMats (D8), completeness (D9)}`. The registry is the adapter boundary
  (Codex C5, partial): it owns flag gating, selection key, shape detection, `mat` gate, crosswalk
  lookup, completeness policy, and prefix. Version pinning stays pipeline-generic (latest-published,
  one rule for all) and value coercion stays type-driven (D7) — no instrument needs custom coercion;
  adding either per-instrument today is speculative surface. SU-Full's entry reproduces today's
  constants byte-identically (Wave O flag untouched, same externalId prefix `esperto:sufull:`,
  `knownMats: null` = no gate, required-set completeness); new prefixes `esperto:lva:` /
  `esperto:rockhabits:`.
- **D3 — Explicit instrument selection + shape agreement.** Selection rides the EXISTING versioned
  request mechanism: the registry is keyed by `batchKind` — new values `esperto-lva-restricted-v1` /
  `esperto-rockhabits-restricted-v1` beside the existing `esperto-sufull-restricted-v1` (the route
  zod's refine generalizes to "batchKind ∈ registry"). Stale-client safety comes free: an old client
  can only ever send the SU-Full batchKind. The batch's raw key shape must agree with the selected
  instrument (`Q16a` present → LVA; exactly the 40-key set `Q1_1..Q10_4` and nothing else →
  Rockefeller; `Q11_*`/`Q12_*` or firmographic keys present → SU-Full) or the batch rejects up front
  as wrong-files. NOTE the overlap hazard: Rockefeller's `Q1_1..Q10_4` codes are a subset of
  SU-Full's key space — detectors are set-based, not prefix-based, with explicit cross-instrument
  tests. Detection alone never routes — selection is the intent, detection is the guard.
- **D4 — Controlled Esperto verification submissions gate `locked:true` (Wave O D1 pattern).** One per
  instrument, on our own Esperto account (test campaign, own email, direct session link, NO invite
  mail; every Esperto-side action individually authorized by the user at execution): sliders filled
  with position-encoding values (within-block `row j → value ((j-1) mod 3) + 1` for 1–3 scales — a
  cycling pattern that distinguishes adjacent rows), every TEXT answered with its own unique marker
  string (`XLVA-<qcode-guess>-…`), every NUMBER a distinct value (the 9-key S1 financial block is a
  count-tied positional family — e.g. 11, 22, 33, …), LVA pick-3 = a known index set with known
  why-texts. Export →
  verify EVERY binding → PR-reviewed lock checklist (12a §5b pattern) → flip `locked:true`. **Jeff's
  single-respondent samples alone do NOT lock either crosswalk.**
- **D5 — Launch-walk-as-canary, then global ENABLED.** No Wave-O-style multi-step org canary: the
  pipeline is battle-proven; the new risk is crosswalk correctness, covered by D4 + the walk. The
  `_CANARY` lever still exists in the flag (mirror wave-o-flags) — unused unless needed.
- **D6 — Walk shape: throwaway walk org + synthesized roster.** Jeff's drop has no Members roster;
  `mid` resolution requires one. The walk creates a throwaway org, imports a minimal synthesized
  Members roster carrying the samples' `mid`, imports Jeff's real files as the walk round, verifies
  both report surfaces exactly, then quarantines everything (§5.5 order, rehearsed script pattern).
  First REAL import happens whenever a real roster export exists.
- **D7 — MULTI_CHOICE decode is a typed adapter capability, not a crosswalk transform.** CrosswalkEntry
  stays a pure binding. The adapter's `coerceValue` gains a MULTI_CHOICE branch: comma-split →
  1-based indices → the pinned version's options array (order = authoring order) → `string[]` of
  option keys. Guards: non-integer / out-of-range index → per-respondent error (skip-with-reason, like
  unresolved-member); respect `maxChoices` (over-cap → skip-with-reason, never truncate silently);
  empty string → undefined (unanswered). Generic — any future Esperto MC import reuses it.

- **D8 — `mat` schema-identity gate (Codex C1).** Raw-key shape alone cannot prove the export came
  from the SAME Esperto form version the crosswalk was verified against — Esperto could have revised
  an instrument over the years with the same Q-codes meaning different things. Each new instrument's
  registry entry carries `knownMats: string[]` with a HARD membership rule (Codex R2-1): **a `mat`
  may enter `knownMats` ONLY if the crosswalk was verified against an export bearing that exact
  `mat`** — never "extended" with unverified values, which would defeat the gate. Predeclared
  decision rule on the D4 verification export's `mat` vs Jeff's sample's (`AbOTKKmwk2` LVA,
  `bbEWkOQMMS` Rock): (a) MATCHES → `mat` is per-instrument(-version); `knownMats = [that mat]`, and
  the entry is verified-against-that-mat by construction (the controlled export bears it and the
  sample corroborates). (b) DIFFERS → `mat` is per-campaign/batch-scoped and cannot serve as a
  schema-identity key at all — the gate for that instrument is OFF (`knownMats: null`, finding
  recorded in the lock checklist), and schema drift falls to the remaining tripwires: the shape
  detector, the exhaustiveness guard (any unknown key hard-fails the batch), and the per-type
  value-domain checks. Never treat unverifiable mats as enumerable form versions — that would block
  all legitimate history behind an unenumerable key.
  A batch
  file with an unknown `mat` → hard reject at preview with an explicit message ("unverified Esperto
  form version — needs crosswalk re-verification"); the only override is shipping a registry update
  after verifying that form version. SU-Full keeps `knownMats: null` (no gate — Wave O launched
  without one and stays byte-identical; retrofitting is a ledgered follow-on, not this wave).
- **D9 — Per-instrument completeness policy (Codex C3).** Wave O's completeness gate derives the
  required set from `isRequired` — right for a SCORED instrument (partial scores mislead), wrong to
  inherit blindly for a qualitative one: a historical LVA respondent who skipped one required-in-form
  S6 text would be skipped wholesale despite carrying the full 16-factor matrix, and there is no
  score to mislead. Registry `completeness`: SU-Full unchanged (required-set); Rockefeller
  required-set (fully scored, all 40 required); **LVA core-set = the 16 `S3_*` sliders only** — the
  matrix IS the instrument; missing S2/S6 texts import as unanswered (the report's answered-only rule
  already handles display). Preview still surfaces per-respondent "partial" counts so the coach sees
  what came through.

## 4. Work items

- **X-1 Instrument registry + route generalization.** New
  `esperto-import/restricted-instruments.ts` (registry per D2/D3) + generalize
  `restricted-route-helpers.ts` to take the selected instrument (both import routes, coach + admin).
  Coach route keeps authz parity (`canCreateCampaign` on the resolved template — certification +
  access-group entitlement — preview AND commit, as Wave O built). SU-Full byte-identical: existing
  Wave O tests must pass UNCHANGED; add a registry-equivalence test (SU-Full entry ≡ the old
  constants).
- **X-2 Wave X flag.** `wave-x-flags.ts` → `isEspertoLvaRockImportEnabled({organizationId?})`,
  KILL > ENABLED > CANARY, call-time env reads (mirror wave-o-flags). Gates the LVA + Rockefeller
  registry entries only; SU-Full stays on the Wave O flag.
- **X-3 MULTI_CHOICE decode (D7)** in the restricted adapter + `validateCrosswalkAgainstVersion`
  extension: MULTI_CHOICE entries require the pinned version question to carry `options` (≥1), like
  the SLIDER/scale rule.
- **X-4 LVA crosswalk** (`crosswalks/lva.ts`, ships `locked:false`):
  - `Q1_1` → `S1_revenue`; `Q1a_2..9` → the remaining 8 S1 NUMBERs (positional, per seed order).
  - `Q8–Q15` → `S2_*` 8 TEXTs (positional, xlsx indices 20–27).
  - `Q16_1..16` → `S3_<FACTOR_STABLE_KEYS[N-1]>` sliders (1–3, no transform).
  - `Q16a` → `S4_biggest_obstacles` (MULTI_CHOICE decode, D7).
  - `Q17_1..16` → `S5_why_<FACTOR_STABLE_KEYS[N-1]>`.
  - `Q18` → `S5_other_factor`; `Q19` → `S5_change_one_thing`.
  - `Q20` → `S6_rehire_pct` (NUMBER; sample value 100 confirms); `Q21..Q30` + `Q29a` → S6 in seed
    order: bhag, core_purpose, core_values, market_focus, core_customer, strategy_one_sentence,
    strategy_implementation, goals_clear, priority_org (=Q29), priority_year (=**Q29a**),
    priority_quarter (=Q30).
  - **PROVISIONAL tail (verification-critical family V3):** `Q31` → `S6_constructive_discussions`,
    `Q32` → `S6_add_leadership_position`, `Q34` → `S6_dept_kpis`; `Q33`/`Q35`/`Q36` → droppedKeys
    (Esperto keys with no seed home; all empty/absent in the sample). Semantic evidence: sample Q34 =
    "calls, conversions, mrr" (three KPIs), Q32 = "sales" (position to add), Q31 = "yes, things."
    (yes+explain) — i.e. Esperto's tail numbering does NOT follow the form's display order, which the
    xlsx column order (`…Q33, currency, Q34…`) corroborates as anomalous. **The D4 controlled
    submission settles this map before lock** — we see Esperto's live question order while filling
    it, and unique markers bind every code including Q33/Q35/Q36's prompts.
  - `droppedKeys`: `currency` (S1 context, no seed question), `Q15A`, `Q15B`, `Q33`, **`Q35`, `Q36`**
    (xlsx-header keys with no seed home; identities recorded from the controlled submission — if any
    turns out to be a real question Jeff wants, that is a template-content wave, §8), + any
    `processed.*`/metadata per pipeline rules. Exhaustiveness tests cover BOTH the JSON's 71-key
    sample shape and the xlsx-union 73-key shape (Esperto omits empty keys per-key — the map+dropped
    union, not any single export, is the universe).
- **X-5 Rockefeller crosswalk** (`crosswalks/rockefeller.ts`, ships `locked:false`): identity map
  `Q{s}_{q}` → `Q{s}_{q}` × 40, all SLIDER_LIKERT; `droppedKeys` empty (or metadata only).
  Known-answer test: sample raw through `scoreSubmission` reproduces the `processed` per-section
  totals/avgs and overall_total/overall_avg (`count_achieved` decoded as count-of-answers-≥2 —
  informational only, never asserted). Tests include 0-valued answers (valid on the 4-pt scale,
  absent from the sample).
- **X-6 Import UI honest framing.** Instrument picker lists exactly the enabled instruments
  (flag-aware); roster-first note stays; copy states LVA renders qualitative reports and Rockefeller
  scored ones; "Imported from Esperto (historical)" badge (V-3) applies automatically.
- **X-7 Verification + lock (D4)** → lock-checklist doc per instrument (12a §5b format) PLUS an
  AUTOMATED lock gate (Codex C4): the `locked:true` flip PR must include the sanitized
  controlled-export golden fixture and a CI test that runs it through the full adapter and asserts
  EVERY binding's stableKey+value, every droppedKey, the MC decode, and the resolved disposition of
  Q31–Q34 / Q15A / Q15B / Q33. A crosswalk with `locked:true` and no golden-fixture test fails CI
  (guard test enumerates locked crosswalks and requires a registered fixture). The reviewed checklist
  doc remains, but the fixture test is the wall.
- **X-8 Launch walk (D5/D6)** — see §6.

## 5. Test plan (TDD, jest-verified counts before SoT)

- Registry: SU-Full entry ≡ legacy constants; per-instrument flag gating (LVA/Rock refuse when Wave X
  flag off, even with a locked crosswalk; SU-Full unaffected by Wave X flag); shape detector matrix
  (each sample shape → its instrument; mismatch selection→shape rejects; ambiguous/unknown shape
  rejects; CROSS-INSTRUMENT: a Rockefeller file must fail the SU-Full detector and vice versa —
  the Q-code overlap hazard in D3); route zod accepts exactly the registry's batchKinds and nothing
  else.
- D7 decode: happy path, out-of-range index, non-integer, duplicates, over-maxChoices, empty string;
  `validateCrosswalkAgainstVersion` MC-options rule.
- LVA crosswalk: exhaustiveness against the sample's 71 keys; against-version (pinned v3) type/scale
  pass; blank why-texts dropped; Q16a↔Q17 consistency check (imported file whose non-empty Q17s
  disagree with Q16a → per-respondent warning, import proceeds — the answers are still the answers).
- Rockefeller: exhaustiveness (40 keys); known-answer scoring parity vs `processed`.
- PII: export `name` never reaches any persisted structure (plan, manifest, campaign, submission).
- Both: `locked:false` → import refused (extend the existing stub-refusal test to assert the NEW
  failure mode is flag+lock, not missing-crosswalk); idempotency/409/append semantics inherited from
  Wave O tests parameterized over the new prefixes.
- Ops carry-over verified: alert signals fire from both routes for the new instruments; quarantine
  script targets by externalId prefix; imported badge renders (manifest-based, instrument-agnostic).
- SU-Full regression: entire existing Wave O suite green UNCHANGED.

## 6. Launch plan (same-session on "go", every prod mutation individually authorized)

0. **Build order: registry + Rockefeller first, LVA second (Codex C6).** The near-identity,
   known-answer-checkable crosswalk proves the plumbing before the positional-heavy one. Locks are
   per-crosswalk (`crosswalk-locked` plan refusal): the flag can flip once and each instrument goes
   live when ITS crosswalk locks — "both in one wave" never requires both to enable in the same
   moment.
1. **D4 verification submissions run IN PARALLEL with the build (user-chosen 2026-07-07,
   verification-first):** the user takes both Esperto assessments per the run-sheet
   (`19x-esperto-verification-runsheet.md` — self-documenting marker answers, designed slider
   patterns, pick-3 = visual positions 1/10/16) while the build proceeds. Exports land before the
   crosswalk work completes → V3 (Q31–Q34 tail) + Q33/Q35/Q36/Q15A/Q15B identities resolve DURING
   the build → the crosswalks CAN lock in the wave PR itself (golden fixtures from the controlled
   exports; C4 gate satisfied in-PR). **Structural independence (Codex R2-3): the DEFAULT posture is
   merge dark with `locked:false`; a crosswalk locks in-PR ONLY if its golden fixture passes AND the
   D8 exact-`mat` rule is resolved clean at PR time — the lock gate never becomes ceremony under
   schedule pressure; a follow-up lock PR is the normal path, not a failure.** One LVA submission
   suffices: the form shows why-boxes only for the 3 picks, and the Q16a↔Q17 correlation invariant +
   marker answers prove the family binding structurally.
2. Merge → PR → main (dark: flag unset; crosswalks locked iff step 1 completed in time).
3. **Walk (D6):** throwaway org + synthesized roster (samples' `mid`) → import Jeff's real LVA + Rock
   files as one round each → verify: respondent reports exact (LVA qualitative incl. obstacles +
   why-texts; Rock scored, totals hand-checked vs `processed`), imported badge on covers +
   CampaignDetail, alert signal rows written, idempotent re-import no-op, divergent re-import 409.
   **Rejection evidence BEFORE the flag flip (Codex R2-2):** the walk must also demonstrate live —
   (a) unknown-`mat` file → preview reject (if the gate is active), (b) wrong-shape file (e.g. the
   Rock file under the LVA batchKind) → preview reject, (c) a file whose `mid` is not in the roster →
   skip surfaced in preview with reason, zero writes for that respondent. Then quarantine everything
   (§5.5 order) → post-quarantine smoke.
4. Flip `WAVE_X_ESPERTO_LVA_ROCK_IMPORT_ENABLED=1` (authorized) + redeploy NEWEST deployment → prod
   smoke (import UI shows the instruments; SU-Full path unchanged; a real LVA report unchanged).
5. **First-real-import watch (Codex C2, partial take):** the first genuine customer import (real
   roster + real round) runs with active observation — Wave V alerting is live (admin email within
   ~10 min) and the quarantine script is the rollback. The `_CANARY` lever stays available if early
   real imports argue for an allowlist pause.
6. SoT: CLAUDE.md anchor + CHANGELOG + memory + Notion task; spec status → LAUNCHED with evidence.

## 7. Kill / rollback

- LVA/Rock imports: zero the Wave X flag + redeploy (SU-Full unaffected). Registry refactor is
  non-killable hardening — kill = revert-commit.
- Bad batch: the Wave O quarantine-by-externalId script (rehearsed) — verify it takes the new
  prefixes; extend if prefix-hardcoded.

## 8. Out of scope / ledger

- LVA peer averages (Wave S ask — still open with Jeff; folder name mismatch to be flagged).
- Q33 / Q35 / Q36 / Q15A / Q15B as seed questions — if the controlled submission reveals real
  questions Jeff wants, that's a template-content wave, not import.
- Esperto `restricted-aggregate` files for these instruments — preview warning + commit
  `skippedArtifacts`, never written (Wave O rule, unchanged).
- Group-report enablement questions for imported LVA rounds (alias allowlist + N-thresholds) — reports
  render by existing rules; no new report code in this wave.
- **Rockefeller group/team report** — Jeff's 2026-06-18 decision excluded it deliberately
  (wave-f-flags.ts); Esperto had a "Full Team" PDF, so if Jeff asks post-import, it's a NEW feature
  wave with that decision to revisit, not a Wave X omission.

## 9. /co-validate changelog (Codex review 2026-07-06, threadId 019f3808-7baf-73e2-9766-07913ff02acf)

- **C1 (`mat` schema-identity gate) — ACCEPTED** → D8. Genuine gap: shape detection can't prove the
  historical form version matches the verified one. Modified from Codex's "quarantine": unknown `mat`
  hard-rejects at PREVIEW (nothing written yet — quarantine is for persisted data); SU-Full keeps no
  gate (byte-identical Wave O behavior; retrofit ledgered).
- **C2 (canary too weak; hold global until a real roster-backed allowlisted import) — OVERRIDDEN
  (user-locked decision, this session).** The rollout choice (launch-walk-then-global vs full canary
  ramp) was put to the user explicitly and decided. Risk delta argued: roster ingestion,
  multi-respondent batching, org permissions, idempotency are instrument-agnostic and Wave-O-proven on
  real orgs; the NEW risk is crosswalk correctness, which D4 + C4's golden-fixture gate + the walk
  cover. Holding global until a real customer import exists is also circular (no coach can produce one
  while the feature is dark). Partial take → §6.5 first-real-import watch + the retained `_CANARY`
  lever.
- **C3 (per-instrument completeness policy) — ACCEPTED** → D9. The sharpest finding: inheriting
  SU-Full's required-set semantics would skip qualitative LVA respondents over blank texts despite a
  complete factor matrix, with no misleading-score rationale.
- **C4 (automated lock gate) — ACCEPTED** → X-7. `locked:true` is CI-gated on a golden
  controlled-export fixture test, not just the reviewed checklist doc.
- **C5 (registry as full adapter boundary) — PARTIAL** → D2. Registry owns flag/selection/detection/
  mat-gate/crosswalk/completeness/prefix. Version pinning and value coercion stay generic — no
  instrument needs them customized; adding the surface now is speculative (YAGNI).
- **C6 (Rockefeller-first sequencing; decouple enablement from dual-lock) — ACCEPTED** → §6.0.
  Free by construction: locks are per-crosswalk at the plan layer.
- **Own-review findings folded in pre-Codex:** batchKind-keyed selection (stale-client safety free),
  Rockefeller/SU-Full Q-code overlap detector tests, `count_achieved` never asserted.

### Round 2 (post-revision re-review, same thread, 2026-07-07)
- **R2-1 (`mat` "extend" path unsafe) — ACCEPTED** → D8 hard membership rule: `knownMats` may only
  contain mats the crosswalk was verified against; the mismatch case relies on the remaining schema
  tripwires (shape detector, exhaustiveness hard-fail, value domains) instead of an unenumerable key.
- **R2-2 (C2 override conditional on rejection evidence) — ACCEPTED** → §6.3 walk must demonstrate
  unknown-mat reject, wrong-shape reject, and unresolved-roster skip live, before the flag flip.
- **R2-3 (don't force lock in-PR) — ACCEPTED** → §6.1 default posture is merge dark; in-PR lock only
  when fixture + exact-mat proof are already clean. Codex verdict: "with the mat equivalence rule
  tightened, this is fit to build."
- **R2-4 (stale §8 Rockefeller-scale ledger item) — ACCEPTED** → deleted (resolved by the source
  workbook study).

- **User-prompted full-drop study (post-Codex):** cell-by-cell read of BOTH xlsx twins (tabs, media,
  headers, data rows) caught `Q35`/`Q36` — LVA keys invisible in the JSON — plus Esperto's canonical
  column order and per-key empty-omission behavior. Folded into §2.1, X-4, V3. (No screenshots and no
  peer data inside — folder-name caveat stands.) Extended to the SOURCE workbooks: `Rockerfeller
  questions.xlsx` (5 tabs incl. `screen shots`, 18 images — strings + screenshots read) corrected a
  spec error (the 0–3 scale IS Esperto-faithful; the "1–3 fidelity gap" ledger note was wrong and is
  removed) and decoded `count_achieved`; the LVA source workbook's question strings resolved the S6
  display order (its full fidelity audit lives in spec 18).
