# Jeff May 6 Sprint — Single Source of Truth

> **Triage filed 2026-05-07.** Status board first; impl notes filled as work happens. Notion is the active task tracker; this file is the cross-source ledger.

## Sources

Two related Jeff Verdun emails on May 6, 2026 fold into this sprint:

- **Bug List/Improvement List 5/6/26** (Wed May 6, 3:55 PM) — 7 bugs + 11 v2.5 improvements + 2 questions. The "workflow timing issues" bullet is a forward-pointer to the email below.
- **Workflow testing results** (Wed May 6, 7:29 PM) — already triaged into 3 separate workflow-timing tickets (filed 2026-05-07 ~08:21 UTC).

---

## Status Board

23 items total: 9 bugs (3 already filed) · 11 enhancements · 2 questions. State labels follow the `triage` skill convention (`ready-for-agent` / `ready-for-human` / `needs-info`). Severity: P0 ship-blocker / P1 functional / P2 polish/v2.5.

### Bugs (9)

| ID | Title | Sev | State | Notion | Source |
|----|-------|-----|-------|--------|--------|
| BUG-MAY6-1 | Survey workflow step fires at wrong time (sequential sleep ordering) | P0 | **shipped May 7** | [ticket](https://www.notion.so/3598c45dd82981e98578c7a6069f4ba4) | 7:29 PM email |
| BUG-MAY6-2 | Post-Event Coach Survey Sequence does not auto-attach (categoryId wildcard) | P0 | **shipped May 7** | [ticket](https://www.notion.so/3598c45dd82981658cddc67c70c1aee3) | 7:29 PM email |
| BUG-MAY6-3 | calculateSendDate ignores timezone for sendTimeOfDay (post-event 9 AM fires at 5 AM ET) | P0 | **shipped May 7** | [ticket](https://www.notion.so/3598c45dd82981abbce9c584b79ecae7) | 7:29 PM email |
| BUG-MAY6-4 | Coupon codes not workshop-scoped (revenue/integrity bug) | P0 | **shipped May 7** (commit `b50ddd7`) | [ticket](https://www.notion.so/3598c45dd829811c81b0c227a77c4895) | 3:55 PM email |
| BUG-MAY6-4a | Audit prior cross-workshop coupon redemptions | P0 | ready-for-human | [ticket](https://www.notion.so/3598c45dd82981c5847fe5be0eb1f634) | spawned from BUG-MAY6-4 |
| BUG-MAY6-5 | Admin convo history shows partial vs coach (full) | P1/High | ready-for-agent | [ticket](https://www.notion.so/3598c45dd829813aaafccad91625f7fe) | 3:55 PM email |
| BUG-MAY6-6 | Registration page marketing opt-in default unchecked | P1 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd82981648487fa138cdb8685) | 3:55 PM email |
| BUG-MAY6-7 | Workshop wizard defaults to Physical, should default to Virtual | P1 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd82981758aa9c9b39336154a) | 3:55 PM email |
| BUG-MAY6-8 | Survey results screen missing from admin workshop page (parity with coach) | P1 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd82981e082d0f625028c8dbf) | 3:55 PM email |
| BUG-MAY6-9 | Survey results don't show name of respondent | P1 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd82981fd9251db782ae96d28) | 3:55 PM email |
| BUG-MAY7-2 | INFO_REQUEST/INFO_RESPONSE prefix in approval thread | P2 | **shipped May 8** (commit `ba13410`) | [ticket](https://www.notion.so/3598c45dd8298176894df6331a37ab27) | spawned from BUG-MAY6-5 verify |

### Enhancements for v2.5 (11)

| ID | Title | Sev | State | Notion |
|----|-------|-----|-------|--------|
| ENH-MAY6-1 | Registration list on coach workshop page (parity with admin) | P2 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd8298101b9e4dd59bf88c935) |
| ENH-MAY6-2 | Admin notes field on workshop (admin eyes only) | P2 | **shipped May 8** (commit `5c6ef26`) | [ticket](https://www.notion.so/3598c45dd8298124b82efcc5caa63679) |
| ENH-MAY6-3 | Survey preview option | P2 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd829817fab21eada0bd8a07c) |
| ENH-MAY6-4 | Affiliate code option only on Thank You page in template editor | P2 | **shipped May 8** (commit `ba13410`) | [ticket](https://www.notion.so/3598c45dd82981fe8fced24d1cb34b09) |
| ENH-MAY6-5 | Affiliate code editable on individual workshop, not just template | P2 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd829816ba15fe2a425274d7c) |
| ENH-MAY6-6 | Affiliate code: swap iDev for new provider (security: pin host, do NOT relax validator) | P2 | needs-info | [ticket](https://www.notion.so/3598c45dd82981aab737f994366bca1e) |
| ENH-MAY6-7 | Coupon codes support dollar amounts (sequence behind BUG-MAY6-4) | P2 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd8298103aa74e667ff62bf91) |
| ENH-MAY6-8 | Aggregator: show who answered + show text answers | P2 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd829813386a6c5d32e0f0647) |
| ENH-MAY6-9 | Aggregator promoted to top-level toolset (filter/sort/group like Financials) | P2 | ready-for-human | [ticket](https://www.notion.so/3598c45dd829816db51cd20d28d634ce) |
| ENH-MAY6-10 | Workflow execution status: include recipient email per row | P2 | **shipped May 8** (commit `2fa224c`, slim Alpha) | [ticket](https://www.notion.so/3598c45dd82981f1854de26f20dfe34b) |
| ENH-MAY6-11 | Thanks-for-registering + thanks-for-attending emails should be coach-editable | P2 | ready-for-human | [ticket](https://www.notion.so/3598c45dd82981308afbff2e0cf4f067) |

### Questions (2)

| ID | Title | Sev | State | Notion |
|----|-------|-----|-------|--------|
| Q-MAY6-1 | Refund-needed digest for cancelled paid workshops (next release) | P2 | ready-for-human | [ticket](https://www.notion.so/3598c45dd8298181ad48ccdf878429a8) |
| Q-MAY6-2 | HubSpot lookup-by-email for coach status field (feasibility scoping) | P2 | needs-info | [ticket](https://www.notion.so/3598c45dd829811b9d3ec0a7e826a656) |

---

## Confirmed root causes (pre-investigation notes for ready-for-agent tickets)

### BUG-MAY6-4 — Coupon codes not workshop-scoped (CONFIRMED)

**Location:** [src/services/stripe.ts:96-108](../src/src/services/stripe.ts#L96-L108) and [src/services/stripe.ts:148](../src/src/services/stripe.ts#L148)

**Root cause:** Two-part flaw in coupon validation:
1. `services/stripe.ts:103-108` — when `allowedPromotionCodeIds` is empty (workshop has no coupons), the filter is **skipped entirely** instead of rejecting any code. So Workshop B with zero coupons accepts Workshop A's "half" code.
2. `services/stripe.ts:148` — `allow_promotion_codes: true` is set in the Stripe Checkout session config, which lets users redeem ANY active Stripe promo code by typing it at checkout, regardless of which workshop's allowlist it belongs to.

**Repro:** Workshop 1 has coupon "half" (50% off). Workshop 2 has no coupons. User registers for Workshop 2, types "half" at Stripe checkout, gets the discount. Reported by Jeff May 6.

**Fix candidates (require design check before commit):**
- (a) Tighten `stripe.ts:103-108` so empty allowlist always rejects (instead of skipping the check)
- (b) Audit how the Checkout flow surfaces coupon entry UX:
  - If we use Stripe's hosted promo entry (relies on `allow_promotion_codes: true`): keep the flag AND scope the lookup to workshop-owned promo IDs only via Stripe metadata
  - If we use our own input: removing `allow_promotion_codes: true` is safe and simplest

**Do not just yank the flag without verifying the entry UX.**

**Recommended sequencing:** ENH-MAY6-7 (dollar coupons) queues behind this since both touch `services/stripe.ts`.

### BUG-MAY6-5 — Admin convo history partial (HYPOTHESIS, not confirmed)

**Hypothesis:** Coach view at [src/app/(portal)/portal/workshops/[id]/page.tsx:155-164](../src/src/app/(portal)/portal/workshops/[id]/page.tsx#L155-L164) aggregates `ApprovalMessage` rows across **all** `ApprovalQueue` rows for a given workshop. Admin workshop-detail view (file path unidentified) likely fetches messages for a single approval row only — so workshops with multiple approval rounds (initial + custom-pricing or resubmit) show "partial" thread on the admin side.

**Synthetic flag is NOT the culprit** — both queries include `synthetic: true` rows.

**First investigation step:**
1. `grep -rn "ApprovalMessage" src/src/app/\(dashboard\)/admin/workshops/` to find the admin workshop-detail thread render component
2. Compare its `messages` query to the coach side's
3. Query DB for "Scaling Up Exit convo testing" workshop: count `ApprovalQueue` rows for that `workshopId`, then count `ApprovalMessage` rows per approval — if the coach-side aggregates and admin-side doesn't, hypothesis confirmed
4. Bump severity to P0 if admin is confirmed materially blocked from required history

---

## Open needs-info — blocked on Jeff

| ID | What's blocked | Asked Jeff? |
|----|----------------|-------------|
| ENH-MAY6-6 | Affiliate code: provider name + URL pattern for new affiliate (replacing iDev) | Not yet — pending follow-up email |
| Q-MAY6-2 | HubSpot lookup feasibility — Jeff is asking IF it's possible | Not yet — needs feasibility doc |

---

## Impl details

_Populated as work begins on each ticket. Format: ID → commit hash → notes._

**BUG-MAY6-4** → `b50ddd7` (May 7 2026, direct push to main):
- Two leak paths fixed in `src/services/stripe.ts`. Path A: empty `allowedPromotionCodeIds` was skipping the membership check (`length > 0` short-circuit), so workshops with no coupons accepted any active code. Now empty allowlist always rejects via `const allowed = Array.isArray(...) ? ... : []; if (!allowed.includes(item.id)) return false;`. Path B: `allow_promotion_codes: true` was set when no in-app code was provided, surfacing Stripe's hosted promo entry which accepted any active code globally. Removed entirely — all coupon entry must enter through our scoped form → validator.
- Codex round-1 catch: `discounts: undefined` was being spread into `sessions.create` params. Refactored to build `Stripe.Checkout.SessionCreateParams` object explicitly and only set `params.discounts = discounts` when validated. Key now absent (not undefined) when no code.
- 4 new RED→GREEN guards + 1 flipped existing test. 20 stripe tests passing. ESLint clean (also dropped unused `eslint-disable` directive at file top).
- Sequencing: Codex round-2 argued ship coupon FIRST (revenue/control-plane bug, not polish); accepted over Jeff's "easy first" hint.
- BUG-MAY6-4a (audit prior cross-workshop redemptions) remains `ready-for-human` — refund/comp posture per case requires Jeff's judgment.

---

## v2.5 Sprint — Wave 1 (May 8, 2026)

Plan: `~/.claude/plans/do-we-need-to-cryptic-swan.md` — co-validated by Claude + Codex, sequenced by blast radius into 5 waves. Wave 1 = pure-UI one-liners (no schema, no API).

**BUG-MAY7-2** → `ba13410` (May 8 2026, cherry-picked from `fcd7351` on `docs/may4-followon-fixes`):
- `formatApprovalMessage` at `src/lib/approvals/approval-thread.ts:71-77` had INFO_REQUEST and INFO_RESPONSE both falling through to `return input.note ?? ""` — bare note, no marker, indistinguishable from generic admin comments in the approval thread. Original Notion ticket assumed INFO_RESPONSE was auto-generated (sort of self-describing); inspection showed both were unprefixed. Fix splits the cases: INFO_REQUEST → `Info request: ${note}` (or `""` if no note), INFO_RESPONSE → `Info response: ${note}` (or `""` if no note).
- 4 new RED→GREEN tests in `src/__tests__/lib/approval-thread.test.ts` covering both prefixes + both empty-note edge cases. 17 tests in suite, all passing.
- Backwards: stored messages stay bare; only new messages get the prefix. No migration.

**ENH-MAY6-4** → `ba13410` (May 8 2026, cherry-picked from `fcd7351`):
- Affiliate / Tracking Code field rendered in all three visual editor tabs (SOLO_LANDING / REGISTRATION / THANK_YOU) AND in the fallback JSON editor (BIO_PAGE / DUO_LANDING). `<CustomCodeRenderer>` (per CHG-03) only mounts on THANK_YOU pages, so the field was misleading on every other surface.
- Codex co-validate caught the fallback-editor leak — original ticket scoped only to the visual tabs. Fix applies in both places: visual editor's Affiliate Card now wrapped in `{templateType === "THANK_YOU" && (...)}`. FallbackJsonEditor signature pruned (no more `customCode` / `onCustomCodeChange` props), and its PATCH body no longer sends customCode.
- Existing `LandingPage.customCode` values preserved in the DB — only the UI affordance is hidden. No behavior loss since customCode never rendered on non-THANK_YOU pages anyway.
- 4 new RED→GREEN render tests in `src/__tests__/components/template-content-editor-affiliate.test.tsx` asserting field visibility per templateType. Tests required `queryAllByText` (not `queryByText`) because the Affiliate Card renders the title twice (CardTitle + Label inside the Card).

**Wave 1 totals:** 989 tests passing (up from 981 at sprint start, +25 over the day's full sprint work). Per-wave verification posture (one build/lint/test/push per wave, not per ticket) saved roughly 30 min vs the original "per-ticket verify" plan.

---

## v2.5 Sprint — Wave 2 (May 8, 2026)

Schema + data-model changes batched together. Both tickets shipped together via the per-wave verification posture; one Vercel deploy, one Notion sync, one CLAUDE.md update.

**ENH-MAY6-2** → `5c6ef26` (May 8 2026, cherry-picked to main):
- Side-table approach (`WorkshopAdminNote`) picked over a Workshop column for **structural** privacy, not policy. Coach-facing Prisma includes on Workshop never reach this table — there is no path that leaks notes via accidental `select: '*'` or `include: { workshop: true }`. Schema: `model WorkshopAdminNote { id, workshopId @unique, body, updatedBy, updatedAt, createdAt, workshop @relation onDelete: Cascade }` + reverse relation `adminNote WorkshopAdminNote?` on Workshop.
- API: new `PATCH /api/workshops/[id]/admin-notes` route, ADMIN/STAFF only via `getApiActor` + `isPrivilegedRole`. Coach gets 403; unauthenticated gets 401; non-string body gets 400; missing workshop gets 404. Body capped at 5000 chars. Audit log entry on every save.
- UI: new `<AdminNotesEditor workshopId initialBody />` client component (textarea + Save + privacy disclaimer "Admin/staff only. Not visible to the coach."). Save uses fetch PATCH; surfaces server errors inline. Mounted in admin workshop detail page sidebar (above Quick Actions). Page-side adds a parallel `db.workshopAdminNote.findUnique({ where: { workshopId: id }, select: { body: true } })` to the existing `Promise.all`.
- Tests: 6 RED→GREEN in `__tests__/api/workshop-admin-notes.test.ts` (coach-403, unauth-401, admin-upsert, staff-upsert, 404, 400-invalid-body) + 4 in `__tests__/components/admin-notes-editor.test.tsx` (render pre-fill, privacy disclaimer, PATCH on Save, error surface). All 10 GREEN.

**ENH-MAY6-10** → `2fa224c` (May 8 2026, cherry-picked to main, slim Alpha posture):
- Source: Jeff Verdun PDF May 6 → "On the execution status screen under workflows. It show a line for each person it emails. It should include the email of who it was sent to." The ticket assumed per-recipient rows existed in code; inspection confirmed the data was step-level rollups (one row per step covering N recipients invisibly). Restructured to deliver Jeff's literal ask.
- Architecture: Claude + Codex 3-round adversarial review via `/claudex:plan` (PLAN.md). Final plan accepted 4 high + 3 medium + 1 low across 3 review rounds. Slim Alpha implementation accepts a defined set of deferred hardening (documented in PLAN.md Changelog).
- **Schema:** new `WorkflowStepExecution.parentId` self-FK + `recipientEmail` snapshot column + composite unique `(parentId, registrationId)`. Top-level rows have parentId=null (parent rollup OR legacy single-target steps); per-recipient child rows have parentId set + non-null registrationId + non-null recipientEmail. Postgres treats NULLs as distinct in UNIQUE, so the composite key allows the parent (NULL) + N children (non-NULL distinct registrationIds) to coexist.
- **Helper:** `recordRecipientExecution(client, args)` at `lib/workflows/recipient-execution.ts` upserts keyed on (parentId, registrationId) for replay idempotency, validates non-empty parentId / registrationId / recipientEmail at runtime. `finalizeParentRollup(client, parentId)` exported but not yet called from execute-workflow (deferred wiring; Alpha posture).
- **Writers:** `execute-workflow.ts` SEND_SURVEY_LINK / SEND_FILE_LINK / EMAIL_ATTENDEES handlers now call `recordRecipientExecution(db, ...)` after each successful SMTP send. Existing dedup guards (`findFirst where status: SENT`) filter `parentId: null` so children's SENT doesn't trigger the step-level skip. `trigger-workflow-step.ts` (manual Trigger Now) deferred — filed follow-on for parity.
- **Readers:** workshop detail pages (admin + coach) filter `executions where parentId=null` so coach surfaces never see per-recipient PII. Admin sees only step-level status badges; admin /workflows execution-status screen sees full per-recipient detail.
- **API auth:** `/api/workflows/[id]/executions` tightened from `getServerSession` (any auth) to `getApiActor` + `isPrivilegedRole` (ADMIN/STAFF only). Coach gets 403 even if they guess a workflow id.
- **Render:** `workflow-executions.tsx` Execution interface adds `parentId` and `recipientEmail`. Group rows by parentId, sort children by recipient email asc, show per-recipient delivery status indented under the parent step row with status badge per child. Parent rows show recipient count subtitle ("3 recipients").
- Tests: 7 RED→GREEN in `__tests__/lib/recipient-execution.test.ts` (helper upsert keyed on composite unique, helper rejects malformed input, errorMessage capture, finalizeParentRollup precedence FAILED > SENT > SKIPPED + no-children no-op) + 2 mock additions in `execute-workflow.test.ts` (upsert + findMany default mocks so existing 989 tests stay green). 998 total tests, all GREEN.
- **Slim Alpha posture; deferred for hardening (full list in PLAN.md Changelog):**
  - `trigger-workflow-step.ts` per-recipient writes (manual Trigger Now path).
  - Per-recipient pre-send DB-check idempotency — Inngest replay can produce duplicate sends to already-SENT recipients. Risk acceptable in Alpha (no real users; admin can manually clean up).
  - `finalizeParentRollup` wiring — parent rollup status uses existing sentCount-based logic (parent SENT if any sent, SKIPPED if none) instead of FAILED > SENT > SKIPPED precedence. Per-recipient FAILED rows still visible on the admin /workflows screen.
  - Deterministic parent.id via `inngestRunId` for forceResend audit trail.
  - Error redaction codes (sanitized "smtp_send_failed" / "link_generation_failed" instead of raw provider strings in errorMessage).
- **Round-3 ops findings filed as separate follow-ons:** structured logging + alerts + runbook for the new parent/child state machine; PII retention/erasure policy for recipient email audit data; concurrency limit + load test for large workshop sizes.

**Wave 2 totals:** 998 tests passing (up from 989 at end of Wave 1). Three new migrations: `add_workshop_admin_note`, `add_workflow_step_execution_recipient_email`, `add_workflow_step_execution_parent_id` (all marked applied via `prisma migrate resolve --applied` since `db push` synced the schema directly to Neon).
