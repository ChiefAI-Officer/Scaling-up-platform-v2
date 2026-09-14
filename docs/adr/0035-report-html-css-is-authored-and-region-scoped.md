# ADR-0035 — Report HTML CSS is authored and region-scoped

**Status:** Accepted (2026-09-11)

## Context

The Template Version editor provides optional Welcome and Closing HTML for
individual reports. Authors could enter semantic markup and a small set of
inline visual properties, but could not enter classes or a stylesheet. The
Scaling Up Profits promotion therefore depended on application CSS keyed to
its `aria-label` values. Its visible presentation was absent from the editor,
so the author could neither understand nor change what rendered.

A normal `<style>` element is document-wide even when it appears inside an
HTML section. Allowing it without containment would let a rule such as `p {}`
restyle generated report content outside the author's region.

## Decision

The existing Welcome and Closing HTML fields accept ordinary `class`
attributes and `<style>` elements. The stylesheet stays inside the stored HTML
fragment, so the editor remains the complete source of the authored region's
content and appearance. No new storage field or report schema version is
introduced.

CSS is parsed and re-serialized with `css-tree` before acceptance. Each region
allows up to 4,000 CSS characters. Only region-safe conditional at-rules
(`@media`, `@supports`, `@container`, and nested `@scope`) are accepted; all
other at-rules are rejected so a new document-global definition cannot bypass
an incomplete denylist. Non-HTTPS URLs are rejected, and `position` accepts only
the report-safe `static`, `relative`, and `absolute` keywords. CSS escapes, custom-property
declarations, `var()`, `attr()`, and `env()` are rejected rather than attempting to evaluate
indirection that could reconstruct one of those blocked values. Scripts, event
handlers, and unsafe HTML attributes remain subject to the existing sanitizer.
Ordinary author class names are preserved without a prefix policy. A short,
explicit list of platform page-shell classes and variants is removed because applying
those report-owned layout rules would let authored markup impersonate a page;
the editor discloses this mechanical containment rule.

At render time, each validated stylesheet is mechanically wrapped in an
`@scope` rooted at its existing Welcome or Closing container. The stored source
is not rewritten with the wrapper. The same shared `ReportHtmlSection` seam is
used by Classic scored, Classic qualitative, Executive Boardroom, Modern
Dashboard, and Scaling Up Full browser/print reports. Report email remains a
separate output family and does not consume these fragments.

The Scaling Up Profits `aria-label`-keyed application CSS is removed. Its
reference composition is now reproducible from the HTML, classes, and CSS an
author enters. Existing report-owned CSS for the fixed Rockefeller, QSP v2,
and Scaling Up Full compositions remains unchanged.

When the HTML sanitizer mechanically adjusts a fragment, the author's source
remains in the editor and the safe stored result is used by Preview. The editor
therefore does not silently replace the source; the author can compare it with
the rendered result and correct the original.

## Consequences

- Authors can build and later modify a complete responsive report region
  without an engineering deployment.
- Broad selectors apply only inside the region in which they were authored,
  including screen and print output.
- Browsers without `@scope` support ignore authored presentation rather than
  leaking it into generated report content.
- Existing stored markup is not backfilled. An author must save the full HTML
  and CSS and publish the edited Template Version before live reports change.
- ADR-0034's rejection of unrestricted CSS remains valid; this decision admits
  validated, size-bounded, region-scoped CSS instead.

## Rejected alternatives

- **Application CSS keyed to author markup:** hides presentation from the
  editor and makes content changes require engineering work.
- **A separate CSS database field:** adds schema and synchronization work
  without improving authorship; `<style>` already travels with the fragment.
- **An iframe or shadow root:** complicates report pagination and PDF output.
- **Selector-prefix rewriting:** has more selector and specificity edge cases
  than the browser-native scope boundary.
