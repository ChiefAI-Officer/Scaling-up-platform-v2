# Member sign-in email is never delivered — dispatch fix plan

> **Status:** investigation complete, fix NOT implemented. This document is a plan, not a change.
> **Raised by:** operator acceptance walkthrough, 2026-09-23. **Severity:** launch blocker.

**Goal:** make the member sign-in email actually arrive, without reopening the address-enumeration
timing channel that the current (broken) dispatch was chosen to close.

**Spec:** [`../specs/2026-09-17-member-portal-v1-design.md`](../specs/2026-09-17-member-portal-v1-design.md) — §10 (enumeration/timing), §11 (delivery lane), §17 (failure behaviour)
**Wireframe:** [`../../wireframes-phase2/wave8/27-member-portal-reports.md`](../../wireframes-phase2/wave8/27-member-portal-reports.md)

---

## 1. What is broken

`sendMemberSignInLink` dispatches its SMTP send as an unawaited floating promise from an HTTP
request handler that returns a 303 milliseconds later:

```ts
// src/src/lib/members/send-sign-in-link.ts:106
void prepared.send().catch(emitSendFailure);
```

On Vercel the function instance may be frozen as soon as the response is returned. The floating
work is a full `transporter.verify()` handshake plus an unpooled `sendMail()` — seconds — so it
does not complete. The repository contains **no `after()` or `waitUntil()`** to hold the
invocation open.

This is the **only** unawaited email dispatch in the codebase. Every other dispatch site awaits —
21 of them: 20 reaching the shared transport via `sendEmailViaSMTP` / `prepared.send()`, plus
`lib/assessments/invite-send.ts:432`, which receives a prepared email through dependency injection.

## 2. Evidence — a controlled experiment that already happened

Production, 2026-09-22, one address, 19 minutes:

| Time (UTC) | Path | Dispatch | Result |
|---|---|---|---|
| 23:12:11 | member sign-in link → address A | **not awaited** | token issued, no email |
| 23:27:37 | Rockefeller invitation → **address B** | **awaited** | `EMAIL_DELIVERY` = `SENT` |
| 23:31:42 | member sign-in link → **address B** | **not awaited** | token issued, no email |

Same deployment, same SMTP server, same recipient address as the 23:27 success. This eliminates
SMTP credentials, transport config, sender domain, recipient rejection and outage. The awaited
lane delivered; the unawaited lane did not, twice.

Supporting facts:

- Both addresses have live `OrgRespondent` rows; both tokens were issued; both
  `MEMBER_LINK_ISSUED` audit rows were written. Everything upstream of dispatch worked.
- `member_sign_in_tokens` contains **2 rows total, ever** — the feature has never delivered an
  email to anyone since launch on 2026-09-21.
- Awaiting is demonstrably viable on this platform: `POST /api/assessment-campaigns/[id]/invite`
  awaits `sendInvitesBatch` **inside a request handler** (`invite/route.ts:261`) and that is the
  path that produced the 23:27 success.

## 3. Why the naive fix is wrong

Deleting `void` and awaiting reopens exactly what §10 closed. The response to
`POST /member/sign-in/request` must be indistinguishable for known, unknown and throttled
addresses. An awaited send makes the eligible path take **seconds** and the ineligible path
**milliseconds** — an enumeration oracle far larger than the single-INSERT residual §10 accepted
and measured.

§11's justification for not awaiting cited a precedent that does not exist:

> *"the same lane as the invitation and reminder emails, dispatched without awaiting (§10)"*

Invitation and reminder emails **are** awaited. Their safety comes from running inside awaited
calls or Inngest durable workers, not from skipping the await. **Correct this sentence in the
spec as part of the fix.**

## 4. Options

### A — Await, accept the timing delta — REJECTED
One-line change, guaranteed dispatch. Reopens a seconds-wide enumeration channel and puts SMTP
latency on a user-facing screen. Rejected: it discards the single property §10 exists to protect.

### B — Await behind a fixed-floor response
Delay every response to a constant floor above the worst eligible path. Closes the channel,
guarantees dispatch. Costs every visitor the floor latency, holds a serverless invocation open,
and reopens the channel whenever SMTP exceeds the floor. §10 already weighed and disliked this.

### C — `after()` — RECOMMENDED as the unblock
Return the response immediately, then run the **awaited** send in a Next.js `after()` callback.
Next 16.1.6 ships `after` as stable from `next/server`; on Vercel it extends the invocation
lifetime specifically for this case.

