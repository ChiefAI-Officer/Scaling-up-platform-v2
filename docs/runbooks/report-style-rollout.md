# Runbook — Scaling Up Full individual report styles

## Purpose and boundary

This runbook controls the dark rollout of the two opt-in individual report
appearances for the `scaling-up-full` scored instrument:

- `EXECUTIVE_BOARDROOM` (Executive Boardroom)
- `MODERN_DASHBOARD` (Modern Dashboard)

The only in-scope output is an individual scored on-screen report and its
browser-print view. Qualitative reports, group reports, other instruments, and
results-email HTML remain unchanged. The existing admin top navigation and
coach sidebar are unchanged.

`CLASSIC` is the persisted migration default, the flag-off result, the kill
result, and the fail-closed fallback for an invalid, missing, ineligible, or
otherwise unavailable style. Production must remain Classic until both new
styles have authoritative visual acceptance under **Authoritative acceptance**
below.

## Controls and identifiers

| Variable | Exact meaning |
| --- | --- |
| `WAVE_REPORT_STYLES_ENABLED` | Global capability gate. Set to `1` only after both styles are accepted. |
| `WAVE_REPORT_STYLES_CANARY` | Comma-separated exact `AssessmentTemplate.id` and/or `AssessmentCampaign.id` allowlist. It is not a coach or organization allowlist. |
| `WAVE_REPORT_STYLES_KILL` | Hard kill. A truthy value takes precedence over both global and canary enablement. |

Truthy values are `1`, `true`, `TRUE`, and `yes`. Any other value is off.
Changing a variable requires a new Production deployment because the app must
be rebuilt/restarted with the intended environment.

Setting `WAVE_REPORT_STYLES_KILL=1` disables the new-style picker and renderer
for new reads, but **does not erase or rewrite** stored
`defaultReportStyle`, `reportStyle`, `reportStyleSource`, or
`reportStyleLockedAt` values. The effective output falls back to Classic;
remove the kill only after the incident is understood and the chosen stored
styles have been reviewed.

## Preflight

1. Confirm the additive migration
   `20260805090000_add_assessment_report_styles` is included in the release.
   Do not use a data migration to change existing campaigns: they are already
   `CLASSIC` by default.
2. Deploy with all three variables absent/off. Verify an existing
   `scaling-up-full` campaign still renders Classic, and that existing report
   routes do not change.
3. Select disposable, synthetic canary campaigns only. Record their exact
   template/campaign IDs in the rollout ticket; do not put names, respondent
   emails, tokens, or report URLs in an environment value or this runbook.
4. Keep `WAVE_REPORT_STYLES_ENABLED` off. Set only
   `WAVE_REPORT_STYLES_CANARY=<exact-id[,exact-id]>`, deploy, and verify that
   non-canary campaigns remain Classic.

Read-only validation queries (run only through an approved Production
read-only connection or the disposable fixture database) are:

```sql
-- The migration/default inventory. No respondent data is selected.
SELECT "defaultReportStyle", count(*)
FROM "AssessmentTemplate"
WHERE "deletedAt" IS NULL
GROUP BY "defaultReportStyle"
ORDER BY "defaultReportStyle";

SELECT "reportStyle", "reportStyleSource", count(*)
FROM "AssessmentCampaign"
WHERE "deletedAt" IS NULL
GROUP BY "reportStyle", "reportStyleSource"
ORDER BY "reportStyle", "reportStyleSource";

-- Lock inventory: submissions and a non-null lock must agree.
SELECT
  count(*) FILTER (WHERE submissions > 0 AND "reportStyleLockedAt" IS NULL) AS missing_lock,
  count(*) FILTER (WHERE submissions = 0 AND "reportStyleLockedAt" IS NOT NULL) AS unexpected_lock
FROM (
  SELECT c.id, c."reportStyleLockedAt", count(s.id) AS submissions
  FROM "AssessmentCampaign" c
  LEFT JOIN "AssessmentSubmission" s ON s."campaignId" = c.id
  WHERE c."deletedAt" IS NULL
  GROUP BY c.id, c."reportStyleLockedAt"
) campaign_lock_state;
```

