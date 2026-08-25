# Scaling Up Full - Jeff-Directed ESPERTO Cosmetic Parity

**Date:** 2026-08-25

**Status:** Implemented; final visual approved by the user on 2026-08-25

**Delivery:** One report-only branch, one pull request, one squash-merged production commit

## Objective

Apply only the cosmetic changes Jeff requested in the August 24 meeting. Copy the ESPERTO pages Jeff explicitly identified, populate report-driven areas from data the platform already possesses, preserve the existing answer-driven recommendation system, and avoid a broader report redesign.

## Authority

1. The user's instructions are authoritative.
2. The local meeting recording is authoritative for speaker attribution and the screen Jeff was reviewing.
3. The Fathom transcript supplies searchable wording and timestamps, but its speaker labels are incorrect around the two “copy” statements.
4. The ESPERTO PDF is the visual and copy reference.
5. The Scaling Up brand guide supplies the exact domain colors and typography.

Reference files:

- Recording: `/Users/diushianstand/Downloads/Impromptu Zoom Meeting - Aug 24 2026.mp4`
- Fathom: `https://fathom.video/calls/796306304`
- ESPERTO report: `/Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/ScalingUp_report_John CEOExec_2026-05-01T08_13_18-04_00.pdf`
- Brand guide: `/Users/diushianstand/Downloads/Scaling Up Brand Guidelines (1).pdf`

The correct proper-name spelling is **ESPERTO**.

## Recording-backed directive matrix

| Time | Screen under review | Jeff's direction | Required treatment |
| --- | --- | --- | --- |
| 00:48-00:56 | Cover | He liked it and called it perfect. | Preserve the current cover. |
| 00:56-01:33 | Generic Welcome versus ESPERTO preface | The current generic slide was not the configurable preface and could go away. | Remove only the generic Welcome fallback. Preserve a real pinned authored preface. |
| 01:33-02:20 | Table of Contents | Make it prettier, use the ESPERTO hierarchy/graphics/colors, then: “Basically just copy it. Copy it.” | Copy the ESPERTO TOC layout and visual hierarchy. Populate accurate page numbers. |
| 02:23-02:47 | Introduction | It pulls information from the report; investigate which data points are already known and create “something like this.” | Do not copy wholesale. Reproduce the structure using only available report data. |
| 02:51-03:03 | Your Profile | Apply domain colors, then: “Copy this one as well.” | Copy the ESPERTO Profile layout, colored grouping, and result-commentary placement. Populate from existing results. |
| 03:05-03:21 | Peers and Comparisons | The required demographic data does not exist; kill the slide. | Remove the standalone Peers dashboard. |
| 03:23-05:06 | People, Strategy, Execution, Cash, You openers | Put the missing ESPERTO text blocks into the current opener pages and use each domain color. | Transfer the relevant source text blocks; retain current charts/results. This is not a new opener design. |
| 03:32-05:48 | Detail pages | Existing content is fine; use matching dark/light domain colors. Jeff confirmed the text changes with selected values. | Preserve the dynamic `question.recommendation` pipeline exactly; change presentation only. |
| 05:48-06:10 | Conclusion | Add more text so it resembles the ESPERTO conclusion's density. | Populate a concise conclusion from existing score/result facts, followed by the pinned authored CTA. |
| 06:10 onward | Appendix | Fine as-is. | Preserve content and behavior; update only the resulting page number. |

Only **Table of Contents** and **Your Profile** are literal copy directives.

## Populate rules

### Data available now

The current `RespondentReport` and frozen Scaling Up Full model provide:

- Respondent name, email, and job title
- Company name
- Submission/report date
- Platform ScaleUp Score
- Full-time/permanent-or-temporary-contract employee count
- Optional freelance employee count
- Frozen growth phase and existing phase narrative
- All 61 frozen question scores
- Existing question, subsection, and chapter You/Peers values
- Existing peer provenance disclosure
- Existing score-banded `question.recommendation` text
- Strongest and weakest chapter
- Closest and largest-distance question comparisons
- Pinned authored preface and conclusion/CTA HTML when present

### Data unavailable now

The platform does not collect the following ESPERTO Introduction/Conclusion inputs:

- Respondent age
- Years as an entrepreneur
- Company age
- Industry/sector
- Number of business partners
- Sales goal
- Current and future growth objectives
- International revenue percentage
- Self-estimated score
- Demographic percentile or industry/age/mentor/book-reading comparison scores
- Free-text “biggest challenge”

Do not add questions, fields, migrations, or inferred replacements for these values. Omit the affected sentence or paragraph cleanly; never show a blank token or fabricated value.

### Introduction

Use the ESPERTO two-column density and progression, but populate only:

1. Personalized greeting using respondent name.
2. Accurate explanation that the report shows the five Scaling Up domains and existing peer benchmark.
3. Company headcount facts: FTE and optional freelance count.
4. Frozen growth phase and its existing narrative.
5. Platform ScaleUp Score and a factual explanation of how to read it.
6. Direction to the detailed results.

Do not reproduce ESPERTO's score-formula statement about ambition, past growth, or bonus points because the platform does not share those inputs or formula.

### Your Profile

Copy the ESPERTO page's composition:

- Domain-colored grouped score table on the left
- You/Peers/deviation values from the frozen model
- Short result commentary on the right

Populate the commentary from existing model facts only: strongest chapter, focus chapter, strongest subsection relative to peers, and largest negative deviation. Use neutral templates and deterministic tie order. Do not create a new findings engine.

### Section openers

Transfer the static explanatory text visible on ESPERTO pages 7, 11, 14, 19, and 21 into the corresponding existing chapter openers. Keep only personalized sentences whose tokens are available. In particular, omit the ESPERTO You sentence that requires years of entrepreneurial experience and partner count.

Keep the current question list/chart on the right. Apply the source layout and brand domain color; do not add new diagrams, summary cards, or navigation devices.

### Detail pages

The text below each question is already selected from frozen report results. Continue rendering `question.recommendation` unchanged. Do not add a second generator or rewrite these recommendations.

### Conclusion

Use the ESPERTO conclusion's paragraph density and sequence, populated from:

- Platform ScaleUp Score
- Strongest chapter
- Focus chapter
- Existing closest comparison
- Existing largest-distance comparison, described neutrally

Then render the pinned authored Edition 6 conclusion/CTA unchanged. Omit ESPERTO readiness, industry, percentile, and “biggest challenge” statements because the required inputs are unavailable.

## Page behavior

For a current Edition 6 report with an authored preface:

- Remove the standalone Peers dashboard.
- Preserve cover, authored preface, TOC, Introduction, Profile, five openers, existing detail groups, Conclusion, and Appendix.
- Render exactly 25 sequentially numbered pages.

For a historical report without authored preface HTML:

- Do not render the generic Welcome fallback.
- Do not insert a blank page.
- Render the remaining 24 pages with sequential page numbers.

## Visual rules

- Copy the ESPERTO TOC and Profile structures closely; do not introduce a new visual direction.
- Match the source report's restrained white-page presentation and information density.
- Use the Scaling Up brand guide rather than ESPERTO's raw color values:
  - People: `#f7a600`
  - Strategy: `#008bd2`
  - Execution: `#946b36`
  - Cash: `#95c11f`
  - You: `#522583`
- Use the existing dark/light domain variants for You/Peers, with explicit labels.
- Preserve Helvetica Neue headings and Roboto body copy.
- Preserve A4 landscape print behavior, page breaks, footer branding, and current cover.

## Explicit non-goals

- No assessment/profile questions
- No schema or migration
- No score, phase, peer-vector, or recommendation logic changes
- No new visual system, compass, cards, storyboard, or editorial redesign
- No new report-content framework
- No change to cover, authored preface content, authored CTA content, or Appendix A data
- No work outside the Scaling Up Full landscape report and its tests/capture scripts

The previously generated `Scaling-Up-Full-Visual-Mockups.pdf` is rejected as implementation guidance and must not be treated as the approved visual baseline.

## Visual approval gate

Before report code changes, show a direct side-by-side review:

1. ESPERTO TOC versus the copied TOC mock
2. ESPERTO Your Profile versus the copied Profile mock
3. ESPERTO Introduction versus the available-data population mock
4. One ESPERTO chapter opener versus the text-and-color treatment
5. One ESPERTO detail page versus the unchanged dynamic text in matching colors
6. ESPERTO Conclusion versus the available-result population and preserved CTA

No design-direction cover, invented compass, or 25-page storyboard is needed. The user must explicitly approve this comparison before feature code begins.

## Acceptance criteria

- Video-backed directive matrix is followed without broadening “copy” beyond TOC and Profile.
- Current cover and real authored preface remain unchanged.
- Generic Welcome fallback and standalone Peers dashboard are absent.
- TOC and Profile visibly copy their ESPERTO references and use correct live values.
- Introduction contains only available data and no false ESPERTO formula claims.
- All five openers contain the requested source text and domain color treatment.
- Every existing dynamic detail recommendation remains byte-for-byte identical for the same frozen report fixture.
- Conclusion uses only available result facts and preserves authored CTA HTML.
- Appendix content and grouping remain unchanged.
- Authored Edition 6 fixture renders 25 pages; historical null-preface fixture renders 24.
- Targeted tests, ESLint, migration safety, Turbopack build, and full PDF visual comparison pass.
