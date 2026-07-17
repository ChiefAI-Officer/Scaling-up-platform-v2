<!-- SPEC_ID:19am STATUS:DRAFT GATED WAVE:ED10 -->
# 19am — Wave ED10: Metadata → Preview tab + one Settings tab (design + SoT)

**Status:** DRAFT · GATED — visual mockups approved + **grilled 2026-07-17** (`/grill-with-docs`; all 13 decisions locked) + **co-validated by real Codex (CLI, gpt-5.6-sol @ xhigh; the MCP wrapper hung, so the `codex exec` CLI fallback was used).** Codex verdict was **no-go as written**; all 6 findings verified against code and **folded**, and the grilled **D9 was re-decided** (its premise — invitation email freely editable while published — was false: it's in the version `contentHash`). Revised D9 = user-confirmed *split* save model. Awaiting user **plan approval** before build. No code yet.

**Ticket:** #6 of the 10-ticket editor-simplification pipeline (governing principle: *the whole assessment editor as simple as possible*). ED7 shipped #1–#2, ED8 (version lifecycle) #3, the design-review Artifact #4, ED9 (Build-tab Forms overhaul) #5. ED10 absorbs approved-design **candidate 7** (Settings surface — relocate the email cards) + **candidate 8** (Metadata dedup — drop the duplicated Sections card) + the old **ticket #3** (Metadata de-jargon copy), which land *inside* this rebuild rather than as interim churn.

**Design SoT:** the approved-design Artifact + the ED10 mockup Artifact `https://claude.ai/code/artifact/54ef8e40-9be2-4222-b8e9-9213c0e9be67` (before/after in real platform tokens, the de-jargon table, the grilled decisions).

**Glossary:** `CONTEXT.md` gained **Preview tab** and **Settings tab** terms (2026-07-17); the **Test Mode** entry's `_Avoid_` note was reconciled to point at the Preview tab (Preview = the survey-taking *experience*; Test Mode = the scored *outputs*).

---

## 1. Problem

The template editor still opens on the **Metadata** tab — a two-column wall of fields that mixes template-row settings, two email editors, a dead PUBLIC radio, a duplicated Sections card, and captions that leak implementation detail (`FULL_VISIBILITY`, `INVITED_RESULTS_EMAIL_COPY_APPROVED`, `v7.5`). It is the last big jargon surface in the editor, and it is the *first* thing an operator sees. ED9 already put question authoring in a Google-Forms Build tab; ED10 makes the editor **open on what a respondent actually sees** (a read-only **Preview**) and gathers every non-question setting into one plain-language **Settings** tab. **Mostly** presentation + copy — no schema/scoring/new-API-route change — **but not purely cosmetic**: the revised save model lets aggregation + results-email edits land on a template while its versions are published, which changes behavior for *live campaigns* immediately (hence the impact copy + merge-gate respondent testing). Invitation email + Language remain draft-governed.

## 2. Locked decisions (grilled 2026-07-17)

| # | Decision | Choice |
|---|---|---|
| **D10** | Does ED10 depend on ED9 (forms mode)? | **Yes — ED10 presupposes ED9.** Preview/Settings render only when `formsBuildEnabled && activeAuthoringMode === "single"` (exactly the gate ED9's h2-hide uses). Flag-OFF, and any legacy/three-pane mode, render **today's Metadata tab + Access link byte-identically.** Name/Description keep their single home on the ED9 Build hero. |
| **D11** | Default landing tab | **Preview lands first** (the param-less URL). Build moves to explicit `?tab=questions`. Matches "open on what respondents see." |
| **D8** | Tab routing / `?tab=` ids | New ids **`preview` + `settings`**; param-less default = `preview`; stale `?tab=metadata` bookmark → **`settings`** (where the fields moved); `?tab=sections` → `questions` (unchanged, ED6). **Flag-OFF keeps `metadata` + today's bijection byte-identical.** |
| **D1** | Which version Preview renders | **Segmented toggle: [Active (published)] ↔ [This draft]**, defaulting to **Active when one exists** (draft-only fallback labelled DRAFT when nothing is published). **Draft side = the live in-memory draft** (reflects unsaved edits, no fetch). **Active side = the Active version's content server-loaded** as a new read-only prop (an extra *read* in the edit page — no schema/route change). |
| **D2** *(freeze revised post-co-validate)* | Paged vs flat + freeze | **Reuse the real `SectionPager`** via a new **additive `previewMode` prop**: controls **disabled** (kept readable in the accessibility tree — **not** `inert`, C4), the required-answer gate skipped (Next always advances), Submit disabled and `onSubmit` never fires, `sectionIndex` clamped on page-list change. Previews as a **plain respondent** (no CEO gating). Default-off ⇒ the live survey is byte-identical. |
| **D3** | Preview vs Test Mode | **Coexist** — Preview = the survey-taking *experience* (read-only); Test Mode = the scored *outputs* (interactive sandbox). The Test Mode button stays in the header; the Preview note cross-links it. |
| **D4** | Facts strip vs header pills | **Minimal facts strip** on Preview: the D1 version toggle + question/section counts + language **only**. Access/aggregation stay in the persistent header pills (and are editable in Settings) — not restated. |
| **D5 + D9** *(revised post-co-validate)* | Editable-while-published + save mechanism | **Split by whether the field is version-governed.** **Invitation email + Language stay Save-Draft** (draft-only; read-only when published) — the invitation email is **part of the version `contentHash`** (`template-content-hash.ts:10`), so editing it while published would break version provenance; Language is version content. **Aggregation + Results email + "Approved to send" get an explicit per-card *Save*** (a button, **not** on-blur — avoids the Codex-flagged out-of-order-PATCH edit-loss/stale-approval race), **editable while a version is published** (these are not hashed), with "applies to live campaigns" impact copy and the approval control **disabled while the results-email card is dirty**. **`sendResultsDefault`** stays its existing immediate Wave-Q PATCH. Save writes via the **existing** `PATCH /api/admin/assessment-templates/{id}`. |
| **D9-hash** | Version-governed vs template-row | The `contentHash` = `sha256({questions, sections, scoringConfig, reportConfig, invitationSubject, invitationBodyMarkdown})`. So **invitation email is version-governed** (Save-Draft, draft-only) even though it lives on the template row; aggregation / results email / `sendResultsDefault` are **not** hashed → safe to edit while published. |
| **D12** | Duplicate Sections card | **Drop it from Settings** (candidate-8 dedup); section CRUD lives solely in the Build tab; stop threading `onSections*` into the Settings tab. **AND add the impact confirm to the Build tab's ⋯ Delete** (today it deletes cascade-*safely* but with no confirmation) so the one remaining path warns before removing a section's questions. |
| **D6** | Name/Description home | **Build hero only** (ED9). Settings does **not** host an editor for them (no reintroduced two-way sync); the Preview facts strip / header show the name read-only. |
| **D7** | Dead PUBLIC radio | **Removed.** Access becomes a read-only fact: *"Invited only — each respondent gets a private magic link; answers are attributable."* |
| **C-1** | Header pills copy | **Humanize the persistent header pills too** (`Invited` / `CEO-only`) via the shared `enum-labels.ts` helper — **flag-gated** so flag-OFF keeps the raw `INVITED`/`CEO_ONLY` enums byte-identical. |
| **C-2** | Settings/Preview copy | **Accepted as written** (keep "CEO only", consistent with the glossary). Enum/locale *values* stay the stored strings (the ED7 `enum-labels` pattern). Full table in §3.3. |

## 3. Surfaces

### 3.1 Tab bar (persistent header unchanged except pills)

Flag-ON (⇒ forms/single by D10): the tab bar reads **`Preview · Build · Scoring & Tiers · Settings · Versions`**. The standalone **Access** nav link (today → `/admin/assessments/access-groups`) is removed from the bar; it becomes a row inside Settings (§3.3). The persistent header (version pill, access/aggregation pills, `Published vN active since…` caption, and the Save Draft / Publish / Test Mode / Safe-to-Publish buttons) is otherwise unchanged — except the access/aggregation pills are humanized (C-1, flag-gated).

### 3.2 Preview tab (new landing tab)

- **Facts strip** (minimal, D4): the version toggle `[Active · vN (published)] ↔ [This draft · vM]` + `N questions in M sections` + language. Nothing else restated.
- **Read-only respondent render** (D1/D2): the real `SectionPager` in `previewMode`, fed pages assembled by the *same* pipeline the INVITED survey uses —
  `mergeCustomSlides(filterConditionallyEmptiedPages(buildSectionPages(sortedSections, visibleQuestions), sortedQuestions), [])`
  where `visibleQuestions = filterVisibleSurveyQuestions(...)` with **no answers** (so show-if dependents are hidden exactly as a fresh respondent sees; D7 page-suppression applies). The **draft side** feeds the live in-memory `model.sections`/`model.questions`; the **Active side** feeds the server-loaded active-version content. `answers = {}`; no custom slides (campaign-authored, not template-level); `isCEO` omitted (plain respondent).
- A read-only note cross-links Test Mode ("Use Test Mode to answer & score a draft").

### 3.3 Settings tab (one column)

Order + copy (C-2), all through existing fields:

| Card / row | Copy |
|---|---|
| **Who takes it & who sees results** — Access (read-only, D7) | "**Invited only** — each respondent gets a private magic link; answers are attributable." |
| … Aggregation (editable radios; humanized) | heading "Who sees individual answers"; **Everyone** = "All viewers see each person's individual answers." / **CEO only** = "Others see just their own answers; the CEO sees the team average (no individual rows)." |
| **Language** | "Language" · helper "Applies to this version's content" · options English (US)/English (UK)/Spanish (Spain)/French (France) (values the real stored `enUS`/`enGB`/`esES`/`frFR` — NOT the select's current `en-US…`, C6). |
| **Invitation email** | "Sent when a respondent is invited." · fields **Subject**, **Message** (was "Body (Markdown)") · variable chips under **Insert**. |
| **Results email** | "Sends each respondent their own result. Needs approval before it can go out — **it never includes anyone else's data.**" · **Subject**, **Message** · chips under **Insert**. |
| … toggle **Approved to send** | "Turn on once the copy is reviewed." (was "Content approved (flips INVITED_RESULTS_EMAIL_COPY_APPROVED)".) |
| … toggle **Send results to respondents by default** (Wave Q) | "Applies once the results email is approved." |
| **Access groups** (link row → `/admin/assessments/access-groups`) | "Manage who's allowed to take this assessment." → **Manage →** |
| **Advanced** — Alias (read-only) | "Used internally to wire reports, benchmarks, and links. Changing it can silently break existing campaigns, so it's locked here." |

Dropped entirely: the **v7.5** badge, the `INVITED_RESULTS_EMAIL_COPY_APPROVED` flag-constant copy, the dead **PUBLIC** radio (D7), the **Sections** card (D12), and the editable **Alias** input (now read-only).

**Save model (D5+D9, revised):** three lanes, split by whether the field is version-governed —
1. **Version-governed → Save Draft (draft-only, read-only when published):** **Invitation email** (in the `contentHash`) and **Language** (version content). Editing them stays exactly as today — on a draft, batched into Save Draft, disabled on a published version. The Save-Draft metadata PATCH body is trimmed to `{name, description, invitationSubject, invitationBodyMarkdown}` (name/description are edited on the ED9 hero); it no longer carries aggregation/results-email/approval.
2. **Template-row, not hashed → explicit per-card *Save* (editable while published):** **Aggregation** and the **Results email** (subject/body + "Approved to send"). Each card has a **Save** button (not on-blur), an "applies to live campaigns" impact line, and — for the results-email card — the approval control **disabled while the card is dirty** (SEC-H2: any content edit clears approval server-side, so the client mirrors that; re-approving PATCHes `{resultsEmailContentApproved:true, subject, body}` together so the hash binds atomically). Writes via the existing `PATCH /api/admin/assessment-templates/{id}`; does not touch Save-Draft dirty state.
3. **Operational toggle → immediate (unchanged):** **`sendResultsDefault`** keeps its Wave-Q immediate PATCH.

## 4. Constraints honored by construction (verified against code)

- **One `ed10Active` gate.** A single derived `ed10Active = previewSettingsEnabled && formsBuildEnabled && activeAuthoringMode === "single"` drives routing, default tab, panels, labels, the header-pill humanization, AND the Build-delete confirm. **Flag-OFF byte-identity is measured against today's *forms* state, not "legacy":** today's default tab in forms mode is already **Build/`questions`** (`TabbedShell.tsx:351`), so flag-OFF keeps that default (NOT metadata), keeps the Metadata tab + Access link, and keeps Build's confirm-less delete — the frozen `editor-byte-equivalence` (15) + `three-pane-parity` (20) + the ED10 golden pass with zero diffs.
- **No schema / no new API route.** Saves reuse `PATCH /api/admin/assessment-templates/{id}` (its Zod body already admits every field, `route.ts:88`); the Active-version Preview is an extra **read** in the edit-page server component (`activePublishedWhere` + a content select) passed as a new read-only prop. Nothing writes a new column or endpoint. (Not "presentation only" — see the impact bullet.)
- **Preview fidelity via an adapter + a shared audience policy (Codex C3).** There is **no `/me` deserializer** — the survey route casts stored JSON straight through (`me/route.ts:88,139`), and editor-draft shapes ≠ pager shapes. So Preview uses an explicit **draft-to-pager adapter** (for the live draft) and casts the Active version's stored JSON, then runs the **same** `assembleSurveyPages` pipeline — which **must apply the SU-Full non-CEO background filter** (`org-survey-client.tsx:227`, `dropBackground`), or a "plain respondent" preview would wrongly expose CEO-only questions. `org-survey-client` is **not refactored** — its pure functions are composed, its output pinned by its own suite + the golden.
- **Read-only preview without breaking a11y (Codex C4).** `previewMode` **disables the controls** (the existing `QuestionInput disabled` path) and suppresses the required-gate + Submit/`onSubmit` — it does **not** wrap the region in `inert` (which would strip the questions/help from the accessibility tree; a preview is meant to be *read*). Pager `sectionIndex` is clamped/reset when toggling Active↔draft so it can't point past the new page list. The INVITED/PUBLIC clients pass nothing new → byte-identical (flag-off parity test).
- **Invitation email is version-governed (Codex C1).** It is in the `contentHash` (`template-content-hash.ts:10`), so it stays Save-Draft/draft-only — never editable while published. Aggregation / results email / `sendResultsDefault` are not hashed → their per-card Save (or immediate, for the toggle) is safe while published.
- **Language identifier is `enUS`, not `en-US` (Codex C6).** `DEFAULT_TEMPLATE_LANGUAGE = "enUS"` and every seeded version is `"enUS"` (`active-version.ts:43`); the MetadataTab `<select>` offering `en-US` is a **pre-existing mismatch**. ED10's Active-version-per-language lookup + the friendly labels use the real `enUS` value; the select's wrong values are corrected here (or explicitly flagged — §8).
- **Section CRUD not lost (D12).** Build's `commands.deleteSection` (= `model.deleteSection`, cascade-safe/no-orphan) gains the same `collectSectionDeleteImpact` + `buildSectionDeletePrompt` confirm the Metadata card used — but **gated on `ed10Active`** (Codex C5), so flag-OFF Build keeps its current confirm-less delete (byte-identical).
- **Name/Description single-homed (D6).** Editing stays on the ED9 hero (`handleTemplateFieldChange` → Save Draft, alongside invitation email); Settings renders name read-only.

## 5. Flag + kill semantics (Wave-Q doctrine)

- New module `lib/assessments/wave-ed10-flags.ts` → `isPreviewSettingsEnabled()`; two levers, no canary (template-level platform config): `WAVE_ED10_PREVIEW_SETTINGS_ENABLED` enables, `WAVE_ED10_PREVIEW_SETTINGS_KILL` hard-overrides OFF. Truthiness matches the Wave-M/N/O/S/ED8/ED9 convention.
- The flag gates presentation, copy, **and the bounded save-model change**. Flag-OFF (or kill) → the editor is byte-identical to today's forms-mode editor (Metadata tab, Access link, raw enum pills, editable alias, Build default tab, confirm-less Build delete). The `previewMode` prop, the `SectionPager`/`assembleSurveyPages` additions, and the `ed10Active`-gated Build-delete confirm are all additive/default-safe; rolling back the save-model wiring = revert-commit.
- **Effective gate = `ed10Active = WAVE_ED10 && WAVE_ED9(forms) && single`** (D10). If ED9 is ever off, ED10 is inert.

## 6. Testing decisions (seams)

- **Seam 1 — component-render:** RTL suites for the new `PreviewTab` (facts strip, version toggle, `previewMode` render for draft vs active), the new `SettingsTab` (each card, per-card Save, invitation email disabled-when-published, read-only alias, no Sections card, Access read-only), `SectionPager` `previewMode` (controls disabled but content readable, Next advances past a required section, Submit disabled/no onSubmit, sectionIndex clamp), and the header-pill humanization (`ed10Active`-gated). A **flag-OFF parity** test proves `MetadataTab` + the Access link + `?tab=metadata` + the Build default still render/route verbatim.
- **Golden `innerHTML` net (ED9 lineage):** the frozen 15/20 suites pin behavior/HTTP, not HTML. Capture golden snapshots of (a) the flag-OFF editor shell incl. the Metadata tab and (b) the INVITED `SectionPager` render **before** adding `previewMode`, and keep them green through the change — the real byte-identity proof.
- **Routing:** unit tests for `resolveTabFromUrl`/default-tab across flag-ON (`preview` default, `?tab=metadata`→settings, `?tab=questions`=Build) and flag-OFF (`metadata` default, old bijection).
- **Save model (split):** tests that aggregation + results-email use the per-card **Save** (editable on a published version, no `isAnyDirty` flip, results-email approval disabled while dirty); **invitation email + Language** route through Save Draft and disable when published; `sendResultsDefault` keeps its immediate PATCH.
- **Frozen regression pins (untouched by construction):** `editor-byte-equivalence` (15) + `three-pane-parity` (20) zero-diff.
- **Seam 3 — live-app e2e (post-launch):** Playwright drive of the deployed editor — lands on Preview, toggles Active↔draft, the read-only render is non-interactive but readable, per-card Settings Save survives on a published version, `?tab=metadata` redirects to Settings; the respondent survey is unchanged.
- Test counts **jest-verified**, never from memory.

## 7. Candidate ADR

The **template-row-immediate vs version-content-batched** save split (D5+D9) is the one decision that is (a) mildly hard to reverse, (b) surprising to a future reader ("why does Settings save differently from Build?"), and (c) a real trade-off. Rationale to record (in this spec's decision log, or a formal ADR if the reviewer wants one at plan time): template-row fields are identical across versions and must be fixable without opening a draft; the immediate-PATCH pattern already exists for `sendResultsDefault`; version content keeps its publish-freeze. **No ADR is written pre-emptively** (ED9 needed none); decide at co-validate.

## 8. Out of scope

- Any schema/migration, new API route, or scoring/report change.
- **Re-architecting the invitation-email/`contentHash` relationship** (Codex C1). Invitation email stays draft-governed; making it editable-while-published would require excluding it from the hash or versioning it — a provenance decision beyond ED10.
- Deeper **language-identifier** cleanup beyond using the real `enUS` value and correcting the `<select>`'s wrong `en-US`… options (Codex C6); a full locale-config pass is separate.
- Changing which access/aggregation *modes* exist (still INVITED-only templates; FULL_VISIBILITY/CEO_ONLY unchanged — only their labels change).
- A CEO-view toggle in Preview (previews as a plain respondent; a CEO/phase-tile preview is a possible follow-on).
- Rendering campaign-authored custom slides in Preview (template-level surface has none).
- Retiring the legacy three-pane / `MetadataTab` code (kept as the flag-OFF fallback, per the ED-series pattern).
