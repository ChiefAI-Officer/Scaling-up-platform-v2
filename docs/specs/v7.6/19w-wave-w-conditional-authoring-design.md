# 19w — Wave W: Conditional (show-if) Question Authoring — Design

> **Status: DRAFT — brainstormed + grilled 2026-07-06; pending /co-validate (Codex) + user greenlight. NO code yet.**
> Pipeline: brainstorm → grill (this doc) → /co-validate → greenlight → TDD (inline) → adversarial review → PR dark → same-session launch walk on "go".
> Anchor: `project_wave_w_next.md`. Prior wave: 19v (Wave V, LAUNCHED). Tracker: Wave U spec §3 follow-on ("row 38", the editor's disabled tab).

## §0 Ground truth (verified in code 2026-07-06)

1. **The "Conditional Logic v1.5" tab is a fossil, and its central claim is FALSE.** The disabled tab in
   `ScoringTiersTab.tsx` is verbatim WF18 ghost markup (May 12 2026). Its copy says *"Renderer-side evaluation
   ships in v1 — only the admin authoring UI is deferred"* — but `conditionalSections` has **zero references
   outside the editor stub and its tests**. No runtime evaluation was ever built. Wave W is NOT a Wave T-style
   UI-only unlock; the engine itself is new.
2. **The ghost tab's concept was superseded by Wave U.** `conditionalSections` = conditional *report* markdown
   blocks (`when {stableKey, op, value}` → render markdown). Wave U findings (ADR-0021) shipped that capability
   better: per-question rules, resolved once at scoring, frozen on the submission, rendered in both report kinds.
3. **What exists today is a working but hardcoded show-if, LVA-only, in three code-config pieces:**
   - `lib/assessments/form-visibility.ts` — hides `S5_why_<factor>` follow-ups in BOTH survey clients unless
     the factor is ticked in `S4_biggest_obstacles` (alias-gated to `leadership-vision-alignment`);
   - `REPORT_FILTERS[alias].conditionalFollowups` in `qualitative-report-model.ts` — report-side suppression
     (ADR-0014's chosen mechanism, protects already-submitted reports);
   - `lva-report-display.ts` — `S5_why_` label rewrite.
4. **ADR-0014 (2026-06-23) deliberately declined to build a survey conditional engine** (its option A) because it
   was then a large client + data-model change. The calculus changed: Wave T/U established per-question JSON
   fields on `AssessmentTemplateVersion.questions` (zero migration), validate-don't-strip PATCH, and the
   raw-spread-first serializer with anti-resurrection. Wave W revisits option A **for newly-authored content
   only**, on that cheap substrate; ADR-0014's report-side mechanism (option B) stays untouched for LVA.
5. **The integration seams already behave correctly:**
   - `resolveFindings` skips unanswered answers (`findings.ts:125`) → hidden questions fire no findings, no code needed;
   - the Wave E "render only answered" rule omits hidden (= unanswered) questions from BOTH report kinds organically, no code needed;
   - both survey clients already call `filterVisibleSurveyQuestions` + `visibleSurveyQuestionKeys` and reconcile
     stale answers via `pruneAnswersToQuestions` (client-side) → progress counts, paging, and client pruning come free;
   - the editor serializer (`question-serialization.ts`) spreads the raw row FIRST, so an untouched `showIf`
     survives every save byte-exact; panel edits emit explicitly with anti-resurrection (the `recommendations[]` machinery);
   - Duplicate-from-published copies the `questions` JSON wholesale → `showIf` carries byte-exact;
   - `contentHash` covers `questions` JSON → `showIf` is hash-covered automatically.
6. **One real gap:** `buildSectionPages` keeps zero-question sections as pages (deliberate — LVA's "Welcome" is a
   pure intro step). A section whose questions are ALL hidden by showIf would render as a stray empty page. §2.5.
7. **Pruning is client-only today.** The single participant submit route is
   `app/api/quiz/[campaignAlias]/submit/route.ts` → `scoreSubmission`. A crafted API submit can attach answers to
   hidden questions; with no report-side suppression on generic templates they'd render (answered-only shows
   whatever was answered). §2.4 closes this.
8. **Wireframe drift (P0, surfaced per house rule):** NO wireframe exists for survey show-if authoring.
   WF18's Conditional Logic ghost is a wireframe for the *superseded* report-sections concept. Disposition: D5.

## §1 Decisions (brainstorm + grill, all user-confirmed 2026-07-06)

| # | Decision | Rationale |
|---|----------|-----------|
| **D1** | **Scope = survey-form show-if authoring.** The ghost tab's conditional-report-sections concept is declared **superseded by Wave U findings** and is NOT built. | The report half is redundant with ADR-0021; the survey half is the real gap (hardcoded LVA-only today) and what Jeff would use while authoring instruments. |
| **D2** | **Condition power = option-selected only**: `showIf = { questionKey, optionKey }` — show the question when that option of a preceding MULTI_CHOICE is selected. No numeric bands, no operator set. | Covers LVA and every observed Esperto pattern (QSP's dropped `specialparticipant` was also selection-driven). Bands/ops are future additive rule kinds (type-discriminated, Wave U pattern). |
| **D3** | **LVA stays hardcoded.** Wave W is purely additive; `form-visibility.ts`'s LVA branch, `REPORT_FILTERS.conditionalFollowups`, and the label rewrite are untouched. "Migrate LVA to authored showIf" is a ledgered follow-on. | Zero blast radius on live LVA reports/emails (results-email byte-identical stays trivially true). Old campaigns pin old versions, so the hardcoded path could never fully die anyway. |
| **D4** | **`required + showIf` is forbidden at publish** (conditional questions are always optional — the LVA precedent), **plus a server-side prune at submit** drops answers whose gate fails. `scoreSubmission` is untouched. | Keeps the frozen scoring/validation path at zero risk while closing the tampered-submit leak. Required-when-visible semantics deferred until an instrument needs it. |
| **D5** | **Editor home = collapsible per-question "Show only when…" panel** on the question card (Questions tab), the Wave U Findings-panel idiom. **The Conditional Logic ghost tab is REMOVED.** Wireframe drift disposition: this spec declares the Findings panel the pattern-of-record; no new wireframe file. | Conditions belong to the question they condition. The ghost tab's substance is superseded (D1) and its "runtime ships in v1" copy is false — keeping it is active misinformation. |
| **D6** | **Single option per condition** (no `optionKeys[]` OR-list in v1). | LVA shape exactly. A future ANY-of is a purely additive schema extension. |
| **D7** | **Suppress conditionally-emptied section pages**: skip a section page when the version has ≥1 question in that section but 0 are currently visible. Authored-empty sections (zero questions in the version — true intro pages) always render. | Statically distinguishable cases. Avoids contentless steps — the exact "too many pages" feel Jeff flagged on LVA. |

## §2 Design

### §2.1 Data model — `showIf` on the question object (zero migration)

Each question object in `AssessmentTemplateVersion.questions` (JSON) MAY carry:

```json
{ "stableKey": "S5_why_culture", "type": "TEXT", "isRequired": false,
  "showIf": { "questionKey": "S4_biggest_obstacles", "optionKey": "culture" } }
```

- Optional field; absent = unconditional (every existing version is valid unchanged).
- Zod: `showIf` added to the question schema(s) in `scoring.ts` as an optional strict object
  (`questionKey`/`optionKey` non-empty strings). The version PATCH stays **validate-don't-strip**
  (Wave T rule) so a `showIf` written by the panel — or any future field — survives saves it didn't touch.
- Content-hash coverage and Duplicate carry are automatic (§0.5).

### §2.2 Runtime evaluator — generic path in `form-visibility.ts`

`filterVisibleSurveyQuestions` gains a generic pass that runs for ALL templates:

1. LVA alias branch first, **verbatim unchanged** (D3).
2. Then: for every question with a `showIf`, look up the gate question by `questionKey`; the question is
   visible iff the gate is a MULTI_CHOICE and `optionKey` ∈ the respondent's current selection for it.
   **Composition is a strict pipeline** (C2): the generic pass filters the OUTPUT of the LVA branch —
   intersection semantics; generic evaluation can never resurrect an LVA-hidden question.
3. **Fail-open** (LVA precedent): gate missing, gate not MULTI_CHOICE, or malformed `showIf` → the question
   SHOWS. Publish validation (§2.3) makes these states unreachable on published versions; fail-open protects
   any legacy/hand-seeded data.
4. **Single-level only.** No chains: a gate may not itself carry `showIf` (publish-enforced). The runtime
   evaluates each `showIf` against raw answers only — it never recurses.

Both survey clients (`org-survey-client.tsx`, `public-quiz-client.tsx`) need **no changes**: they already call
this module for filtering, visible-key sets, progress counts, and client-side answer reconciliation.

### §2.3 Publish gate — new check in the publish `superRefine` (V-1's home)

`TemplateVersionForPublishSchema.superRefine` gains `checkShowIfIntegrity` (sibling of
`checkGlobalTierTiling` / `checkPerDomainTierTiling`, same try/catch → `ctx.addIssue` idiom, issues routed with
paths under `["questions", i, "showIf", …]` so the editor modal names the offending question):

- `questionKey` resolves to a question in this version;
- the gate's type is MULTI_CHOICE;
- the gate appears **strictly earlier in the canonical survey render order** (cross-section allowed — the
  flagship LVA shape S4→S5 is itself cross-section). "Earlier" is defined by ONE shared exported
  ordered-question helper (section sortOrder, then question sortOrder within section — exactly
  `buildSectionPages`' order) used by the editor dropdown, this publish check, and the tests (C1) — never by
  raw question `sortOrder` alone, which is not guaranteed globally unique across sections;
- `optionKey` is one of the gate's option keys;
- the gate has no `showIf` of its own (no chaining);
- the conditioned question has `isRequired: false` (D4).

Draft saves are NOT gated (drafts may be transiently inconsistent, same as tiers); publish is the wall.
Flagless — this is correctness hardening (kill = revert-commit), per the Wave Q/V durable rule.

### §2.4 Server-side prune — submit route, shared evaluator

In **BOTH** participant submit routes — `app/(public)/org-survey/[campaignAlias]/submit/route.ts` (invited)
and `app/api/quiz/[campaignAlias]/submit/route.ts` (public quiz) — (build-found correction: the draft said
"the single submit route"; there are two): a single exported
`resolveVisibleSurveyQuestionKeys(...)` (the SAME evaluator module the clients use — the V-1
shared-verbatim-helper property: what the client hides, the server drops) computes the visible-key set over
the submitted answers, and hidden-question answers are dropped **before EVERY side effect** — scoring,
findings resolution, persistence, audit metadata, anything downstream reads only the pruned set (C3).
Client/server visibility equivalence is a primary property test.
**Generic rules only:** the server prune evaluates `showIf` and does NOT run the LVA alias branch
(`templateAlias` passed as `null`, or a generic-only entry point) — LVA's status-quo storage behavior stays
byte-identical per D3 (a tampered LVA submit stores-but-suppresses exactly as today; `REPORT_FILTERS` already
hides it report-side). Deterministic fixpoint concern does not arise: gates cannot be conditional (no chains), so one pass
against the raw submitted answers is exact. `scoreSubmission` and its required-presence check are untouched
(hidden questions are always optional per D4). Flagless. PII-free (no new logging of answer content).

**Import path exception (deliberate):** the Wave O historical-import commit path calls `scoreSubmission`
directly and does NOT prune. Historical Esperto answers are source-of-truth; Esperto applied its own
conditional display at collection time. Recorded here so nobody "fixes" it.

### §2.5 Pager — suppress conditionally-emptied pages (D7)

Where the clients build pages from the filtered question list, skip a section page iff the **version** has
≥1 question assigned to that section but the **filtered** list has 0. Implemented as a small pure helper next
to `buildSectionPages` (fed both the unfiltered and filtered sets), test-locked. Authored-empty sections
(true intro pages like LVA "Welcome") always render. LVA behavior cannot change: its S4 gate is required
(≥1 selection ⇒ ≥1 visible follow-up), and its other sections are unconditional — regression-asserted anyway.

### §2.6 Editor — per-question "Show only when…" panel (flag-gated)

- Collapsible panel on each question card in the Questions tab (Findings-panel idiom): dropdown 1 = the
  preceding MULTI_CHOICE questions (canonical render order, shared helper — C1); dropdown 2 = that question's
  options; plus Clear. Panel visible only when `WAVE_W_CONDITIONAL_AUTHORING_ENABLED=1`.
- **In-panel spec sketch (wireframe-of-record for this surface — C4, honoring D5's no-new-wireframe-file):**

  ```
  ┌ Question card: "Why is culture a hindrance?" (TEXT) ───────────────┐
  │ …existing label/type/required controls…                            │
  │ ▸ Show only when…                                   [conditional]  │
  │   ┌───────────────────────────────────────────────────────────┐    │
  │   │ Question  [ S4 — Biggest obstacles (MULTI_CHOICE)  ▾ ]     │    │
  │   │ Option    [ Culture                                ▾ ]     │    │
  │   │ This question is shown only when that option is selected.  │    │
  │   │                                            [ Clear rule ]  │    │
  │   └───────────────────────────────────────────────────────────┘    │
  └─────────────────────────────────────────────────────────────────────┘
  ```
- **Required interlock in the editor, not just publish (C6):** the panel is disabled (with a local
  explanatory message) on a question marked required; setting `showIf` is blocked until required is unchecked,
  and a question carrying `showIf` has its required toggle disabled the same way. The publish gate stays the
  backstop, but no author first learns the rule at publish time.
- Allowed on inherited questions (reword-class per ADR-0020's taxonomy — `showIf` changes form flow, never
  identity/history/scoring). Key/type/option-key locks are unaffected.
- **Dangling-ref hygiene (draft-only, since inherited identities are locked):** deleting a draft question, or
  deleting an option of a draft MULTI_CHOICE, that other questions' `showIf` references → confirm dialog naming
  the dependent questions; on confirm, the dependent `showIf`s are cleared (Wave U retype-drop pattern).
  The publish gate (§2.3) catches any residue as belt-and-braces.
- Serialization: explicit `showIf` emission with anti-resurrection on dirty saves (the `recommendations[]`
  machinery); untouched rows pass through raw (hash-stable).
- Reordering hazard: moving the gate BELOW a dependent (or the dependent above the gate) is allowed in the
  draft but blocked at publish by the strictly-earlier rule with a routed message.
- **Ghost tab removal:** the `deferred-conditional-logic` ghost (and its false copy) is deleted from
  `ScoringTiersTab.tsx`; its tests updated. The `deferred-peer-benchmarks` ghost is ALSO stale (superseded by
  Wave S's real panel) but is **left alone in this wave** — unrelated cleanup, diff stays focused (C5);
  ledgered in §3. WF18 drift note: §0.8 / D5.

### §2.7 Reports, findings, emails — zero code, test-asserted

- Scored + qualitative reports: hidden ⇒ unanswered ⇒ omitted (Wave E rule). Asserted by tests, not re-implemented.
- Findings: `resolveFindings` skips unanswered ⇒ hidden questions contribute no findings. Asserted.
- Results email: no template with `showIf` exists at launch ⇒ byte-identical by vacuity; the email twin shares
  the qualitative model, so the answered-only property carries. Asserted on a fixture.
- Group reports: aggregate answered submissions only — unaffected. Wave M custom slides: non-counted
  interstitials, different mechanism — unaffected.

### §2.8 Flag & kill

`WAVE_W_CONDITIONAL_AUTHORING_ENABLED` (new `wave-w-flags.ts`, `_KILL` wins, call-time reads) gates **the
editor panel only**. Runtime evaluation (§2.2), publish gate (§2.3), prune (§2.4), and pager rule (§2.5) are
flagless: once a version with `showIf` is published, surveys must honor it regardless of flag (flags gate
capability, never persisted data — the Wave Q durable rule). Kill: panel = zero the flag; the flagless pieces =
revert-commit. Ships EMPTY (honest-data): no live template gains `showIf` in this wave (D3).

## §3 Out of scope (ledgered)

- Numeric-band / operator conditions (D2) — future additive rule kind.
- ANY-of option lists (D6) — additive extension.
- Required-when-visible semantics (D4) — needs server visibility-aware required-check; no instrument needs it.
- Migrating LVA to authored `showIf` + retiring `form-visibility.ts`'s alias branch (D3).
- Conditional report sections (D1) — superseded by Wave U findings; if free-form score-keyed markdown is ever
  wanted, it's a findings extension, not a revival of `conditionalSections`.
- Panel "test-a-value" preview (Wave U §3 adjacent follow-on) — unchanged, still ledgered.
- Removing the stale `deferred-peer-benchmarks` ghost (superseded by Wave S) — C5, next editor-touching wave.

## §4 Testing (TDD; counts jest-verified before SoT per house rule)

- **Evaluator:** generic show/hide; fail-open matrix (missing gate, non-MC gate, malformed); no-chain
  single-pass; LVA branch byte-identical behavior (regression fixture).
- **Publish gate:** rejection matrix for all six §2.3 rules incl. routed issue paths; publish-pass ⇒ runtime
  never sees an invalid `showIf` (property).
- **Prune:** tampered submit with hidden-question answers → dropped pre-scoring; visible answers untouched;
  import path NOT pruned (asserted).
- **Pager:** conditionally-emptied suppressed; authored-empty rendered; LVA pages unchanged.
- **Serializer:** round-trip carry, anti-resurrection, validate-don't-strip (unknown-field survival alongside
  `showIf`), confirm-drop on gate/option delete.
- **Panel:** dropdown population (preceding MC only), clear, flag-off absence, inherited-question editability.
- **Pass-throughs (trimmed per C7):** one report-omission assert per report kind + one findings-absence
  assert + duplicate carry byte-exact. No dedicated email fixture — the email twin shares the qualitative
  model, so the model-level answered-only assert covers it.
- **Client/server equivalence property (C3):** same version + same answers ⇒ identical visible-key set from
  the client filter path and the server prune path.
- **Build gate:** `CI=true npx next build --turbopack` from `src/`.

## §5 Launch plan (same-session walk on "go")

1. PR dark → merge on "go" → walk on prod DB with a throwaway template (reserved walk alias; `walk-qual-*` if
   the qualitative path is exercised): author a MULTI_CHOICE gate + 2 conditional TEXT questions + 1
   conditional in its own section (D7 case) via the live panel (flag inline on local UI vs prod DB until flip).
2. Publish-gate proof: attempt publish with a deliberately bad ref (later-order gate or required+showIf) →
   blocked with routed message → fix → publish.
3. Survey walk (safe test member, token minted, NO email): toggle gate options → hide/show live, emptied
   section page skipped, progress count correct → submit → report renders answered-only; findings absent for
   hidden; tampered-submit spot-check against the prune.
4. Duplicate-from-published → `showIf` carried byte-exact.
5. Quarantine §5.5 order (campaigns first, template soft-delete) → smoke 0/0 → authorized flag flip
   (`WAVE_W_CONDITIONAL_AUTHORING_ENABLED=1`) + NEWEST-deployment redeploy → prod smokes (existing LVA + SU-Full
   surveys and reports unchanged).

## §6 Co-validate changelog (Codex staff review, 2026-07-06 — threadId `019f36e9-3e77-75d2-82ea-f0bb16032974`)

- **C1 (order semantics under-specified) — ACCEPTED.** "Global sortOrder" was risky (not guaranteed unique
  across sections). §2.3/§2.6 now define "earlier" via ONE shared ordered-question helper matching
  `buildSectionPages`' render order, used by editor dropdown + publish gate + tests.
- **C2 (visibility composition explicit) — ACCEPTED.** §2.2 now states the strict pipeline (LVA branch →
  generic showIf, intersection semantics; generic can never resurrect an LVA-hidden question). The
  generic-only prune entry point was already in the draft (self-review fix, pre-Codex).
- **C3 (server prune = highest-risk; centralize + before every side effect) — ACCEPTED.** §2.4 names
  `resolveVisibleSurveyQuestionKeys`, requires the drop before ALL side effects (scoring, findings,
  persistence, audit), and promotes client/server equivalence to a primary property test (§4).
- **C4 (new admin surface with no wireframe = process gap) — PARTIALLY ACCEPTED.** D5 (user-confirmed: no new
  wireframe file) holds; the compromise is an in-spec panel sketch in §2.6 that serves as the
  wireframe-of-record for this surface. Drift remains documented in §0.8.
- **C5 (don't remove the peer-benchmarks ghost) — ACCEPTED.** Diff stays focused on the conditional-logic
  fossil; peer-benchmarks ghost removal ledgered (§3).
- **C6 (enforce required+showIf in the editor, not just publish) — ACCEPTED.** §2.6 adds the two-way panel
  interlock with local messaging; publish stays the backstop.
- **C7 (trim the test matrix) — PARTIALLY ACCEPTED.** Dedicated email fixture dropped and pass-throughs
  reduced to single targeted asserts (§4). The evaluator/publish/prune/pager/serializer/panel cores stay —
  Codex agreed those are the hard tests.
- **Independent (main-loop) review, pre-Codex:** caught that the server prune as first drafted would have run
  the LVA alias branch server-side (a D3 violation) — fixed to generic-rules-only before the Codex call; Codex
  C2 independently converged on the same seam.
