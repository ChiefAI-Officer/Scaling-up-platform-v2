# Spec 19v — Wave V: P8 Hardening Pass

**Status:** LAUNCHED 2026-07-06 — PR #146 (`e8ccd0d`) merged + same-session launch walk complete;
`WAVE_V_IMPORT_ALERTING_ENABLED=1` live on Vercel Production (individually authorized) + newest
deployment redeployed. Launch walk proved: V-1 publish BLOCKED on non-tiling tiers → fix →
publish → submit succeeded; V-3 badge live on all three surfaces (walk LVA campaign used for the
alias-allowlisted group report); V-2 sweep twice against prod DB (condition A fired,
checkpoint-before-send, walk-recipient email) and the FIRST PROD CRON CHECKPOINT verified
(resumed exactly from the walk cursor, 105-min catch-up span, 0 evaluated, no email). Artifacts
quarantined §5.5 order (smoke 0/0); prod smokes green. D3 preflight (ALL 19 versions): only the
quarantined Wave U walk v1 fails — 18 real versions CLEAN. Build was INLINE (co-validate
subagent died on a session usage limit — Codex called directly from the main loop, §6).
Direction: P8 hardening chosen over conditional authoring — conditionals slot as Wave W.

## §0 Ground truth

- **V-1 gap (walk-found, Wave U launch):** the publish schema (`TemplateVersionForPublishSchema`,
  `scoring.ts:545`) runs `checkPerDomainTierTiling` (per-domain `domains[].tiers`) but NOT the
  legacy GLOBAL check — `scoreSubmission` step 2 additionally asserts `scoringConfig.tiers` tile
  the version's metric domain (`assertTierTiling`, `scoring.ts:1199/1205`, two branches: rollup
  domain when scaleUpScore opts in, plain domain otherwise). A version whose global tiers don't
  tile publishes fine, then 400s `INVALID_SCORING_CONFIG` on every submit. Single publish-schema
  consumer: `versions/[versionId]/publish/route.ts:73`.
- **Live-data invariant:** every LIVE published version passes scoreSubmission step 2 daily (its
  submissions succeed) → by construction none can fail the new publish check. Published rows never
  re-validate (Wave T fact). The at-risk population is DRAFT versions (incl. Duplicate-hydrated).
- **V-2 gap:** the `assessment.esperto_import.*` §7 markers (`emitImportMarker`,
  `restricted-route-helpers.ts:444`) are console-only — never persisted; launch observability is
  human-read `vercel logs`. The commit path already writes AuditLog rows in-transaction
  (`restricted-commit.ts:537/658`), but a thrown `RestrictedCommitError` ROLLS BACK the
  transaction, so conflict signals must be written route-level after the rollback.
  Cron precedent: 3 live Inngest crons (`check-stale-approvals` hourly is the closest analog).
  Admin-recipient house pattern: `process.env.ADMIN_EMAIL || "admin@scalingup.com"` (6 sites in
  `notifications.ts`).
- **V-3 gap:** no UI reads `AssessmentCampaign.importManifest` (schema.prisma:1295) anywhere —
  imported provenance is visible only via the campaign-naming convention.
- **V-4 gap:** `respondent-report.ts:188` and `group-report.ts:317` wrap authorization + the full
  fetch in one interactive `$transaction` with only `isolationLevel` — no `timeout`/`maxWait`, so
  Prisma's 5s default applies (the class of failure #117 fixed on the import COMMIT path with
  55s/10s). A Neon cold start or high-latency client can P2028 a report view.

## §1 Decision log (user-confirmed 2026-07-06)

- **D1 — Scope = 4 items** (all user-selected): V-1 tier-domain publish gate, V-2 in-app import
  alerting, V-3 "Imported from Esperto (historical)" badge, V-4 report read-path txn budget.
  **Descoped with notes:** org-canary page-gate (YAGNI — canary lever unused since global launch);
  external log-drain vendor selection (ops decision, the in-app cron covers the alerting value);
  §7 condition D flag-drift (log-drain-only — the route 404s before any row exists; user-confirmed).
- **D2 (V-1) — flagless, non-killable correctness hardening** (kill = revert-commit; Wave T PATCH
  validation precedent). Extract the metric-domain computation `scoreSubmission` uses (BOTH
  branches: rollup vs plain) into one shared helper; add `checkGlobalTierTiling` to the publish
  superRefine, surfacing via `ctx.addIssue` with routed paths (publish-modal contract).
