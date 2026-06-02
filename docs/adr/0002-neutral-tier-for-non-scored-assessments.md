# Represent non-scored assessments with a single neutral tier

Quarterly Session Prep v1 and v2 have no real scoring in the source instrument — they aggregate leadership responses (means) for discussion, with no bands, thresholds, or recommendation messages. But `AssessmentTemplateVersion.scoringConfig` is non-nullable and `ScoringConfigBase` requires `tiers` with `min(1)`, so a version cannot publish with zero tiers. We therefore give each non-scored assessment a **single catch-all tier** spanning the full metric range, `tierMetric: overallAvg`, with a genuinely neutral message (no `passThreshold`, no multiple bands) rather than inventing fake performance bands.

## Considered options
- **Change the engine to allow zero-tier (aggregation-only) templates** — rejected for this work: a schema/engine change with its own validation + publish-path risk, out of scope for a content re-seed.
- **Invent multi-band scoring** (as the current placeholder seeds do) — rejected: fabricates customer-facing performance bands the real instrument never had.

## Consequences
- The neutral tier is **schema plumbing, not a displayed result** today: the public thank-you page deliberately does not surface a score, so respondents see only an acknowledgement. The neutral message must stay genuinely neutral for when results delivery (a future slice) is built.
- A proper "non-scored results display" (showing aggregated responses instead of a band) is a future slice, explicitly out of scope for the content re-seed.
