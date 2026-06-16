# Wave D — Assessment Campaign Setup: Ops Runbook

**Spec ref**: v7.6 Spec 17 Wave D (campaign-setup — timing, auto-send, results/coach emails, HTML email).
**Status**: v1. Heavy instrumentation deferred (see §Metrics); the assessment
`/admin/observability` dashboard (spec-06) is NOT extended this wave.
**Cross-references**:
- [17-jeff-june9-feedback-punchlist](./17-jeff-june9-feedback-punchlist.md)
- [17d-wave-d-campaign-setup-design](./17d-wave-d-campaign-setup-design.md)
- [17d-wave-d-campaign-setup-implementation-plan](./17d-wave-d-campaign-setup-implementation-plan.md)
- ADR-0009 (auto-send lifecycle)

This runbook covers the ops surface of Wave D:

- **Launch sequence** — dark-launch → incremental flag flip → live.
- **Rollback** — why bare promote-previous is NOT clean, and the correct sequence.
- **`ASSESSMENT_SENDS_PAUSED` kill switch** — emergency stop.
- **Inngest ops** — inspect, pause, replay the two new functions; stale-claim recovery.
- **Migration note** — what the migration does and why it is safe to deploy dark.
- **Metrics / observability** — DB-counter signals to watch; wiring deferred.

---

## Background: what Wave D adds

Wave D introduces 8 features across 4 operational areas:

| Feature | Flag gate | Notes |
|---------|-----------|-------|
| #1 soft-delete campaigns | none (flagless UI) | DELETE route + list filter + confirm dialog |
| #17 show template on schedule step | none (flagless UI) | read-only display |
| #18 filter-aware Select-All | none (flagless UI) | local UI, no send path |
| #2/#3 timing radio + auto-send | `WAVE_D_AUTO_SEND_ENABLED` | `inviteTiming`, cron + fan-out |
| #15 results email to respondent | `WAVE_D_RESULTS_EMAIL_ENABLED` | approval-gated per template |
| #16 coach-notify on completion | `WAVE_D_COACH_NOTIFY_ENABLED` | per-completion, opt-in |
| #20 full-HTML invitation email | `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` | body replace only; subject separate |

**Global kill switch:** `ASSESSMENT_SENDS_PAUSED` — stops ALL assessment sends regardless
of the per-feature flags (auto-send fan-out aborts + releases its claim; cron short-circuits).

New Inngest functions (registered by default but guarded by flags at runtime):
- **`assessment-invite-fanout`** — durable per-campaign invite delivery (≤25/batch, concurrency=1)
- **`assessment-scheduled-send-cron`** — every-3-min backstop cron (`*/3 * * * *`)

---

## Launch sequence: dark → live

The branch merges dark — every flag defaults OFF (`process.env` unset / empty / `"0"` / `"false"`).
No send of any kind fires unless a flag is explicitly enabled. The Inngest functions are
registered on deploy but the cron short-circuits and the fan-out aborts at pre-flight.

### Step 1 — Flagless UI (safe to enable at any time)

Items #1, #17, and #18 have no flag. They are live from the moment the deployment is
`● Ready`. No env-var change required.

### Step 2 — Auto-send (`WAVE_D_AUTO_SEND_ENABLED`)

```
WAVE_D_AUTO_SEND_ENABLED=1
```

**What it enables:** The `inviteTiming` radio on the campaign wizard becomes functional.
New campaigns with `inviteTiming=IMMEDIATELY` fire the fan-out on create. New campaigns
with `inviteTiming=ON_OPEN` are picked up by the scheduled-send cron when `openAt` arrives.
Legacy (pre-Wave-D) campaigns are unaffected — the migration backfilled their `invitesSentAt`
to `createdAt` so the cron's `invitesSentAt IS NULL` predicate never matches them.

**Enable procedure:**
1. In the Vercel dashboard → Project → Settings → Environment Variables, set
   `WAVE_D_AUTO_SEND_ENABLED=1` for the Production environment.
2. Trigger a redeploy (or promote the Preview deploy to Production).
3. Verify the cron ticks cleanly (Inngest dashboard → Functions →
   `assessment-scheduled-send-cron` → recent runs; expect `dueEmitted: 0` until a
   campaign is created with `inviteTiming=ON_OPEN`).
