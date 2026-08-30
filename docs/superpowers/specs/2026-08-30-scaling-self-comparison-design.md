# Scaling Up Self Comparison Report Design

**Status:** APPROVED FOR IMPLEMENTATION by the 2026-08-30 Handoff B3 instruction and the evidence-backed decisions on GH #389, #391, and #392

**Date:** 2026-08-30

**Scope:** GH #387 item 3, Handoff B3 only: the third Coach portal report entry for Scaling Up Full.

## 1. Outcome

Add **Comparison report** as the third item in the Coach-only Scaling Up Full report dropdown. It opens the only picker in that dropdown, selects exactly one **Focus Report** and one **Earlier Report**, summarizes the pair, and opens a printable HTML **Self Comparison report** only after both sources are present.

This report is one person, then versus now. It is not a Team, cohort, campaign-average, or group-over-time report. The Focus Report owns the person's name and all current content; the Earlier Report supplies only the previous numeric series.

No environment variable, feature-flag value, Production record, campaign, submission, generated report, or email is changed by this work.

## 2. Evidence and non-negotiable decisions

Evidence precedence follows `2026-08-27-summary-group-reporting-design.md`.

- Live ESPERTO identifies this type as `selfcompare`, with `Focus Report (min:1 max:1)` and `Earlier Reports (min:1)`, and no Team slot.
- The supplied 31-page artifact names one person and uses `Prev`, `Score of Previous`, and `Dev from previous` throughout.
- GH #389 resolves the meaning to one person over time and requires the platform to reject ESPERTO's cross-member defect.
- GH #391 keeps the picker only for Comparison; Group and Condensed are one-click paths.
- GH #392 makes the approved server-rendered HTML report and browser print/PDF controls canonical. The divergent `@react-pdf` Summary Reporting renderer is not extended.
- ADR-0032 continues to rule group-over-time comparison out of scope.

## 3. Wave RC gap audit

Audited at fixed point `cdafe24603c7c92648befc4a5f13d7ccbf01fc6d` before feature code.

### Reuse

Wave RC already supplies:

- one Focus submission plus one Earlier submission;
- same Organization, Template, and person identity (including same-Organization normalized-email identity aliases);
- strict Earlier-before-Focus ordering;
- authorization to both source campaigns;
- frozen-result reads and exact-key/type/scale question comparison;
- current, previous, and delta values for overall, domain, section, and question measures;
- enumeration-safe invalid outcomes and low-cardinality metrics.

### Missing or unsuitable

- Wave RC is reached from one respondent report and has no campaign-level Focus/Earlier picker.
- Its three `WAVE_RC_REPORT_COMPARISON_*` flags are separate and dark; the new surface must remain governed only by the existing Summary Reporting capability already resolved for B1.
- `ReportComparisonModel` has numeric facts but no Focus report wording, recommendation, open-response, peer presentation, or approved landscape page model.
- `ReportComparisonContent` appends four generic tables rather than integrating Previous through the report.
- The approved `SuFullLandscapeReport` currently takes the early landscape branch without forwarding Wave RC comparison data.
- The existing Summary Report wizard is hard-coded to CEO/Team composition and the deprecated `@react-pdf` persistence path; it must not be stretched into this HTML route.

The boundary is therefore: reuse Wave RC's identity, authorization, ordering, and frozen comparison model behind a Summary Reporting adapter; build a narrow Coach picker and a first-class Self Comparison projection over the approved HTML landscape renderer.

## 4. Domain and compatibility contract

### Focus Report

- exactly one completed invited personal Scaling Up Full Results report;
- belongs to the selected destination Campaign;
- belongs to that Campaign's one designated CEO Participant;
- remains authorized and complete when the report route loads.

### Earlier Report

- exactly one different completed invited personal Scaling Up Full Results report;
- same Organization and Template as Focus;
- same canonical person as Focus under Wave RC identity resolution;
- strictly earlier `submittedAt` than Focus;
- remains authorized and complete when the report route loads.

### Cross-version compatibility

Same-version pairs are compatible when the full canonical report shape is present. Cross-version pairs are compatible only when both frozen versions preserve all of the following:

- exactly stable keys `Q01` through `Q61` in the comparison result;
- `SLIDER_LIKERT` type for every comparable question;
- identical `0` minimum and `10` maximum for every comparable question;
- the ten canonical section identities used by the approved Scaling Up Full landscape report;
- a complete approved Focus landscape projection and peer snapshot.

An incomplete or incompatible pair fails closed. The report never prints partial Previous data or a mixture of comparable and non-comparable rows.

## 5. Coach picker

The B1 `View reports` dropdown remains Coach-only and retains the Group report as its first plain anchor. Comparison is the third catalog entry when `SCALING_SELF_COMPARISON` is implemented under the same resolved Summary Reporting capability. No admin mount is added.

Selecting Comparison opens a focused dialog rather than the old multi-step generic wizard:

```text
Compare two personal reports

Focus report (current)             Earlier report
[ John Adams · 2026 Campaign ]  →  [ John Adams · 2025 Campaign ▾ ]

John Adams
2026 Campaign (May 1, 2026) compared with 2025 Campaign (May 1, 2025)

                              [Cancel] [Generate comparison]
```

