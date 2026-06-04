# 10 — Section stepper + intro slides (assessment participant flow)

> **Status:** Design approved + adversarially reviewed (Codex + 6-lens panel, 2026-06-03) — pending writing-plans. Verdict was *revise-then-ship*; this is the revised spec.
> **Scope:** Assessment **participant answering** experience only (public `/quiz` + invited `/org-survey` "me" flow). No scoring-math changes; no campaign/wizard changes; no app-wide re-theme.
> **Source of truth for behavior:** this spec. **Visuals:** wireframes 15/18 (updated per §9) + the Scaling Up Brand Guidelines.
> **Related:** [ADR-0004](../../adr/0004-section-intro-via-section-fields.md) (data model), [ADR-0005](../../adr/0005-assessment-ui-brand-scope.md) (brand scope), [CONTEXT.md](../../../CONTEXT.md) (terms).

## 1. Problem

Both participant clients render an assessment as **one long scrolling page**. Jeff (June 2 call) wants the Esperto experience: **one section per screen**, branded, with an **intro slide** before each section's questions. This also reconciles a standing wireframe-drift item: wireframes 15/18 spec a never-built *one-question* pager; we ship **one-section-at-a-time** and update the wireframes.

**Key correction from review:** the existing seeds **already contain description-bearing, question-less sections** — QSP v1 `S1_welcome`, LVA `S0_welcome` + `S7_completion` — and **QSP v1 + LVA are published in prod**. These empty sections **are** the intro/closing-slide mechanism. The design embraces them as first-class, rather than treating intro slides as new.

## 2. Locked decisions (revised)

1. **One section per screen.** A **section pager**: one section's questions per screen, optionally preceded by an **intro slide**. Replaces the single long scroll in both clients.
2. **Intro/closing slides = a section's own fields.** Heading = `section.name`, body = `section.description` (plain text, `white-space: pre-line`, **no markdown**), "Start →"/continue. No new `SECTION_INTRO` type (ADR-0004). **A section with zero questions is first-class** — it renders as a pure intro/interstitial/closing slide (name + optional description + continue; Submit if last). A section with neither questions nor description still renders its name + continue (never a blank or crashing step).
3. **Data model:** reuse `section.name`/`description`/`partLabel`/`domain` (all on `SectionBase`). The admin-editor work is **not** a one-line fix — see §3.
4. **Publish invariant (forward-only, safe):** every question that **has** a (trimmed, non-empty) `sectionStableKey` must resolve to a defined section — no dangling refs. **Dropped:** the "every section has ≥1 question" check (it would reject the live QSP v1 / LVA empty sections and redden CI). A question with **no** section key is tolerated and rendered in the "Other" fallback. (A future tightening to *require* a section key is possible but only after verifying no published version has orphan questions — out of scope here.)
5. **Render fallback fixes a live bug.** Any question whose section key is missing/blank/unresolved is grouped into a trailing **"Other"** section so it always renders. This is not just preview safety: the invited client today **silently drops** orphan questions yet still counts them required → a required orphan is a permanent submit dead-end. The shared grouping fixes that. Orphan detection uses a **trim/truthiness** check, never `?? "__unassigned"` (which treats `""` as a real key).
6. **Pager step model:** the intro slide is a **sub-view of a section, not a counted step**. Label "**Section N of M**"; progress bar by **questions answered**. **Back** always free; **Next** runs a per-section required gate. Back out of section 1 → the assessment-level intro/info view.
7. **One `isAnswered` predicate** drives **both** the progress numerator **and** the required gate, so they can't diverge (today the public header counts raw `Object.keys(answers).length`, which a cleared `""`/`[]` inflates). Predicate: `undefined`/trimmed-empty-string/empty-array = not answered; **numeric `0` = answered**. Denominator = all questions including the "Other" bucket.
8. **Shared = grouping util + pager UI, not phases/submit.** Extract a pure `buildSectionPages(sections, questions)` + a `<SectionPager>` UI. Each client keeps its own pre-form phases (intro/info/error), network submit, answer state, and persistence wiring. (Refines the original "one shared component" to avoid coupling the divergent public/invited submit + phase logic.)
9. **localStorage autosave** (chosen): answers are persisted **client-side**, hydrated on mount, **cleared on successful submit**. No backend change. **Not** cross-device; server-side persistence + resume-to-progress is deferred (§8). This is net-new (no autosave exists today — see §12 risk 1); the pager makes mid-assessment reloads more likely, so this directly mitigates the amplified data-loss path.
   - **Keying (per-respondent isolation):** invited → `assessment-draft:inv:<invitationToken>` (the token is unique per respondent, so two invited respondents never collide). Public quiz → `assessment-draft:pub:<campaignAlias>:<sessionId>` where `<sessionId>` is a per-session UUID minted into **`sessionStorage`** on first load — the public route has no per-person identity, so without this two people answering the same public campaign on one shared device would see/overwrite each other's draft. Clear-on-submit handles the "A submits, B starts" case; the per-session UUID handles "A leaves without submitting, B opens a fresh session." **Residual (minor, documented):** if a second person reuses the *exact same tab/session* without closing it, they still inherit the draft — acceptable for an anonymous public quiz.
