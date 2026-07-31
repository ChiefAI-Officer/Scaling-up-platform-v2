# Jeff #65 — stable reminder-link contract

**Status at approval (historical):** PRODUCT CONTRACT LOCKED; design only; not implemented, merged, shipped, or flag-enabled.

**Current status:** Jeff #65 is implemented on the branch and locally verified only; it is not merged, deployed, canaried, globally enabled, or closed. The final correction persists an exact `REJECTED` tombstone and restores a monotonic last-known-deliverable parent fallback without predecessor traversal. Exhausted synchronous quarantine retries dispatch an ID-only durable job. Partial reminder failures visibly warn operators not to retry the whole request. These mechanics do not change the locked product contract below.

**Decision date:** 2026-07-31

**Source:** Jeff July-10 assessment feedback item #65

**Claim:** [Issue #261 comment](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/261#issuecomment-5140577904)

## Problem

The platform currently stores one token hash on each invited respondent's
`AssessmentInvitation`. A successful reminder creates a new token and overwrites
that hash. The new reminder link works, but the original invitation link and every
earlier reminder link stop working.

The earlier Wave A repair narrowed a different failure: it delays the overwrite
until email delivery succeeds, so a failed reminder does not kill the current link.
It did not make multiple successfully delivered links valid together. The July-10
status report therefore correctly left Jeff #65 at **NEEDS INPUT**.

## Locked product contract

> Every original invitation link and every successfully sent reminder link remains
> valid until the underlying invitation becomes unusable through submission,
> explicit revocation, expiry, or campaign closure.

This decision resolves the product question in Jeff #65. It locks observable
behavior, not a storage design.

## Required behavior

1. The original invitation link remains valid after one or more successful
   reminders.
2. Every successfully delivered reminder link remains valid alongside the original
   and the other reminder links.
3. All valid links resolve to the same respondent invitation and therefore the same
   assessment state; they do not create duplicate invitations or submissions.
4. Submission, explicit revocation, expiry, or campaign closure invalidates every
   link for that invitation together.
5. A failed reminder send creates no newly usable link and invalidates none of the
   existing links.
6. Token material remains secret. The contract does not authorize storing raw
   invitation tokens.

## Acceptance examples

- Given an original invite followed by two successful reminders, all three links
  can enter the same active assessment before a terminal condition.
- After that respondent submits, all three links are rejected.
- The same all-links rejection holds after explicit revocation, invitation expiry,
  or campaign closure.
- If a reminder email fails, every previously valid link still works and the
  unsent link is not usable.

## Scope boundaries

**Included:** reminder emails for invited organization-assessment campaigns and the
token exchange needed to honor their links.

**Excluded from Jeff #65 unless separately approved:**

- the manual **Resend** action;
- invitation/reminder wording or visual changes;
- public-assessment access;
- changes to invitation expiry duration;
- recovery of older links that production already invalidated before this behavior
  ships.

The rollout is necessarily prospective: an overwritten historical token hash
cannot be reconstructed from the raw link because raw tokens are intentionally not
stored.

## Design constraints, not implementation choices

The implementation may use additive token records, token versions, or another
reviewed design, provided it satisfies the contract above. It must preserve
one-way token hashing, fail closed at exchange, and invalidate all sibling links
when the invitation reaches a terminal condition.

No implementation approach is approved by this document. The next gate is a narrow
technical design covering schema, exchange lookup, reminder-send atomicity,
migration/backfill behavior, security, concurrency, rollout, and rollback before
feature code begins.
