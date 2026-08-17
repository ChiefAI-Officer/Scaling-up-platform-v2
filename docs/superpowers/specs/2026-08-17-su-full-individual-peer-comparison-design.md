# Scaling Up Full individual peer comparison design

Date: 2026-08-17
Status: Proposed - visual direction approved; written specification awaiting review

## 1. Purpose

Add the two peer-comparison surfaces approved by Jeff in the August 13 meeting to the **Classic Scaling Up Full individual report**:

1. a section overview that preserves the original vertical view's scan job using approved A1 paired micro-bars; and
2. detailed question comparisons using the approved question -> You/Peers bars -> feedback hierarchy.

The work must use the governed template-level `AssessmentBenchmark` question rows already populated in Production. It must not calculate peers from the current campaign, infer a matched cohort, or copy Esperto's connected vertical contour.

## 2. Meeting evidence and approved visual direction

The August 13 recording settles two related but distinct surfaces:

- **00:40:** Gabriel presents the original connected vertical peer element and four alternatives that preserve its insight.
- **01:40:** Jeff says he does not love the original view and wants the idea rather than the whole presentation.
- **02:06-02:15:** Jeff selects the upper-left option; Gabriel identifies it as **A1 paired micro-bars**, and Jeff confirms.
- **02:23-02:50:** Jeff requires immediate identification of which value is the respondent and which is the peer.
- **03:09:** Jeff places the work in the individual report first.
- **03:56:** Jeff approves the detailed hierarchy: question, two bars, then the answer/feedback below.
- **04:22:** the UI discussion closes before moving to benchmark storage and logic.

The approved mock reviewed on August 17 combines both surfaces in the Classic report. "Individual" describes whose data is shown; "Classic" describes the report's presentation style. They are not competing report types.

## 3. Decisions

### D1. One report, two reading jobs

The Classic individual report includes both peer surfaces:

- **Surface A - section overview:** a compact scan of all scored questions in a section.
- **Surface B - detailed question comparison:** interpretation and action for each question.

Surface A does not replace Surface B, and Surface B does not make Surface A redundant.

### D2. Replace the connected contour, preserve the overview

The original vertical peer view is not reproduced. Its connected peer contour is replaced by two independent horizontal micro-bars on every row:

- `You` - the respondent's frozen question score;
- `Peers` - the current governed benchmark value.

Both labels and both numeric values remain visible. Color is secondary and never the only identifier.

### D3. Detailed hierarchy

Each detailed item renders in this order:

1. question label;
2. `You` bar and numeric value;
3. `Peers` bar and numeric value; and
4. the frozen score-band feedback selected when the submission was scored.

Feedback is not generated from the difference between You and Peers. A peer gap never changes the respondent's recommendation.

### D4. Classic-first presentation scope

The new UI renders only when all of the following are true:

- template alias is `scaling-up-full`;
- the existing peer-benchmark feature flag is enabled;
- Scaling Up Full is in the peer render-enabled alias list;
- the resolved report style is `CLASSIC`; and
- a complete valid peer presentation model was resolved.

`EXECUTIVE_BOARDROOM` and `MODERN_DASHBOARD` continue rendering unchanged. Their future peer treatment must consume the same presentation model but requires a separate visual approval.

### D5. DB rows are the individual-report source

Both surfaces read the same template-level `AssessmentBenchmark` rows with `metricKind = QUESTION`, keyed by the stable question key.

The individual report does not read the legacy static group-report presentation path. The existing canonical TypeScript snapshot remains the source for explicit DB refreshes and the current group report, but administrator edits to DB rows must affect the new individual peer UI.

### D6. Current-reference semantics

Benchmarks are template-level, not submission- or version-level. Opening an historical individual report compares its frozen respondent result with the **current** governed peer reference.

The report discloses this honestly:

> Peers are a current benchmark reference. Values are not yet matched to company size, growth phase, geography, or industry.

The display shows the latest benchmark-row update date, derived from the greatest `updatedAt` value returned with the row set. It must not hard-code the August 14 capture date because later administrator edits would make that date misleading.

### D7. Complete-set fail-closed policy

Scaling Up Full's peer experience is all-or-nothing:

- derive the required scored-question set from the frozen report version;
- require the expected Scaling Up Full Q01-Q61 keys and one valid benchmark value in `[0, 10]` for every key;
- require one valid frozen respondent score in `[0, 10]` for every key; and
- reject duplicate, missing, non-finite, or out-of-range data.

If validation fails, omit **both** peer surfaces and render the pre-feature Classic report. Do not show a partial benchmark, substitute the static snapshot silently, or block the underlying report.

Blank feedback is handled separately: the comparison may render, but no guidance text is invented.

### D8. No duplicate question or recommendation sections

When the Scaling Up Full peer presentation renders, it replaces the existing generic Classic scored-question breakdown and the separate slider recommendation block for those 61 questions. Otherwise the report would show the same questions and feedback twice.

