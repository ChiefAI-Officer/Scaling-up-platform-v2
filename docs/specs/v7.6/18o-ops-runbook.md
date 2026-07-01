# Wave O — Historical Esperto SU-Full Import: Ops Runbook

**Feature:** Coach-operated historical Scaling Up Full import from Esperto exports (Wave O)
**ADR:** ADR-0017 (coach-operated + recompute-not-store), ADR-0006 (imported = CLOSED), ADR-0016 (same-version deltas)
**Plan:** `PLAN.md` (root) — Historical Esperto Import, SU-Full first
**Branch merges as DARK:** `feat/wave-o-esperto-sufull-import` → `main`

---

## Scope

This runbook covers the **SU-Full historical-import surface only** — a coach (or admin) uploading a
batch of Esperto `restricted-individual` exports (+ optional `restricted-aggregate`, ignored) for one
company/round and committing them into one CLOSED, never-emailing `AssessmentCampaign`. It does NOT
cover:

- The existing Members-roster and QSP-v2 results import (unchanged, always-on — this plan does not
  touch that code path).
- Rockefeller / LVA historical import — explicitly out of Wave O scope (their crosswalk stubs stay
  `locked:false`; an import attempt against them is refused and tested).
- The SU-Full live campaign wizard / public quiz / per-respondent report (unchanged; imported
  submissions render through the same report as live ones, labeled "Imported from Esperto (historical)").

---

## 1. Enforced Dark Gates

Two independent gates must ALL pass before a coach or admin can commit a SU-Full historical import.
Failing either refuses the import (no partial write):

| Gate | What it checks | Where enforced |
|------|-----------------|----------------|
| **G1 — Feature flag** | `WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED=1` (or a canary hit), AND `WAVE_O_ESPERTO_SUFULL_IMPORT_KILL` is not set | `wave-o-flags.ts` → `isEspertoSuFullImportEnabled()`; both import routes gate on it before accepting a `restricted-individual` batch |
| **G2 — Crosswalk lock** | `scaling-up-full` crosswalk has `locked: true` (Phase 2 lock-checklist cleared) | `restricted-plan.ts` → `buildRestrictedImportPlan` blocks with `crosswalk-locked` when not locked |

**Both gates are independent safety layers** — flipping the flag before the crosswalk is locked still
refuses every import (`crosswalk-locked` block); locking the crosswalk before the flag flips still
hides the capability entirely (route returns 404/dark, matching Waves M/N).

---

## 2. Flag Reference

| Env var | Purpose | Default |
|---------|---------|---------|
| `WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED` | Global on-switch for SU-Full historical import | OFF (unset) |
| `WAVE_O_ESPERTO_SUFULL_IMPORT_CANARY` | Comma/space-separated **organization ids** or **template ids** to canary | unset |
| `WAVE_O_ESPERTO_SUFULL_IMPORT_KILL` | Kill switch — overrides both global and canary | unset |

**Kill precedence:** `_KILL=1` beats any value of `_ENABLED` or `_CANARY` (`wave-o-flags.test.ts`).

