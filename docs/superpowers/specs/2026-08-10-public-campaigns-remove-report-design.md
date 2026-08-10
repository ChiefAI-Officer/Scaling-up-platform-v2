# Remove Report Design from Public Campaigns

**Status:** Approved design

**Date:** 2026-08-10

**Scope:** ADMIN/STAFF Public Campaigns list and creation page only

**Production routes:**

- `/admin/assessments/public-campaigns`
- `/admin/assessments/public-campaigns/new`

**Supersedes:** The report-design controls described in
`2026-08-10-public-campaigns-simple-ui-design.md`

## Decision

Remove report-design selection and management from the Public Campaigns UI.
New public campaigns inherit the selected assessment's default report design.
Existing campaigns retain their stored report-style values, but the Public
Campaigns screen no longer exposes a control for changing them.

## Why

Report design is not part of the administrator's core public-campaign job:
choose an assessment, name the campaign, set availability, publish it, copy the
link, and view responses. Exposing a campaign-level report override adds a
secondary concept and makes the workflow harder to understand.

## UI Changes

### Campaign list

- Remove `More` and `Report design` from every campaign row.
- Remove the inline report-design disclosure and its local expansion state.
- Keep Publish, Copy link, View responses, and Hide responses unchanged.

### Creation page

- Remove the Report design section and picker.
- Do not send a `reportStyle` override in the create request.
- Keep assessment, campaign name, start, end, validation, Cancel, and Create
  draft behavior unchanged.

## Compatibility Boundary

- Do not change the shared report-style system or assessment editor.
- Do not remove API/schema support for existing report-style fields.
- Do not rewrite existing campaign records.
- Delete the now-unreferenced Public Campaigns-only report-design component and
  its dedicated tests.
- Keep list payload decoding backward compatible with report-style fields while
  the API still returns them.

## Approaches Considered

1. **Remove both Public Campaigns controls — selected.** This gives the simplest
   workflow and makes the assessment default the single source of truth.
2. Hide only the list control. Rejected because creation would still expose the
   same unnecessary decision.
3. Keep the control under an advanced disclosure. Rejected because it preserves
   the concept and maintenance burden without serving the core task.

## Testing and Acceptance

- Component tests prove `Report design` and `More` are absent from the Public
  Campaigns list for campaigns with report styles available.
- Creation tests prove the picker is absent and the POST body never contains
  `reportStyle`.
- Existing Publish, Copy link, response disclosure, validation, and Cancel tests
  remain green.
- Browser acceptance checks the Production-flagged UI at desktop and narrow
  widths before release.
- Production acceptance is read-only: do not create, publish, or modify a
  campaign.

## Rollback

The existing `WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_KILL` switch remains the emergency
rollback for the entire simplified Public Campaigns experience. This cleanup
does not add another feature flag.
