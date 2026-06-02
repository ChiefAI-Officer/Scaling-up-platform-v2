# Preserve stableKeys for unchanged assessment questions across versions

When re-seeding the 5 assessment templates with real Esperto content, each new template version reuses the **same `stableKey`** for any question that is semantically identical to the prior published version (notably all 40 Rockefeller items), assigns **fresh, deterministic, human-meaningful keys** (e.g. `P1_overall_rating`, `S4_recruitment`) for changed or new content, and **never reuses a key for a different question**. We chose this because submissions store answers keyed by `stableKey` and are scored against the campaign's pinned `versionId`, and `trends.ts` compares a company's results across versions — so reusing keys for identical questions keeps quarter-over-quarter trend comparison continuous, while fresh keys for changed content prevent silent data misalignment.

## Considered options
- **Mutate the existing version's content in place** — rejected: the immutability trigger blocks editing a published version, and it would orphan/misalign submissions of in-flight test campaigns.
- **Assign fresh random keys on every version** — rejected: breaks trend comparability for unchanged questions and makes a future re-seed unable to preserve continuity.

## Consequences
- Implementation must read the *current published* version's actual stableKeys (from prod, read-only) and match them exactly for unchanged questions, rather than assuming the seed's key scheme.
- A future revision of any template must follow the same rule: identical question → same key; changed question → new key.