10. **Brand (assessment participant UI only — ADR-0005)** via a **new** narrow wrapper, **not** `.wf-scope` (which also wraps the admin editor + coach wizard) — see §6.

## 3. Data model & serialization (re-scoped — 4 pieces, not a one-liner)

No schema migration. The admin Sections editor currently **strips** `description`/`partLabel`/`domain`: `SectionDraft` is `{uid, stableKey, name}` only ([SectionsCard.tsx:41-45](../../../src/src/components/admin/template-editor/SectionsCard.tsx)); hydrate reads name-only and the save payload rebuilds `{stableKey,name}` and is emitted whenever **any** of version/sections/questions/scoringConfig is dirty ([TemplateEditorTabbed.tsx ~L187-200, ~L611-623](../../../src/src/components/admin/TemplateEditorTabbed.tsx)). So **editing one unrelated question silently strips `domain` off every section** — which **breaks SU Full's per-domain scoring** (`rollup.overall = "meanOfDomains"` requires every section to have `domain`; `checkDomainAssignment` fails closed). There is no `rawSectionsRef` (questions have `rawQuestionsRef`, preserved byte-for-byte; sections aren't).

The work:
- **(i)** Widen `SectionDraft` + `hydrateSectionsFromJson` to carry `description`/`partLabel`/`domain`.
- **(ii)** Add a `rawSectionsRef` byte-for-byte passthrough (mirroring `rawQuestionsRef`) so an untouched section never loses fields on a questions-only save. **Spread the raw stored row FIRST** (`{...raw, stableKey, name, ...}`) so original **key order** survives — the content hash is key-order-sensitive (§5/§12), and this is what makes reseed idempotent again.
- **(iii)** *(deferred from v1, see §8)* a `SectionsCard` description **textarea** to author intro copy. Among seeds, only **SU Full** carries section descriptions today; Rockefeller/QSP/LVA are name-only, so they render **no intro copy** until authored. v1 authors intro copy via **seed updates** (the established idempotent-DRAFT path), not the admin UI.
- **(iv)** Regression tests: `domain` **and** `description` survive a **questions-only** edit+save; SU Full sections still pass `checkDomainAssignment` after a round-trip; content hash is stable (§10).
- **Pre-merge:** a **read-only prod check** of the SU Full v2 DRAFT's stored `sections` JSON — confirm a lossy editor round-trip hasn't already stripped its `domain`.

## 4. Publish-time invariant + render fallback

**Invariant** (new `superRefine` on `TemplateVersionForPublishSchema` in `scoring.ts`, beside `checkRecommendationsPublish`/`checkDomainAssignment`): every question with a non-empty `sectionStableKey` resolves to a section in `sections[]`; else a publish issue at that question's path. **No** "section has ≥1 question" check. Publish-only (DRAFT PATCH stays permissive). Issues route through the existing `PublishFailureModal` (422 + `issues[]`).

**Render fallback** (in `buildSectionPages`): questions with a missing/blank/unresolved key → a synthetic trailing **"Other"** section. The per-section gate **and** the last-section Submit both source from this same grouped list, so a required orphan is rendered *and* satisfiable. Trim/truthiness check, not `??`.

