# Report HTML Continuation Pages Design

**Date:** 2026-09-03  
**Status:** Approved through visual review  
**Scope:** Individual report Preface and Closing HTML, in every supported report style, for current and historically pinned report content

## Problem

The report HTML sanitizer currently rejects a legitimate Rockefeller Habits Closing CTA with:

> Closing message must use 24 estimated lines or fewer after headings, blocks, lists, breaks, table rows, figures, and images are counted.

The estimator adds visible-text, heading, table-cell, and layout weights. The Rockefeller two-column CTA therefore consumes about 37 estimated lines even though its visual layout is reasonable. Preface has the same class of failure at a 32-line limit.

Simply raising both limits to 200 is unsafe. The Scaling Up Full renderer places Preface and Closing in fixed A4-landscape page boxes; accepted combinations at the new ceiling extend across several physical page heights and overlap later pages in PDF output.

## Requirements

1. Both `introductionHtml` (Preface/Welcome) and `conclusionHtml` (Closing) accept up to 200 estimated lines.
2. The Rockefeller book-offer table shown in the incident saves, loads, and renders.
3. Authored content never overlaps or disappears behind a later report section in browser or PDF output.
4. The behavior applies to all five individual report renderers:
   - Classic scored
   - Classic qualitative
   - Executive Boardroom
   - Modern Dashboard
   - Scaling Up Full landscape
5. The rendering correction applies to both newly issued reports and existing reports whose pinned template version already contains authored report HTML.
6. Historical provenance remains immutable: rendering may improve, but a completed report continues to use the report HTML stored on its pinned Template Version. Current wording is not copied into older versions.
7. Existing sanitizer security and structural caps remain unchanged: raw characters, visible characters, elements, depth, images, tables, table rows/cells/columns/captions, figure captions, headings, line breaks, protocol restrictions, and CSS restrictions.
8. Ordinary reports that fit today retain their current layout and page contract except that Scaling Up Full gains a separate authored Closing page when custom Closing HTML exists.

## Chosen Direction

Use dedicated, naturally fragmenting authored-content pages.

Classic scored and qualitative reports already flow authored sections in normal document order. Executive Boardroom and Modern Dashboard already put authored sections in dedicated `report-page` wrappers whose print rules permit page fragmentation. Those renderers need regression coverage, not a new pagination engine.

Scaling Up Full is the exception. Its fixed 210 mm landscape pages deliberately prevent fragmentation. The renderer will therefore:

1. Render Preface in a dedicated authored-flow page before Contents.
2. Keep the generated `In Conclusion` summary on its existing fixed page.
3. Render custom Closing HTML on a new authored-flow page after the generated summary and before the Appendix.
4. Allow authored-flow pages to grow on screen and fragment across physical print sheets.
5. Keep images, tables, blockquotes, and preformatted blocks indivisible where the shared print safety rules already require that.

The authored-flow wrapper remains one logical report page for the report model. If exceptionally long HTML needs more than one physical PDF sheet, the browser creates continuation sheets rather than allowing overflow into the next logical report page. Logical page labels and the table of contents remain internally consistent; continuation sheets do not invent stored page metadata.

## Report Model and Ordering

`SuFullLandscapePageContent` gains a distinct `closing` descriptor. `pages(...)` receives both `hasAuthoredPreface` and `hasAuthoredClosing` and orders pages as:

```text
cover
[authored preface]
contents
introduction
profile
chapter/detail pages
generated conclusion
[authored closing]
appendix
```

The generated conclusion page keeps default next steps only when there is no authored Closing. With authored Closing, the generated narrative remains visible and the CTA moves to the following authored page.

The Appendix and self-comparison appendix numbering derive from the expanded logical page list, so rendered `data-page-number` values remain sequential.

## Rendering Contract

`SuFullLandscapePage` gains an `authored` variant. All fixed report pages keep their existing `height: 210mm`, `break-inside: avoid`, and exact visual composition.

Only `.su-full-landscape-page--authored` overrides that print contract:

- `height: auto`
- `min-height: 210mm`
- `break-inside: auto`
- `page-break-inside: auto`
- explicit page breaks before and after the logical authored section

On screen, the same page grows vertically instead of clipping content. Mobile keeps the existing single-column responsive behavior.

## Historical Reports

No database migration or rewrite is required. The shared defensive loader re-sanitizes stored HTML under the new 200-line budget, and every browser/print renderer consumes that safe value. Therefore older pinned versions whose HTML was validly stored continue to render and gain the safe-flow behavior.

Version pinning remains authoritative. Publishing a new Rockefeller CTA affects reports pinned to that Template Version and later versions; it does not silently replace authored HTML on previously completed reports pinned to an earlier version.

## Failure Handling

- HTML above 200 estimated lines receives the existing plain validation issue.
- HTML violating any retained cap or table grammar remains rejected.
- Defensive load still drops invalid or non-canonical stored fragments and emits the existing drift signal.
- No client-side measurement is required, so server-rendered browser views and automated PDF generation use the same markup and CSS.

## Verification

Tests will cover:

1. Exact Rockefeller CTA acceptance for both Preface and Closing.
2. Save/publish sanitization and defensive load for newly issued and historically pinned configurations.
3. The exact 200-line boundary and 201-line rejection for both positions.
4. All allowed semantic tags at accepted limits without horizontal clipping or authored-content overflow.
5. All five report styles in desktop, mobile, print emulation, and searchable PDF output.
6. Scaling Up Full page ordering, sequential logical numbers, dedicated Closing placement, generated conclusion retention, and Appendix placement.
7. Existing normal report page counts and feature-flag behavior.
8. Repository ESLint, targeted Jest, migration safety, and Turbopack build gates.

## Non-Goals

- Applying current Template Version wording retroactively to results pinned to an older version.
- Adding arbitrary scripts, embeds, multiple images, unrestricted CSS, or additional tables.
- Building a browser-measured or client-side pagination engine.
- Changing group/aggregate reports or results-email content, which do not consume report HTML.