- **D3 (V-1) — D19-style read-only preflight scan** of **ALL versions (draft AND published)** on
  prod (`scripts/wave-v-preflight-tier-scan.ts`), report-only. Findings are Jeff-fixable in the
  editor (Duplicate → fix tiers → publish), not auto-mutated. _(Codex C3: "live submissions
  succeed daily" only proves versions WITH traffic — a freshly published zero-submission version
  has never exercised step 2; scan everything.)_
- **D4 (V-2) — persist signals as AuditLog rows, UNCONDITIONALLY** (Wave Q durable rule: flags
  gate capability, never persisted data). Persistence hooks the SAME emission points as
  `emitImportMarker` — extend the marker helper with a persist path for the two commit events so
  the console output stays byte-identical and the taxonomies can't drift (Codex C4). Rows:
  `assessment_import`/`import_commit_result` with `latencyMs` on success;
  `assessment_import`/`import_commit_conflict` with `errorCode` on `RestrictedCommitError`
  (written route-level in the catch — survives the transaction rollback) **plus errorCode
  `unexpected-error` for any non-`RestrictedCommitError` commit failure** (the most alertable
  class must not be invisible). Payloads PII-safe per the existing marker rules
  (hashes/counts/errorCodes only; never raw mid/reportid/email/cid). Write failures never break
  the import response (fail-soft, marker-style).
- **D5 (V-2) — Inngest cron `*/10 * * * *` with a PERSISTED CURSOR on AuditLog** (revised from
  the originally-confirmed stateless window after Codex C1; user re-confirmed 2026-07-06): each
  run reads the latest `assessment_import_alert_cron`/`run` checkpoint row, evaluates signal rows
  with `timestamp` in `(lastProcessedThrough, now]`, and writes the NEW checkpoint row (carrying
  `processedThrough` + what fired) BEFORE sending — the checkpoint is the retry-safe dedup anchor,
  so late ticks and deploy pauses can't silently drop a window and an Inngest retry can't
  double-email. First run ever (no checkpoint) starts from `now - 10min`. Implements §7 **A**
  (any `divergent-reimport` → email), **B** (>3 denial-class conflicts in the span), **C**
  (latency p95 > 10s over the span, in-process — spans are tiny). Email via the house
  `smtp-transport`; **`ADMIN_EMAIL` is REQUIRED for sends — no silent fallback address; missing
  env + flag on → loud error marker, no send** (Codex C5). Body = counts + errorCodes + span
  bounds, PII-free. _(Codex proposed two new typed tables; rejected as over-engineering for
  a-few-events-per-week volume — AuditLog's `@@index([timestamp])` serves the cursor query with
  zero migration.)_
- **D6 (V-2) — flags:** `WAVE_V_IMPORT_ALERTING_ENABLED` gates cron evaluation + send only;
  `WAVE_V_IMPORT_ALERTING_KILL` wins over ENABLED (house 2-lever pattern). Kill = zero the flag;
  signal rows persist inert.
- **D7 (V-3) — badge on all three surfaces** (user-confirmed): respondent report header, group
  report header, campaign-detail page. Trigger = `campaign.importManifest != null` (loaders gain
  the null-check field in their selects). Copy: "Imported from Esperto (historical)". Flagless
  presentation-only (Wave R precedent; kill = revert).
- **D8 (V-4) — `maxWait: 10_000, timeout: 15_000`** (user-confirmed) on exactly the two read
  transactions (respondent-report, group-report). The write-path transactions
  (peer-benchmarks reconcile, transfer-ownership, evaluate-access-change, import commit) are NOT
  touched. `respondent-report.ts`'s local `$transaction` interface type (line 42) extends to
  accept the options param. Flagless (kill = revert). _(Codex C6 suggested removing the
  transactions instead — OVERRIDDEN: they are load-bearing (the in-file H14 contract runs
  authorization + fetch in ONE transaction deliberately, TOCTOU protection); the budget is a
  tactical mitigation and documented as such. Note: a 15s timeout only helps up to the route's
  `maxDuration` — on a shorter-budget route the function dies first, same as today.)_
