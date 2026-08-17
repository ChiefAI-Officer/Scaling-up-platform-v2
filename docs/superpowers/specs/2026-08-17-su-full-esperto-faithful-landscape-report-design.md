# Scaling Up Full Esperto-faithful landscape report design

Date: 2026-08-17  
Status: Draft for written-spec approval

## 1. Purpose

Reshape the **Classic Scaling Up Full individual report** into the approved
Esperto-faithful landscape report while preserving the peer-data plumbing that
is already live.

The target is the same 26-page reading experience established by the supplied
Esperto standard individual reports:

1. orient the respondent;
2. summarize the respondent and peer relationship;
3. introduce each of the five chapters with a compact vertical comparison;
4. explain every question with `You` / `Peers` paired bars and frozen feedback;
5. conclude; and
6. repeat all five vertical comparisons in Appendix A.

“As close as possible” means close in page roles, information hierarchy,
landscape density, chart placement, sequencing, and print polish. It does not
mean copying Esperto logos, vendor attribution, signatures, or unsupported
claims about matched peer cohorts.

## 2. Current state and supersession

PRs #360 and #361 already shipped the following correct foundations:

- complete-set resolution of all 61 governed `AssessmentBenchmark` rows;
- the frozen respondent score and frozen score-band feedback per question;
- one shared `SuFullPeerPresentation` payload for report entry points;
- Classic-only feature gating and fail-soft fallback;
- explicit detailed `You` / `Peers` comparisons; and
- current-reference benchmark disclosure.

The current Production presentation produces a 28-page browser PDF for the
test report supplied on August 17. It gives each of the ten template sections a
standalone paired-micro-bar overview, then uses rounded two-column feedback
cards. It does not contain the Esperto opening sequence, five chapter-level
vertical comparisons, conclusion page, or combined Appendix A.

This design **supersedes only the overview and report-composition decisions** in
`2026-08-17-su-full-individual-peer-comparison-design.md`:

- the chapter overview now uses the connected solid peer contour confirmed
  across all supplied Esperto report variants;
- ten section overviews become five domain/chapter openers; and
- the Classic Scaling Up Full peer report becomes a dedicated 26-page
  landscape composition.

The earlier data source, complete-set policy, frozen-feedback behavior,
historical-report semantics, route coverage, and fail-soft behavior remain in
force. Detailed paired bars remain because they are both Esperto-faithful and
the August 13 meeting's approved question-level hierarchy.

## 3. Evidence and canonical placement

Thirteen supplied Esperto PDFs were checked page by page:

- eight standard individual reports;
- one CEO Full report;
- one group report;
- two self-comparison reports; and
- one condensed report.

Every full-length report uses the same grammar:

- a vertical respondent-bar / peer-line comparison at each chapter opener;
- horizontal comparisons followed by narrative on the detail pages; and
- all chapter verticals repeated together in Appendix A.

The standard individual report uses one solid peer line. CEO Full and group
reports add a dotted team line at the chapter opener. Self-comparison adds a
dotted previous-assessment line. Those additional series belong to other
report modes and are not part of this standard individual design. The
two-page condensed report has no chapters, so its verticals appear only in its
appendix.

The five chapter openers in the standard individual report are physical PDF
pages 7, 11, 14, 19, and 21. The combined Appendix A is page 26.

## 4. Scope

### In scope

- `scaling-up-full` only;
- the `CLASSIC` individual report when a complete peer presentation exists;
- the authorized coach/admin report route;
- the authorized public-submission report route for Scaling Up Full;
- invited on-screen results when report disclosure is enabled;
- browser screen rendering;
- browser Print / Download PDF rendering;
- A4 landscape page composition and deterministic print breaks;
- the respondent's frozen scores and feedback;
- the current governed peer reference;
- the existing FTE-derived growth phase when its frozen driver answer exists;
  and
- coach identity and platform branding already authorized for the report.

### Out of scope

- benchmark recalculation or cohort matching;
- changes to the 61 Production benchmark rows;
- scoring, ScaleUp score, or feedback-band changes;
- CEO Full, group, self-comparison, or condensed report modes;
- adding team or previous-assessment contours;
- Executive Boardroom or Modern Dashboard styles;
- the public mini-quiz and configurable CTA work;
- email HTML;
- vendor attribution, Esperto logos, or `powered by Esperto` branding; and
- new editorial claims not supported by frozen answers or governed data.

## 5. Non-negotiable truthfulness rules

