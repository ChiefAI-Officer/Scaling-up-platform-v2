# Audit Remediation Plan — vibe-code failure-mode findings

**Status:** REVIEWED — grilled (`/grill-with-docs` + `/grill-me`, 2026-06-20) and co-validated against Codex (`/co-validate`, 2026-06-22). Decisions grounded in code. See "Co-validate consolidation" at the bottom for the changes Codex's review forced. Ready to implement once the one open product decision (workflow authz domain) is settled.

**Source of findings:** A fan-out audit (11 finder agents × 5 axes, each finding adversarially verified) run against the codebase on 2026-06-20, prompted by a viral "6 things wrong with every vibe-coded app" post. Net result: **0 critical, 2 high, 10 medium, 6 low = 18 confirmed** (25 raw → 1 false positive dropped, duplicates merged). A follow-up authz **pattern sweep** during the grill surfaced **2 routes the audit's partition missed** (`surveys/assign`, `files` list) and **cleared 1** (`portal/profile`). Audit data: `scratchpad/audit_final.json`; report artifact published separately.

Stack reminder: Next.js 16 App Router, Prisma + Neon (no Supabase RLS — **all authz is app-layer**), NextAuth (JWT), Inngest, Azure email via `lib/smtp-transport.ts`. Paths below are under `src/src/`.

---

## Resolved decisions (the design, with rationale)

1. **Scope = all 18 findings + the 2 sweep finds.** (User chose "everything.")
2. **Delivery = sequenced, security first** — four independently reviewable/revertible PRs, straight to prod via feature-branch → PR → merge. Rationale: the findings have *opposite* test burdens — security needs "prove a coach is now 403," query refactors need "prove output is byte-identical." Bundling forces one reviewer to hold both models and lets a refactor regression block a security merge.
3. **Authz model = mirror each resource's existing gate** (not "owner-scope everything"). Rationale: a security pass enforces *existing intent*; it must not introduce new capability (e.g. coaches assigning surveys to their own workshops) under the banner of a fix. The vulnerable routes are all admin-domain (admin nav, admin-only UIs, admin parent routes), so ADMIN is the truthful gate. `files` is the one resource with an established *ownership* model (its DELETE handler), so its GET reuses that model.
4. **Parents gate with literal `role !== "ADMIN"`, not `isPrivilegedRole`.** Verified: `workflows/[id]/route.ts` and `survey-templates/[id]/route.ts` use `session.user.role !== "ADMIN"` (STAFF excluded). The child-route fixes mirror the parent exactly, to avoid silently widening access to STAFF on a domain that today is ADMIN-only.
5. **Inngest retry-resend is fixed now, in its own PR** (not deferred, not bundled). Rationale: the fix is cheap because the per-recipient SENT-child scaffolding already exists, and the terminal-vs-transient SMTP classification it was "waiting on" already exists (`isTerminalAuthError`). Isolated because a regression = duplicate emails to real attendees.
6. **No CONTEXT.md / ADR changes.** CONTEXT.md is scoped to the assessment domain; these are authz *implementation* fixes, not domain language. ADR bar (hard-to-reverse + surprising + real trade-off) is not met by the bug fixes. The Inngest at-least-once choice is borderline but already recorded in CLAUDE.md's deferred follow-ons.

---

## PR-1 — Security (lands first)

All routes verified as "401-only, no role/ownership check." Fix + **two** tests each: a "non-privileged actor is now rejected (403)" test AND a "privileged actor still succeeds (200)" test, to catch over-tightening of the admin/coach flows.

### Broken function-level authorization (mirror parent → `role !== "ADMIN"` → 403)

