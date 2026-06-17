# Spec 17 — Wave D: Campaign Setup Features — Design

> Parent: [`17-jeff-june9-feedback-punchlist.md`](17-jeff-june9-feedback-punchlist.md). Wave D = the campaign-setup cluster from Jeff's June-9 feedback. Source of truth for the requirement wording: `From Jeff/gabriel-feedback.docx`.
>
> **Status:** brainstormed + user-approved + **`/grill-with-docs` DONE** (Q1–Q5 + idempotency/legacy) + **`/grill-me` DONE** (3 structural findings: timezone · invite send-mechanism · #15↔F0 approval gate; + 4 edges: #16 volume, late-add, zero-participant, #20 upload) + **ADR-0009 written** (2026-06-15). Design tree fully walked. **`/claudex:plan` DONE** (2026-06-15, run `20260615-114026-7ac33c`): 3 rounds + a standalone security pass, **29 findings, all accepted** — see **§/claudex:plan hardening** at the bottom, which is **AUTHORITATIVE** where it conflicts with this body (notably: NO `SCHEDULED` enum, coach-safe email sanitizer, render-at-enqueue, rollback-needs-runbook + flags). **Next:** `writing-plans` → `17d-…-implementation-plan.md` → subagent-driven build. **Gated wave** ([[gated-waves-require-grill]]).

## Scope

**8 items build now:** #1 delete · #2 timing radio · #3 invite auto-send · #15 results toggle · #16 coach-notify · #17 template-in-step · #18 select-all · #20 HTML email.

**Split out:** **#19 custom slides** — the only net-new participant-flow subsystem (campaign-authored promo/branded slides inside the survey pager, "like the Verve slide"). Becomes its own gated mini-wave with its own ADR + `/frontend-design` mockup, sequenced right after Wave D. Zero overlap with the 8 setup items.

## Source grounding (Jeff verbatim, `gabriel-feedback.docx`)

| # | Heading | Verbatim |
|---|---------|----------|
| 1 | Campaigns | "Add the ability to delete campaigns." |
| 2 | Campaigns – Reading | "Add a radio button for timing that defaults to 'Immediately'." |
| 3 | Campaign Creation – Invitation Timing | "Invitations should send immediately upon campaign creation. For future-dated campaigns, invitations should auto-send when the campaign opens on that date — no manual trigger required." |
| 15 | Campaign Setup – Results Toggle | "Add a toggle during campaign setup: send results to end users or not. The post-completion landing page message should adapt accordingly — either 'We are sending you your results' or 'Thank you — your coach will review your results with you.'" |
| 16 | Campaign Setup – Coach Notification | "Add a radio button or toggle in campaign setup for the coach to opt in to receive an email notification each time a respondent completes a survey. The notification should include either a link to the results or the full output." |
| 17 | Campaign Setup – Step 4 Template Reference | "In Step 4 of campaign setup (schedule/campaign name screen), display the assessment template that was selected in [Step 2]." |
| 18 | Campaign Setup – Select All Participants | "In campaign setup, when selecting participants for a company, add a 'Select All' option so coaches don't have to pick respondents one by one." |
| 20 | Custom Email Editor – HTML Upload | "In the custom email editor, allow users to upload or paste their own HTML email template while still being able to use the standard merge field tags." |

## What already exists (reuse — do NOT rebuild)

- **`CampaignWizard.tsx`** — 5 steps (0 Org · 1 Template · 2 Participants · 3 Schedule/name · 4 Review). Step 4/Review already has the per-campaign email-override panel: `invitationSubject` (≤200) + `invitationBodyMarkdown` (≤5000, markdown). Participant picker (Step 2) is per-individual checkboxes, **no select-all**. Jeff's "Step 4" (schedule/name) = **code Step 3**.
- **`POST /api/assessment-campaigns/route.ts`** — creates campaign as `DRAFT`; accepts `invitationSubject`/`invitationBodyMarkdown`; **does NOT send on create**; no Inngest emit; no send-timing field.
- **`/api/assessment-campaigns/[id]/route.ts`** — GET + PATCH only. **No DELETE; no `deletedAt`.** List query scopes by `createdByCoachId` for coaches; no soft-delete filter.
- **`/api/assessment-campaigns/[id]/invite`** — the explicit manual send endpoint (today's flow).
- **`CampaignDetail.tsx`** — participant table + status bands + `CampaignStatusMetrics`; add-participant (pick-existing only); email-override edit panel; **inline `openAt` editor** (∴ `openAt` is mutable post-create — drives the scheduler choice); send-reminders; close-campaign.
- **Invited submit `(public)/org-survey/[campaignAlias]/submit/route.ts`** — audits the submission; **sends no email**; `notifyAdminOnSubmit` field exists (default `true`) but is **currently unused**.
- **`lib/assessments/invitation-email.ts`** (Wave A) — `buildInvitationEmailHtml()` renders the branded `#522583` shell wrapping the body; resolves `campaign.invitationBodyMarkdown ?? template.invitationBodyMarkdown`; token allowlist on subject; markdown-lite body.
- **`lib/assessments/report-email.ts`** (Spec 16) — branded inline-HTML report email (reuse for #15 + #16).
- **Spec 13 gated per-respondent report route** (`getRespondentReport`, coach/admin authz) — reuse the link for #16.
- **`lib/templates/sanitize-custom-html.ts`** (Wave B) — DOMPurify + strict interpolation; reuse for #20.
- **Inngest `quick-assessment-lead-email.ts`** + `AssessmentEmailOutbox` — durable outbox, drained by an event-triggered Inngest fn (max 5 attempts, exp backoff). **No cron-send / scheduled-send exists yet.**

Current `AssessmentCampaign` fields: `id, templateId, versionId, organizationId, language, alias, externalId, name, description, status, accessMode, publicConfig, openAt, endMode, closeAt, notifyAdminOnSubmit, invitationSubject, invitationBodyMarkdown, createdBy, createdByCoachId, createdAt, updatedAt`.

## Locked decisions (user-approved 2026-06-15)

### #2/#3 — Invitation timing + auto-send
- **2-state radio** in the wizard (Schedule step): **"Immediately"** (default) / **"When the campaign opens"**. **No manual path** (faithful to "no manual trigger required"); the existing "create DRAFT → manually send" staging flow is removed and its wizard/route tests updated.
- **UNIFIED model (grill Q3 — `openAt` already gates survey accessibility):** invitations send **when the campaign opens**. `openAt` is the single source of truth for both "survey is takeable" (existing gate in exchange/me/submit) and "invites fire." No decoupled "invited-but-closed" state.
  - **Immediately:** radio forces `openAt = now` (picker hidden/disabled) → on create the campaign goes **ACTIVE** + invites auto-send to all participants now + stamp `invitesSentAt`.
  - **When it opens:** radio reveals the `openAt` picker (must be future) → campaign goes **SCHEDULED**; the cron flips it ACTIVE + enqueues invites + stamps `invitesSentAt` when `openAt` arrives. Survey opens + invites land together.
- **Scheduler = Inngest cron scan `*/3 * * * *`** (every 3 min — grill Q2, matches the existing `quick-assessment-lead-email` outbox cron; ≤3-min lag past `openAt`). Predicate: `status = SCHEDULED AND inviteTiming = ON_OPEN AND openAt ≤ now AND invitesSentAt IS NULL AND deletedAt IS NULL`.
- **Why cron, not `step.sleepUntil`:** `openAt` is editable post-create (CampaignDetail) — a sleeping delayed-event would hold the stale time; a re-scanning cron self-corrects, survives redeploys/missed runs, and reuses the existing outbox + retry idiom (`execute-workflow.ts` uses `sleepUntil` for workflow steps, but that pattern is wrong here).
- **`openAt` editing rules (grill Q3):** on a **SCHEDULED** (unsent) campaign, editing `openAt` reschedules the send (cron re-scans; edited to the past → next tick sends + opens — intended). Once `invitesSentAt` is set, **lock the `openAt` editor** — no edit can resend (the `invitesSentAt IS NULL` guard) and we avoid re-closing the survey on already-invited people.
- **Send guard (grill Q1):** no separate confirm modal. The wizard's Step-4 Review screen is the human gate; the **final button is consequence-labeled** — "**Create & send N invitations now**" (Immediately) vs "**Schedule for &lt;date&gt;**" (future-dated).
- **Send mechanism (grill-me Finding 2):** invitations are delivered by an **Inngest fan-out** (one event from create/cron → an Inngest fn sends in durable `step.run` batches of ≤25, reusing the extracted per-recipient invite-create logic). NOT the synchronous 25-capped `/invite` path (Select-All would blow Vercel's 30s budget) and NOT the submission-bound `AssessmentEmailOutbox` (can't hold pre-submission invitations).
- **Idempotency (now critical-path):** cron claims a campaign via an atomic `updateMany` gated on `invitesSentAt IS NULL` (CAS — single writer); within the fan-out, **`AssessmentInvitation` status is the per-recipient idempotency ledger** (skip already-SENT, like `/invite` does today) so an Inngest replay never double-sends. Closes the punch-list's previously-deferred "per-recipient pre-send idempotency."
- **New status value:** `AssessmentCampaignStatus += SCHEDULED` (additive). Legacy campaigns default `inviteTiming = IMMEDIATELY` + are already ACTIVE/sent, so the cron never sweeps them (verified, grill Q8).

### #15 — Results toggle (`sendResultsToRespondent`)
> **Refined by `/grill-me` Finding 3:** #15 *activates* the existing scaffolded F0 "Results Email" — the emailed content is the admin-authored `resultsEmailSubject`/`resultsEmailBodyMarkdown` (+ Spec-16 branded report), and the toggle is **gated by the template's `resultsEmailContentApproved`** (disabled with an "ask an admin" hint when unapproved). See the grill-me section below.
- Additive boolean `sendResultsToRespondent` (default `false`), set in wizard setup.
- **ON (invited):** on SUBMITTED, enqueue an outbox row → email the respondent their branded report (Spec 16 `report-email.ts`); landing copy = **"We are sending you your results."**
- **OFF (invited):** no email; landing copy = **"Thank you — your coach will review your results with you."**
- **Public quiz: unchanged** — ADR-0008 keeps showing the taker their results in-page regardless; for public, the toggle governs only the **emailed** copy (Spec 16 already emails the taker).
- Invited submit page is **not** turned into an in-page report (faithful to "We are sending you your results").
- **Idempotency + render (grill Q5):** the outbox row is enqueued **inside the SUBMITTED-transition transaction** ([submit/route.ts:173](../../src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts)) — the transition is exactly-once (double-submit 409s at line 137), so the enqueue is exactly-once. The report HTML is built at **drain time** by the Inngest worker (nothing heavy in the tx). The thank-you view branches its copy on `sendResultsToRespondent` (client receives the flag).

### #20 — Custom HTML email (full replace)
- New additive nullable column `invitationBodyHtml String?`.
- When set, the **sanitized custom HTML IS the entire email** — no branded-shell wrap. Coach owns the full template (incl. their own branding).
- **Precedence:** `invitationBodyHtml` (full HTML) > `invitationBodyMarkdown` (body-in-shell, today) > template default.
- **Safety:** DOMPurify on write via `sanitize-custom-html.ts`; merge tags preserved through sanitize and interpolated by the Wave-A interpolator with **HTML-escaped values** (mirrors Wave B's stored-XSS defense); post-interpolation re-sanitize in strict mode.
- **Boundaries (grill Q4):** custom HTML covers the **body/email render only**. The SMTP **subject keeps coming from the existing token-allowlisted `invitationSubject` field** (folding subject into HTML would reopen the `#t=`-credential-leak hole closed in Wave A). **No footer/unsubscribe is force-injected** — these are transactional invites and the current shell injects none (full-replace loses only a cosmetic "— Scaling Up Platform" line).
- **Upload-or-paste:** a textarea (paste) + an optional file-picker that loads an `.html` file's text into the same textarea → one sanitize-on-write path. Editor lives in the wizard email panel (Step 4/Review) + CampaignDetail's email-override panel (both already exist for markdown).

## Recommended defaults (user-approved 2026-06-15; "looks right")

| # | Decision |
|---|----------|
| **1 delete** | Soft-delete: additive `deletedAt DateTime?`. New `DELETE /api/assessment-campaigns/[id]` (admin + owning coach); **deletable in ANY state** (grill Q5) with a **blast-radius confirm dialog** ("N invited, M completed — they'll lose access. Data is retained."); sets `deletedAt`; **responses preserved**, **no restore UI in v1** (recoverable via DB/admin). List queries **and** the access guards (exchange/me/submit) add `deletedAt IS NULL` → live links return "no longer available"; cron skips deleted. Audited (`DELETE_CAMPAIGN`). Rate-limited. |
| **3 scheduler** | Inngest **cron scan `*/3 * * * *`** (every 3 min — matches the existing outbox cron; grill Q2). |
| **3 status** | Add `SCHEDULED` enum value. |
| **16 coach-notify** | Additive boolean `notifyCoachOnCompletion` (default `false`). On SUBMITTED → enqueue outbox (in the SUBMITTED-transition tx) → email the **owning coach** (`campaign.createdByCoachId`) a **link to the per-respondent report** (Spec 13 gated route; coach logs in → sees report), not raw PII in the body. Leave `notifyAdminOnSubmit` untouched (distinct concern). |
| **17 template-in-step** | Display selected **template name** (read-only) on the Schedule/name step (code Step 3). Pure display; no column. |
| **18 select-all** | **Select-All toggle at each company/team group header** in the Step-2 participant picker; **respects the current filter/search** (selects the visible/filtered set, not a hidden global). No schema change. |

## Additive migration (one migration; all nullable / defaulted → passes `check-migration-safety.mjs`)

```
AssessmentCampaign:
  deletedAt               DateTime?
  inviteTiming            AssessmentInviteTiming  @default(IMMEDIATELY)   // enum {IMMEDIATELY, ON_OPEN}
  invitesSentAt           DateTime?
  sendResultsToRespondent Boolean  @default(false)
  notifyCoachOnCompletion Boolean  @default(false)
  invitationBodyHtml      String?
enum AssessmentCampaignStatus: += SCHEDULED
```

**Rollback (changes vs A/B/C):** Waves A–C were zero-migration (instant promote-previous). Wave D needs this additive migration. Every column is nullable/defaulted and old code ignores them, so **promote-previous remains a valid rollback** — the new columns sit unused. Documented in ops notes. No destructive op; no core-table relaxation; honors the additive-only constraint (2 prior prod wipes).

## Build slices (subagent-driven; one feature branch `feat/wave-d-campaign-setup` off `main`)

- **D-1 — Quick wins:** #17 (template-in-step), #18 (select-all), #1 (soft-delete column + DELETE route + list filter + confirm dialog + link-dies). No new infra.
- **D-2 — Results & notify:** #15 (activate F0 Results Email: campaign toggle + honor `resultsEmailContentApproved` gate + admin-authored content + Spec-16 report; adaptive landing copy) + #16 (coach-notify: report link via the submission outbox). Both enqueue email-on-submit inside the SUBMITTED-transition tx. Verify at build: invited submit creates an `AssessmentSubmission` (outbox FK) + a `ScoreResult` (report render).
- **D-3 — Timing & auto-send:** #2/#3 (radio + create-route lifecycle change + unified `openAt` + `SCHEDULED` status + new Inngest **cron** fn + new Inngest **invite-fan-out** fn + extracted shared per-recipient invite-send logic + the two timezone-rendering fixes + idempotency). Heaviest; touches the create route, two new Inngest functions, and the wizard.
- **D-4 — HTML email:** #20 (HTML column + DOMPurify-on-write + full-replace render path + editor swap in wizard Step 4 + CampaignDetail panel).

Per-task: fresh implementer (TDD, build gate `CI=true npx next build --turbopack`, commit, self-review) → spec-compliance review → code-quality review → mark complete. Final whole-branch review before merge-go.

## Cross-cutting

- **Standing security** on every new surface: auth (`getApiActor` → 401) → Zod validate → `withRateLimit` → `logAudit` → no PII/tokens in logs. HTML sanitized on write (#20).
- **Email** strictly via the durable `AssessmentEmailOutbox` + Inngest drain (idempotent), never inline SMTP in a request path.
- **Authz:** DELETE + setup writes follow `canManageCampaign` (admin + owning coach); coaches can't touch others' campaigns.

## Wave-G dedupe (resolved here)

- **Wave-G "invited respondents see the immaculate results page"** → **superseded** by #15 (emailed report, per Jeff's verbatim — not in-page). Removed from Wave G.
- **Wave-G "bare invite email body" (#3)** → distinct from #20. #20 ships the *HTML editor capability*; the bare email is a *content gap* (campaigns/templates ship no default body). Stays in Wave G as a seed/default-body fix.

## Grill outcomes (`/grill-with-docs`, 2026-06-15) — RESOLVED

1. **Auto-send blast radius (Q1)** → **consequence-labeled final button** on the Review step ("Create & send N invitations now" / "Schedule for &lt;date&gt;"); no modal, no DRAFT pre-state.
2. **Cron cadence (Q2)** → **3 min (`*/3 * * * *`)**, matching the existing outbox cron.
3. **`openAt` coupling + edits (Q3)** → **UNIFIED**: invites send when the campaign opens; "Immediately" sets `openAt = now`. Editing `openAt` on a SCHEDULED campaign reschedules; **lock the editor once `invitesSentAt` is set**.
4. **#20 boundaries (Q4)** → subject stays the separate token-allowlisted field; **no forced footer**; custom HTML = body/render only; upload = file-load-into-textarea.
5. **Delete scope (Q5)** → **deletable in any state** + blast-radius confirm; soft-delete preserves data; no restore UI v1; links die; cron skips deleted.
6. **#15/#16 idempotency** → enqueue **inside the SUBMITTED-transition transaction** (exactly-once); auto-send via atomic `updateMany` CAS on `invitesSentAt IS NULL`. Report/link built at drain time.
7. **Legacy campaigns** → VERIFIED safe (default `IMMEDIATELY` + already ACTIVE/sent → never swept).
8. **ADR** → **ADR-0009** (auto-send lifecycle) written; #20 full-replace documented inline (Wave-B precedent, no separate ADR).

## `/grill-me` outcomes (relentless fresh-eyes pass, 2026-06-15) — RESOLVED

Three material findings the structured grill missed (each changed the design):

### Finding 2 — invitation send mechanism (reshapes D-3)
The existing `/invite` route is **synchronous SMTP, hard-capped at 25 recipients** (`BATCH_CAP = 25`, 400 above; *"to keep SMTP latency inside Vercel's 30s budget"* — [invite/route.ts:15-37](../../src/src/app/api/assessment-campaigns/[id]/invite/route.ts)). And the `AssessmentEmailOutbox` is **submission-bound** (required `submissionId` FK, `@@unique([submissionId, recipientRole])`) — it **cannot hold pre-submission invitations**. So **Select-All (#18) on a large company + Immediately (#3) would blow the request budget**, and the outbox can't be the vehicle.
**Decision: Inngest fan-out.** "Immediately" create + the cron's open-flip emit one event → an Inngest function sends invitations in **durable `step.run` batches of ≤25** (reusing the extracted per-recipient invite-create + idempotency logic), retrying per batch, not bound by the 30s budget. No new table; `AssessmentInvitation` status is the idempotency ledger. Matches the `execute-workflow.ts` Inngest-step idiom. The 25-cap becomes an internal batch size, not a user-facing rejection.

### Finding 3 — #15 collides with the scaffolded F0 "Results Email" + its approval gate (reshapes #15)
`AssessmentTemplate` already carries `resultsEmailSubject` / `resultsEmailBodyMarkdown` / **`resultsEmailContentApproved`** ("Phase F0 Checkpoint 1b"; admin-authored on the template Metadata tab; the approval boolean "stays false until the operator flips it" — [assessment-templates/[id]/route.ts:87](../../src/src/app/api/admin/assessment-templates/[id]/route.ts)). It is scaffolding for an admin-authored, **approval-gated** results email, never wired to a send. My original #15 (standalone Spec-16 report, no gate) would have built a parallel path bypassing a governance control.
**Decision: #15 is the missing *activation* of F0.** The per-campaign `sendResultsToRespondent` toggle, when ON, sends the results email using the admin-authored `resultsEmailSubject`/`resultsEmailBodyMarkdown` (+ links/embeds the Spec-16 branded report), **only if the template's `resultsEmailContentApproved = true`**. If not approved, the wizard toggle is **disabled** with "results email not yet approved for this template — ask an admin." This also resolves the aggregation-only-template concern (no per-respondent score): an admin simply won't author/approve results copy for those templates, so the gate blocks a meaningless send. `notifyCoachOnCompletion` (#16) is unaffected — it's an internal coach notification (report *link*, Spec-13-gated), not end-user content, so no approval gate.

### Finding 1 — `openAt` timezone semantics There is **no campaign timezone field** (Organization/Respondent/Campaign carry none — unlike `Workshop`); the wizard stores `openAt` as a datetime-local string → `new Date(state.openAt).toISOString()` ([CampaignWizard.tsx:412](../../src/src/components/assessments/CampaignWizard.tsx)); the respondent gate renders `openAt.toLocaleString(undefined, …)` **server-side** (Vercel UTC) ([exchange/route.ts:44](../../src/src/app/(public)/org-survey/[campaignAlias]/exchange/route.ts)).

**Decision: keep the UTC-instant model — NO campaign timezone field** (cron fires on UTC instants → already correct; a tz field is scope Jeff didn't ask for, needed by live-event Workshops but not by invitations). "Opens on that date" = the coach's browser wall-clock at creation, stored as a UTC instant. Two **build-time correctness requirements** (not new features):
1. The CampaignDetail `openAt` editor must round-trip UTC→local through the same `formatDateTimeLocal` helper the wizard uses — **no naive ISO-slice** (else every edit shifts by the offset).
2. The respondent-facing "this survey opens &lt;date&gt;" gate message must render via the existing `formatTimestamp`/`@/lib/utils` helpers (consistent with the repo's `no-inline-tolocaledatestring` rule), not raw server `toLocaleString`.

These become explicit acceptance criteria in the D-3 (timing) implementation tasks.

### Edge resolutions (relentless edge walk, 2026-06-15)

- **#16 volume** → **per-completion, opt-in (default OFF)** — faithful to Jeff's "each time"; completions trickle async via the submission outbox; a digest is a future enhancement, not Wave D.
- **Late-add (a participant added after the bulk send already fired)** → **manual per-row Send/Resend** (the existing CampaignDetail control is **retained**). Reconciliation: we removed the manual *bulk* send only; the per-row send stays as the path for stragglers. Auto-send fires to the roster present **at send time** (create for Immediately, `openAt` for scheduled — so pre-open adds to a SCHEDULED campaign are auto-included); anyone added *after* the send is "not invited" until the coach clicks their per-row Send.
- **Resubmit** → no change: invited submit is exactly-once (409 before the status flip), so #15/#16 emails fire exactly once.
- **Revoke-after-send** → no change: the fan-out + access guards skip non-pending/revoked invitations; a revoked respondent can't submit, so no results/notify email.
- **Zero-participant create** → the wizard requires **≥1 selected participant** before "Create & send" is enabled (no silent send-to-nobody).
- **#20 upload limits** → accept **.html/.htm only**, reject files above the **existing Wave-B post-interpolation length cap**, sanitize regardless of source (paste or upload).

## /claudex:plan hardening (2026-06-15) — 29 findings, AUTHORITATIVE where it conflicts with the body above

3-round Codex loop (run `20260615-114026-7ac33c`) + a dedicated security pass (round 2 was skipped by the loop and re-run standalone). Findings files: `.claude/claudex/20260615-114026-7ac33c/findings-round-1.md`, `findings-round-2-security.md`, `findings-round-3.md`. **All 29 accepted, none rejected.** Where this section conflicts with the design body or ADR-0009, **this section wins** (the body/ADR were written pre-claudex).

### Corrections to the body above (an implementer must follow these, not the stale text)
- **NO `SCHEDULED` enum value** (R1-H3 + R3-H1). "Scheduled" is a DERIVED state: `status=DRAFT + inviteTiming=ON_OPEN + invitesSentAt IS NULL + openAt>now`. The cron flips `DRAFT→ACTIVE` at open. (Supersedes body lines that say "status SCHEDULED"/"Add SCHEDULED enum value".)
- **Migration columns:** `deletedAt`, `inviteTiming` enum, **`inviteSendStartedAt` (CAS claim)**, **`inviteSendHeartbeatAt` (lease)**, `invitesSentAt` (completion — **backfill existing rows**), `sendResultsToRespondent`, `notifyCoachOnCompletion`, `invitationBodyHtml`; **+ approval-hash columns on AssessmentTemplate** (`resultsEmailContentApprovedHash`/`approvedAt`/`approvedBy`); **+ partial composite index** (raw SQL) for the due-unsent scan.
- **Rollback is NOT clean promote-previous** (R3-H1). Requires the Wave-D rollback runbook (flag-off → pause cron → handle unsent ON_OPEN rows → promote-previous). Add default-OFF feature flags + a global `ASSESSMENT_SENDS_PAUSED` kill switch.
- **#15 results email rendered AT ENQUEUE** (not drain time — R1-M9: the outbox requires pre-rendered `subject`+`bodyHtml`). Treat `bodyHtml` as PII; purge after send (SEC-M4).
- **#20 uses a NEW coach-safe email sanitizer**, NOT the admin-trusted Wave-B `sanitize-custom-html.ts` (R1-H4), + the `{{invitationUrl}}` token-placement restriction (SEC-H1).

### Round 1 — Senior-engineer (4 H, 8 M, 1 L; all accepted)
H1 atomic create (one tx; fan-out post-commit; no empty-roster race). H2 split claim/completion state. H3 drop SCHEDULED enum → derived. H4 coach-safe email sanitizer. M5 live approval re-check at submit. M6 remove/gate the bulk `/invite` early-send. M7 fan-out re-reads `deletedAt`/status per batch. M8 require `{{invitationUrl}}` in custom HTML. M9 render at enqueue (outbox needs pre-rendered rows). M10 partial index + bounded pages + metrics. M11 `sendResultsToRespondent` invited-only (protect public taker email). M12 soft-delete hidden from ALL surfaces. L1 delete uses an ownership predicate, not `canManageCampaign("write")`.

### Round 2 — Security & data-integrity (2 H, 4 M; all accepted; run standalone after the loop skipped it)
SEC-H1 token-exfiltration → `{{invitationUrl}}` only as plain text / same-origin anchor href; rejected elsewhere. SEC-H2 approval bound to a content hash + clear-on-edit + verify-at-send. SEC-M3 server-side participant re-authorization inside the create tx (anti-IDOR-mailer). SEC-M4 outbox `bodyHtml` is PII — purge after send/terminal-fail, never log. SEC-M5 fan-out re-validates full eligibility in DB at claim; event payload = `campaignId` only (no tokens/URLs). SEC-M6 bake `deletedAt IS NULL` into the core `canManageCampaign`/ownership predicate, admin-recovery bypass.

### Round 3 — Ops & SRE (4 H, 5 M, 1 L; all accepted)
H1 rollback runbook (not clean promote-previous) + flags. H2 version the create API; legacy/cached create = non-sending DRAFT. H3 cron sweeps ALL unsent-due (backstop for lost immediate events) + `invitesSentAt` backfill. H4 Inngest per-campaign concurrency=1 + heartbeat lease (kills stale-claim duplicate sends). M5 default-OFF flags + kill switch across create/cron/fan-out/submit/render. M6 concrete metrics/alerts/runbook (extend spec-06). M7 global load caps (concurrency + provider rate limits + per-org caps + retry budget). M8 sync 17d + ADR-0009 + guard test rejecting persisted SCHEDULED. M9 one canonical `liveCampaign` helper + per-read-path regression tests. L1 Wave-D ops runbook (pause/replay/inspect-claims/validate rollback+canary).

### Rollout & ops (required before broad enable)
- **Feature flags (default-OFF):** `WAVE_D_AUTO_SEND_ENABLED`, `WAVE_D_RESULTS_EMAIL_ENABLED`, `WAVE_D_COACH_NOTIFY_ENABLED`, `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` + global `ASSESSMENT_SENDS_PAUSED`, checked by create/cron/fan-out/submit/render. Merging is dark; enable is a separate flip (Wave-B precedent).
- **Metrics/alerts:** campaigns due/claimed/completed, stale claims, fan-out failures, outbox pending-age, failed rows, SMTP errors, sanitizer rejects, oldest-unsent age (extend spec-06 DB-counter pattern).
- **Global load caps:** Inngest global + per-campaign concurrency, provider-aware SMTP rate limit, per-org/campaign caps, backpressure + retry budget.
- **Rollback runbook + Wave-D ops runbook** (pause/replay/inspect-claims/validate canary) — own doc, replacing stale Vercel-cron references.
- **ADR-0009 updated** (drop SCHEDULED, fix rollback) + a guard test rejecting any persisted `SCHEDULED` status.

## Risks

1. **Lifecycle change (#2/#3)** is the breakage hot-spot — campaign create semantics change for every new campaign; existing create/invite tests must be rewritten, not deleted.
2. **First scheduled-send infra** — no cron-send exists; new Inngest fn + idempotency must be correct or campaigns silently fail to send (or double-send). TDD + a manual preview verification.
3. **Auto-send removes the human review gate** — by Jeff's explicit ask; mitigated only by the wizard's own review step before "Create."
4. **#20 dropping the brand shell** — a coach can ship an unbranded/non-compliant email; sanitize protects against XSS, not against ugly/non-compliant. Accept per Jeff's explicit "their own HTML email template."
