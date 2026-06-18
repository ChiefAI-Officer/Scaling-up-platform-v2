# Wave E — Assessment Report Polish: Ops Runbook

**Spec ref**: v7.6 Spec 17 Wave E (report polish & accuracy — qualitative report renderer for LVA/QSP, score-table/footer cleanup, #21 raw-view labels, #26/#29 content fixes).
**Status**: v1. The assessment `/admin/observability` dashboard (spec-06) is **NOT** extended with render/outbox panels this wave — render-failure signal ships as a structured log only (see §Observability); the dashboard panel is a tracked follow-up.

**Cross-references**:
- [17-jeff-june9-feedback-punchlist](./17-jeff-june9-feedback-punchlist.md)
- [17e-wave-e-report-polish-design](./17e-wave-e-report-polish-design.md) (§11–§12 — the ops/SRE hardening this runbook operationalizes)
- [17e-wave-e-report-polish-implementation-plan](./17e-wave-e-report-polish-implementation-plan.md)
- [17e-lva-source-diff](./17e-lva-source-diff.md) (#29 LVA seed-vs-source diff)
- [17d-ops-runbook](./17d-ops-runbook.md) (Wave-D send infra: flags, kill switch, outbox, Inngest)
- [06-observability](./06-observability.md) (assessment observability dashboard, v1 DB-derived)
- ADR-0010 (assessment reports have two types — scored & qualitative)

This runbook covers the ops surface of Wave E:

- **Staged rollout** (R3-M2) — ship the renderer with all aliases scored/default, then flip qualitative one alias at a time. The `REPORT_CONFIG` map is the lever; there is no feature flag.
- **Rollback** (R3-H1) — why a config flip or promote-previous alone does NOT un-send queued emails; the drainer-first quarantine sequence.
- **Targeted publish rollback** (R3-M4) — non-destructive rollback of a bad #26/#29 content publish.
- **Observability** (R3-M1) — the render/outbox metrics to watch, their labels, and where they surface.
- **Known residuals / follow-ups** — what Wave E deliberately leaves for later.

---

## Background: what Wave E changes (and what it does NOT touch)

Wave E is **rendering + content**, not send infrastructure:

| Item | What it changes | Risk surface |
|------|-----------------|--------------|
| #25 footer cleanup | Removes the visible provenance stamp from all reports (both render paths) | display only; provenance moved to audit/log (R2-L8) |
| #24 Rockefeller score table off | `reportConfigFor("RockHabits").showScoreTable === false` | display only |
| #21 raw-view labels | `/result` API + `AssessmentResultView` show question text | display only |
| #26 QSPv2 label fix | strip "(with 1 decimal)" — DRAFT re-seed + publish | content, forward-only |
| #27/#28/#30/#31 qualitative report | new `QualitativeReport` (on-screen + email twin) for LVA/QSP | **render path — drives email body** |
| #29 LVA content reconcile | corrected DRAFT version, human-gated publish | content, forward-only |

**The single most important operational fact:** report **type** is a *global presentation policy* keyed by `AssessmentTemplate.alias` in `src/src/lib/assessments/report-config.ts` (ADR-0010, R2-M4 rejected version-pinning). Flipping an alias to `qualitative` retroactively re-renders **all** of that template's reports — historical pinned submissions included. That retroactivity is intended (Jeff wants all LVA/QSP reports qualitative), and it is exactly why the rollout is staged and the rollback has a drainer-first step.

Wave E adds **no migration, no new feature flag, and no new Inngest function**. The email-send path it feeds (`AssessmentEmailOutbox` → `quick-assessment-lead-email` drain + `*/3` cron) is unchanged Wave-D/Spec-16 infrastructure — Wave E only changes the **`bodyHtml` content** those rows carry.

---

## 1. Staged rollout (R3-M2)

There is **no feature flag** for Wave E rendering. The `REPORT_CONFIG` map in
`src/src/lib/assessments/report-config.ts` *is* the rollout lever: an alias mapped
to `{ reportType: "qualitative" }` renders qualitative; an alias omitted (or mapped
to `scored`) renders the existing scored anatomy. Unknown alias → `DEFAULT_REPORT_CONFIG`
(scored + score table) → fully back-compatible.

### Rollout principle

Ship the renderer code with **every alias still scored/default**, then flip
qualitative **one alias at a time**, each flip behind its own deploy + smoke test:

```
leadership-vision-alignment  →  qsp-v1  →  qsp-v2
```

LVA first (it is the Jeff-flagged, content-reconciled template with the richest
qualitative anatomy — if the renderer is wrong, LVA surfaces it). Then QSP v1, then
QSP v2 (QSP renders existing content as-is — no #29-style reconcile).

> **NOTE on current code state:** the committed `REPORT_CONFIG` already maps all three
> aliases to `qualitative`. To execute a strictly staged rollout, land the renderer with
> the map reduced to `scored`/omitted for the not-yet-flipped aliases, then add each alias
> back in its own commit + deploy after its smoke passes. If shipping all three at once is
> accepted, treat §1.2 as a single combined smoke gate across LVA + QSP v1 + QSP v2 before
> declaring the wave live.

### 1.1 Pre-flip, per alias

1. Identify **representative historical pinned submissions** for the alias — at least
   one old pinned `TemplateVersion` and one recent one (the renderer reads
   questions+answers from the *pinned* version, so it must tolerate older content
   shapes — R1-M1).
2. Confirm the on-screen/PDF report renders cleanly (sectioned, paginates without an
   unbroken block — #31).
3. If the alias has results-email (#15) or coach-notify (#16) **enabled** on any live
   campaign, confirm the **email twin** renders the answers (not the scored anatomy)
   and the HTML is escaped (no raw `<`/`>`/`{{token}}` from answer text — R2-H3).

### 1.2 Post-deploy smoke checklist (run after EACH alias flip)

| # | Check | Pass criteria |
|---|-------|---------------|
| 1 | Open an old pinned + a recent pinned report for the alias on preview/prod | renders without error; degraded rows skipped, not whole report (R2-M6) |
| 2 | Answered-only rule | blank answers + fully-empty sections omitted; a real `0` is **kept** (R2-M5) |
| 3 | Footer (#25) | submission date · SU logo · "Generated by Scaling Up Platform" — nothing else |
| 4 | Score table absent | no "All Sections" aggregate block for the qualitative alias |
| 5 | Email twin (only if #15/#16 enabled for that alias) | enqueue a test results email; inspect the `AssessmentEmailOutbox.bodyHtml` — answers present, scored anatomy absent, all respondent text HTML-escaped, within size budget |
| 6 | Render-failure log | `grep '[assessment-report] render-failure'` in logs is empty for the smoke submissions |

**Explicit pass/fail:** if ANY check fails, do **not** flip the next alias. If a *bad*
email was enqueued during the smoke, follow §2 (rollback) before reverting the config —
the config flip alone will not un-send a queued row.

---

## 2. Rollback (R3-H1)

**Why config-flip / promote-previous alone is NOT enough for emails.** The email
kill switch (`ASSESSMENT_SENDS_PAUSED`) and the Wave-D feature flags gate **enqueue**,
not the **drain**. `AssessmentEmailOutbox.bodyHtml` is **frozen at enqueue** — once a
qualitative email row is `PENDING`, the drainer (`quick-assessment-lead-email` + its
`*/3 * * * *` cron `quick-assessment-lead-email-cron`) will send exactly that frozen body
regardless of any later config flip or code revert. So to revert a **bad qualitative
EMAIL**, you must stop the drainer and quarantine the queued rows **before** rolling back
config/code.

### 2.1 Correct rollback sequence (ordered — do not reorder)

1. **Pause the drainer FIRST.**
   - Pause the Inngest functions `quick-assessment-lead-email` **and**
     `quick-assessment-lead-email-cron` in the Inngest dashboard (Functions → Pause),
     **and/or**
   - set `ASSESSMENT_SENDS_PAUSED=1` in Vercel env + redeploy.
   - Belt-and-braces: do both. Pausing Inngest stops the drain immediately; the kill
     switch additionally short-circuits any new enqueue and the cron's paused-guard.
   - Verify no rows are mid-send: confirm both functions show **Paused** and there are no
     in-flight runs.

2. **Query the affected PENDING rows.** (Read-only; subagents never run DB commands — this
   is an operator step against the prod DB or via a guarded read script.)
   - Affected rows are `AssessmentEmailOutbox` with `status = 'PENDING'`, created since the
     bad deploy, whose `submissionId` belongs to a campaign whose template alias was the
     bad qualitative alias (join `submission → campaign → template.alias`). Scope by
     `createdAt >= <bad-deploy time>` and `emailType IN ('ASSESSMENT_RESULTS','COACH_COMPLETION')`.

3. **Quarantine / regenerate / discard.**
   - **Discard** (simplest, safe): set the affected `PENDING` rows to `status = 'FAILED'`
     with a `lastError` note (e.g. `"quarantined: wave-e qualitative render rollback <date>"`)
     so the drainer never picks them up. The respondent simply does not get that email
     (there is no respondent report URL to fall back to — ADR-0007/0008).
   - **Regenerate** (if the email is still wanted, with corrected content): discard as
     above, fix the renderer/config, then re-enqueue by re-triggering the submission's
     email path (or a one-off guarded re-enqueue script) so a fresh `bodyHtml` is rendered
     under the fixed code.
   - Either way: **never** leave a bad `PENDING` row that the drainer can send.

4. **THEN do the config / code rollback.**
   - Flip the offending alias back to `scored`/omitted in `report-config.ts` (one-line
     change) **or** Vercel promote-previous. This fixes the **on-screen/PDF** path
     immediately (it is pure rendering) and stops new bad emails from being enqueued.

5. **Un-pause the drainer** once the queue is clean and config is correct (re-enable the
   two Inngest functions; unset `ASSESSMENT_SENDS_PAUSED` + redeploy). The drainer will
   then send only the good rows.

> **On-screen vs email asymmetry:** the on-screen/PDF report is *pure rendering* — a config
> flip or promote-previous reverts it with no queue surgery. Only the **email twin** needs
> the drainer-first quarantine, because its body is frozen at enqueue.

---

## 3. Targeted publish rollback for a bad #26/#29 content publish (R3-M4)

A bad content publish (#26 QSPv2 label fix, or #29 LVA reconcile) is **immediately
selected by new campaigns** — campaign creation pins the **latest published version by
`versionNumber`**. Rollback is **non-destructive** (audited), with PITR only as a last
resort. Do NOT delete the version row.

Order:

1. **Block new-campaign creation for the affected alias** while you remediate (so no
   further campaigns pin the bad version). Operationally: take the template back to a
   non-publishable state for new campaigns, or guard campaign-create for that alias.
   Confirm with an admin before doing this — it is coach-visible.
2. **Identify campaigns pinned to the bad version** since the publish — join
   `AssessmentCampaign → version` filtered to the bad `TemplateVersion.id` and
   `createdAt >= <publish time>`. Existing/in-flight campaigns keep their pinned version
   by design (forward-only), so this set is bounded by "created after the bad publish".
3. **Supersede or retire** (audited — `logAudit`):
   - **Supersede** (preferred): publish a **corrected** DRAFT version (higher
     `versionNumber`) so new campaigns pin the fix. Existing campaigns on the bad version
     stay (forward-only); contact their owners if the content error is material.
   - **Unpublish / retire** the bad version explicitly (so it can no longer be selected),
     and supersede with the corrected one.
4. **PITR (Neon point-in-time restore)** is the **last resort** for catastrophic cases
   only (e.g. a publish corrupted unrelated rows). It is destructive of all writes since
   the restore point — never the first move.

> **Publish discipline:** #26/#29 publishes are **human-gated** (`09b-publish-review-checklist.md`).
> The #29 publish should be bound to the reviewed draft `contentHash` (R2-M7) — see §5
> Known residuals: that hash gate is deferred to the #29 content reconcile.

---

## 4. Observability (R3-M1)

The metrics to watch for Wave E, their labels, and where they surface:

| Metric | Type | Labels | What it tells you |
|--------|------|--------|-------------------|
| `assessment.report.render.failure` | counter | `templateAlias`, `reportType`, `renderPath` (on-screen \| email), `recipientRole`, `emailType` | a report (or email body) fell back to a degraded render — qualitative renderer hit an unexpected answer shape |
| `assessment.report.render.degraded_rows` | counter/gauge | `templateAlias`, `reportType` | how many individual rows were skipped within otherwise-successful renders (R2-M6 graceful degrade) |
| outbox **pending-age** | gauge | `emailType`, `recipientRole` | oldest `PENDING` `AssessmentEmailOutbox` row age — rising age = drainer stalled (see §2) |
| outbox **failed-count** | gauge | `emailType`, `recipientRole` | count of `status = 'FAILED'` rows — spikes after a bad deploy or quarantine |

**Where they surface today (v1):**

- The assessment `/admin/observability` dashboard ([spec-06](./06-observability.md),
  route `src/src/app/api/admin/observability/route.ts`, page
  `src/src/app/(dashboard)/admin/assessments/observability/page.tsx`) is **v1 DB-derived**:
  it returns counters (coaches, orgs, templates, campaigns, submissions, `auditLog.byAction`)
  from live queries. It has **no time-series metric backend and no counter helper** — the
  route itself notes "v1.5 can swap this for a real metrics query."
- **There is therefore no lightweight metric path to increment in Wave E.** The
  render-failure signal ships as a **structured log line** instead (see deliverable C
  below). Building the render/outbox dashboard panels is a **tracked follow-up** for the
  spec-06 v1.5 metrics backend.

**Render-failure log line (the v1 signal):** on any qualitative render fallback, the code
emits a structured log:

- Invited submit (email twin path): `console.error("[assessment-report] render-failure", { templateAlias, reportType, recipientRole, emailType, renderPath: "email", … })`.
- This is greppable in Vercel logs (`[assessment-report] render-failure`) and is the
  paging/alert source until the dashboard panel lands. **Alert** on any non-zero count of
  this log in a rolling window after an alias flip; **alert** on outbox pending-age above
  the drain interval (a few `*/3` cron ticks) or a rising failed-count.

**Provenance in audit/logs (R2-L8):** because #25 removed the visible footer provenance
stamp, traceability moved to logs/audit. The `VIEW_REPORT` audit entry now records
`templateAlias`, `versionId`, `contentHash`, and `reportType` in its `changes` JSON; the
outbox enqueue emits a structured `console.info("[assessment-report] enqueued", { templateAlias, reportType, emailType, recipientRole, versionId })` line (the outbox row has no
metadata column — by design, no migration). Together they let you reconstruct exactly which
renderer produced what was shown/emailed, even without the visible stamp.

---

## 5. Known residuals / follow-ups

These are deliberately **out of Wave E scope** and tracked for later:

1. **R2-M7 — publish-hash gate is deferred to the #29 content reconcile (post-Jeff).**
   Binding the #29 LVA publish to the reviewed draft `contentHash` (so a draft edited after
   review cannot be published by mistake — mirrors Wave-D SEC-H2) ships with the #29 content
   reconcile, which awaits Jeff's authoritative LVA source. Until then, the #29 publish relies
   on the human gate (`09b-publish-review-checklist.md`).

2. **R2-H2 — the outbox drain does not re-check results-email approval at SEND.**
   `drainLeadOutbox` sends the frozen `PENDING` rows without re-checking the per-template
   results-email approval state at send time (co-validate C-M2 residual / R2-H2). This is a
   broader **Wave-D outbox** concern (the drain has no atomic claim either — a cron retry
   overlapping the event-triggered drain can double-send; a correct fix needs a new `SENDING`
   state = a migration, which Wave E forbids). Wave E only changes the email **content**; it
   raises the PII stakes of a duplicate/stale send (qualitative emails carry full answers), so
   this is flagged as a **prioritized near-term follow-up**, not a Wave E deliverable. See
   the open follow-ons in `CLAUDE.md` / `plans/JEFF_MAY6_SPRINT.md`.

3. **R1-M5 / T11-M1 — within-section email byte budget not enforced inside one oversized section.**
   The qualitative email twin applies a per-answer truncation + overall email byte budget
   (R1-M5), but it does **not** enforce a byte budget *within* a single oversized section — a
   pathological section of many max-length free-text answers could still push the email toward
   client clip limits (Gmail ~102 KB). Acceptable for current LVA/QSP content; revisit if a
   template grows a very large single section.

4. **#29 LVA content awaits Jeff.** The LVA content reconcile (financials wording + section
   intros + conditional obstacle follow-ups) is **build-unblocked** (the qualitative renderer
   ships regardless) but the content correction publishes only when Jeff's authoritative source
   is reconciled and reviewed. See [17e-lva-source-diff](./17e-lva-source-diff.md) and
   `LVA-assessment-comparison-for-jeff.docx`.

---

## Quick reference

| Need | Action |
|------|--------|
| Flip an alias to qualitative | edit `REPORT_CONFIG` in `src/src/lib/assessments/report-config.ts` → deploy → run §1.2 smoke |
| Revert a bad on-screen report | flip the alias back / promote-previous (pure rendering — no queue surgery) |
| Revert a bad qualitative EMAIL | §2: pause `quick-assessment-lead-email` + `…-cron` (and/or `ASSESSMENT_SENDS_PAUSED=1`) FIRST → quarantine PENDING rows → THEN config/promote-previous rollback |
| Revert a bad #26/#29 publish | §3: block new-campaign creation for the alias → supersede/retire the version (audited) → PITR last resort |
| See render failures | `grep '[assessment-report] render-failure'` in Vercel logs; dashboard panel is a follow-up |
| Reconstruct what renderer ran | `VIEW_REPORT` audit `changes` (alias/version/hash/reportType) + `[assessment-report] enqueued` log |
