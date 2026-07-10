# Spec 19ac — Assessment Editor Overhaul · Wave 1: Test Mode

> **Status:** DRAFT — grilled & hardened 2026-07-09 (`/grill-with-docs`); awaiting final user review before `writing-plans`.
> **Date:** 2026-07-09 · **Author:** design track (research → Approach A → /co-validated re-sequenced plan → grill).
> **Gate:** this is a GATED wave. Grill + brainstorm + /co-validate are DONE; this spec + an implementation
> plan + user approval complete the gate. **Nothing is built yet.**

> **Grill outcome (2026-07-09), code-verified — 8 decisions locked:**
> 1. **Fidelity contract = convenience + honesty guards.** Use `scoreSubmission`'s `allowMissingRequired: true`
>    (it exists — `scoring.ts:1324`), so partial answers score. The real submit route passes NO such option
>    (`submit/route.ts:418`), so the invariant is **"identical result for *complete* answer sets"**; the drawer
>    surfaces the unanswered-required count so the author is never misled about what production would accept.
> 2. **Operates on the LIVE in-memory draft**, assembled by a NEW shared pure helper
>    `assembleDraftVersionForScoring(editorState) → {questions, sections, scoringConfig}` that forces
>    `questionsDirty/sectionsDirty:true` and reuses the existing `buildQuestionsPayload`/`buildSectionsPayload`
>    (the scoring schema needs exactly those three fields — `scoring.ts:543`). This is the birthplace of the
>    "assemble a full version from editor state" seam that Wave 2 (checklist) and Wave 3 (extraction) reuse.
> 3. **Error surface = the three scoring-side failures only** — `QuestionSerializationError`, scoring-schema
>    parse (`checkRecommendationsRuntime`/`checkScaleUpScoreOptIn`), and `scoreSubmission` runtime throws
>    (`assertTierTiling` `INVALID_SCORING_CONFIG`, `UNKNOWN_STABLE_KEY`). Rendered as a "Can't test yet — fix
>    these" list. **Publish-readiness (the stricter publish schema) is Wave 2** — Test Mode's gate = the
>    *scoring* gate, not the publish gate. Clean subset/superset boundary.
> 4. **Runs 100% client-side (verified pure).** The whole pipeline — `scoring.ts`, `findings.ts`,
>    `section-pages.ts`, `answer-limits.ts`, `form-visibility.ts` — has zero server-only/`db` imports. No new
>    endpoint, no auth surface, structurally zero write path. Flag-gated, default-OFF, single lever
>    `WAVE_ED1_TEST_MODE_ENABLED` (no data persists behind it → no KILL/CANARY needed; kill = flag off).
> 5. **Output surface** = tier + tier message, the driving metric value, ScaleUp Score + per-domain (when
>    present), per-section averages, fired `result.findings`, and the unanswered-required count. **NOT** shown:
>    `perQuestion` detail (redundant) and the **full branded report render** (deferred — `getRespondentReport`
>    is DB-bound; needs the pure-assembler extraction, a tracked follow-on).
> 6. **Display is driven by `reportConfigFor(templateAlias)`** — the SAME dispatch the real reports use
>    (`report-config.ts:65`). It honors `reportType`/`showTier`/`showScoreTable` per-instrument (SU-Full scored,
>    LVA/QSP qualitative, new template → `DEFAULT_REPORT_CONFIG` = scored). Findings ALWAYS shown. No heuristic;
>    Test Mode's display can't diverge from the real report, and it sidesteps the ADR-0002 neutral-tier trap.
> 7. **"No second code path" proof = replicate now, extract in Wave 3.** Test Mode reuses the same shared
>    `pruneHiddenAnswers` + `scoreSubmission` in the same 2-step sequence — it does **NOT** touch the production
>    submit route (that contradicts the write-nothing mandate); the formal `computeScoreResult` unification is
>    Wave 3's job. Locked by a two-part parity test: **(a) assembly parity** (`assembleDraftVersionForScoring`
>    deep-equals the save-path payload) + **(b) scoring parity** (complete answers → Test Mode result deep-equals
>    a direct `scoreSubmission` on the persisted-equivalent version).
> 8. **UI = a drawer** from a "Test Mode" toolbar button (a route would lose the unsaved draft; no layout
>    change to the tabbed editor), rendering a **flat single-scroll list** of currently-visible questions via the
>    real `QuestionInput` widget (NOT the section pager — input presentation doesn't affect `ScoreResult`, so a
>    flat list costs zero fidelity and is faster to operate), with a **live result panel** recomputing on every
>    change. Close discards everything.
>
> **No ADR warranted:** the whole wave is additive, flag-gated, and writes nothing — fully reversible, so it
> fails the "hard to reverse" test. Glossary term **Test Mode** added to `CONTEXT.md`.