4. Create a test campaign with `inviteTiming=IMMEDIATELY` and verify the fan-out
   fires and `invitesSentAt` is stamped.

### Step 3 — Results email (`WAVE_D_RESULTS_EMAIL_ENABLED`)

```
WAVE_D_RESULTS_EMAIL_ENABLED=1
```

**What it enables:** The `sendResultsToRespondent` toggle on the campaign wizard becomes
active. When a respondent submits, an `AssessmentEmailOutbox` row is enqueued inside the
submission transaction and drained asynchronously. Gated per-template by
`resultsEmailContentApproved` — if the template's results email is not approved by an
admin, the wizard toggle is disabled and the row is never enqueued.

**Prerequisite:** ensure the relevant assessment template(s) have
`resultsEmailContentApproved = true` (set by admin on the template Metadata tab) before
enabling this flag, otherwise no emails will fire even when the flag is on.

### Step 4 — Coach notify (`WAVE_D_COACH_NOTIFY_ENABLED`)

```
WAVE_D_COACH_NOTIFY_ENABLED=1
```

**What it enables:** The `notifyCoachOnCompletion` toggle on the campaign wizard becomes
active. Per completion (opt-in, default OFF per campaign), the campaign's creating coach
receives a notification email with a link to the respondent's branded report (Spec 13
authz-gated route). No approval gate — this is an internal coach notification.

### Step 5 — HTML email body (`WAVE_D_CUSTOM_HTML_EMAIL_ENABLED`)

```
WAVE_D_CUSTOM_HTML_EMAIL_ENABLED=1
```

**What it enables:** The `invitationBodyHtml` field (campaign wizard Step 4) is respected
as a full-replace HTML body in the invitation email (subject remains the separate
token-allowlisted field). The HTML is DOMPurify-sanitized on write; the fan-out uses
the sanitized stored value at render time. When the field is empty, the existing
markdown body path is used as the fallback — so enabling this flag has no effect on
campaigns that don't supply `invitationBodyHtml`.

### Recommended enabling order

```
1. Deploy (flagless UI live immediately: #1, #17, #18)
2. WAVE_D_AUTO_SEND_ENABLED=1     (after canary validation)
3. WAVE_D_RESULTS_EMAIL_ENABLED=1  (after template approval verified)
4. WAVE_D_COACH_NOTIFY_ENABLED=1
5. WAVE_D_CUSTOM_HTML_EMAIL_ENABLED=1
```

Each step is independently reversible by flipping the flag back to `0` + redeploying.

---

## Rollback

> **IMPORTANT: A bare "promote previous deployment" is NOT a clean rollback.**
>
> The previous deployment's code does not understand the Wave D auto-send lifecycle
> (`inviteTiming`, `invitesSentAt`, `inviteSendStartedAt`, `inviteSendHeartbeatAt`).
> A `DRAFT` + `inviteTiming=ON_OPEN` campaign created under Wave D looks like a
> normal unsent draft to the old code — it won't be swept by any cron, it won't fire,
> and its `invitesSentAt IS NULL` row will sit silently with no recovery path. The
> new columns and partial index (`idx_campaign_due_unsent`) also stay in the DB, so
> the old code reads a schema its Prisma client doesn't fully know (nullable extra
> columns are harmless, but the semantic guarantees are gone).

### Correct rollback sequence

#### Step 1 — Halt new sends immediately (seconds)

Set the kill switch **first** — this causes the fan-out to abort + release its claim at
pre-flight and the cron to short-circuit, stopping all assessment sends without waiting
for a redeploy:

```
ASSESSMENT_SENDS_PAUSED=1
```

In Vercel: Settings → Environment Variables → set for Production → trigger a redeploy,
OR use the Vercel CLI:

```bash
vercel env add ASSESSMENT_SENDS_PAUSED production
# enter: 1
vercel --prod
```

#### Step 2 — Disable Wave D feature flags

Set each Wave D flag to `0` (or remove the variable). This prevents any newly-created
campaign from using the Wave D send path:

```
WAVE_D_AUTO_SEND_ENABLED=0
WAVE_D_RESULTS_EMAIL_ENABLED=0
WAVE_D_COACH_NOTIFY_ENABLED=0
WAVE_D_CUSTOM_HTML_EMAIL_ENABLED=0
```

#### Step 3 — Pause the Inngest functions