**Must stay green:** `all-assessments-integration.test.ts` runs all 5 seeds through `TemplateVersionForPublishSchema`; its filter suppresses only *recommendations*-path issues. The invariant must not emit issues for QSP v1 / LVA empty sections (it won't — forward-only) and the test is explicitly in-scope to update/confirm.

## 5. Pager behavior (the contract)

State (replaces each client's `"form"` phase body; pre-form phases unchanged):
- `sectionIndex` — into the ordered, **renderable** section list from `buildSectionPages` (real sections in `sortOrder` + trailing "Other" if any). Guard `sections[sectionIndex] === undefined` (zero-section DRAFT preview) → minimal Submit/empty-state, never a crash.
- `view: "intro" | "questions"` — `"intro"` when the section has a non-empty `description`; otherwise it opens at `"questions"`. A **zero-question** section is intro-only: its continue advances straight to the next section (Submit if last).

Navigation:
- **Start/Continue →** (intro view): → that section's `"questions"` (or next section if it has none).
- **Next →** (questions view): run the required gate (current section only); on pass, advance. **Last** section's Next = **Submit**.
- **Back ←**: questions-with-intro → its intro; questions-without-intro or intro → previous section's questions (its last view). Back out of **section 1** → the assessment-level intro/info phase. Never gated.
- **Empty-submission guard** (verify + mirror): the server/`scoreSubmission` may reject an empty-answers payload. If so, the last-section Submit additionally requires **≥1 answer overall** client-side, with a clear message (an all-optional template must still produce a valid submission). Confirm server behavior in Task 6 and mirror it.

Progress + labels: header "**Section N of M**" (`M` includes "Other" only when present; optionally suppress the stepper number on the synthetic "Other" bucket). Progress bar = answered ÷ total via the **shared `isAnswered`** (decision #7) — intro slides don't move the bar.

Required gate (per type, using the existing missing-predicate, **0 is valid**): SLIDER_LIKERT value selected; TEXT trimmed-non-empty; NUMBER is a number (incl `0`); MULTI_CHOICE ≥1 choice and ≤ `maxChoices`.

## 6. Brand application (scoped — new wrapper, not `.wf-scope`)

`.wf-scope` is also applied to the admin assessments layout, the coach campaign wizard, and `AssessmentTemplatesList` — overriding tokens there would leak SU purple/Roboto into admin/portal (ADR-0005 violation). So:
- **New narrow wrapper** (e.g. `.su-assessment-brand`) applied **only** in the two participant clients (or on the `<SectionPager>` subtree). All brand token overrides live under it.
- **Tokens:** override `--primary` → purple `#522583` and `--ring` → purple **inside the new scope** (the global blue `--ring` otherwise gives the branded UI a blue focus ring). Buttons, progress fill, focus rings.
- **Section accent by domain** (`domainAccent(section.domain)`, see CONTEXT.md): People orange / Strategy blue / Execution brown / Cash green / You purple; default neutral purple when unset. Used **only** for borders / rules / fills / chips — **never as text on white** (orange `#f7a600` and green `#95c11f` are ~1.9:1 on white).
- **Type:** headings = Helvetica Neue (system stack `"Helvetica Neue", Helvetica, Arial, sans-serif`); body = Roboto via `next/font/google` instantiated in a **shared module**, its `.variable` applied to the brand wrapper **div in both** `/quiz` and `/org-survey` layouts (fonts live on root `<body>` today; there is no shared parent layout). Also override the existing Plus-Jakarta / blue-`--primary` usage in `wireframes-scoped.css` within the scope, or Roboto/purple won't win.
- **a11y (fix while folding the two slider renderers):** the public SLIDER is a bare-button grid with no accessible name — the shared pager must give the slider an accessible name = the question label (native range + real `<label>`, or a radiogroup with `aria-checked`). Add `role="progressbar"` + `aria-valuemin/max/now` + accessible name to the progress bar; on section change move focus to the new section heading (`tabIndex=-1` + `.focus()`) and announce "Section N of M" via `aria-live="polite"`.
- **Header:** SU submark + "Scaling Up Assessment" wordmark; the inviting coach is named separately ("Sent by …") — no coach corporate logo. No drop-shadow/glow, no unauthorized colors, no busy backgrounds (incorrect-usage rules).

## 7. Components & files (anticipated — finalized in writing-plans)

- **New:** `buildSectionPages(sections, questions)` pure util (group + order + "Other" via trim-check) and an `isAnswered(q, value)` predicate (shared by progress + gate); `<SectionPager>` UI (owns `sectionIndex`/`view`, progress, gate, Back/Next/Start/Submit, a11y); a `domainAccent` helper; the `.su-assessment-brand` scoped CSS + a shared Roboto `next/font` module; a small localStorage autosave hook (hydrate/debounced-write/clear) with the per-respondent keying in §2 #9 (invited = invitation token; public = campaign alias + `sessionStorage` UUID).
- **Edit:** `public-quiz-client.tsx` + `org-survey-client.tsx` — replace the stacked `"form"` body with `<SectionPager>`; keep their intro/info/error phases, answer state, submit; **fix the invited orphan dead-end** via the shared grouping; wire localStorage + the brand wrapper.
- **Edit:** `scoring.ts` — forward-only publish invariant.
- **Edit:** `SectionsCard.tsx` + `TemplateEditorTabbed.tsx` — sections preservation (§3 i/ii).
- **Edit:** `/quiz/layout.tsx` + `/org-survey/layout.tsx` — brand wrapper div + Roboto variable.
- **Edit:** seeds (intro-slide copy) + wireframes 15/18 (§9).

## 8. Out of scope (v1)

- **Server-side / cross-device** answer persistence + resume-to-progress (localStorage is v1).
- The admin **section-description authoring textarea** (author intro copy via seed updates in v1).
- **Standalone UNATTACHED interstitials** (a slide not bound to a section) — but **empty *attached* sections are in** (ADR-0004).
- App-wide re-theme (ADR-0005) — flagged separately.
- Esperto historical-data import — separate gated memo ([11](./11-esperto-import-feasibility.md)).
- The never-built one-question-at-a-time pager (superseded).

## 9. Wireframe updates

Update to one-section-at-a-time + intro/closing slides (retiring the one-question pager): `src/public/wireframes-phase2/participant-invited/15-participant-survey-form.html` and `src/public/wireframes-phase2/participant-public/18-participant-public-quiz-form.html`. Each shows: an intro slide (heading + body + Start), a section's questions on one screen, "Section N of M" + progress, Back/Next (Submit on last), and the scoped SU brand. Note: the "Saved 12s ago" chrome reflects the new localStorage autosave (it did **not** exist before).

## 10. Test plan (TDD — failing test first per task)

- **Publish invariant:** dangling section ref → publish issue at the question path; a question with no key → no publish issue (renders in "Other"); **all 5 seeds (incl. QSP v1 / LVA empty sections) → no new issues** (confirm `all-assessments-integration.test.ts` stays green).
- **Sections preservation + hash:** `domain` and `description` survive a **questions-only** edit+save; SU Full passes `checkDomainAssignment` post-round-trip; **seed → load → save-with-no-change → recomputed `contentHash` equals the seed's byte-for-byte AND reseed no-ops (does not throw)**.
- **`buildSectionPages`:** groups by section in order; orphan (missing/blank/unresolved key) → trailing "Other"; empty section preserved as intro-only; single-section + zero-section cases.
- **`isAnswered` / progress + gate:** clearing a NUMBER decrements progress **and** blocks Next; required NUMBER answered as `0` passes; empty-string TEXT / empty MULTI_CHOICE don't increment progress.
- **`<SectionPager>`:** intro shown only with `description`; Start→questions; Back free (incl. back out of section 1 → intro); last-section Next = Submit; `M=1` single-section; empty-list guard; a11y (slider accessible name = label; `role=progressbar`; focus-to-heading).
- **Invited orphan fix (client integration):** a **required** orphan question renders in "Other" and is answerable/submittable (today it dead-ends).
- **localStorage autosave:** a reload restores in-progress answers; a successful submit clears the stored entry; the invited key is per invitation token; **two public sessions with different `sessionStorage` UUIDs do not collide** (the second taker does not see the first's draft).
- **Brand scope:** admin assessments lane tokens are **unchanged** (no purple/Roboto leak).

## 11. Execution (writing-plans → subagent-driven) — revised order

Each task = TDD failing test first, build gate `CI=true npx next build --turbopack` + targeted tests, spec-compliance then code-quality review.
1. **`buildSectionPages` + `isAnswered` + render fallback + content audit** — prove grouping handles empty/orphan/no-section/single/all-optional against the 5 seeds. No UI, no publish change.
2. **Sections preservation fix** (§3 i/ii) + hash-stability + domain-survives tests + SU Full DRAFT prod check. *(Hash-bearing — before any authoring.)*
3. **`<SectionPager>` UI** (state + shared predicate + gate + a11y) + **`.su-assessment-brand` scope** + Roboto `next/font` module.
4. **localStorage autosave** (hydrate/debounce/clear) in both clients.
5. **Wire public client** to the pager + brand wrapper.
6. **Wire invited client** to the pager + brand wrapper — **fix the orphan dead-end**; verify + mirror the empty-submission guard.
7. **Publish invariant** (forward-only) in `scoring.ts` **last** + update/confirm `all-assessments-integration.test.ts`.
8. **Author intro-slide copy** via seed updates (new idempotent DRAFTs) + **update wireframes 15/18**.

## 12. Risks (corrected)

1. **Autosave never existed** (review caught the false premise) → we add **localStorage** (client-only; cross-device deferred). The pager amplifies reload-loss, so this is load-bearing, not optional.
2. **Seeds do NOT all section every question** — empty welcome/closing sections are intentional **and published** → the invariant is **forward-only**; the integration test must stay green.
3. **Brand leak via `.wf-scope`** → a new narrow wrapper; test the admin lane tokens are unchanged.
4. **Reseed-throw hazard:** the serialization fix changes the section shape → content hash → `ensureTemplateVersionContent` fail-closes if a DRAFT's stored hash differs. Mitigate by spreading the **raw row first** (preserve key order); the fix then *restores* idempotency. FK-pinning (`campaign.versionId`, `submission.campaignId`) means **no data-detachment** risk.
5. **Shared pager must fix, not inherit,** the invited orphan dead-end → gate + Submit source from the same grouped list; client-integration test.
