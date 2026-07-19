# 19am-plan — Wave ED10 implementation plan (TDD)

> **For agentic workers:** REQUIRED SUB-SKILL — use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Design SoT = `19am-editor-wave10-preview-settings.md`. **To be co-validated by Codex before build; findings fold in here (§Co-validation).**

**Goal:** Replace the editor's **Metadata** tab with a read-only **Preview** tab (facts strip + the real branded `SectionPager` in a new `previewMode`, toggling Active↔draft) and fold every non-question setting into one plain-language **Settings** tab (access read-only · humanized aggregation · language · both emails + approval + send-default · access-groups link · read-only alias) — behind `WAVE_ED10_PREVIEW_SETTINGS_ENABLED`, gated on ED9 forms mode, with flag-OFF byte-identical to today and that byte-identity proven by golden snapshots + the frozen suites.

**Architecture:** One derived **`ed10Active`** gate in `TabbedShell` (the same place ED4/ED6/ED9 branch), `= previewSettingsEnabled && formsBuildEnabled && single` (D10). When active: `metadata` → **`preview`** + **`settings`**, the Access `<Link>` leaves the bar, Preview is the param-less default, header pills humanized. Inactive: today's editor, unchanged (incl. the Build default in forms mode).
- **Preview render** — `assembleSurveyPages` **composes** `org-survey-client`'s existing pure functions (incl. the SU-Full non-CEO audience filter) + a tolerant **draft-to-pager / stored-JSON adapter**; `org-survey-client` is left unrefactored (no `/me` deserializer exists to reuse). `SectionPager` gains an additive **`previewMode`** that **disables controls** (keeps content in the a11y tree — not `inert`), skips the required gate, disables Submit, and clamps `sectionIndex`. Default-off ⇒ the live survey is byte-identical.
- **Save model (split by version-governance)** — invitation email (`contentHash`) + Language stay **Save-Draft** (draft-only); aggregation + results email + approval get an explicit per-card **Save** (editable while published, via the existing template PATCH; no on-blur, to avoid PATCH-reorder races); `sendResultsDefault` keeps its immediate Wave-Q PATCH.

**Tech stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind + shadcn tokens · Jest + React Testing Library · Playwright (post-launch). Build gate: `CI=true npx next build --turbopack` from `src/`.

---

## Co-validation (DONE 2026-07-17 — real Codex, CLI fallback)

The MCP Codex wrapper hung (1800s idle timeout, no threadId — the ED1/ED8 class); ran **`codex exec` CLI directly** (gpt-5.6-sol @ xhigh, read-only). Codex verdict: **no-go as written** — **6 findings, all verified against code and accepted (no overrides)**; the grilled **D9 was re-decided** with the user (its premise was false). Mapping:

| Codex finding | Verified | Folds into |
|---|---|---|
| **C1** Invitation email is in the version `contentHash` (`template-content-hash.ts:10`) → editing it while published breaks provenance | ✅ confirmed | **Revised D9** — invitation email stays Save-Draft (draft-only); T7/T8 |
| **C2** O1/O2 insufficient — concurrent on-blur PATCHes reorder → lost edits / stale approval; prefer explicit Save + disable-approval-while-dirty | ✅ (concurrency) | **Explicit per-card Save** (not on-blur); T7/T8 (supersedes O2's blur design) |
| **C3** No `/me` deserializer (route casts JSON, `me/route.ts:88,139`); editor-draft≠pager shapes; helper omits SU-Full non-CEO background filter (`org-survey-client.tsx:227`) | ✅ confirmed | **T5** — draft-to-pager adapter + shared audience-policy helper; leave `org-survey-client` unrefactored (supersedes O3) |
| **C4** `inert` strips questions/help from the a11y tree; pager `sectionIndex` not clamped on toggle/delete | ✅ (a11y) | **T4/D2** — disable controls only (keep content readable) + clamp sectionIndex; test empty/first-Back/submit |
| **C5** flag-OFF default is Build in forms mode (`TabbedShell.tsx:351`), so "inactive default = metadata" *regresses* ED9 | ✅ confirmed (default half) | **T3/T10** — one `ed10Active` gate; flag-OFF default = existing computed default (supersedes O4). _(C5's "T9 delete-confirm changes flag-OFF behavior" half is **void** — Build already confirms via `useEditorCommands`; T9 is a no-op, so no delete behavior changes.)_ |
| **C6** not "presentation only" (aggregation/email edits hit live campaigns) → impact copy + merge-gate respondent testing; real language id is `enUS` not `en-US` (`active-version.ts:43`) | ✅ confirmed | Spec §1/§4; **T5** (enUS lookup), **T8** (impact copy), **T11** (respondent-flow merge gate) |

**Own review (O1–O4, pre-Codex):** O1 (one-writer) → folded into T7 but now moot for invitation email (stays Save-Draft); O2 → superseded by C2's explicit-Save; O3 → superseded/refined by C3; O4 → merged with C5. Net: Codex strengthened the own-review; no conflicts.

## File structure

**New:**
- `src/src/lib/assessments/wave-ed10-flags.ts` — `isPreviewSettingsEnabled()` (+ `_KILL`). Mirrors `wave-ed9-flags.ts`.
- `src/src/lib/assessments/assemble-survey-pages.ts` — `assembleSurveyPages(sections, questions, {answers, customSlides, templateAlias, isCEO})` that **composes** `org-survey-client`'s existing pure functions (sort → audience policy → `filterVisibleSurveyQuestions` → `buildSectionPages` → `filterConditionallyEmptiedPages` → `mergeCustomSlides`) — a shared **audience-policy** step (SU-Full non-CEO `dropBackground`, C3) lives here. `org-survey-client` is **not** refactored; this composes the same functions so both can't diverge.
- `src/src/lib/assessments/preview-version-adapter.ts` — a tolerant **draft-to-pager adapter** (editor draft rows → `PagerSection[]`/`PagerQuestion[]`) and a stored-JSON adapter for the Active version (C3; no `/me` deserializer exists to reuse).
- `src/src/components/admin/template-editor/PreviewTab.tsx` — facts strip (version toggle + counts + language) + the read-only `SectionPager previewMode` render (draft = live model via the adapter, active = loaded prop via the adapter).
- `src/src/components/admin/template-editor/SettingsTab.tsx` — the consolidated settings column (§3.3 of the spec), with the per-card Save lanes.
- Test files alongside each, **plus** `__tests__/.../ed10-golden-snapshots.test.tsx` (flag-OFF **forms-mode** editor shell incl. Metadata tab + Build default; INVITED SectionPager pre-`previewMode`) and `preview-settings-flag-off-parity.test.tsx`.

**Modified:**
- `TabbedShell.tsx` — derive one **`ed10Active`** gate; the routing/label/panel/default seam (Preview/Settings replace Metadata; Access link removed; Preview default) + humanized header pills — **all** keyed off `ed10Active`. Flag-OFF path (incl. the existing Build default in forms mode) untouched.
- `.../assessments/templates/[id]/versions/[versionId]/edit/page.tsx` — read `isPreviewSettingsEnabled()`; when active, load the **Active** version (`activePublishedWhere`, language **`enUS`** per `active-version.ts`) + a content select, pass as a read-only `activePreview` prop; pass the flag.
- `components/assessments/section-pager.tsx` — additive `previewMode` prop: **disable controls** (not `inert`), skip the required gate, disable Submit / no `onSubmit`, and **clamp `sectionIndex`** on page-list change (C4). Default-off = byte-identical.
- `components/admin/template-editor/enum-labels.ts` — add `ACCESS_MODE_LABELS`, `AGGREGATION_MODE_LABELS`, `LANGUAGE_LABELS` (keyed by the real `enUS` values; unknown ⇒ self).
- `hooks/useTemplateEditorDraft.ts` (+ model + controller) — **(a)** trim the Save-Draft metadata PATCH body to `{name, description, invitationSubject, invitationBodyMarkdown}` (invitation email stays draft-governed; C1); **(b)** add per-card **Save** handlers for aggregation + results-email (subject/body + approval) that PATCH the existing endpoint, editable while published, with saving/saved/error state and approval-disabled-while-dirty (C2); `sendResultsDefault` immediate path unchanged.
- `components/admin/AssessmentTemplateDetail.tsx` (or wherever the language `<select>` options live) — correct the `<select>` values from `en-US…` to the real `enUS…` (C6), or narrow the options to the stored value.
- `FormsBuilder.tsx` + `hooks/useSingleColumnBuilderController.ts` — wire `commands.deleteSection` through the `collectSectionDeleteImpact` + `buildSectionDeletePrompt` confirm **only when `ed10Active`** (C5); flag-OFF keeps the confirm-less delete.
- `.env.example` / env docs — add the two levers.

## Constraint evidence (from spec 19am §4)

| Constraint | Evidence (file:line) | ED10 handling |
|---|---|---|
| Template PATCH already accepts all Settings fields | `api/admin/assessment-templates/[id]/route.ts:88-104` | Per-card Save + the `sendResultsDefault` toggle reuse it; no new route/schema |
| Only `sendResultsDefault` PATCHes immediately today | `hooks/useTemplateEditorDraft.ts:222-246` | Model for the toggle; aggregation/results use explicit per-card Save (same endpoint, C2) |
| Metadata fields are Save-Draft-dirty (disabled on published) | `useTemplateEditorDraft.ts:173,207-219`; Save Draft `disabled={isPublished…}` (`TabbedShell.tsx:633`) | Move template-row fields off Save Draft → editable while published |
| Tab routing is a bijection; `metadata` is a valid id + default | `TabbedShell.tsx:82-88,288-305,351-403` | Add `preview`/`settings` flag-gated; flag-OFF unchanged |
| h2-hide gate pattern | `TabbedShell.tsx:582` (`formsBuildEnabled && single`) | Reuse the exact gate for ED10 (D10) |
| Survey page assembly pipeline | `org-survey-client.tsx:480-495` | Extract `assembleSurveyPages`; Preview reuses it |
| Build section-delete ALREADY confirms | `useEditorCommands.ts:219-289` (`window.confirm(buildSectionDeletePrompt(...))` before `model.deleteSection`); `FormsBuilder.tsx:164` (`onDelete={commands.deleteSection}` = the wrapped command) | T9 no-op; dropping the Metadata card loses no confirmed path (D12) |
| Section description already respondent-visible | `section-pager.tsx:275` | Preview renders it for free |
| **Invitation email is in the version `contentHash`** | `template-content-hash.ts:10` | Invitation email stays Save-Draft/draft-only (C1) |
| **Audience filter: SU-Full non-CEO `dropBackground`** | `org-survey-client.tsx:227` | `assembleSurveyPages` applies it (C3) |
| **No `/me` deserializer — route casts stored JSON** | `me/route.ts:88,139` | explicit draft-to-pager + stored-JSON adapter (C3) |
| **Real language id is `enUS`** (select offers `en-US`) | `active-version.ts:43` | Active lookup + labels use `enUS`; fix the select (C6) |
| **Forms-mode default tab is already Build/`questions`** | `TabbedShell.tsx:351` | flag-OFF default unchanged; `ed10Active` ⇒ `preview` (C5) |

---

## Tasks

### T0 — Baseline + golden byte-identity net
- [ ] Run the full `template-editor` + `assessments` jest sweep; record the green baseline (exit code checked — no `| tail` swallowing).
- [ ] Add `ed10-golden-snapshots.test.tsx`: capture `container.innerHTML` of (a) the flag-OFF editor shell **including the Metadata tab panel + the Access link + `?tab=metadata` routing**, and (b) the INVITED `SectionPager` render (representative template) **before** any `previewMode` change. These stay green verbatim through every task (the real byte-identity proof).

### T1 — Flag module + prop plumbing (no behavior)
- [ ] `wave-ed10-flags.ts` → `isPreviewSettingsEnabled()` (+ `_KILL`), mirroring `wave-ed9-flags.ts`. Unit test the two levers.
- [ ] Edit page reads it; passes `previewSettingsEnabled` to `TabbedShell`. `TabbedShell` accepts the prop but does nothing with it yet. Golden/frozen suites stay green.

### T2 — enum-labels + humanized header pills (C-1)
- [ ] Extend `enum-labels.ts` with `ACCESS_MODE_LABELS` (`INVITED`→"Invited", …), `AGGREGATION_MODE_LABELS` (`FULL_VISIBILITY`→"Everyone", `CEO_ONLY`→"CEO-only"), `LANGUAGE_LABELS` keyed by the **real stored values** (`enUS`→"English (US)", … — NOT `en-US`, C6); unknown ⇒ self. Unit tests.
- [ ] In `TabbedShell`, render the header access/aggregation pills through the label maps **only when `previewSettingsEnabled && formsBuildEnabled && single`**; else raw enums (byte-identical). Test both states.

### T3 — Tab routing + the `ed10Active` gate (D8/D11, C5)
- [ ] Introduce one derived **`ed10Active = previewSettingsEnabled && formsBuildEnabled && activeAuthoringMode === "single"`** in `TabbedShell`; every ED10 branch keys off it.
- [ ] Valid-id set + default derived from `ed10Active`. **Active:** ids `{preview, questions, scoring, settings, versions}`, param-less ⇒ `preview`, `?tab=metadata` ⇒ `settings`, `?tab=questions` ⇒ Build, unknown ⇒ `preview`. **Inactive:** **unchanged from today** — ids `{metadata, sections, questions, scoring, versions}` and the *existing* computed default (`defaultTab = activeAuthoringMode !== "legacy" ? "questions" : "metadata"`, `TabbedShell.tsx:351`). **Do NOT force `metadata` as the inactive default** — in live forms mode the default is Build/`questions`; forcing metadata would regress ED9 (C5). Keep `?tab=sections` ⇒ `questions`.
- [ ] Unit tests for both flag states: active (preview default, `?tab=metadata`→settings, `?tab=questions`=Build); inactive (**Build default preserved** in forms mode, metadata still valid). Golden flag-OFF routing snapshot stays green.

### T4 — `SectionPager` `previewMode` (D2, C4)
- [ ] Add additive `previewMode?: boolean`. When true: **disable the controls** (pass `disabled` to the `QuestionInput` widgets — the existing path — so the content stays in the accessibility tree and is readable; do **NOT** `inert` the region, C4); `handleNext` skips the required-answer gate (always advances); the last-page button is disabled and `onSubmit`/`attemptSubmit` never fire; no `requireAtLeastOneAnswer` gate.
- [ ] **Clamp/reset `sectionIndex`** when the `pages` list changes (Active↔draft toggle, or a page dropped) so it can never point past the new list (C4).
- [ ] Tests: controls disabled but questions/help still in the a11y tree (readable); Next advances past a required-question section with no answers; **first-page Back**, **empty-pages**, and **every submit path** covered; toggling the page list clamps the index. **Flag-off parity:** default (no `previewMode`) render + submit byte-identical (golden green; INVITED/PUBLIC clients pass nothing new).

### T5 — Preview assembly: adapter + audience policy + Active load (D1, C3, C6)
- [ ] `assemble-survey-pages.ts`: `assembleSurveyPages(sections, questions, {answers, customSlides, templateAlias, isCEO})` that **composes** `org-survey-client`'s existing pure functions (sort → **audience policy** → `filterVisibleSurveyQuestions` → `buildSectionPages` → `filterConditionallyEmptiedPages` → `mergeCustomSlides`). The audience-policy step applies the SU-Full non-CEO `dropBackground` (`org-survey-client.tsx:227`) so a plain-respondent preview never exposes CEO-only questions (C3). **Do NOT refactor `org-survey-client`** — compose the same functions; both stay pinned by its suite + the golden.
- [ ] `preview-version-adapter.ts`: a tolerant **draft-to-pager adapter** (editor `SectionDraft`/`QuestionDraftRow` → `PagerSection[]`/`PagerQuestion[]`) for the live draft, and a **stored-JSON adapter** for the Active version (there is **no `/me` deserializer** to reuse — the route casts JSON, `me/route.ts:88,139`, C3).
- [ ] Edit page (flag active): query the Active published version (`activePublishedWhere`, highest `versionNumber`, language **`enUS`** per `active-version.ts:43` — NOT `en-US`, C6) selecting questions/sections/language/name; pass a read-only `activePreview` prop (null when none published). No schema/route change.

### T6 — `PreviewTab` (D1/D2/D4)
- [ ] Facts strip: version toggle `[Active vN] ↔ [This draft vM]` (default Active when `activePreview` exists; draft-only fallback labelled DRAFT), `N questions in M sections`, language. No access/aggregation restatement.
- [ ] Render: `assembleSurveyPages` on the selected side (draft = live `model` sections/questions; active = `activePreview`), `answers={}`, `<SectionPager previewMode …>`; read-only note cross-links Test Mode.
- [ ] Tests: toggle switches source; draft reflects an unsaved edit; no-published ⇒ draft-only + DRAFT label; render is read-only (controls disabled, content readable); **empty template (no sections/questions) renders a graceful empty preview** (SectionPager's "Nothing to answer yet." with Submit disabled under `previewMode`).

### T7 — Split save model (D9 revised, C1/C2)
- [ ] **Save-Draft lane (version-governed):** trim the Save-Draft metadata PATCH body (`useTemplateEditorDraft.ts:781-794`) to `{name, description, invitationSubject, invitationBodyMarkdown}`. **Invitation email STAYS here** (it's in the `contentHash`, C1) — draft-only, disabled when published, exactly as today. Remove `aggregationMode` / `resultsEmailSubject`+body / `resultsEmailContentApproved` from this body (the Save lane owns them now). Language stays `handleVersionFieldChange` → version PATCH (read-only when published).
- [ ] **Per-card Save lane (template-row, not hashed):** add `handleTemplateRowSave(patch)` that PATCHes `/api/admin/assessment-templates/{id}` on an explicit **Save** click (NOT on-blur — avoids the out-of-order-PATCH race, C2), updates local `templateValues`, maintains per-card `saving/saved/error`; **not** gated by `isReadOnly` (editable while published). Used by the aggregation card and the results-email card. Expose via model/controller.
- [ ] **Results-email approval (SEC-H2, C2):** the approval control is **disabled while the results-email card is dirty**; the route auto-clears approval on any content edit without re-approve (`route.ts:224-244`), so mirror that locally; the "Approve & save" action PATCHes `{resultsEmailContentApproved:true, resultsEmailSubject, resultsEmailBodyMarkdown}` **together** so the hash binds atomically. `sendResultsDefault` keeps its immediate Wave-Q path.
- [ ] Tests: invitation email disabled on a published version (Save-Draft only); a subsequent Save Draft does **not** re-PATCH aggregation/results/approval; per-card Save works on a published version and doesn't flip `isAnyDirty`; approval disabled while the card is dirty; edit body then Save ⇒ approval cleared; "Approve & save" ⇒ hash binds to current content.

### T8 — `SettingsTab` (§3.3, revised save lanes, C6)
- [ ] Build the column, per lane: **Access** (read-only fact, no PUBLIC radio); **Aggregation** (humanized radios → per-card **Save**, editable while published, "applies to live campaigns" impact line); **Language** (select → Save-Draft/version-dirty, read-only when published, friendly `enUS`/`enGB`… labels); **Invitation email** (Subject/Message + Insert → Save-Draft, **disabled when published**, note it's part of version content); **Results email** (Subject/Message + Insert + **Approved to send** + **Send by default** → per-card **Save**, editable while published, impact line, approval disabled while dirty); **Access groups** link row; **Advanced** alias (read-only). **No Sections card.**
- [ ] Tests: each field's copy (C-2); **invitation email disabled on a published version** (Save-Draft lane); aggregation + results-email **editable on a published version** via per-card Save; impact copy present on the editable-while-published cards; read-only alias; no Sections card; aggregation label humanization; Language read-only when published + friendly `enUS` labels.

### T9 — Build section-delete confirm (D12) — VERIFIED NO-OP
- [x] **Finding (during build):** the Build ⋯ Delete **already** shows the impact confirm. `FormSectionCard onDelete={commands.deleteSection}`, and `commands.deleteSection` from `useEditorCommands` (`hooks/useEditorCommands.ts:219-289`) computes `inheritedKeys`/`freedDependentKeys` → `window.confirm(buildSectionDeletePrompt(...))` → `if (!ok) return` → `model.deleteSection` — shipped since ED9 (`bc5a6955`), pinned by the `useEditorCommands` deleteSection-cascade tests (3 passing). The plan's premise ("Build deletes with no confirm; add a gated confirm") was a misread of `commandsModel.deleteSection = model.deleteSection` (the RAW input to the wrapper, not the affordance). A literal implementation would have **double-confirmed**.
- [x] **Disposition:** no code. Dropping the Metadata Sections card (T8/T10) loses no confirmed path — when ED10 is active, Metadata is unreachable (`ED10_VALID_TAB_IDS` excludes it) and SettingsTab has no section-delete, so Build's confirming delete is the only reachable one. The Codex **C5 delete-behavior** concern is void (nothing changes in either flag state). The optional anti-drift refactor (extract one `confirmSectionDelete` shared by `handleSectionsCascadeDelete` + `useEditorCommands`) was **declined** — it touches frozen/golden-pinned `useEditorCommands` for marginal benefit and is outside ED10's scope.

### T10 — TabbedShell seam (D8/D10/D11/D12, keyed off `ed10Active`)
- [ ] `ed10Active`: tab bar = `Preview · Build · Scoring & Tiers · Settings · Versions`; mount `PreviewTab` (param-less default) + `SettingsTab` in place of the Metadata panel; **remove the Access `<Link>`** from the bar; humanize the header pills; stop threading `onSections*` into Settings. **Not `ed10Active`:** the exact current editor — Metadata tab + Access link + Build default (forms mode) — byte-identical.
- [ ] Tests: `ed10Active` bar/panels/default(=preview); flag-OFF byte-identical incl. **the preserved Build default in forms mode** (golden + frozen 15/20 zero-diff).

### T11 — House gate (incl. respondent-flow merge gate — C6)
- [ ] Full `template-editor` + `assessments` sweep green (jest-verified counts); `ed10-golden-snapshots` + `editor-byte-equivalence` (15) + `three-pane-parity` (20) **zero-diff**; `preview-settings-flag-off-parity` green.
- [ ] **Respondent-flow test as a MERGE gate** (C6 — this is not "presentation only"): assert the INVITED/PUBLIC survey render + submit is unaffected by `previewMode` default-off AND that a `previewMode` preview writes nothing / can't submit — do not defer this to post-launch.
- [ ] `npx eslint` clean on all touched files; `CI=true npx next build --turbopack` (flag ON) compiles.
- [ ] Whole-diff adversarial review (superpowers:code-reviewer) → address findings; diff scope verified (no respondent/portal/three-pane/legacy behavior change with the flag OFF; the language-`<select>` value fix is the only intended respondent-adjacent change, C6).

### Post-launch — Seam 3 (live-app e2e)
- [ ] After the flag flip + redeploy: Playwright walk — editor lands on Preview; Active↔draft toggle; read-only render non-interactive; Settings edits save on blur + survive on a published version; `?tab=metadata` → Settings; respondent survey unchanged. (Not a merge gate; runs at launch like ED9.)

## Launch (separate authorization)
Merge dark → set `WAVE_ED10_PREVIEW_SETTINGS_ENABLED=1` on Vercel Production (local `vercel` CLI, josh-4119) + redeploy the newest deployment → launch walk → CLAUDE.md anchor + CHANGELOG `ed10-preview-settings-launched` + spec status → LAUNCHED. Kill = `WAVE_ED10_PREVIEW_SETTINGS_KILL=1` or zero the flag.
