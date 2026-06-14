# Wave B — Workshop Custom-HTML Editor: Ops Runbook

**Spec ref**: v7.6 Spec 17 Wave B (per-workshop `LandingPage.customHtml` editor).
**Status**: v1. Observability + retention land here as runbook SQL; the assessment
`/admin/observability` dashboard (spec-06) is NOT extended this wave (it is a
7-metric, assessment-scoped static page — see [06-observability](./06-observability.md)).
**Cross-references**: [17-jeff-june9-feedback-punchlist](./17-jeff-june9-feedback-punchlist.md),
[17b-wave-b-workshop-html-editor-implementation-plan](./17b-wave-b-workshop-html-editor-implementation-plan.md).

This runbook covers the Task 6 ops surface:

- **R3-HIGH-2** — bulk rollback script (`src/scripts/rollback-workshop-customhtml.mjs`).
- **R3-MED-1** — observability: DB-derived counts + alert thresholds.
- **R3-MED-3** — audit-growth retention policy + monitor query.

---

## Background: how customHtml edits are recorded

Every per-workshop `customHtml` write (save AND restore) goes through
`PUT /api/workshops/[id]/landing-pages/[template]` and writes exactly one
`AuditLog` row **inside the same `db.$transaction`** as the page update:

```
entityType  = "LandingPage"
entityId    = <LandingPage.id>
action      = "UPDATE_CUSTOM_HTML"     // SAME action for save AND restore (Q1/R1-MED-2)
performedBy = <actor email>
timestamp   = now()
changes     = JSON string:
  {
    op: "save" | "restore",
    template,                 // SOLO_LANDING | DUO_LANDING
    previousCustomHtml,       // FULL prior body (value before this write), or null
    prevSha,                  // sha256 of the prior body
    newSha,                   // sha256 of the value AFTER this write
    newCustomHtmlLength,
    actorRole,                // ADMIN | STAFF
    sanitizerStripped         // boolean — sanitizer dropped tags/attrs on this write
  }
```

There is **no schema migration** — `AuditLog.changes` is a Postgres `text`
column, so the full prior body is stored in the JSON (Q1). This is the durable
store the rollback script and the restore action both read.

> **Note on identifier casing in SQL.** Prisma maps the models to **snake_case
> table names** (`AuditLog` → `audit_logs`, `LandingPage` → `landing_pages`) but
> keeps **camelCase column names**. Unquoted identifiers fold to lowercase in
> Postgres, so every column MUST be double-quoted (`"entityType"`, `"changes"`,
> `"customHtml"`, …) or the query errors with "column does not exist". The table
> names are already lowercase, so they need no quoting.
>
> **Note on JSON access in SQL.** `changes` is a plain `text` column (it is NOT a
> `jsonb` column). The queries below cast it (`("changes"::jsonb)`) so Postgres can
> use the `->>` operators. If a legacy row contains non-JSON text the cast will
> error; scope by `"action" = 'UPDATE_CUSTOM_HTML'` (only Wave B writes this action)
> to stay safe. Run these read-only against a replica/branch when possible.

---

## R3-HIGH-2 — Bulk rollback script

**File:** `src/scripts/rollback-workshop-customhtml.mjs`
**Pure core (unit-tested):** `src/src/lib/scripts/rollback-workshop-customhtml-core.ts`
**Tests:** `src/src/__tests__/scripts/rollback-workshop-customhtml.test.ts`

Reverts per-workshop `customHtml` edits made during a bad deployment window
(e.g. a sanitizer/interpolation regression), while preserving legitimate edits
made AFTER the window.

### Safety properties

- **Dry-run by DEFAULT.** Without `--apply` the script writes nothing — it prints
  the plan (pages it would restore, pages it would skip) and exits 0.
- **Prod-host guard.** `--apply` against a Neon/prod `DATABASE_URL` host is
  refused unless `--i-know-this-is-prod` is passed (reuses the `safe-seed.mjs`
  guard verbatim — same decision matrix). Dry-run may connect read-only.
- **Value-compare CAS.** A page is restored only if its CURRENT `customHtml`
  still equals what the LAST in-window write produced (sha-matched to that row's
  `newSha`, then a literal-value `updateMany` CAS). Any page whose value has
  **diverged** (someone edited it after the window) is SKIPPED + reported, never
  clobbered. The CAS is re-checked atomically at apply time.
- **One summary audit row** on `--apply` (`action: "ROLLBACK_CUSTOM_HTML_BATCH"`,
  `entityId: "BATCH"`) recording counts (restored / skipped-diverged / total) +
  the filter used + the restored page ids.

### Rollback target semantics

For each affected page, the TARGET body is the `previousCustomHtml` of the
**earliest** in-window `UPDATE_CUSTOM_HTML` row for that page — i.e. the state
**before the bad window began**. Multiple in-window edits for one page are folded
into a single restore (earliest-previous → CAS against latest-new). This is a
single-level rollback to a window boundary, consistent with the per-page restore
action (Q7).

