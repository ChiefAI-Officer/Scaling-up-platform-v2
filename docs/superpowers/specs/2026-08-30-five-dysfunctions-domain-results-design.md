# Five Dysfunctions Domain Results Design

**Status:** Approved by user handoff for implementation
**Issue:** GitHub #387 item 6 / Handoff E
**Source:** `tmp/handoffs/HANDOFF-E-item6-five-dysfunctions.md` and Jeff's `5 dysfunctions report setup changes.docx`

## Problem

The individual Five Dysfunctions report already renders the domain-results section. It must not gain a second section. The existing section has two visible defects:

1. It uses Scaling Up Full vocabulary: `How you scored, by decision` / `Your Four Decisions`.
2. Its cards omit the already-frozen `ScoreResult.perDomain[].tier.message`, so authored interpretation text is invisible.

The source mockup shows one section headed `HOW YOU SCORED, BY AREA` / `The Five Categories`. It contains five rows in domain order. Each row pairs the existing score card with the resolved interpretation sentence.

## Root cause and data contract

`scoreSubmission()` already computes every domain average and freezes the matching domain tier as `{ label, message }` in `perDomain[]`. The renderer must consume this frozen result and must never re-score or resolve authoring configuration at render time.

Five Dysfunctions uses fractional touching bands:

- Low: `[1, 3.25)`
- Medium: `[3.25, 3.75)`
- High: `[3.75, 5]`

At an exact shared boundary, the tier with the greater `minMetric` wins. Thus Trust `3.25` resolves to the seeded Medium message and `3.75` resolves to the seeded High message. Historical results remain frozen and are not rewritten.

## Design

### Per-template presentation policy

Extend `ReportConfig` with an optional domain-results presentation object containing:

- `eyebrow`
- `title`
- `showTierMessage`

Only `five-dysfunctions` supplies the override. Other aliases and unknown aliases retain the existing literal defaults and omit domain messages, preserving their rendered output.

### Existing renderer only

Keep the sole `report-decisions` section in `BrandedReport.tsx`. Its card view data gains the frozen domain tier message only when the report config requests it. Empty/null messages render nothing.

For Five Dysfunctions, the card grid becomes one row per domain. At report widths, the existing score/bar/points content occupies the left column and the message occupies the right column. At narrow widths the message stacks below the score content. Scaling Up Full keeps its existing two-card grid and exact existing markup/classes because its config does not enable messages.

### Boundary semantics

Make fractional touching-tier resolution deterministic by selecting the matching tier with the greatest lower bound. This changes only ambiguous shared-boundary resolution; validation already forbids genuine overlaps. Integer tier ranges and non-boundary scores remain unchanged.

## Acceptance criteria

1. Five Dysfunctions has exactly one domain-results section.
2. Its heading is `How you scored, by area` / `The Five Categories`.
3. All five cards render their frozen tier messages alongside score, bar, and points.
4. Trust averages of exactly `3.25` and `3.75` resolve to the seeded Medium and High messages respectively.
5. Scaling Up Full retains `How you scored, by decision` / `Your Four Decisions`, has no domain-message paragraphs, and retains its existing snapshot.
6. Missing/null domain tiers degrade by omitting the message without crashing.
7. No environment variable, feature flag, schema, migration, template row, campaign, response, report record, or Production data changes.

## Verification

- Focused Jest tests for report config, Five Dysfunctions scoring boundaries, and `BrandedReport` rendering.
- Existing Scaling Up Full static-markup snapshot remains unchanged.
- Changed-file ESLint.
- Migration safety gate.
- Full Jest suite.
- `CI=true npm run build` from `src/`.
- Rendered component screenshot compared with the three-page source mockup, checking the single-section count, headings, five score/message rows, mobile stacking, and absence of clipping.
