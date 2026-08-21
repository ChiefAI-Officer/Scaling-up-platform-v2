# Report HTML and Phase-Aware Peers Integration Design

**Status:** Approved for implementation on 2026-08-21

**Base contract:** Scaling Up Full Peers PR #372, merged to `main` as `5917d923a483ce6e422438f4a35e8d3b46903d65`

## Goal

Finish the dark report-content editor on top of the exact merged phase-aware Peers report without letting authored content replace respondent-specific results, misrepresent peer controls, or break the fixed 26-page Scaling Up Full report.

## Release shape

- Peers remains the first, separate merged PR.
- This work stays on `codex/report-html-authoring` and becomes a later, separate PR.
- Report HTML remains dark/default-off. This work does not change an environment variable, activate a feature, publish an assessment version, repin a campaign, or mutate Production data.
- The existing report-HTML rule that new authorable reports use Classic remains in scope. Existing stored campaign styles remain readable.

## Protected report contract

Authored content controls only two bounded regions:

1. The Welcome content on Scaling Up Full page 2.
2. The optional closing message on Scaling Up Full page 25.

The following generated content is never replaced by authored content:

- Scores and ScaleUp Score.
- Organizational phase.
- You and Peers values and charts.
- Current or historical peer explanation.
- Per-question feedback selected from the completed result.
- Question labels and ordering.
- The page-25 respondent summary: ScaleUp Score plus strongest and focus chapters.
- Appendix A on page 26.

When a closing message exists, page 25 renders generated add-ons, the generated respondent summary, then the authored closing message. The authored message replaces only the default next steps and default coach-contact link. With no authored closing message, the existing default next steps and coach link remain.

## Admin behavior and copy

The Reports tab must describe replacement accurately:

- Heading: `Report content`
- Introductory copy: `Add optional content to the Welcome and Closing sections. The generated report between them stays unchanged.`
- Welcome title: `Welcome section`
- Welcome helper: `Replaces the default Welcome content on page 2.`
- Closing title: `Closing message`
- Closing helper: `Appears after the respondent's score and strongest/focus summary on page 25. It replaces only the default next steps and coach link.`
- Generated-report copy: `Scores, phase, You and Peers comparisons, explanations, feedback, and question order are generated automatically and cannot be replaced here.`

The isolated fragment previews are removed. One full-report preview card uses these strings:

- Title: `Full report preview`
- Helper: `Preview uses the last saved content and the exact report styling.`
- Primary action: `Open full report preview`
- Scaling Up Full secondary action: `Open historical report preview`
- Dirty-state helper: `Save the draft to preview your latest changes.`

Preview actions are disabled while report content is dirty. Published versions remain read-only and previewable.

The merged Scaling Up Full Settings behavior is preserved verbatim: editable Peer averages are absent and the read-only `Peer comparisons` card explains automatic phase-based selection. Other eligible assessments retain their editable peer averages.

## Full-report preview

Add the admin-only route:

`/admin/assessments/templates/[id]/versions/[versionId]/preview-report`

The route:

- Calls `requireAdmin()` before reading data.
- Loads the requested template and version and returns `notFound()` when ownership does not match.
- Reads the saved, sanitized report HTML from that exact version.
- Builds a deterministic representative report from the version's stored questions, sections, and scoring configuration through the production scoring seam.
- Uses the same `BrandedReport`, `ReportStyleScope`, report CSS, Scaling Up Full landscape model, and phase-aware peer validation as a real respondent report.
- Never reads a real respondent, campaign, organization, or submission.
- Uses Phase 4 / Delegation for the default Scaling Up Full preview.
- Accepts `peerReference=historical` only for Scaling Up Full; that variant removes declared peer snapshot/row fields so the existing historical presentation path produces the historical explanation.
- Renders the complete report, not a selected fragment or screenshot.
- Includes a small admin preview banner outside print media and relies on the browser's normal Print / Save as PDF action.

For non-Scaling-Up templates, the route uses the existing deterministic report-style preview fixture and the exact Classic renderer. It still injects only the saved, sanitized Welcome and Closing content from the selected version.

## Authoring guardrails

Security sanitization remains allowlist-based and occurs on draft save, publish, and defensive load. Add fixed-page limits before content can be stored:

| Limit | Welcome | Closing |
| --- | ---: | ---: |
| Raw source characters | 12,000 | 12,000 |
| Visible text characters after sanitization | 2,200 | 900 |
| HTML elements after sanitization | 64 | 36 |
| Nesting depth | 8 | 6 |
| Images | 1 | 1 |
| Tables | 1 | 1 |
| Table rows | 8 | 6 |

Layout-affecting inline CSS is narrowed for both regions:

- No viewport units.
- No negative lengths.
- No explicit `height`, `min-height`, `max-height`, `width`, or `min-width`.
- No `grid` or `flex` display.
- Images have no authored width/height attributes and remain constrained by report CSS.
- Links, text formatting, headings, lists, one bounded table, and one bounded image remain supported.

Guardrail failures return a field-specific validation issue and do not persist the report configuration. The textarea `maxLength` and counter use 12,000, matching server truth.

## Scaling Up Full layout

- The report retains exactly 26 DOM pages and exactly 26 physical A4-landscape PDF pages.
- Page 2 may replace its default body with the bounded Welcome content.
- Pages 3–24 retain their generated content and merged Peers behavior.
- Page 25 always retains the respondent-specific summary before optional authored closing content.
- Page 26 remains the appendix.
- Custom content uses the page body's available space; it does not add its own page padding inside the landscape page.
- Screen widths down to 390px remain single-column with no horizontal overflow.
- Print content stays inside the physical page bounds; tests must detect overflow instead of accepting clipped content.

## Required visual matrix

For both current Phase 4 and historical peer references, verify:

1. Default content.
2. Welcome only.
3. Closing only.
4. Both fields.
5. Representative long content close to the guardrail limits.

Each case is checked at desktop 1280×720, mobile 390×844, and A4-landscape PDF. Every PDF must contain exactly 26 physical pages. Automated geometry checks reject horizontal overflow and any Welcome or Closing content outside its physical page. Current previews must show `Phase 4 · Delegation`; historical previews must show `Historical benchmark`. Neither may expose internal source IDs, hashes, catalogue terminology, snapshot terminology, or other engineering language.

## Verification and release gates

Before PR creation:

- Focused RED/GREEN tests for merge preservation, conclusion behavior, guardrails, preview authorization/data isolation, and editor copy.
- Combined browser/PDF visual matrix above, with screenshots/PDFs retained outside tracked source.
- Full repository Jest suite.
- ESLint over every changed TypeScript/TSX file.
- Migration safety gate.
- `CI=true next build --turbopack`.
- Documentation freshness and `git diff --check`.
- Independent task reviews and a final whole-branch review.

The separate PR may be opened after these gates. No feature activation, assessment publication, lifecycle script, or Production data mutation is part of this design.