Both lock counts must be zero before claiming a clean rollout. If either is
nonzero, stop and investigate; do not repair style data ad hoc.

## Canary sequence

1. Leave the global flag off and set the canary to the synthetic campaign or
   `scaling-up-full` template IDs. Deploy.
2. As ADMIN, set the Scaling Up Full ED10 Settings default once to Executive
   Boardroom and once to Modern Dashboard. It applies only to future campaigns;
   it does not rewrite existing campaigns. Confirm no default control appears
   for another instrument.
3. Create a fresh canary campaign for each style. As its owning coach, verify
   the report-appearance picker at campaign creation and campaign detail.
   Change the style before a completion to prove the campaign override path.
4. Submit a synthetic response through each route in scope. Confirm the first
   successful completion atomically freezes the campaign choice. Attempt the
   same owner/admin style PATCH afterwards and require `409`; confirm the
   stored style remains unchanged.
5. For each style, inspect the actual authorized report route at desktop and
   mobile widths, run Axe, and create a browser-print US-Letter PDF. Confirm
   the exact same campaign snapshot is used on screen and in print; canonical
   values, wording, recommendations, and CTA eligibility must match Classic.
6. Obtain recorded visual acceptance for both Executive Boardroom and Modern
   Dashboard. A visual acceptance must cover normal, partial, degraded,
   maximum-length, missing-optional, and long-branding synthetic variants with
   no clipping, overlap, broken glyphs, blank pages, or lost provenance.
7. Only then set `WAVE_REPORT_STYLES_ENABLED=1`, leave the template default
   `CLASSIC`, deploy, and verify a non-canary fresh campaign. General picker
   availability does not itself change a template default.
8. Change a global default only through a deliberate ADMIN action in the
   Scaling Up Full ED10 Settings tab, after the general rollout is accepted.
   The change affects future campaigns only. Record the decision, approver,
   timestamp, and exact setting in the rollout ticket.

## Authoritative acceptance

The isolated production-route workflow is the authority:

`admin default → campaign creation/inheritance → coach override → synthetic
submission → atomic lock → authorized report route → desktop/mobile/Axe/Letter
print`.

Run it only with `E2E_REPORT_STYLES_DATABASE_URL` bound exactly to a migrated,
disposable fixture database and with both
`E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_ID` and
`E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_VALUE` set to the provisioner's strong
sentinel. The hardened launcher verifies that sentinel, forces the fixture URL
into the child process, builds production output, then starts it. Do not source,
copy, or use any canonical-checkout remote database environment file.

The supplemental DB-free component-renderer evidence is useful but is not a
substitute: it bypasses compiled CSS imports and stubs `next/font`. As of this
runbook's preparation, the supplemental lane passed 2 styles × 6 variants, 12
Axe scans, 24 responsive screenshots, and 12 Letter PDFs / 111 physical pages.
The authoritative isolated production-route workflow was **not run** because
no disposable fixture database and strong sentinel were available. It must not
be described as passed until it has actually run with those safeguards.

## Kill, containment, and rollback

1. Set `WAVE_REPORT_STYLES_KILL=1` and deploy. The kill overrides a nonempty
   canary and a global enabled flag, restoring Classic for effective renders.
2. Verify one former canary and one non-canary report render Classic. Confirm
   the stored enum values were preserved with the read-only inventory query.
3. Keep the database migration and stored choices in place. Do not roll back or
   edit individual campaign rows as an incident shortcut.
4. If the issue is deployment-wide, promote the previously healthy deployment
   only after the kill state and stored-value preservation are captured. Keep
   the kill on until a retest has visual acceptance.
5. Record the incident, exact deployment, flag names (not secrets), impacted
   campaign IDs, and the decision to restore canary/global access in the
   rollout ticket.

## Completion record

Before marking the rollout complete, attach the migration receipt, flag-name
inventory, canary identifiers, lock-query counts, screenshots, Axe results,
Letter PDFs, visual approval for both styles, and the result of the isolated
production-route workflow. Do not attach production respondent data, invitation
tokens, database URLs, credentials, or raw report exports.