| Route | Methods | Current | Fix |
|---|---|---|---|
| `app/api/workflows/[id]/steps/route.ts` | POST (36), PATCH (102) | 401 only | add parent's ADMIN gate |
| `app/api/workflows/[id]/steps/[stepId]/route.ts` | PATCH (34), DELETE (94) | 401 only | same |
| `app/api/survey-templates/[id]/questions/route.ts` | POST (33), PATCH (74) | 401 only | same |
| `app/api/survey-templates/[id]/questions/[questionId]/route.ts` | PATCH, DELETE | 401 only | same |
| `app/api/surveys/assign/route.ts` | POST | 401 only — **sweep find** | same |
| `app/api/workflows/route.ts` | POST create + `duplicateFromId` | **co-validate find** — only `isTemplate` is admin-gated; non-template `createWorkflow` and `duplicateWorkflow` have **no** role check | **DECIDED (A): gate create + duplicate to ADMIN** (workflows are admin-domain — no coach UI). Both the bare `createWorkflow` path and the `duplicateFromId` path get the ADMIN gate, consistent with the step routes. |

**Authz implementation (co-validate):** switch the new/changed gates from the copied `session.user.role !== "ADMIN"` (JWT role — stale until token refresh) to **DB-backed `getApiActor()`** + a small shared helper (`requireAdminActor` / `requirePrivilegedActor`; `canReadFile` for the file read). These helpers **do not exist yet** — create them in this PR; do NOT copy-paste the 403 block across routes. Scope note: apply to the gates this PR already touches + the file read; full-platform authz standardization (every existing gate → DB-backed) is a *separate* hardening, not this PR (adds a DB read per request).

- Callers confirmed admin-only UIs: workflow steps ← `components/workflows/workflow-editor.tsx`; survey questions ← `components/surveys/survey-template-editor.tsx`; `surveys/assign` ← the same admin editor (`survey-template-editor.tsx:286`). Workflows + Surveys live under `/admin/*` (dashboard layout, privileged-gated at page layer). No coach client calls these.
- `createSurveyForWorkshop` does **no** ownership/role scoping (looks up workshop + template by raw id) — confirming `surveys/assign` is wide open today.

### Object-level authorization

| Route | Methods | Current | Fix |
|---|---|---|---|
| `app/api/files/[id]/route.ts` | GET (36) | 401 only | **REVISED (co-validate): mirror the canonical READ policy in `app/api/files/[id]/download/route.ts` (~line 89), not the PATCH rule.** (Lines 97–105 are the **PATCH** handler, not DELETE; and that mutation rule omits the attachment-status gate.) Read policy: allow if ADMIN/STAFF; else if actor is the workshop's coach (`file.workshop.coachId === actor.coachId`) AND `canRoleAccessAttachment({recipientRole:"COACH", workshopStatus})`; else uploader fallback (`file.uploadedBy === actor.userId`) for workshop-less files; else 403. Use `getApiActor()`. **Also: do not return raw `blobUrl` in the metadata response unless authorized** — it is direct content access, so the GET must be ≥ as strict as download. |
| `app/api/files/route.ts` | GET (24) | 401 only — **sweep find** | gate `isPrivilegedRole(actor.role)` → 403 otherwise. `listFiles({workshopId,...})` has no owner filter; only admin tools (`file-manager`, `workflow-editor`) call it. |

### Rate limiting

| Route | Methods | Current | Fix |
|---|---|---|---|
| `app/api/auth/accept-invite/route.ts` | POST | no limiter | wrap `withRateLimit` like sibling auth routes |
| `app/api/files/route.ts` | POST (46) | no limiter | `withRateLimit` on the upload handler |

**Cleared by the sweep (no change):** `app/api/portal/profile/route.ts` PATCH — self-scopes by `session.user.email` → own `coach.id`, no param-controlled target. Correct as-is.

---

## PR-2 — Query efficiency / N+1 (behavior-preservation tests)

