# Spec 19y — Wave Y: Import Observability Panel + Preview/Refusal Signals

**Status:** DRAFT — scoped via the gated pipeline (brainstorm → grill-with-docs → grill-me),
design locked 2026-07-07. Awaiting `/co-validate` (Codex mandatory) + user greenlight before any
code. This is the last buildable **P8** slice with no external dependency — it surfaces the Wave V
import-alerting signals in-app and closes the confirmed preview/refusal signal gap.

Kill = revert-commit (Wave Y is additive: new AuditLog rows + a read-only panel; no schema change,
no migration, **no flag**). Signal WRITES are **UNCONDITIONAL + fail-soft** — matching Wave V's own
commit-signal writes (Wave Q rule: flags gate capability, never persisted data). The panel read is
flagless (admin-gated only). **No ADR** — fully additive/revertable; rationale lives here + in code
comments. **Consolidated after `/co-validate` 2026-07-07 (Codex + independent Claude review) — see §6.**

---

## §0 Ground truth (verified in code 2026-07-07)

- **Wave V durable signals** (`esperto-import/alert-signals.ts`): `entityType = "assessment_import"`;
  actions `import_commit_result` (`{ organizationId, templateAlias, outcome, submissionsCreated?,
  latencyMs }`) and `import_commit_conflict` (`{ errorCode, organizationId, templateAlias }`). Written
  **UNCONDITIONALLY, fail-soft** from BOTH import routes' commit try/catch (public `route.ts:936/951/967`,
  admin `route.ts:927/942/958`) via `recordCommitResultSignal` / `recordCommitConflictSignal`. PII
  contract (`alert-signals.ts:25-28`): rows carry ONLY orgId, templateAlias, counts, error codes,
  latencies — NEVER raw mid/reportid/cid/email/name.
- **The alert cron** (`inngest/functions/esperto-import-alert-cron.ts`, `cron: "*/10 * * * *"`) runs
  `runImportAlertSweep` (`alert-signals.ts:298`): reads the latest checkpoint row → span query
  `findMany({ where: { entityType: "assessment_import", timestamp: { gt: cursor, lte: now } },
  orderBy: { timestamp: "asc" }, take: 1000 })` → `parseSignals` (**filters to the two commit actions,
  discards everything else**, `alert-signals.ts:187-190`) → `evaluateAlertConditions` → writes a NEW
  checkpoint row **BEFORE** any send. Checkpoint row: `entityType = "assessment_import_alert_cron"`,
  `action = "run"`, `entityId = "singleton"`, `changes = { processedThrough, spanStart, evaluated,
  fired: AlertConditionCode[] }`. Flag-gated: `isImportAlertingEnabled()` off ⇒ returns
  `{ skipped: "flag-off" }` **before writing any checkpoint**.
- **Alert conditions** (`evaluateAlertConditions`, span-calibrated to one 10-min sweep):
  A `divergent-reimport` (any conflict, always fire) · A2 `unexpected-error` (any, always) ·
  B `denial-burst` (`> 3` conflicts whose code ∈ `{entitlement-denied, cid-mismatch,
  low-resolution-batch}`) · C `latency-p95` (p95 of commit `latencyMs` `> 10_000ms`). D flag-drift is
  **NOT** in-app (log-drain only).
- **The DENIAL_CODES all originate INSIDE `restricted-commit.ts`** (`low-resolution-batch:379`,
  `entitlement-denied:401` [the R2-M1 in-txn re-check], `cid-mismatch:424`) → they are **commit-path
  `import_commit_conflict` rows only.** Wave Y does **not** touch them; condition-B inputs are
  unaffected.
- **Confirmed gaps Wave Y fills:**
  1. **No in-app view** — signals only reach email; the observability page has no import panel.
  2. **Preview path persists nothing** — `mode === "preview"` returns `plan.blocks`/`plan.skips` in
     the HTTP body + a console-only `emitEspertoImportMetric("preview", …)` marker
     (`restricted-route-helpers.ts` — `console.info`, no DB write). Public `route.ts:837`, admin `:834`.
  3. **Route-level 4xx refusals persist nothing on either path** — the pre-commit gates
     short-circuit before the commit try/catch. Verified gates (public `route.ts:695-793`):
     org-not-found/access `404` (steps 1-2, identical body — deliberate existence-non-leak),
     context-resolve `422/400` (step 3), entitlement `403` (step 4, `canCreateCampaign`),
     too-many-files `413` (step 5), file-parse `400` (step 5), shape/mat `400` (step 5b).
