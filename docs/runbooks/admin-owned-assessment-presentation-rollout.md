# Runbook — Admin-owned assessment presentation

## Purpose and invariants

This rollout enables ADMIN/STAFF Welcome-screen authoring for future invited
campaigns and removes report-appearance choices from Coach campaign creation
and detail. It does not alter public quiz Welcome screens, existing campaign
Welcome snapshots, existing report styles, report renderers, questions,
sections, scoring, or Template Version publication.

The central invariant is: **every newly inserted invited campaign receives one
immutable Welcome snapshot, even when the feature is off or killed.** A kill is
a presentation rollback, not a persistence rollback.

## Controls

| Variable | Meaning |
| --- | --- |
| `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED` | Enables admin Welcome authoring/rendering and admin-owned coach report-style policy. |
| `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL` | Wins over enabled and restores legacy presentation/coach behavior. |

Truthy values are `1`, `true`, `TRUE`, and `yes`. Both variables default off.
An environment change requires a new Production deployment.

## Deploy dark

1. Deploy the additive schema migration before enabling presentation.
2. Run the migration verifier with an explicit Production database URL:

   ```bash
   DATABASE_URL="$EXPLICIT_PRODUCTION_DATABASE_URL" \
     node scripts/verify-invited-welcome-migration.mjs
   ```

3. Require zero missing invited snapshots, zero mismatches against the legacy
   backfill contract, zero non-null PUBLIC snapshots, and a present immutable
   snapshot trigger.
4. With both rollout variables absent, smoke the Coach wizard/detail and one
   invited participant link. Legacy UI/rendering should remain visible.
5. Create no Production campaign merely to test the dark deploy unless a named,
   disposable acceptance fixture and explicit write authorization exist.

## Enable and accept

1. Set `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED=1`; keep the kill
   absent. Redeploy and record the exact deployment and commit.
2. As ADMIN/STAFF, open one non-production assessment in Build. Confirm the
   collapsed Welcome card appears between the assessment header and Section 1,
   expands without a nested save button, previews safely as text, and saves via
   the page-level action.
3. With an authorized disposable fixture, create invited campaign A, change the
   template Welcome default, then create campaign B. Confirm A retains its old
   snapshot and B receives the new one. Do not use an active customer campaign.
4. Confirm Coach creation and detail contain no Report appearance/style picker,
   preview, provenance, lock copy, review row, or save action. Existing report
   and group-report links remain.
5. Confirm a forged Coach create returns HTTP 400 and a forged Coach isolated
   PATCH returns HTTP 403, both with `REPORT_STYLE_ADMIN_OWNED` and no mutation.
6. Confirm a PUBLIC quiz retains its existing Welcome output and its campaign row
   has a null invited snapshot.
7. Run both canonical health endpoints and capture browser acceptance at desktop
   and 1024-pixel width.

## Kill and rollback

1. Set `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL=1` and redeploy. The kill
   overrides enabled.
2. Verify the legacy Coach report-style controls and legacy invited Welcome
   rendering return. Do not delete or rewrite stored defaults or snapshots.
3. Create paths must continue writing `invitedWelcomeSnapshot` while killed.
   Verify this in tests or an authorized disposable environment before declaring
   rollback healthy.
4. Prefer keeping the additive columns, backfill, and immutable trigger in place.
   Reverting them would destroy forward-compatible history and is not an incident
   containment action.

## Completion receipt

Record migration/verifier counts, exact flag state, exact commit and deployment,
both health results, desktop/narrow visual checks, coach-forgery results, PUBLIC
separation, and the A/B snapshot proof if an authorized fixture was available.
Never include database URLs, credentials, invitation tokens, or respondent data.