- **D9 — no new ADR.** All four items are hardening within already-recorded decisions
  (ADR-0006/0017 import isolation, Wave Q flag rule, Wave T non-killable-validation precedent) —
  no novel hard-to-reverse trade-off. Runbook `18o-ops-runbook.md` §7 gets an addendum: in-app
  cron implements A/B/C; D remains log-drain-only.
- **D10 — one PR, merged dark** where flagged (V-2), flagless items live at merge (V-1/V-3/V-4 are
  correctness/presentation hardening with kill = revert). Same-session launch walk on "go".

## §2 Design

**V-1** — `scoring.ts`: extract `computeGlobalTierMetricDomain(v)` (rollup-vs-plain branch logic
currently inline at step 2) used by BOTH `scoreSubmission` and the new
`checkGlobalTierTiling(data, ctx)` added to `TemplateVersionForPublishSchema.superRefine`.
**Parity preconditions are part of the contract:** the helper replicates the SLIDER_LIKERT-only
question filter and both branches (`scoringConfig.rollup` → `computeRollupTierDomain`; legacy →
`computeTierDomain` + `tierMetric`) — qualitative templates score daily through step 2, so exact
parity guarantees the new check can't newly block them. Publish-side issues use
`path: ["scoringConfig", "tiers", <idx>]` so the publish failure modal routes them like the
per-domain check. Divergence-proofing property test: any fixture that passes publish must pass
scoreSubmission step 2 (and the walk-found fixture fails both).

**V-2** — new `lib/assessments/esperto-import/alert-signals.ts` (row writers, fail-soft) invoked
via the extended `emitImportMarker` path for the two commit events (success + all-failure catch);
new `inngest/functions/esperto-import-alert-cron.ts` (flag check → checkpoint read → cursor-span
query on the indexed `timestamp` (`@@index([timestamp])`) filtered to `entityType:
"assessment_import"` → A/B/C evaluation → checkpoint write → one consolidated email listing
whichever conditions fired); new `lib/assessments/wave-v-flags.ts`. p95 computed in-process over
the span's `latencyMs` values (spans are tiny; no SQL percentile needed).

**V-3** — loaders (`respondent-report.ts`, `group-report.ts`, campaign-detail page query) select
`importManifest` presence as a boolean (`isImported`) — never ship the manifest payload to the
client (it carries salted hashes; PII-safe but unnecessary). Badge component: neutral pill,
status-token colors, next to the existing header metadata on each surface.

**V-4** — options literal at the two `db.$transaction(...)` call sites + the interface extension.
No behavior change on the happy path; P2028 surfaces as the routes' existing error handling.

## §3 Follow-ons (named, unscheduled)

- External log-drain wiring + §7 condition D (vendor decision — user/ops).
- Org-canary page-gate for import pages (only if a future org canary is wanted).
- Alert dashboard panel (email-only for now).
- Preview-path block/skip signals (commit-path conflicts only in V-2; §7 B counts commit conflicts).

## §4 Test plan (TDD)

- `scoring.wave-v.test.ts`: publish rejects non-tiling global tiers (the exact walk scenario);
  rollup-branch + plain-branch coverage; publish-pass ⇒ scoreSubmission-step-2-pass property;
  existing per-domain check unaffected; live-seed fixtures (SU-Full v3 content) still publish;
  **qualitative-template fixture (LVA/QSP-shape config) still publishes** (parity guard).
- `alert-signals.wave-v.test.ts`: success row carries latencyMs; conflict row written on each
  RestrictedCommitError code **and `unexpected-error` on a non-RestrictedCommitError throw**;
  console marker output byte-identical to pre-wave; rows PII-safe (no raw cid/mid/email in
  details); write failure is fail-soft (import response unaffected).
- `esperto-import-alert-cron.wave-v.test.ts`: cursor-span filtering (events before the checkpoint
  excluded; late/delayed run still covers the full span; first-run bootstrap = now-10min);
  **checkpoint written before send** (a send failure doesn't re-alert the span on retry — and the
  checkpoint records the miss); A fires on one divergent-reimport; B fires on 4 denials / not on
  3; C fires on p95>10s / not under; consolidated single email; flag off / kill → no evaluation;
  **missing ADMIN_EMAIL + flag on → loud error marker, no send, no throw**; empty span → no email.
