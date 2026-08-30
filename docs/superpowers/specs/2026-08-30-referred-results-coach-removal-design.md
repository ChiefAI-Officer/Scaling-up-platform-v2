# Referred Results Coach Removal Design

**Status:** Approved in chat on 2026-08-30

**Scope:** GitHub #387 item 8 / handoff F

**Related:** GitHub #261 claim, ADR-0028, Jeff #83 Referred Results design

## Problem

Public assessment takers self-enrol through Coach-attributed links. Test entries and
junk submissions therefore accumulate in the referring Coach's Referred Results
collection, but the Coach cannot remove them.

The current implementation is intentionally read-only. `AssessmentSubmission` has
no deletion field. The `deletedAt: null` filters identified in the handoff apply to
the parent Public Campaign, not to individual submissions. This change must
therefore add an explicit submission-level state rather than reuse a tombstone that
does not exist.

The stored submission is also an assessment-history and lead record. Removing it
from a Coach's working collection must not destroy it or conceal it from
ADMIN/STAFF oversight.

## Outcome

An active referring Coach can remove a submission from their own Referred Results
collection after explicit confirmation. Removal hides the entry from every Coach
surface for that collection while preserving the underlying submission, its
relationships, and ADMIN/STAFF access.

The change adds no restore UI, general submission-management feature, CRM workflow,
or privacy-erasure mechanism.

## Approaches considered

### 1. Purpose-specific Coach-collection tombstone — selected

Add `AssessmentSubmission.referredResultsDeletedAt`. Coach list, search, counts,
filters, export, and report access treat a non-null value as unavailable. Admin
Public Campaign submissions and privileged report access do not filter on it.

This field states the narrow domain effect directly and prevents future code from
mistaking Coach-side removal for global submission deletion.

### 2. Generic `AssessmentSubmission.deletedAt`

A conventional soft-delete field is superficially simpler, but its platform-wide
name implies that every reader should exclude the row. That would conflict with the
requirement that ADMIN/STAFF retain oversight and creates a high risk that future
generic live-record helpers silently hide the submission from privileged users.

### 3. Hard-delete the submission

Hard deletion destroys historical answers, results, attribution, delivery records,
and potential Summary Report provenance. It also turns a Coach cleanup action into
a privacy-erasure operation. This is rejected.

## Domain contract

### Ownership and eligibility

ADR-0028 remains unchanged: the frozen `referringCoachId` identifies the Coach to
whom the public submission belongs, while current active certification determines
whether that Coach may use Referred Results.

Only the authenticated Coach whose `actor.coachId` equals the frozen
`referringCoachId` may remove an entry. ADMIN/STAFF do not use this Coach endpoint;
their oversight access remains read-only and unchanged.

### Meaning of removal

Removal means:

- the entry no longer belongs to the Coach's visible Referred Results collection;
- it no longer contributes to Coach-facing filtered or total counts;
- it cannot be exported by the Coach;
- its authenticated public-submission report is no longer available to that Coach;
- the stored submission and all dependent history remain intact; and
- ADMIN/STAFF continue to list and open the same submission.

This is not privacy-driven taker-data deletion. Such deletion remains a separate,
explicit operation outside this scope.

### Repeat and unauthorized requests

A missing submission, a submission belonging to another Coach, a non-Public
submission, a submission under a deleted Public Campaign, and an already removed
submission all return the same `404` response. This preserves the existing
enumeration-safe report-access convention.

## Data design

Add one nullable field:

```prisma
referredResultsDeletedAt DateTime? // Coach-collection tombstone; ADMIN/STAFF oversight remains intact
```

The migration is additive and leaves every existing row null. No backfill,
destructive update, feature flag, environment variable, or Production-data
operation is required.

The existing `(referringCoachId, submittedAt)` index remains the primary access
path. The additional nullable predicate does not justify a second index for the
current collection size and query shape.

## Mutation API

Add:

```text
DELETE /api/assessments/referred-results/[submissionId]
```

The route follows this order:

1. Resolve the actor with `getApiActor`; return `401` when absent.
2. Apply the existing Referred Results capability gate; return `404` when off.
3. Require a Coach actor with an immutable `coachId`; return `403` otherwise.
4. Validate the path identifier.
5. Apply a fail-closed, Coach-keyed mutation rate limit and return rate headers.
6. In one database transaction:
   - verify that the Coach is currently active and unexpired, returning `403` if
     their current eligibility has lapsed;
   - conditionally update exactly one live, owned Public submission whose
     `referredResultsDeletedAt` is null; and
   - create the `AssessmentSubmission` / `DELETE` audit record.