### Usage

```bash
cd src

# Dry run (default — no writes), whole UPDATE_CUSTOM_HTML history:
node scripts/rollback-workshop-customhtml.mjs

# Window + actor filter, dry run:
node scripts/rollback-workshop-customhtml.mjs \
  --since 2026-06-12T00:00:00Z --until 2026-06-13T00:00:00Z --actor admin@example.com

# Single workshop:
node scripts/rollback-workshop-customhtml.mjs --workshop ws_123

# APPLY (writes). Prod requires the explicit ack:
node scripts/rollback-workshop-customhtml.mjs \
  --since 2026-06-12T00:00:00Z --until 2026-06-13T00:00:00Z --apply --i-know-this-is-prod

# Help:
node scripts/rollback-workshop-customhtml.mjs --help
```

Flags: `--since <ISO>`, `--until <ISO>`, `--actor <email>`, `--workshop <id>`
(any subset), `--apply` (write), `--i-know-this-is-prod` (prod ack), `-h/--help`.

### Recommended procedure

1. Run a **dry run** with the suspected deployment window (and `--actor` if a
   single operator drove the bad saves). Review WILL RESTORE / WILL SKIP lists.
2. Verify the SKIP list is expected (those pages were legitimately edited after
   the window — they are intentionally left alone).
3. Re-run with `--apply --i-know-this-is-prod`. Confirm the summary line + the
   `ROLLBACK_CUSTOM_HTML_BATCH` audit row.
4. Spot-check a restored public page renders the pre-window HTML.

---

## R3-MED-1 — Observability (DB-derived counts + alerts)

These are read-only SQL queries an operator runs against prod (ideally a replica
/ Neon branch) for a 24h or deploy-window rollup. They replace a wired dashboard
for v1; wiring spec-06's `/admin/observability` for these is a deferred follow-up.

Set the window once per session, e.g. `WHERE "timestamp" >= now() - interval '24 hours'`.

### 1. Save vs restore volume (by `op`)

```sql
SELECT (("changes"::jsonb) ->> 'op') AS op, count(*) AS n
FROM audit_logs
WHERE "entityType" = 'LandingPage'
  AND "action" = 'UPDATE_CUSTOM_HTML'
  AND "timestamp" >= now() - interval '24 hours'
GROUP BY 1
ORDER BY 1;
```

### 2. Sanitizer-strip count (writes that dropped tags/attrs)

A spike here means inbound HTML routinely contains disallowed markup — investigate
the source template or a malformed paste.

```sql
SELECT count(*) AS sanitizer_stripped_writes
FROM audit_logs
WHERE "entityType" = 'LandingPage'
  AND "action" = 'UPDATE_CUSTOM_HTML'
  AND (("changes"::jsonb) ->> 'sanitizerStripped') = 'true'
  AND "timestamp" >= now() - interval '24 hours';
```

### 3. Rollback batches run (operator activity)

```sql
SELECT "id", "performedBy", "timestamp",
       (("changes"::jsonb) ->> 'restored')        AS restored,
       (("changes"::jsonb) ->> 'skippedDiverged') AS skipped,
       (("changes"::jsonb) ->> 'totalPages')      AS total
FROM audit_logs
WHERE "entityType" = 'LandingPage'
  AND "action" = 'ROLLBACK_CUSTOM_HTML_BATCH'
  AND "timestamp" >= now() - interval '7 days'
ORDER BY "timestamp" DESC;
```

### 4. # public pages currently rendering a non-empty customHtml (BLAST RADIUS)

The single most important gauge: how many LIVE pages would a bad render affect.

```sql
SELECT count(*) AS live_pages_with_customhtml
FROM landing_pages
WHERE "customHtml" IS NOT NULL
  AND "customHtml" <> ''
  AND "status" = 'PUBLISHED';
```

### Counts that are NOT DB-derivable (app metrics / logs)

The following are **not** persisted to the DB and must come from application
metrics / structured logs (Vercel Analytics / Inngest / stdout — same plumbing
as spec-06). They are listed here so the runbook is complete; emitting them is a
deferred follow-up:

- **403 rate** — non-privileged / flag-off customHtml write attempts (the route
  returns 403/404 and writes no row). Source: route logs / a counter.
- **409 rate** — CAS conflicts (`updateMany` count 0 → "page changed since you
  opened it"). Source: route logs / a counter. (Note: a 409 leaves no audit row,
  so it is invisible to SQL.)
- **Cap rejects** — post-interpolation length-cap 400s (`CUSTOM_HTML_MAX_LENGTH`).
  Source: route logs / a counter.
- **Resolved-fallback failures** — `?resolved=1` builds that returned empty /
  errored. Source: route logs.

### Alert thresholds (when the metrics above are wired)

