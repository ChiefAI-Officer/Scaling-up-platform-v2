# GH #257 Consolidated Progress SoT Design

## Goal

Bring the designated consolidated-progress ledger into agreement with the
already-verified GH #257 launch receipt. The current historical ledger records
eight eligible outcomes and correctly excluded GH #257 at that time; the later
launch receipt establishes GH #257 as the ninth eligible outcome.

## Chosen approach

Add a new newest-first entry to `plans/CHANGELOG.md` titled
`Consolidated progress ledger current through GH #257`. Preserve the existing
eight-outcome entry as historical truth instead of rewriting it in place.

The new entry will:

1. Retain the existing eight eligible outcomes without changing their
   classifications.
2. Add GH #257 as outcome nine, described as durable residual assessment-email
   outbox reconciliation shipped default-off.
3. State that implementation PR #296 counts once and docs-only closeout PR #297
   is evidence, not another outcome.
4. Preserve the rollout boundary: GH #257 is deployed but inactive because
   `ASSESSMENT_EMAIL_DELIVERY_INTENTS_ENABLED` is absent.
5. Preserve the safety receipt: no production legacy audit, replay, backfill,
   payload reconstruction, manual database write, operator release/cancellation,
   or customer email send occurred.

Advance the `CLAUDE.md` `LAST_UPDATED_ISO` / `LAST_UPDATED_SLUG` anchor and its
brief prose to point to the new consolidated-ledger entry.

## Alternatives rejected

- **Rewrite the eight-outcome entry:** rejected because it would erase the
  historical state that was accurate when recorded.
- **Change only the GH #257 launch receipt:** rejected because that receipt
  already states the correct classification; the designated consolidated ledger
  is the stale record.

## Scope and validation

This is documentation-only. It changes no application code, schema, runtime
configuration, rollout state, production data, or external report artifact.

Validation:

- `npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand`
- `git diff --check`
- factual comparison against the merged PRs, exact deployment receipts, closed
  issue, released claim, and completed Notion task already recorded in the
  canonical launch entry.
