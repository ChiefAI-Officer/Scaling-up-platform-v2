# ADR-0034 — Report HTML images use bounded author dimensions

**Status:** Accepted (2026-09-10)

## Context

Template Version report HTML supports one optional image in each Welcome and
Closing region. The sanitizer historically removed every image `width` and
`height` attribute, while report CSS forced every authored image under a
160-pixel height cap. That kept unknown content inside the report column, but it
also made a wide, clickable Closing banner illegibly small and prevented an
admin from changing its size without a code deployment.

Report-owned selectors already size a few fixed compositions such as the
Rockefeller book offer, QSP v2 preface, and Scaling Up Full next steps. Extending
that mechanism to changing promotional banners would turn ordinary content
updates into engineering work.

## Decision

Authored report images may persist bare-integer `width` and `height` attributes
as a pair, with each value from 1 through 2,000. An unpaired attribute, units,
percentages, zero, negative values, calculations, and values above the bound are
removed. Image and container style-property allowlists remain unchanged, so
this decision does not admit CSS sizing or loosen any surrounding layout.

Every authored image remains constrained by report-owned `max-width: 100%` and
`height: auto`, preserving its proportions and preventing horizontal escape in
browser and print rendering. The legacy 160-pixel height cap remains the default
only when an image has neither dimension attribute. Existing report-owned
composition selectors keep their more specific presentation rules.

The shared sanitizer applies the bounded attributes to both report HTML regions,
although the immediate stakeholder requirement and editor guidance concern the
Closing message. Save and defensive read use the same canonical rule.

## Consequences

- Admins can paste a linked banner, choose bounded dimensions, and change the
  asset later without a CSS change or deployment.
- A requested width larger than the available column becomes responsive rather
  than overflowing; the corresponding height follows the image's intrinsic
  aspect ratio.
- Existing unsized images retain their compact rendering.
- Previously saved dimensions cannot be recovered because the former sanitizer
  already removed them. The author must re-paste the attributes and publish the
  edited Template Version before live reports change.
- Any future support for CSS dimensions, per-campaign report HTML, additional
  images, or a larger dimension bound requires a separate decision.

## Rejected alternatives

- **A new magic `aria-label` selector:** safe for a permanent first-party
  composition, but incompatible with a banner intended to change over time.
- **Named size tokens:** bounded, but introduces a new authoring vocabulary and
  gives less direct control than the HTML attributes the editor already exposes.
- **Unrestricted CSS sizing:** admits layout escape and pagination risks that the
  report HTML trust boundary deliberately excludes.
