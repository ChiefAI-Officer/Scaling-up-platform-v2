# Spec 19ae — Assessment Editor Overhaul · Wave 3: Extract shared editor state + inspector subcomponents into headless hooks

> **Status:** DRAFT — brainstorm DONE 2026-07-10 (5 decisions locked below). `/grill-with-docs` + `/co-validate` (real Codex GPT-5.5 @ xhigh) **PENDING**; then final user approval before `writing-plans`. Nothing is built.
> **Date:** 2026-07-10 · **Author:** design track (Wave ED overhaul, re-sequenced 5-wave plan — spec 19ac §2).
> **Gate:** GATED wave. Brainstorm DONE; grill + co-validate + this spec + an implementation plan + user approval complete the gate.

> **Brainstorm outcome (2026-07-10) — 5 decisions locked, code-grounded (via a 4-reader map of the live editor):**
> 1. **Q1 — Headless boundary = a STATEFUL hook is the single state owner (Option A).** `useTemplateEditorModel(props)` internally holds all `useState`/`useRef` and returns `{ state, handlers }`; both the tabbed shell (now) and the future three-pane shell (W4) are thin renderers over the **one** model instance. Byte-identity of the two shells holds *by construction* because there is one model, not two wirings. Rejected Option B (pure reducers + each shell owning its own state) — each shell re-implements the wiring → drift, which the locked "extract, don't fork" principle forbids. The existing React-free seams stay as the pure functions the hook *calls* (Option B's testability is already captured there). (§3.2)
> 2. **Q2 — A COMPOSED FAMILY of focused sub-hooks under one top-level hook (Option B).** `useTabRouting`, `useDirtyTracking`, `useMetadataModel`, `useSectionsModel`, `useQuestionsModel`, `useScoringConfigModel`, `useSaveDraft` (orchestrator), `useVersionActions` — composed inside `useTemplateEditorModel`, which returns the single unified `{ state, handlers }` the shells consume (satisfies Q1). Rejected a single monolithic hook (just relocates the 1,393-line monolith; not slice-testable/reviewable). Enables one-slice-at-a-time extraction, each guarded. (§3.2)
> 3. **Q3 — MECHANICAL LIFT; preserve every wart (Option A).** Code moves into hooks verbatim; behavior (including the three known warts — scoringConfig state+ref dual-copy, `new Set(publishedQuestionKeys)` fresh-per-render into TestModeDrawer, six section handlers drilled through two parents) is byte-identical. The byte-equivalence guard is then a *strict* identity assertion. Rejected opportunistic cleanup: it turns each wart into a behavioral delta the guard must be *loosened* to tolerate, in a battle-tested component, for zero user benefit. Two warts dissolve naturally in W4 anyway; the dual-copy can be revisited in W5. (§3.4)
> 4. **Q4 — EXTRACT the inspector subcomponents NOW, presentational-by-props (Option A).** `QuestionConfigForm`, `FindingsPanel`, `ShowIfPanel`, `FindingsPreview` (today internal, un-exported inside the 2,244-line `QuestionsTab.tsx`) become standalone presentational component files that take `focusedQuestion` + handlers as props; QuestionsTab rewires to render them (byte-identical). W4's inspector pane mounts the *same* components. **Selection state (`focusedQuestionUid`/`selectedSectionStableKey`) stays local to QuestionsTab for ED3** (mechanical-lift, Q3); W4 lifts it into the model when the panes need to share it — trivial and non-forking because the components are already props-driven. Rejected deferring to W4: that extracts *while* building the new layout — extraction the old shell no longer guards, the exact fork risk ED3 exists to kill. (§3.3)
> 5. **Q5 — Byte-equivalence guard = a GOLDEN CHARACTERIZATION SUITE written FIRST (Option A).** Before touching code, write RTL tests against the **current** `TemplateEditorTabbed` that drive a scripted edit sequence over 2–3 representative fixtures and assert **byte-exact** outgoing PATCH bodies (metadata + version, via mocked `fetch`) plus the key derived behaviors (`isAnyDirty`, Save-disabled, tab routing, and the subtle post-save `assignedKeys`→state + raw-ref reconciliation). Green on today's main; held green through every extraction slice — a slice that breaks a byte assertion isn't done. Plus a *light structural* check on the extracted inspector (the four panels render for a focused question with the right fields/handlers wired) — not a brittle full DOM snapshot. Existing seam parity tests stay as-is. (§3.5)
>
> **No flag (brainstorm decision, confirmed by the user).** Unlike ED1/ED2, ED3 adds **no capability** — it is a pure structural refactor. A dark flag would ship dead hook code nothing consumes → the very drift ED3 prevents. So: live on merge; the byte-equivalence guard is the safety; **kill = revert-the-commit**. (§3.6)

> **Grill outcome (`/grill-with-docs`):** _PENDING — to be filled after the grill._

> **/co-validate outcome (real Codex GPT-5.5 @ xhigh):** _PENDING — to be filled after co-validate._

> **ADR:** none proposed (additive, reversible refactor — fails "hard to reverse"; the governing "extract, don't fork" principle is already locked at the overhaul level, 19ac §2). Revisit if the grill surfaces a genuinely hard-to-reverse, surprising trade-off. **No CONTEXT.md glossary change** — ED3 is purely implementation; it introduces no term meaningful to a domain expert.

---

## 1. Context & problem

The admin template editor (`admin/assessments/templates/[id]/versions/[versionId]/edit`, `TemplateEditorTabbed.tsx`) authors every instrument (SU-Full, LVA, QSP, Website Assessment, + new custom templates). Audience: **ADMIN/STAFF only** (~3 internal experts).

Today `TemplateEditorTabbed.tsx` is a **1,393-line state-owning monolith**: 14 `useState`, 4 `useRef`, ~8 `useMemo`, 25 `useCallback`, 2 `useEffect`. It owns the entire document model (`questions`, `sections`, `scoringConfigState` + shadow `scoringConfigRef`, three raw round-trip refs, `dirtyFlags`, `activeTab`) and the whole `handleSaveDraft` orchestration (serialize-before-fetch → `ops[]` PATCH array → post-save ref reconciliation → `assignedKeys`→state → dirty reset). Every tab (`MetadataTab`, `SectionsTab`, `QuestionsTab`, `ScoringTiersTab`, `VersionsTab`) is a **controlled child** — receives data + handlers, bubbles edits up. The "inspector" content — `QuestionConfigForm`, `FindingsPanel`, `ShowIfPanel`, `FindingsPreview` — is **trapped as internal, un-exported code inside `QuestionsTab.tsx`** (2,244 lines), which already renders a 20/50/30 outline│canvas│inspector grid internally (the prototype for W4). There are **zero custom hooks** in the editor today; the established pattern is strictly *pure function + thin component*.

The locked end-state (Approach A, spec 19ac §1) is a **three-pane working editor** (outline · canvas · inspector). Building that in W4 against today's monolith would force either (a) a **parallel editor component** — the explicitly-banned fork, risking drift between two authoring paths — or (b) rewriting state inline in a new shell with no equivalence guarantee. **W3 removes that dilemma**: lift editor state + the inspector subcomponents into headless hooks/components so both the tabbed shell and the W4 three-pane become thin renderers over the same hooks — the layout swap is a *presentation change, not a fork*.

## 2. Where this sits in the wave plan

Wave 3 of the re-sequenced 5-wave overhaul (spec 19ac §2) — the **pivot wave** between the two shipped capability waves (ED1 Test Mode, ED2 Safe-to-Publish, both LAUNCHED) and the layout rebuild (W4 three-pane, kill-able, earned last).

**Migration principle (all waves): extract, don't fork.** ED1/ED2 proved it with *pure lib/payload helpers* (`computeScoreResult`, `getPublishValidationIssues`, `buildVersionScoringPayload`, `evaluatePublishReadiness`). **ED3's distinct target is the STATEFUL editor logic** — the `useState`/`useCallback`/`useMemo` graph and the inspector subcomponents — lifted into headless hooks/components so both shells consume the same source.

---

## 3. Wave 3 — Extract shared editor state + inspector subcomponents (this wave)

### 3.1 Goal
Turn `TemplateEditorTabbed` from a state-owning monolith into a **thin renderer** over a family of headless hooks, and lift the inspector subcomponents out of `QuestionsTab` into standalone presentational components — with **zero user-facing change**, proven by a byte-equivalence guard. This makes W4's three-pane a presentation swap over the same hooks/components, not a fork.

### 3.2 Architecture — one composed model owner (Q1 + Q2)

A composed hook family, all **mechanical lifts** (Q3), under one top-level owner. Proposed placement: `src/src/components/admin/template-editor/hooks/` (client hooks, `.ts`/`.tsx` as needed).

| Hook | Owns (lifted verbatim from the monolith) |
|---|---|
| `useTabRouting` | `activeTab`, `handleTabChange`, the URL `?tab=` sync `useEffect` |
| `useDirtyTracking` | `dirtyFlags`, `isAnyDirty`, the 5 `setXDirty` callbacks, reset-on-save, the `beforeunload` `useEffect` |
| `useMetadataModel` | `templateValues`, `versionValues`, `handleTemplateFieldChange`/`handleVersionFieldChange`, the **independent** `sendResultsDefault` PATCH path (`savingSendResultsDefault`) |
| `useSectionsModel` | `sections`, `rawSectionsRef`, the 6 section handlers, `questionCountByStableKey` memo |
| `useQuestionsModel` | `questions`, `rawQuestionsRef`, the 5 question handlers, `hydrateQuestionsFromJson` wiring |
| `useScoringConfigModel` | `scoringConfigState` **+** `scoringConfigRef` (dual-copy preserved, Q3), `handleScoringConfigChange`, `reportConfigRef` passthrough |
| `useSaveDraft` | the full `handleSaveDraft` orchestration — serialize-before-fetch (shared `buildVersionScoringPayload`) → `ops[]` → `Promise.all` → post-save ref reconciliation → `assignedKeys`→state → dirty reset — composed over the models' state/refs |
| `useVersionActions` | `handlePublishVersion`/`handlePublish`/`handleDuplicateVersion`, `publishIssues` (→ `PublishFailureModal`), `publishingVersionId`/`duplicatingVersionId` |
| **`useTemplateEditorModel`** | **composes all of the above → the single `{ state, handlers }` both shells consume** |

- **The existing React-free seams are unchanged** (`buildVersionScoringPayload`, `computeScoreResult`, `getPublishValidationIssues`, `question-serialization`, `sections-serialization`, `test-mode-display`) — the hooks *call* them, keeping ED1/ED2's anti-drift guarantees intact.
- **Purely-local UI stays in the shell.** `testModeOpen` (drawer open/close) is presentation-only; it need not enter the model (implementer may keep it a shell `useState` or a trivial composer field — decided at build).
- **`useSaveDraft` is composed last** and takes the model hooks' current state + refs as inputs, exactly as `handleSaveDraft` reads them today (serialize-before-fetch is fail-atomic; a thrown `QuestionSerializationError` still early-returns with a destructive toast and no partial write).

### 3.3 Inspector subcomponent extraction (Q4)
`QuestionConfigForm`, `FindingsPanel`, `ShowIfPanel`, `FindingsPreview` move out of `QuestionsTab.tsx` into standalone **presentational-by-props** component files:
- Each receives `focusedQuestion` + the relevant handlers (and flag props `findingsEnabled`/`conditionalEnabled`/`isUnlocked`) as props; none reaches into `QuestionsTab` internals → mountable by either shell.
- `QuestionsTab` rewires to render the extracted components; its rendered output stays **byte-identical** (guarded per §3.5).
- **Selection stays local to `QuestionsTab` for ED3** (mechanical-lift). W4 decides whether to lift selection into the model; because the components are props-driven, that lift is trivial and non-forking.

### 3.4 Mechanical lift; warts preserved (Q3)
Behavior is relocated, never changed. The three known warts are **preserved verbatim** so the guard is a strict identity assertion:
1. `scoringConfig` dual-copy (`scoringConfigState` drives the Scoring UI; `scoringConfigRef` is read *synchronously* by the save PATCH) — kept as-is inside `useScoringConfigModel`.
2. `new Set(publishedQuestionKeys)` fresh-per-render into `TestModeDrawer` — preserved (the badge's memoized `badgePublishedKeys` also preserved).
3. Six section handlers drilled through both `MetadataTab` and `SectionsTab` → `SectionsCard` — preserved.

*(Cleanup is explicitly out of scope; two of these dissolve in W4's single-outline layout, and the dual-copy is a candidate for W5 polish.)*

### 3.5 Byte-equivalence guard (Q5)
- **Golden characterization suite, written first (Task 1).** RTL renders the current `TemplateEditorTabbed`; a scripted edit sequence drives it; assertions are **byte-exact** on:
  - the outgoing **metadata PATCH** body and **version PATCH** body (via mocked `fetch`), for the tricky paths — new-question D8 slug-key assignment, inherited-question key/type/option-key locks, findings bands, showIf, the multi-choice option editor, and a sections reorder;
  - the derived behaviors — `isAnyDirty`, Save-Draft disabled state, tab routing (`?tab=`), and the post-save `assignedKeys`→`questions` reconciliation + `rawQuestionsRef`/`rawSectionsRef` overwrite.
  - **Fixtures:** a slider-heavy instrument + one carrying the LVA multi-choice (`S4_biggest_obstacles`) + a text/number mix. (Exact fixtures finalized in the plan; see §5.)
- **Held green through every slice.** Each extraction commit must keep the suite byte-green; a broken byte assertion means the slice changed output → not done.
- **Inspector extraction check (light, structural):** the four extracted panels render for a focused question with the correct fields/handlers wired — not a brittle full DOM snapshot.
- **Existing seam parity tests stay as-is** (they already lock the shared-helper anti-drift from ED1/ED2).

### 3.6 Flag & kill — **none**
ED3 adds no capability, so there is no `WAVE_ED3_*` flag. It rewires the live editor in place; the byte-equivalence guard is the safety; **kill = revert-the-commit**. (A dark flag would ship dead hook code nothing consumes — the drift ED3 exists to prevent.)

### 3.7 Build shape (subagent-driven TDD, incremental)
1. **Guard suite first** — golden characterization tests vs. current code; watch them pass on main.
2. **Extract one hook per slice, smallest/least-risky first:** `useTabRouting` → `useDirtyTracking` → `useMetadataModel` → `useSectionsModel` → `useQuestionsModel` → `useScoringConfigModel` → `useVersionActions` → `useSaveDraft` → `useTemplateEditorModel` composer. Re-run the guard green after each.
3. **Extract the inspector components** (`QuestionConfigForm`/`FindingsPanel`/`ShowIfPanel`/`FindingsPreview`); rewire `QuestionsTab`; light structural check.
4. `TemplateEditorTabbed` ends as a **thin renderer** over `useTemplateEditorModel`; final full-suite + `CI=true npx next build --turbopack` + multi-lens adversarial review.

### 3.8 Verification
`CI=true npx next build --turbopack` green · targeted Jest on the guard suite + each new hook + the extracted inspector components · full-suite sweep (no new failures beyond the known pre-existing suites) · multi-lens adversarial review · **no live walk / flag flip needed** (no user-facing change; the guard *is* the proof). A post-merge smoke of the real editor (open a draft, edit, save, publish) confirms parity in prod.

## 4. Non-goals
No schema change. No data migration. **No weakening of immutable-key / published-version-freeze invariants** (editor stays read-only on published versions; authoring on DRAFT only; explicit Save Draft, not autosave). **No new scoring/findings/report code paths** — reuse the pure seams verbatim. **No three-pane / layout change** (that's W4). No question type-model change (the 4-type Zod union stands; no radio/single-select type). Scoring tiers/domains stay **instrument-level** (not moved into a per-question inspector — that scope is set for W4's inspector). `sendResultsDefault` stays its own independent immediate-PATCH path. **No behavioral cleanup of the three warts** (§3.4). No new flag.

## 5. Open items (to harden in `/grill-with-docs` + `/co-validate`)
- **Exact guard fixtures** — which real/synthetic instruments best exercise the tricky serialize paths without brittleness; how many edit-sequence steps.
- **`useVersionActions` vs `useSaveDraft`** — genuinely separate hooks, or fold publish/duplicate into the save hook? (publish/duplicate are independent of the dirty/serialize flow, so likely separate — confirm.)
- **Post-save reconciliation edge cases** — the `assignedKeys`→state + raw-ref overwrite is the subtlest logic in `handleSaveDraft`; the guard must pin its exact behavior (a follow-up save after a rename must not delete just-saved content — the pre-existing bug Wave T fixed).
- **Guard coverage of flag-gated panels** — must the characterization suite also assert the props passed to the findings/showif/test-mode/safe-to-publish surfaces, or is byte-exact PATCH + light inspector-render check sufficient?
- **Hook file placement** — `template-editor/hooks/` vs alongside the tabs; naming.
- **Selection-state lift** — confirm it stays local to `QuestionsTab` in ED3 (deferred to W4), not lifted early.

## 6. References (grounded against current `main`, 2026-07-10)
- **Editor shell (refactor target):** `src/src/components/admin/TemplateEditorTabbed.tsx` — state: `useState` ×14 (activeTab `:275`, dirtyFlags `:300`, templateValues `:312`, versionValues `:326`, sections `:333`, questions `:341`, scoringConfigState `:364`, sendResultsDefault `:440`, savingDraft `:719`, testModeOpen `:721`, publishingVersionId `:959`, publishIssues `:963`, duplicatingVersionId `:966`); `useRef` ×4 (`rawQuestionsRef` `:349`, `rawSectionsRef` `:355`, `scoringConfigRef` `:358`, `reportConfigRef` `:359`); `handleSaveDraft` `:739`; publish/duplicate `:970`/`:1038`; tab list `:1191-1352`; header action row `:1121-1169`.
- **Inspector content to extract (internal to):** `src/src/components/admin/template-editor/QuestionsTab.tsx` (2,244 lines) — `QuestionConfigForm` `:1031`, `FindingsPanel` `:645`, `ShowIfPanel` `:860`, `FindingsPreview` `:538`; internal 20/50/30 grid (W4 prototype).
- **Pure seams (reused unchanged):** `template-editor/build-version-payload.ts` (`buildVersionScoringPayload`), `lib/assessments/compute-score-result.ts` (`computeScoreResult`), `lib/assessments/scoring.ts:577` (`getPublishValidationIssues`), `template-editor/publish-readiness.ts` (`evaluatePublishReadiness`), `template-editor/question-serialization.ts`, `template-editor/sections-serialization.ts`, `template-editor/test-mode-display.ts`.
- **Server page (passes props):** `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx`.
- **Wave-plan + locked principles:** spec `19ac` §1–§2 (Approach A end-state; re-sequenced 5-wave plan; extract-don't-fork); spec `19ad` (ED2 — the immediately-prior extract-don't-fork precedent).
- **New modules (this wave):** `template-editor/hooks/*` (the hook family) + standalone inspector component files; the golden characterization test suite.
