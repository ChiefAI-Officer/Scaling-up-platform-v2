# Jeff Public Survey Closure Design

**Status:** Approved direction; visually reviewed and hardened through two
Claudex rounds on 2026-07-30 (the external Claude account reached its usage
limit before round 3)

**Source:** Jeff Verdun screenshot, 2026-07-30

**Related work:**

- [Jeff #83 Referred Results design](./2026-07-29-jeff-83-referred-results-design.md)
- [Assessment email duplicate-delivery hotfix](../../specs/v7.6/19ao-assessment-email-duplicate-delivery-hotfix.md)
- [Closure visual](../../specs/v7.6/mockups/jeff-public-survey-closure.html)

## Problem

Jeff reported four outcomes from the public assessment flow:

1. a coach received three result emails for one completion;
2. the result artifact did not visibly identify the taker's email;
3. the bottom of the result should offer both a Scaling Up link and a direct
   coach-contact link; and
4. coaches should be able to see, and ideally export, the people who completed
   assessments through their attributed link.

The first and most of the fourth outcome have already shipped in separate,
reviewed changes. Treating the screenshot as one brand-new subsystem would
duplicate working code and obscure what remains.

## Current-state matrix

| Jeff request | Current production state | Closure delta |
| --- | --- | --- |
| Stop three result emails | Fixed by Spec 19ao: atomic outbox leases prevent event/cron races; same-mailbox coach self-notifications are retained as cancelled audit rows instead of sent | No new worker or scheduling code; preserve regression coverage |
| Show the taker's email in the result | Referred Results already shows it; the canonical on-screen and emailed result artifact does not show a dedicated email identity line | Add the taker's email to scored and qualitative report covers, on screen and in email |
| Learn More + Talk to a Coach links | Scored reports have one coach CTA; qualitative reports do not; no Learn More link exists | Add one consistent two-action next-steps block to scored and qualitative screen/email reports |
| Coach sees attributed public results | Shipped in Jeff #83 with immutable `referringCoachId`, current-eligibility checks, search, filter, pagination, result summary, and authenticated report access | Add a filtered CSV export; do not create a second lead database |

## Outcome

After this closure:

- one completion produces only the legitimate recipient-role deliveries;
- every canonical public result artifact visibly identifies the taker by email;
- every eligible result artifact ends with a Scaling Up destination and, where
  the instrument permits it, a verified coach-contact destination;
- an active signed-in Coach can export the same filtered Referred Results they
  are authorized to browse; and
- no raw answers, mutable CRM state, or unverified referral identity enters the
  export or contact-link paths.

## 1. Report identity

Add `respondentEmail: string | null` to `RespondentReport`.

All canonical construction paths populate it from their already-authorized
source:

- public submit/email builder: `publicTaker.email`;
- immediate public on-screen report: the submitted email already held by the
  client;
- invited/stored report builder: `respondent.email`; and
- authenticated public-referral report loader: the frozen `publicTaker.email`.

The scored and qualitative screen covers render:

```text
Report for: Jordan Lee
Email: jordan@example.com
```

The scored and qualitative email covers render the same identity. Values remain
React-escaped on screen and pass through the existing `escapeHtml` path in
email. A missing/blank email omits the line. When the display-name fallback
equals the email (compared as `name.trim().toLowerCase() === email.trim().toLowerCase()`),
render one dedicated `Email:` line and omit the redundant `Report for:` name
line.

This is a presentation correction. It does not expose the email in a new access
context: every affected artifact already contains the named person's full
assessment result and is served or delivered through its existing gate.

## 2. Result next steps

Add a visually consistent next-steps block directly above the provenance
footer in both scored and qualitative reports.

It contains:

- **Learn More** → `https://scalingup.com/`
- **Talk to a Coach** →
  - `mailto:<verified referring coach email>` when the server resolved and
    persisted a currently valid referral for that submission;
  - otherwise `https://scalingup.com/coaches`.

The block replaces the scored report's single coach CTA rather than duplicating
it. The existing per-instrument `showCoachCta: false` policy still suppresses
only **Talk to a Coach**; **Learn More** remains available.

### Verified identity boundary

The raw `?coach=` query string is never rendered into a link.

For the immediate public report, the submit endpoint returns the normalized
coach email only after the Coach is re-read and confirmed active/unexpired
inside the same transaction that persists ownership and outbox rows. That
in-transaction read is the referral eligibility linearization point. If the
referral is absent, invalid, inactive, expired, deleted, or lost through the
foreign-key conflict retry, ownership and coach delivery are both null and the
response carries `null`.

Idempotent recovery is checked after campaign identity is resolved but before
open/closed submission gates. The existing submission's normalized taker and
canonical stable-key-sorted answers must match the retry. A reused key with
different input or a different campaign returns `409`; a matching lost-response
retry returns the frozen result after a campaign closes. It resolves the
currently active Coach contact by frozen `referringCoachId`; it never trusts a
new request referral or blindly echoes the frozen delivery snapshot.

Authenticated public-referral report loading resolves the Coach's current
email only after immutable-ID authorization and current-certification checks
succeed. Ownership continues to use `referringCoachId`, never email. A changed,
inactive, expired, deleted, or unresolvable Coach produces the coaches-directory
fallback rather than a stale `mailto:`.

### Recipient-role semantics

- On-screen reports and taker-copy emails offer **Talk to a Coach** using the
  currently verified Coach contact or the coaches directory.
- Referring-coach emails do not tell the Coach to email themself. They render
  **Contact the Taker** using the escaped `respondentEmail`, and omit that
  action when the frozen taker email is unavailable.
- Both roles always receive **Learn More**.

Email-safe HTML keeps table layout and inline styles. Screen markup uses the
existing Scaling Up report classes and print stylesheet; no new app-wide visual
system is introduced.

## 3. Referred Results CSV

Add:

```text
GET /api/assessments/referred-results/export.csv
  ?query=<name-or-email>
  &templateId=<id>
```

The endpoint is available only when the existing Jeff #83 Referred Results flag
is enabled.

### Authorization

- authenticate with `getApiActor`;
- require `role === "COACH"` and immutable `coachId`;
- load only submissions whose frozen `referringCoachId` equals that Coach;
- re-check current active, unexpired Coach certification in the domain loader;
- require Public Campaign and `deletedAt = null`; and
- return private, no-store responses.

The endpoint applies the same normalized search and assessment filter as the
visible collection. Pagination cursor is deliberately unsupported: export
means the whole current filtered result set, not the current screen.

### Data contract

The CSV has exactly these columns:

```text
Taker Name
Taker Email
Assessment
Result
Submitted At
```

`Result` is display-safe:

- scored: `<overall score>` with ` — <tier>` when the frozen tier is shown;
- qualitative: `Completed`;
- degraded: `Result unavailable`.

`Submitted At` is ISO-8601 UTC. Missing taker email is an empty cell.

The CSV never contains submission IDs, coach IDs, raw answers, question-level
scores, referral snapshots, or mutable lead-management fields. It uses the
shared `rowsToCsv` utility, including spreadsheet-formula-injection protection
and RFC-style quoting.

### Bounds, rate limiting, and audit

- hard cap: 5,000 matching rows;
- if the bounded query returns a 5,001st row, return `422` with JSON body
  `{ error: "too_many_results", totalCount, maxAllowed: 5000 }` and direction
  to narrow the search or assessment filter;
- after authentication, apply a dedicated, distributed, fail-closed export
  limiter keyed by `referred-results-export:<coachId>` at 10 requests/minute;
  a limiter backend failure returns `503` without querying referral rows;
- persist a strict audit row before emitting the CSV. Unlike the legacy
  best-effort `logAudit`, this write propagates failure and returns `503`
  without the CSV. Audit changes are PII-free:
  `{ kind: "referred-results", requestId, rows, queryApplied,
  templateFilterApplied }`;
- filename: `referred-results-YYYY-MM-DD.csv`; and
- include `Content-Type: text/csv; charset=utf-8` and safe attachment headers.

The export uses one parameterized PostgreSQL statement. Its active-Coach CTE
contains the exact `ACTIVE` and `certificationExpiry > NOW()` eligibility
predicate. The same statement applies frozen ownership, Public/non-deleted
campaign, search, template filter, ordering, `COUNT(*) OVER()`, and
`LIMIT 5001`. It projects only scalar CSV inputs:

```text
taker name
taker email
template name
template alias
overall score
tier label
submitted timestamp
total count
```

It never materializes full `result` JSON, answers, domains, IDs, or 5,001
`PublicReferralListItem` summaries. The over-cap decision and the returned
scalars therefore share one database snapshot, and a concurrent Coach
revocation cannot occur between a separate eligibility check and PII read.

## 4. Coach UI

Add an **Export CSV** link beside the assessment filter and result count.

- The link carries the applied search, not unsubmitted text in the search box.
- It carries the selected assessment filter.
- It never carries pagination cursors.
- It is disabled while loading, after an error, or when the filtered total is
  zero. The unavailable state is a semantic disabled `button`, not a generic
  span or an anchor with a dead `href`.
- Its accessible name is `Export filtered referred results as CSV`.
- Mobile layout stacks it with the filter/count without horizontal overflow.

No notes, lead statuses, assignment, deletion, or campaign-management controls
are added. Referred Results remains read-only.

## 5. Delivery behavior

Spec 19ao is authoritative for duplicate-delivery behavior:

- event and cron drain through the same atomic lease;
- token-guarded completion prevents overlapping claims from both sending;
- taker/coach same-mailbox collision produces one taker delivery and one
  cancelled coach-role row; and
- delivery remains at-least-once, not exactly-once.

This closure does not add a schedule, worker, queue, migration, or cutover.

## 6. Rollout and rollback

- No database migration.
- No new flag.
- CSV inherits the already-launched Jeff #83 flag and kill switch.
- Report identity and next-step presentation ship additively on merge because
  they correct an already-live canonical artifact.
- Rollback is the PR revert; the Jeff #83 kill switch independently removes the
  coach list/export surface if needed.
- No production submissions or emails are generated without separately
  approved recipient addresses. A controlled inbox check remains a safe
  post-deploy acceptance step, not a license to email arbitrary users.

## 7. Acceptance

### Report model and screen

- public, stored invited, and stored public-referral builders preserve the
  taker's normalized email;
- scored and qualitative covers show the email;
- a missing email omits the line without a blank label;
- an email-as-name fallback does not render duplicate identity lines;
- Learn More always targets `https://scalingup.com/`;
- Talk to a Coach uses only the verified current Coach email, otherwise the
  coaches directory; and
- `showCoachCta: false` suppresses Talk to a Coach but not Learn More.

### Email

- scored and qualitative taker and coach copies show the email identity;
- scored and qualitative copies include the two-action next-steps block;
- taker copies contact the verified current Coach; referring-coach copies
  contact the taker instead of the Coach themself;
- all interpolated identity values remain escaped;
- email HTML remains table-based and inline-styled; and
- existing duplicate-delivery and same-mailbox tests stay green.

### CSV and UI

- flag-off returns the existing dark `404`;
- unauthenticated is `401`; non-Coach/missing immutable Coach ID is `403`;
- inactive/expired owner is `403`;
- query and template filters match the list semantics;
- one scalar SQL statement enforces eligibility, filters, count, and the
  5,001-row sentinel in one snapshot;
- 5,000 rows export and a 5,001st row returns `422`;
- CSV escaping neutralizes formula-leading cells;
- export contains only the five approved columns;
- limiter state is Coach-namespaced and backend failure returns `503`;
- strict audit failure returns `503` without a CSV;
- success writes the PII-free audit with a request correlation ID;
- the UI link tracks applied filters and never a cursor; and
- loading/error/empty states cannot trigger an export.

### Required verification

- red-first targeted Jest tests for every public seam above;
- targeted suites green;
- type-check green;
- ESLint green on every changed TypeScript/TSX file;
- migration-safety check green;
- full Jest result compared with the recorded untouched-main `48b68d37`
  baseline at `/tmp/jeff-public-survey-main-baseline-48b68d37.json`;
- `CI=true npx next build --turbopack` green;
- rendered desktop and mobile visual inspected; and
- two-axis code review against fixed point `48b68d37`.

## Non-goals

- rebuilding the shipped outbox lease or Inngest cutover;
- exactly-once SMTP guarantees;
- raw-answer export;
- CRM/HubSpot integration;
- historical referral ownership inference;
- public or bearer-token report URLs;
- changing campaign ownership;
- a general rewrite of public-submit idempotency (this closure adds only the
  input-binding and lost-response recovery required to safely return verified
  referral presentation data);
- adding a recurring monitor or schedule; and
- sending a live test email without approved recipients.
