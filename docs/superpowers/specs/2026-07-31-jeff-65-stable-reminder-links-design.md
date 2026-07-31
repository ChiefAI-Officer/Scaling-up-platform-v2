# Jeff #65 stable reminder links — technical design

**Status:** Approved in brainstorming; implementation not started

**Date:** 2026-07-31

**Product contract:** `docs/specs/v7.6/20-jeff-65-stable-reminder-links-contract.md`

**Claim:** [Jeff #65 on the shared claim board](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/261#issuecomment-5140577904)

## Goal

Make the original invitation link and every successfully sent bulk-reminder link
remain valid together until their shared invitation becomes unusable through
submission, explicit revocation, expiry, campaign closure, or the existing
soft-delete gate.

The implementation must preserve one Invitation and one assessment state per
respondent. Multiple links are sibling entry doors, not multiple invitations.

## Current behavior

`AssessmentInvitation` stores one unique `tokenHash`. The bulk-reminder route
generates a new token, sends it, then overwrites that column. Exchange hashes the
presented token and looks up the invitation by the same column. A successful
reminder therefore invalidates the original and every earlier reminder link.

Wave A already fixed a narrower problem by moving that overwrite after the email
call. A failed call no longer destroys the prior link, but successful sends still
replace it. Manual **Resend** also rotates the parent hash because the raw token is
not recoverable.

## Approved product decisions

1. Every original and successfully delivered bulk-reminder link shares one
   invitation lifecycle.
2. A successful reminder refreshes the invitation's one shared expiry using the
   existing formula. Every sibling link inherits that deadline.
3. If the email provider reports an uncertain outcome, retain the new token so any
   email that arrives contains a working link.
4. Rollout preserves every currently working parent hash. Previously overwritten
   hashes cannot be reconstructed and are not recoverable.
5. Manual **Resend** is compatible with the feature but is not granted stable-link
   semantics by Jeff #65.
6. No UI, email-copy, or email-appearance change is included.

## Chosen approach

Add an `AssessmentInvitationToken` child table. The parent Invitation remains the
only lifecycle authority; child rows contain independently hashed sibling tokens.

This approach was selected over:

- storing encrypted raw token material and resending one identical link, which
  expands the secret-recovery boundary; and
- current/previous hash columns, which cannot satisfy the all-reminders contract.

## Data model

Add an `AssessmentInvitationToken` model with:

- `id String @id @default(cuid())`;
- `invitationId String`;
- `tokenHash String @unique`;
- `source AssessmentInvitationTokenSource`;
- `deliveryState AssessmentInvitationTokenDeliveryState`;
- `createdAt DateTime @default(now())`;
- `updatedAt DateTime @updatedAt`;
- `deliveryConfirmedAt DateTime?`; and
- an `AssessmentInvitation` relation with cascade-on-delete.

`AssessmentInvitationTokenSource` has:

- `LEGACY_CURRENT` — the parent hash copied during migration or promoted when a
  flag-off invitation first enters the enabled flow;
- `ORIGINAL` — an original invitation issued while the feature is enabled; and
- `REMINDER` — a bulk-reminder token.

`AssessmentInvitationTokenDeliveryState` has:

- `STAGED` — persisted before provider handoff;
- `SENT` — provider acceptance was confirmed; and
- `UNCERTAIN` — provider acceptance could not be proven either way.

All three states are exchangeable. Validity comes from possession of the raw
token plus the parent lifecycle gates, not from delivery telemetry. A token that
the provider definitively did not accept is removed rather than given a fourth
state.

Index `invitationId` for sibling lookup and retain the unique `tokenHash` index for
constant-time exchange. Do not add per-token expiry or terminal-state columns.

Keep `AssessmentInvitation.tokenHash` during this wave as the newest-token
compatibility mirror. It remains unique and is not made nullable.

## Component boundaries

### `stable-invitation-tokens` service

A focused service owns:

- promoting a parent hash to `LEGACY_CURRENT` when missing;
- staging a new child token;
- maintaining the parent compatibility mirror;
- marking a staged token `SENT` or `UNCERTAIN`;
- rolling back a definitively rejected staged token with compare-and-swap safety;
  and
- resolving a token hash through child-first, parent-fallback lookup.

The service accepts a narrow database interface so token behavior can be tested
without exercising route authorization or email rendering.

### Feature-flag helper

A pure `wave-j65-flags` helper owns this precedence:

1. `WAVE_J65_STABLE_LINKS_KILL` forces legacy behavior;
2. `WAVE_J65_STABLE_LINKS_ENABLED` enables globally; otherwise
3. `WAVE_J65_STABLE_LINKS_CANARY` matches an exact campaign alias.

Unset values are off. Truthiness follows the existing assessment-wave convention.
Campaign-alias canarying allows exchange to choose its path before any new database
lookup because the alias is already a route parameter.

### Routes

The bulk-reminder route keeps actor authorization, campaign/recipient selection,
email composition, counters, and audit logging. It delegates token persistence and
delivery-state transitions to the service.

The exchange route keeps parsing, alias protection, lifecycle gates, `VIEWED`
monotonicity, cookie minting, response codes, and no-store headers. Only token
resolution changes under the flag.

The original-invite path dual-writes parent and child tokens while enabled so new
invitations are immediately compatible. Manual **Resend** continues writing only
the parent mirror and is found through the enabled exchange fallback.

## Reminder data flow

1. Authenticate and authorize the actor.
2. Load the campaign, target invitation, respondent, and email inputs.
3. Apply the existing skip rules for submission, revocation, and missing
   invitations.
4. Compute the existing shared expiry:
   `campaign.closeAt ?? now + 90 days`.
5. Generate the raw token in memory and hash it.
6. In one transaction:
   - lock the parent Invitation row and read its current hash and expiry inside
     the transaction;
   - promote that locked parent hash to `LEGACY_CURRENT` if no child row contains
     it;
   - create the new `REMINDER` child in `STAGED`;
   - refresh the parent expiry; and
   - set the parent compatibility mirror to the new hash.
7. Send the email with the raw token.
8. On confirmed provider acceptance, atomically mark the child `SENT`, set
   `deliveryConfirmedAt`, increment `resentCount`, and set `lastResentAt`.
9. On an unclassified or ambiguous provider exception, mark the child
   `UNCERTAIN`, retain the refreshed expiry and parent mirror, report the send as
   uncertain/failed to the operator without logging the token, and leave the link
   exchangeable.
10. Only when a typed provider result proves no acceptance occurred:
    - delete the staged child; and
    - restore the prior parent hash and prior expiry only when the parent mirror
      still equals this failed token hash.

The conditional restore prevents a failed send from clobbering a newer concurrent
reminder. If post-send telemetry or counter persistence fails, the already-staged
token remains exchangeable; the route logs identifiers and state only.

All validation that can fail deterministically occurs before staging. Once
provider handoff begins, an unclassified error is always treated as uncertain,
favoring a working recipient link.

## Exchange data flow

Flag off or killed:

- execute the current parent `tokenHash` lookup and writes byte-for-byte.

Flag on or matching the campaign-alias canary:

1. Hash the submitted raw token.
2. Look up an `AssessmentInvitationToken` by unique hash and include its parent
   invitation and campaign.
3. If no child matches, fall back to the parent unique-hash lookup. This keeps
   manual Resend and flag-transition invitations working.
4. Enforce the existing campaign-alias guard.
5. Apply the existing soft-delete, revocation, shared-expiry, submission,
   campaign-status, open-date, and close-date gates.
6. Preserve the existing `VIEWED` transition and invitation-scoped session.

A missing token or alias mismatch remains an enumeration-safe `404`. A known
invitation that fails a lifecycle gate remains `410`, except for the existing
not-yet-open `425`.

## Original invite and manual Resend compatibility

When the feature is enabled, original invitation creation writes its hash to both
the parent and an `ORIGINAL` child. A retry that reaches provider handoff follows
the same `STAGED`/`SENT`/`UNCERTAIN` rules.

An invitation created while disabled may not have a child row. Its first enabled
reminder promotes the current parent hash before changing the mirror, so its
working original link survives.

Manual **Resend** remains outside Jeff #65:

- its new token is stored only in the parent mirror;
- enabled exchange accepts it through the parent fallback;
- original and bulk-reminder child links remain valid as required; and
- a later manual Resend may replace that manual-Resend link. If a bulk reminder
  runs first, the generic promotion step preserves the current parent hash as
  `LEGACY_CURRENT`, regardless of which send path produced it. That incidental
  preservation does not grant all future manual-Resend links a stable-link
  guarantee.

No email copy, route response shape, UI, or resend counter semantics are changed.

## Migration and backfill

The migration is additive:

1. create the two enums;
2. create `assessment_invitation_tokens`;
3. add its primary key, unique hash index, invitation index, and cascade foreign
   key; and
4. insert one child for every existing `assessment_invitations.tokenHash`.

Backfilled rows use:

- `source = LEGACY_CURRENT`;
- `deliveryState = SENT` when the parent status is `SENT`, `VIEWED`, or
  `SUBMITTED`, otherwise `UNCERTAIN`;
- `createdAt = assessment_invitations.createdAt`;
- `updatedAt = COALESCE(assessment_invitations.sentAt,
  assessment_invitations.createdAt)`; and
- `deliveryConfirmedAt = assessment_invitations.sentAt`.

The existing unique parent hash guarantees a conflict-free backfill. The migration
does not alter, null, or drop the parent column and stores no raw token.

## Concurrency

Each reminder generates an independent random token and unique child row. Sibling
creation does not overwrite another child's hash.

Staging locks the parent Invitation row before capturing the prior mirror and
expiry. This serializes compatibility-mirror changes, so a later failed reminder
restores the actual preceding mirror rather than a stale value read before another
send. Parent expiry and reminder counters then use atomic updates. The
compatibility mirror is last-writer-wins by design because only one newest token
can serve the legacy lookup. Child rows remain authoritative for stable-link
behavior.

A definite-rejection rollback restores the prior parent values only with a
compare-and-swap predicate on the failed new hash. If a newer reminder owns the
mirror, the rollback leaves it untouched.

## Flags, rollout, and rollback

1. Deploy the additive migration and code with all flags off.
2. Verify migration counts: one backfilled child per parent invitation and no
   duplicate hashes.
3. Enable one controlled campaign alias through
   `WAVE_J65_STABLE_LINKS_CANARY`.
4. Send an original invitation and at least two reminders to controlled addresses.
5. Confirm every link exchanges to the same invitation before a terminal state.
6. Exercise the shared expiry and one controlled terminal gate without customer
   data.
7. Confirm the kill switch returns the canary to newest-parent-only behavior and
   reenabling restores child links.
8. Enable `WAVE_J65_STABLE_LINKS_ENABLED` globally, then clear the canary.

Emergency kill performs a code-path rollback only. It temporarily makes only the
newest parent-mirror link usable, matching legacy behavior. Child rows are retained
and become usable again when the feature is reenabled.

Do not run a destructive down-migration. A normal code revert leaves the additive
table dormant. Removal of the legacy parent column, if ever desired, is a separate
future migration after the rollout is proven.

## Security and observability

- Raw tokens exist only in process memory and the recipient's URL fragment.
- Persist, compare, and index SHA-256 hashes only.
- Never include raw tokens or hashes in application logs, audit details, responses,
  analytics, or error-monitoring metadata.
- Logs may include invitation ID, token-row ID, source, delivery state, campaign
  ID, and a non-secret error classification.
- Keep the current generic lookup failures and no-store responses.
- Record confirmed, uncertain, and definite-rejection outcomes without adding a
  customer-facing surface.
- Token rows share the parent's retention and cascade-delete lifecycle; no separate
  cleanup job is introduced.

## Test design

### Flags

- default off;
- global enable;
- exact campaign-alias canary match and mismatch;
- kill precedence over global and canary; and
- existing truthy/falsey string conventions.

### Migration

- enums, columns, indexes, foreign key, and cascade exist;
- one current hash is backfilled per invitation;
- status-to-delivery-state mapping is correct;
- migration safety accepts the additive SQL; and
- no raw-token column exists.

### Token service

- promotion is idempotent;
- original and reminder staging dual-write correctly;
- success marks `SENT`;
- unclassified failure marks `UNCERTAIN` and stays resolvable;
- definite rejection removes only its staged child;
- compare-and-swap rollback cannot clobber a newer mirror;
- interleaved reminders capture the prior mirror under the parent-row lock, so a
  failed newer send restores the last successfully staged predecessor;
- concurrent reminders create distinct valid rows;
- shared expiry and counters update atomically; and
- child-first lookup falls back to the parent.

### Reminder route

- original plus two confirmed reminders produces three exchangeable child hashes;
- all three resolve to one Invitation;
- existing submitted, revoked, missing-invitation, closed-campaign, cap, audit, and
  email-chrome behavior remains;
- flag off preserves the existing parent-only write;
- no raw token is logged on any error; and
- response fields remain compatible.

### Exchange route

- every sibling hash succeeds under the enabled path;
- parent fallback supports manual Resend;
- alias mismatch remains `404`;
- revoked, expired, submitted, closed, close-date-passed, and soft-deleted parents
  reject every sibling;
- not-yet-open remains `425`;
- `VIEWED` remains monotonic;
- flag off and kill use legacy parent-only lookup; and
- reenabling restores sibling lookup without data repair.

### Regression and release gates

- existing reminder, invite-send, exchange, submit, session, and manual-resend
  suites;
- focused Jest for the new service, flags, routes, migration, and concurrency;
- changed-file ESLint;
- changelog freshness;
- migration safety;
- `git diff --check`;
- `CI=true npx next build --turbopack`;
- protected GitHub checks;
- controlled production canary;
- exact-merge-SHA deployment verification; and
- production health with healthy database and safe auth posture.

No visual review is required because the design changes no UI or email appearance.

## Acceptance criteria

Jeff #65 is implemented only when:

1. an original link and at least two successful bulk-reminder links all exchange
   into the same active invitation;
2. all sibling links share the refreshed invitation expiry;
3. submission, revocation, expiry, campaign closure, close-date passage, and
   soft deletion reject every sibling through existing lifecycle gates;
4. an uncertain delivery retains a working link;
5. flag-off and kill behavior match the legacy newest-token-only path;
6. existing active links survive migration and flag enablement;
7. manual Resend remains functional through the parent fallback;
8. no raw token is persisted or logged;
9. the feature is merged, canary-verified, globally enabled, and verified on the
   exact production SHA; and
10. the claim, Notion task, and project source of truth are closed out without
    counting design work as a shipped product outcome.

## Non-goals

- stable semantics for manual **Resend** links;
- recovering historically overwritten tokens;
- changing invitation lifetime policy;
- changing reminder selection, batch caps, counters, copy, HTML, or visual chrome;
- changing public-assessment access;
- adding token-management UI;
- adding a cleanup scheduler;
- replacing SHA-256 token hashing;
- removing the parent `tokenHash` in this wave; or
- implementing a general assessment-email outbox redesign.
