# Spec 19ae — Assessment Editor Overhaul · Wave 3: Extract shared editor state + inspector into headless hooks

> **Status:** DRAFT — brainstorm + `/grill-with-docs` + `/co-validate` (real Codex GPT-5.5 @ xhigh) DONE 2026-07-10; **awaiting final user approval before `writing-plans`.** Nothing is built.
> **Date:** 2026-07-10 · **Author:** design track (Wave ED overhaul, re-sequenced 5-wave plan — spec 19ac §2).
> **Gate:** GATED wave. Brainstorm + grill + co-validate DONE (decisions locked below). This spec + an implementation plan + user approval complete the gate.

> **/co-validate outcome (2026-07-10) — REAL Codex GPT-5.5 @ xhigh (read-only, code-grounded) + own independent review. Codex raised 5 findings, ALL ACCEPTED — 4 are architecture corrections that OVERRIDE earlier brainstorm/grill decisions (co-validate doing its job). Own review added guard-completeness + strategic findings:**
> - **C1 (controller boundary — accept; overrides the Q1 framing).** "Both shells call the hook" would create two model instances, not one. Add a stable **`TemplateEditorController`** that calls the model **once** and renders the active view (tabbed now; three-pane in W4). `TemplateEditorTabbed` splits into `TemplateEditorController` (owns the model) + `TabbedShell` (the view). W4 becomes a one-line view switch. Single-owner (Q1) is preserved — precisely, via the controller. (§3.2)
> - **C2 (selection must lift NOW — accept; overrides grill G3).** `focusedQuestionUid`/`selectedSectionStableKey` coordinate the future outline/canvas/inspector panes; leaving them inside `QuestionsTab` means W4 still performs a stateful extraction → contradicts the presentation-only goal. Lift into **`useEditorSelection`** at the controller now. Behavior-neutral; the guard pins current tab-switch selection behavior. (§3.2/§3.3)
> - **C3 (don't over-split the aggregate — accept; overrides Q2).** Dirty flags, document state, raw refs, serialization, reconciliation, and save are ONE transactional aggregate; six per-surface hooks create artificial seams that must be re-threaded (the stale-closure risk own-review F6 flagged). Extract ONE **`useTemplateEditorDraft`**; keep `useVersionActions` separate (agrees grill G2); tab/drawer routing stay in the view. The "internal reducer requires each shell to own wiring" was a false dichotomy — it doesn't. (Q3 still holds: internal `useState`, no reducer rewrite.) (§3.2)
> - **C4 (guard at the wrong boundary — accept; strengthens grill G1 + own F2/F3).** Snapshot the COMPLETE request transcript (method + URL + ordered bodies + count), not just PATCH bodies; require transition scenarios — edit-after-rerender, serializer-failure-with-ZERO-requests (fail-atomic), failed-save/retry, double-save prevention, post-save follow-up (Wave-T), and publish/duplicate POST/confirm/navigation. (§3.5)
> - **C5 (one public inspector, not four — accept; overrides Q4).** Extract ONE public **`QuestionInspector`**; keep `FindingsPanel`/`ShowIfPanel`/`FindingsPreview` private + collocated inside it (W4 mounts the inspector, not the sub-panels). "Presentational" = **controlled** mutations, not statelessness (they retain local UI state). (§3.3)
> - **Own review (complementary, accepted):** **F1** reorder driven via jsdom-friendly affordances + a hook-unit contract for question dnd (no brittle drag sim gating the guard); **F3** assert the exact serialized `fetch` body string (not a re-parsed object); **F6** preserve `useCallback` identities in the lift (largely dissolved by C3's single aggregate); **F7** mandatory, specific post-merge prod smoke. **F4** (single-PR review size) — C3/C5 shrink the wave; keep single-PR (grill G3), structured as two commit-halves (draft/controller/selection, then inspector). **F5** (ED3's ROI is contingent on W4 being built) — noted; W4 is a committed wave in the 5-wave plan, and the extraction has standalone maintainability value regardless.

> **Grill outcome (2026-07-10, `/grill-with-docs`) — decisions locked; guard determinism code-verified:**
> - **Guard determinism (code-verified):** emitted PATCH rows carry **no `uid`** (built from explicit fields, `question-serialization.ts:514-553`); `uid` is client-only, never stored/emitted; a new question's emitted `stableKey` is slug-derived (deterministic). `genUid`'s `Math.random()` never reaches the payload → **byte-exact snapshots are deterministic**. Plus `genUid` mocked to a deterministic counter for belt-and-suspenders.
> - **G1 — guard assertion surface (accepted; extended by co-validate C4, §3.5).**
> - **G2 — `useSaveDraft`/`useVersionActions` separate (accepted; C3 folds the draft/save flow into `useTemplateEditorDraft` and keeps `useVersionActions` separate — consistent).**
> - **G3 — delivery + confirmations (accepted; the selection sub-decision is OVERRIDDEN by co-validate C2 — selection lifts now).** One PR, incremental guard-green commits. Hooks in `template-editor/hooks/`.

> **Brainstorm outcome (2026-07-10) — 5 decisions locked, code-grounded (some refined by co-validate above):**
> 1. **Q1 — headless boundary = a stateful model is the single owner (Option A).** *Refined by C1:* a `TemplateEditorController` owns the one model instance and hands it to the active view; both views are thin renderers. (§3.2)
> 2. **Q2 — composed hook family (Option B).** *Overridden by C3:* consolidated into ONE `useTemplateEditorDraft` transactional aggregate + `useVersionActions` + `useEditorSelection`; view-level routing stays in the view. (§3.2)
> 3. **Q3 — mechanical lift; preserve every wart (Option A).** Behavior relocated, never changed; internal `useState` preserved (no reducer rewrite). Warts preserved: scoringConfig dual-copy, `new Set(publishedQuestionKeys)` fresh-per-render, six section handlers drilled twice. (§3.4)
> 4. **Q4 — extract the inspector NOW, controlled-by-props (Option A).** *Refined by C5:* extract ONE public `QuestionInspector`; sub-panels stay private. (§3.3)
> 5. **Q5 — byte-equivalence guard = golden characterization suite, written first (Option A).** *Extended by C4* to the full request transcript + transition scenarios. (§3.5)
>
> **No flag (confirmed by the user).** ED3 adds no capability — a pure structural refactor. A dark flag would ship dead code nothing consumes. Live on merge; the byte-equivalence guard is the safety; **kill = revert-the-commit**. (§3.6)

> **ADR:** none proposed (additive, reversible refactor — fails "hard to reverse"; the governing "extract, don't fork" principle is already locked at the overhaul level, 19ac §2). **No CONTEXT.md glossary change** — ED3 is purely implementation; it introduces no term meaningful to a domain expert.

---

## 1. Context & problem

The admin template editor (`admin/assessments/templates/[id]/versions/[versionId]/edit`, `TemplateEditorTabbed.tsx`) authors every instrument (SU-Full, LVA, QSP, Website Assessment, + new custom templates). Audience: **ADMIN/STAFF only** (~3 internal experts).

Today `TemplateEditorTabbed.tsx` is a **1,393-line state-owning monolith**: 14 `useState`, 4 `useRef`, ~8 `useMemo`, 25 `useCallback`, 2 `useEffect`. It owns the entire document model (`questions`, `sections`, `scoringConfigState` + shadow `scoringConfigRef`, three raw round-trip refs, `dirtyFlags`, `activeTab`) and the whole `handleSaveDraft` orchestration (serialize-before-fetch → `ops[]` PATCH array → post-save ref reconciliation → `assignedKeys`→state → dirty reset). Every tab is a controlled child. The "inspector" content — `QuestionConfigForm`, `FindingsPanel`, `ShowIfPanel`, `FindingsPreview` — is **trapped as internal, un-exported code inside `QuestionsTab.tsx`** (2,244 lines), which already renders a 20/50/30 outline│canvas│inspector grid internally (the prototype for W4). There are **zero custom hooks** in the editor today; the established pattern is strictly *pure function + thin component*.

The locked end-state (Approach A, spec 19ac §1) is a **three-pane working editor** (outline · canvas · inspector). Building that in W4 against today's monolith would force either (a) a **parallel editor component** — the banned fork, risking drift — or (b) rewriting state inline in a new shell with no equivalence guarantee. **W3 removes that dilemma**: lift editor state + the inspector into a controller-owned model + a reusable inspector component, so both the tabbed shell and the W4 three-pane are thin views over the same model — the layout swap is a *presentation change, not a fork*.

## 2. Where this sits in the wave plan

Wave 3 of the re-sequenced 5-wave overhaul (spec 19ac §2) — the **pivot wave** between the two shipped capability waves (ED1 Test Mode, ED2 Safe-to-Publish, both LAUNCHED) and the layout rebuild (W4 three-pane, kill-able, earned last).

**Migration principle (all waves): extract, don't fork.** ED1/ED2 proved it with *pure lib/payload helpers*. **ED3's distinct target is the STATEFUL editor logic** — the `useState`/`useCallback`/`useMemo` graph + the inspector — lifted into a controller-owned model + a reusable component so both shells consume the same source.

---

## 3. Wave 3 — Extract shared editor state + inspector (this wave)

### 3.1 Goal
Split `TemplateEditorTabbed` into a **`TemplateEditorController`** (owns the whole editor model) + a **`TabbedShell`** view, and lift the inspector out of `QuestionsTab` into a reusable **`QuestionInspector`** — with **zero user-facing change**, proven by a byte-equivalence guard. W4's three-pane then becomes a second view the controller can render, over the same model — a presentation swap, not a fork.

### 3.2 Architecture — a controller owns ONE model; the view renders it (Q1+Q2, revised by co-validate C1/C3)

**A stable `TemplateEditorController` calls the model hook ONCE and hands it to the active view** (C1). The two views don't each call the hook — the controller creates the model once and passes it down, so W4's swap is a one-line view switch inside the controller and byte-identity holds because there is literally one model. Today's `TemplateEditorTabbed` splits into `TemplateEditorController` (owns the model) + `TabbedShell` (the current tab UI). Placement: `template-editor/hooks/` (hooks) + controller/shell in `template-editor/`.

The model is **not over-split** (C3): document state, dirty flags, raw refs, serialization, save, and reconciliation are ONE transactional aggregate; per-surface hooks create seams that must be re-threaded (the stale-closure risk).

| Unit | Owns |
|---|---|
| **`useTemplateEditorDraft`** | the transactional aggregate — `templateValues`, `versionValues`, `sections`, `questions`, `scoringConfigState` (+ `scoringConfigRef` dual-copy, Q3), `rawQuestionsRef`/`rawSectionsRef`/`reportConfigRef`, `dirtyFlags`/`isAnyDirty` + the 5 `setXDirty`, all field/section/question change handlers, and the full `handleSaveDraft` (serialize-before-fetch via the shared `buildVersionScoringPayload` → `ops[]` → `Promise.all` → post-save ref reconciliation → `assignedKeys`→state → dirty reset). Internal `useState` preserved (Q3 — no reducer rewrite). |
| `useVersionActions` | `handlePublishVersion`/`handlePublish`/`handleDuplicateVersion`, `publishIssues` (→ `PublishFailureModal`), in-flight ids — genuinely independent of the draft flow (C3 + grill G2). |
| `useEditorSelection` | `focusedQuestionUid`, `selectedSectionStableKey` — **lifted to the controller now** (C2), so the future panes share selection and W4 is presentation-only. |
| `useTemplateEditorModel` | composes the three → the `{ state, handlers }` the controller holds and passes to the view. |

- **View-level concerns stay in the view, not hooks** (C3): `activeTab` + `?tab=` routing and `testModeOpen` (drawer open/close) are presentation state owned by `TabbedShell`; the W4 three-pane owns its own equivalents. Not part of the shared model.
- **The existing React-free seams are unchanged** (`buildVersionScoringPayload`, `computeScoreResult`, `getPublishValidationIssues`, `question-serialization`, `sections-serialization`, `test-mode-display`) — `useTemplateEditorDraft` calls them, keeping ED1/ED2's anti-drift intact.
- **`useCallback` identities preserved exactly** in the lift (own review F6) — the aggregate hook keeps each handler's memoization + deps so child re-render behavior is unchanged. Consolidating the transactional core in one hook removes the cross-hook threading that made this fragile.
- **Selection lift is behavior-neutral (Q3):** the guard pins current tab-switch selection behavior (e.g. whether focus resets when the Questions tab is left) and the lifted version replicates it exactly.

### 3.3 Inspector extraction (Q4, revised by co-validate C5)
Extract **ONE public `QuestionInspector`** (today's `QuestionConfigForm` role) — the single thing W4's inspector pane mounts. `FindingsPanel`, `ShowIfPanel`, `FindingsPreview` stay **private and collocated inside `QuestionInspector`** (its implementation, not independent public APIs).
- `QuestionInspector` is **controlled** (C5): it takes `focusedQuestion` + the mutation handlers + flag props (`findingsEnabled`/`conditionalEnabled`/`isUnlocked`) as props and mutates the document only through them; it retains its own local UI state (band-editing rows, etc.). "Controlled-by-props," not stateless.
- `QuestionsTab` rewires to render `QuestionInspector` (fed by `useEditorSelection`'s `focusedQuestion`); rendered output stays **byte-identical** (guarded, §3.5). W4's inspector pane mounts the same `QuestionInspector`.

### 3.4 Mechanical lift; warts preserved (Q3)
Behavior is relocated, never changed. Three known warts preserved verbatim so the guard is a strict identity assertion: (1) `scoringConfig` dual-copy (`scoringConfigState` UI + `scoringConfigRef` read synchronously by the PATCH) — kept inside `useTemplateEditorDraft`; (2) `new Set(publishedQuestionKeys)` fresh-per-render into `TestModeDrawer`; (3) six section handlers drilled through both `MetadataTab` and `SectionsTab`. *(Cleanup out of scope; two dissolve in W4's single-outline layout; the dual-copy is a W5 candidate.)*

### 3.5 Byte-equivalence guard (Q5, extended by co-validate C4)
- **Determinism (code-verified).** Emitted PATCH rows carry no `uid` (`question-serialization.ts:514-553`); new-question `stableKey` is slug-derived → byte-exact snapshots reproduce. Belt-and-suspenders: **mock `genUid` to a deterministic counter**.
- **Golden characterization suite, written first (Task 1).** RTL renders the current `TemplateEditorTabbed` — **reusing the existing render harness** (`src/__tests__/components/admin/TemplateEditorTabbed.test.tsx` + `template-editor-tabbed.wave-t.test.tsx` already mock `next/navigation` + `useToast` + @dnd-kit and render the full editor). A scripted edit sequence drives it; assertions:
  - the **complete outgoing request transcript** (C4) — every `fetch`'s **method + URL + ordered serialized body string + total count** (own review F3: the exact body string, not a re-parsed object), across the tricky paths (new-question D8 slug-key assignment, inherited key/type/option-key locks, findings bands, showIf, the multi-choice option editor, sections reorder);
  - the derived behaviors — `isAnyDirty`, Save-Draft disabled, `?tab=` routing;
  - the **post-save reconciliation *result*** — questions-state `stableKey`/`isNew` + the `rawQuestionsRef`/`rawSectionsRef` overwrite, asserted **by stableKey, never by random uid**.
  - It does **not** assert every panel prop (identical transcript + identical rendered inspector ⇒ identical load-bearing props).
- **Transition scenarios (C4 + own review F1/F2).** Beyond the happy path, the suite pins: **serializer failure ⇒ ZERO requests** (the fail-atomic `QuestionSerializationError` early-return); **double-save prevention** (the `savingDraft` guard — a second Save while one is in flight issues no second transcript); **failed save → retry**; **edit-after-rerender**; the **independent `sendResultsDefault` PATCH** (fires outside the dirty/save flow); the **Wave-T follow-up save** (add question → save → non-dirty-questions save must NOT drop the added question); and — because publish/duplicate move into `useVersionActions` — their **POST + confirm + navigation** behavior. Reorder is driven via jsdom-friendly affordances (section MoveUp/MoveDown buttons) + a hook-unit contract test for question dnd (F1 — no brittle drag simulation gating the guard).
- **Fixtures:** a slider-heavy instrument + one carrying the LVA multi-choice (`S4_biggest_obstacles`) + a text/number mix. (Precise content + step count finalized in the plan; see §5.)
- **Held green through every slice.** A broken byte assertion means the slice changed output → not done.
- **Inspector check (light, structural):** `QuestionInspector` renders for a focused question with the correct fields/handlers wired — not a brittle full DOM snapshot.
- **Existing seam parity tests stay as-is** (they lock the shared-helper anti-drift from ED1/ED2).

### 3.6 Flag & kill — **none**
ED3 adds no capability → no `WAVE_ED3_*` flag. It rewires the live editor in place; the byte-equivalence guard is the safety; **kill = revert-the-commit**. (A dark flag would ship dead code nothing consumes.)

### 3.7 Build shape (subagent-driven TDD, incremental — one PR, guard-green commits)
1. **Guard suite first** — the golden transcript + transition scenarios vs. current code; watch green on main.
2. **Split** `TemplateEditorTabbed` → `TemplateEditorController` (owns model) + `TabbedShell` (view); no logic moved yet — guard green.
3. **`useEditorSelection`** — lift selection from `QuestionsTab` to the controller (C2); guard green (incl. tab-switch behavior).
4. **`useTemplateEditorDraft`** — extract incrementally *within one hook* (document state + dirty + refs → change handlers → `handleSaveDraft` + reconciliation); guard green after each internal step (the `handleSaveDraft` step is the highest-risk — adversarial-review focus on closures).
5. **`useVersionActions`** — publish/duplicate + `publishIssues`.
6. **`useTemplateEditorModel`** composer; controller becomes thin over it.
7. **`QuestionInspector`** — extract with private sub-panels; rewire `QuestionsTab` (the natural second commit-half, F4).
8. Final full-suite + `CI=true npx next build --turbopack` + multi-lens adversarial review.

### 3.8 Verification
`CI=true npx next build --turbopack` green · targeted Jest on the guard suite + each new hook + `QuestionInspector` · full-suite sweep (no new failures beyond known pre-existing suites) · multi-lens adversarial review (closure-safety of `useTemplateEditorDraft`) · **no flag flip** (no user-facing change). **Mandatory post-merge prod smoke (own review F7):** open a real DRAFT → edit a question, section, and scoring value → Save Draft → Publish → confirm success — proving live parity before the wave is considered done.

## 4. Non-goals
No schema change. No data migration. **No weakening of immutable-key / published-version-freeze invariants** (editor read-only on published; DRAFT-only authoring; explicit Save Draft, not autosave). **No new scoring/findings/report code paths** — reuse the pure seams verbatim. **No three-pane / layout change** (that's W4). No question type-model change (4-type Zod union stands; no radio/single-select type). Scoring tiers/domains stay **instrument-level**. `sendResultsDefault` stays its own independent immediate-PATCH path. **No behavioral cleanup of the three warts** (§3.4). No new flag. No reducer rewrite (internal `useState` preserved).

## 5. Resolved / open items
- ~~**Controller/owner boundary**~~ — **RESOLVED (co-validate C1):** `TemplateEditorController` owns one model, hands it to the active view. (§3.2)
- ~~**Selection-state lift**~~ — **REVISED (co-validate C2, overrides grill G3):** lifted NOW into `useEditorSelection` at the controller — leaving it local means W4 still does a stateful extraction. Behavior-neutral; guard pins tab-switch behavior. (§3.2/§3.3)
- ~~**Hook decomposition**~~ — **REVISED (co-validate C3, overrides Q2):** one `useTemplateEditorDraft` aggregate + `useVersionActions` + `useEditorSelection`; routing stays in the view. (§3.2)
- ~~**Inspector surface**~~ — **REVISED (co-validate C5, overrides Q4):** one public `QuestionInspector`; sub-panels private+collocated. (§3.3)
- ~~**Guard boundary/coverage**~~ — **RESOLVED (co-validate C4 + grill G1):** full request transcript + transition scenarios (fail-atomic zero-requests, double-save, retry, Wave-T, publish/duplicate). (§3.5)
- ~~**Guard determinism**~~ — **RESOLVED (grill, code-verified):** `uid` never emitted; `genUid` mocked. (§3.5)
- ~~**`useVersionActions` vs save**~~ — **RESOLVED (grill G2 + C3):** separate. (§3.2)
- ~~**Hook file placement**~~ — **RESOLVED (grill G3):** `template-editor/hooks/`; naming finalized at build.
- **Open — exact guard fixtures:** the three fixture shapes are set (§3.5); precise instrument content + edit-step count finalized in the implementation plan.
- **Assumption (own review F5):** ED3's primary ROI is de-risking W4; W4 is a committed wave in the 5-wave plan. The extraction also has standalone maintainability value (shrinks the 1,393- and 2,244-line files).

## 6. References (grounded against current `main`, 2026-07-10)
- **Editor shell (refactor target → controller + `TabbedShell`):** `src/src/components/admin/TemplateEditorTabbed.tsx` — `useState` ×14 (activeTab `:275`, dirtyFlags `:300`, templateValues `:312`, versionValues `:326`, sections `:333`, questions `:341`, scoringConfigState `:364`, sendResultsDefault `:440`, savingDraft `:719`, testModeOpen `:721`, publishingVersionId `:959`, publishIssues `:963`, duplicatingVersionId `:966`); `useRef` ×4 (`rawQuestionsRef` `:349`, `rawSectionsRef` `:355`, `scoringConfigRef` `:358`, `reportConfigRef` `:359`); `handleSaveDraft` `:739`; publish/duplicate `:970`/`:1038`; tabs `:1191-1352`; header row `:1121-1169`.
- **Inspector content to extract (internal to):** `src/src/components/admin/template-editor/QuestionsTab.tsx` (2,244 lines) — `QuestionConfigForm` `:1031` → the new public `QuestionInspector`; `FindingsPanel` `:645`, `ShowIfPanel` `:860`, `FindingsPreview` `:538` → its private children; selection `focusedQuestionUid`/`selectedSectionStableKey` → `useEditorSelection`.
- **Pure seams (reused unchanged):** `template-editor/build-version-payload.ts`, `lib/assessments/compute-score-result.ts`, `lib/assessments/scoring.ts:577` (`getPublishValidationIssues`), `template-editor/publish-readiness.ts`, `template-editor/question-serialization.ts` (`:514-553` emission — no uid), `template-editor/sections-serialization.ts` (`genUid` `:24`), `template-editor/test-mode-display.ts`.
- **Existing RTL harness (reuse for the guard):** `src/__tests__/components/admin/TemplateEditorTabbed.test.tsx`, `template-editor-tabbed.wave-t.test.tsx`.
- **Server page (passes props):** `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx`.
- **Wave-plan + locked principles:** spec `19ac` §1–§2; spec `19ad` (ED2 precedent).
- **New units (this wave):** `template-editor/hooks/{useTemplateEditorDraft,useVersionActions,useEditorSelection,useTemplateEditorModel}.ts` · `TemplateEditorController` + `TabbedShell` · `QuestionInspector` · the golden characterization suite.