> **/co-validate outcome (2026-07-09) — REAL Codex GPT-5.5 @ xhigh (127,888 tokens, code-grounded) + own
> review. 5 findings, ALL ACCEPTED, 0 overridden. Two of them (C1, C2) reverse earlier grill decisions:**
> - **C1 (LVA hidden-answer wording was WRONG — accept, correctness):** `pruneHiddenAnswers` does GENERIC
>   `showIf` ONLY and never the LVA branch (`form-visibility.ts` — early-returns unless a question has `showIf`);
>   the real submit route prunes with it alone (`submit/route.ts:413`). Decision 3/§3.5's claim that Test Mode
>   "prunes LVA hidden answers so findings never fire on them" is false. **Fix:** Test Mode mirrors the route's
>   EXACT sequence — render via `filterVisibleSurveyQuestions` (LVA branch hides), score via `pruneHiddenAnswers`
>   (generic-only, never LVA) — so hidden-answer handling is byte-identical to production incl. LVA's
>   store-but-suppress quirk. Do NOT add LVA pruning the route doesn't do (that would BE a divergence). Net:
>   *strengthens* no-second-path.
> - **C2 + C5 (SUPERSEDES grill Q2 "force dirty" + Q7 "replicate, extract in Wave 3" — accept, EXTRACT NOW):**
>   forcing `dirty:true` reserializes — it **deletes half-authored findings** (`buildFindingRecommendations` →
>   `else delete row.recommendations`, `question-serialization.ts:563`), reassigns keys, restamps section
>   `sortOrder` — so a forced-dirty assemble is **NOT** deep-equal to a clean save (which passes raw through,
>   `:408`/`sections-serialization.ts:70`). Instead of forcing-dirty + testing around it: **extract two shared
>   helpers NOW.** (a) An editor-side **build-version-payload** helper that Save Draft AND Test Mode both call
>   with the SAME real dirty semantics (editor-only; no submit-route touch) — Test Mode then assembles exactly
>   what Save persists, by construction. (b) A pure **`computeScoreResult(version, rawAnswers, {allowMissingRequired?})`**
>   (prune→score) that BOTH the submit route and Test Mode call — behavior-preserving, guarded by existing submit
>   tests, findings-freeze stays in the route. This removes the "second code path" by construction; the parity
>   test is DEMOTED to a regression guard. (Does NOT disturb the wave plan — Wave 3's editor-*hook* extraction is
>   separate/larger; this is a small lib+payload extraction Wave 1 legitimately owns.)
> - **C3 (error surface under-scoped — accept, refines Q3):** `allowMissingRequired` only covers missing
>   *required*; `scoreSubmission` still throws `EMPTY_ANSWERS` on zero answers (`scoring.ts:1393`) + on
>   duplicate/unknown keys/out-of-range/invalid type. **Empty/too-few answers is the NORMAL drawer state** — show
>   "answer questions to see results," don't call the scorer, don't show "fix these." Reserve "can't test — fix
>   these" for CONFIG errors (tiling/schema/serialization). Answer-shape throws are largely UNREACHABLE via the
>   constrained real `QuestionInput` + answers-from-rendered-questions (treat any as a bug, not user copy).
> - **C4 (don't overclaim "identical report display" — accept, refines Q6):** `reportConfigFor` governs
>   `reportType`/`showTier`/`showScoreTable` ONLY; findings visibility in real reports is gated by the Wave U flag
>   (live in prod), not `reportConfigFor`. So: USE `reportConfigFor` to avoid showing a tier/table the real report
>   hides, but DROP the "can never diverge from the real report" claim. Test Mode shows fired findings as a useful
>   authoring OUTPUT — explicitly NOT a faithful branded-report reproduction (that's the deferred report-render).
> - **Own review (complementary, kept):** count/total-metric partial tiers read LOW (unanswered excluded, not
>   zero-filled — `scoring.ts:1546`) → drawer says "tier computed over N answered," not just a count; define the
>   Test Mode button state on a read-only PUBLISHED version; debounce recompute on large instruments. (The
>   earlier "pass the same publishedKeys" note is now MOOT — the shared build-version-payload helper uses the
>   same inputs by construction.)
> - **Verified favorably (no change):** pipeline is pure/client-safe; the write path persists questions+
>   scoringConfig VERBATIM (`versions/[versionId]/route.ts:371-402`, validate-don't-transform); `QuestionInput`
>   is a clean controlled widget (`question-input.tsx:40` — no shim needed).

---

## 1. Context & problem

The admin template editor (`admin/assessments/templates/[id]/versions/[versionId]/edit`,
`TemplateEditorTabbed.tsx`) authors every assessment instrument (SU-Full, LVA, QSP, Website Assessment, +
new custom templates). Audience: **ADMIN/STAFF only** (~3 internal experts). A live web-grounded competitive
sweep (Qualtrics, Culture Amp, Typeform, ScoreApp, NN/g, …) surfaced three real frictions:

1. a question is authored across **four separate tabs** (Sections / Questions / Scoring & Tiers / Findings panel);
2. there is **no way to test an assessment before publishing** (the old preview was removed; only a per-question
   "test-a-value" findings preview exists);
3. publish problems surface as a **post-publish modal**, not before.

**End-state direction (chosen): Approach A** — an outline · canvas · inspector working editor (NN/g "outline/tree
for deeply structured content" rule; NOT a Typeform single-scroll clone). On versioning / immutable keys /
longitudinal comparability we are *ahead* of the field — we just hide it.

**/co-validate outcome (Codex env-down → repo-grounded 3-lens panel + own review; all four "ship-with-changes"):**
the biggest correction was **sequencing**. Two of the three frictions (preview, publish-timing) are *independent
of the layout*. So we ship the layout-independent capabilities FIRST and treat the expensive shell rebuild as the
last, kill-able step.

## 2. Re-sequenced wave plan (on record; each wave is separately gated)

| Wave | Scope | Why here |
|------|-------|----------|
| **1 · Test Mode** (this spec) | Submit-and-score sandbox on today's editor: answer → domains/tier/fired findings, writes nothing | Highest value, layout-independent, near-zero regression risk |
| 2 · Safe-to-Publish | Live pre-publish checklist (reuse existing validators verbatim), Prevent vs Warn | Layout-independent; kills friction #3 |
| 3 · Extract shared hooks | Lift editor state + inspector subcomponents into headless hooks/modules (byte-equivalence guard) | Makes the layout swap a presentation change, not a fork |
| 4 · Three-pane (Approach A) | Outline · canvas · inspector, flag-gated on the same page, **with a pre-committed kill criterion** | The shell rebuild — earned last, reversible |
| 5 · Logic/scoring polish | Show-if badges + read-only logic map; drag-to-set tier bands | Nice-to-have |
| Deferred / if-requested | Benchmark generalization · anonymity mechanism (Jeff/legal) · report-preview pure-assembler | Not committed |

**Migration principle (all waves):** *extract, don't fork.* Do NOT build a parallel editor component; both the
current tabbed layout and the future three-pane become thin shells over shared state, so byte-identity holds by
construction. (Applies from Wave 3 on; Wave 1 adds a drawer to the existing editor and touches no layout.)

---

## 3. Wave 1 — Test Mode (this wave)

### 3.1 Goal
While editing a **draft** version, an admin enters sample answers and immediately sees the computed result —
**per-domain scores, the overall tier, and which findings fire** — to validate the instrument's *outputs* before
publishing. **Writes nothing** (no submission row, no email).

### 3.2 User flow (Q8)
1. A **"Test Mode"** button in the editor toolbar (additive; no layout change) opens a **drawer** (not a route —
   a route would lose the unsaved in-memory draft).
2. The draft's currently-visible questions render as a **flat single-scroll list** with the **real respondent
   widget** (`QuestionInput`) — NOT the section pager; input presentation doesn't affect `ScoreResult`.
   Visibility re-runs (`filterVisibleSurveyQuestions`) on every change so `showIf`/LVA questions reveal/hide live.
3. The admin fills in some answers (partial is fine — §3.5). With too few answers the panel shows a neutral
   "answer some questions to see results" state — the scorer is not called (C3).
4. A **live result panel** shows the §3.4 surface (informed by `reportConfigFor`), recomputing on every change
   (debounced on large instruments).
5. Closing the drawer discards everything (no persistence).

### 3.3 Reuse — the exact production pipeline, no second code path
This is the co-validate-mandated core. All of these are pure / client-importable (verified):

- **Assemble via a SHARED build-version-payload helper (C2 — supersedes "force dirty").** Draft rows are
  in-memory `QuestionDraft` shape (carry `scale`+`options`, half-typed `showIf`, unassigned slug keys) — *not* the
  persisted shape the schema/scorer expect. Extract the editor's save-time payload assembly
  (`buildQuestionsPayload`/`buildSectionsPayload` + `scoringConfig` bundling, with the editor's REAL dirty
  semantics — NOT forced) into ONE helper that **Save Draft AND Test Mode both call**. Test Mode then assembles
  *exactly* the object Save would persist, by construction — no divergence from reserializing clean rows (which
  would delete half-authored findings / restamp `sortOrder`). Parse the result with
  `TemplateVersionForScoringSchema`. (The write path persists this payload VERBATIM —
  `versions/[versionId]/route.ts:371-402` — so assemble == persisted == scored.)
- **Visibility (render):** render answerable questions via `filterVisibleSurveyQuestions` (`form-visibility.ts`;
  its LVA branch keys off `templateAlias`). Re-run on every answer change so `showIf`/LVA questions reveal/hide live.
- **Score via a SHARED `computeScoreResult` helper (C1+C2+C5).** Extract the submit route's exact score sequence —
  `pruneHiddenAnswers(...)` → `scoreSubmission(version, answers, {allowMissingRequired})` — into one pure
  `computeScoreResult(version, rawAnswers, opts)` that **BOTH the submit route and Test Mode call**. Key facts it
  encodes: `pruneHiddenAnswers` evaluates **GENERIC `showIf` ONLY, never the LVA branch** (`form-visibility.ts`) —
  Test Mode inherits that exactly, so hidden-answer handling is byte-identical to production incl. LVA's
  store-but-suppress behavior (do NOT add LVA pruning). **Never call `resolveFindings` separately** — it is
  internal to `scoreSubmission`. The findings *freeze* stays in the submit route's `assessmentSubmission.create`
  (NOT in `computeScoreResult`), so "reuse + write nothing" holds: Test Mode calls `computeScoreResult` and reads
  `result.findings`, never the create.
- **Runs client-side** (whole pipeline is pure — zero `db`/server imports) — no new endpoint, structurally zero
  data-write risk.

### 3.4 Output surfaces (scope) — grill Q5+Q6
- ✅ **Shown (ScoreResult-native, pure):** overall tier + message, the driving metric value (`tierMetricValue`
  and `overallAverage`/`countAchieved` as applicable), ScaleUp Score + per-domain scores (when present),
  per-section averages, the fired `result.findings` list, and the **unanswered-required count** (Q1 honesty
  guard, from `unansweredKeys`).
- **Display INFORMED by `reportConfigFor(templateAlias)` (Q6, scoped by C4)** — the SAME dispatch the real
  reports use (`report-config.ts:65`), which governs `reportType`/`showTier`/`showScoreTable` ONLY. Use it so Test
  Mode never shows a tier/score-table the real report hides (SU-Full scored / LVA·QSP qualitative / new template →
  `DEFAULT_REPORT_CONFIG` = scored); sidesteps the ADR-0002 neutral-tier trap. **Fired findings are always shown**
  as a useful authoring output (in prod they render gated by the live Wave U flag, not by `reportConfigFor`).
  **Do NOT claim this is a faithful branded-report reproduction** — it's an output summary; the pixel-faithful
  report render is the deferred follow-on.
- **Partial-answer honesty (own review):** unanswered questions are EXCLUDED, not zero-filled (`scoring.ts:1546`).
  For `countAchieved`/`overallTotal` tier metrics that pulls the tier LOW, so the panel states "tier computed over
  N of M answered," not merely an unanswered count.
- ❌ **Out of Wave 1:** `perQuestion` detail (redundant — the author just typed those) and the **full branded
  report render.** `getRespondentReport` is DB-bound (`$transaction` + `findFirst`); a faithful report preview
  needs a *pure view-model assembler extracted first* — a tracked follow-on (deferred), NOT smuggled into Wave 1
  (avoids a second report-shaping path that drifts).
- ❌ Also out: the three-pane layout (Wave 4), the Safe-to-Publish panel (Wave 2), persisting test answers.

### 3.5 Decisions / edge cases
- **Partial answers (Q1):** the sandbox computes from whatever's entered via `scoreSubmission`'s
  `allowMissingRequired: true` — **confirmed to exist** at `scoring.ts:1324/1546` (same option the Esperto import
  uses). Because the real submit route does NOT pass it, the fidelity invariant is bounded to **complete** answer
  sets (§3.7); the drawer shows the unanswered-required count so the author knows a real respondent couldn't
  submit an incomplete set.
- **Empty / too-few answers is the NORMAL state, NOT an error (C3).** `scoreSubmission` throws `EMPTY_ANSWERS`
  on zero answers (`scoring.ts:1393`). Test Mode must **short-circuit** the empty/too-few state — show "answer
  some questions to see results," do NOT call the scorer, do NOT show "fix these." Only CONFIG problems are errors.
- **Draft can't be scored — CONFIG errors only (Q3, refined by C3):** catch `QuestionSerializationError` (from the
  build-version-payload helper), scoring-schema parse (`checkRecommendationsRuntime`/`checkScaleUpScoreOptIn`), and
  `scoreSubmission` config throws (`assertTierTiling` `INVALID_SCORING_CONFIG`) → render as "Can't test yet — fix
  these." Test Mode runs the **scoring** schema, NOT the publish schema; full publish-readiness is Wave 2.
  Answer-shape throws (`UNKNOWN_STABLE_KEY`, duplicate keys, out-of-range, invalid type) are largely UNREACHABLE —
  answers come from the constrained real `QuestionInput` rendered off the draft's own questions — so treat any as
  a bug, not user-facing copy.
- **Hidden questions (corrected by C1):** Test Mode mirrors the route's exact split — `filterVisibleSurveyQuestions`
  decides what to *render* (LVA branch hides), `pruneHiddenAnswers` decides what to *score* (**GENERIC `showIf`
  ONLY, never LVA**). Result: hidden-answer handling is byte-identical to production, including LVA's
  store-but-suppress quirk. **Do NOT add LVA pruning the route doesn't do** — that would be a divergence, not a fix.
- **Non-scored instruments (Q6):** the scorer does NOT throw (ADR-0002 neutral catch-all tier); display follows
  `reportConfigFor` (tier hidden/shown per instrument), findings always shown.
- **Multi-respondent = self-assessment, not 360:** Test Mode = "preview as *a* respondent" (single). No rater roles.

### 3.6 Flag & kill (Q4)
Ships behind a new default-OFF, **single-lever** flag `WAVE_ED1_TEST_MODE_ENABLED` (starts the `ED`
editor-overhaul series; the A–Z single-letter series is exhausted). No KILL/CANARY levers — nothing persists
behind it, so kill = flag off (or revert — it's additive). Merges dark so the §3.8 prod walk runs before
Suzanne/Jeff see it.

### 3.7 Tests
- **Shared-helper equivalence is now BY CONSTRUCTION (C2/C5), not test-enforced** — Save Draft + Test Mode share
  the build-version-payload helper; the submit route + Test Mode share `computeScoreResult`. The parity tests
  below are DEMOTED to **regression guards** that lock the shared helpers stay shared:
  - **(a) Assembly regression:** the build-version-payload helper output for a sample draft matches a saved+
    reloaded version (proves Test Mode scores what gets persisted; the write path is verbatim).
  - **(b) Scoring regression:** for a **complete** answer set, Test Mode's `ScoreResult` deep-equals a direct
    `computeScoreResult(persistedEquivalentVersion, answers)` — "identical for complete answers."
- **`computeScoreResult` extraction is behavior-preserving** — the existing submit-route tests must stay green
  (the route now calls the helper; findings-freeze unchanged).
- Hidden-answer handling MIRRORS the route: an LVA / show-if instrument prunes GENERIC `showIf` only (never LVA) —
  test that Test Mode's pruning is identical to the route's, NOT that LVA answers are additionally pruned (C1).
- **Empty / too-few answers → neutral "answer questions" state, scorer NOT called** (no `EMPTY_ANSWERS` crash) (C3).
- **No-write assertion** (no `assessmentSubmission.create`, no email; enforced structurally — client-side, no db import).
- Per-type widgets render (SLIDER/TEXT/NUMBER/MULTI_CHOICE) via the real `QuestionInput`.
- CONFIG errors (serialization / scoring-parse / `assertTierTiling`) → surfaced as a "fix these" issue, not a crash.
- Partial answers compute via `allowMissingRequired` (unanswered EXCLUDED, not zero-filled); panel reports
  "N of M answered" and, for count/total metrics, that the tier is over answered-only.
- Display honors `reportConfigFor`: a qualitative alias hides the tier where the real report would; findings shown.

### 3.8 Verification
`CI=true npx next build --turbopack` green · targeted Jest on the new Test Mode module + the fidelity test ·
adversarial review · a live walk (author a throwaway draft, Test Mode it, confirm numbers match a real submission)
before any flag flip.

## 4. Non-goals (whole overhaul, restated)
No schema change. No data migration. No weakening of immutable-key / published-version-freeze invariants. No new
scoring/findings/report code paths (reuse the pure functions). Publish gating unchanged in Wave 1 (Wave 2 only
*surfaces* it; every existing publish-schema failure stays a hard Prevent).

## 5. Open items
- ~~Confirm `scoreSubmission`'s `allowMissingRequired`~~ — **RESOLVED** (exists, `scoring.ts:1324/1546`).
- ~~Flag name~~ — **RESOLVED** (`WAVE_ED1_TEST_MODE_ENABLED`, single lever, default-OFF).
- The report-preview pure-assembler extraction (deferred follow-on) — scope when/if a full-report preview is wanted.
- ~~`computeScoreResult` belongs to Wave 3~~ — **REVERSED by /co-validate (C2/C5):** the `computeScoreResult`
  (prune→score) extraction + the shared build-version-payload helper are now **IN Wave 1** (extract-don't-fork,
  removes the second code path by construction). Wave 3's editor-*hook* extraction remains separate.
- Define the Test Mode button state on a read-only PUBLISHED version (own review); debounce recompute on large
  instruments.

## 6. References
- Editor: `src/src/components/admin/TemplateEditorTabbed.tsx`, `.../template-editor/QuestionsTab.tsx`,
  `.../template-editor/question-serialization.ts`
- Pure logic (reuse): `src/src/lib/assessments/scoring.ts` (`scoreSubmission` `scoring.ts:1321`,
  `TemplateVersionForScoringSchema` `:543`, `allowMissingRequired` `:1324`), `.../findings.ts`
  (`resolveFindings` — internal to `scoreSubmission`, never called separately), `.../form-visibility.ts`
  (`filterVisibleSurveyQuestions` = render / `pruneHiddenAnswers` = score), `.../report-config.ts`
  (`reportConfigFor` `:65` — drives display), `.../answer-limits.ts` + `.../section-pages.ts` (pure, no imports)
- Real submit path to mirror (NOT to edit in Wave 1): `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts:413-418`
- Serializers to reuse in `assembleDraftVersionForScoring`: `question-serialization.ts` (`buildQuestionsPayload`),
  `sections-serialization.ts` (`buildSectionsPayload`)
- Respondent widget: `src/src/components/assessments/question-input.tsx`
- Design track: research findings brief + layout-directions + usage-walkthrough (claude.ai artifacts);
  plan v2 (scratchpad). /co-validate panel: 3 repo-grounded lenses, all "ship-with-changes".