- Timing envelope is **unchanged** from today — the response is sent before the SMTP work starts,
  so the channel stays as closed as it currently is.
- Smallest diff; touches one function; no schema, no migration, no flag.
- Preserves the **accepted** failure semantics of §11/§17 exactly: a failed send is still
  invisible to the member, whose recovery is still **Send another link**. This fixes the defect
  without renegotiating anything the design already decided.
- Limits to state plainly: not durable (no retry), still bounded by max function duration, and
  `after()` is **unused anywhere in this repository** — so it needs a real production verification
  (§6), not only a unit test. Errors inside the callback must be caught explicitly.

### D — Enqueue to Inngest, resolve eligibility in the worker
Request handler emits an event **for every address** and returns; the worker resolves identity,
issues the token and sends. Durable with retries, and it closes the timing channel *more* fully
than today because the request path performs identical work for every address.
Cost: typed addresses — including unknown ones — land in Inngest event payloads, which is
precisely the disclosure §10 avoided in audit rows. That trade needs an explicit decision.

### E — Dedicated at-least-once outbox
The spec's own stated follow-on (§11, ADR-0030). `AssessmentEmailOutbox` cannot carry these:
it is `submissionId`-scoped and unique on `(submissionId, recipientRole)`. Needs a new table.
Correct end-state; too large for an unblock.

**Recommendation: C now, D or E as the durable follow-on.**

## 5. Mandatory companions — do not ship the dispatch fix alone

### 5.1 Add delivery telemetry
`sendMemberSignInLink` is the only sender that passes no `telemetry` to `prepareEmailViaSMTP`,
so **no `EMAIL_DELIVERY` row is written — SENT or FAILED**. With no log drain configured, the
`member_signin.send_failed` marker is unrecoverable. This is why the failure was silent for two
days and why the operator had no way to self-diagnose.

Pass `telemetry`, keep `redactErrors: true`.

**This discloses nothing new:** telemetry is written only on the eligible path, and an eligible
address is already recorded in `audit_logs` by `MEMBER_LINK_ISSUED` (`performedBy` = the
normalized address for `via: "SELF"`). Ineligible addresses return before any send and stay
unaudited, exactly as §10 requires.

### 5.2 Fix the test that let this through
`src/src/__tests__/lib/members/send-sign-in-link.test.ts` asserts
`expect(send).toHaveBeenCalledTimes(1)` — that the send was **started**. With `void` that passes
while zero emails are delivered; one test even sleeps a tick to let the floating promise settle.

Add an assertion that the dispatch is actually *held*: a `send` mock that never resolves must
prevent completion of whatever the chosen option guarantees (the `after()` callback for C, the
function itself for A/B, the worker step for D). Asserting "called" is not asserting "delivered".

### 5.3 Correct the spec
Fix §11's false premise (§3 above) so the next reader does not re-derive the same wrong
conclusion. Record the chosen option and its durability limits in §11's Delivery lane paragraph.

## 6. Verification — the step that was skipped

Release 1's entry deferred the end-to-end receipt to launch:

> *"the eligible-versus-ineligible live request timing delta and the browser E2E receipt remain
> launch checks rather than fabricated local claims"*

The launch entry then recorded a read-only smoke:

> *"No form was submitted, no Member token was minted, no customer email was sent"*

The deferred check was never performed, and the feature was declared LAUNCHED + GLOBALLY ENABLED
having never sent one email. **No unit test can substitute for this.**

Required before this is called fixed:

1. Request a sign-in link for a live test address in production. **Confirm the email arrives.**
2. Confirm an `EMAIL_DELIVERY` row with status `SENT` now exists for it.
3. Redeem the link and confirm it reaches `/member/home`.
4. Re-request for a known-ineligible address and confirm no email, no `EMAIL_DELIVERY` row, and
   no address-bearing audit row.
5. Record the eligible-vs-ineligible response timing delta — the measurement §10 asked for and
   which has still never been taken.

**Standing rule this earns:** a feature whose only entry point is an email is not launched until
one real email has been received. Read-only smoke cannot verify a send.

## 7. Scope notes

- The coach-initiated send (Release 4, *Send report link*, bulk and per-person) calls the same
  `sendMemberSignInLink` and is broken identically. One fix covers both; verify both.
- The two dead tokens need no cleanup — they expired on their own.
- Out of scope: the 30-day token pruning cron (§7.3), the log drain, and alerting on
  `member_signin.send_failed`. All remain recorded follow-ons.
- Unrelated member-portal observations from the same walkthrough are tracked separately and must
  not be folded into this change.