The existing cover, overall score, Four Decisions, score summary, non-slider findings/additional responses, conclusion, and footer remain. When peers fail closed or are disabled, the existing generic breakdown and recommendation sections remain exactly as they are today.

### D9. Report entry points

The same presentation payload is used by server-owned Scaling Up Full individual-report entry points:

- the authorized coach/admin respondent report route;
- the authorized public-submission report route when the template is Scaling Up Full; and
- invited on-screen results returned after submission when report disclosure is enabled.

The payload survives the existing JSON and session-storage revival path so an invited respondent sees the same report immediately and after an eligible in-session refresh.

Results email HTML remains unchanged. Browser print/Download PDF is in scope automatically because it prints the Classic report DOM.

The separate public mini-quiz/result CTA work is out of scope. A client-built public quiz result does not gain peers through this change.

### D10. Unchanged systems

This work does not change:

- assessment answers, scoring, ScaleUp score, or feedback-band selection;
- the FTE-driven growth-phase tile or narrative;
- benchmark administration, audit, or refresh behavior;
- the aggregate CEO/team/peer group report;
- LVA's existing peer model and qualitative table;
- historical submission facts or version provenance;
- email delivery content; or
- the public mini-quiz/CTA feature discussed separately in the meeting.

## 4. Presentation model

Create a Scaling Up Full-specific pure presentation model rather than widening the LVA-specific `PeerComparisonSection`:

```ts
type SuFullPeerQuestionComparison = Readonly<{
  stableKey: string;
  label: string;
  you: number;
  peers: number;
  recommendation: string | null;
}>;

type SuFullPeerSectionComparison = Readonly<{
  stableKey: string;
  label: string;
  domain: string | null;
  youTotal: number;
  peersTotal: number;
  questions: readonly SuFullPeerQuestionComparison[];
}>;

type SuFullPeerPresentation = Readonly<{
  benchmarkUpdatedAt: string;
  sections: readonly SuFullPeerSectionComparison[];
}>;
```

The pure builder accepts the frozen `RespondentReport` and a benchmark row set. It:

1. rejects non-Scaling Up Full reports;
2. reads scored questions in frozen version/section order;
3. joins frozen `result.perQuestion` rows and DB benchmarks by stable key;
4. takes the displayed question label from the frozen version metadata;
5. takes feedback only from the frozen per-question result;
6. derives section totals by summing the displayed question values; and
7. returns `null` unless the complete-set policy passes.

This model is the only input to both Surface A and Surface B. React components do not join data, read flags, query the database, or recalculate feedback.

## 5. Data flow

```text
Frozen submission + frozen template version
                |
                v
       RespondentReport loader
                |
                +------------------------------+
                |                              |
                v                              v
  result.perQuestion                    templateId lookup
  - You score                                  |
  - frozen feedback                            v
                                     AssessmentBenchmark
                                     QUESTION rows + updatedAt
                |                              |
                +--------------+---------------+
                               v
                 pure SU-Full peer builder
                               |
                  complete and valid?
                     /                 \
                   no                   yes
                   |                     |
       unchanged Classic report     one shared model
                                           |
                              +------------+------------+
                              v                         v
                    Surface A overview       Surface B details
```

The feature-flag and alias checks run before the benchmark DB read. Resolution performs one benchmark query per report, never one query per section or question.

For invited on-screen disclosure, enrich only the report candidate selected after the submission transaction. Do not add benchmark reads inside the submission row lock or build peers for every report-style candidate.

## 6. Component boundaries

### Pure library

Add a focused Scaling Up Full peer-presentation module under `src/src/lib/assessments/`. It owns types, validation, ordering, joins, totals, and disclosure metadata.

Do not add Scaling Up Full branches to the LVA-specific `buildPeerComparisonSection`; its S3-only 1/2/3 -> 0/5/10 mapping is not compatible with Scaling Up Full's 0-10 scores.

### Server resolver

Extract the existing page-local peer resolution into a reusable server helper capable of returning the appropriate template-specific peer payload. Preserve LVA behavior while adding Scaling Up Full.

The resolver owns:

- flag and alias gating;
- template ID lookup;
- a single benchmark query including `updatedAt`;
- pure-builder invocation; and
- fail-soft telemetry.

### Report payload

Attach the optional Scaling Up Full peer presentation to the server-produced report payload as explicitly **render-time current reference data**, not submission provenance. This keeps invited on-screen serialization and session revival consistent without making the pure respondent-report constructor perform database I/O.

### Classic renderer

Add focused presentational components for:

- section overview paired micro-bars; and
- detailed paired bars with attached feedback.

`LegacyClassicReport` selects the dedicated Scaling Up Full peer sequence only when the optional model exists. All other templates and the no-model path retain existing markup.

### Styling and print

Add styles under the existing `.su-public-brand .su-report` scope. Requirements:

- independent orange `You` and purple `Peers` bars;
- explicit text labels and numeric values;
- a shared 0-10 track;
- no SVG/path that connects values between rows;
- mobile stacking without horizontal scrolling;
- `break-inside: avoid` on one detailed question block;
- deliberate section overview page boundaries in print; and
- no clipped feedback at page breaks.