The current 61 peer values are static governed reference values. They are not
matched at render time to company size, growth phase, geography, industry,
growth rate, company age, mentor status, or book-reading habits.

Therefore the new report must not repeat Esperto statements such as “similar
size,” “same organizational phase,” “same industry,” or “comparable
companies.” It must retain this disclosure:

> Peers are a current benchmark reference. Values are not yet matched to
> company size, growth phase, geography, or industry.

The latest benchmark-row update date remains visible. Page 6 preserves the
visual role of Esperto's comparison dashboard but uses only supported content:
benchmark scope, chapter averages, largest gaps, closest comparisons, and the
disclosure above.

The growth-phase tile is a separate concept from the vertical peer chart. It
is derived from the frozen FTE driver through the existing
`computeGrowthPhase` helper. It belongs in the respondent/profile context on
page 4. It does not alter peer values. If the required driver is absent or
invalid, the phase block is omitted rather than inferred.

## 6. Fixed 26-page composition

| Physical page | Page role | Required content |
| --- | --- | --- |
| 1 | Cover | Scaling Up branding, assessment name, respondent, company when present, submitted date, coach identity |
| 2 | Preface | Product-owned welcome and report-purpose copy; no unauthorized signature or endorsement |
| 3 | Table of contents | All five chapters, subsections, fixed page numbers, five-color chapter key |
| 4 | Introduction | ScaleUp score, honest peer explanation, growth phase when available, how to read the report |
| 5 | Your profile | Chapter and subsection `You`, `Peers`, and deviation table; strongest and weakest chapter summary |
| 6 | Peers and comparisons | Supported peer dashboard: benchmark scope/date, five chapter averages, closest and largest question gaps, disclosure |
| 7 | People opener | People narrative plus one vertical chart containing Q01-Q13 |
| 8-10 | People detail | Your Employees Q01-Q08 and Company Culture Q09-Q13 with paired bars and frozen feedback |
| 11 | Strategy opener | Strategy narrative plus one vertical chart containing Q14-Q20 |
| 12-13 | Strategy detail | Q14-Q20 paired bars and frozen feedback |
| 14 | Execution opener | Execution narrative plus one vertical chart containing Q21-Q40 |
| 15-18 | Execution detail | Leadership Team Q21-Q24; Operational Processes Q25-Q29; Sales and Marketing Q30-Q34; Scalability, Innovation and Technology Q35-Q40 |
| 19 | Cash opener | Cash narrative plus one vertical chart containing Q41-Q45 |
| 20 | Cash detail | Q41-Q45 paired bars and frozen feedback |
| 21 | You opener | You narrative plus one vertical chart containing Q46-Q61 |
| 22-24 | You detail | Your Leadership Q46-Q55 and Internal Communication Q56-Q61 |
| 25 | Conclusion | Score, strongest/weakest supported findings, next-step copy, configured coach/contact action when available |
| 26 | Appendix A | Five compact vertical charts containing Q01-Q61 in canonical order |

The page map is deterministic for the canonical 61-question Scaling Up Full
shape. If that shape changes, the peer builder already fails closed; the
dedicated landscape renderer must not attempt to squeeze an unknown shape into
this map.

Detail-page allocation is also fixed so pagination does not change with score
or peer values:

| Physical page | Stable keys |
| --- | --- |
| 8 | Q01-Q06 |
| 9 | Q07-Q08 |
| 10 | Q09-Q13 |
| 12 | Q14-Q19 |
| 13 | Q20 |
| 15 | Q21-Q24 |
| 16 | Q25-Q29 |
| 17 | Q30-Q34 |
| 18 | Q35-Q40 |
| 20 | Q41-Q45 |
| 22 | Q46-Q51 |
| 23 | Q52-Q55 |
| 24 | Q56-Q61 |

These groups match the supplied standard Esperto individual report. Long
canonical feedback is handled through type and spacing calibration inside its
assigned page, not by moving a question to another page at runtime.

## 7. Visual system

### Page shell

- A4 landscape: `297mm × 210mm`.
- `@page { size: A4 landscape; margin: 0; }`.
- One explicit page container per physical page with an internal print-safe
  inset, `break-after: page`, and no browser-generated header/footer space.
- A thin five-color chapter stripe across the top.
- A restrained footer with Scaling Up/platform branding, coach mark when
  supplied, and the physical page number.
- White background, generous left/right whitespace, and dense but readable
  two-column content.
- Screen view uses fluid page cards with the same hierarchy. Narrow screens
  stack columns without changing print pagination.

### Chapter colors