- **Existing dashboard pattern:** `admin/assessments/observability/page.tsx` (admin/STAFF gate) →
  `<ObservabilityDashboard/>` (client) → `fetch("/api/admin/observability")` (admin GET, one Prisma
  `Promise.all`) → `Section`/`Stat` grids + a "by action" table. Wave F `groupReports` (counts a
  specific AuditLog action in time windows) is the read precedent.
- **AuditLog** (`prisma/schema.prisma:584-599`): `changes` is a **`String`** (JSON.parse in app; no
  native JSON filter), no `organizationId` column (org stored in `entityId`), indexes
  `@@index([entityType, entityId])` + `@@index([timestamp])`. A time-windowed `entityType`-filtered
  scan uses the `timestamp` index then filters — fine at current volume.

## §1 Decision log (user-confirmed 2026-07-07 via grill-with-docs + grill-me)

- **D1 — Scope: full slice.** Y-1 in-app panel over the Wave V commit signals + Y-2a durable
  preview-path block/skip signals + Y-2b durable route-level refusal signals. (scoping Q1)
- **D2 — Panel agrees with alerts by showing the cron's ACTUAL decisions** (its checkpoint rows),
  not a re-computation. This is the strongest form of the scoping-Q2 intent ("panel and email agree
  by construction") — the panel renders what the cron literally decided, zero re-evaluation.
  (scoping Q2, refined by co-validate: the live re-evaluation is dropped — see §6.)
- **D3 — Preview signals persist only on `plan.blocks.length > 0` OR `plan.skips.length > 0`.**
  Clean previews write nothing (no row spam from authoring iteration). (scoping Q3)
- **D4 — Panel-only; the alert cron is unchanged.** No new email conditions. (scoping Q4)
- **D5 — Separate `entityType: "assessment_import_activity"`** (actions `preview_result` + `refused`)
  for the new signals. The cron's span query is `entityType:"assessment_import"`-scoped, so the new
  rows are **structurally invisible** to it — "Wave Y cannot affect Wave V alerting" is a query-level
  fact, not a `parseSignals`-filter accident, and the 1000-row `take` budget can't be crowded.
  (grill-with-docs Q1)
- **D6 — Panel alert-status = the cron's own checkpoint decisions ONLY (no re-evaluation).**
  (grill-with-docs Q2, refined by co-validate — live indicator dropped, §6)
  - **Actual alert history + cron health** from the `assessment_import_alert_cron` checkpoint rows:
    **per-code firing counts + most-recent-fired time** over 24h/7d (not a boolean union), span
    bounds, last-swept, sweeps count.
  - **24h/7d volume rollups** (results by outcome, conflicts by code, preview/refusal counts, and a
    **reference** latency p95) as plain numbers. The reference p95 is rendered with **NO threshold
    beside it** — condition-C is a per-10-min-span verdict, so a 24h p95 must never be presented as
    the alert trigger (it would smooth away a bad span).
  - **No live re-evaluation.** `alert-signals.ts` (the cron, its writers, `parseSignals`,
    `evaluateAlertConditions`) is neither imported nor modified by Wave Y — the panel reads rows only.
- **D7 — Refusal emission via a shared `refuse()` helper** in `restricted-route-helpers.ts`
  centralizing "every refusal emits a signal." (grill-with-docs Q3)
- **D8 — Cron-health disambiguation via the flag.** The panel API returns `alertingEnabled`
  (`isImportAlertingEnabled()`); the health tile shows: flag OFF → "Alerting disabled" (neutral);
  flag ON + last checkpoint ≤ 30 min → "Healthy"; flag ON + > 30 min or none → "⚠️ cron may be down"
  (30 min = 3 missed 10-min ticks). Kills the false-alarm-when-intentionally-off. (grill-with-docs Q4)
- **D9 — Flag/schema posture (REVISED by co-validate, §6):** signal WRITES are **UNCONDITIONAL +
  fail-soft, NO flag.** `WAVE_V_IMPORT_ALERTING_ENABLED` gates the *cron*, not durability — gating
  writes behind it would silently drop preview/refusal rows whenever alerting is off (Codex C1 +
  independent [HIGH]). This matches Wave V's own commit-signal writes (Wave Q rule: flags gate
  capability, never persisted data). The per-instrument import flag's step-1 404 already suppresses
  any preview/refusal row when import capability is off, so nothing is over-captured. Panel read
  flagless. **No schema change / no composite index** (existing `timestamp` index suffices; a
  non-concurrent `CREATE INDEX` on `audit_logs` would take a prod lock on merge). Kill = revert-commit.
  (supersedes grill-with-docs closing Q1)
