# Spec 17 — Wave C: Assessment Survey Participant UX (Design)

> **Gate status:** Wave C of [Spec 17](17-jeff-june9-feedback-punchlist.md). **Brainstormed → grilled (`/grill-with-docs` G1–G5, `/grill-me` G6–G7) → claudex-hardened (3 rounds: senior-eng → security → ops/SRE; 16 findings, all addressed — see Changelog). Execution-ready.** Next → per-wave implementation plan (`17c-…-implementation-plan.md`, TDD) → `/frontend-design` mockup for visual sign-off → subagent-driven build. **Not yet built.**
>
> **Date:** 2026-06-14 · **Branch:** `feat/wave-c-survey-ux` (off `main`)

## Goal

Fix Jeff's June-9 survey-participant complaints (Spec 17 items **#6–#14**) so the live assessment survey looks finished and behaves correctly: one clean purple card (no white chrome), a slider that doesn't look pre-answered, bordered/limited text inputs, and red highlighting of missed required questions on a blocked advance. All participant-facing, all scoped, additive, no migration.

## Scope

**In scope:** the participant survey UI shared by both flows —
- `src/src/components/assessments/org-survey-client.tsx` (invited)
- `src/src/components/assessments/public-quiz-client.tsx` (public quiz)
- shared: `section-pager.tsx`, `question-input.tsx`, `AssessmentShellHeader.tsx`, `assessment-welcome.tsx`
- scoped styles in `src/src/styles/wireframes-scoped.css` (`.su-assessment-brand` block)

**Out of scope (this wave):**
- #14 **editability** of section intros (deferred — see §"Item 14" + §"Deferred").
- Any admin/coach template-editor change, any campaign-setup change (that is Wave D).
- Any report change (Wave E). Any new write path, migration, or feature flag.

## Constraints (locked)

