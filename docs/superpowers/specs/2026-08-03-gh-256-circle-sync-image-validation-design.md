# GH #256 — Circle-Sync Coach-Image Validation Design

Date: 2026-08-03
Status: Design approved; awaiting written-spec review
Issue: [GH #256](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/256)
Claim: [Issue #261 comment](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/261#issuecomment-5162188735)
Branch: `codex/256-circle-sync-image-validation`
Baseline: `origin/main` at `6983c1f1050be06e95a736be8f228d30ad13f200`

## Context

`src/src/services/circle-sync.ts` copies Circle's `profile.avatarUrl` directly
into `Coach.profileImage`. This bypasses the HTTPS-only validation already used
by the ADMIN/STAFF Coach APIs and respondent-facing Coach-logo renderers.

The shared authority is
`src/src/lib/assessments/safe-image-src.ts`. It accepts parseable `https:` URLs
and rejects HTTP, non-HTTP schemes, relative values, empty values, and
unparseable strings. It deliberately does not restrict hosts. An arbitrary valid
HTTPS host therefore remains acceptable and can still receive a respondent's
image request.

The current production audit found no invalid stored Coach images. This slice is
preventive write-path hardening, not incident repair.

## Decision

Validate a Circle avatar at the Circle-sync persistence boundary immediately
before it would be added to the Prisma update. Reuse `safeImageSrc` unchanged.

An invalid avatar is a field-local rejection:

- omit `profileImage` from the update;
- preserve the existing image, including during `forceOverwrite`;
- continue syncing every unrelated eligible field;
- advance `syncedAt`;
- return success with a structured, nonfatal warning; and
- emit PII-safe warning telemetry.

## Boundaries and Responsibilities

### Shared image policy

`safeImageSrc` remains the only HTTPS-image policy. This work neither wraps nor
duplicates it and does not change its acceptance rules.

### Circle profile mapping

`src/src/services/circle.ts` continues mapping Circle's trimmed nonempty avatar
string into `CircleProfile.avatarUrl`. Read-only consumers retain their current
data contract. Validation occurs only when the sync service is considering a
database write.

### Circle-sync service

`src/src/services/circle-sync.ts` owns write eligibility, validation, update
payload construction, warning creation, and PII-safe telemetry. It must not
throw or fail the full sync merely because an otherwise eligible avatar is
invalid.

### Manual import API and UI

`POST /api/coaches/[id]/circle-import` keeps its existing HTTP success/failure
semantics and passes nonfatal warnings to the caller on successful syncs.
`CircleSyncButton` presents the ordinary success result and any warning so an
operator can see that other fields synced while the image did not.

The lazy landing-page sync may ignore warnings. It has no interactive operator
surface, and the server warning remains the observability mechanism for that
path.

## Warning Contract

Every `SyncResult` carries a `warnings` array. The Circle-image rejection uses
one stable warning:

- `code`: `invalid-image-url`
- `field`: `profileImage`
- `message`: `Profile image skipped because Circle supplied an invalid URL.`

All configuration, not-found, and full-sync error results return an empty
warnings array. Successful syncs without a rejected eligible avatar also return
an empty array.

The API response exposes the same warning objects. A warning does not change the
HTTP status, set `success` to false, or suppress successfully updated fields.

## Data Flow

1. Preserve the existing configuration, Coach lookup, Circle lookup, and
   not-found behavior.
2. Treat the avatar as eligible only when Circle supplied a nonempty
   `avatarUrl` and either:
   - `forceOverwrite` is true; or
   - the stored `Coach.profileImage` is empty.
3. If the avatar is not eligible, ignore it without validation, warning, or
   image telemetry.
4. If eligible, pass it through `safeImageSrc`.
5. If accepted, write the returned HTTPS value and add `profileImage` to
   `fieldsUpdated`.
6. If rejected, omit `profileImage`, append the structured warning, and emit the
   approved PII-safe warning event.
7. Independently evaluate and write bio, company, and Circle ID under the
   existing rules.
8. Always include a new `syncedAt` after a successful Circle lookup.
9. Perform the existing single Coach update.
10. Return `success: true`. Derive `updated` exclusively from whether
    `fieldsUpdated` is nonempty; `syncedAt` does not count as a user-profile
    field update.

### Eligibility and outcome matrix

| Incoming avatar | Stored image | `forceOverwrite` | Validate | Outcome |
| --- | --- | --- | --- | --- |
| absent | any | either | no | no image action or warning |
| present | empty | false | yes | write if valid; otherwise skip and warn |
| present | empty | true | yes | write if valid; otherwise skip and warn |
| present | nonempty | false | no | preserve stored image without warning |
| present | nonempty | true | yes | replace if valid; otherwise preserve and warn |

If an invalid avatar is the only candidate, the database still records
`syncedAt`, while the result is `success: true`, `updated: false`,
`fieldsUpdated: []`, and contains the warning.

## Observability and Privacy

A rejected eligible avatar emits one structured `console.warn` with:

- `coachId`;
- sync mode (`fill-empty` or `force-overwrite`);
- `field: profileImage`; and
- `reason: invalid-image-url`.

The log must not contain the Coach email, raw rejected URL, Circle profile
payload, query string, or user-facing warning message. Excluding the raw URL
also avoids leaking signed parameters or other credentials that an upstream URL
could contain.

## Error Handling

Avatar rejection is not an exception and must not enter the service's catch
path. Other fields continue through the same update operation.

Circle lookup failures, database failures, missing configuration, missing
Coach records, and missing Circle profiles keep their existing full-sync failure
semantics. The manual import API retains its existing status mapping for those
errors.

## Approaches Considered

### 1. Validate at the Circle-sync write boundary — selected

Apply the shared policy only when `circle-sync.ts` would persist the avatar.
This closes the exact bypass, preserves other Circle consumers, and retains
enough context for actionable warnings.

### 2. Validate in the Circle API mapper

Sanitize `avatarUrl` inside `mapCircleMember` for every consumer.

Rejected because it broadens the behavior change to read-only Circle-profile
consumers, discards the distinction between absent and rejected values, and
loses the write-mode context needed for useful operator feedback.

### 3. Introduce a generic Coach image persistence layer

Route every Coach-image writer through a new shared database helper.

Rejected as disproportionate. The Blob upload route is safe by construction,
the ADMIN/STAFF APIs already apply the shared scheme policy, and a broad
persistence refactor adds risk unrelated to this residual.

## Test Strategy

Extend `src/src/__tests__/unit/circle-sync.test.ts` to prove:

1. A valid arbitrary-host HTTPS avatar still writes and adds `profileImage` to
   `fieldsUpdated`.
2. With an empty stored image, an invalid avatar is omitted while unrelated bio,
   company, Circle ID, and `syncedAt` values still persist.
3. With `forceOverwrite`, an invalid avatar preserves the existing image while
   other eligible fields overwrite normally.
4. In normal mode, a stored image makes the incoming avatar ineligible, so even
   an invalid value creates no warning or image telemetry.
5. An image-only rejection returns `success: true`, `updated: false`,
   `fieldsUpdated: []`, and the exact structured warning while still persisting
   `syncedAt`.
6. Warning telemetry contains the approved Coach ID, mode, field, and reason,
   and contains neither the raw URL nor the Coach email.
7. Existing configuration, not-found, valid-image, default-mode, forced-mode,
   and unrelated-field behavior remains intact.

Add focused route coverage under
`src/src/__tests__/api/coaches-circle-import.test.ts` to prove a partial sync
remains HTTP 200 and serializes both the successful field results and warnings.

Add focused component coverage under
`src/src/__tests__/components/coach/circle-sync-button.test.tsx` to prove the
operator sees both the ordinary success result and the nonfatal warning.

No report-rendering or `safeImageSrc` semantic test changes are required. Their
existing suites already pin rejected schemes and the deliberate
arbitrary-HTTPS-host limit.

## Scope Exclusions

- host allowlists or host classification;
- image proxying, downloading, rehosting, or Blob migration;
- changes to `safeImageSrc`;
- production repair, data cleanup, or backfill;
- Coach-logo layout, report chrome, email chrome, or GH #229 rework;
- validation changes to read-only Circle-profile responses;
- schema or migration changes;
- feature flags;
- GH #257 outbox reconciliation.

Host policy remains a separate product decision. Shipping this design must not
be described as preventing outbound requests to arbitrary HTTPS hosts or as
completing that portion of GH #256.

## Rollout and Rollback

This is flagless preventive hardening. It requires no migration, environment
change, scheduler action, backfill, or production data write.

After deployment, verify the application health and inspect only PII-safe
telemetry. No invalid production fixture should be manufactured merely to
exercise the warning.

Rollback is a normal code revert. Existing stored image values require no
cleanup because rejected avatars are never persisted.

## Acceptance Criteria

- Circle sync never persists an avatar that `safeImageSrc` rejects.
- Invalid eligible avatars preserve existing image state in both sync modes.
- Unrelated eligible fields and `syncedAt` continue to persist.
- The manual sync reports success and an actionable nonfatal warning.
- Telemetry is structured, actionable, and excludes raw URL and email data.
- Existing valid arbitrary-host HTTPS avatars remain accepted.
- No host-policy, proxy, migration, backfill, or unrelated rendering behavior is
  introduced.