## 7. Report composition

The Classic Scaling Up Full report order becomes:

1. cover;
2. overall result;
3. Four Decisions;
4. for each scored section in frozen version order:
   1. section overview with A1 paired micro-bars;
   2. detailed question comparisons with feedback;
5. existing score summary, when configured;
6. existing non-slider findings and additional responses;
7. conclusion and next steps; and
8. footer.

The overview uses a compact row for every question. The detail view may use the Classic two-column print grid, collapsing to one column on narrow screens.

No new editorial interpretation is authored. Section descriptions come only from version-owned content when available; otherwise the renderer uses the section label and concise fixed instructional copy.

## 8. Failure handling and observability

Peer comparison is enhancement data. It must never make the report unavailable.

Return `null` and preserve the current report for:

- feature flag off;
- non-enabled alias;
- non-Classic presentation;
- campaign/template lookup failure;
- benchmark query failure;
- empty or partial benchmark rows;
- key mismatch;
- invalid values;
- degraded or incomplete respondent scoring; or
- pure-builder failure.

Emit one structured warning per failed resolution, without respondent answers or other PII. Include a bounded reason such as `MISSING_ROWS`, `KEY_MISMATCH`, `INVALID_VALUE`, `DEGRADED_REPORT`, or `DB_ERROR`, plus template alias, template ID when known, submission/version IDs, and counts.

Do not fall back to the static benchmark because doing so would hide administrator edits and benchmark-store problems.

## 9. Accessibility

- `You` and `Peers` remain visible in text for every comparison.
- Numeric values remain visible in text and are announced in DOM order.
- Color does not carry identity or above/below meaning by itself.
- Overview rows use real headings/list semantics; detailed question titles label their comparison groups.
- Decorative tracks are hidden from assistive technology when the adjacent text already conveys the values, avoiding duplicate announcements.
- Print preserves labels, values, and disclosure without relying on background colors.

## 10. Testing and verification

### Pure builder tests

- builds all 61 questions in frozen section/question order;
- joins by stable key rather than array position;
- preserves frozen question labels and recommendations;
- computes section totals from displayed values;
- derives the greatest benchmark `updatedAt`;
- returns `null` for missing keys, duplicate rows, an unexpected required-key set, non-finite values, or out-of-range values;
- returns `null` for missing/invalid respondent scores;
- allows blank recommendation text without inventing feedback; and
- rejects non-Scaling Up Full aliases.

### Resolver tests

- flag and alias gates prevent DB reads;
- one benchmark query supplies all 61 rows;
- Scaling Up Full and LVA use their separate pure builders;
- DB or validation failures return `null` and log the bounded reason; and
- no static-snapshot fallback occurs.

### Renderer tests

- Surface A renders every question with explicit `You` and `Peers` labels and numbers;
- Surface B renders bars before the matching frozen feedback;
- the two surfaces consume identical values;
- no connected vertical contour is present;
- generic scored breakdown/recommendations are not duplicated when the peer model exists;
- existing Classic markup remains when the model is absent;
- Executive Boardroom, Modern Dashboard, non-SU-Full, LVA, and group reports remain unchanged; and
- disclosure and benchmark update date render once per peer sequence.

### Entry-point tests

- authorized respondent-report page enriches and forwards the model;
- authorized public-submission report page does the same for Scaling Up Full;
- invited on-screen submission response enriches only the selected report after the transaction;
- JSON/session revival retains the optional peer model; and
- public mini-quiz client and report email output remain unchanged.

### Visual and production verification

- component tests and focused route tests;
- ESLint on changed files;
- focused Jest suites;
- `CI=true npx next build --turbopack`;
- browser review at desktop and mobile widths;
- print-to-PDF review across all scored sections for page breaks, clipping, labels, and disclosure; and
- post-deploy smoke of one authorized Scaling Up Full individual report plus confirmation that group report and growth-phase survey flow are unchanged.

## 11. Rollout

1. Ship code with Scaling Up Full absent from the render-enabled alias list or with the existing peer flag off.
2. Verify Production still has the complete governed 61-row set.
3. Enable the Scaling Up Full render alias/flag.
4. Smoke the authorized Classic individual report and its printed PDF.
5. Verify an invited on-screen report when disclosure is enabled.
6. Confirm non-Classic styles, LVA, group report, results email, and growth-phase survey behavior are unchanged.

Rollback is the existing flag/alias gate. Disabling it returns the report to the pre-feature Classic path without deleting benchmark rows.

## 12. Explicit non-goals

- matched cohorts by size, phase, geography, industry, or current campaign;
- percentiles, ranks, or peer-gap-generated advice;
- recreating Esperto's connected vertical contour;
- redesigning Executive Boardroom or Modern Dashboard;
- changing group-report peers;
- changing the growth-phase experience;
- changing benchmark CRUD/governance;
- changing feedback bands or rescoring old submissions;
- adding peers to report email HTML; and
- public mini-quiz/CTA work.