In the Inngest dashboard (https://app.inngest.com):

1. Navigate to **Functions** → `assessment-invite-fanout` → **Pause**.
2. Navigate to **Functions** → `assessment-scheduled-send-cron` → **Pause**.

This prevents Inngest from scheduling any new runs of these functions even if a stray
event is emitted.

#### Step 4 — Handle in-flight `ON_OPEN` campaigns

Any campaign created with `inviteTiming=ON_OPEN` whose `invitesSentAt IS NULL` is now
stranded — the paused cron won't pick it up, and a promote-previous won't know to send
it. Before promoting previous, decide:

- **Option A (preferred):** leave these campaigns in place. When Wave D is re-enabled
  (flags flipped back on + Inngest functions unpaused), the cron will pick them up on
  the next tick (the `idx_campaign_due_unsent` predicate will match them if `openAt` has
  passed). No data loss.
- **Option B:** if you must send the invites immediately via the old manual-invite path,
  do so using the existing `/api/assessment-campaigns/[id]/invite` route (synchronous,
  ≤25 recipients). Then set `invitesSentAt` manually via Neon SQL to prevent the cron
  from re-sending after Wave D is re-enabled.

#### Step 5 — Promote previous (if needed)

Only after Steps 1–4 are complete: in Vercel → Deployments → select the last known-good
deployment → **Promote to Production**.

The extra columns (`deletedAt`, `inviteTiming`, etc.) remain in the DB — they are
additive nullable/defaulted and do not break the old Prisma client. The partial index
`idx_campaign_due_unsent` also remains but is inert (no code reads it).

---

## `ASSESSMENT_SENDS_PAUSED` kill switch

**Purpose:** emergency stop for ALL assessment email sends — auto-send, results emails,
and coach notifications — without a code deploy or flag coordination.

**Set it:**
```
ASSESSMENT_SENDS_PAUSED=1
```
Truthy values: `1`, `true`, `TRUE`, `yes`. Falsy (sends proceed normally): unset, empty,
`0`, `false`.

**Effect:**
- The **fan-out** (`assessment-invite-fanout`): at pre-flight, after claiming the
  campaign, sees `isPaused()=true` → aborts and **releases the claim** (`inviteSendStartedAt`
  reset to null). The campaign remains eligible for a future run once the kill switch
  is cleared.
- The **cron** (`assessment-scheduled-send-cron`): at the top of every tick, sees
  `isPaused()=true` → returns `{ dueEmitted: 0, staleRecovered: 0 }` immediately without
  touching the DB.
- Results emails and coach-notify emails: the `waveDResultsEmailEnabled()` and
  `waveDCoachNotifyEnabled()` flag checks gate the enqueue at submit time; the kill
  switch does NOT retroactively drain the outbox — rows already enqueued will be
  delivered when the outbox drainer runs. To also halt outbox delivery, pause the
  Inngest functions as described above.

**Clear it (resume sends):**
```
ASSESSMENT_SENDS_PAUSED=0   # or remove the variable
```
After clearing and redeploying, the cron's next tick will re-emit the fan-out for any
campaign whose claim was released while paused.

---

## Inngest ops

### The two new functions

| Function ID | Trigger | Purpose |
|-------------|---------|---------|
| `assessment-invite-fanout` | Event `assessment/send-invites` | Sends one campaign's invitations in ≤25-recipient durable batches |
| `assessment-scheduled-send-cron` | Cron `*/3 * * * *` | Sweeps due ON_OPEN campaigns + recovers stale claims |

### Inspect recent runs

In the **Inngest dashboard** (https://app.inngest.com):

1. **Functions** → `assessment-invite-fanout` → **Runs** tab → filter by status
   (Completed / Failed / Canceled).
2. Click a run → **Timeline** to see each `step.run` output
   (`claim`, `preflight-load`, `recheck-N`, `heartbeat-N`, `send-batch-N`, `mark-sent`).
3. A run with `{ claimed: false }` means the CAS claim found the campaign already
   claimed/sent/deleted — this is the expected idempotent no-op result.
4. A run with `{ claimed: true, aborted: true, reason: "paused" }` means the kill
   switch was set; the claim was released.
5. A run with `{ claimed: true, aborted: true, reason: "deleted" }` means the campaign
   was soft-deleted while the run was active; the claim is intentionally NOT released
   (the row is tombstoned, no future run should re-send).

### Claim lifecycle fields

| Column | Meaning |
|--------|---------|
| `inviteSendStartedAt` | Set by the CAS claim at the start of a fan-out run. Null = unclaimed. |
| `inviteSendHeartbeatAt` | Updated before every batch in the fan-out. The cron uses this to tell a live (slow) run apart from a dead one. |
| `invitesSentAt` | Set on successful completion. Once set, the CAS claim guard (`invitesSentAt IS NULL`) prevents any future run from re-claiming. |

### Stale-claim recovery

If a fan-out run crashes mid-flight (Inngest timeout, SMTP outage, uncaught error), it
leaves `inviteSendStartedAt` set but `invitesSentAt` null and stops writing
`inviteSendHeartbeatAt`. After `STALE_MS` = **10 minutes** without a heartbeat update,
the cron:

1. Resets `inviteSendStartedAt` → null and clears `inviteSendHeartbeatAt` (the reset
   is guarded on the exact `inviteSendStartedAt` value it read, so a race with a
   just-completing run is safe — count=0 ⇒ skip).
2. Re-emits `assessment/send-invites` for that campaign.
3. The fan-out's per-recipient ledger (`AssessmentInvitation.status`) ensures already-
   delivered invites are not re-sent.

**Manual stale-claim reset (break-glass):** if you need to immediately re-trigger a
stuck campaign without waiting for the next cron tick:

```sql
-- VERIFY first (read-only):
SELECT id, "inviteSendStartedAt", "inviteSendHeartbeatAt", "invitesSentAt"
FROM assessment_campaigns
WHERE id = '<campaign_id>';

-- RESET (only if stale — heartbeat + 10 min old AND invitesSentAt IS NULL):
UPDATE assessment_campaigns
SET "inviteSendStartedAt" = NULL, "inviteSendHeartbeatAt" = NULL
WHERE id = '<campaign_id>'
  AND "invitesSentAt" IS NULL;
```

Then emit the event via the Inngest dashboard (Functions →
`assessment-invite-fanout` → **Invoke** → `{ "campaignId": "<id>" }`), OR wait for
the next cron tick.

### Pause and replay

**Pause a function** (stops new runs from being scheduled without affecting in-flight runs):
Inngest dashboard → Functions → select function → **Pause**.

**Resume**: same location → **Resume**.

**Replay a failed run**: Inngest dashboard → Runs → select the failed run → **Replay**.
The fan-out's CAS claim and per-recipient ledger make replay safe — a replay that finds
the campaign already sent returns `{ claimed: false }` harmlessly.

---

## Migration note

**File:** `prisma/migrations/20260615000000_add_wave_d_campaign_setup/migration.sql`

The migration is **additive only**:

| Change | Type | Safety |
|--------|------|--------|
| `AssessmentInviteTiming` enum | new type | additive |
| 7 new nullable/defaulted columns on `assessment_campaigns` | ALTER TABLE ADD COLUMN | additive; old code reads null/default |
| 3 new nullable columns on `assessment_templates` | ALTER TABLE ADD COLUMN | additive |
| `UPDATE assessment_campaigns SET invitesSentAt = COALESCE(invitesSentAt, createdAt)` | one-time backfill | idempotent; stamps legacy campaigns so the cron never re-sends them |
| `idx_campaign_due_unsent` partial index | new index | read-only performance; no schema constraint |

**Backfill semantics:** every existing (pre-Wave-D) campaign gets
`invitesSentAt = createdAt`. This is the single most important safety property of the
migration: the cron's sweep predicate (`invitesSentAt IS NULL`) will never match a
legacy campaign, so Wave D's auto-send cannot retroactively trigger a mass re-send of
old invitations.

The migration is safe to deploy ahead of the feature code (blue-green compatible — no
old code path reads the new columns, and the `IMMEDIATELY` default for `inviteTiming`
matches the existing behaviour).

---

## Metrics / observability

> **Deferral note (consistent with Wave B/C precedent):** at near-zero volume (dark
> launch into a small coach cohort), wiring these into `/admin/observability` (spec-06)
> is a flagged follow-on, not a launch blocker. The DB-counter signals below are the
> operator's read-only visibility surface at v1.

### Signals to watch (DB-derivable, run against a Neon branch/replica)

**1. Campaigns due-but-unsent (oldest-due age)**

A non-zero age here means the cron is behind or paused. Alert threshold: age > 10 min
(two cron ticks missed).

```sql
SELECT id, "openAt", now() - "openAt" AS age
FROM assessment_campaigns
WHERE "status" IN ('DRAFT', 'ACTIVE')
  AND "openAt" <= now()
  AND "invitesSentAt" IS NULL
  AND "inviteSendStartedAt" IS NULL
  AND "deletedAt" IS NULL
ORDER BY "openAt" ASC
LIMIT 20;
```

**2. Claimed-but-stale (heartbeat older than STALE_MS)**

These are dead fan-out runs the cron should recover. If this number is non-zero and
not decreasing after a cron tick, investigate the Inngest function logs.

```sql
SELECT id, "inviteSendStartedAt", "inviteSendHeartbeatAt",
       now() - COALESCE("inviteSendHeartbeatAt", "inviteSendStartedAt") AS stale_age
FROM assessment_campaigns
WHERE "inviteSendStartedAt" IS NOT NULL
  AND "invitesSentAt" IS NULL
  AND "deletedAt" IS NULL
ORDER BY stale_age DESC
LIMIT 20;
```

**3. `AssessmentEmailOutbox` PENDING age + FAILED count**

The results/coach-notify outbox (reuses the existing submission-outbox pattern). A
large PENDING backlog means the Inngest outbox drainer is behind. FAILED rows need
manual investigation.

```sql
SELECT status, count(*) AS n,
       max(now() - "createdAt") AS oldest_age
FROM "AssessmentEmailOutbox"
GROUP BY status
ORDER BY status;
```

**4. Fan-out failure rate (Inngest — not DB-derivable)**

Monitor via the Inngest dashboard: Functions → `assessment-invite-fanout` → Runs →
filter by **Failed**. A total-send-failure (zero recipients reached) causes the
fan-out to release its claim and throw, triggering Inngest's built-in retry (up to 3
retries). If all 3 retries fail the campaign stays claimable and the next cron tick
will re-emit.

**5. Sends delivered per campaign**

```sql
SELECT "campaignId", count(*) AS total,
       count(*) FILTER (WHERE status IN ('SENT','VIEWED','SUBMITTED')) AS delivered
FROM assessment_invitations
GROUP BY "campaignId"
ORDER BY total DESC
LIMIT 20;
```

### Alert thresholds (for when these are wired into spec-06)

| Signal | Threshold | Action |
|--------|-----------|--------|
| Oldest due-unsent age | > 10 min | Warn — check cron + `ASSESSMENT_SENDS_PAUSED` |
| Claimed-but-stale count | > 0 after 2 cron ticks | Warn — check fan-out failure logs |
| OutboxPENDING oldest age | > 30 min | Warn — check outbox drainer Inngest logs |
| OutboxFAILED count | > 0 | Warn — investigate SMTP errors |
| Fan-out failures (Inngest) | > 3 retries exhausted on any run | Page on-call |

Wiring these counters into the `/admin/observability` dashboard (spec-06 pattern) is
tracked as a follow-on; it is not a Wave D launch blocker.

---

## Quick reference

| Concern | Action |
|---------|--------|
| Stop ALL sends immediately | `ASSESSMENT_SENDS_PAUSED=1` + redeploy |
| Enable auto-send | `WAVE_D_AUTO_SEND_ENABLED=1` + redeploy |
| Enable results emails | `WAVE_D_RESULTS_EMAIL_ENABLED=1` + redeploy (verify template approval first) |
| Enable coach notify | `WAVE_D_COACH_NOTIFY_ENABLED=1` + redeploy |
| Enable HTML email body | `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED=1` + redeploy |
| Rollback (full) | Paused kill switch → flags OFF → pause Inngest fns → handle ON_OPEN rows → promote-previous |
| Stuck fan-out (stale claim) | Wait for next cron tick (auto-recovers in ≤10 min) OR manual SQL reset + Inngest invoke |
| Campaign looks stuck in "Scheduled" | Check `invitesSentAt IS NULL` query #1; verify cron is running; check `ASSESSMENT_SENDS_PAUSED` |
| Results email not firing | Verify `resultsEmailContentApproved = true` on the template + `WAVE_D_RESULTS_EMAIL_ENABLED=1` |
| Inspect a fan-out run | Inngest dashboard → Functions → `assessment-invite-fanout` → Runs → click run → Timeline |
