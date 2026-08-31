# Five Dysfunctions Word Report Parity Design

## Goal

Make the Five Dysfunctions individual report follow Jeff Verdun's supplied Word mockup as the visual authority while preserving every other assessment report.

## Source authority

Jeff's `5 dysfunctions report setup changes.docx`, attached to the August 26, 2026 email, defines the intended report structure:

1. Cover
2. `HOW YOU SCORED, BY AREA` / `The Five Categories`
3. `DETAILED BREAKDOWN` / `How you scored, section by section`
4. Personalized closing CTA and branded footer

The source uses score-dependent interpretation text. Its sample values are not fixed acceptance data: the rendered message must continue to come from each frozen domain tier.

## Presentation contract

For template alias `five-dysfunctions` only:

- Omit the `Overall result` section.
- Omit the `Score summary` / `All sections` section.
- Keep exactly one Five Categories section.
- Present each category as a two-column row: a compact bordered score card on the left and an unboxed tier interpretation on the right.
- Preserve domain order: Trust, Conflict, Commitment, Accountability, Results.
- Preserve score, progress bar, points, and frozen tier message.
- If a frozen domain tier/message is absent, show the score card and omit only the message.
- Preserve the detailed question breakdown, personalized closing CTA, and branded footer.
- On narrow screens, stack each interpretation immediately below its score card without horizontal overflow.
- Use the same structure for on-screen display, browser print, and PDF download because all three use `BrandedReport`.

All other aliases retain their current section visibility, labels, cards, and snapshots. In particular, Scaling Up Full continues to show Overall Result, Your Four Decisions, and All sections.

## Implementation approach

Extend the existing per-template report configuration instead of branching on an alias inside the renderer:

- Add an optional `showOverall` presentation flag whose omitted value preserves current behavior.
- Set `showOverall: false` and the existing `showScoreTable: false` for Five Dysfunctions.
- Add a domain-result layout option for the Word-style split presentation; omitted layout preserves the existing unified card.
- Have `BrandedReport` render sections and CSS classes from those configuration values.

This keeps template policy in `report-config.ts` and leaves the shared renderer generic.

## Test seam

Tests exercise the public React rendering seam with `BrandedReport` and the public configuration seam with `reportConfigFor`.

Required assertions:

1. Five Dysfunctions has no Overall Result or All sections section.
2. Its Five Categories section has exactly five split-layout rows with score cards and tier messages.
3. Missing tier data omits only the corresponding message.
4. Detailed Breakdown and the closing remain present.
5. Scaling Up Full retains Overall Result, its existing domain layout, and All sections.
6. Report configuration exposes the intended Five Dysfunctions policy and keeps defaults backward-compatible.

## Constraints

- No environment-variable or feature-flag changes.
- No schema or migration changes.
- No template, campaign, response, report-record, or production-data writes.
- No new report renderer or duplicate results-by-area section.

