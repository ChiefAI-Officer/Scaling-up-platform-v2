# 18. Admin offboarding is soft removal with unconditional enforcement and in-place revival

Date: 2026-07-02
Status: Accepted

## Context

Jeff's July-1 item #7 asks to "delete an admin who no longer works for the company." Wave Q
implements it. Three forces shape the design:

1. **Hard delete is impossible in practice.** `User` is the target of non-nullable `createdBy`
   FKs (assessment templates, campaigns, access groups, ownership events). Any admin who ever
   created assessment data cannot be row-deleted — the coach-delete route already documents
   swallowing `P2003` for exactly this reason.
2. **Sessions are JWTs with a 30-day life and no DB re-validation** — a "deleted" admin would
   otherwise keep a working session for up to a month. However, `getUserForApiRoute()` already
   performs a per-request DB read on every API route, so API-side revocation is a free field
   check; only dashboard page loads (JWT-only today) need one added query.
3. **Both invite routes hard-reject any email that has a User row.** A removed admin who leaves
   a tombstone behind would be permanently un-invitable — wrong for a returning employee or
   contractor.

## Decision

- **Removal is soft**: set `User.deletedAt` and delete the target's `AdminInvite` row in one
  transaction (audit-logged). Historical `createdBy` references keep resolving to the tombstone.
- **Enforcement is unconditional — deliberately NOT behind the Wave Q flag.** The flag gates only
  the *capability to remove* (UI + endpoint). Login (`authorize()`), the per-request API liveness
  check (`getApiActor()`), and the dashboard-layout liveness check reject `deletedAt` users
  regardless of flag state. Killing the wave flag stops further removals but never re-admits the
  removed: a kill switch must not un-fire an offboarding. (Wave Q's template-disable enforcement
  follows the same durable rule — adopted wave-wide during co-validation: **flags gate
  capabilities and writes, never the enforcement of persisted admin intent.** Rolling back
  enforcement is a deliberate `git revert`/DB act, not a flag side-effect.)
- **Re-invite revives in place.** `POST /api/admin/invite` treats a soft-deleted user as
  invitable; `accept-invite` clears `deletedAt`, sets the fresh password hash and role on the
  SAME row, and never creates a second User. One identity per email, forever — FK history and
  audit trails stay attached to one user id.
- Guards: ADMIN-only actor, no self-removal, canonical `ADMIN_EMAIL` protected, ADMIN/STAFF
  non-coach targets only.

## Alternatives considered

- **Hard delete when FK-free, soft otherwise** — dual-path complexity, unpredictable behavior
  from the operator's seat.
- **Fully flag-gated enforcement (symmetric with template-disable)** — a kill would re-onboard
  departed staff; rejected as a security regression built into the rollback path.
- **Freeing the email by mangling the tombstone's address** (`+removed-<ts>` suffix) — rewrites
  historical identity; audit rows would show an address that never existed.
- **Permanent retirement of removed emails** — simplest, but blocks legitimate returns.

## Consequences

- A removed admin is cut off within one request/navigation, not at JWT expiry.
- `deletedAt` on `User` is available for future reuse (e.g. coach offboarding hardening — coach
  JWTs also survive 30 days today; out of Wave Q's scope).
- Anyone reading `accept-invite` must know it can MUTATE an existing row, not only create.
- The revived identity inherits its prior audit history — intended, but means "new hire, same
  email" is indistinguishable from "return of the same person" at the identity layer.
