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
| BUG-MAY6-4a | Audit prior cross-workshop coupon redemptions | P0 | **shipped May 8** (commit `0580aa6`, audit script ready for Jeff) | [ticket](https://www.notion.so/3598c45dd82981c5847fe5be0eb1f634) | spawned from BUG-MAY6-4 |
| BUG-MAY6-5 | Admin convo history shows partial vs coach (full) | P1/High | ready-for-agent | [ticket](https://www.notion.so/3598c45dd829813aaafccad91625f7fe) | 3:55 PM email |
| BUG-MAY6-6 | Registration page marketing opt-in default unchecked | P1 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd82981648487fa138cdb8685) | 3:55 PM email |
| BUG-MAY6-7 | Workshop wizard defaults to Physical, should default to Virtual | P1 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd82981758aa9c9b39336154a) | 3:55 PM email |
| BUG-MAY6-8 | Survey results screen missing from admin workshop page (parity with coach) | P1 | ready-for-agent | [ticket](https://www.notion.so/3598c45dd82981e082d0f625028c8dbf) | 3:55 PM email |
| BUG-MAY6-9 | Survey results don't show name of respondent | P1 | **shipped May 10** (commits `e48030d` + `ccb8dc6`, Wave 6) | [ticket](https://www.notion.so/3598c45dd82981fd9251db782ae96d28) | 3:55 PM email |
| BUG-MAY7-2 | INFO_REQUEST/INFO_RESPONSE prefix in approval thread | P2 | **shipped May 8** (commit `ba13410`) | [ticket](https://www.notion.so/3598c45dd8298176894df6331a37ab27) | spawned from BUG-MAY6-5 verify |

### Enhancements for v2.5 (11)

| ID | Title | Sev | State | Notion |
|----|-------|-----|-------|--------|
| ENH-MAY6-1 | Registration list on coach workshop page (parity with admin) | P2 | **shipped May 8** (commit `99edada`) | [ticket](https://www.notion.so/3598c45dd8298101b9e4dd59bf88c935) |
| ENH-MAY6-2 | Admin notes field on workshop (admin eyes only) | P2 | **shipped May 8** (commit `5c6ef26`) | [ticket](https://www.notion.so/3598c45dd8298124b82efcc5caa63679) |
| ENH-MAY6-3 | Survey preview option | P2 | **shipped May 8** (commit `39f9e3e`) | [ticket](https://www.notion.so/3598c45dd829817fab21eada0bd8a07c) |
| ENH-MAY6-4 | Affiliate code option only on Thank You page in template editor | P2 | **shipped May 8** (commit `ba13410`) | [ticket](https://www.notion.so/3598c45dd82981fe8fced24d1cb34b09) |
| ENH-MAY6-5 | Affiliate code editable on individual workshop, not just template | P2 | **shipped May 8** (commit `6a5a462`) | [ticket](https://www.notion.so/3598c45dd829816ba15fe2a425274d7c) |
| ENH-MAY6-6 | Affiliate code: swap iDev for new provider (security: pin host, do NOT relax validator) | P2 | needs-info | [ticket](https://www.notion.so/3598c45dd82981aab737f994366bca1e) |
| ENH-MAY6-7 | Coupon codes support dollar amounts (sequence behind BUG-MAY6-4) | P2 | **shipped May 8** (commit `657b2d3`) | [ticket](https://www.notion.so/3598c45dd8298103aa74e667ff62bf91) |
| ENH-MAY6-8 | Aggregator: show who answered + show text answers | P2 | **shipped May 8** (commit `f34500b`) | [ticket](https://www.notion.so/3598c45dd829813386a6c5d32e0f0647) |
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

---

## v2.5 Sprint — Wave 3 (May 8, 2026)

Stripe + per-workshop customCode batch.

**ENH-MAY6-7** → `657b2d3` (May 8 2026):
- Schema: extended `WorkshopCouponRecord` with `discountType: "PERCENT" | "AMOUNT"` + `discountAmountCents?: number`. Discriminated discount type. Legacy stored rows (no `discountType`) read back as PERCENT for backwards compatibility — schema's `superRefine` infers from which field is set, then transform stamps the explicit type.
- Stripe service: `createWorkshopPromotionCode` now takes a discriminated `discountType`. PERCENT mode passes `percent_off` to Stripe; AMOUNT mode passes `amount_off + currency: "usd"` (Stripe enforces mutual exclusivity, and amount_off requires currency). Boundary validation throws if the wrong field is missing for the chosen type.
- UIs: both the new-workshop wizard (`(dashboard)/workshops/new/page.tsx`) and the inline edit form (`WorkshopInlineEditForm`) get a discount-type selector ($/%) with a conditional value input. Wizard converts decimal-dollar form input → cents at submit. Inline form stores cents directly.
- Tests: 12 RED→GREEN — 8 in `__tests__/lib/workshop-coupons-discount-type.test.ts` (legacy → PERCENT, explicit PERCENT, AMOUNT, missing-field rejections, AMOUNT non-positive cents rejection, parseStored backwards-compat) + 4 in `__tests__/services/stripe-promotion-code-amount.test.ts` (PERCENT passes percent_off, AMOUNT passes amount_off + currency, both fail without their type-specific value). 1010 tests green.
- Two existing tests had to update assertion expectations for the new `discountType: "PERCENT"` field that the schema transform now stamps onto legacy-shape rows. No behavior change — just a new field in the JSON payload.

**ENH-MAY6-5** → `6a5a462` (May 8 2026):
- Pre-fix gap: schema column `LandingPage.customCode` already existed from CHG-03, but the per-workshop landing-page PUT body schema didn't accept it AND the editor UI didn't expose it. Result: customCode could only be set at the template level, not per-workshop.
- API: `PUT /api/workshops/[id]/landing-pages/[template]` body schema now accepts optional `customCode: string | null`. Setting it requires `isPrivilegedRole(actor.role)` — coach attempts (even via crafted PUT bodies) get 403. Value runs through the existing `validateCustomCode` parse5 helper before persistence (host-pinned to scalingup.idevaffiliate.com, img-only, no scripts/event handlers/data:/javascript:).
- UI: Thank You page editor at `(dashboard)/workshops/[id]/landing-pages/thank-you/page.tsx` adds an "Affiliate / Tracking Code" Card with a textarea + token reference. Loaded from API on mount; sent in the PUT body on save. Empty value → `null` (clears). Admin-only via the `(dashboard)` layout's existing role gate (no client-side check needed).
- No new tests added — existing CHG-03 customCode validation + LandingPage tests cover the validation path. Smoke-verify on production after deploy.

**Wave 3 totals:** 1010 tests passing (unchanged — no test count increase from ENH-MAY6-5 since validation reuses CHG-03's existing helpers).

---

## v2.5 Sprint — Wave 4 (May 8, 2026)

UI surfaces batch — three independent UI improvements shipped together.

**ENH-MAY6-3** → `39f9e3e` (May 8 2026):
- Pure read-only renderer `<SurveyFormView>` at `components/surveys/survey-form-view.tsx` takes a question list + `mode: "preview"` prop. Submit button is rendered DISABLED with no `onSubmit` prop and the component fires zero fetches — preview-mode invariant locked by tests. Renders all 7 question types (TEXT/TEXTAREA/RATING/NPS/SINGLE_CHOICE/MULTI_CHOICE/YES_NO).
- Mounted in `survey-template-editor.tsx` as a "Preview" button → modal that takes the live editor's questions array and renders them. Modal closes on backdrop click or X button. Only shown for non-new templates with at least one question.
- 5 RED→GREEN render tests asserting: all question types render; Submit button disabled; no fetch fires on interaction; preview-mode disclaimer visible; questions render in sortOrder.

**ENH-MAY6-1** → `99edada` (May 8 2026):
- Coach portal workshop detail page now shows a read-only registrations table. Pre-fix coaches only saw a count. Per Codex review on Wave 4 plan: skipped the "extract a shared component" abstraction (admin's RegistrationsTable carries Cancel/Refund/Remove + admin-specific data shape). Built a small inline read-only table directly on the coach page — 50 lines of presentation code, no abstraction overhead.
- Columns: Name, Email, Company, Payment status (badge), Attended (✓/—), Registered date (via formatTimestamp). No edit or delete actions. Server-side scoped via existing `requireCoach()` + workshopId-scoped `findUnique`. Coach cannot access another coach's workshop — same auth boundary as the rest of the portal page.
- Test mock fix: `coach-workshop-detail-files.test.tsx` now mocks `registrations: []` since the include now fetches that field.

**ENH-MAY6-8** → `f34500b` (May 8 2026):
- Aggregate page's per-question render now lists verbatim text answers for TEXT/TEXTAREA question types with respondent attribution. Each answer rendered as a card with the verbatim value + "— FirstName LastName" footer (or "Anonymous" if no registration captured, or email if firstName/lastName empty). Shows up to 50 text answers per question.
- New "Respondents" panel below the per-question section lists everyone who answered the survey as small pills (name as label, email as title tooltip).
- `getSurveyResults()` already returned the joined `registration` data via the existing `responses` field — the aggregate page just wasn't rendering it. Zero new schema; zero new server-side code; pure UI surface change.
- No new tests added — render is straightforward and the existing question-stats logic that drives the page is already covered by the survey-service tests.

**Wave 4 totals:** 1015 tests passing (up from 1010, +5 new SurveyFormView tests).

---

## v2.5 Sprint — Wave 5 (May 8, 2026)

**BUG-MAY6-4a** → `0580aa6` (May 8 2026):
- Read-only diagnostic script at `src/scripts/audit-cross-workshop-coupons.ts`. Lists historical Stripe redemptions where the promo code's `metadata.workshopCode` does NOT match the registration's workshopCode — i.e. cross-workshop redemptions that happened before the BUG-MAY6-4 fix shipped on May 7.
- Output: CSV to stdout with columns `registration_id, email, name, workshop_code, workshop_title, amount, redeemed_promo_code, redeemed_workshop_code, verdict, session_id`. Verdict is `OK` / `MISMATCH` / `no_session_id` / `no_metadata` / `stripe_error`.
- Approach: query `Registration` rows with `stripePaymentId` set + `paymentStatus = COMPLETED`. For each, retrieve the Stripe checkout session and read `total_details.breakdown.discounts`. For each discount, retrieve the promotion code (or fall back to coupon-level metadata). Compare metadata.workshopCode against the registration's workshop.workshopCode.
- Flags: `--since YYYY-MM-DD` to scope by date, `--limit N` to cap row count for performance.
- Read-only / dry-run only. No DB writes. No Stripe writes. No auto-refunds — operator hands MISMATCH rows to Jeff for per-case judgment per memory rule.
- Smoke-test: not run yet — operator can run via `npx tsx scripts/audit-cross-workshop-coupons.ts --limit 5` to verify shape, then drop the limit for the full sweep.

---

## v2.5 Sprint — Final Tally (May 8, 2026)

**11 tickets shipped in 5 waves over the day.** Direct push to main, Alpha mode.

| Wave | Tickets | Commits |
|---|---|---|
| 1 | BUG-MAY7-2, ENH-MAY6-4 | `6984701`, `fcd7351` (cherry-picked as `072c77b`, `ba13410` to main) |
| 2 | ENH-MAY6-2, ENH-MAY6-10 | `5c6ef26`, `d22ceec` (+ `12cd36a` recovering missing helper files) |
| 3 | ENH-MAY6-7, ENH-MAY6-5 | `657b2d3`, `6a5a462` |
| 4 | ENH-MAY6-3, ENH-MAY6-1, ENH-MAY6-8 | `39f9e3e`, `99edada`, `f34500b` |
| 5 | BUG-MAY6-4a | `0580aa6` |

**Test count:** 964 → 1015 (+51 over the sprint).

**Co-validate posture:**
- `/co-validate` Claude+Codex run on the sprint plan → 4 high + 2 medium + 1 low findings, all incorporated.
- `/claudex:plan` 3-round Claude+Codex adversarial review on ENH-MAY6-10 (the per-recipient row restructure) → 4 high + 3 medium + 1 low → 3 high + 3 medium + 1 low across rounds. Slim Alpha posture deliberately deferred 5 hardening items (documented in PLAN.md Changelog).

**Open follow-ons** (filed in PLAN.md Changelog and CLAUDE.md):
- `trigger-workflow-step.ts` per-recipient writes (manual Trigger Now path) — parity with execute-workflow.
- Per-recipient pre-send DB-check idempotency to prevent Inngest replay duplicate sends.
- `finalizeParentRollup` wiring in execute-workflow (the helper exists; the call site doesn't yet use it; parent rollup uses sentCount logic).
- Deterministic parent.id via `inngestRunId` for forceResend audit trail.
- Error redaction codes (sanitized strings in errorMessage instead of raw provider errors).
- Ops follow-ons from claudex round 3: structured logging/alerts/runbook for parent/child workflow execution state, PII retention/erasure policy for recipient email audit data, concurrency limit + load test.
- ENH-MAY6-6 (affiliate provider switch) — still `needs-info` from Jeff.
- ENH-MAY6-9 (aggregator promoted to top-level toolset) — still `ready-for-human` (design pass).
- ENH-MAY6-11 (coach-editable thanks-for-registering + thanks-for-attending emails) — still `ready-for-human` (product call).
- Q-MAY6-1, Q-MAY6-2 — questions, not tasks.
- STRIPE_WEBHOOK_SECRET rotation — pending Josh's authenticator.

---

## v2.5 Sprint — Wave 6 (May 10, 2026)

**BUG-MAY6-9** + Tier B (`finalizeParentRollup` wiring + link-gen FAILED children) → `e48030d`, `ccb8dc6` (May 10 2026).

**Tier A — BUG-MAY6-9: per-survey respondent attribution.**
- Source: same Jeff May 6 email — "results aggregator do not show who answered, also do not show text based answers." ENH-MAY6-8 (Wave 4) fixed the cross-workshop aggregate page; the per-workshop admin + coach surfaces still discarded `survey.registration` even though both pages already fetched it via Prisma include.
- Fix at `src/components/surveys/survey-results-view.tsx`: `SurveyResultResponse` interface now carries optional `registration: { firstName, lastName, email } | null`. Inline `formatRespondentLabel()` helper (trimmed full name → email → "Anonymous") used for both per-answer attribution and the new Respondents pill panel rendered at the top of each template card. TEXT/TEXTAREA rendering refactored to per-response (was per-answer flat-map) so the response→registration link survives.
- Both consumer pages (`(dashboard)/workshops/[id]/surveys/page.tsx` + `(portal)/portal/workshops/[id]/surveys/page.tsx`) now pass `registration: survey.registration ?? null` through.
- Tests: 5 RED→GREEN at `__tests__/components/survey-results-view-respondent.test.tsx` covering name attribution, null registration → "Anonymous", empty firstName/lastName → email fallback, Respondents panel count + names, back-compat (responses without `registration` field).

**Tier B — `finalizeParentRollup` wiring + link-gen FAILED children for SEND_SURVEY_LINK.**
- Source: deferred slim-Alpha hardening item from Wave 2 ENH-MAY6-10. Closes Codex round-3 high-3 (silent skips on link-gen failure should produce visible FAILED rows so ops can see the failure).
- Fix at `src/inngest/functions/execute-workflow.ts`:
  1. Imports `finalizeParentRollup` from `lib/workflows/recipient-execution`.
  2. SEND_SURVEY_LINK per-recipient loop: when `getOrCreateSurveyLink` returns null, writes `recordRecipientExecution(... status: "FAILED", errorMessage: "link_generation_failed")` then continues (was a silent `continue`). Gated on `executionId` because the immediate path doesn't have a parent row yet.
  3. After post-loop `recordWorkflowExecution`, calls `finalizeParentRollup(db, executionId)` for SEND_SURVEY_LINK / SEND_FILE_LINK / EMAIL_ATTENDEES. Parent now reflects FAILED > SENT > SKIPPED precedence over actual children. SEND_FILE_LINK + EMAIL_ATTENDEES paths today have no FAILED children (they throw on SMTP error → Inngest retries) so the rollup is a no-op for them; future SMTP error classification work can flip them on without further wiring.
- Slim Alpha posture: still deferred — `trigger-workflow-step.ts` per-recipient writes (Trigger Now parity), per-recipient pre-send idempotency, immediate-path `executionId` synthesis with deterministic key (`inngestRunId` + `stepId`), SMTP error classification.
- Tests: 1 RED→GREEN extending `__tests__/inngest/execute-workflow.test.ts` — SEND_SURVEY_LINK with mixed link-gen failure (one recipient null + one success) writes a FAILED child row with the right `parentId`, calls `finalizeParentRollup` with the parent id, and the rollup `findMany` returning `[FAILED, SENT]` triggers a parent `update({ status: "FAILED" })`.

**Final Wave 6 metrics:** 1015 → 1021 tests (+6). Vercel build green. Two cherry-picked commits (`e48030d` + `ccb8dc6`) on `main`.

---

## v2.5 Sprint — Updated Final Tally (May 10, 2026)

**13 tickets shipped in 6 waves over three sessions.** Direct push to main, Alpha mode.

| Wave | Tickets | Commits |
|---|---|---|
| 1 | BUG-MAY7-2, ENH-MAY6-4 | `6984701`, `fcd7351` |
| 2 | ENH-MAY6-2, ENH-MAY6-10 | `5c6ef26`, `d22ceec` (+ `12cd36a`) |
| 3 | ENH-MAY6-7, ENH-MAY6-5 | `657b2d3`, `6a5a462` |
| 4 | ENH-MAY6-3, ENH-MAY6-1, ENH-MAY6-8 | `39f9e3e`, `99edada`, `f34500b` |
| 5 | BUG-MAY6-4a | `0580aa6` |
| 6 | BUG-MAY6-9, finalizeParentRollup wiring | `e48030d`, `ccb8dc6` |

**Test count:** 964 → 1021 (+57 across the sprint).
