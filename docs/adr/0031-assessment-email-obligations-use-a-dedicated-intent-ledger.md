---
status: accepted
---

# Assessment email obligations use a dedicated delivery-intent ledger

Invited assessment submission now treats each valid, rendered recipient-role
email as an **Email Delivery Intent** that commits atomically with the answers.
The intent ledger is separate from `AssessmentEmailOutbox`: the intent records
the frozen submission-time obligation, while the outbox remains the
ADR-0030 delivery-attempt mechanism. This closes the gap where a
positively-identified pre-database outbox failure could leave a completed
submission with nothing durable to reconcile.

Each intent preserves the exact recipient, subject, rendered HTML,
authorization snapshot, and content provenance. A post-commit event attempts
handoff immediately and a bounded scheduled scan repairs missed events and
transient failures. Before automatic handoff, reconciliation compares current
authoritative facts with the frozen contract. Drift creates a **Delivery
Hold**; it never silently rerenders or substitutes current content. ADMIN and
STAFF may release only the exact reviewed payload or cancel it, both audited.
Every unresolved payload expires 30 days after intent creation.

## Considered options

- **Store a snapshot on `AssessmentSubmission`.** Rejected because a
  submission can create zero, one, or two independent recipient-role
  obligations with separate state, retry, hold, resolution, and retention
  lifecycles.
- **Extend `AssessmentEmailOutbox` with pre-delivery hold states.** Rejected
  because it would mix authorization recovery with ADR-0030's delivery lease
  state machine and make an outbox row mean both “an obligation exists” and “a
  delivery attempt is authorized.”
- **Rerender from current state.** Rejected because recipient, ownership,
  approval, campaign, copy, and renderer inputs can drift after submission.

## Consequences

A completed invited submission is now atomic across answers and every required
Email Delivery Intent; a failed intent write leaves the invitation retryable
and the browser-held answer draft intact. The intent owns the single frozen
payload copy until outbox handoff, cancellation, or absolute expiry, then
atomically purges it and every PII-bearing authorization-snapshot field.
Automation is forward-only: submissions created before the contract lack
trustworthy frozen evidence and remain read-only audit candidates unless a
separate replay or backfill is explicitly approved.

ADR-0030's at-least-once SMTP, lease, retry, uncertainty, and terminal-failure
semantics remain unchanged. Its worker consumes only outbox rows and does not
reinterpret the intent ledger as a new pre-send fence.