- People: orange.
- Strategy: blue.
- Execution: brown.
- Cash: green.
- You: purple.

Color identifies the chapter, not the comparison series. Text and numeric
labels remain the primary accessible identifiers.

### Chapter opener vertical chart

Each opener has narrative on the left and the section comparison on the right.
For every question row:

- the full question label appears first;
- the respondent's score is a square-ended horizontal bar in the chapter
  color;
- the respondent value appears at the bar end;
- the governed peer value becomes the x-coordinate of one solid connected
  contour aligned to the row center; and
- a `Score of Peers` legend appears beneath the chart.

The contour is a presentational SVG polyline generated from existing peer
values. It performs no interpolation or scoring. The SVG is decorative to
assistive technology because each row also exposes both numeric values in
semantic text; the peer number may be visually hidden on the compact opener
but remains available to screen readers.

The chapter opener combines subsections by domain:

- People = Your Employees + Company Culture;
- Strategy = Strategy;
- Execution = four Execution subsections;
- Cash = Cash; and
- You = Your Leadership + Internal Communication.

### Detail pages

Detail pages remain two-column in landscape. Each question block uses this
order:

1. question label;
2. `You` bar and value;
3. `Peers` bar and value; and
4. frozen score-band feedback.

To approach Esperto's density, the current rounded card treatment is removed.
Question blocks become borderless editorial units with square-ended tracks,
compact 0-10 geometry, chapter-colored `You`, a lighter tint of the same
chapter color for `Peers`, and feedback immediately underneath. Purple is not
used as a universal peer color in this landscape renderer.

Long feedback must never overlap or clip. The fixed stable-key page groups may
flow between the two columns assigned to that physical page, but may not spill
onto another physical page. Typography and spacing must be tuned against the
longest canonical feedback records, not only a short fixture.

### Appendix A

Page 26 contains five compact charts, matching the chapter colors and the same
respondent-bar / solid-peer-contour grammar. All 61 question labels remain
legible at normal PDF zoom. No feedback is repeated in the appendix.

## 8. Content ownership and originality

The report may match Esperto's functional hierarchy and density but must use
Scaling Up Platform components, brand assets, and product-owned prose.

- Do not copy `powered by Esperto`, TCPDF marks, Esperto logos, or vendor
  signatures.
- Do not imply that Verne Harnish or another individual authored or endorsed
  new platform copy unless approved source content exists in the repository.
- Section and chapter narratives must come from approved template/report
  content. If no approved narrative exists, use concise original explanatory
  copy rather than copying paragraphs from the reference PDF.
- Question labels and frozen feedback remain canonical assessment content and
  are rendered from the frozen report payload.

## 9. Architecture and component boundaries

### Reuse the live data path

Keep `peer-report-resolver.ts`, the benchmark query, feature gating, and the
current `SuFullPeerPresentation` payload. No new database read or benchmark
source is required.

### Add a pure landscape composition model

Add a Scaling Up Full-specific pure module that consumes the frozen
`RespondentReport` plus `SuFullPeerPresentation` and returns either a complete
26-page composition model or `null`.

It owns:

- grouping ten canonical sections into five chapters;
- Q01-Q61 stable-key page allocation;
- chapter and subsection averages;
- question-level peer gaps;
- strongest, weakest, closest, and largest-gap summaries;
- growth-phase derivation from the frozen raw FTE answer;
- page titles and page-role metadata; and
- validation that every question appears exactly once in chapter/detail and
  appendix order.

React components must not join benchmark rows, calculate feedback, infer
growth phase, or decide page allocation.

### Add a dedicated renderer

Create a dedicated `SuFullLandscapeReport` rather than continuing to grow the
generic `LegacyClassicReport` or the existing `SuFullPeerComparison` fragment.
The Classic dispatcher selects it only when:

- the template alias is `scaling-up-full`;
- the resolved style is `CLASSIC`;
- a valid `SuFullPeerPresentation` exists; and
- the landscape composition builder succeeds.

Otherwise the pre-feature Classic report remains the fail-soft fallback.

The new renderer is split into focused page components:

- page shell;
- cover/preface/contents;
- introduction/profile/peer dashboard;
- chapter opener and vertical chart;
- detail page and paired bars;
- conclusion; and
- Appendix A.

### Styling

Add styles under a dedicated `.su-full-landscape` scope within
`su-report.css`, or a report stylesheet imported through the same report entry
points. Do not weaken the existing `.su-public-brand .su-report` isolation.

### Print action

