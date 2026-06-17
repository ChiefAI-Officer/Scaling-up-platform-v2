# Spec 17 Wave D — Campaign Setup Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (per-task: implementer → spec-compliance review → code-quality review). Steps use `- [ ]` checkboxes. Canonical design: [`17d-wave-d-campaign-setup-design.md`](17d-wave-d-campaign-setup-design.md) — **its §/claudex:plan hardening is AUTHORITATIVE** where it conflicts with the design body. ADR: [`0009`](../../adr/0009-assessment-campaign-auto-send-lifecycle.md).

**Goal:** Ship Spec 17 Wave D — delete campaigns (#1), invite timing + auto-send (#2/#3), results toggle (#15), coach-notify (#16), template-in-step (#17), select-all (#18), full-HTML invitation email (#20). (#19 custom slides is a separate gated mini-wave.)

**Architecture:** One additive migration (no destructive ops, no new status enum). Auto-send via an Inngest fan-out (batched ≤25, per-campaign concurrency=1, CAS claim + heartbeat lease) with a cron backstop. Results/coach emails via the existing submission-bound `AssessmentEmailOutbox` (rendered at enqueue). Per-campaign full-HTML invitation email behind a new coach-safe email sanitizer. Soft-delete via a canonical `liveCampaign` helper. Everything behind default-OFF Wave-D feature flags + an `ASSESSMENT_SENDS_PAUSED` kill switch.

**Tech stack:** Next.js App Router (Turbopack 16.1.6), TypeScript, Prisma/Neon, Inngest, Jest+RTL, Playwright. Build gate from `src/`: `CI=true npx next build --turbopack`.

**Branch:** `feat/wave-d-campaign-setup` (off `main`). Source under `src/src`. Commands from `/Users/diushianstand/Scaling-up-platform-v2/src`.

---

## Pre-flight (read before Task 1)

- **Additive-only migration discipline:** never `migrate reset`/`migrate dev` against prod; one forward migration with nullable/defaulted columns + a data backfill. Run `node scripts/check-migration-safety.mjs` (or the project's equivalent) before applying.
- **Feature flags are default-OFF:** merging is dark. Enable is a separate flip per the Wave-B precedent (`WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED`).
- **Loose end (non-blocking):** `ADR-0008` is referenced in CLAUDE.md but the file is absent from `docs/adr/`. Task 0 below recreates it from the CHANGELOG so the reference resolves.
- **Per-task gate:** `CI=true npx next build --turbopack` (tail -15) + targeted Jest + `npx eslint <changed files>` (0/0). Paste real gate output in each implementer report.

---

## File structure (created / modified)

**Created**
- `src/prisma/migrations/<ts>_wave_d_campaign_setup/migration.sql` — all Wave-D columns + index + backfill (Task 1)
- `src/src/lib/assessments/campaign-live.ts` — `liveCampaign` query/access helper (Task 2)
- `src/src/lib/assessments/invite-send.ts` — extracted per-recipient invite-create+send + batch logic (Task 7)
- `src/src/inngest/functions/assessment-invite-fanout.ts` — fan-out fn (concurrency=1, CAS, heartbeat) (Task 8)
- `src/src/inngest/functions/assessment-scheduled-send-cron.ts` — `*/3` cron backstop (Task 8)
- `src/src/lib/assessments/email-html-sanitizer.ts` — coach-safe email sanitizer + token-placement validator (Task 11)
- `src/src/lib/feature-flags.ts` (or extend existing) — Wave-D flags + kill switch (Task 1b)
- `docs/adr/0008-public-self-assessments-show-taker-results.md` — recreate from CHANGELOG (Task 0)
- `docs/specs/v7.6/17d-ops-runbook.md` — rollback + Inngest pause/replay runbook (Task 13)

**Modified**
- `src/prisma/schema.prisma` — campaign + template columns, no new status enum (Task 1)
- `src/src/components/assessments/CampaignWizard.tsx` — Step-3 template name (#17), Step-2 select-all (#18), timing radio + openAt gating + consequence button (#2/#3), results/notify toggles (#15/#16), HTML editor (#20)
- `src/src/components/assessments/CampaignDetail.tsx` — openAt round-trip fix, per-row late-add send, HTML editor, soft-delete via `liveCampaign`
- `src/src/app/api/assessment-campaigns/route.ts` — versioned atomic create + auto-send enqueue + participant re-auth; list via `liveCampaign`
- `src/src/app/api/assessment-campaigns/[id]/route.ts` — DELETE (ownership predicate, soft-delete) + GET via `liveCampaign`
- `src/src/app/api/assessment-campaigns/[id]/invite/route.ts` — gate bulk early-send; per-row late-add only
- `src/src/app/(public)/org-survey/[campaignAlias]/{exchange,me,submit}/route.ts` — `deletedAt IS NULL`; #15/#16 enqueue in submit tx; adaptive landing flag
- `src/src/lib/auth/authorization.ts` (or campaign authz module) — `canManageCampaign` loads live by default
- report/export/trends/aggregate loaders — route through `liveCampaign`

---

## Task 0 — Recreate the missing ADR-0008 (non-blocking housekeeping)

**Files:** Create `docs/adr/0008-public-self-assessments-show-taker-results.md`.

- [ ] **Step 1:** From `plans/CHANGELOG.md` + CLAUDE.md references, reconstruct ADR-0008 ("public self-assessments show the taker their results in-page; `Cache-Control: no-store`") in the repo ADR format (title → Context → Considered options → Consequences). It is referenced by #15 + ADR-0009.
- [ ] **Step 2:** Commit `docs: recreate referenced ADR-0008 (public self-assessments show taker results)`.

---

## Task 1 — Additive migration (all Wave-D columns, no new status, index, backfill)

**Files:** Modify `src/prisma/schema.prisma`; create the migration.

- [ ] **Step 1 — Write the failing test** (`src/src/__tests__/prisma/wave-d-migration.test.ts`): assert the campaign has `deletedAt`, `inviteTiming` (enum `IMMEDIATELY|ON_OPEN` default `IMMEDIATELY`), `inviteSendStartedAt`, `inviteSendHeartbeatAt`, `invitesSentAt`, `sendResultsToRespondent` (default false), `notifyCoachOnCompletion` (default false), `invitationBodyHtml`; the template has `resultsEmailContentApprovedHash`, `resultsEmailContentApprovedAt`, `resultsEmailContentApprovedBy`; and **assert `AssessmentCampaignStatus` has NO `SCHEDULED` member** (guard test, R3-M8).
- [ ] **Step 2 — Run:** `npm test -- wave-d-migration` → FAIL.
- [ ] **Step 3 — Schema:** add the columns above (all nullable/defaulted). Add `enum AssessmentInviteTiming { IMMEDIATELY ON_OPEN }`. **Do NOT add a `SCHEDULED` status.**
- [ ] **Step 4 — Migration SQL:** generate via `npx prisma migrate dev --name wave_d_campaign_setup --create-only` (dev DB only), then hand-edit to include:
  - `ADD COLUMN ... ` for all of the above.
  - **Backfill (R3-H3):** `UPDATE "AssessmentCampaign" SET "invitesSentAt" = COALESCE("invitesSentAt","createdAt") WHERE "invitesSentAt" IS NULL;` — so the cron never re-sends a pre-existing campaign.
  - **Partial composite index (R1-M10/R3-M7):** `CREATE INDEX "idx_campaign_due_unsent" ON "AssessmentCampaign" ("openAt") WHERE "invitesSentAt" IS NULL AND "inviteSendStartedAt" IS NULL AND "deletedAt" IS NULL;`
- [ ] **Step 5 — Safety:** run `node scripts/check-migration-safety.mjs` (additive-only) → pass. `npx prisma generate`.
- [ ] **Step 6 — Run:** `npm test -- wave-d-migration` + `CI=true npx next build --turbopack` → PASS.
- [ ] **Step 7 — Commit** `feat(assessments): Wave D additive migration (campaign timing/results/notify/html cols + approval hash + index + backfill; no new status)`.

**Acceptance:** all columns present; NO `SCHEDULED`; backfill stamps existing rows; partial index exists; `check-migration-safety` passes.

## Task 1b — Wave-D feature flags + kill switch (R3-M5)

**Files:** `src/src/lib/feature-flags.ts` (create or extend); `src/src/__tests__/lib/feature-flags-wave-d.test.ts`.

- [ ] **Step 1 — Test:** flags `WAVE_D_AUTO_SEND_ENABLED`, `WAVE_D_RESULTS_EMAIL_ENABLED`, `WAVE_D_COACH_NOTIFY_ENABLED`, `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED`, and `ASSESSMENT_SENDS_PAUSED` each default to OFF/false when the env var is unset/empty; truthy only on explicit `"1"`/`"true"`. Optional org/coach allowlist parse.
- [ ] **Step 2–4:** implement readers (mirror the Wave-B flag pattern), run, commit `feat(assessments): Wave D default-off feature flags + ASSESSMENT_SENDS_PAUSED kill switch`.

**Acceptance:** all flags default OFF; merging changes nothing live.

---

## Slice D-1 — Quick wins (#17, #18, #1)

### Task 2 — `liveCampaign` helper + soft-delete everywhere (#1 foundation; R1-M12/R3-M9/SEC-M6)

**Files:** Create `src/src/lib/assessments/campaign-live.ts`; modify the campaign authz module + every read loader; tests `src/src/__tests__/lib/campaign-live.test.ts`.

- [ ] **Step 1 — Test:** `liveCampaignWhere()` returns `{ deletedAt: null, ... }`; `canManageCampaign` and the read loaders (list/detail/report/export/trends/aggregate/public-alias) return nothing for a campaign with `deletedAt` set unless an explicit `{ includeDeleted: true }` admin-recovery flag is passed. Cover each surface with a deleted-id regression case.
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implement:** the helper; bake `deletedAt IS NULL` into the **core** `canManageCampaign`/campaign-load (not only per-surface filters), with an `includeDeleted` admin bypass; route all read loaders through it.
- [ ] **Step 4–5 — Run + commit** `feat(assessments): liveCampaign helper — deletedAt hidden from all surfaces (core authz)`.

**Acceptance (SEC-M6):** no user-facing read path returns a deleted campaign; admin recovery path explicit; per-surface regression tests green.

### Task 3 — DELETE campaign (#1)

**Files:** `src/src/app/api/assessment-campaigns/[id]/route.ts`; tests `src/src/__tests__/api/assessment-campaigns/delete.test.ts`; CampaignDetail confirm dialog.

- [ ] **Step 1 — Test:** `DELETE /api/assessment-campaigns/[id]` — admin OR `createdByCoachId===actor` succeeds (sets `deletedAt`); a different coach → 403 (IDOR); unauth → 401; rate-limited; audited `DELETE_CAMPAIGN`; data rows preserved; a deleted campaign's survey link → "no longer available". Authorization uses the **ownership predicate, NOT `canManageCampaign("write")`** (R1-L1).
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implement:** the DELETE handler (ownership predicate, soft-delete, audit, rate-limit); the access guards already exclude deleted via Task 2; CampaignDetail blast-radius confirm dialog ("N invited, M completed — they'll lose access; data retained").
- [ ] **Step 4–5 — Run + commit** `feat(assessments): soft-delete campaigns (#1) — ownership-gated DELETE + blast-radius confirm`.

**Acceptance:** any-state delete; ownership-gated; links die; data retained; no restore UI.

### Task 4 — Template name in Step 3 (#17) + Select-All (#18)

**Files:** `src/src/components/assessments/CampaignWizard.tsx`; tests `src/src/__tests__/components/campaign-wizard-d1.test.tsx`.

- [ ] **Step 1 — Test:** (#17) the Schedule step renders the selected template's name (read-only). (#18) each company/team group header in Step 2 has a Select-All control that selects exactly the **currently filtered/visible** members of that group (not a hidden global), and toggling off clears them; CEO single-select logic still enforced.
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implement** both (display-only #17; group-scoped, filter-aware Select-All #18).
- [ ] **Step 4–5 — Run + commit** `feat(assessments): show template on schedule step (#17) + filter-aware Select-All (#18)`.

---

## Slice D-2 — Results & notify (#15, #16)

### Task 5 — Template results-email approval binding (SEC-H2)

**Files:** `src/src/app/api/admin/assessment-templates/[id]/route.ts`; tests.

- [ ] **Step 1 — Test:** editing `resultsEmailSubject`/`resultsEmailBodyMarkdown` **clears `resultsEmailContentApproved`** (and the hash) unless the same request explicitly re-approves the new content; approving stores `resultsEmailContentApprovedHash = hash(subject+body)` + `approvedAt`/`approvedBy`. A stale approval (hash mismatch) reads as NOT approved.
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implement:** hash-on-approve, clear-on-edit; expose an `isResultsEmailApproved(template)` helper that checks `approved AND hash === hash(current content)`.
- [ ] **Step 4–5 — Run + commit** `feat(assessments): bind results-email approval to a content hash (clear-on-edit) (SEC-H2)`.

### Task 6 — #15 results email + #16 coach-notify (enqueue in submit tx, render-at-enqueue, invited-only)

**Files:** `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`; outbox enqueue helper; tests `src/src/__tests__/api/org-survey/submit-emails.test.ts`; CampaignWizard toggles; thank-you view.

- [ ] **Step 1 — Test:**
  - #15 (invited only): with `sendResultsToRespondent` ON **and** `isResultsEmailApproved` true → on SUBMITTED, exactly one respondent results-email outbox row is enqueued **inside the submit tx**, with `subject`+`bodyHtml` **rendered at enqueue** (admin-authored copy + Spec-16 report); `bodyHtml` flagged PII. OFF or unapproved → no row. **The public quiz submit path does NOT read the toggle** (unchanged taker email) — regression test it.
  - #16: with `notifyCoachOnCompletion` ON → one coach-notify row to `createdByCoachId` with a Spec-13 gated report **link** (no PII body), new `emailType`/`recipientRole`.
  - Idempotency: a double-submit (409) enqueues nothing extra.
  - Landing copy adapts on the `sendResultsToRespondent` flag.
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implement:** enqueue rows in the SUBMITTED tx (render at enqueue); gate #15 on the flag + live approval hash; flags `WAVE_D_RESULTS_EMAIL_ENABLED`/`WAVE_D_COACH_NOTIFY_ENABLED` + `ASSESSMENT_SENDS_PAUSED`; wizard toggles (disable #15 with "ask an admin" when unapproved); thank-you copy; **purge `bodyHtml` after successful send / terminal failure** in the outbox drain (SEC-M4). Verify invited submit creates `AssessmentSubmission` + `ScoreResult` (add if missing).
- [ ] **Step 4–5 — Run + commit** `feat(assessments): results email (#15, invited-only, approval-gated) + coach-notify (#16) — enqueue in submit tx`.

**Acceptance:** invited-only #15 (public taker email intact, R1-M11); approval-gated; render-at-enqueue; PII purge; exactly-once.

---

## Slice D-3 — Timing & auto-send (#2, #3)

### Task 7 — Extract shared per-recipient invite-send + gate the bulk early-send (R1-M6)

**Files:** Create `src/src/lib/assessments/invite-send.ts`; modify `…/[id]/invite/route.ts`; tests.

- [ ] **Step 1 — Test:** `sendInvitesBatch(campaignId, recipientIds)` creates/sends per-recipient invitations, **skipping already-SENT** (idempotency ledger); caps batch at 25. The bulk `/invite` route **rejects an unsent/SCHEDULED-derived campaign** (no early-send bypass); the per-row late-add send works **only after** the campaign send completed (`invitesSentAt` set).
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implement:** extract the per-recipient logic into `invite-send.ts`; repurpose `/invite` to the per-row late-add path + block bulk early-send.
- [ ] **Step 4–5 — Run + commit** `feat(assessments): extract invite-send lib; gate bulk early-send to per-row late-add (R1-M6)`.

### Task 8 — Inngest invite fan-out + cron backstop (R1-H2, R3-H3/H4, SEC-M5)

**Files:** Create `assessment-invite-fanout.ts` + `assessment-scheduled-send-cron.ts`; register in the Inngest client; tests `src/src/__tests__/inngest/assessment-send.test.ts`.

- [ ] **Step 1 — Test:**
  - Fan-out: runs under **per-campaign concurrency=1** (singleton key=campaignId); claims via `updateMany` CAS on `inviteSendStartedAt IS NULL`; refreshes `inviteSendHeartbeatAt` each batch; sends in ≤25 batches via `invite-send`; **re-reads `deletedAt`+status+flags+kill-switch before each batch** and aborts (no SENT marks) if deleted/paused (R1-M7/SEC-M5); stamps `invitesSentAt` only after all batches succeed.
  - Cron `*/3`: sweeps `status IN (DRAFT,ACTIVE) AND openAt<=now AND invitesSentAt IS NULL AND inviteSendStartedAt IS NULL AND deletedAt IS NULL` (incl. recovered IMMEDIATELY), bounded page size, emits the fan-out event; **stale-claim recovery** re-emits when `inviteSendStartedAt` set but no fresh `inviteSendHeartbeatAt` and `invitesSentAt` null.
  - Event payload carries **only `campaignId`** (no tokens/URLs) (SEC-M5). Legacy campaigns (backfilled `invitesSentAt`) never swept.
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implement** both functions with the guards above; register them.
- [ ] **Step 4–5 — Run + commit** `feat(assessments): Inngest invite fan-out (concurrency=1, CAS+heartbeat) + scheduled-send cron backstop`.

**Acceptance:** no double-send under reclaim/replay; lost immediate event recovered; deleted/paused campaign never sends; legacy never re-sent.

### Task 9 — Versioned atomic create + auto-send + participant re-auth (R1-H1, R3-H2, SEC-M3)

**Files:** `src/src/app/api/assessment-campaigns/route.ts`; tests `src/src/__tests__/api/assessment-campaigns/create-autosend.test.ts`.

- [ ] **Step 1 — Test:** a Wave-D create payload (participant IDs + `inviteTiming`) does create + participant-attach + CEO validation + lifecycle **in one transaction**, then emits the fan-out **post-commit**; "Immediately" → `openAt=now`, status ACTIVE, fan-out fired; "When it opens" → future `openAt`, stays DRAFT (derived-scheduled), cron sends at open. **Participant IDs are re-authorized inside the tx** (org-scoped, `deletedAt IS NULL`, cardinality equality, CEO membership, cap) — a foreign/other-org ID → 400, no send (SEC-M3 anti-IDOR). A **legacy/non-Wave-D payload** → non-sending DRAFT (R3-H2). Gated by `WAVE_D_AUTO_SEND_ENABLED`.
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implement** the versioned create contract + atomic op + post-commit emit + re-auth.
- [ ] **Step 4–5 — Run + commit** `feat(assessments): atomic Wave-D create + auto-send + participant re-auth (#2/#3)`.

### Task 10 — Wizard timing radio + openAt gating + consequence button + timezone round-trip (#2/#3, grill-me TZ)

**Files:** `CampaignWizard.tsx`, `CampaignDetail.tsx`; tests.

- [ ] **Step 1 — Test:** the timing radio (default "Immediately") hides/forces `openAt=now`; "When it opens" reveals a future-only `openAt` picker; final button label is consequence-bound ("Create & send N now" / "Schedule for <date>"); **≥1 participant required** before enabled (edge guard). CampaignDetail `openAt` editor round-trips UTC→local via `formatDateTimeLocal` (no ISO-slice drift) and **locks once `inviteSendStartedAt` set**; the respondent gate message renders via `formatTimestamp` (not raw server `toLocaleString`).
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implement** the radio/picker/button + the two timezone render fixes + the lock.
- [ ] **Step 4–5 — Run + commit** `feat(assessments): timing radio + openAt gating + consequence button + tz round-trip (#2/#3)`.

---

## Slice D-4 — Full-HTML invitation email (#20)

### Task 11 — Coach-safe email sanitizer + token-placement validator (R1-H4, R1-M8, SEC-H1)

**Files:** Create `src/src/lib/assessments/email-html-sanitizer.ts`; tests `src/src/__tests__/lib/email-html-sanitizer.test.ts`.

- [ ] **Step 1 — Test (adversarial):** the sanitizer strips `<script>`, `<iframe>`, `<style>`, event handlers, `javascript:`/`data:` URIs, external `src`/`srcset`, form actions, SVG, comments/metadata, CSS `url()` exfil; **allows** a narrow inline-style + table allowlist. The **token-placement validator** accepts `{{invitationUrl}}` only as plain text or the entire `href` of a same-origin `/org-survey/{alias}#t=...` anchor and **rejects** it in external links, query params, CSS, `src`/`srcset`, forms, comments, attributes (SEC-H1). Missing `{{invitationUrl}}` entirely → reject (R1-M8). Merge-tag PII values are HTML-escaped; post-interpolation re-sanitize strict.
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implement** a dedicated email sanitizer (do NOT reuse the admin-trusted Wave-B `sanitize-custom-html.ts`) + the placement validator.
- [ ] **Step 4–5 — Run + commit** `feat(assessments): coach-safe email HTML sanitizer + invitationUrl token-placement validator (SEC-H1, R1-H4)`.

### Task 12 — #20 full-HTML invitation email (column wiring + editor + render precedence)

**Files:** `invitation-email.ts`, the campaign create/PATCH routes, `CampaignWizard.tsx` + `CampaignDetail.tsx` email panel; tests.

- [ ] **Step 1 — Test:** when `invitationBodyHtml` set, the rendered email **IS** the sanitized HTML (no branded shell); precedence `invitationBodyHtml > invitationBodyMarkdown > template default`; SMTP **subject still from `invitationSubject`** (token-allowlisted, no leak); tokens interpolated HTML-escaped; save runs the Task-11 sanitizer+validator (reject on missing/misplaced token); upload accepts `.html/.htm` only ≤ length cap → loads into the textarea → same sanitize path; gated by `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED`.
- [ ] **Step 2 — Run** → FAIL.
- [ ] **Step 3 — Implement** the column write (sanitize-on-write), render precedence, editor (paste + upload), CampaignDetail parity.
- [ ] **Step 4–5 — Run + commit** `feat(assessments): per-campaign full-HTML invitation email (#20)`.

---

## Task 13 — Ops runbook + metrics + whole-branch review (R3-M6/L1)

**Files:** Create `docs/specs/v7.6/17d-ops-runbook.md`; observability hooks.

- [ ] **Step 1:** runbook — rollback sequence (flag-off → pause Inngest cron+fan-out → handle unsent `DRAFT+ON_OPEN` rows → promote-previous), Inngest pause/replay/inspect-claims, canary validation. Replace stale Vercel-cron references.
- [ ] **Step 2:** metrics/alerts (extend spec-06 DB-counter pattern): campaigns due/claimed/completed, stale claims, fan-out failures, outbox pending-age, failed rows, SMTP errors, sanitizer rejects, oldest-unsent age.
- [ ] **Step 3 — Whole-branch review:** dispatch `superpowers:code-reviewer` over the full diff; fix Critical/Important. Confirm full suite + build clean.
- [ ] **Step 4 — Commit** `docs(assessments): Wave D ops runbook + metrics; whole-branch review`.

---

## Verification (per task + final)

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
CI=true npx next build --turbopack 2>&1 | tail -15
npm test -- --testPathPatterns="assessment|campaign|invite|outbox|sanitiz|migration|feature-flag" 2>&1 | tail -12
npx eslint <changed files>   # 0/0
```

**Final go/no-go:** flags default-OFF (merging dark); migration additive + backfill verified; whole-branch review merge-ready. Launch = a separate flag-flip + the §Rollout & ops checklist in 17d.

## Self-review (writing-plans)

- **Spec coverage:** #1 (T2/T3) · #2/#3 (T8/T9/T10) · #15 (T5/T6) · #16 (T6) · #17 (T4) · #18 (T4) · #20 (T11/T12); migration (T1); flags (T1b); ops (T13). All 8 items + every claudex finding (R1-H1→T9, H2→T8, H3→T1/T8, H4→T11; R1-M5→T5/T6, M6→T7, M7→T8, M8→T12, M9→T6, M10→T1, M11→T6, M12→T2; SEC-H1→T11, H2→T5, M3→T9, M4→T6, M5→T8, M6→T2; R3-H1→T13/T1b, H2→T9, H3→T1/T8, H4→T8, M5→T1b, M6→T13, M7→T8, M8→T1, M9→T2, L1→T13) mapped.
- **Type consistency:** `liveCampaign`/`liveCampaignWhere`, `sendInvitesBatch`, `isResultsEmailApproved`, `inviteSendStartedAt`/`inviteSendHeartbeatAt`/`invitesSentAt` used consistently across tasks.
- **No placeholders.**