- Focus choices are completed CEO personal reports in the current Campaign. The normal case preselects the single eligible CEO result.
- Earlier choices load only after Focus is known and come from authorized historical candidates resolved by Wave RC for the same person.
- Candidate labels show Campaign, completion date, version, and imported provenance without exposing email or hidden identifiers in visible copy.
- A visible summary repeats the person's name and both periods before generation.
- Generate is disabled until both sources are selected.
- Empty/loading/failure states explain the next action in plain language.
- The server independently revalidates every rule. Client filtering is presentation only.

The visual direction is deliberately inherited rather than novel: existing Dialog, form, semantic color, spacing, focus-ring, and responsive tokens. The one characteristic gesture is the quiet Focus `→` Earlier relationship; no new palette, typography, animation, or decorative report system is introduced.

## 6. HTML route and authorization

The generated view is a new server-rendered route under the selected Campaign's existing report namespace. It is dynamic, no-store, and accepts opaque Focus/Earlier submission IDs.

The route:

1. resolves an authenticated operator;
2. rechecks the destination Campaign's existing Summary Reporting enabled/not-killed state and Scaling Up Full capability;
3. rechecks Coach campaign/report access;
4. verifies Focus is the destination Campaign's completed CEO personal report;
5. invokes the Summary adapter over Wave RC to recheck both source campaigns, identity, chronology, and frozen comparison values;
6. loads the authorized Focus Results report and its frozen peer presentation;
7. builds the complete Self Comparison projection or returns an enumeration-safe 404;
8. writes a strict view audit without answer text;
9. renders the existing `Print` and `Download PDF` controls plus the approved HTML report.

Missing, duplicate, stale, cross-member, later-Earlier, unauthorized, or incompatible input produces no report and leaks no source metadata.

## 7. Report projection and pages

The Self Comparison projection composes the existing approved Focus landscape model with the complete Wave RC comparison model. Focus values must equal the approved model's `You` values for every `Q01`–`Q61`; otherwise projection fails closed.

- Cover: one person; `Self Comparison`; Focus and Earlier periods.
- Preface, introduction, recommendations, open responses, and conclusion: Focus content only.
- Profile: Focus / Earlier / Peers plus deviation from Earlier and deviation from Peers.
- Chapter overviews: Focus bars with Earlier and Peers contours; legend says `Score of Previous` and `Score of Peers`.
- All 61 detail rows: Focus, Earlier, and Peers; Focus recommendation text.
- Appendix A: Focus plus Peers only, matching the source contract.
- Appendix B: named Focus/Earlier four-decision table for People, Strategy, Execution, and Cash; no You column.
- Appendix C: Focus, Earlier, and their arithmetic average for `Q01–Q45` and `Q56–Q61`, grouped over four pages; `Q46–Q55` are deliberately omitted from Appendix C while remaining present in the main body.

No comparison-series label, source-role label, table header, legend, accessible name, or test identifier uses `Team` or `Team avg` in Self Comparison output. Legitimate instrument content such as the `Leadership Team` section and Focus recommendation prose remains unchanged.

The ordinary approved Scaling Up Full report remains byte-for-byte on its existing branch when no Self Comparison model is supplied.

## 8. Test seams

These are the agreed public seams for TDD:

1. **Wave RC Summary adapter:** list/load outcomes for same person, cross-member, chronology, stale authorization, and full cross-version compatibility.
2. **Self Comparison projection builder:** one independent golden fixture asserting 61 current/previous/peer rows, profile arithmetic, Appendix B/C values, Focus-only prose, and fail-closed incomplete shapes.
3. **HTML component:** semantic headings/columns/legends, appendices, one name, print page markers, and absence of Team text.
4. **Picker component:** two-source state, loading/empty/error behavior, visible summary, disabled generation, and exact generated URL.
5. **Server route:** Summary capability, Coach-only access, CEO Focus binding, invalid pair 404, strict audit, and successful HTML render.
6. **B1 campaign dropdown/capability:** Comparison is third under the capability; Group and flag-off markup remain unchanged.

Tests observe exported functions, rendered user-visible behavior, and route responses. They do not mock private helpers or inspect implementation-only state.

## 9. Rollout and non-goals

- Use the existing Summary Reporting umbrella/canary/kill resolution only; add no environment key and change no value.
- Mark only `SCALING_SELF_COMPARISON` implemented in the typed registry. Deferred families remain false.
- No Admin surface, CEO-self bearer route, Team/cohort comparison, multi-Earlier aggregation, rename/save/history UI, new schema/migration, generated PDF Blob, email, sharing, or Production write.
- The existing dark Wave RC surface and its flags remain intact.
- Ship copy should state once that this is the CEO's own trajectory, not the company's aggregate.

## 10. Acceptance

1. Comparison is the third Coach dropdown entry on eligible Scaling Up Full Campaigns.
2. It opens a two-source picker and generates nothing until Focus and Earlier are selected.
3. Cross-member, duplicate, stale, incomplete, unauthorized, and Earlier-after-Focus pairs fail closed; cross-member UI receives a clear generic correction message where applicable.
4. Output names one person, integrates Focus/Earlier/Peers across all 61 questions, includes Appendices A/B/C, and contains no Team column.
5. Print and browser PDF download work through the existing HTML report chrome.
6. Summary Reporting flag off preserves today's output exactly.