| Signal | Threshold | Action |
|--------|-----------|--------|
| `UPDATE_CUSTOM_HTML` with `sanitizerStripped=true` | > 5 in 10 min sustained | Warn — inspect inbound HTML / source template |
| 409 CAS-conflict rate | > 10/min sustained 10 min | Warn — concurrent editors or a buggy client |
| 403 customHtml-write rate | > 20/min sustained | Warn — likely a coach/UI trying a blocked path, or flag misconfig |
| Cap-reject (length) rate | > 5/min | Warn — oversized template or interpolation blow-up |
| `ROLLBACK_CUSTOM_HTML_BATCH` written | any | Info — page on-call to confirm it was an intended op |
| `live_pages_with_customhtml` (gauge) | sudden jump > N/day (set N at rollout) | Warn — unexpected adoption / scripted writes |

---

## R3-MED-3 — Audit-growth retention policy + monitor

Storing the FULL prior body in every `UPDATE_CUSTOM_HTML` audit row is required
for restore (Q1) but is unbounded. Three controls:

### 1. Burst control (in place): per-actor rate limit

The route wraps both the save and restore paths in `checkRateLimitAsync` keyed
`customhtml:<actor email>:<workshopId>` (`RateLimits.standard`). This bounds how
fast one actor can append large prior bodies. **This is already shipped** in
Task 2/Task 3 — verify it is present before relying on the retention policy alone.

### 2. Retention policy (documented; automated pruning DEFERRED)

Restore is **single-level** (Q7): a restore reads only the *latest*
`UPDATE_CUSTOM_HTML` row per page. So only the **latest prior body per page** must
stay hot. For every OLDER `UPDATE_CUSTOM_HTML` row for a page, the full
`previousCustomHtml` text can be pruned once it is beyond a retention horizon
(`N` days — start at **90 days**), KEEPING the SHA + the rest of the metadata
(`op`, `template`, `prevSha`, `newSha`, `newCustomHtmlLength`, `actorRole`,
`sanitizerStripped`) so the audit trail (who/when/what-changed) is intact and
restore still works (it never reads a pruned row).

**Pruning rule (prose):** for each `entityId`, keep the FULL body on the most
recent `UPDATE_CUSTOM_HTML` row; for all earlier rows older than `N` days, blank
`changes.previousCustomHtml` (set it to `null` and add `previousCustomHtmlPruned: true`),
preserving every other key. **Never** prune the latest-per-page row regardless of
age (restore depends on it).

> **Automated pruning is DEFERRED.** v1 ships the rate limit (burst control) +
> this documented policy + the monitor query below. A scheduled prune job is a
> follow-up; do NOT run an ad-hoc UPDATE against prod without re-confirming the
> single-level-restore invariant and taking a PITR checkpoint.

Illustrative prune statement (DO NOT run unreviewed; for the future job's design):

```sql
-- For audit purposes only — shows which rows the future prune job would target:
-- every UPDATE_CUSTOM_HTML row that is NOT the latest for its page AND is older
-- than 90 days AND still carries a non-null previousCustomHtml.
WITH ranked AS (
  SELECT "id", "entityId", "timestamp",
         row_number() OVER (PARTITION BY "entityId" ORDER BY "timestamp" DESC) AS rn,
         (("changes"::jsonb) ->> 'previousCustomHtml') AS prev
  FROM audit_logs
  WHERE "entityType" = 'LandingPage'
    AND "action" = 'UPDATE_CUSTOM_HTML'
)
SELECT "id", "entityId", "timestamp"
FROM ranked
WHERE rn > 1
  AND "timestamp" < now() - interval '90 days'
  AND prev IS NOT NULL;
```

### 3. Audit-growth monitor

Track the bytes the customHtml audit trail consumes so the retention horizon can
be tuned before it becomes a backup/PITR problem.

```sql
SELECT
  count(*)                                              AS customhtml_audit_rows,
  pg_size_pretty(sum(octet_length("changes")))          AS total_changes_bytes,
  pg_size_pretty(avg(octet_length("changes"))::bigint)  AS avg_row_bytes,
  pg_size_pretty(max(octet_length("changes"))::bigint)  AS max_row_bytes
FROM audit_logs
WHERE "entityType" = 'LandingPage'
  AND "action" = 'UPDATE_CUSTOM_HTML';
```

**Monitor threshold:** alert (warn) when `total_changes_bytes` for these rows
exceeds a budget set at rollout (suggest **256 MB**) — that is the signal to
schedule the deferred prune job.

---

## Quick reference

| Concern | Surface |
|---------|---------|
| Revert a bad deploy across many pages | `node scripts/rollback-workshop-customhtml.mjs ... --apply --i-know-this-is-prod` |
| What's the blast radius right now? | Observability query #4 (`live_pages_with_customhtml`) |
| Are saves being sanitizer-stripped? | Observability query #2 |
| Is the audit table growing dangerously? | Retention monitor query #3 |
| Burst control on saves | Per-actor `checkRateLimitAsync` in the PUT route (in place) |