- **D10 — No ADR** (additive/revertable). (grill-with-docs closing Q2)
- **D11 — Update the observability page copy** to note import observability is now in-app, keeping
  the honest v1/v1.5 caveat for the other 7 metrics that still aren't wired. (grill-with-docs closing Q3)
- **D12 — Context-resolve refusals: instrument the operator-meaningful ones only.** `refused` codes
  `template-not-published` + `crosswalk-incompatible` (the step-3 422/400 domain outcomes) are
  instrumented so a depublished-template / broken-crosswalk outage is loud in the panel; genuine
  system 500s stay uninstrumented (log-drain / condition-D). (grill-me Q1)
- **D13 — The route-level entitlement refusal reuses the string `entitlement-denied`**, disambiguated
  by entityType/action and rendered in a separate panel section ("Route refusals" vs "Commit conflicts
  (feed alerts)"). One vocabulary word; the section tells the operator which gate fired. (grill-me Q2)
- **D14 — Signal boundaries (no double-count):** `preview_result` = preview branch only; commit-path
  respondent skips stay folded into Wave V `commit_result` (created vs `manifest.skippedCount`),
  never re-emitted; commit-path plan-blocks stay `commit_conflict` `plan-blocked`; route pre-commit
  gates = `refused` (fire on BOTH modes, tagged `mode:"preview"|"commit"`). A single request emits at
  most one of {`refused`, `preview_result`, `commit_result`/`commit_conflict`}. Existing Wave-V commit
  rows render in the panel; the new activity sections start empty and fill forward — **no backfill.**
  (grill-me closing Q1)
- **D15 — Honest caps + isolation guard (refined by co-validate, §6):** TOTAL counts use Prisma
  `count`/`groupBy(action)` on top-level columns → always complete, never capped. Parsed breakdowns
  (by `errorCode`/`outcome`, which live inside the `changes` JSON string and can't be grouped in
  SQL) fetch rows capped at ~2000/window and surface a **`truncated` flag** the panel renders
  ("counts may be incomplete — high volume") so a capped rollup never masquerades as complete
  (Codex C5). Merged recent-signals table = last 50, time-sorted, graceful empty states. A
  regression test asserts `runImportAlertSweep`/`parseSignals` NEVER select
  `assessment_import_activity` rows. (grill-me closing Q2)
- **D16 — `refuse()` contract:** `refuse(db, { code, mode, status, body, organizationId?,
  templateAlias? }) → NextResponse` — writes the fail-soft `refused` signal + the console marker,
  returns `NextResponse.json(body, { status })` with the EXISTING heterogeneous bodies verbatim (no
  normalization, no caller-visible change). org-not-found (step 1) + org-access-denied (step 2) both
  record one `org-access` code (preserves the existence-non-leak). `templateAlias` attached when the
  instrument is already resolved. **Refined by co-validate (§6): these pre-validation refusals record
  `entityId:"unknown"` — NOT the requested org cuid, which is untrusted/unvalidated input from a
  refusal path (Codex C4).** Post-validation refusals (entitlement/instrument-mismatch/etc., which
  run only after org access has passed) record the validated org id. (grill-me closing Q3)

## §2 Design

### Y-2a/Y-2b — signal WRITE layer

**New module `esperto-import/import-activity-signals.ts`** — `alert-signals.ts` (the cron, its Wave V
writers, `parseSignals`, `evaluateAlertConditions`) is **neither modified nor imported** by the write
path (Codex C2: the "cron unaffected" guarantee is strongest when its module is literally untouched).
The new module owns its own constants + self-contained fail-soft writers:
- `ACTIVITY_ENTITY_TYPE = "assessment_import_activity"`, `PREVIEW_RESULT_ACTION = "preview_result"`,
  `REFUSED_ACTION = "refused"`.
- `recordPreviewSignal(db, { organizationId, templateAlias, blockReasons, skipReasonCounts,
  filesInBatch, respondentsSkipped })` — its OWN `auditLog.create` in a try/catch (undefined-stripped,
  PII-safe), NOT a call into the Wave V writer. `blockReasons`/`skipReasonCounts` are the PII-free
  enum strings straight from `restricted-plan.ts` (`invalid-round-label`, `crosswalk-locked`,
  `crosswalk-invalid-for-version`, `empty-batch`, `invalid-file-fields`, `multiple-cids`,
  `duplicate-respondent`, `unknown-answer-keys`, `empty-completeness-set`; skips:
  `unresolved-respondent`, `invalid-multi-choice`, `invalid-answer-value`, `incomplete-respondent`).
- `recordRefusalSignal(db, { code, mode, organizationId?, templateAlias? })` — same self-contained
  pattern, `refused` action. `organizationId` is OMITTED (→ row `entityId:"unknown"`) for the
  pre-validation `org-access` refusal (D16); present for post-access refusals.
- **UNCONDITIONAL + fail-soft** (D9) — no flag read; a write failure never alters the import response.
- No `parseSignals` export, no evaluator reuse — the live indicator is dropped (D6).

**New `refuse()` helper in `restricted-route-helpers.ts`** (home of `emitEspertoImportMetric` +
`resolveRestrictedImportContext`) — per D16. Wired at the pre-commit gates in BOTH mirrored handlers
(public `route.ts:680`, admin `:666`):

| Gate | Code | Status | org / alias at that point |
|---|---|---|---|
| org not found / access denied | `org-access` | 404 | **org OMITTED → `entityId:"unknown"`** (pre-validation, Codex C4); alias = instrument alias (resolved from batchKind pre-org) |
| template has no published version | `template-not-published` | 422 | org + alias |
| crosswalk incompatible with version | `crosswalk-incompatible` | 400 | org + alias |
| entitlement pre-check fail | `entitlement-denied` | 403 | org + alias |
| too many files | `too-many-files` | 413 | org + alias |
| file parse failure | `file-parse` | 400 | org + alias |
| shape / mat guard fail | `instrument-mismatch` | 400 | org + alias |

Excluded (unchanged): flag-off 404 (condition D — no capability, log-drain), genuine context-resolve
500s.

**Preview emission** (`recordPreviewSignal`): in the `mode === "preview"` branch of both handlers,
after the plan is built, **only when `plan.blocks.length > 0 || plan.skips.length > 0`** (D3).

All writes reuse the existing `WAVE_V_IMPORT_ALERTING_ENABLED` gate (D9) and are fail-soft — a
signal-write failure never alters the import response.

### Y-1 — read layer: new `esperto-import/import-health.ts`

Pure `buildImportHealthSummary({ db, now }) → ImportHealthSummary`. Imports only the read-only
row/action CONSTANTS from `alert-signals.ts` (`ALERT_SIGNAL_ENTITY_TYPE`, the commit actions,
`ALERT_CRON_ENTITY_TYPE`, `ALERT_CRON_RUN_ACTION`) — never `parseSignals`/`evaluateAlertConditions`
(D6). Its own defensive `JSON.parse`. Produces:
- `alerting: { enabled }` (from `isImportAlertingEnabled()`); `cron: { lastSweptAt, processedThrough,
  sweeps24h, evaluated24h, health: "disabled"|"healthy"|"stale", staleMinutes }` — from the
  `assessment_import_alert_cron` checkpoint rows, D8 logic (30-min threshold, flag-aware).
- `history: { byCode: { code, count, lastFiredAt }[] }` over 24h + 7d — parsed from `changes.fired`
  across checkpoint rows (per-code counts + most-recent time, D6; the cron's actual decisions).
- `volume` over 24h + 7d — TOTALS via Prisma `count`/`groupBy(action)` (complete, uncapped);
  `commitResultsByOutcome` / `commitConflictsByCode` / `refusalsByCode` / `previewDegradations` /
  reference `latencyP95Ms` via a capped row-fetch + in-app parse, each carrying a `truncated` flag
  when the fetch hit the ~2000 cap (D15).
- `recent: RecentSignal[]` — last 50 rows across `assessment_import` + `assessment_import_activity`
  (`entityType: { in: [...] }`, `orderBy timestamp desc`, `take 50`): time, entityType, action, org,
  alias, outcome/code, latency.
- `Promise.all` like the existing route; all row-fetches bounded (D15).

### Y-1 — presentation

- New admin-gated `GET /api/admin/assessments/import-health` (auth `getApiActor()` +
  `isPrivilegedRole` → 401/403, mirrors `/api/admin/observability`) → `{ success, data:
  ImportHealthSummary }`.
- New `<ImportHealthPanel/>` client component (fetch-on-mount + Refresh, mirrors
  `ObservabilityDashboard`'s idiom): **Cron health** tile (disabled/healthy/⚠️), **Alert history**
  (per-code firing counts + most-recent time, 24h/7d — the cron's actual decisions), **Volume**
  `Section`/`Stat` grids (reference p95 shown with NO threshold beside it), **Route refusals** section
  (panel-only), **Recent signals** table (with a truncation note when a breakdown hit the cap).
- Mounted on the existing `admin/assessments/observability/page.tsx` **below** `<ObservabilityDashboard/>`.
  **Dedicated route + component (override of Codex C6):** the existing observability route/component
  are left *entirely untouched* (pure addition), which serves the same isolation principle Codex
  applied to the write side better than extending the global route would. Cost = one extra fetch on
  the page. (The existing dashboard's "Audit log by action" table already shows raw
  `import_commit_*` counts; Wave Y's value-add is the condition/cron-health/latency framing + the
  preview/refusal signals that don't exist yet — not filling a total blackout.)
- Page header copy updated per D11.

## §3 Follow-ons (named, unscheduled)
- Composite `@@index([entityType, timestamp])` if import volume ever makes the `timestamp`-index
  scan hot (D9 defers it to avoid a prod DDL lock at current volume).
- Wire a real log drain + runbook §7 condition-D (flag-drift) — the one alert condition that can't be
  in-app; vendor decision (blocked).
- Preview/refusal burst as an *optional future* alert condition (deliberately out per D4).

## §4 Test plan (TDD, subagent-driven per house rules; jest-verify counts before SoT)
- **Signal writers (new `import-activity-signals.ts` test file):** payload PII-safe (no raw
  email/cid/mid/name); fail-soft (throws never propagate); **UNCONDITIONAL — writes even when the
  Wave V alerting flag is OFF** (D9); `recordPreviewSignal` fires only on block/≥1-skip (D3); refusal
  code/status/`org`-omission map incl. `org-access` → `entityId:"unknown"` (D16). Mirrors the
  `esperto-import-alerting.wave-v.test.ts` patterns.
- **Cron isolation (D5/D15):** a `runImportAlertSweep`/`parseSignals` regression test proving
  `assessment_import_activity` rows are never selected/counted, so Wave Y can't perturb Wave V alerting.
- **`import-health.ts` summarizer:** per-code firing history parsed from checkpoint `fired` arrays
  (counts + most-recent time); robust to malformed/blank `changes`; correct 24h/7d windows; TOTALS
  uncapped (count/groupBy) while parsed breakdowns set `truncated` at the cap (D15); cron-health
  three-state logic incl. flag-off-neutral and >30-min-stale; empty-state summary. **No evaluator
  reuse** — the panel reads decisions, never recomputes.
- **Route:** 401/403 gates; JSON shape.
- **Panel component:** renders health/conditions/volume/recent; graceful empty + error states.
- **Route refusal wiring:** each instrumented gate returns its existing body/status AND writes one
  `refused` row (D14 single-emission); no double-emission across preview/commit/refuse paths.
- Build gate: `CI=true npx next build --turbopack` green.

## §5 Launch plan (same-session on user "go")
1. Dark-merge the PR (flagless read + writes gated by the already-live Wave V flag → behavior is live
   on merge for writes; panel visible to admins immediately, empty until imports occur).
2. Prod smoke: hit `/admin/assessments/observability`, confirm the Import panel renders, cron-health
   reflects the live flag state + last real sweep, existing Wave V commit rows appear.
3. Exercise a preview refusal on the Esperto TEST account (no real mail) to see a `refused`/
   `preview_result` row land in the panel; quarantine any test artifacts (§5.5 order).
4. SoT on push (CLAUDE.md anchor + `plans/CHANGELOG.md` `wave-y-*`), Notion task, jest-verified counts.

## §6 Co-validate changelog (2026-07-07 — Codex staff-engineer review + independent Claude review, consolidated)

Both reviews independently flagged the same two biggest issues (write-flag, live re-evaluation).
Six findings; **five accepted, one overridden.**

- **C1 (write flag wrong) — ACCEPTED [both].** `WAVE_V_IMPORT_ALERTING_ENABLED` gates the cron, not
  durability; gating the new writes behind it would drop preview/refusal rows whenever alerting is
  off (violates the ask). → **D9 revised:** writes UNCONDITIONAL + fail-soft, no flag (Wave Q rule;
  matches Wave V's own commit-signal writes). Removes flag coupling entirely.
- **C3 (live re-evaluation = scope creep + can mislead) — ACCEPTED [both flagged; Codex decisive].**
  Sweep boundaries/cursoring/checkpoint timing differ, so a re-evaluated verdict isn't the cron's
  decision. → **D2/D6 revised:** drop the live indicator; the panel shows the cron's ACTUAL
  checkpoint decisions (per-code counts + most-recent time). Side benefit: eliminates the
  independent-review [MED] p95-conflation risk and means `alert-signals.ts` is untouched.
- **C2 (don't touch the Wave V writer/cron module) — ACCEPTED.** → new self-contained
  `import-activity-signals.ts`; `alert-signals.ts` neither modified nor imported by the write path;
  no `parseSignals` export. "Cron unaffected" becomes literal.
- **C4 (don't persist requested org id on pre-validation refusals) — ACCEPTED (I'd missed it).**
  → **D16 refined:** the `org-access` refusal records `entityId:"unknown"`, not the untrusted
  requested cuid; only post-access refusals record the validated org.
- **C5 (capped rollups lie during incidents) — ACCEPTED.** → **D15 refined:** TOTALS via Prisma
  `count`/`groupBy` (uncapped, complete); parsed breakdowns capped with a `truncated` flag surfaced
  in the UI.
- **C6 (extend the existing observability route/component instead of a dedicated one) — OVERRIDDEN.**
  Rationale: a dedicated route + `import-health.ts` module + `<ImportHealthPanel/>` leaves the
  existing observability route/component *entirely untouched* (pure addition) — which serves the
  same isolation principle Codex applied to the write side (C2) *better* than modifying the shared
  global route. Cost is one extra fetch on the page; benefit is a clean, independently-testable
  summarizer unit and zero risk to the existing dashboard.

**Independent-review findings not in Codex, folded in:** per-code firing history (not a boolean
union) → D6; reference p95 rendered with no threshold → D6; `parseSignals` reuse-scope moot now that
the live indicator is dropped; honest framing that the existing by-action table already shows raw
counts → §2 presentation note.

**Tooling note (surfaced during the run):** the first two Codex calls failed on a stale
`~/.codex/config.toml` line 7 `service_tier = "priority"` (the MCP accepts only `fast`/`flex`); the
review succeeded with a `service_tier:"fast"` override. Worth fixing that config line.

### Adversarial review (post-build, branch `wave-y-import-observability`) — 5-lens red-team, each finding independently verified

4 findings CONFIRMED (0 CRITICAL/HIGH; 1 MEDIUM, 3 LOW) — **all fixed in-branch:**
- **MEDIUM (coverage):** no Wave Y route test ran in `mode:commit`, so the commit-path fresh-ctx
  refusal branch and the commit-*success* side of D14 (no double-emission) were unverified. → Added a
  coach commit-mode fresh-ctx refusal test (`template-not-published`, `mode:commit`, txn NOT called)
  + a "successful commit writes NO activity row" assertion.
- **LOW (code bug — the only functional defect):** `truncated` was computed over the 7d fetch but
  attached to the 24h window (the only one the panel renders), so a high-7d/low-24h org saw a FALSE
  "counts incomplete" warning on its complete 24h view. → `windowTruncated(rows, since)` now flags a
  window only when the capped fetch actually dropped rows INSIDE it; +2 summarizer tests (incl. the
  exact false-positive scenario).
- **LOW (coverage):** `template-not-published` / `crosswalk-incompatible` / `file-parse` refusal
  signal side-effects were unasserted. → Added coach preview-context (`template-not-published`) +
  `file-parse` signal assertions.
- **LOW (coverage):** the admin route's hand-duplicated mirror wiring wasn't directly tested. → Added
  admin `org-access` + `entitlement-denied` activity-signal assertions.

Post-fix: lint clean, `CI=true next build --turbopack` green, all Wave Y + touched suites pass.