- `wave-v-flags.test.ts`: KILL > ENABLED matrix.
- Badge tests per surface: renders iff `isImported`; loaders expose boolean not manifest.
- `respondent-report` / `group-report`: options `{maxWait:10000, timeout:15000}` asserted passed;
  existing behavior snapshots unchanged.
- Jest-verify counts before SoT (house rule).

## §5 Launch plan (same-session on user "go")

1. Gates: `CI=true npx next build --turbopack`, eslint on changed files, targeted jest, sweep.
2. PR dark → merge (every prod mutation individually authorized, as always).
3. **V-1 walk:** throwaway walk template on prod DB via local UI — author non-tiling global tiers →
   publish BLOCKED with routed message → fix tiers → publish passes → submit succeeds (the Wave U
   walk scenario, now failing at the correct gate). Run the D3 preflight scan; report findings.
4. **V-3 walk:** walk import batch (rehearsed Wave O scripts) or existing imported campaign →
   badge visible on all three surfaces; non-imported campaign shows none.
5. **V-2 walk:** with flag inline on local UI vs prod DB — synthesize a conflict row (walk org) →
   run the cron handler with **ADMIN_EMAIL locally overridden to a test recipient** (never email a
   synthetic alert to the real admin inbox) → email received with correct content + checkpoint row
   written; then prod flag flip (individually authorized) + redeploy (NEWEST deployment URL —
   Wave U gotcha) + prod verification = a no-op cron tick in `vercel logs` (checkpoint advances,
   empty span, no send).
6. **V-4:** covered by tests + normal report loads in the walks (no separate prod exercise).
7. Quarantine walk artifacts (§5.5 order: campaigns first, then template soft-delete), SoT
   (CLAUDE.md anchor + CHANGELOG + runbook §7 addendum), Notion task (pending connector reauth).

## §6 Co-validate changelog (2026-07-06 — Codex staff-engineer review + independent Claude review, consolidated)

_Process note: the Codex review subagent died on a Claude session usage limit before reaching
Codex (4th wave running: S/T/U builds + this); the Codex MCP tool was called directly from the
main loop instead — the mandatory Codex review DID run._

- **C1 (cron reliability) — ACCEPTED, user re-confirmed.** Codex: the stateless trailing window
  (original D5, user-confirmed at the grill) silently misses alerts on late ticks/deploy pauses
  and double-sends on Inngest retries — unacceptable for the one item whose purpose is not
  missing signals. D5 revised to a persisted cursor + checkpoint-before-send.
- **C2 (typed signal tables) — PARTIAL.** Codex proposed `EspertoImportSignal` +
  `EspertoImportAlertRun` tables. Adopted the cursor/checkpoint SEMANTICS; rejected the new
  tables — a-few-events-per-week volume, AuditLog already holds the import audit trail, and
  `@@index([timestamp])` serves the query with zero migration.
- **C3 (published versions unproven) — ACCEPTED.** "Live submissions succeed daily" proves only
  trafficked versions; D3's preflight scan now covers ALL versions, published included.
- **C4 (instrumentation drift) — ACCEPTED.** Signals persist from the same emission points as
  `emitImportMarker` (helper extended; console output byte-identical) rather than parallel call
  sites.
- **C5 (alert recipient fallback) — ACCEPTED.** `ADMIN_EMAIL || "admin@scalingup.com"` is fine
  for notification emails, wrong for alerts: sends now REQUIRE the env; missing + flag on → loud
  error marker, no silent fallback.
- **C6 (remove the read transactions instead of budgeting) — OVERRIDDEN.** The H14 in-file
  contract runs authorization + fetch in one transaction deliberately (TOCTOU protection);
  removal reopens the race the transaction exists to close. Budget documented as tactical.
- **Claude F1 (parity preconditions) — folded into §2 V-1**: the shared helper must replicate the
  SLIDER_LIKERT-only filter + both rollup/legacy branches, with a qualitative-fixture publish test.
- **Claude F2 (query indexing) — resolved by inspection**: `@@index([timestamp])` exists; query
  shape pinned in §2.
- **Claude F3 (unexpected-error code) — folded into D4**: non-`RestrictedCommitError` commit
  failures also write a conflict row.
- **Claude F4 (walk-email hazard) — folded into §5**: synthetic-alert email goes to a locally
  overridden recipient, never the real admin inbox; prod verification = no-op cron tick.
- **Claude F5 (maxDuration interplay) — folded into D8** as a note.