| Item | File:line | Fix | Preservation risk |
|---|---|---|---|
| Wave-D campaign create inserts participants in a loop | `app/api/assessment-campaigns/route.ts:467` (`createWaveD`) | **clean `createMany`** — created rows are unused (`return created`) | low |
| Participant attach: per-row `create()` (≤500 in one tx) | `app/api/assessment-campaigns/[id]/participants/route.ts:187` | **clean `createMany`** — *(Q-E resolved)* the returned `rows` are discarded (only `.length` is read for `added`/`skipped`); `added` comes from `createMany`'s `{count}`. **No re-select needed.** Keep the CEO-already-exists update branch (lines 204–217). | low |
| Bulk import existence check, per row | `app/api/organizations/[id]/respondents/bulk/route.ts:239` **and** `app/api/assessment-campaigns/route.ts:703` | one `findMany` on all dedupe values → `Set`, then branch; **extract a shared helper**. **⚠ co-validate/own-review: in-batch duplicate handling.** The current loop does update/insert/**revive-soft-deleted** per row inside the tx and relies on each row's `findFirst` seeing prior in-batch inserts — so a CSV with duplicate emails is handled today. A prefetch+`Set` taken *before* the loop would re-insert in-batch dups into the `(organizationId, dedupeSource, dedupeValue)` unique constraint. The Set MUST be updated as rows are inserted within the batch. Note only the *existence check* is batchable; the update/insert/revive writes stay per-row, so the win is modest — **consider whether this refactor earns its risk** (bulk import is admin-operated, infrequent, bounded). | **medium-high** — preserve skip/merge `mode`, revive, AND in-batch dedup |
| Per-coach campaign query in a loop inside a SERIALIZABLE tx | `lib/assessments/evaluate-access-change.ts:354` | single `findMany` over all `affectedCoachIds` before the loop, group in memory | medium — inside a lock; preserve the force-zero block logic |
| `canAccessTemplate` once per template (~2N + redundant group fetch) | `app/(portal)/portal/assessments/trends/page.tsx:135` | hoist the group fetch out of the loop; batch the access check | low |
| Campaign detail re-reads same rows across 3 calls | `app/(portal)/portal/assessments/[id]/page.tsx:46` | fetch campaign/org/coach once; pass into the authz + flag helpers | low |
| Campaign list — server-side filter | `app/api/assessment-campaigns/route.ts:104` + `components/admin/PublicCampaignsManager.tsx` | **REVISED (co-validate): split.** PR-2 does ONLY the server-side filter (the real fix): add a validated `accessMode` (+ `status`) query-param to the GET, applied inside `liveCampaignWhere`; `PublicCampaignsManager` requests `?accessMode=PUBLIC` and drops its client-side `.filter` (lines 71–73). Test: the server filter returns exactly the PUBLIC set the client filter did. | medium — server filter ≡ old client filter |

---

## PR-2b — Campaign-list pagination (split out, co-validate)

Pagination + load-more UI is an **API/behavior change, not an N+1 fix**, so it lands separately *after* PR-2's `accessMode` filter (which makes truncation safe). Add `take` + cursor to the GET route and a real load-more / next-cursor UI to `PublicCampaignsManager`. The user's "full rework" (Q-F) still happens — just sequenced as its own PR so the security/N+1 work isn't gated on a UI change.

---

## PR-3 — Inngest email retry-resend (own PR, email hot path)

- **Files:** `inngest/functions/trigger-workflow-step.ts` (EMAIL_ATTENDEES loop ~271–345) and `inngest/functions/execute-workflow.ts` (~382–417).
- **Current:** in-batch dedupe is in-memory (`sentEmails` Set), reconstructed empty on each Inngest invocation. A transient SMTP throw mid-batch makes Inngest retry the whole run and re-email everyone sent before the failure point. `trigger-workflow-step` already classifies terminal (`isTerminalAuthError`) vs transient, and writes a SENT recipient-execution child via `recordRecipientExecution`.
- **Q-C resolved:** BOTH files already write per-recipient SENT children via the shared `lib/workflows/recipient-execution.ts` `recordRecipientExecution`. **No write-side tracking to add** — read-side check only.
- **Fix — REDESIGNED after co-validate (my first approach was wrong).** ❌ The original "query existing SENT by `(stepId, workshopId, registrationId)` across ALL parentIds" would skip recipients from *legitimate prior/seasonal sends* and break manual resend — too broad. ✅ Correct design, unifying all paths:
  1. **Before any send, upsert a deterministic PARENT `WorkflowStepExecution` row** keyed by a **logical-run id** (`inngestRunId` + `stepId`). This (a) satisfies the child→parent self-relation FK (`parentId references WorkflowStepExecution.id`, verified `schema.prisma:965`) and (b) scopes dedup to the current run.
  2. **Per recipient:** the existing `recordRecipientExecution` upsert is unique on `(parentId, registrationId)` (`schema.prisma:986`) — already idempotent/race-safe. Before sending, check for a SENT child **under THIS run's parent**; skip if present.
  3. **Dedup is scoped to the logical run, NOT global-by-recipient** — a retry of the same Inngest run reuses the same parent (so prior recipients are visible → skipped), while a deliberate manual re-trigger (`forceResend`) gets a fresh run/parent → no false dedup. `forceResend` therefore bypasses naturally.
- **This resolves Q-C's immediate-path gap too:** the deterministic parent-row upsert means the immediate path (where `executionId` was falsy → no child) now always has a parent + children, so the same pre-send check covers it. (Folds in the documented `executionId`-synthesis follow-on, now framed as a parent-row upsert rather than a bare id.)
- **Tests:** (a) throw at recipient #3, retry the *same run*, assert #1–#2 NOT re-sent and #3+ proceed; (b) `forceResend` after a complete send DOES re-send (not falsely deduped); (c) immediate path: throw mid-batch, retry, assert no re-send.
- **Residual (accepted, documented):** at-least-once, not exactly-once — a crash between a successful send and its SENT-write would re-send that single recipient on retry. True exactly-once needs a provider-side idempotency key; out of scope.

### DEFERRED to a focused pass (2026-06-22) — scoping notes from the build session

PR-1/2/4 shipped (PRs #81 + #82); PR-3 staged because it restructures the email hot path and a subtle bug = duplicate emails to real attendees. Verified facts for the next session:
- **`recordRecipientExecution`** (`lib/workflows/recipient-execution.ts`) upserts a child keyed by the `(parentId, registrationId)` unique constraint (`schema.prisma` `WorkflowStepExecution_parent_recipient_unique`) — already idempotent. `finalizeParentRollup` rolls children → parent.
- **`trigger-workflow-step.ts`** creates a **fresh parent row every invocation** (~line 225) → that's why a transient-SMTP retry re-sends (new parent → prior SENT children invisible). It ALSO has a step-level guard (~line 68) `findFirst({stepId,workshopId,status:"SENT"})` with **no `parentId` filter** and a **`forceResend` bypass**. Has 6+ step types each creating their own parent.
- **`execute-workflow.ts`** derives `executionId` from `scheduled.id` (~line 193) — **undefined on the immediate path**, so its `if (executionId)` guards skip child writes there (the gap). Its EMAIL_ATTENDEES guard filters `parentId:null`.
- **The fix:** make the parent row **deterministic/run-scoped** (upsert keyed by Inngest `runId` + stepId + workshopId) so a retry reuses it; pre-send, check for a SENT child under THAT run's parent; `forceResend`/new manual trigger = new run = new parent = re-sends. Synthesize the same run-keyed parent on the immediate path.
- **TODO before implementing:** confirm Inngest exposes `runId` in the function context here, and whether the EMAIL_ATTENDEES send loop sits inside a `step.run(...)` (changes memoization/retry semantics). Write Inngest-replay tests: same-run retry → no re-send; forceResend → re-sends; immediate-path covered.

### PR-3 REDESIGN — co-validate round 2 (Codex, 2026-06-23)

Codex's review materially improved the design (caught 3 things the first pass missed + a better idempotency key). Build PR-3 to THIS, not the runId-keyed sketch above:

1. **Real unique key (needs a migration).** The "deterministic parent upsert" has no schema support today — `WorkflowStepExecution` has no unique `(runId,stepId,workshopId)`, and `inngestEventId` is nullable/non-unique. Add a real `@unique` (e.g. `deliveryBatchKey`) or a deterministic parent `id` so the parent ensure/upsert is atomic + race-safe.
2. **Semantic `deliveryBatchKey`, NOT raw `runId`.** runId only dedupes retries of ONE run — it does NOT cover duplicate event emission or concurrent runs (both plausible here: cron sweep + immediate path + manual trigger). Use: scheduled = `workflowAssignmentId:stepId[:scheduledFor]`; manual force-resend = a generated `manualTriggerId` carried in event data. (A per-send `step.run("send-"+registrationId)` can be added as belt-and-suspenders for retry-memoization, but the DB child-SENT check keyed by `deliveryBatchKey` is the primary, more-complete mechanism.)
3. **Reuse the existing scheduled parent — don't create a second one.** `execute-workflow.ts` already creates a portal-visible scheduled parent before `sleepUntil` (~line 186, `executionId = scheduled.id`). That row IS the dedupe parent on the scheduled path. Only the IMMEDIATE path lacks one → synthesize there. A new run-keyed parent at send time would split audit/status state.
4. **Widen scope to ALL attendee fan-out step types.** The same partial-send-then-retry shape exists for `EMAIL_ATTENDEES`, `SEND_SURVEY_LINK`, AND `SEND_FILE_LINK` in both functions. Fixing only EMAIL_ATTENDEES still leaves duplicate real-attendee emails via the other two.
5. **Fix the existing trigger-workflow-step guard (line 69).** `findFirst({stepId,workshopId,status:"SENT"})` has no `parentId: null` filter → it can match a partial CHILD SENT row, so a non-force partial send → retry SKIPS the unsent recipients (under-send). Add `parentId: null`.
6. **Extract a shared helper.** `ensureExecutionParent(...)` + `sendFanoutRecipients(...)` used by both functions and all three step types: create/reuse one parent per `deliveryBatchKey`; check child SENT before each send; record child SENT immediately after; stable recipient ordering; roll parent up from children.

### PR-3 BUILD PROGRESS (2026-06-23) — branch `fix/audit-pr3-inngest-dedup`

- **DONE + committed:** (1) the shared helper `lib/workflows/fanout-delivery.ts` (`ensureExecutionParent` + `sendFanoutRecipients`, 6 TDD tests) — commit `dbf8c53`; (2) the `deliveryBatchKey` migration + schema field — commit `4cbabfd` (additive, safety-gate clean, `prisma generate` clean).
- **REMAINING (the large hot-path chunk):**
  - **Per-path `deliveryBatchKey` derivation — note the extra files:**
    - *Scheduled* (`execute-workflow`): REUSE the existing scheduled parent (`executionId`, created ~line 186) — pass its id as `parentId`; don't synthesize. Stamp a `deliveryBatchKey` on it when created so it's idempotent.
    - *Immediate* (`execute-workflow`): synthesize a key (no scheduled parent today).
    - *Manual* (`trigger-workflow-step`): needs a stable `manualTriggerId` carried in the `workflow/step.trigger` event → **also edit the trigger-now route** to put it in `event.data` (so retries of one manual trigger share a key; a new click = new key = re-send).
  - **6 bespoke sites** (3 fan-out step types × 2 functions): each has a different recipient source / subject / attachments → wire via a per-site `sendOne` callback into `sendFanoutRecipients`. EMAIL_ATTENDEES is the template (read in full).
  - **Guard fix** (`trigger-workflow-step` line 69): add `parentId: null`.
  - **Replay tests** + gate + push + PR.

---

## PR-4 — Robustness (LOW)

| Item | File:line | Fix |
|---|---|---|
| `verify()` failure swallowed AND `_verified` latched true | `lib/smtp-transport.ts:79–87` | don't set `_verified = true` on a failed/incomplete verify |
| `trigger-now` raw 500 on infra outage | `app/api/workflow-steps/[stepId]/trigger-now/route.ts` | wrap the main DB queries + `inngest.send` in try/catch; structured 5xx (the follow-up failure read is already wrapped) |
| Survey submit 500 on malformed body | `app/api/surveys/[id]/submit/route.ts:46` | move `await request.json()` inside try/catch; return 400 |

---

## Verification & rollout (standing rules)

- **TDD / subagent-driven** per established practice: a failing test first for each fix; each PR implemented + spec-reviewed + code-quality-reviewed.
- **Build gate:** `CI=true npx next build --turbopack` before each push (matches Vercel/Turbopack).
- **Deploy:** direct to prod per the feature-branch → PR → merge flow; **no feature flags** (all are straight fixes, additive or behavior-preserving; no migration).
- **Source of truth:** on each prod push, bump the CLAUDE.md `LAST_UPDATED` anchor + brief prose and append full detail to `plans/CHANGELOG.md`. Notion task auto-fires on push.

---

## Pre-implementation checks (do before coding PR-1)

1. Confirm the coach page `app/(portal)/portal/workshops/[id]/surveys` does **not** call `surveys/assign` or embed `survey-template-editor` (would mean coaches legitimately assign → owner-scope instead of ADMIN-gate). Caller grep so far shows only the admin editor.
2. **Check `lib/global-rate-limit.ts`**: it already rate-limits the `surveys/assign` path. Determine whether `accept-invite` and/or `files` upload are **already covered by this global layer** — if so, the two rate-limit "gaps" may be partially/fully mitigated and drop in priority or out of PR-1.

---

## Scope decision (2026-06-22, post-build) — descoped after PR-1 + 2 createMany refactors shipped

User chose "high-value rest, descope the marginal." **DOING:** PR-3 (Inngest correctness), PR-4 (robustness), PR-2 evaluate-access-change. **DESCOPED (deferred, not done):**
- **Bulk-import dedup ×2** (`organizations/[id]/respondents/bulk` + `assessment-campaigns` wizard) — plan flagged med-high risk (in-batch dedup) for low value (admin-operated, infrequent, bounded). Per-row `findFirst` stays.
- **trends + campaign-detail RSC read-consolidation** — low value, awkward to unit-test as server components.
- **PR-2b campaign-list pagination + paging UI** — low-med value, multi-file UI change. The endpoint stays unpaginated (bounded today); revisit if it grows.

Status of shipped: PR-1 security committed `17af202`; PR-2 createMany committed `6b2cd4f`.

## Out of scope / not changed

- **Charge 01 (secrets):** cleared — no `.env` in git history, prod env ignored, no source-level leak.
- **Charge 02 (Supabase RLS):** N/A — Prisma/Neon, app-layer authz.
- **False positive (excluded):** `services/hubspot.ts:84–114` search-then-create TOCTOU — verifier ruled non-issue in context.
- **Exactly-once email delivery** (see PR-3 residual).

---

## Open questions — RESOLVED via codebase investigation (2026-06-20)

- **Q-A. Rate-limit double-coverage:** RESOLVED — NO. `global-rate-limit.ts` (Edge middleware, in-memory per-instance Map, IP-keyed, runs before auth) classifies only via an **exact-match** auth allowlist that omits `accept-invite`, and has **no `/api/files` predicate**. Both endpoints are unlimited at both layers. Per-route `withRateLimit` (Redis-backed, stronger) confirmed as the correct fix. Plan unchanged.
- **Q-B. `surveys/assign` ADMIN vs owner-scope:** RESOLVED — no coach flow assigns surveys. Coach surveys page is a read-only viewer; only caller of `assign` is the admin-only editor. ADMIN gate correct. Plan unchanged.
- **Q-C. `execute-workflow.ts` SENT parity:** RESOLVED — it DOES write SENT children (both paths use `recordRecipientExecution`). PR-3 = read-side only, querying by `(stepId, workshopId, registrationId)` across parentId. **One scope call remains** (immediate-path executionId gap) — see PR-3 "Coverage boundary."
- **Q-D. `files` list gate granularity:** privileged-only (decided; only admin tools call it).
- **Q-E. participants re-select:** RESOLVED — returned rows are discarded; no re-select needed. Plan simplified (see PR-2).
- **Q-F. Campaign-list pagination:** RESOLVED (factually) — bare pagination would silently truncate `PublicCampaignsManager`'s client-side PUBLIC filter. **Scope call remains** — see PR-2 "PENDING USER DECISION."
- **Q-G. PR independence:** RESOLVED — PR-1 and PR-2 are fully independent (disjoint files, authz helpers only read, not edited). Any order.

## Two scope decisions — DECIDED (2026-06-20)
1. **Q-F — campaign-list pagination:** **full rework** (server-side `accessMode` filter + server-side filtering in `PublicCampaignsManager` + paging UI + `take`/cursor). See PR-2 table. Upgraded LOW → medium.
2. **Q-C — PR-3 immediate-path coverage:** **also fix the immediate path** — synthesize a deterministic `executionId` (`inngestRunId`+`stepId`) so SENT children exist on the immediate path and the dedup covers it. See PR-3.

_Both chosen toward fuller coverage. Net effect: PR-2 gains a multi-file UI change; PR-3 absorbs the executionId-synthesis follow-on._

---

## Co-validate consolidation (Codex staff-eng review, 2026-06-22)

All five Codex points verified against code and **accepted**; two additional findings from the parallel self-review kept. PR set updated above.

| # | Source | Issue | Resolution |
|---|---|---|---|
| 1 | Codex | `files/[id]` GET should mirror the **download route's read policy** (incl. `canRoleAccessAttachment` status gate), not the PATCH rule; GET also leaks `blobUrl` | PR-1 file row revised; cited handler corrected (97–105 = PATCH) |
| 2 | Codex | Workflow authz incomplete — `workflows/route.ts` create + duplicate open to non-admins | PR-1 row added; **product decision pending (below)** |
| 3 | Codex | Stop copying stale-JWT `session.user.role`; use DB-backed `getApiActor()` + shared helper (`requireAdminActor`/`canReadFile` — don't exist yet) | PR-1 "Authz implementation" note added; scope-bounded to touched gates |
| 4 | Codex | PR-3 dedup under-specified + would break legitimate/manual resend; not race-safe | PR-3 redesigned: parent-row upsert keyed by logical-run id, dedup under that parent, `forceResend` bypass |
| 5 | Codex | Split campaign-list pagination from the N+1 work | New **PR-2b**; PR-2 keeps only the `accessMode` filter |
| 6 | self | Bulk-import prefetch must handle in-batch duplicates; writes stay per-row | PR-2 bulk row flagged medium-high; "earn its risk?" note |
| 7 | self | Add positive "privileged still 200" tests, not only "coach 403" | PR-1 test note updated |

**Scope-bounding (partial override of Codex #3):** standardize authz to DB-backed `getApiActor()` only for the gates this pass already touches + the file read; rewriting every existing gate platform-wide is a separate hardening (it adds a DB read per request and is a broad behavior change) — not folded in.

## Workflow authz domain — DECIDED (2026-06-22): (A) admin-domain
`workflows/route.ts` create + duplicate are gated to ADMIN in PR-1, alongside the step routes. No coach workflow UI exists, so this enforces existing intent without removing any real capability. The whole workflow domain (collection create/duplicate + step sub-routes) becomes ADMIN-only. No further open decisions — the plan is implementation-ready.
