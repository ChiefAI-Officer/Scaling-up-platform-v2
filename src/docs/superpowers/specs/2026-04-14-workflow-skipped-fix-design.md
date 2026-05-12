# Workflow "SKIPPED" Bug Fix — Design Spec

**Date:** 2026-04-14
**Reported by:** Jeff Verdun (Scaling Up CIO)
**Priority:** P0 — blocks all workflow testing and production pre/post-event communications

---

## Problem

Workflow steps are marked **SKIPPED** instead of firing when the step's calculated send time is already in the past. This happens in two scenarios Jeff hit during testing:

1. **Same-day event:** Create a workshop for today at 11pm; add a "12 hours before" step → `sendAt` = 11am today. If it's past 11am when Inngest runs, the step skips.
2. **Rolled-back event:** Create a future event, move the date/time backward so the step's trigger window is already past → step skips.

In production this would also bite any workshop that gets approved close to its event date, where pre-event step windows have already passed.

---

## Root Cause

In `src/src/inngest/functions/execute-workflow.ts` lines 134–152:

```typescript
if (sendAt > new Date()) {
  await step.sleepUntil(`wait-${stepName}`, sendAt); // schedule for future
} else {
  // ← BUG: creates SKIPPED record and skips sending
  await step.run(`skip-${stepName}`, async () => {
    await db.workflowStepExecution.create({
      data: { status: "SKIPPED", errorMessage: "Send time already passed" },
    });
  });
  continue; // jumps over the sending code below
}
```

The `continue` statement bypasses all the email/survey/file sending logic. The step is silently dropped.

---

## Fix

Remove the `else` branch entirely. When `sendAt` is in the past, skip the sleep and fall through to the sending code — the step fires immediately.

```typescript
// Schedule if in the future; if already past, execute immediately (no sleep)
if (sendAt > new Date()) {
  await step.sleepUntil(`wait-${stepName}`, sendAt);
}
// fall-through: sending code executes regardless
```

Add a `console.warn` so there's an observable trace when a step fires immediately due to a past schedule:

```typescript
if (sendAt > new Date()) {
  await step.sleepUntil(`wait-${stepName}`, sendAt);
} else {
  console.warn(
    `[execute-workflow] Step ${workflowStep.id} scheduled for past (${sendAt.toISOString()}). Firing immediately.`
  );
}
```

The sending code (EMAIL_COACH, EMAIL_ATTENDEES, SEND_SURVEY_LINK, SEND_FILE_LINK, etc.) creates a `SENT` execution record — no changes needed there.

---

## What Stays SKIPPED (Intentionally)

The fix only removes the "past timestamp" skip. These existing SKIPPED cases are correct and must not change:

| Location | Reason | Correct behavior |
|----------|--------|-----------------|
| `SEND_SURVEY_LINK` ~line 405 | No survey link could be generated | SKIPPED ✓ |
| `SEND_FILE_LINK` ~line 441 | No files attached to step | SKIPPED ✓ |
| `SEND_FILE_LINK` ~line 472 | Attachment policy blocked delivery | SKIPPED ✓ |
| `EMAIL_ATTENDEES` ~line 570 | Attachment policy blocked (telemetry only, not skip) | keep as-is ✓ |

---

## Scope

**One file changed:** `src/src/inngest/functions/execute-workflow.ts`

**Tests updated:** `src/src/__tests__/inngest/execute-workflow.test.ts` — add cases:
- Past `sendAt` → `sleepUntil` NOT called, email IS sent, status = "SENT"
- Future `sendAt` → `sleepUntil` IS called (existing behavior, verify still passes)

---

## Out of Scope

- `calculateSendDate` correctness (timing precision relative to event start time vs. midnight) — separate concern
- UI retry button for SKIPPED steps — not needed if past steps fire immediately
- Staleness guard (e.g., skip if > 7 days past) — not needed for Jeff's use cases; defer if edge cases arise in production
