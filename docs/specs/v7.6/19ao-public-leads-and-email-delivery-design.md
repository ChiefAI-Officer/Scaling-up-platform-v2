# Spec 19ao — Public leads and assessment-email delivery hardening

> **Status: APPROVED FOR DARK IMPLEMENTATION — shared understanding and the five-surface visual review were approved 2026-07-30; launch remains blocked on the owner-approved retention/deletion policy and §8 gates.**
>
> The confirmed duplicate-delivery bug ships as an independent hotfix. Public-leads implementation is authorized only behind the default-off state contract in `PLAN.md`; no key issuance, backfill apply, canary, or production launch is authorized until every launch gate in §8 clears.

## 1. Problem and evidence

Jeff reported three public-assessment result emails in one coach mailbox, a missing taker email in the report, a generic website CTA instead of the referring coach, and no coach-facing history/export for takers who used the coach's share link.

Read-only production evidence identified the exact submission:

- The Public taker's email equalled the Referring coach's email, so one taker copy plus one coach notification were two legitimate roles in the same mailbox.
- The database contained only one Referring-coach outbox row, but the mailbox received that coach message twice.
- The submission landed immediately before the three-minute cron boundary. The event-triggered and cron drainers can both read the same `PENDING` row, both send it, and only then both mark it `SENT`.
- A deterministic concurrent-drain harness reproduced two successful sends from one row.
- The taker's name/email, frozen result, and submitted answers are already persisted. Admin/STAFF can see name/email/referring-coach/date per Public Campaign, but coaches cannot; the existing admin view does not open the result.
- The on-screen report component supports a coach `mailto:` action, but the public client omits the validated coach from its hand-built report, so it falls back to the Scaling Up coaches directory.

This is one confirmed delivery bug plus a coherent Public-lead product gap, not four unrelated fixes.

## 2. Ubiquitous language and architectural decisions

The canonical terms are defined in `CONTEXT.md`: **Public taker**, **Referring coach**, **Coach share link**, **Coach referral key**, **Legacy referral alias**, **Public lead**, and **Public leads page**.

Architectural decisions:

- ADR-0028 — validated public attribution creates coach-owned durable leads.
- ADR-0029 — Coach share links use opaque referral keys.
- ADR-0030 — assessment-email delivery is at-least-once with an atomic lease.
- ADR-0031 — the Public-lead coach email is a notification, not the report.

## 3. Public-lead ownership model

- A Public lead is the existing completed public submission classified by a nullable stable Referring-coach owner plus attribution snapshot. There is no second lead entity/table.
- Only a server-validated active coach match creates coach ownership. Invalid, malformed, revoked, unknown, or inactive attribution never blocks the Public taker and never reveals coach-account state; the submission remains Scaling Up-owned.
- Ownership is the stable coach account, not a mutable email and not the shared Public Campaign creator.
- A coach email change cannot orphan or transfer existing leads. Coach deactivation removes portal access without deleting ownership; reactivation of the same account restores access.
- Each intentional retake remains a distinct Public lead and frozen Results report. Idempotency suppresses transport/browser retries, not deliberate retakes.
- Admin/STAFF retain oversight of attributed and unattributed public submissions.

## 4. Attribution links and compatibility

- New Coach share links carry a non-secret opaque Coach referral key. The key grants attribution only—never report, portal, or lead access.
- The platform stops generating `?coach=<email>` links when referral keys ship.
- Existing email links resolve through immutable Legacy referral aliases tied to the original coach account. Email reassignment cannot hijack an old link; admins may explicitly revoke an alias.
- Current Coach emails and Legacy referral aliases occupy one database-enforced normalized identity namespace, so concurrent email change, signup, sync, reactivation, or reassignment cannot make one address identify two Coach accounts.
- Legacy compatibility has no arbitrary sunset date. It may be retired only after 90 consecutive days with zero legacy-link submissions and explicit owner approval.
- Successful legacy resolution snapshots the same stable coach owner as a referral key.

## 5. Delivery contract

### 5.1 Recipient matrix

| Recipient | Content |
| --- | --- |
| Public taker | Their full report; taker-facing Learn more and coach-contact/finder actions |
| Referring coach | Concise lead notification: taker name/email, assessment, authenticated View report action |
| Scaling Up team | Exactly one concise central summary for every public completion, attributed or not |

The Referring-coach and Scaling Up notifications never contain the full report.

If the Public taker and Referring coach normalize to the same mailbox, send only the taker copy and record the suppressed coach self-notification. This role collision rule does not replace the shared concurrency fix.

### 5.2 Delivery semantics

- Apply an atomic sending lease to the shared assessment outbox across public and invited recipient roles.
- Event-triggered and cron drains must coalesce so only the lease winner sends a row.
- A stale lease is recoverable.
- Delivery is deliberately at-least-once. The irreducible SMTP-success/process-crash-before-`SENT` gap may create a rare observable duplicate; marking sent before SMTP and silently losing mail is rejected.
- Kill/deletion uses a durable send fence that blocks new claims and waits for active leases before reporting quiescence. An SMTP call already in flight remains a possible audited exposure; the platform does not claim it can revoke a message already handed to the transport.
- Regression coverage must run simultaneous drains and prove one active send, exercise stale-lease recovery, cover all recipient roles, and prove same-mailbox self-notification suppression.