7. Return `404` when the conditional update matches no row; otherwise return a
   private, no-store success response.

The conditional write, rather than a load followed by an unconstrained update,
closes ownership and repeated-delete races. The audit row is in the same
transaction, so an audit failure rolls back the tombstone.

The audit changes contain only bounded metadata: `kind:
"referred-results-removal"`, `softDelete: true`, and the request identifier. Taker
identity, answers, results, and raw referral emails are not copied into the audit
payload.

## Coach read boundaries

Every Coach-only Referred Results reader must require
`referredResultsDeletedAt: null`:

- ordinary list queries and both total counts;
- search SQL and search cursor resolution;
- CSV export SQL;
- assessment filter-option discovery; and
- public-referral report loading for a Coach actor.

The report loader applies the tombstone condition only to non-privileged actors.
ADMIN/STAFF continue through the existing privileged branch and can open the
preserved report.

Admin Public Campaign submission queries deliberately add no tombstone filter.
Tests will pin that absence so later cleanup cannot accidentally weaken oversight.
No admin badge, restore control, or second admin screen is added.

## Coach experience

Add a `Delete` control beside the existing Details and View report actions in both
desktop rows and mobile cards.

Selecting it opens an explicit confirmation that names the result and explains the
boundary: it will disappear from the Coach's Public Assessments/Referred Results
list, while Scaling Up administrators retain it for oversight. Cancel performs no
request.

While the request is in flight, that entry's Delete control is disabled. On
success, reload the current filtered page so items, counts, cursors, and export
availability come from the server. If removal empties a later page, reload the
preceding page. A failed request leaves the entry visible and presents an inline
retry-safe error; it never pretends the removal succeeded.

Native browser confirmation is sufficient for this small destructive action and
provides keyboard and screen-reader behavior without introducing a second dialog
system.

## Documentation

Update the `Referred Results` entry in `CONTEXT.md`. It must no longer call the
collection wholly read-only or say Coaches cannot delete submissions. It will say
that Coaches may remove entries from their own collection, that the underlying
submission remains intact, and that ADMIN/STAFF oversight is unaffected.

Update `CLAUDE.md` and prepend `plans/CHANGELOG.md` in the same implementation PR,
describing the feature as implemented and locally verified without claiming merge,
deployment, activation, or Production mutation.

No ADR is needed. The decision is a narrow extension of ADR-0028, is represented by
the purpose-specific field and glossary contract, and does not change frozen
referral ownership.

## Testing

Follow TDD with focused regressions for:

1. the migration and Prisma field are additive;
2. unauthenticated, disabled, wrong-role, invalid-ID, rate-limited, and limiter-
   unavailable mutation outcomes;
3. an active Coach can remove only their own live Public submission;
4. another Coach, a non-Public submission, a deleted campaign, an already removed
   submission, and a missing ID all receive `404` without an audit row;
5. the mutation and audit are atomic and carry no taker PII;
6. Coach list/search/count/cursor/filter-option/export paths exclude removed rows;
7. Coach report access treats a removed row as unavailable;
8. ADMIN/STAFF lists and report access still include the row;
9. desktop and mobile Delete controls require confirmation, disable in flight,
   refresh after success, and retain the row with an error after failure; and
10. existing Referred Results, admin oversight, and public-report suites remain
    green.

Final gates from the app root are focused Jest suites, migration safety,
changed-file ESLint, `git diff --check`, and `CI=true npm run build`.

## Out of scope

- Hard deletion or taker privacy erasure.
- Coach or admin restore UI.
- Bulk removal.
- Notes, lead statuses, assignments, or CRM workflows.
- Admin deletion of public submissions.
- Changing Public Campaign lifecycle, report content, email delivery, flags,
  environment variables, or Production data.

## Acceptance

1. A currently eligible referring Coach can remove their own garbage result after
   explicit confirmation.
2. The removed entry disappears from all Coach Referred Results reads and report
   access.
3. Another Coach cannot infer or remove it.
4. ADMIN/STAFF retain the submission and canonical report.
5. The mutation is rate-limited, enumeration-safe, and atomically audited.
6. `CONTEXT.md` accurately describes the new removal and oversight boundary.
