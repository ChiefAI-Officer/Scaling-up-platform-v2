# 19t — Wave T: Question Editor Type Unlock (Jeff July-1 #10)

> **Status:** CO-VALIDATED 2026-07-05 (Codex review: 2 blockers + 1 major ACCEPTED into §T-5/§5, 1 major partially accepted into D9, 2 items OVERRIDDEN with recorded rationale — changelog §6). Next: user greenlight → TDD build.
> **Wave home:** Wave T. One PR, merged dark behind `WAVE_T_QUESTION_EDITOR_ENABLED`, same-session launch walk (D10).
> **Jeff #10 verbatim (Jul-1 PDF):** "Need the ability to add and edit questions directly on the platform." (P6 "bigger builds" tier; #11 findings logic deliberately AFTER this.)

## 0. Ground truth — what exists and what the gap actually is

Verified in code 2026-07-05 (this spec's session):

**Already built** (admin template editor, `(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit`, `TemplateEditorTabbed` + `template-editor/QuestionsTab.tsx`, DRAFT versions only — published versions are read-only with a Duplicate-to-new-draft path in the Versions tab):
- 3-column Questions tab: section navigator · drag-sortable question list · per-question config form.
- Add / duplicate / delete / reorder; label, help text, required, sort order editable on any type.
- Full SLIDER_LIKERT config (min/max/step/anchors). Sections tab (**+ Add Section works**). Scoring-tiers tab. Save Draft (`PATCH …/versions/[versionId]`, 409 `ALREADY_PUBLISHED`), Publish (validates `TemplateVersionForPublishSchema`), version history, duplicate-version.
- New questions get a generated `Q_NEW_<random>` stableKey, displayed read-only.

**The gap:** the editor shipped with only SLIDER_LIKERT active. `TEXT`, `NUMBER`, `MULTI_CHOICE` are disabled in the type dropdown ("v1.5 deferred"), cannot be added, cannot be switched to, and have no per-type config form (MULTI_CHOICE `options`/`maxChoices` survive saves only via raw-JSON passthrough — the draft model doesn't carry them). The dropdown also lists `TEXTAREA`/`COMPOUND`, which **do not exist as engine types** (speculative placeholders).

**Why this is Jeff's wall:** his instruments are dominated by exactly the disabled types — LVA: 26 TEXT + 11 NUMBER + 2 MULTI_CHOICE vs 2 sliders; QSP v1: 21 TEXT; QSP v2: 16 TEXT.

**Engine reality (all verified):** all 4 types are supported end-to-end with **zero engine changes needed**:
- Publish schema (`scoring.ts`): discriminated union `SliderLikertQuestion` | `QualitativeQuestion` (`TEXT`/`NUMBER`/`MULTI_CHOICE`, optional `options[{key,label}]` + `maxChoices`).
- Survey form (`question-input.tsx`): TEXT → 3-row textarea (10k cap + counter); NUMBER → bare numeric input (**no min/max/decimals config exists — nothing to edit beyond label/help/required**); MULTI_CHOICE → checkbox group from `options`, `maxChoices` cap enforced live.
- Submit validation (`validateAnswerValues`): TEXT type+length; NUMBER finite-number; MULTI_CHOICE array-of-strings, no duplicate keys, keys ∈ options, `maxChoices` cap.
- **Section membership resolves by `sectionStableKey` FIRST everywhere** — survey pages (`section-pages.ts`), qualitative report (`qualitative-report-model.ts` pass 1), scored report (`BrandedReport.tsx` `hasSectionMeta` path). Section-embedded `questionKeys` lists are a legacy fallback for old pinned versions only. **New questions therefore flow to form + reports automatically.**
- Report presentation: alias-keyed `SECTION_PRESENTATION` first, else `classifyPresentationByTypes` (all-NUMBER → metric-table; any MULTI_CHOICE → choices; majority slider → rating; else qa). New sections classify automatically.
- Conditional followups are code-config, not data: `REPORT_FILTERS["leadership-vision-alignment"]` = gate `S4_biggest_obstacles` + prefix `S5_why_`; a followup binds by **option key** (`S5_why_<optionKey>`, `form-visibility.ts` + report model). ⇒ option keys are load-bearing identifiers.

**Latent defect Wave T fixes:** the current dirty-questions save serializer injects a `scale{min,max,step,anchorMin,anchorMax}` object into EVERY question row, including TEXT/NUMBER/MULTI_CHOICE (harmless to the non-strict publish schema, but wrong). Wave T emits per-type payloads (§T-3).

## 1. Decision log (all user-confirmed 2026-07-05)

| # | Decision |
|---|---|
| D1 | **Full type unlock** — add/edit TEXT, NUMBER, MULTI_CHOICE in the existing editor (extend `QuestionsTab` in place; no new editor, no engine change). Remove the fake TEXTAREA/COMPOUND placeholders (flag-on UI only). |
| D2 | **Flag** `WAVE_T_QUESTION_EDITOR_ENABLED` (default OFF, `_KILL` override, Wave-M/N/O truthiness, call-time env reads) gates the **UI unlock only**. Flag off ⇒ today's slider-only editor byte-identical (v1.5 placeholders included). Kill = zero the flag. |
| D3 | **Slug keys + inherited-lock.** New questions: stableKey derived from label at first save, then immutable. Inherited questions (see §T-4): stableKey AND type locked; type change = delete + add-new (stated plainly in the UI). ADR-0001: reword keeps the key; semantic change = new key. |
| D4 | **Delete guard**: deleting an inherited question opens a confirm dialog naming the stableKey + consequence classes (cross-version trends for this key end; a locked Esperto crosswalk mapping it will refuse imports against the new version; any Wave S peer benchmark on it gets pruned). New-to-draft questions delete silently (as today). |
| D5 | **Unconditional PATCH validation, validate-don't-strip** — the version PATCH validates each question row with `QuestionSchema` (+ row-level structural checks §T-5) and persists the **original payload**, never Zod output (Zod parse would strip `recommendations[]`/unknown future fields). Not flag-gated: it's correctness, not capability (all existing drafts/seeds conform). **Kill-story split (co-validate C2):** the flag kills only the UI unlock; the T-5 validation + T-3 serializer are non-killable hardening — their kill is revert-commit (Wave R precedent for correctness-class changes). |
| D6 | **Conditional-question authoring OUT of scope.** Existing LVA pairs keep working (inherited keys + option keys locked). Authoring new show-if logic is a follow-on feeding Jeff #11. Documented limitation. |
| D7 | **Launch walk = throwaway TEST template E2E** (Wave S zero-exposure pattern): local-UI pilot against prod DB with the flag inline BEFORE the prod flip; TEST template published (never a live instrument); test campaign with safe test member, token minted, NO email; submit; verify report; clean up; authorized prod flag flip; smokes. |
| D8 | **Slug rule: section-prefixed, union-unique.** Key = section prefix (section stableKey up to its first `_`, e.g. `P1`, `S1`) + `_` + `lower_snake(label)` truncated to 40 chars total; uniqueness enforced against the UNION of current-draft keys + ALL published-version keys of the template; collision appends `_2`/`_3`; empty label at save = validation error. New MULTI_CHOICE option keys: `lower_snake(option label)`, unique within the question. |
| D9 | **Inherited editability: reword-class free, structure warns.** Freely editable on inherited questions: label, helpText, required, sortOrder, maxChoices, option LABELS. Warn (same dialog class as D4): removing an option from an inherited MULTI_CHOICE (orphans its `S5_why_` followup + vote-share history) **and — added at co-validate (C4 partial) — changing an inherited slider's scale** (min/max/step; measurement-semantics drift named in the copy; previously silent). Silent: adding options (additive, new slug key). Rationale for warn-not-lock: version pinning isolates past campaigns and ADR-0016 makes all computed deltas same-version-only, so structural edits cannot corrupt computed history — the exposure is interpretive, which a named warning addresses. |
| D10 | **One PR, merged dark, same-session launch.** No migration (schema-free wave). ADR-0020 (slug keys + inherited-lock) ships in the PR. Kill = zero the flag. |

## 2. Design

### T-1 — Flag

New `src/src/lib/assessments/wave-t-flags.ts` — `isQuestionEditorUnlockEnabled()`, mirroring `wave-s-flags.ts` exactly (KILL > ENABLED, call-time reads, `"1"/"true"/"TRUE"/"yes"`). Consumed ONLY by the edit page server component, which passes a boolean prop into `TemplateEditorTabbed` → `QuestionsTab`. No server write path is flag-gated (D5 rationale; the PATCH accepted these payloads before Wave T too).

### T-2 — Editor UI (flag ON)

All inside `QuestionsTab.tsx` + `TemplateEditorTabbed.tsx` serialization; wireframe base stays `17-admin-template-editor-questions.html` (3-column layout unchanged).

- **Type dropdown**: `SLIDER_LIKERT`, `TEXT`, `NUMBER`, `MULTI_CHOICE` — all enabled **only while the question is new-to-draft**; on inherited questions the select is disabled with helper text "Type is locked once published — a different type is a new question (delete + add)." TEXTAREA/COMPOUND placeholders and the v1.5 info cards are removed in the flag-on render (flag-off keeps today's UI byte-identical).
- **Per-type config** (replaces the disabled accordions):
  - TEXT — no extra block (label/help/required suffice; helper notes the 10k answer cap + textarea render).
  - NUMBER — no extra block (helper notes: free numeric entry, finite-number validation; put units/bounds guidance in help text).
  - MULTI_CHOICE — options editor: rows of key (read-only once persisted; new options show "auto from label") + label input + remove button; "+ Add option"; `maxChoices` numeric input (blank = unlimited); client checks: ≥1 option to save, maxChoices ≤ option count.
- **Add question**: unchanged button; new question starts as `SLIDER_LIKERT` (today's default) with a placeholder key badge "key assigned on save"; type switchable while new-to-draft.
- **Draft model**: `QuestionDraft` gains `options: Array<{key,label,isNew}>` + `maxChoices: number | null` + `isInherited: boolean` + `isNewToDraft: boolean`. Hydration reads options/maxChoices from raw JSON; serialization (§T-3) writes them back explicitly.
- **Dialogs (D4/D9)**: one `ImpactConfirmDialog` used for inherited-question delete and inherited-option remove; copy enumerates the consequence classes with the concrete key(s).

### T-3 — Per-type serialization + key assignment (client, at Save Draft)

Replaces the always-emit-`scale` serializer. For each question row (raw-spread FIRST, as today, preserving key order + unknown fields like `recommendations[]`):
- `SLIDER_LIKERT` → emit `scale{...}`; strip `options`/`maxChoices` if the question was retyped while new.
- `TEXT`/`NUMBER` → emit neither `scale` nor `options` (and drop a stale `scale` left by the old serializer or a retype).
- `MULTI_CHOICE` → emit `options` (keys per D8) + `maxChoices` (omit when blank); never `scale`.
- **Key assignment happens here** (first save of a new question): derive per D8 against the union key set (published keys are passed in as a prop, §T-4; draft keys come from local state). After assignment the draft's stableKey is fixed and displayed read-only, exactly like inherited keys.
- Pure helpers (`template-editor/question-serialization.ts`, new file next to `sections-serialization.ts`): `deriveStableKey(label, sectionKey, taken)`, `deriveOptionKey(label, taken)`, `buildQuestionsPayload(drafts, {rawQuestions, dirty})` — unit-testable without the component. Content-hash stability contract carries over: not-dirty ⇒ byte-for-byte raw passthrough.
- Edge rules: a label whose slug is EMPTY after sanitization (punctuation/emoji-only) fails save with the same error as an empty label. The existing **Duplicate** action marks the copy new-to-draft with a placeholder key; at save its identical label collides with the original and resolves via the `_2` suffix. The serializer's inherited re-check covers stableKey, type, AND inherited option keys (labels excluded — those are reword-class).

### T-4 — "Inherited" computation + locks

The edit page server component queries, for the template, **all published versions'** `questions` JSON and builds:
- `publishedKeys: string[]` (union of stableKeys) — drives `isInherited`, D8 union-uniqueness, and the D4 delete guard;
- `publishedOptionKeys: Record<stableKey, string[]>` (union per question) — drives option-key locks + the D9 remove warning.

Passed as props (server → `TemplateEditorTabbed` → `QuestionsTab`). A template with NO published versions (fresh paste-JSON MVP template) ⇒ everything is new-to-draft: types switchable, keys still slug-derived and immutable after first save, no warnings. Locks are enforced in THREE layers: the UI, the serializer re-check (inherited key/type/option-keys must equal the raw row; mismatch = client error before PATCH), and the server (§T-5 key-collision + type-lock — authoritative).

### T-5 — Server-side validation (unconditional, D5)

`PATCH …/versions/[versionId]` (`route.ts`): body schema keeps `z.array(z.unknown())`, then per-row `QuestionSchema.safeParse` + cross-row checks:
- duplicate stableKeys within the payload → 400 `DUPLICATE_STABLE_KEY`;
- stableKey format → 400 `INVALID_STABLE_KEY` (must match `^[A-Za-z][A-Za-z0-9_]{0,39}$`);
- MULTI_CHOICE: duplicate option keys / empty options / `maxChoices` > option count → 400 (mirrors publish + `validateAnswerValues` semantics);
- any row failing `QuestionSchema` → 400 `INVALID_QUESTION` with the stableKey + first Zod issue.

**Server-side identity enforcement (co-validate C1 — upgraded from "known limitation" to enforced).** The route already fetches the stored version row; it additionally runs ONE query — all published versions of this template, `select { questions }` (~5 templates × few versions × ≤65 questions; cheap) — and builds the published stableKey→type union. Then:
- a payload key **absent from the stored draft's questions** but **present in the published union** → 400 `KEY_COLLIDES_WITH_PUBLISHED` (blocks accidental history-joining AND the stale-client race where another admin publishes between page-load and save);
- a payload row whose key **is in the stored draft** with a **different `type`** → allowed only if the key is absent from the published union, else 400 `TYPE_LOCKED` (server-side D3 type-lock; retyping a new-to-draft question across saves stays legal).
- **Option-key locks remain UI-level by design**: an option-key rename is indistinguishable from remove+add, and D9 deliberately permits removal (with warning) — so the server cannot enforce a rename-lock without also blocking a permitted edit. The UI warning + the S5 followup degradation being render-time-visible bound the residual risk.

**Persist `data.questions` (the original payload) exactly as today** — validation gates, it never rewrites. Sections payload untouched. Publish route unchanged. Key **generation** stays client-side (deterministic derivation, shown to the admin); the server validates format + collisions, which is what protects the permanent identifiers (co-validate C3 resolution).

### T-6 — Downstream interactions (verified; no code changes)

- **Reports/survey**: automatic pickup via `sectionStableKey` (§0). A TEXT question added to an alias-mapped "rating" section renders via that section's presentation — acceptable; the admin sees it in the walk. New sections classify by type mix.
- **Wave S benchmarks**: panel/reconcile validate keys against the PUBLISHED version — drafts invisible until publish; deleted keys prune on next panel save; report join is omit-empty. No interaction bug.
- **Esperto crosswalks**: `validateCrosswalkAgainstVersion` fails CLOSED at import if a locked crosswalk maps a key missing from the newly-published version — safety, not corruption; surfaced in the D4 dialog copy.
- **Trends/longitudinal (ADR-0016)**: deltas are same-version-only; new keys start fresh series; deleted keys end theirs.
- **Results email**: qualitative results email builds from the same pinned-version model; new questions appear there too once a campaign uses the new version (no Wave-S-style parity concern — there is no separate builder for question content).

### T-7 — Security (standing practice)

No new routes. PATCH already has auth-first (`getApiActor` → 401), privileged-role 403, rate-limit, audit. Wave T adds the D5 validation (input hardening) and keeps `logAudit` on the PATCH as-is. No raw HTML anywhere (labels render as text). No PII surface.

## 3. Out of scope / follow-ons

- Conditional/show-if authoring (D6) → feeds Jeff #11 findings logic.
- Admin-typed stableKeys; key grammar beyond D8.
- Server-side inherited-lock enforcement (T-5 note) — candidate hardening if non-UI clients ever write drafts.
- NUMBER bounds/decimals config — requires an engine change (schema + render + validation); not needed for fidelity today.
- Scoring-config editing for new sliders on scored templates (ScoringTiersTab exists; domain wiring for NEW sections on SU-Full stays a seed-script concern).
- Editing the seed-script relationship: re-seeds remain the wholesale path (09/09b); the editor is the incremental path. A re-seed after editor edits appends a NEW draft from artifact content (hash mismatch policy per 09 §3) — the two coexist; note in ADR-0020.

## 4. Test plan (TDD; suites named per house pattern)

- `question-serialization.test.ts` — derive/collision (section prefix, truncation, union set, `_2` suffix, empty-label error); per-type payload emission (scale only sliders; options/maxChoices only MULTI_CHOICE; stale-scale dropped); raw-spread preservation (`recommendations[]`, key order); not-dirty byte-for-byte passthrough (content-hash contract); inherited key/type mismatch rejection.
- `wave-t-flags.test.ts` — truthiness matrix + KILL (mirror wave-s).
- `QuestionsTab.wave-t.test.tsx` — flag off: dropdown state byte-identical to today (guard test); flag on: 4 types enabled on new-to-draft, type select disabled on inherited, options editor CRUD, maxChoices bounds, ImpactConfirmDialog on inherited delete + inherited-option remove, silent delete on new-to-draft.
- `template-version-patch.wave-t.test.ts` — route: duplicate stableKey 400, key-format 400, invalid row 400 with key, MULTI_CHOICE structural 400s, **`KEY_COLLIDES_WITH_PUBLISHED` 400 (new key equals a published key not in the stored draft), `TYPE_LOCKED` 400 (retype of a published key) vs legal retype of a draft-only key**, valid mixed-type payload persists byte-identically (validate-don't-strip proof: payload with `recommendations[]` + unknown field survives), 409 on published unchanged.
- `edit-page.wave-t.test.tsx` — publishedKeys/optionKeys union computed across multiple published versions; fresh template ⇒ empty sets.
- Regression: existing `TemplateEditorTabbed.test.tsx`, sections-roundtrip, publish-route suites stay green; a mixed-type edited draft passes `TemplateVersionForPublishSchema`.
- E2E-ish (jsdom): add TEXT + NUMBER + MULTI_CHOICE to a draft → serialized payload → publish schema parse → `buildSectionPages` includes them → qualitative model places them (sectionStableKey pass 1).

## 5. Launch plan (D7, D10 — same-session after merge dark)

1. Merge PR dark (flag unset). `CI=true npx next build --turbopack` + targeted tests + adversarial review first, per house gates.
2. **Local-UI pilot vs prod DB, flag inline** (`WAVE_T_QUESTION_EDITOR_ENABLED=1` + `ASSESSMENT_SESSION_SECRET` + any needed wave flags — Vercel Preview lacks prod flags; known gotcha). Create a clearly-named TEST template (paste-JSON MVP or duplicate), add one TEXT + one NUMBER + one MULTI_CHOICE (with maxChoices) via the editor, verify slug keys, save, publish THE TEST TEMPLATE ONLY.
3. Test campaign on the TEST template (safe test member, token minted, **NO email** — Wave R precedent), fill via the survey UI (checkbox cap enforced live), submit.
4. Verify the respondent report renders all three answers (choices/metric/qa presentation as classified).
5. Clean up — ORDER MATTERS (immutability trigger + Wave Q guard): first close/quarantine the test campaign, THEN soft-delete (`deletedAt`) the TEST template. A published version row can NEVER be hard-deleted (the DB trigger blocks UPDATE/DELETE when `publishedAt IS NOT NULL`), and template soft-delete is blocked while active campaigns exist. Every prod mutation individually authorized.
6. Prod flag flip (individually authorized) + redeploy; smoke: editor shows unlocked types on a draft; live instruments' published reports byte-identical (no render-path change flag-on vs flag-off — the flag only touches the editor UI, assert via smoke anyway).
7. SoT: CLAUDE.md anchor + `plans/CHANGELOG.md` (`wave-t-launched`) + Notion task + memory updates.

Kill = zero the flag + redeploy (editor reverts to slider-only; drafts already saved remain valid and publishable). The T-5 validation + T-3 serializer are NOT flag-killable (deliberate — non-killable correctness hardening, C2); their kill is revert-commit.

## 6. Co-validate changelog (Codex review 2026-07-05, thread `019f30a7`)

- **C1 (blocker: inherited locks cannot be UI-only) — ACCEPTED**, converged with my independent review. §T-5 upgraded: one published-union query in the PATCH enforces `KEY_COLLIDES_WITH_PUBLISHED` + `TYPE_LOCKED` server-side (also closes the stale-props publish race). Option-key locks stay UI-level with recorded reasoning (rename ≡ remove+add, and removal is a permitted D9 edit — a server rename-lock would block permitted edits).
- **C2 (blocker: kill-switch story overstated) — ACCEPTED as documentation.** Kill story split: flag kills the UI unlock; T-5 validation + T-3 serializer are explicit non-killable hardening, kill = revert-commit (Wave R precedent). D5 + §5 updated.
- **C3 (major: client-side slug keys too weak; suggested-key + explicit confirm) — PARTIALLY ACCEPTED.** Server now validates format + collisions (the integrity half — accepted via C1). Key *generation* stays client-side and the confirm-before-save step is **OVERRIDDEN**: D3's rationale is that admins must not manage key grammar; the derived key is deterministic, displayed read-only immediately after save, and server-validated — a confirmation dialog adds friction without adding safety.
- **C4 (major: inherited structural edits too permissive — lock maxChoices/option-removal/scale) — PARTIALLY ACCEPTED, core OVERRIDDEN.** Accepted: inherited slider *scale changes* move from silent to the warn class, and warning copy names measurement-semantics drift. Overridden (user-confirmed D9): warn-not-lock — version pinning isolates every past campaign and ADR-0016 makes computed deltas same-version-only, so structural edits cannot corrupt computed history; the exposure is interpretive and the named warning addresses it. A hard lock would make routine instrument tweaks (raise maxChoices, drop a retired option) destructive delete-and-recreate operations for no data-integrity gain.
- **C5 (simplification: don't mutate prod DB for the E2E proof; use a Neon branch/staging) — OVERRIDDEN.** House launch pattern (Waves O/P/Q/R/S) is local-UI pilot against prod DB with every mutation individually authorized; behavior is already proven pre-merge by the full test suite — the walk is verification, not discovery. The TEST template + safe-test-member + no-email pattern bounds blast radius; a parallel staging env with its own flags/secrets/data adds real setup cost and validates a different environment than the one being launched. (My independent M2 DID accept a correction here: cleanup ordering vs the immutability trigger + Wave Q soft-delete guard, §5.5.)
- **My independent findings folded in:** M1 = C1 (converged); M2 cleanup ordering (§5.5); L1 Duplicate keying, L2 empty-slug rule, L3 serializer option-key re-check (§T-3).

## 7. ADR

**ADR-0020 — "Question stableKeys: slug-derived at first save; key/type/option-keys locked once published"** (ships in the PR). Hard to reverse (keys are permanent join identifiers), surprising (why can't I rename a key or change a type?), real trade-off (admin-typed vs random vs slug; draft-only vs union uniqueness). Records D3/D8/D9 + the seed-script coexistence note (§3).