**Canary scope is org-id OR template-id** (not campaign-id, unlike Wave J's group-report canary) —
there is no campaign yet at import time; the canary gates *who may attempt an import*, not *which
report renders*.

---

## 3. Launch Order

> This is a coach-facing WRITE capability (it mints new historical data), not a read-surface toggle —
> treat every step as if a wrong crosswalk mapping is now live and irreversible without a purge (§5).

### Prerequisites (Phase 2 gated)

1. The `scaling-up-full` crosswalk (`crosswalks/scaling-up-full.ts`) passes the PR-reviewed lock
   checklist (the 6 count-tied families Q5/Q7/Q9/Q11 + Q6/Q10, verified against the real Esperto
   source) and ships with `locked: true`.
2. `CI=true npx next build --turbopack` green; the full Phase 1 + Phase 2 test suite green.
3. Run the synthetic observability smoke (§7) — **no canary until the smoke passes.**

### Canary rollout (mandatory — R3-H3)

4. Set `WAVE_O_ESPERTO_SUFULL_IMPORT_CANARY=<pilot-org-id>` for ONE pilot organization (ideally an
   internal/test org, or the first real coach who explicitly agreed to pilot).
5. Redeploy. Monitor the observability queries (§7) for 24–48 hours across a handful of real imports
   from the pilot org.
6. **Success metrics before expanding:** zero `divergent-reimport` surprises the pilot didn't expect,
   zero `entitlement-denied`/`cid-mismatch` incidents, scored reports match the pilot's expectation
   against their own Esperto history (manual spot-check).
7. **Rollback criteria:** any confirmed wrong-question-mapping (a crosswalk bug), any cross-org `cid`
   mismatch, or any silently-wrong score → kill switch (§4) + by-batch quarantine (§5) immediately.
8. Expand the canary allowlist to a small set of coaches/orgs; repeat the monitor window.
9. Only once the canary has run clean at small scale: set `WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED=1`,
   clear `_CANARY`, redeploy. This is the point coach self-serve becomes universal — the grilled "no
   permanent gatekeeping" decision holds, but arrival is gated, not a day-one flip.

**Pre-deploy env preflight:** `vercel env ls --environment=production | grep WAVE_O` — confirm no
`WAVE_O_*` var is already set unexpectedly before the first deploy (dark-merge safety).

---

## 4. Kill Switch

### L1 — Stop new imports (already-imported data stays live)

1. Set `WAVE_O_ESPERTO_SUFULL_IMPORT_KILL=1` on Vercel Production. Redeploy.
2. Effect: every new SU-Full `restricted-individual` batch is refused (dark/404 at the route, matching
   the fully-dark UX). **Already-committed campaigns keep rendering reports and feeding
   longitudinal/cohort views — the kill switch does NOT undo a bad import.** For that, see §5.

### L2 — By-batch quarantine/purge (removes a specific bad import)

Because imported campaigns are CLOSED, isolated (ADR-0006), and carry a self-describing
`externalId = esperto:sufull:<cid>:<slug(roundLabel)>` plus a redacted `importManifest`, a bad round
can be surgically removed without touching any other data:

1. Identify the target campaign by `externalId` (or by org + round label, resolved to the externalId).
2. Run the quarantine script (`scripts/wave-o-quarantine-import.ts` — see §5a) in **dry-run** mode
   first; it reports what would be affected (campaign id, submission count, any longitudinal points
   that reference it) with NO writes.
3. Re-run with `--confirm` to soft-delete: the script sets `deletedAt` on the campaign's submissions
   and the campaign itself is marked hidden (never hard-deleted — consistent with the platform's
   archive-not-delete posture).
4. **Recompute affected date bounds:** if OTHER campaigns for the same org/template have longitudinal
   comparisons that included this round, nothing needs recomputing on THEIR side — the per-respondent
   longitudinal view queries live (non-deleted) submissions at render time, so a soft-deleted round
   simply stops appearing in future renders.
5. Run the post-rollback smoke (§5b).

### 5a. Quarantine script (built — `scripts/wave-o-quarantine-import.ts`)

- Input: `--externalId <id>` or `--org <organizationId> --round-label <label>` (the org's pinned
  `espertoSuFullCid` + the slugified label resolve to the externalId internally).
- **Default is dry-run** — prints campaign id, the externalId with its `cid` segment redacted
  (`esperto:sufull:[redacted]:<slug>`), submission count, respondent count, and the current date
  range, with zero writes. Idempotent: running it again against an already-quarantined campaign
  reports "already quarantined" and exits cleanly.
- `--confirm` performs the soft-delete (`deletedAt`) **and** renames the campaign's `externalId`
  (suffixed with `::quarantined::<timestamp>`) inside one transaction — the rename is required
  because `AssessmentCampaign.externalId`'s partial unique index (`WHERE externalId IS NOT NULL`) is
  NOT scoped by `deletedAt`, so a soft-deleted row would otherwise still block a legitimate re-import
  from reusing the same externalId.
- Never touches `Organization.espertoSuFullCid` — that pin is provenance for the *company*, not the
  *round*, and stays correct after a bad round is purged.

### 5b. Post-rollback smoke (required before declaring quarantine complete)

1. The quarantined campaign no longer appears in the org's campaign list.
2. The quarantined campaign's respondents no longer show that round in per-respondent longitudinal.
3. Any OTHER SU-Full round for the same org (a good prior or later import) still renders correctly —
   quarantine is by-batch, never all-or-nothing.
4. A subsequent import with the SAME round label for the SAME org is treated as a **fresh import**
   (the old externalId's row is soft-deleted, so `assessmentCampaign.findUnique({where:{externalId}})`
   inside `commitRestrictedImport` should either resurrect-or-recreate cleanly — verify this specific
   path in the quarantine script's own test, since a naive implementation could hit a stale unique
   constraint on a soft-deleted row).

---

## 5. Rollback (code-level)

Standard Vercel promote-previous applies if the BUG is in the import code itself (not just bad data
already written): `vercel ls --prod` to find the pre-Wave-O deployment, `vercel promote <id> --prod`.
This is instant and does not require a rebuild. Combine with §4 L2 to also remove any data the buggy
code already wrote before the promote.

---

## 6. Batch Limits & Concurrency

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max files per batch | 300 | A SU-Full leadership-team round is CEO + leadership, not full headcount; generous margin over any realistic team size |
| Max total payload bytes | 5 MB | Each restricted-individual file is a few KB; 300 files comfortably fits |
| Max respondents per batch | 300 (1:1 with files) | Same as above |
| Route `maxDuration` | 60s | Matches the existing `stripe/route.ts` precedent; the commit transaction for 300 respondents is expected to complete in low single-digit seconds — 60s is a safety margin, not the expected runtime |

**Serialization (R3-M1 / closes the R2-M2 race):** `commitRestrictedImport` acquires a Postgres
advisory lock keyed by a hash of the campaign `externalId` as the FIRST statement inside its
transaction (`pg_advisory_xact_lock(hashtext(externalId))`), released automatically at transaction
end. This means two concurrent commit attempts for the **same round** (same org, same cid, same round
label) serialize rather than race — the second waits for the first to fully complete (create or
append) before it even reads `existing`, so its reuse/append/divergent classification always sees a
consistent prior state. Two commits for **different** rounds never contend (different lock keys).

---

## 7. Observability

> Source of truth: **tested log-drain alert queries**, not a DB-count panel — the failure/conflict
> signal (409s, blocks) is more informative than a raw import count.

### Structured markers

Every preview/commit attempt emits `assessment.esperto_import.*` markers (PII-safe: hashes/counts/ids
only, never raw mid/reportid/email/cid):

| Marker | Fields | Emitted on |
|--------|--------|------------|
| `assessment.esperto_import.preview` | `organizationId`, `templateAlias`, `fileCount`, `blockReasons[]`, `skipReasons` (counts by reason), `warningReasons[]`, `flagState` | Every preview call |
| `assessment.esperto_import.commit_attempt` | `organizationId`, `templateAlias`, `fileCount`, `flagState` | Every commit call, before the transaction opens |
| `assessment.esperto_import.commit_result` | `outcome` (`created`/`reused-noop`/`reused-appended`), `submissionsCreated`, `latencyMs` | Every successful commit |
| `assessment.esperto_import.commit_conflict` | `errorCode` (`plan-blocked`/`entitlement-denied`/`org-not-found`/`cid-mismatch`/`low-resolution-batch`/`version-changed-since-preview`/`divergent-reimport`/`externalId-conflict`), `organizationId`, `templateAlias` | Every thrown `RestrictedCommitError` |

### Required alert smokes (gate canary expansion, §3 step 3)

Before the first canary org, run a synthetic smoke proving each alert actually fires:

#### A. Commit conflict rate

```
filter action="assessment.esperto_import.commit_conflict"
| stats count() BY errorCode, bin(10m)
| alert when count(errorCode="divergent-reimport") > 0
```

**Threshold:** any `divergent-reimport` — this is the "someone tried to silently re-import changed
data" signal and should always page, even during canary. Synthetic smoke: commit a batch, then
re-commit the same round with one changed answer in a test env; confirm the alert fires.

#### B. Entitlement / provenance denials

```
filter action="assessment.esperto_import.commit_conflict" AND errorCode IN ("entitlement-denied","cid-mismatch","low-resolution-batch")
| stats count() BY errorCode, bin(10m)
| alert when count() > 3
```

**Threshold:** >3 in 10 min (a single denial is expected UX; a burst suggests a wrong-org workflow
issue or a broken entitlement check). Synthetic smoke: attempt a commit with an uncertified coach
fixture in a test env; confirm one event, then simulate 4 in quick succession and confirm the alert
fires.

#### C. Commit latency p95

```
filter action="assessment.esperto_import.commit_result"
| stats p95(latencyMs) AS p95_latency BY bin(5m)
| alert when p95_latency > 10000
```

**Threshold:** p95 > 10s (well under the 60s `maxDuration`, so an alert here means investigate before
the route actually times out). Synthetic smoke: commit a maximally-sized (300-file) sanitized fixture
batch in a test env; confirm latency appears in the query output.

#### D. Flag-state drift

```
filter action IN ("assessment.esperto_import.preview","assessment.esperto_import.commit_attempt") AND flagState="off"
| stats count() BY bin(10m)
| alert when count() > 0
```

**Threshold:** any event with the flag OFF that still reached this far — should be impossible (the
route should 404 before emitting this marker); a hit means the gate check has a bug. Owner:
engineering lead, launch-blocking if it fires.

---

## 8. Pre-deploy Checks (Dark-merge Safety)

```bash
# Confirm WAVE_O_* is not unexpectedly set in production Vercel env.
vercel env ls --environment=production | grep WAVE_O
# Expected: no output before the first canary step.

# Confirm the SU-Full crosswalk is still locked:false pre-Phase-2 (import must stay refused).
grep -A2 "templateAlias: \"scaling-up-full\"" src/src/lib/assessments/esperto-import/crosswalks/scaling-up-full.ts | grep locked
# Expected (pre-Phase-2-lock): locked: false

# Confirm Rockefeller/LVA stubs remain inaccessible (out of Wave O scope).
grep "locked" src/src/lib/assessments/esperto-import/crosswalks/rockefeller.ts src/src/lib/assessments/esperto-import/crosswalks/lva.ts
# Expected: locked: false for both
```

---

## 9. Two-Level Rollback Summary

| Level | Trigger | Action | Effect |
|-------|---------|--------|--------|
| **L1 — Stop new imports** | A crosswalk/scoring bug is suspected but no bad data confirmed yet | `WAVE_O_ESPERTO_SUFULL_IMPORT_KILL=1` + redeploy | No new SU-Full imports accepted; already-imported campaigns keep rendering |
| **L2 — By-batch quarantine** | A specific import is confirmed bad (wrong mapping, wrong org, corrupted scores) | Run `scripts/wave-o-quarantine-import.ts --externalId <id> --confirm` | That one campaign + its submissions are soft-deleted; every other campaign (including other SU-Full rounds) is untouched |

L1 does not perform L2 — a killed flag with bad data still live requires the explicit quarantine step.

---

## 10. On-call Decision Tree

1. **Alert fires: `divergent-reimport` spike.** → Check §7A. If a coach is legitimately trying to
   correct a prior bad import, this is expected friction (the correction UX is a follow-on, not built
   in Phase 1) — direct them to quarantine-and-reimport (an admin runs §5, then the coach re-imports
   clean). If the spike has no legitimate explanation, treat as a possible crosswalk regression → L1.
2. **Alert fires: entitlement/provenance denial burst (§7B).** → Check whether a specific org/coach is
   affected (likely wrong-org confusion, a UX fix, not a kill-switch event) vs. widespread (possible
   `canCreateCampaign` regression → escalate to engineering, consider L1 as a precaution).
3. **Alert fires: latency p95 (§7C).** → Check batch sizes in the same window; if within the 300-file
   cap, investigate DB contention (the advisory lock, §6, is expected to serialize same-round commits
   — check for lock contention on a HOT single org doing many rounds at once, not a general slowdown).
4. **Manual report: "my imported scores look wrong."** → Do NOT wait for an alert. Pull the specific
   campaign's `importManifest` (redacted — cid/versionId/crosswalkAlias are visible, per-respondent
   PII is not) and the crosswalk's lock-checklist; verify the mapping against the coach's own Esperto
   report for that respondent. If the mapping is wrong → L1 immediately, then L2 for every affected
   campaign (the crosswalk bug likely affected every import since it went live, not just this one).

---

_Last updated: 2026-07-01 — Wave O Phase 1 (dark, no flag flip; crosswalk locked:false)._
