# Public Campaign Lifecycle Actions — Corrected Design

**Date:** 2026-09-15  
**Source:** Jeff Verdun, September 14 meeting, Fathom `182650387` / call `822287943`  
**Visual approval:** Operator approved the Draft, Live, and Closed action matrix and both destructive dialogs on 2026-09-15.

## Goal

Let ADMIN and STAFF users permanently close and clean up public campaigns from the simplified **Public campaigns** page without creating a second lifecycle or losing response data.

## Product behavior

The lifecycle matrix is:

| Campaign state | Actions |
| --- | --- |
| Draft | **Publish** · **Delete** |
| Live | **Copy link** · **View responses** · **Close** |
| Closed | **View responses** · **Delete** |

Close is terminal. There is no pause, resume, or reopen action. A Live public campaign cannot be deleted until it is Closed. Delete remains a soft delete: responses stay in storage, but the campaign and its responses are no longer reachable from this page.

### Close dialog

- Title: `Close {campaign.name}?`
- Body: `The public link stops working immediately. People who already started will not be able to submit. Responses collected so far are kept. This cannot be undone.`
- Optional `Reason` textarea, maximum 500 characters, with a live character counter.
- Actions: **Cancel** and destructive **Close campaign**.

### Delete dialog

- Title: `Delete {campaign.name}?`
- With responses: `{n} response(s) are kept but will no longer be reachable from this page. This cannot be undone.` Use correct singular/plural grammar.
- With no responses: `This campaign will be removed from this page. This cannot be undone.`
- Actions: **Cancel** and destructive **Delete campaign**.

All new row actions remain inline; no overflow menu is introduced. Responsive row and dialog controls retain 44px touch targets.

## Domain correction: `closedAt` is not `closeAt`

`closeAt` is the scheduled availability cutoff and is coupled to `endMode`, opening dates, reminders, invitations, and token behavior. It must not be overwritten with the time an administrator presses Close.

Add nullable `AssessmentCampaign.closedAt DateTime?` as the lifecycle transition timestamp, following this schema's existing camelCase column convention. It records when a flagged PUBLIC campaign actually enters `CLOSED`. Existing campaigns remain valid with `closedAt = null`.

The Availability label for a Closed campaign resolves in this order:

1. `Closed {closedAt}` when the lifecycle timestamp exists.
2. `Closed {closeAt}` for legacy scheduled closures.
3. `Closed` when neither timestamp exists.

This preserves historical schedule semantics while delivering the approved close-date display.

## Flag boundary

The capability is controlled by:

- `WAVE_PUBLIC_CAMPAIGN_LIFECYCLE_ENABLED`
- `WAVE_PUBLIC_CAMPAIGN_LIFECYCLE_KILL` (wins)

The server-rendered Public campaigns page resolves the flag and passes a boolean through `PublicCampaignList` to `PublicCampaignActions`. Client components do not read private server environment variables.

When the lifecycle flag is off:

- The Actions cell is identical to the pre-wave UI.
- Existing generic Close and Delete callers retain their previous request and persistence behavior.
- No caller writes `closedAt`.

The additive nullable database column itself is inert while the flag is off.

## API behavior

Reuse the existing generic endpoints:

- `POST /api/assessment-campaigns/[id]/close`
- `DELETE /api/assessment-campaigns/[id]`

No admin-specific duplicate endpoint is added.

### Flagged PUBLIC close

The action may send the row's current state as `expectedStatus`. The route performs a conditional transition so only one concurrent request can move the row into `CLOSED`. The winning transition writes `status = CLOSED` and `closedAt = now` and creates the optional-reason audit record in the same transaction; it returns that persisted timestamp only after both writes commit.

If another request already closed the campaign, return `409 ALREADY_CLOSED` with the authoritative Closed state and `closedAt`. The client reconciles the row to Closed instead of leaving a false Live state.

INVITED campaigns and flag-off PUBLIC calls retain the existing close write (`status` only).

### Flagged PUBLIC delete

The server enforces the approved rule, not merely the button matrix. A flagged PUBLIC campaign is soft-deletable only while Draft or Closed. The write is conditional, so a Draft campaign that becomes Live in another tab cannot be deleted by the stale tab.

An Active or concurrently changed row returns `409 CAMPAIGN_STATUS_CHANGED`. The client keeps the row and asks the user to refresh. Existing INVITED and flag-off callers retain the prior any-state delete contract.

Delete success must validate the existing success envelope before removing the row. The list announces deletion in a focused status region and removes only the matching campaign, including any expanded responses row.

## Error handling and accessibility

- Neither action runs before explicit confirmation.
- Cancel and Escape dismiss without a request and restore trigger focus.
- Dialog controls are disabled while their action is in flight.
- Raw status codes and server error strings are never shown.
- Failures keep the row and use the existing alert notice pattern.
- Successful Close updates the status and availability date without a reload.
- Successful Delete moves focus to a persistent list-level status message because the trigger row disappears.

## Test seams

Tests exercise four public seams agreed by the operator:

1. Flag resolution and server-page prop propagation.
2. Action buttons, dialogs, request contracts, reconciliation, and notices.
3. List row mutation/removal, response-panel cleanup, announcement, and duplicate campaign names.
4. Close/Delete API lifecycle enforcement, flag-off compatibility, and conditional-write races.

Add migration-shape and schedule-label coverage for the new nullable field and fallback order.

## Non-goals

- Pause/resume or reopen.
- Hard delete or a deleted-campaign archive.
- Editing a public campaign after creation.
- Bulk lifecycle actions.
- Changing INVITED campaign lifecycle behavior.
- New API namespaces or lifecycle states.

## Rollout and rollback

Ship the additive migration and code with the lifecycle flag disabled. Enable the flag only after required checks and visual validation. The kill switch restores the prior UI and route behavior; the nullable column may remain safely unused during rollback.
