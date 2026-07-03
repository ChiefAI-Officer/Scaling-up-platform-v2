# Wave R — Participant Slider UX + Reports & Printing (Jeff #8, #4, #9)

**Status:** DESIGN, CO-VALIDATED — decisions locked 2026-07-03 (brainstorm + grill-with-docs + grill-me + /co-validate with Codex: 3 findings accepted, 2 overridden, +2 Claude additions — see decisions 14–19); awaiting user greenlight before any code.
**Scope source:** Jeff July-1 feedback triage (Jul-2 report), phases P4 + P5; absorbs the Wave L N≠3 verification tail (PR #98 caveat).
**Rollout:** **FLAGLESS.** All changes are presentation-only — no schema, no writes, no scoring changes. Launch = the merge itself; kill = revert commit. Precedent: Wave C shipped the participant slider restyle flagless.
**Delivery:** ONE PR (slider + free-text layout + group print + tests), adversarially reviewed; the R-4 N=2 ceil1 check runs PRE-merge (each prod mutation individually authorized), a preview-deployment pass gates the merge, the merge is the launch, and read-only live smokes + the SoT docs PR follow in the same session.

---

## R-1 · Slider UX (Jeff #8) — thicker track + tap-a-number-to-set

**Surfaces:** all three participant surfaces at once — invited survey (`section-pager.tsx`), org survey, public quiz — because they share the `SLIDER_LIKERT` branch of `src/src/components/assessments/question-input.tsx` and the `.su-assessment-brand` CSS scope (verified: quiz + org-survey layouts and section-pager all carry the scope class).

**Visual spec = the CSS mock Jeff saw** in the Jul-2 and Jul-3 progress reports (`.slidermock .trackthick`), translated to brand:

| Property | Today | Wave R |
|---|---|---|
| Track height | 6px | **14px** (mock's `trackthick`), radius 7px |
| Track colors | grey `#e4e4e4` / purple fill to `--pct` | unchanged (brand purple `#522583`, NOT the mock's illustrative blue) |
| Thumb | 30px purple, white border (Wave G) | unchanged; `margin-top` recentered for the 14px track |
| Number row | `aria-hidden` decorative spans | **tappable buttons** (see below) |
| Status line (empty state) | "Tap or drag the slider to rate." | **"Tap a number or drag the slider to rate."** |
| Status line (answered) | "Your rating: N" | unchanged |

**Click-to-set semantics (grilled decision — pointer-only buttons):**
- Each number becomes `<button type="button" tabIndex={-1} aria-label={"Set rating to " + v}>` calling the same `commit` path as the drag (`onChange(q.stableKey, v)`).
- `tabIndex={-1}`: Tab skips the numbers. The `<input type="range">` remains the single keyboard control (arrows/Home/End already work). Rationale: ~11 focusable numbers × ~10 questions per section would add ~110 tab stops — a real keyboard regression duplicating a control that already exists.
- The row's `aria-hidden` is **removed** (interactive elements must not be hidden from assistive tech). Screen-reader touch exploration announces "Set rating to 7, button".
- Hit areas via **equal-slice flex** (grilled): each button gets `flex: 1`, dividing the full row into equal touch slices with zero dead zones and zero overlap (~29–34px per slice on narrow phones — the maximum physically available — wider on desktop; ~32px tall). Fixed ≥32px paddings were rejected: 11 × 32px = 352px overflows narrow viewports. Visual glyph stays the current size; hover + `is-current` selected states per the existing tick treatment (purple, scale-up).
- Wave C rule holds: the `<input type="range">` is NOT replaced; all existing class names / test hooks (`survey-slider`, `survey-slider-tick`, `is-current`, `is-unanswered`, `--pct`) are preserved. Tick spans become buttons but keep the `survey-slider-tick` class.
- Unanswered state: thumb stays hidden until first interaction; tapping a number IS the first answer (commit fires, `is-unanswered` clears, thumb appears at the tapped value).

**Files:** `question-input.tsx` (SLIDER_LIKERT branch), `styles/wireframes-scoped.css` (`.su-assessment-brand .survey-slider*` block — track heights in 3 places: base, `-webkit-slider-runnable-track`, `-moz-range-track`/`-moz-range-progress`; thumb `margin-top`; new button styles).

**Wireframe supersession (recorded, not drift):** `src/public/wireframes-phase2/participant-invited/15-participant-survey-form.html` shows the pre-Wave-R slider. Jeff explicitly requested this change and approved the mock via two progress reports — the report mock supersedes the wireframe. Not a P0.

## R-2 · Free-text answers full-width on reports (Jeff #4)

**Surface:** the "Additional responses" section of `BrandedReport.tsx` (`su-report-additional` / `su-report-dl-row`) — the only place non-slider answers render on reports, shared by every scored template (QSP, SU-Full, LVA individual). One change fixes all templates.

**Change (grilled decisions — all rows, screen AND print):**
- `su-report-dl-row` drops `grid-template-columns: 1fr 2fr` for stacked block layout: question (`su-report-dl-q`) on its own row, answer (`su-report-dl-a`) full-width below.
- Applies to **all** rows in the block (TEXT, NUMBER, MULTI_CHOICE) — one consistent rhythm, no per-type branching.
- Same layout on screen and in print (no dual layout to maintain; Jeff sees the fix everywhere).
- **Print rule:** `.su-report-dl-row { break-inside: avoid; page-break-inside: avoid; }` in the `@media print` block. **Build correction:** a `break-inside: avoid` rule for dl-rows already existed (~line 887) — the spec's "not covered today" claim was wrong. The existing rule was upgraded in place (added `page-break-inside` for older engines); no duplicate. The now-dead responsive `grid-template-columns: 1fr` line (~819) was removed with the grid.

**Files:** `styles/su-report.css` only (CSS-only change; `BrandedReport.tsx` markup already uses `<dt>`/`<dd>` per row).

### R-2b · The REAL live squeeze — TEXT answers in qualitative rating sections (preview-pass discovery)

The pre-merge preview pass on a live QSP report exposed a scope gap: **QSP reports are qualitative reports** (`QualitativeReport`, not `BrandedReport`), and their free-form TEXT answers (e.g. "Please explain your rating.") render inside the statement table with the answer squeezed into the **96px rating column** (`su-stmt-rate` — built for numbers). The BrandedReport dl block R-2 changed barely renders on live data. This was the actual surface behind Jeff's #4 complaint. `RatingBlock`'s own doc comment claimed "TEXT reflections still render as Q&A within the same block" — never implemented.

**Fix (TDD, 4 new tests):** in `RatingBlock`'s statement table, `type === "TEXT"` items render as a full-width `<td colSpan={2} class="su-stmt-text">` row — question (`su-stmt-text-q`, bold) on its own line, answer (`su-stmt-text-a`, pre-wrap) below — preserving item order exactly. Slider/number statements keep the two-column shape. New CSS beside the stmt-table block; the existing `@media print` `.su-stmt-table tr { break-inside: avoid }` rule already covers the new rows.

**Files:** `QualitativeReport.tsx` (RatingBlock tbody), `styles/su-report.css` (su-stmt-text* rules), `__tests__/components/assessments/qualitative-report.test.tsx`.

## R-3 · Group-report print (Jeff #9)

**Surface:** the group-report page `src/src/app/(report)/assessments/[id]/report/page.tsx`. The `(report)` route-group layout is deliberately chrome-free ("printable report stays clean" — its own doc comment), and `@media print` break rules for all `su-group-*` sections already exist (`su-report.css:1788`). The gap is purely the missing button.

**Change (grilled decision — ALL group report types, not LVA-only):**
- Add the same `su-report-actions no-print` bar the per-respondent report page has, containing the existing `PrintReportButton` ("Print / Download PDF" via `window.print()`), on the **full-render** outcome only (not on `GroupReportEmpty` / not-applicable outcomes). **Build finding (recorded):** "degraded" is not a distinct page outcome — it is a metrics flag on the `ok` outcome and still renders the complete `<GroupReport/>` body, so degraded full renders DO get the button (a degraded report is fully printable; the spec's earlier "no button on degraded" assumed a distinct non-report body that doesn't exist). **Top of the report only** (grilled) — identical placement to the per-respondent page; no bottom duplicate.
- No per-type branch: LVA (QualitativeGroupReport) and SU-Full/scored (ScoredGroupReport) both get it via the shared page. Note: RockHabits and Five-Dysfunctions group reports dispatch to the same `QualitativeGroupReport` renderer (`GroupReport.tsx:255`), so they inherit the button and the LVA print pass exercises their shared components — no separate smoke needed (grilled).
- **Print QA depth (grilled):** LVA group = full print pass (cover page-break, matrix rows, conditional obstacles, Appendix B pseudonyms, footer). Scored group = verify-only smoke (renders, no clipped tables); new print CSS written only if that smoke shows breakage.

**Files:** `(report)/assessments/[id]/report/page.tsx` (+ `su-report.css` only if the LVA print pass finds gaps).

## R-4 · Wave L tail — live ceil1 verification on an N≠3 LVA cohort (PRE-MERGE)

Prod state (read-only query, user-authorized 2026-07-03): LVA = `leadership-vision-alignment` (`cmpl64cb30003mjdszd2e5fql`); cohorts are N=3 ("LVA Spectrum" — the already-verified case) and several N=1 test campaigns. N=1 means are always exact (0/5/10) — `ceil1` rounding never fires, so N=1 alone can't close the tail.

**Timing (co-validate revision):** this check runs **BEFORE the Wave R merge**. It has zero dependency on Wave R code — the LVA group report and the `ceil1` formula are live on prod today. Running it pre-merge makes "fix any defect in this PR" internally consistent (the original post-merge sequencing was contradictory — Codex catch).

**Plan (grilled decision — construct N=2, pre-merge):**
1. ⚡ Authorized prod mutations (LVA is invited-flow, so this is **2–3 mutations, each individually authorized**: add a test respondent to the roster of an existing LVA test campaign → **mint the invitation link WITHOUT email fanout** (open the token URL directly; a controlled test address is used only if the flow forces a send — co-validate revision) → submit one test response with a mixed rating pattern; "LVA test new" N=1 → N=2). Same pattern as the O/P/Q launch walks; all artifacts stay inside an existing test campaign.
2. Open its group report; hand-check rendered ratings against the formula `ceil1((10·strong + 5·avg + 0·weak) / n)` (`lib/assessments/lva-report-display.ts:45`) — e.g. one Strong + one Average on a statement ⇒ exactly 7.5.
3. Spot-check an untouched N=1 campaign renders sanely.
4. The test campaign stays as-is (already a test artifact); no cleanup mutation needed.

If the hand-check fails, that is a Wave L defect: it gets fixed + tested in this PR before merge.

---

## Explicitly out of scope
- Any scoring, schema, or API change (none needed).
- SU-Full group print *polish* beyond the verify-only smoke (see R-3).
- Per-respondent report print (already shipped; unchanged).
- Jeff #2.3 invite copy, #15/#16/#19 (waiting on Jeff), P7 LVA peers, P1 imports.

## Edge cases
- **Slider scales:** buttons generate from the same `min/max/step` loop as today's ticks — any scale renders correctly, not just 0–10.
- **Disabled state:** number buttons take `disabled={disabled}` like the range input (preview/read-only contexts).
- **Tap on current value:** re-commits the same value — harmless no-op (matches drag-to-same behavior).
- **Long question labels in R-2:** stacked layout removes the truncation pressure; `white-space: pre-wrap; word-break: break-word` on answers already handles long unbroken strings.
- **Print with zero additional responses:** section already renders conditionally (`hasAdditional`) — unchanged.
- **Group report print on empty/not-applicable outcomes:** no button rendered — nothing to print. (Degraded is NOT one of these — it's a metrics flag on a full render and keeps the button; see R-3 build finding.)

## Test plan (TDD, subagent-driven)
- **Jest — slider:** tapping a number commits the value **through the same `onChange` path as the drag** (buttons call `onChange(q.stableKey, v)` directly — they cannot reuse the literal `commit` handler, which reads `e.currentTarget.value` off the range input); tap answers an unanswered question (clears `is-unanswered`); buttons carry `tabIndex={-1}` + `aria-label`; row no longer `aria-hidden`; disabled propagates; status copy updated; range input keyboard path untouched; class names/hooks preserved.
- **Jest — report page:** group-report page renders `PrintReportButton` inside `no-print` on full render; NOT on empty/not-applicable/degraded outcomes; per-respondent page unchanged.
- ~~CSS-contract string tests~~ — **dropped (co-validate):** brittle, low-value. The stacked layout + print break rule are verified by the print QA pass and preview-deployment check instead.
- **Jest — ceil1:** fractional cases (7.5, 3.4→3.4, 3.41→3.5) — augment only if existing Wave L tests lack them.
- **Build gate:** `CI=true npx next build --turbopack`.
- **Preview-deployment pass (pre-merge, co-validate addition):** on the PR's Vercel preview URL — slider tap-to-set on desktop + mobile viewport with the thick track; stacked additional responses on a report; group-report print button + print preview. Flagless means merge = live, so this is the last gate before production. **Explicit checks from adversarial review:** (a) endpoint tick alignment on a WIDE desktop viewport — equal-slice glyph centers sit ~12–15px inboard of the thumb's 0/10 resting centers at ~600px card width (near-perfect on mobile); judge whether it reads as misaligned; (b) during the LVA print pass, watch the section-level `.su-report-additional { break-inside: avoid }` — stacked rows make the section taller, so a many-answer report may page-push the whole section (pre-existing rule; drop it in favor of the per-row rule if it bites).
- **Live smoke (post-merge):** repeat the same checks on production (read-only — no mutations needed; R-4 already ran pre-merge).

**Implementation cautions (recorded so TDD subagents don't rediscover them):**
- Stacked `su-report-dl-row` needs explicit q→a spacing; the default `dd` indent is zeroed by Tailwind preflight — do not rely on browser defaults.
- Equal-slice number buttons yield ~29–34px targets on narrow phones: meets WCAG 2.5.8 AA (24px), intentionally below AAA (44px) — maximum physically available width.

## Launch plan (same session as merge)
1. **⚡ R-4 pre-merge:** authorized N=2 construction + ceil1 hand-check (see R-4). Failure = fix in this PR.
2. Adversarial whole-branch review → resolve findings → PR → preview-deployment pass → **stop before merge** (user says merge).
3. Merge = launch (flagless). Verify Vercel `● Ready`.
4. Live smokes per test plan (read-only).
5. SoT: CLAUDE.md anchor + `plans/CHANGELOG.md` (`wave-r-launched`) + freshness lint via the house same-session docs PR; Notion task auto-fires on push. *(Codex suggested folding SoT into the code PR pre-merge — overridden: house practice (Waves P #123→#124, Q #125→#126) is a same-session post-merge docs PR because the CHANGELOG records launch evidence that doesn't exist pre-merge.)*

## Decision log
| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | #4 layout media | Screen + print (one stacked layout) | No dual layout; fix visible everywhere |
| 2 | #4 row scope | ALL additional-response rows | One rule, consistent rhythm, no type branching |
| 3 | #9 scope | All group report types get the button | Page-level change; no type branch to delete later |
| 4 | #9 print depth | LVA full pass; scored verify-only | Jeff asked for LVA; scored inherits existing rules |
| 5 | Slider visual | Report CSS mock = spec (14px track), brand-translated (purple, 30px thumb kept) | Jeff saw the mock twice without objection |
| 6 | Number a11y | Pointer-only buttons, `tabIndex={-1}`, aria-labels, no `aria-hidden` | Zero keyboard regression; slider stays the keyboard control |
| 7 | Status copy | "Tap a number or drag the slider to rate." | Teaches the new affordance |
| 8 | Flag posture | FLAGLESS | Presentation-only; nothing for a flag to protect; Wave C precedent |
| 9 | Delivery | One PR; merge = launch | Three small cosmetic changes; one review/SoT cycle |
| 10 | Wave L tail | Construct N=2 via authorized launch mutations (2–3: roster add → invite → submit) | Only live path that exercises fractional ceil1 |
| 11 | Number hit areas | Equal-slice `flex: 1` buttons | Fixed ≥32px paddings overflow narrow phones (11 × 32px = 352px); slices give max available touch area, no overlap |
| 12 | Print button placement | Top only | Matches per-respondent page pattern |
| 13 | Print smoke breadth | LVA full pass + SU-Full smoke only | RockHabits/Five-Dysfunctions share the qualitative renderer with LVA — extra opens add time, not signal |
| 14 | R-4 timing (co-validate) | PRE-merge, not post-merge | Zero dependency on Wave R code; makes "fix in this PR" consistent (Codex catch) |
| 15 | R-4 invite (co-validate) | Mint link, no email fanout | No unnecessary sends; controlled test address only if the flow forces one (Codex catch) |
| 16 | CSS-contract Jest tests (co-validate) | Dropped | Brittle string tests; print QA + preview pass cover it (Codex catch) |
| 17 | Preview-deployment gate (co-validate) | Pre-merge Playwright pass on the PR preview URL | Flagless ⇒ merge = live; preview is free risk reduction (Claude catch) |
| 18 | SoT placement (co-validate) | Post-merge same-session docs PR — Codex suggestion to fold into the code PR OVERRIDDEN | House precedent (P/Q); CHANGELOG records launch evidence that doesn't exist pre-merge |
| 19 | #4 screen scope (co-validate) | Screen+print stacking KEPT — Codex "print-only" suggestion OVERRIDDEN | Explicitly user-approved at brainstorm (decision #1), not an assumption |