Reuse the current Print / Download action if CSS page sizing eliminates the
browser header/footer and produces the exact 26-page artifact. If the browser
API cannot meet that acceptance criterion reliably, the implementation plan
must stop and propose a dedicated PDF-generation path instead of accepting an
uncontrolled print result.

## 10. Data flow

```text
Frozen respondent report                 Current governed DB rows
- scores                                 - Q01-Q61 peer values
- feedback                               - latest updatedAt
- labels/sections                                   |
- raw FTE answer                                    |
          |                                         |
          +----------------+------------------------+
                           |
                           v
              existing SuFullPeerPresentation
                           |
                           v
              pure 26-page composition builder
                /                         \
          invalid                          ready
             |                              |
             v                              v
    unchanged Classic fallback     SuFullLandscapeReport
                                      |           |
                                      v           v
                                    screen    A4 landscape PDF
```

## 11. Failure handling

Preserve the current complete-set fail-closed policy. Missing, duplicate,
invalid, or mismatched peer values omit the entire landscape peer experience
and render the unchanged generic Classic report.

The composition builder additionally fails closed for:

- an unknown section/domain map;
- any Q01-Q61 question missing from its canonical page group;
- any duplicate question across page groups;
- a chapter with no questions;
- a non-finite derived aggregate; or
- a page-group definition that no longer covers exactly the canonical set.

Growth phase is optional and does not fail the report. Missing narrative or
coach/contact content is also optional and uses an approved omission/fallback,
never fabricated copy.

Emit one bounded structured warning for composition failure without respondent
answers or other PII.

## 12. Accessibility

- Every chart row exposes the question, `You` value, and `Peers` value in
  semantic DOM order.
- The connected contour is never the sole carrier of peer information.
- Chapter color is never the sole carrier of meaning.
- Page headings follow one logical hierarchy even though print pages are
  visually independent.
- Detail columns preserve reading order.
- Screen layouts reflow without horizontal scrolling at the report's supported
  responsive breakpoint.
- Print remains understandable in grayscale through labels and values.

## 13. Testing and visual verification

### Pure model tests

- builds exactly 26 page descriptors for a canonical complete report;
- groups ten sections into the correct five chapters;
- assigns Q01-Q61 exactly once to chapter/detail and appendix structures;
- preserves frozen question order, scores, labels, and feedback;
- derives subsection/chapter averages and peer gaps correctly;
- derives the existing growth phase only from the frozen FTE driver;
- omits growth phase for a missing/invalid driver without failing the report;
- rejects unknown, missing, or duplicate stable keys and section maps; and
- preserves the greatest benchmark update date.

### Renderer tests

- renders 26 explicit page containers with physical page numbers 1-26;
- renders chapter openers on 7, 11, 14, 19, and 21;
- renders one solid peer contour and no dotted team/previous contour;
- renders detailed paired bars before frozen feedback for all 61 questions;
- renders all five compact charts on Appendix A;
- does not render the generic Classic section/recommendation sequence in the
  landscape path;
- retains the truthful benchmark disclosure and update date;
- has no Esperto/TCPDF/vendor attribution; and
- falls back to generic Classic when presentation/composition validation
  fails.

### Print contract tests

- print CSS specifies A4 landscape with zero browser page margin;
- each page container breaks exactly once and internal question blocks avoid
  breaks;
- colors and backgrounds use exact print color adjustment;
- no browser URL/date/title header or footer appears in the generated PDF;
- Chromium PDF output contains exactly 26 physical pages; and
- PDF text extraction finds Q01-Q61 labels in canonical order with no missing
  feedback text.

### Required visual review

Render the generated PDF with Poppler and inspect at minimum:

- pages 1-6 as a contact sheet;
- page 7 against the standard Esperto People opener;
- page 8 against the first Esperto detail page;
- the densest Execution detail page;
- page 21 You opener; and
- page 26 Appendix A.

Acceptance requires:

- the approved 26-page map;
- no clipped, overlapping, orphaned, or unreadable content;
- section openers that visibly contain the vertical peer contour;
- detail pages that visibly contain paired bars and feedback;
- Appendix A containing all five vertical summaries;
- a clean A4 landscape export without browser chrome; and
- close visual hierarchy and density to Esperto while retaining Scaling Up
  Platform branding and truthful benchmark language.

## 14. Release boundaries

Implementation must remain behind the existing Scaling Up Full peer-report
gates until visual acceptance is complete. The implementation release and the
Production activation/smoke-test release remain separate. No benchmark rows,
answers, scoring, feedback, Esperto data, Slack messages, or emails are changed
by this report-layout work.