## 6. Reports, contact actions, and coach portal

### 6.1 Results report

- The Public lead opens the same frozen Results report already used elsewhere, through a new Public-submission loader wrapped by the Report access gate.
- Authorization is privileged actor or the exact snapshotted Referring coach. Campaign ownership is irrelevant because one shared Public Campaign serves many coaches.
- Denied/missing access remains enumeration-safe. No durable anonymous Public-taker results URL is introduced.
- Report content remains canonical; final actions follow the reader:
  - Public taker: **Learn more** → `scalingup.com`; **Talk to your coach** → validated coach email; unattributed → **Find a coach**.
  - Referring coach: visible Public-taker email plus **Contact [name]** → taker email.

### 6.2 Public leads page

- Dedicated route under the existing coach **Assessments** area; no new primary-sidebar product area.
- The Assessments landing share-link card shows a lead count plus **View Public leads** and **Copy link**.
- Read-only surface—no CRM stages, notes, tags, assignment, reminders, or outreach tracking.
- Each row shows Public taker name/email, Assessment, submission time, an instrument-aware Result headline, and **View report**.
- Scored instruments show their tier or overall headline; qualitative instruments show **Completed**, never a fabricated score.
- Newest-first server pagination; search by name/email; filter by Assessment and date range.
- CSV export is an asynchronous, resumable job over an immutable authorized manifest, not a request-scoped unbounded stream. With no filters it exports all retained leads.
- CSV fields are exactly Name, Email, Submitted at, and Assessment. Scores and answers remain inside the individually audited report.
- Export generation reauthorizes the actor and policy before every batch, records revocations in an overlay without mutating the original manifest, and exposes the artifact only through a separately authorized audited download.

### 6.3 Admin oversight

- Enhance the existing per-Public-Campaign submissions view with Referring coach / Scaling Up-owned, taker email, and **View report**.
- Do not add a second global admin Public-leads dashboard in this wave.

## 7. Privacy, audit, and abuse boundaries

- Submitted contact data permits one-to-one follow-up about that assessment and its results only.
- Submission does not imply newsletter enrollment, campaign marketing, or unrelated outreach; those require separate affirmative consent outside this scope.
- Ordinary Public-leads list access emits structured access metrics.
- Every View report and CSV export requires a fail-closed durable audit carrying actor, scope/filter fingerprint, export row count where applicable, IP/user agent, and report provenance.
- Coach list/report/export authorization uses the snapshotted stable coach owner, never raw query-string email.
- Launch requires server-side per-IP/per-campaign and per-email throttles, duplicate-attempt suppression, and abuse metrics. CAPTCHA is deferred until measured abuse justifies its completion cost.
- The current public consent copy names recipients but omits retention. Scaling Up must approve the retention period; deletion behavior and all participant-facing wording must match it before launch.

## 8. Historical backfill and launch gates

### 8.1 Backfill

- Backfill historical submissions only from an owner-approved dry-run mapping whose evidence and identity inputs are frozen in the manifest; current email uniqueness alone is not proof of historical ownership.
- Produce an audited migration receipt with matched, unmatched, and ambiguous counts.
- Send no email during backfill.
- Unmatched and ambiguous submissions remain Scaling Up-owned.

### 8.2 Delivery sequence

1. **Immediate hotfix:** shared atomic lease plus same-mailbox coach self-notification suppression; concurrency regression tests.
2. **Dark data/access wave:** referral keys, Legacy referral aliases, stable coach ownership/backfill, Public-lead APIs, authenticated report adapter, audits, and abuse controls behind the additive feature flag + kill switch.
3. **Visually approved UI wave:** report identity/actions, coach notification/taker email presentation, Public leads page, and enhanced admin campaign view.
4. **Launch:** only after retention wording/deletion behavior, abuse controls, migration receipt, visual receipts, targeted tests, ESLint, migration-safety gate, Turbopack build, and production smoke all pass.

Flag OFF must preserve the current feature presentation byte-for-byte; the shared delivery-race hotfix is not rolled back by disabling the Public-leads feature.

The concrete OFF/CANARY/ON/KILL/policy/limiter transition matrix in `PLAN.md` is normative for implementation. After referral keys are issued, parser compatibility is permanent. Policy or limiter failure deliberately and irreversibly forfeits ownership for that request; a healthy post-issuance presentation kill still captures dormant ownership so already-shared links do not silently lose attribution.

## 9. Mandatory visual receipts

Approved in the 2026-07-30 in-session visual review before feature code:

1. Public leads page — desktop.
2. Public leads page — mobile.
3. Public-taker on-screen Results-report identity/conclusion with Learn more and coach contact/finder actions.
4. Referring-coach notification email with taker identity and authenticated View report.
5. Taker report email with the two taker-facing actions.

## 10. Explicit non-goals

- No CRM pipeline or outreach tracking.
- No broad marketing consent.
- No bulk export of scores or answers.
- No anonymous persistent results endpoint.
- No second lead source of truth.
- No automatic ownership transfer when a coach email changes.
- No fixed-date legacy-link shutdown.
- No CAPTCHA without measured abuse.
- No feature implementation before final shared-understanding confirmation and visual approval.