1. **Scope isolation (ADR-0005):** every new/changed rule lives under `.su-assessment-brand`. Zero global-token change, zero leak into the blue `.wf-scope` admin/coach UI. No new top-level selectors. **(Round-1 M2)** Several current survey rules (progress, nav, errors, text inputs, question layout) still have **shared `.wf-scope` selectors** that also serve admin/coach UI — so all Wave C participant restyling must be added as **new `.su-assessment-brand …` overrides**, NOT by editing the base `.wf-scope` rules (the only permitted `.wf-scope` change is removing a rule proven unused). Add a static grep/lint guard asserting new survey selectors are `.su-assessment-brand`-scoped.
2. **Additive, no migration, no feature flag.** These are UI corrections + one render-logic change. Reversible by `git revert`. Unlike Wave B there is no new server write surface, so no kill-switch is warranted.
3. **Both flows must stay in lockstep.** All changes are in shared components or shared CSS; the invited and public clients consume the same `SectionPager`/`QuestionInput`. Any client-level change (the header restructure) is applied to **both** clients identically.
4. **Build gate:** `CI=true npx next build --turbopack` from `/Users/diushianstand/Scaling-up-platform-v2/src`. TDD for the two logic changes (#8 state, #13 validation).
5. **Visual sign-off:** a `/frontend-design` mockup of the restyled survey (#6/#7/#8/#9/#11) is approved by the user **before** build, per the established Wave pattern (PRs #41/#51/#54).

## Locked decisions (from brainstorm, 2026-06-14)

- **D1 (#6+#10) — Unified purple card, caption-every-page.** Remove the white header bar **and** the big white survey-title card. The survey name moves into the purple shell as a **small caption shown on every page**; the prominent name still appears on the welcome screen and first section. The "big repeating title" is what #10 objects to, and deleting the white title card removes it.
- **D2 (#8) — Hide the thumb via scoped CSS.** Keep the native `<input type="range">`. When the answer is unset, hide the thumb and show an empty (unfilled) track using the **existing** `.is-unanswered` wrapper hook. First interaction reveals the thumb + fill. No control rework (segmented buttons were tried in PR #33 and reverted by PR #34 per decision D4 "keep the slider").
- **D3 (#14) — Defer editability.** Wave C verifies the section intro renders against Jeff's example; in-app editing of section intros is a separate setup/authoring feature (versioned-content + publish path) and belongs in Wave D or its own spec.

## Grill resolutions (`/grill-with-docs`, 2026-06-14)

Five residual flaws/decisions surfaced and were resolved against the codebase before the plan:

- **G1 (refines #6) — Caption = the campaign's name in BOTH flows** (`campaign.name` invited / `campaignName` public). Matches the public welcome's own prominent `<h1>`; least visual change. Public form-step pager switches `assessmentName` from `templateName` → `campaignName`. *(Corrected a first-pass pick of `templateName` after the code showed the public welcome already shows `campaignName`.)*
- **G2 (fixes a #8 a11y trap) — Track-level focus ring for the unanswered slider.** Hiding the thumb would hide the *only* focus indicator (`survey-slider:focus::-webkit-slider-thumb`); add `.is-unanswered .survey-slider:focus-visible { outline … }` so keyboard focus is always visible.
- **G3 (resolves a #6 redundancy) — One progress bar.** Keep the authoritative linear `survey-progress` (restyled into the purple block), **drop** the decorative `su-shell-seg` segmented strip; keep the "Section N of M" text.
- **G4 (#13 / #11 / #12 polish) —** focus the first invalid question on a blocked advance; generic placeholders ("Type your answer here…" / "Enter a number"); char-counter visible only in the last ~1,000 chars.
- **G5 (factual) —** the invited `ty-card` (= `campaign.name`, every page) is the #10 offender and is invited-only; the public form step has no title card and only loses `ty-header`. #13's gate is centralized in `SectionPager` (both flows, both Next + last-section Submit); the public client's `canSubmit` is an untouched final-POST guard.

### `/grill-me` round (fresh-eyes, 2026-06-14)

- **G6 (cross-decision: #8 × G2 × #13) — Focus-independent red rail for a missed slider.** #13 programmatically focuses the first invalid question; if it's an unanswered slider (hidden thumb, #8) and the gate was triggered by a mouse click, G2's `:focus-visible` ring may not match → the missed control could be invisible. Fix: the #13 invalid (red) treatment is **focus-independent** and applies to **the slider rail itself** (not just the card), so a missed slider is always visibly flagged. Tested without any focus state applied.
- **G7 (P0 — wireframe reconciliation) — #6 deliberately deviates from WF-15.** WF-15 specifies a white header + white linear progress bar (no purple card); the live app is a hybrid triple-header (white `ty-header` + purple `su-shell-header` + white `ty-card`) — the clutter Jeff flagged. Jeff's June-9 #6 directive supersedes WF-15; G3 (drop the segmented strip) restores wireframe fidelity on the progress bar. Documented in §"Wireframe reconciliation". Autosave verified safe vs #8/#13.

---

## Per-item design

### #6 + #10 — Unified purple-card header  *(layout; D1)*

**Current (the bug):** the ready-state render in each client is
`ty-page → ty-header (white "Scaling Up" bar) → main.survey-body → ty-card (eyebrow "Survey" + h1 title + lede) → SectionPager (purple su-shell-header: white logo + "Assessment · Company — Section N of M" + segmented strip) → survey-progress bar → questions`.
The white `ty-header` is the "white header bar" Jeff wants gone (#6); the `ty-card` title block sits outside the pager and therefore **re-renders on every section**, which is the "title on every page" Jeff wants gone (#10).

**Target:**
- **Delete** the white `ty-header` bar from the ready-state of **both** clients.
- **Delete** the standalone `ty-card` survey-title block — **invited flow only** (`org-survey-client`): its `ty-card` h1 = `campaign.name` re-renders above the pager on every section, which is exactly the every-page title #10 objects to. The **public** form step has **no** such card (it goes `ty-header → submit-error banner → SectionPager`), so public only loses the `ty-header`.
- **Header name source (Grill Q1, resolved 2026-06-14):** **the caption shows the campaign's name in both flows** — `campaign.name` (invited) and `campaignName` (public). Rationale: the public **welcome** screen already shows `{campaignName}` as its prominent `<h1>` (with `templateName` only as the small shell caption), so using `campaignName` in the form caption keeps the welcome and the form **consistent within the public flow**, and is the *least* visual change (the old white bar already showed `campaignName`). Plumbing: invited already passes `assessmentName={campaign.name}`; **public must switch the form-step `SectionPager` from `assessmentName={templateName}` → `assessmentName={campaignName}`** (one-line change). `templateName` remains only on the public welcome shell caption (out of #6 scope).
- The **purple shell** (`AssessmentShellHeader`) becomes the single header: white SU logo → survey-name **caption** → "Section N of M" → the linear `survey-progress` bar, all reading as one purple block. (The progress bar already renders immediately under the shell header inside the pager; visually unify them.)
- **Single progress indicator (Grill Q3, resolved 2026-06-14):** the survey shows **two** progress UIs today — the decorative `su-shell-seg` segmented section strip (`aria-hidden`) and the authoritative linear `survey-progress` (`role="progressbar"`, answered/total questions). **Keep the linear bar, drop the segmented strip.** The linear bar is the a11y-authoritative one, reflects actual completion, and matches Jeff's singular "progress bar." The **"Section N of M" text caption stays** for section orientation. (Removes a branded flourish from the approved mockup — accepted per Jeff's de-clutter intent.)
- **DOM ownership of the in-card progress bar (Round-1 M3).** Today `survey-progress` is a **sibling rendered after** `AssessmentShellHeader`, not part of the purple-header DOM — so "progress bar inside the purple card" is structurally ambiguous. Make ownership explicit: **move the `role="progressbar"` into `AssessmentShellHeader`** (fed the answered/total via props) so the header element *is* the purple card containing logo → caption → "Section N of M" → bar. Test asserts: `su-shell-seg` is gone and **exactly one** `role="progressbar"` exists in the tree.
- The **welcome screen** already shows the prominent survey name (`su-welcome-title`) — unchanged. The **first section** keeps prominence via the existing intro slide heading; later sections show only the small caption.

**Files:** `org-survey-client.tsx`, `public-quiz-client.tsx` (remove `ty-header` + `ty-card` from the ready render; pass the survey/campaign name through to the pager, which already accepts `assessmentName`), `AssessmentShellHeader.tsx` (ensure caption + section + progress compose as one purple unit), `section-pager.tsx` (the `survey-progress` bar lives here — restyle to sit inside the purple block), `wireframes-scoped.css`.

**Notes / risks to grill:** the loading and error phases of each client also use `ty-header`/`ty-card` — those are **not** the survey form and are out of scope (only the ready/questions phase changes). Confirm we don't strip the brand from the loading/error/thank-you screens. The pager already owns section state, so moving the name into it cannot reintroduce per-page duplication.

**Public "About you" white chrome — scope boundary (Round-1 L2).** The public flow's contact-info step ("About you") also renders the white `ty-header`/`ty-card`, as do the thank-you (invited) and results (public) screens. Jeff's #6 verbatim targets the **survey** ("Everything inside the purple card"), so **Wave C scopes #6 to the question pager only** (both flows). The residual white chrome on the public info step + thank-you/results is **explicitly flagged to confirm with Jeff** rather than silently extended — if he means the whole participant journey, restyling the info step with the participant shell is a fast follow-up, but it is not assumed here.

### #7 — Remove the orange "01" section numbers  *(CSS/JSX)*

Delete the `su-intro-num` badge (renders `String(idx+1).padStart(2,"0")`) from the intro slide in `section-pager.tsx`, and remove its CSS. Keep the step label (`partLabel`, e.g. "Fundamental 1"), the section title, and "What this section covers." This partially reverses PR #51's intro polish, as the spec anticipates.

### #8 — Slider visually unset until chosen  *(CSS + minor JSX; D2)*

**Current:** `question-input.tsx` SLIDER_LIKERT sets `numVal = answered ? value : min` and tags the wrapper `survey-slider-wrap is-unanswered` when `answered` is false. The native thumb therefore parks at `min`, looking pre-selected. Commit-on-min already works (`onChange`/`onClick`/`onPointerUp`/`onKeyUp`, PR #50). `isAnswered` already treats `0` as answered.

**Change:**
- Scoped CSS: when `.survey-slider-wrap.is-unanswered`, set the thumb (`::-webkit-slider-thumb`, `::-moz-range-thumb`) to `opacity: 0` (no shadow/border) and render the track as a flat empty rail (no purple fill / `--pct: 0`). The numbered ticks stay visible as the tap targets; the status line already prompts "Tap or drag the slider to rate."
- On first interaction → `answered` true → `.is-unanswered` drops → thumb + fill render normally, selected tick highlights.
- Minor JSX: set the WebKit fill via an inline `--pct` custom property **only when answered** (so the filled track tracks the value); when unanswered, `--pct` is absent → empty rail.
- **Keyboard focus ring (Grill Q2, resolved 2026-06-14):** the *only* current focus styling is `survey-slider:focus::-webkit-slider-thumb` — hiding the thumb would hide the sole focus indicator, stranding keyboard users on an invisible control. Add a **track-level** ring for the unanswered state: `.is-unanswered .survey-slider:focus-visible { outline: 2px solid #522583; outline-offset: 4px; }`. Once a key commits → `answered` flips → thumb + its existing focus ring return. The control is always visibly focusable. (Selecting the minimum by keyboard already works: ArrowLeft/Home at `min` commits `0` via `onKeyUp`.)

**TDD:** (a) wrapper carries `is-unanswered` until a value is set and loses it after; (b) selecting the minimum value commits and counts as answered (`0` is answered); (c) the hidden-thumb state is keyed solely on `answered`.

**Grill targets:** with the thumb hidden, is the affordance discoverable enough (ticks + prompt + clickable track)? Keyboard: a focused range with no visible thumb — does focus-visible still show a ring so keyboard users can orient? Screen-reader: `aria-valuetext="Not yet answered"` is already set when unanswered — confirm that's still announced.

### #9 — Bigger slider handle  *(CSS)*

Increase the thumb from 22px to ~30px on both `::-webkit-slider-thumb` and `::-moz-range-thumb`; adjust `margin-top` to recenter on the 6px track; scale the focus-ring radius to match. Scoped CSS only.

### #11 — Text inputs: visible border + placeholder  *(CSS + copy)*

`question-input.tsx` TEXT (`<textarea class="survey-textarea">`) and NUMBER (`<input class="survey-input-number">`) currently have **no placeholder**. Add a generic placeholder ("Type your answer here…" for text; "Enter a number" for number). No per-question placeholder field exists in the model and inventing one is out of scope (YAGNI). Ensure both controls have a clearly visible border + focus ring in scoped CSS.

### #12 — Surface the character limit  *(small)*

`MAX_TEXT_ANSWER_LENGTH = 10_000` is exported from `lib/assessments/scoring.ts` and enforced **server-side** at submit, but is invisible client-side. **(Round-1 M4)** Do NOT import it into the client `QuestionInput` directly from `scoring.ts` — that would pull the whole scoring/Zod module into the participant bundle for one constant. Instead **move the answer-length limits into a tiny client-safe module** (`lib/assessments/answer-limits.ts`, no Zod/server imports) and have **both** `scoring.ts` and `QuestionInput` import from it. Then add `maxLength={MAX_TEXT_ANSWER_LENGTH}` to the textarea (browser stops typing at the limit), and a subtle live counter ("N / 10000") that becomes visible **only when the user enters the last ~1,000 characters** (Grill Q4c) — keeping every text box clean otherwise while still warning before the browser truncates. 10k is appropriate for open reflection text — confirmed appropriate, no change to the value.

### #13 — Red-highlight missed required questions  *(logic; TDD)*

**Current:** `section-pager.tsx` `handleNext` computes `unanswered = page.questions.filter(required && !isAnswered)`; if any, sets `showGateError = true` → a single bottom `survey-error` alert. No per-question indication.

**Change:**
- When the gate blocks, also compute the **set of unanswered-required stableKeys** and store it in state. Pass each question an `invalid` flag into `QuestionInput` (and onto its `<li>`/label).
- Visual: red/`destructive` border on the question card, red label + asterisk. Keep the bottom alert.
- **Per-type invalid + focus contract (Round-1 H1, 2026-06-14).** `aria-invalid` and focus target differ by question type — define them explicitly so a required `MULTI_CHOICE` (a supported type) cannot fall through:
  - **SLIDER_LIKERT / TEXT / NUMBER:** `aria-invalid="true"` on the control; blocked-advance focus targets that control.
  - **MULTI_CHOICE:** the control is a `role="group"`, where `aria-invalid` is poorly supported by SRs. So: set the **group-level invalid state** (red card border + red label), give the group `aria-invalid="true"` **and** `aria-describedby` pointing at the inline error text, and **focus the first checkbox `<input>`** on a blocked advance (a focusable element, unlike the group). 
  - RTL coverage is **required** for an unanswered required `MULTI_CHOICE` (flagged, focus lands on the first checkbox, group marked invalid).
- **Focus-independent invalid state for sliders (Grill-me, resolved 2026-06-14):** because an unanswered SLIDER_LIKERT has a hidden thumb (#8) and G2's ring uses `:focus-visible` — which a *programmatic* `.focus()` after a **mouse**-click "Next" may not match — the "you missed this" signal must NOT depend on focus. Apply the red invalid treatment to **the slider rail itself** (red track/border on `.survey-slider` when its question is `invalid`), in addition to the card border + red label. So a missed slider is always visibly flagged regardless of focus modality; G2's `:focus-visible` ring is retained only for normal keyboard answering. **Test:** a slider marked `invalid` shows its red indicator with no `:focus`/`:focus-visible` applied.
- **Clearing (Round-1 M1, corrected):** prune a question from the invalid set **only when its new value is actually answered** — i.e. gate the prune on `isAnswered(nextValue)`, NOT on any change. Otherwise whitespace-only text or deselecting the last checkbox would clear the red state while the question is still unanswered. Keep the bottom alert visible while **any** invalid key remains. Recompute the set on each blocked advance.
- **Focus (Grill Q4a, resolved):** on a blocked advance, move keyboard focus to the **first** unanswered required question (not the Next button). No conflict with the existing `headingRef` focus, which fires only on section change, not on a blocked advance.
- **Scope note (resolved):** the per-section required gate lives entirely in `SectionPager.handleNext` and already covers **both** the mid-survey "Next" gate **and** the last-section "Submit" gate, for **both** flows. The public client's separate `missingRequired`/`canSubmit` is a final-POST guard and is **unchanged** by #13. No per-client validation duplication is introduced.
- **All-optional zero-answer submit (Round-1 M6 → refined by Round-2 M2).** The submit API rejects an empty `answers` array (`EMPTY_ANSWERS`), and **both** clients can be all-optional (invited too — not just public), so a zero-answer Submit either silently no-ops (public `canSubmit` false) or hits a **terminal error screen** (invited). Fix: `SectionPager` **owns** the endpoint-level non-empty rule via an optional `requireAtLeastOneAnswer` mode used by **both** clients. Critically, with zero answers there is **no specific invalid question to focus** in a multi-section optional survey — and optional questions must **NOT** be marked required/invalid. So the treatment is a **non-field-level alert** ("Please answer at least one question before submitting.") plus focus moved to the **first answerable control**, not a per-question red state. Test the all-optional empty-submit UX for both flows.
- **Submit-error recovery, not a terminal screen (Round-2 M1, partial-accept).** A stale/tampered autosaved draft can pass the client gate yet fail server-side (`UNKNOWN_STABLE_KEY` / `INVALID_TYPE` / `ANSWER_TOO_LONG`); the invited client currently drops to a terminal error. Where the server returns per-field validation detail, **map it back into `invalidKeys`** and keep the participant **on the pager** with focus on the offending question (reusing the #13 machinery), instead of the dead-end screen. **Stale-key prune (Round-3 M2, upgrades this fix):** mapping server errors into `invalidKeys` cannot recover an answer whose stableKey matches **no rendered question** (stale draft from a changed version, duplicate/off-schema key) — there is nothing to focus, so the user is trapped. So Wave C **prunes the answers map against the currently-rendered question set** (the client already holds it) on **hydrate and again immediately before submit**, dropping unrenderable entries from state *and* `localStorage`. For any server error without a focusable stableKey, fall back to a **non-field alert** (no per-question highlight). This is a cheap client-safe key-set filter, not a value re-validator — deep type/length validation still defers to the server.
- **Synchronous submit latch (Round-2 M3).** The Submit button disables only via the async `submitting` prop after a parent rerender, so a rapid double-click can fire **concurrent POSTs** (server row-lock/idempotency prevents dup rows, but the client races success vs 409). Add a **synchronous in-flight ref latch** in the pager/client (or disable immediately on click) so only one POST is ever in flight; test invited + public double-click.
- **Selector-safe focus (Round-2 L1).** Locate the first invalid control via a **React ref map or `document.getElementById`**, never `querySelector('#q-' + stableKey)` — a stableKey containing CSS metacharacters would break/escape the selector. Add a test with a punctuation-bearing stableKey.

**Files:** `section-pager.tsx` (invalid-set state + propagation + focus), `question-input.tsx` (accept `invalid` → `aria-invalid` + class), `wireframes-scoped.css` (scoped red state).

**TDD:** (a) blocked advance flags exactly the unanswered required questions, not optional ones, not answered ones; (b) answering a flagged question clears just its flag; (c) once all are answered, advance proceeds and no flags remain; (d) `aria-invalid` is set on flagged controls only.

### #14 — Section intro text  *(verify-only; D3)*

**Renders:** ✓ — `page.description` drives the intro slide (`su-intro-covers` / `su-intro-desc`), shipped via PR #36/#51. **Named verification fixture (Round-1 L1):** the implementation plan must pin the authoritative example — the **Five Dysfunctions** template (or Rockefeller), a specific **section with a non-empty `description`** in its seeded `sections` JSON, reached via the live survey route (invited `/org-survey/<alias>` or public `/quiz/<alias>`); the acceptance check is that that section's intro slide renders the seeded description text. Store the verification evidence (screenshot path) in the PR. If a target section's `description` is empty in the live seed, that is the actionable gap to report.

**Editability:** **deferred.** Section descriptions live inside the `TemplateVersion.sections` JSON, which is part of `contentHash` (sha256 over `{questions, sections, scoringConfig, reportConfig, …}`) and governed by the DRAFT/PUBLISHED version lifecycle. The admin editor (`survey-template-editor.tsx`) edits template- and question-level descriptions, **not** section-level. Making section intros UI-editable forces versioning/publish decisions (new draft vs immutable published row, contentHash recompute, pinned-campaign impact) that deserve their own design + grill. It is a setup/authoring sibling of Wave D #19/#20 — see §Deferred.

---

## Wireframe reconciliation (WF-15 / WF-18) + autosave  *(deeper grill, 2026-06-14)*

**P0 — #6 is a deliberate deviation from WF-15, now documented (not silent drift).** The invited survey wireframe `src/public/wireframes-phase2/participant-invited/15-participant-survey-form.html` specifies a **WHITE** sticky header (`.survey-header { background: hsl(var(--card)) }`) with a small purple-square logo mark, org name, and an autosave badge — plus a **WHITE** sticky linear progress bar (`.survey-progress__bar/__fill/__pct` with "Section N of M"). There is **no purple card** in the wireframe.

The current live app is a **hybrid**: it renders WF-15's white `ty-header` **and** a later purple `su-shell-header` (added by the PR #41/#51 brand work) **and** a white `ty-card` title — the triple-header clutter Jeff's #6 is reacting to. **Resolution:** Jeff's explicit June-9 directive ("remove the white header bar; everything inside the purple card") **supersedes WF-15**; Wave C consolidates to the single purple card. This is an intentional, Jeff-authorized wireframe deviation, surfaced here per the wireframes-are-the-spec rule.

Two corollaries:
- **G3 restores wireframe fidelity on the progress element:** WF-15 has the linear bar and **no** segmented strip, so dropping `su-shell-seg` is *more* faithful, not less. (The bar simply moves onto the purple background per Jeff.)
- **WF-15's autosave badge** (`✓ Saved`) is a wireframe element Jeff did not call out in #6; surfacing it inside the purple card is **out of scope** for Wave C (note for a later polish, not a regression).
- **WF-18 (public)** uses a different header structure (no `.survey-header`); reconcile the public header against WF-18 during the build/`frontend-design` step rather than assuming parity with WF-15.

**Autosave interaction verified safe.** `useAnswerDraft` (`lib/assessments/use-answer-draft.ts`) hydrates answers via `JSON.parse` into the answers map. A persisted slider `0` round-trips as the number `0` → `isAnswered(0) === true` and `answered === typeof value === "number"` → the thumb renders (the hidden-unanswered state is **not** triggered by a restored minimum). The #13 invalid set is transient UI state (never persisted), so a mid-survey reload shows no red highlights until the next blocked advance. Neither #8 nor #13 regresses on draft restore.

**Autosave privacy/TTL (Round-2 M4 — documented + deferred).** Autosaved answers persist in `localStorage` with no expiry and are cleared (`clearDraft()`) only on **successful** submit — so confidential free-text can linger on a shared device after link expiry/revocation, a 401/410/409, or an unrecoverable submit error. This is a **pre-existing** property of the PR-#32 autosave, **not** introduced or touched by Wave C, and hardening it (a timestamped draft envelope with TTL + clear-on-terminal-state) is broader than participant-UX. **Explicitly out of Wave C scope; flagged as a follow-up** (the residual risk is accepted for this wave). Wave C must not *worsen* it — in particular the M1 "keep on pager" recovery keeps a draft alive on a recoverable error, which is correct, but a genuinely terminal link state should still clear the draft.

## Data flow (the one non-trivial path)

`#13` is the only new control flow. `SectionPager` owns it end-to-end:

```
handleNext()
  → unanswered = page.questions.filter(required && !isAnswered(answers[key]))
  → if unanswered.length: setInvalidKeys(new Set(unanswered.map(q=>q.stableKey))); setShowGateError(true); focus(first)
  → else: advance()

handleAnswerChange(key, value)
  → onAnswerChange(key, value)
  → if isAnswered(value): invalidKeys.delete(key)   // M1: prune ONLY when truly answered
  → if invalidKeys empty: clear showGateError         //     (whitespace text / last-checkbox-off STAYS invalid)

render question:
  → <QuestionInput invalid={invalidKeys.has(q.stableKey)} … />
```

The invalid set is **per-section** (reset on `goToSection`). No server involvement; no persisted state. `isAnswered` (from `lib/assessments/section-pages`) is the single source of "answered", already treating `0`/empty-string/empty-array correctly.

## Testing

- **Unit/RTL (TDD):** `question-input.test.tsx` (slider unanswered→answered state, `0` answered, `invalid` → `aria-invalid` for slider/text/number; **required `MULTI_CHOICE` invalid → group marked invalid + focus lands on the first checkbox** [Round-1 H1]), `section-pager.test.tsx` (validation flags the right keys, clears on answer, advances when clear, per-section reset; **prune only when `isAnswered(next)` — whitespace-only text and deselecting the last checkbox STAY invalid** [Round-1 M1]; **all-optional zero-answer submit shows the alert + focuses** [Round-1 M6]; **exactly one `role="progressbar"`, `su-shell-seg` gone** [Round-1 M3]).
- **Browser-level visual (Round-1 M5):** RTL cannot prove a hidden thumb, red rail, or browser-specific focus ring actually *renders*. Keep RTL for the state contracts, and add **at least one Playwright (Chromium) check** of the slider across unanswered / focused / invalid / answered states, plus a **manual Safari + Firefox pass** before merge (pseudo-element + `:focus-visible` behavior is engine-specific).
- **Both clients:** smoke that `org-survey-client` and `public-quiz-client` still render the pager after the header restructure (no `ty-header`/`ty-card` in the ready phase; loading/error/thank-you unchanged).
- **Visual:** Vercel preview pass of **both** flows (invited via a test campaign link; public quiz via its alias) before merge — slider unset look, red validation, unified header, bigger handle, text borders/placeholder/counter.
- **a11y lens** in adversarial review: hidden-thumb focus visibility + SR announcement; `aria-invalid` + focus management on validation; contrast of red state + caption on purple.

## Rollout

- New branch `feat/wave-c-survey-ux` off `main`; subagent-driven (implementer + spec-review + code-quality-review per task), build gate + targeted tests per task, final whole-branch review.
- Ship behind the build gate; **no feature flag** (UI-only, reversible by revert). Deploy-direct-to-prod per house MO after the preview pass + your go.
- **Rollout safety (Round-3 H1).** Wave C rewrites the *shared* `SectionPager`/`QuestionInput`, so a slider/validation regression could block submissions for all participant traffic. We deliberately do **not** add a feature flag, because on Vercel a flag change itself requires a redeploy — so a flag gives **no rollback-speed advantage** over Vercel's instant **promote-previous-deployment**, while adding awkward flag-gating to render components. Instead the safety net is: **(1)** a Vercel-**preview canary** exercised end-to-end with a real **test invited campaign** *and* the **public quiz alias** (both flows: unanswered→answered slider, red validation, empty-submit, successful submit) before merge; **(2)** an immediate **post-merge smoke** of both live flows as the **go/no-go** gate; **(3)** if smoke fails, **promote the previous Vercel deployment** (sub-minute, no rebuild) — documented in the Wave C runbook as the rollback. There are currently **no real respondents**, so present blast radius is ~zero, but this path is defined for when traffic arrives.
- **Telemetry (Round-3 M1) — light now, full deferred.** The immediate post-deploy signal is the both-flow smoke above; server-side submit success/failure is already observable via the existing `/submit` logs + durable outbox. **Full client-side event instrumentation** (counters for submit attempt/success/failure, client-gate blocks, empty-submit blocks, server-validation recovery by flow/error code) is **premature at near-zero volume** (same call as Wave B R3-M4) → flagged as a follow-up to add when real respondent traffic exists; note it in the runbook.
- SoT flush on merge: CLAUDE.md LAST_UPDATED anchor + `plans/CHANGELOG.md` entry + Notion task.

## Deferred (reasoning)

- **#14 in-app section-intro editing** → Wave D / own spec. It mutates versioned, contentHash-bound, publish-gated template content — a different risk class from participant-UX CSS, and a sibling of Wave D #19 (custom slides) / #20 (custom email editor). Deferring costs nothing; pulling it in welds an authoring feature (+ its publish-path decisions + tests) onto a low-risk UX wave. Reversal condition: if Jeff states seed-only editing is unacceptable now, scope it as its own spec rather than inlining.

## Out of scope

Anything not in Spec 17 items #6–#14. No campaign-setup (#1–3, #15–20 = Wave D), no report changes (#21, #24–31, #33 = Wave E), no net-new (#22/#23/#32 = Wave F). No migration, no new server write path, no feature flag.

## Open questions for the grill

1. ~~**#6 header restructure** — name-source per client.~~ **RESOLVED (Grill Q1, revised):** caption = the campaign's name in **both** flows (`campaign.name` invited / `campaignName` public) — matches the public welcome's own prominent `<h1>`, least visual change. Public form-step pager switches `assessmentName` from `templateName` → `campaignName`; invited unchanged.
2. ~~**#8 discoverability / keyboard focus.**~~ **RESOLVED (Grill Q2):** focus-ring trap fixed via a track-level `.is-unanswered .survey-slider:focus-visible` outline; ticks + prompt provide the discoverability affordance. Discoverability re-checked in the adversarial a11y pass.
3. ~~**#13 focus management.**~~ **RESOLVED (Grill Q4a):** focus the first invalid question on a blocked advance; no conflict with `headingRef` (section-change only).
4. ~~**#11/#12 copy + counter.**~~ **RESOLVED (Grill Q4b/c):** generic placeholders ("Type your answer here…" / "Enter a number"); counter visible only in the last ~1,000 chars.
5. **Regression surface (carried into the plan, not a blocker):** the header restructure touches both clients' render trees; `__tests__/assessments/section-pager.test.tsx` + `question-input.test.tsx` exist — the plan must read their assertions and **update** (not break) any that key on `ty-header`/`ty-card`/the segmented strip/`is-unanswered`.

---

## Changelog

### claudex round 1 — senior-engineer review (2026-06-14)

All 9 findings accepted (1 high, 6 medium, 2 low); none rejected — each was a real gap, not a style nit.

- **H1 (accepted):** required `MULTI_CHOICE` had no invalid/focus contract → added a **per-type invalid + focus contract** to #13 (slider/text/number = `aria-invalid` + focus the control; multi-choice = group-level invalid + `aria-describedby` + focus the first checkbox), with required-RTL coverage.
- **M1 (accepted):** invalid-clearing pruned on *any* change → changed to prune **only when `isAnswered(nextValue)`** (whitespace text / deselecting the last checkbox stays invalid); updated the #13 bullet + the data-flow pseudocode; added tests.
- **M2 (accepted):** several survey rules are shared `.wf-scope` selectors → added a constraint that Wave C restyling must be **new `.su-assessment-brand` overrides** (no base `.wf-scope` edits except proven-unused removals) + a static scope guard.
- **M3 (accepted):** "progress bar inside the purple card" was DOM-ambiguous (`survey-progress` is a sibling after the header) → made ownership explicit: **move the `role="progressbar"` into `AssessmentShellHeader`**; test exactly one progressbar + `su-shell-seg` gone.
- **M4 (accepted):** importing `MAX_TEXT_ANSWER_LENGTH` from `scoring.ts` would pull Zod/scoring into the client bundle → **move the limit to a client-safe `lib/assessments/answer-limits.ts`** imported by both.
- **M5 (accepted):** RTL can't prove the slider visuals render → added a **Playwright (Chromium) check** of the slider states + a manual Safari/Firefox pass; RTL retained for state contracts.
- **M6 (accepted):** all-optional public quiz with zero answers silently no-ops on Submit → added an **optional `requireAtLeastOneAnswer` mode to `SectionPager`** so the empty submit surfaces the alert + focus; tested for both flows.
- **L1 (accepted):** #14 verify-only wasn't actionable → **named the fixture** (Five Dysfunctions/Rockefeller section with a non-empty seeded `description`, via the live route) + screenshot evidence.
- **L2 (accepted):** public "About you" + thank-you/results keep white chrome → **scoped #6 to the question pager** and explicitly flagged the residual white chrome to confirm with Jeff (not silently extended).

### claudex round 2 — security & data-integrity review (2026-06-14)

0 high, 4 medium, 1 low. 3 accepted, 1 partial, 1 documented+deferred.

- **M2 (accepted):** the `requireAtLeastOneAnswer` gate was under-scoped → made it owned by `SectionPager` for **both** flows (invited can be all-optional too), with a **non-field alert + focus the first answerable control** (NOT marking optional questions invalid).
- **M3 (accepted):** double-click submit race → added a **synchronous in-flight ref latch** so only one POST is in flight; test both flows.
- **L1 (accepted):** focus-first-missed could break on a stableKey with CSS metacharacters → use a **ref map / `getElementById`**, never `querySelector('#q-'+key)`; punctuation-stableKey test.
- **M1 (partial-accept):** stale/tampered draft passes the client gate then fails server-side → **map server per-field errors back into `invalidKeys` + keep the user on the pager** (recovery) instead of a terminal screen. Full **hydrate-time draft validation/pruning** is a pre-existing, broader draft-integrity concern → **follow-up, not Wave C scope**.
- **M4 (documented + deferred):** autosave has no TTL/terminal-state cleanup → confidential text can linger on shared devices. **Pre-existing** PR-#32 behavior, not touched by Wave C; hardening (TTL envelope + clear-on-terminal-state) is a flagged follow-up, residual risk accepted for this wave. Wave C must not worsen it.

### claudex round 3 — ops & SRE review (2026-06-14)

1 high, 2 medium. 1 accepted (lighter form), 1 accepted (upgrades round-2), 1 partial/deferred.

- **H1 (accepted, lighter form):** no flag/canary/rollback gate on the shared-component rewrite → added a **Rollout safety** path: preview canary (both flows) → post-merge smoke as go/no-go → **Vercel promote-previous** as instant rollback. **No feature flag** — argued explicitly that a Vercel flag change needs a redeploy anyway, so it offers no rollback-speed gain over promote-previous while complicating render components; current blast radius ~zero (no real respondents).
- **M2 (accepted, upgrades Round-2 M1):** mapping server errors into `invalidKeys` can't recover a stale answer whose key matches no rendered question (user trapped) → Wave C now **prunes the answers map to the rendered question set on hydrate + pre-submit** (drops unrenderable keys from state + localStorage) and **falls back to a non-field alert** for keyless server errors. Cheap client-safe key-filter; value-level validation still server-side.
- **M1 (partial/deferred):** no participant-flow telemetry → light post-deploy **both-flow smoke** now + runbook note (server submit logs/outbox already exist); **full client event instrumentation deferred** as premature at near-zero volume (consistent with Wave B R3-M4), revisit with real traffic.

### Loop outcome

3 rounds run (senior-eng → security → ops/SRE). 16 findings total (1+6+2, 0+4+1, 1+2+0). All addressed: accepted or partially-accepted with the deferred remainder explicitly scoped out + flagged as follow-ups (hydrate-time deep draft validation, autosave TTL/cleanup, full client telemetry). No finding rejected outright. Design is execution-ready for the TDD implementation plan.
