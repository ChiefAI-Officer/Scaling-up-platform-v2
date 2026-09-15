# ADR-0037 — Estimated lines governs authored report layout

**Status:** Accepted (2026-09-15)

## Context

The Template Version Reports tab stores optional Welcome and Closing HTML/CSS.
The original sanitizer limited each region to one image, one table, a small
number of headings and line breaks, and one figure caption. Those limits were
introduced while authored content had to fit inside one fixed-height landscape
page.

Authored regions now own fragmenting continuation pages and permit 200
estimated lines. The old content-shape caps remained unchanged, so a second
ordinary image still blocked the entire combined Template Version save even
though the renderer could paginate it. Authors could already evade that image
count with an HTTPS CSS background, which was less accessible and was not
charged the image layout weight.

## Decision

When `WAVE_REPORT_HTML_LIMITS_ENABLED` is active and its kill switch is absent,
`estimatedLines` is the primary vertical-layout governor for each authored
region. The separate counts for images, tables, headings, line breaks, and
figure captions are removed. Image elements continue to cost six estimated
lines each. The raw-source, authored-CSS, visible-text, table-shape, and
estimated-line budgets remain unchanged. The cheap pathological-paste guards
increase to 200 elements and 16 nesting levels.

The safe static vocabulary also admits `picture`, HTTPS-only `source`,
`details`, `summary`, and `nav`. `pre` remains unwrapped because browser proof
previously showed whitespace-preserving content expanding the report to roughly
17,000 pixels. `footer` remains unwrapped because alternate report appearances
use generic report-footer selectors that would mistake authored markup for
platform chrome. Executable or document-embedding elements—including `script`,
`iframe`, forms, controls, and SVG—remain discarded with their content.

Inline `style` declarations use the same CSS safety checks as an authored
`style` block instead of a nine-property allowlist. Layout properties and HTTPS
image URLs therefore work in either authoring form, while fixed/sticky
positioning, non-HTTPS fetches, CSS escapes, custom properties, and substitution
functions remain removed or rejected under the existing policy.

The Reports tab shows source, CSS, visible-text, estimated-line, element, depth,
image, and applicable table counts derived from the canonical sanitized
fragment. Flag-off retains the previous sanitizer and editor presentation.

## Consequences

- Multiple accessible images can paginate naturally without image-compositing
  workarounds or application CSS.
- A future page-geometry change has one calibrated vertical budget to revisit
  instead of several unrelated content-shape caps.
- Element, depth, text, and table-shape limits remain defense-in-depth; this
  decision does not make the region computationally or structurally unbounded.
- Truly unrestricted active content would require isolation such as a sandboxed
  iframe, which would not blend into the paginated report. That remains outside
  this authoring surface.
- The QSP and Verne application-CSS image workarounds are intentionally left for
  a separate content-migration change.
