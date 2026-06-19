# CLAUDE.md Changelog — Historical Implementation Detail

Content extracted from CLAUDE.md on 2026-05-13. Organized newest-first by date. Each entry uses the format `### YYYY-MM-DD — <Title> <!-- ENTRY_ISO:YYYY-MM-DD ENTRY_SLUG:slug -->`.

Future entries should be appended at the TOP of the entries section below (newest first), and the `LAST_UPDATED_ISO` / `LAST_UPDATED_SLUG` anchor in CLAUDE.md's Project Context table should be updated to match the new top entry. The Jest test `src/__tests__/lint/changelog-freshness.test.ts` enforces this invariant.

---

### 2026-06-19 — Per-respondent report rate-limit fails closed (Spec 17 Wave I hardening) <!-- ENTRY_ISO:2026-06-19 ENTRY_SLUG:wave-i-report-rate-limit -->

**Shipped to prod** (PR #71, squash `858d432`). Wave I (bugfix & hardening) — the per-respondent assessment report route (`/(report)/assessments/[id]/respondents/[respondentId]/report`) applies a best-effort per-IP rate limit and degrades to `notFound()` (enumeration-safe 404) when exceeded. The guard's `catch` was meant to swallow a genuine rate-limiter outage while re-throwing the fail-closed `notFound()` — but it tested `err.message === "NEXT_NOT_FOUND"`, the **Next 15** digest. **Next 16**'s `notFound()` throws digest `NEXT_HTTP_ERROR_FALLBACK;404`, so the guard never matched: the fail-closed `notFound()` was caught and swallowed, and the report rendered + wrote a `VIEW_REPORT` audit row **past an exceeded rate limit** (ineffective rate limit; authorization was never affected). Same class of bug as the Wave F T8 fix already shipped on the group-report route. **Fix:** replace the stale-digest check with `unstable_rethrow(err)` (re-throws Next navigation control-flow — `notFound`/`redirect` — and returns for everything else). **Test:** the prior suite never actually exercised the guard — `next/headers` was unmocked, so `await headers()` threw and the `catch` skipped the whole rate-limit branch; the test now mocks `next/headers` + `@/lib/rate-limit` and adds a regression asserting an exceeded limit fails closed BEFORE the loader/audit (verified red→green). 308 report-suite tests pass; `CI=true npx next build --turbopack` exit 0; ESLint clean on changed files. Additive — no migration, no flag. Shipped alongside the **participant-add regression fix** (`b74d092`, Codex): immediate-send campaigns now attach selected participants in the create request (atomic, before the campaign leaves DRAFT), so the wizard no longer hits the DRAFT-only participants endpoint after Wave D flipped the campaign to ACTIVE. Remaining Wave I item: **#15** (results-email approval reachable on published templates) — backend confirmed ready (results-email fields are template-level, no published guard; approval-hash bind + send-time re-check intact), the client save affordance for published templates is the open design choice.

---

### 2026-06-19 — CEO / Group report for Leadership Vision Alignment (Spec 17 Wave F #22) <!-- ENTRY_ISO:2026-06-19 ENTRY_SLUG:wave-f-group-report -->

**Shipped to prod** (PR #69, squash `2ec2c42`) + SoT flush (this entry). Closes Jeff's punch-list **#22** ("There is no visible mechanism to combine multiple respondents' answers into a single CEO or group report. This needs to be built or surfaced.") — a NEW read-only, campaign-level **group report** that aggregates an INVITED campaign's completed submissions into a CEO-vs-team view, modeled on Esperto's "CEO Full Report."

**Scope — LVA only.** Mid-build (2026-06-18) Jeff clarified via Slack: *"we don't need aggregate on all reports… just the one"* → *"Just LVA"*. The mockup's Rockefeller (scored) archetype had confused him. So the group report is surfaced for the **Leadership Vision Alignment** template only: a `GROUP_REPORT_ALIASES = ["leadership-vision-alignment"]` allowlist (single source of truth in `wave-f-flags.ts`) gates BOTH the loader (a non-LVA campaign → `notApplicable: "unsupported-template"`, no model build, no audit) AND the CampaignDetail entry link. The docx #22 itself is generic/silent on which report; the LVA-only narrowing is Jeff's authoritative Slack clarification. The generic **scored** group engine (Rockefeller/Five-Dysfunctions: CEO-excluded `CEO | Team-avg | Dev` matrix + N<2 fallback + headline mirror) is **built, reviewed, and fully tested but DORMANT/unreachable** — surfaced later by adding an alias (user chose keep-dormant over remove).

**Architecture (additive — NO migration; `isCEO` already exists):**
- `lib/assessments/group-report-model.ts` (NEW) — pure `buildGroupReportModel()`: cohort = ALL completed submissions (submission-based, orphan-robust — a submitter no longer on the roster is still included + flagged, named via the surviving `OrgRespondent`), CEO from the `isCEO` participant row, CEO-first-then-alphabetical ordering, type-aware answer validation (finite `0` kept; unknown keys/type-mismatch dropped + `degraded`). Qualitative forms (answerer denominators + per-aggregate `n`): financial `Mean|CEO|each` matrix (blank ≠ 0), 16-factor stacked Weak/Avg/Strong + mean(1–3) sorted desc, MULTI_CHOICE %-of-answerers (labels not keys, all options incl 0%), free-text collation (omit-empty). Scored forms (dormant): per-section/domain `ceo`/`teamAvg`(non-CEO)/`dev`, N<2→null, `scaleUpScore`/`tier` headline mirror, per-question CEO-vs-team — read from FROZEN `result`, never recomputed.
- `lib/assessments/group-report.ts` (NEW) — `getCampaignGroupReport()`: authorized snapshot loader. One `RepeatableRead` `$transaction`; authorizes via `canViewGroupReport` BEFORE branching on `accessMode` (no PUBLIC-ness/existence leak); INVITED-only + LVA-alias gates; provenance (`generatedAt` injected, `completedCount`=SUBMITTED, `invitedCount`=non-revoked, `versionId`, `contentHash` over model inputs excluding `generatedAt`, `ceoParticipantId`, `submissionIds`). Returns a discriminated union `notApplicable | forbidden | empty | ok`.
- `lib/assessments/access-control.ts` — NEW `canViewGroupReport()`: **stricter** than the lenient per-respondent read gate — admin/staff bypass, else a coach must be currently active + currently own the org + currently have template access (the write-level currency checks). The bulk-PII door.
- `lib/assessments/wave-f-flags.ts` (NEW) — default-OFF `WAVE_F_GROUP_REPORT_ENABLED` + `WAVE_F_GROUP_REPORT_CANARY` allowlist (coach/org/campaign ids) + the `GROUP_REPORT_ALIASES` LVA allowlist + `isGroupReportAlias`.
- `components/assessments/{GroupReport,QualitativeGroupReport,ScoredGroupReport}.tsx` (NEW) + scoped `su-report.css` group classes (ADR-0005, zero global leak) — branded cover, "as of" provenance line, real `<table>` + `<th scope>` a11y, respondent text rendered as auto-escaped React children (no raw-HTML injection). Dispatch by `reportConfigFor(alias).reportType`.
- `app/(report)/assessments/[id]/report/page.tsx` (NEW) — route: flag gate FIRST → rate-limit (per-actor+campaign+IP, fail-closed `notFound`) BEFORE the load → authorized load → **fail-closed** `GROUP_REPORT_VIEW` audit (direct `db.auditLog.create`, throws on failure, only on `ok`) → render. `dynamic="force-dynamic"`, `revalidate=0`.
- `middleware.ts` — extended the no-store matcher regex to cover the group route (`Cache-Control: no-store, private`).
- `CampaignDetail.tsx` + its server page — gated "View group report" entry as a plain `<a target="_blank">` (NOT a Next `<Link>` — no prefetch of the bulk-PII report); capability computed server-side (client gets only a boolean).
- `lib/assessments/group-report-metrics.ts` (NEW) + `/admin/observability` panel — `assessment.group_report.*` PII-free structured metrics (view/latency, rate_limited, authz_deny, not_applicable, empty, audit_failure, render_failure, degraded, orphan_submission).
- `lib/audit.ts` — `GROUP_REPORT_VIEW` added to the `AuditAction` union (free-form String column — NO Prisma enum, NO migration).

**Process + quality.** Subagent-driven (13 TDD tasks, each implementer → reviewer; mechanical tasks inline-reviewed). The T8 review caught a **Critical**: the rate-limit fail-closed `catch` guarded on `err.message === "NEXT_NOT_FOUND"`, but Next 16's `notFound()` throws digest `NEXT_HTTP_ERROR_FALLBACK;404` → the guard swallowed the fail-closed `notFound()` and fell through to load+audit+render; fixed with `unstable_rethrow`. Whole-branch review: **MERGE-READY**, no Critical/Important, LVA-only gate verified airtight + security solid end-to-end. Build clean (`CI=true npx next build --turbopack`); full suite **3967 pass / 28 pre-existing fail (zero new; +179 Wave F tests)**; ESLint 0/0 on changed files. 16 commits.

**Rollout.** Default-OFF flag ⇒ **merging is dark** (nothing live changed). **To launch:** set `WAVE_F_GROUP_REPORT_CANARY` (canary coaches/orgs/campaigns) on Vercel Production → verify → set `WAVE_F_GROUP_REPORT_ENABLED=1` globally + redeploy, per [17f-ops-runbook](docs/specs/v7.6/17f-ops-runbook.md). **Kill-switch:** zero both vars + redeploy (route 404s, link hidden; no code change). **Rollback:** revert + Vercel promote-previous. **Deferred adjacent hardening (non-blockers, in the runbook):** (1) participant-delete TOCTOU + invitation `ON DELETE SET NULL` orphan race (loader already orphan-robust); (2) the per-respondent report route shares the same stale-digest rate-limit bug (ineffective rate-limit; authz holds) — fix with `unstable_rethrow` there too; (3) persisted/freeze-on-close snapshot. ADR-0011 + [17f design](docs/specs/v7.6/17f-wave-f-group-report-design.md). Mockup `wave-f-group-report-mockup.pdf` sent to Jeff.

### 2026-06-18 — Assessment report polish + qualitative report (Spec 17 Wave E) <!-- ENTRY_ISO:2026-06-18 ENTRY_SLUG:wave-e-report-polish -->

**PR #67** (`feat/wave-e-report-polish`, squash `1c9f295`, prod). Closes Jeff's June-9 report-polish items **#21, #24, #25, #26, #27, #28, #30, #31**; **#29** (LVA content) awaits Jeff; **#33** (all-reports accuracy) pends his side-by-side diffs. Spec `docs/specs/v7.6/17e-wave-e-report-polish-design.md` (+ §9-§12 `/claudex:plan` hardening, authoritative) + plan `17e-…-implementation-plan.md` + [ADR-0010](../docs/adr/0010-assessment-reports-have-two-types-scored-and-qualitative.md) + [17e ops runbook](../docs/specs/v7.6/17e-ops-runbook.md). **Additive — NO migration, NO feature flag** (reversible by revert + Vercel promote-previous; `report-config.ts` is the launch lever, so LVA + QSP go qualitative on deploy).

**The finding that shaped the wave:** our canonical per-respondent report (`BrandedReport`) is a *scored* report, but the Esperto reference (read from the question text **and the 29 embedded assessment screenshots** in Jeff's workbook) shows **LVA + QSP are *qualitative* prep reports** — the respondent's answers organized by theme, no score ring / overall / "All Sections" table. Forcing them through the scored anatomy produced the wrong report. So the per-respondent report now has **two TYPES**, chosen by an explicit per-template config (ADR-0010) — not inferred from the scoring shape (the "hide table when neutral-tier" shortcut breaks on Five Dysfunctions, which is neutral-tier yet keeps its category totals).

**Architecture:** `lib/assessments/report-config.ts` — `reportConfigFor(alias)` → `{ reportType: "scored" | "qualitative", showScoreTable }` keyed by `AssessmentTemplate.alias` (`RockHabits`→scored+no-table; `qsp-v1`/`qsp-v2`/`leadership-vision-alignment`→qualitative; keep-set `five-dysfunctions`/`scaling-up-full`/`scaling-up-quick`→default scored+table; unknown→default, back-compat). `lib/assessments/question-meta.ts` — a shared `buildQuestionMetaByKey` (type/label/sectionStableKey/scale-min-max/options) used by **both** the on-screen loader (`respondent-report.ts`) and the email builder (`report-email.ts`) so they never drift. `lib/assessments/qualitative-report-model.ts` — the shared data layer: groups the respondent's answers by section, **renders only ANSWERED questions** (omit blanks + fully-empty sections → reproduces Esperto's conditional "Why is X?" output with NO conditional engine), **type-aware presence** (a real `0` is kept), **MULTI_CHOICE keys→labels** via the question's options, a **per-template/per-section presentation contract** (qa / metric-table / percent-bar / rating / choices), and **defensive grouping** (falls back to `sections[].questions` + an "Additional responses" orphan bucket so old pinned versions can't render empty). Two thin renderers consume it: `components/assessments/QualitativeReport.tsx` (on-screen/PDF, dispatched from `BrandedReport` when `reportType==="qualitative"`) and an inline-HTML EMAIL twin in `report-email.ts`. **Per-respondent only — no team Mean** (the group/Mean report is Wave F #22; ADR-0003/0007).

**E-1 mechanical:** **#25** footer = submission date + SU logo + "Generated by Scaling Up Platform" (the `submissionId·version·hash·generated-now` debug stamp removed; provenance moved to the `VIEW_REPORT` audit + enqueue log, R2-L8) — both render paths. **#24** Rockefeller "All Sections" score table removed via `showScoreTable:false`. **#26/#28** QSP v1/v2 first-question "(with 1 decimal)" label stripped in the seeds (scale was already integer) + a `stripLegacyDecimalSuffix` render util for already-pinned versions. **#21** the deprecated Coaches-Portal raw-data view (`AssessmentResultView`) now shows question TEXT not `q1_1` codes — required real plumbing (the `/result` API didn't return labels; added `questions` to the select + a `questionByKey` map + a component prop).

**E-2 email twin hardening:** HTML-escapes every respondent-controlled value (answer text / option labels / question labels — inline-HTML string assembly doesn't auto-escape), clamps numeric→style widths to `[0,100]`, truncates each text answer (cap 600) + caps total body bytes (90 KB; no respondent report URL to "view full" per ADR-0007/0008), and renders defensively (a malformed item/section degrades, never throws the whole email; whole-body failure → a safe fallback + a logged `renderError`). **Submit-route refactor (R3-M3):** the invited submit (`org-survey/.../submit/route.ts`) now renders the email **outside** the DB transaction — Phase 1 (lock-free: gate → score → render the outbox rows) → Phase 2 (`SELECT … FOR UPDATE`: re-validate lifecycle/conflict AND re-validate the email render-input fingerprint, then insert the pre-rendered rows). Code-reviewed: escaping complete, no TOCTOU, idempotency holds, scored path unchanged.

**Process:** brainstorm → `/grill-with-docs` (G1-G10: per-respondent-no-Mean, build-generic-wire-LVA+QSP, Jeff's-xlsx-authoritative, text-only preface, label-not-scale fix, footer, no-flag, email-twin) → `/grill-me` (the keystone: "render only answered questions" reproduces conditional output with no engine; include the respondent's own 16-factor matrix ratings) → ADR-0010 → 3-round `/claudex:plan` (already folded) → `/frontend-design` mockup (approved) → subagent-driven TDD (T1-T13, each implementer + diff/code-quality review; T11 email got a dedicated security review) → `/co-validate` (Codex staff-eng pass caught **4 real gaps I'd missed, ALL fixed**: **C-H1** MULTI_CHOICE rendered keys not labels — the flagged obstacles section showed `the_leadership` not "The Leadership"; **C-M1** the email twin dropped scale+options → degraded; **C-M3** grouping fragile for old pinned versions → empty report; **C-M2** Phase-2 didn't re-validate email render inputs under the lock) → LVA render **visually verified** against the approved mockup.

**Discovery during #29 (the LVA content item):** a structured XLSX diff + reading the workbook's **29 embedded screenshots** (the text-only diff was incomplete — a real miss the user caught) confirmed 3 differences: (1) financials are present-tense in the source ("What is the revenue?") vs our appended "…in three years"; (2) the "Obstacles" section is **conditional** in the source (only the 3 picked factors' "Why is X?" show) vs our 16 always-on (a survey-engine conditional-logic gap — the *report* is already correct via omit-empty); (3) our section intros are paraphrased vs the source's verbatim copy. Everything else matches. A plain-language Word comparison (`LVA-assessment-comparison-for-jeff.docx`) was prepared for Jeff; the content reconcile is a separate forward-only DRAFT re-seed pending his confirmation.

**Quality:** `CI=true npx next build --turbopack` clean; full suite **3791 pass / 28 pre-existing fail (zero new — all 7 failing suites verified pre-existing)**; +110 new tests; ESLint 0/0 on all changed files. **Deferred follow-ups (in the runbook):** outbox send-time approval re-check (C-M2 residual / R2-H2 — Wave-D drain infra), within-section email byte budget, R2-M7 publish-hash gate (→ folds into the #29 reconcile), the `/admin/observability` render-failure panel (no metrics backend exists — currently structured logs). **Gotcha:** report TYPE is intentionally global/retroactive (all LVA/QSP reports flip on deploy), while report CONTENT stays version-pinned. Next: Jeff's #29 nod → forward-only LVA re-seed; #33 pends his diffs.

---

### 2026-06-17 — Assessment campaign-setup features (Spec 17 Wave D) <!-- ENTRY_ISO:2026-06-17 ENTRY_SLUG:wave-d-campaign-setup -->

**PR #65** (`feat/wave-d-campaign-setup`, squash `69bd9f1`, prod). Closes 8 of Jeff's June-9 campaign-setup items (#1, #2, #3, #15, #16, #17, #18, #20); #19 custom slides split to its own later gated mini-wave. Spec `docs/specs/v7.6/17d-wave-d-campaign-setup-design.md` + plan `17d-…-implementation-plan.md` + [ADR-0009](../docs/adr/0009-assessment-campaign-auto-send-lifecycle.md) + recreated [ADR-0008](../docs/adr/0008-public-self-assessments-show-taker-results.md) + [17d ops runbook](../docs/specs/v7.6/17d-ops-runbook.md). **Default-OFF behind flags — merging is dark; launch is a separate, incremental flag-flip.**

**Items:**
- **#1 — soft-delete campaigns.** New `DELETE /api/assessment-campaigns/[id]` gated on a **distinct ownership predicate** (admin/privileged OR `createdByCoachId === actor.coachId` — NOT `canManageCampaign`, so delete survives a later loss of template/org access; the null===null bypass is closed), deletable in any state, soft-delete (`deletedAt`), blast-radius confirm dialog, responses retained, no restore UI. A new `liveCampaign` helper (`liveCampaignWhere` + `loadLiveCampaign`) bakes `deletedAt IS NULL` into the **core** `canManageCampaign` (findUnique→findFirst) so deleted campaigns are invisible on every read surface (list/detail/report/export/trends/aggregate/dashboard/public-alias), with an `includeDeleted` admin-recovery opt-in; the publish-route resurrect gap + admin-count gaps closed.
- **#2/#3 — invite timing + auto-send.** 2-state timing radio (default "Immediately" / "When the campaign opens") on the wizard; **unified `openAt`** (invitations send when the survey opens — `openAt` already gated accessibility, so decoupling would strand recipients on "not opened yet"). Immediately → `openAt=now` + status ACTIVE + auto-send on create; future-dated → DRAFT + the `*/3` cron sends at open. Auto-send is an **Inngest fan-out** (`concurrency:{key:campaignId,limit:1}`, atomic CAS claim on `inviteSendStartedAt IS NULL`, per-batch heartbeat, ≤25-recipient durable `step.run` batches reusing the extracted `sendInvitesBatch` lib, abort-on-delete/pause re-checked per batch, Date-rehydration across the JSON step boundary, no-false-complete on a total send failure [releases the claim + throws]) + a **`*/3` cron** (`assessment-scheduled-send-cron`: due-sweep + stale-claim recovery [10-min heartbeat] + lost-IMMEDIATELY-event backstop). Consequence-labeled final button ("Create & send N now" / "Schedule for <date>"), no modal, ≥1-participant guard. Timezone kept UTC-instant (cron fires on instants) + 2 render-drift fixes (CampaignDetail openAt round-trip via `formatDateTimeLocal`; respondent gate message via `formatTimestampDateTime`).
- **#15 — results email (invited).** A per-campaign `sendResultsToRespondent` toggle that **activates the pre-scaffolded F0 "Results Email"** rather than a parallel path: the email uses the admin-authored `resultsEmailSubject`/`resultsEmailBodyMarkdown` + the Spec-16 report, gated by the template's **`resultsEmailContentApproved` bound to a content hash** (clear-on-edit; re-derived + compared at send → fail-closed; SEC-H2). Invited-only (public quiz unchanged, ADR-0008); adaptive thank-you copy; enqueued in the SUBMITTED transaction (exactly-once); rendered-PII `bodyHtml` purged from the outbox on SENT/terminal-FAILED (SEC-M4). The #15 wizard toggle is disabled when the template isn't approved + gated behind `WAVE_D_RESULTS_EMAIL_ENABLED`.
- **#16 — coach-notify on completion.** `notifyCoachOnCompletion` toggle; on SUBMITTED, emails the owning coach a **link** to the Spec-13 gated report (no PII in the body) via the submission outbox; gated behind `WAVE_D_COACH_NOTIFY_ENABLED`.
- **#17/#18.** Selected template name shown on the schedule step; filter-aware Select-All per company/team group in the participant picker.
- **#20 — full-HTML invitation email.** A coach can paste/upload (`.html`/`.htm`, ≤50KB) their own HTML, which **replaces the entire email** (no branded shell). Security: a dedicated coach-safe `sanitize-html` sanitizer (strips script/iframe/style/form/svg/`on*`/`javascript:`/`data:`/CSS `url()`/`expression()`; img src only `cid`/`https`) + an **htmlparser2 token-placement validator** that allows `{{invitationUrl}}` only as plain text or a whole `<a href>` (rejects exfil placements + missing token; SEC-H1). Flow = validate-on-save (raw stored) → at send: interpolate (same Wave-A `TOKEN_RE`, no pre-interpolation entity-decode, PII values HTML-escaped) → sanitize. SMTP subject stays the existing token-allowlisted `invitationSubject` field. Gated behind `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED`.

**Migration (first Wave-D migration; A–C were zero-migration):** additive only — `AssessmentCampaign` += `deletedAt`, `inviteTiming` (enum `IMMEDIATELY|ON_OPEN` default IMMEDIATELY), `inviteSendStartedAt`/`inviteSendHeartbeatAt`/`invitesSentAt`, `sendResultsToRespondent`/`notifyCoachOnCompletion` (default false), `invitationBodyHtml`; `AssessmentTemplate` += `resultsEmailContentApprovedHash`/`At`/`By`. **No new `AssessmentCampaignStatus` value** (scheduled is a derived state — ADR-0009 correction: a persisted enum would break rolled-back code). An **`invitesSentAt = COALESCE(invitesSentAt, createdAt)` backfill** stamps all legacy campaigns so the cron can never re-send them, plus a partial index `idx_campaign_due_unsent`. `check-migration-safety.mjs` passes; applied via `prisma migrate deploy` on the Vercel build.

**Flags / rollout:** all behavior is gated by default-OFF env flags `WAVE_D_AUTO_SEND_ENABLED` / `WAVE_D_RESULTS_EMAIL_ENABLED` / `WAVE_D_COACH_NOTIFY_ENABLED` / `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` + an `ASSESSMENT_SENDS_PAUSED` kill switch. With all flags off the wizard hides the timing radio + #15/#16 checkboxes and a created campaign behaves exactly like `main` (DRAFT, the coach's chosen `openAt` honored, the manual "Send Invitations" `/invite` works). Launch = flip the flags incrementally (runbook). Rollback is NOT a clean promote-previous (rolled-back code reads DRAFT+ON_OPEN rows as ordinary drafts) → the runbook's sequence is flag-off → pause the 2 Inngest fns → handle unsent ON_OPEN rows → promote-previous.

**Process:** brainstorm → `/grill-with-docs` + a relentless `/grill-me` (3 structural findings: openAt-timezone semantics, the invite send-mechanism [the synchronous `/invite` is 25-capped + the outbox is submission-bound, so auto-send needed the Inngest fan-out], and #15 colliding with the scaffolded F0 approval gate) → `/claudex:plan` (3 rounds + a recovered standalone security pass, 29 findings, all folded into 17d) → subagent-driven build (13 TDD tasks, each implementer + spec-compliance review + code-quality review) → a whole-branch review that **caught a dark-merge Critical** (the timing radio wasn't flag-gated, so flag-off campaigns hit a permanent 409 on manual send) + 2 re-gate blockers (a falsely-claimed `mark-sent deletedAt` guard; ungated #15/#16 checkboxes producing a misleading flag-off thank-you) — all fixed + re-verified. Adversarial security verification ran the email sanitizer against ~70 XSS/exfil payloads through the real libs, the SEC-M3 IDOR participant re-auth, and the auto-send idempotency.

**Verification:** build clean (`CI=true npx next build --turbopack`); ESLint 0/0 on changed files; full suite **3681 passed / 28 failed — all 28 pre-existing on `main` (zero new failures)**.

### 2026-06-15 — Assessment survey participant UX, all assessments (Spec 17 Wave C) <!-- ENTRY_ISO:2026-06-15 ENTRY_SLUG:wave-c-survey-ux -->

**Wave C — participant survey UX polish across ALL assessments** (PR #63, squash `3518d87`, prod). Closes Jeff's Spec 17 #6–#14. Every change lives in the shared participant components (`SectionPager` / `QuestionInput` / `AssessmentShellHeader`) + scoped `.su-assessment-brand` CSS, so it applies uniformly to every assessment (invited `/org-survey` + public `/quiz`): Rockefeller, QSP v1/v2, LVA, Scaling Up Full, Five Dysfunctions, public Quick Assessment. **Additive — no migration, no feature flag** (reversible by `git revert` + Vercel promote-previous).

- **#6/#10 Unified purple card:** white logo → campaign-name caption → "Section N of M" → one linear progress bar, all in one purple shell. Removed the white `ty-header` bar, the repeating white survey-title `ty-card`, and the decorative segmented strip; the progressbar moved into `AssessmentShellHeader` (exactly one `role=progressbar`).
- **#7** Removed the orange "01" section-number badge.
- **#8 Slider visually unset:** unanswered → thumb hidden + flat empty rail (was parked at the minimum looking pre-selected); a track-level `:focus-visible` ring keeps keyboard focus visible with no thumb. Fixes the long-standing stuck-at-minimum trap for **every** assessment; the minimum is selectable.
- **#9** Slider handle 22px → 30px.
- **#11/#12** Text/number inputs get a visible border + focus ring + placeholders; the existing 10k `MAX_TEXT_ANSWER_LENGTH` is surfaced as a near-cap counter (extracted to a client-safe `lib/assessments/answer-limits.ts` so the participant bundle doesn't pull in scoring/Zod).
- **#13 Per-question red validation:** blocked advance → each unanswered required question gets a focus-independent red card border + `aria-invalid`, focus jumps to the first miss (`getElementById`, selector-safe), clears per-question on answer (prune-only-when-`isAnswered`); per-type incl. MULTI_CHOICE. Plus a `requireAtLeastOneAnswer` mode (both flows) for all-optional zero-answer submits, a synchronous submit latch (double-click), a client-safe stale-answer prune (hydrate + pre-submit), and inline org-survey submit-error recovery (stay on the pager, not a terminal screen).
- **#14** Verify-only — section intros render their `description`.

**Process:** brainstorm → `/grill-with-docs` (G1–G5) → `/grill-me` (G6–G7) → `/claudex:plan` 3-round (16 findings, all addressed) → `/frontend-design` mockup (user-approved) → subagent-driven build (8 TDD tasks, implementer + spec + code-quality review each) → whole-branch review MERGE-READY + 2 fixes. Build clean; ESLint 0/0 on changed files; full suite 3360+ passed (~10 pre-existing/environmental failures only). Preview-smoked live on the public Quick Assessment (blank-until-tapped slider, descriptions, immaculate results) + a real-Chromium Playwright slider-state check. Specs `docs/specs/v7.6/17c-*`. **Gotcha:** invite emails link to `APP_URL` (prod), so invited links open on prod even from preview campaigns — host-swap to test invited on a preview. **Deferred → "v2" wave:** fewer-clicks pager (section intro + questions on one page), invited results page (Wave D `sendResultsToRespondent` #15), per-template content (empty Welcome/Completion + missing descriptions), invite-email body copy.

### 2026-06-14 — Per-workshop landing-page custom-HTML editor (Spec 17 Wave B) <!-- ENTRY_ISO:2026-06-14 ENTRY_SLUG:wave-b-workshop-html-editor -->

**Spec 17 Wave B — per-workshop landing-page custom-HTML editor (PR #59, squash `62143fb`, prod behind a default-OFF flag).** Closes Jeff's "on workshops" PDF ask: an admin/staff-only editor to set an individual workshop's landing-page `customHtml`, shipped dark behind `WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED` (absent in committed config — **merging changed nothing live; launch is a separate flag-flip**).

**What shipped (7 tasks, subagent-driven — each implementer + spec-compliance + code-quality review):**
- **T1** `lib/templates/landing-page-variables.ts` — `buildEnrichedLandingPageVariables(workshopId)` mirrors auto-build's `{{registration_url}}` enrichment for reuse.
- **T2** PUT `…/workshops/[id]/landing-pages/[template]` customHtml write — admin/staff-only (mirrors `customCode`); **mode-exclusive** body (rejects customHtml + content/status/customCode, 400); interpolate (enriched) → `sanitizeCustomHtml(allowTokenUris:false)`; **post-interpolation** length cap (R2-MED-3); **value-compare CAS** on `expectedCustomHtml` (R2-MED-2, ms-immune — replaces a fragile `updatedAt` compare); prior body persisted to `AuditLog.changes` (action `UPDATE_CUSTOM_HTML`, structured metadata: op/SHAs/role/sanitizerStripped) **inside one `db.$transaction`** (not the failure-swallowing `logAudit`); no-row first-save **creates** the row synthesizing valid `content` (R2-HIGH-2, P2002→409); per-actor rate limit; response echoes saved `customHtml` + `sanitizerStripped`.
- **T3** GET `?resolved=1` privileged refresh/pre-fill source (regenerates from the active `PageTemplate.customHtml` + current vars; never echoes the stored override); `customHtmlEditor` capability marker on GET (`flag && isPrivilegedRole`); entity-bound one-click **restore** (latest `{entityType,entityId,action}` audit row → re-sanitize, NO re-interpolate, `op:"restore"`, same CAS+transaction → save→restore→restore works).
- **T4** library **clone route** is no longer a `customHtml` writer — never copies the source body (R1-HIGH-2: Q4-resolved HTML would leak the source coach/URL) nor clears an existing target's override (R2-HIGH-1) → closes the coach-reachable authz bypass the security pass flagged.
- **T5** `components/workshops/custom-html-panel.tsx` (solo+duo) — **fail-closed** (renders only on `customHtmlEditor===true`); separate **"Save HTML"** payload (`{customHtml, expectedCustomHtml}` only — never content/status); confirm-gated **draft-only Refresh**; **Restore**; static-snapshot + DRAFT-publish notices; 409 + sanitizer-strip messaging (a11y `role=alert/status`); CAS-baseline re-anchor on save/restore (no stale-409 on consecutive saves).
- **T6** Q3 sanitizer admin-trust comment at `parseStyleAttributes:false`; dry-run-by-default, prod-guarded `scripts/rollback-workshop-customhtml.mjs` (+ testable `lib/scripts/rollback-workshop-customhtml-core.ts`) that value-compare-CAS-restores `UPDATE_CUSTOM_HTML` rows by window/actor/workshop, skipping diverged pages; `docs/specs/v7.6/17b-ops-runbook.md` (observability SQL + retention policy).

**Decisions:** grilled **Q1–Q9** (`/grill-with-docs` Q1–Q7 + `/grill-me` Q8 publish-lifecycle + Q9 ops/SRE), then **3-round `/claudex:plan`** adversarial hardening (senior-eng → security → ops; **18 findings, all material, all accepted**). **ZERO migration** — prior body in the existing `AuditLog.changes` text column (Q1). Q4: `customHtml` is a **resolved frozen snapshot**; the public render path (`(public)/workshop/[slug]`) is unchanged (trusted echo) and is NOT flag-gated.

**Verification:** final whole-branch review **merge-ready** (no Critical/Important). Build clean (`CI=true npx next build --turbopack`); eslint 0/0 on all 16 changed files; 279/279 targeted tests; full suite 3334 passed (10 pre-existing failures, verified identical on the base commit — note CLAUDE.md lists 3 known-failing suites but actual is 5: also `api/quiz/submit-post`, `components/portal-assessments-status-filter`). **End-user tested on a Vercel preview** with the flag on: editor visible (admin), Save HTML → `<script>` stripped → public page renders the sanitized override, Restore reverts (persisted), Refresh confirm dialog, coach → `/unauthorized`. **Non-blocking follow-ups:** consolidate the 3 PageTemplate category-precedence lookups (route ~800 lines); presence-check comment; refresh-disabled tooltip; automated audit-pruning + wiring the obs dashboard.

**Follow-up — Live Preview (2026-06-14, PR #61 `1a9599e`, prod):** found during prod testing — the per-workshop editor's in-page **Live Preview** pane rendered only the block-layout template and ignored a `customHtml` override, so it didn't match the live public page. Fixed (UI-only): when the Custom HTML field is non-empty the preview renders that HTML in a **sandboxed `<iframe sandbox="">`** (no scripts, no CSS bleed), live as you type, mirroring the public render precedence; empty → block template as before (caption notes the preview shows raw HTML — tokens resolve + scripts strip on the live page). Additive `onValueChange` read-out on `CustomHtmlPanel`; no save/restore/CAS/API/public-render change. Solo + duo. Verified on a Vercel preview (preview pane now shows the custom Kajabi HTML). 20/20 panel tests; build clean.

### 2026-06-12 — Assessment invitation emails: merge-field fix + branded HTML (Spec 17 Wave A) <!-- ENTRY_ISO:2026-06-12 ENTRY_SLUG:assessment-invite-email-branding-merge-fix -->

**PR #57** (squash `5ba0800`, prod). **Spec 17 — Wave A** (the first wave of the 33-item Jeff June 9 feedback punch-list; spec `docs/specs/v7.6/17-jeff-june9-feedback-punchlist.md`, plan `17a`). Closes feedback **#4** (merge fields rendering literally) + **#5** (high-end HTML invitation emails). Additive only — **no migration**.

**The bug (#4) was bigger than reported.** The invitation `substitute()` only resolved 6 tokens; the 7 seeded templates actually use `{{organizationName}}`, `{{templateName}}`, `{{respondentFirstName}}`/`{{firstName}}`, `{{invitationUrl}}`/`{{assessmentUrl}}` — so **4 tokens rendered literally**, and `{{assessmentUrl}}` is the **CTA link** on Five Dysfunctions & Quick (their "start" links were broken text).

**New `src/src/lib/assessments/invitation-email.ts`** (pure, unit-tested; mirrors `report-email.ts`):
- `buildTokenValues` + `interpolateTokens` — full alias set in both `{{camelCase}}` and `{{snake_case}}`, neutral fallbacks for empty known tokens ("your organization"/"your coach"/"there"/"ongoing"), unknown tokens stripped.
- Typed render paths: `renderSubject` (allowlist EXCLUDING url/email/token-bearing values + `stripControlChars` + assert no `#t=`/URL leak), `renderTextBody` (plain-text twin), `renderHtmlBody` (escape-first; safe inline markdown — links + bold — with a link URL policy rejecting `javascript:`/`data:`/protocol-relative; `dropRedundantCta`).
- `buildInvitationEmailHtml` — branded inline-styled, table-based, Outlook/Gmail-safe shell: Four-Decisions stripe → `#522583` purple hero with the **white SU logo** (inline **CID** PNG, base64-embedded → serverless-safe) → body → purple "Start the assessment" CTA (replaces the bare blue `#1D4ED8` button) → footer. `resolveCoachName` = `createdByCoachId` coach ?? `organization.owner`.
- `src/src/lib/assets/invitation-logo.ts` — base64-embedded white PNG (generated from `su-logo-white.svg`) + preflight test.

**`smtp-transport`**: added optional `text` (multipart/alternative — plain-text twin) + `cid` on `SmtpAttachment`; both passed to nodemailer. Additive — existing callers unaffected.

**`sendAssessmentInvitationEmail`** delegates to the new module; attaches the logo CID; passes `html`+`text`. **Env kill-switch `ASSESSMENT_INVITE_BRANDED=0`** reverts to a preserved legacy renderer.

**The 3 routes** (invite/reminders/resend): load `organization.name` + owner/creator coach + `template.name` and forward them; **resend now honors per-campaign `invitationSubject`/`invitationBodyMarkdown` overrides** (it ignored them); reminders + resend **rotate the invitation token only AFTER a successful send** (previously rotated before → a failed send killed the recipient's existing link with no replacement) + a reminder **batch cap**.

**Process**: built subagent-driven (TDD per task group, spec + code-quality reviewers between groups). Hardened via **grill-with-docs + grill-me**, then a **claudex Codex adversarial loop** (senior-eng + ops/SRE) plus a **dedicated synchronous security pass** (the loop's security round was lost to a runner desync). Review caught + fixed: a **coach clone-route authz bypass** (`POST /api/landing-pages/library` copied `customHtml` — HIGH), a **subject-line token-credential leak** (HIGH), **markdown-injection-via-PII** (neutralize markdown delimiters in data values), the shell `href` escape, and a double-escape in body link hrefs. 67+ targeted tests green; ESLint clean; `CI=true npx next build --turbopack` passes.

**Wave B** (per-workshop landing-page HTML editor — the "on workshops" email ask) is designed + grilled + Codex-reviewed and **gated** with its plan `17b` (zero-migration after grill); **not yet built**. Waves C–F catalogued + gated in Spec 17. The clone-route bypass's full fix lands in Wave B.

### 2026-06-11 — Quick Assessment: polished results report + report emails + per-coach links <!-- ENTRY_ISO:2026-06-11 ENTRY_SLUG:quick-assessment-report-emails-coach-links -->

**PRs #53 + #54** (Spec [`16`](docs/specs/v7.6/16-quick-assessment-report-emails-and-coach-links.md)). Triggered by the user live-testing the now-launched public Quick Assessment and finding three gaps: the results page was the bare un-styled `BrandedReport`, a bare public link had no coach attribution, and nobody received a copy. Decided via brainstorm + an approved `/frontend-design` mockup; built with a **Workflow** (report-rendering phase → distribution/attribution phase → 3-lens adversarial review) then a fix pass. Additive only — **no migration**.

**#53 — report polish + emails + coach links.**
- **Report rendering**: `BrandedReport` now renders the approved anatomy — cover (Four-Decisions stripe + white logo) → overall **0–100 score ring** + band + meta → per-decision **cards** (domain-colored, with bars) → score-summary table → **detailed breakdown with right-aligned score chips** (fixes the bug where the per-statement score digit was jammed onto the statement text) → conclusion + coach CTA → footer/provenance. All new CSS scoped under `.su-public-brand .su-report` (ADR-0005).
- **Email-safe builder** `src/src/lib/assessments/report-email.ts` → `buildReportEmailHtml({ report, recipientRole })`: inline-styled `<table>`-layout HTML (no external CSS, no flex/grid — Outlook-safe), every value HTML-escaped, **plain-text subjects** (control-chars stripped, NOT HTML-escaped — a subject is a MIME header, not HTML). Reuses `report-presentation.ts` so on-screen + email stay in lockstep. Includes the detailed breakdown so the email is a faithful copy. `buildRespondentReportFromSubmission` assembles the `RespondentReport` server-side from data the submit route already holds (no DB round-trip).
- **Distribution** (extends the Spec-15 durable outbox + Inngest worker): on submit, inside the existing `db.$transaction`, enqueue **TAKER_COPY** (always, to the taker's email — full report), **REFERRING_COACH** (only when the active-coach guard resolves — full report, **upgraded** from the old lead-alert), **SU_TEAM** (only when an SU address is configured — unchanged lead-alert summary). Idempotent via `@@unique([submissionId, recipientRole])`; post-commit `inngest.send` guarded.
- **Per-coach attribution**: `public-quiz-client` reads `?coach=<ref>` (`useSearchParams`) → sends `referringCoachEmail`; `findActiveCoachByEmail` validates it (active, non-expired coach only — a bad/inactive ref silently falls back to SU-team-only, so it can't be used to relay a report to an arbitrary address). Coach portal `/portal/assessments` gains a **"Your Quick Assessment link"** card (`resolvePublicQuickAlias` finds the active PUBLIC `scaling-up-quick` campaign) with the coach's attributed link + a Copy button. Consent copy updated to disclose the emailed copy.
- **Review fixes**: plain-text email subjects; split the score ring into a big number + small denominator (was crowded); WCAG-safe darkened text for the per-decision average numerals (raw People/Cash colors failed contrast); the overall score is announced to AT via `sr-only` (the ring graphic stays decorative); the coach CTA is a real `<a>` link (mailto the coach when present, else a fallback); per-decision heading-order consistency; the email includes the detailed breakdown. (On-screen/email `scoringConfig` parity flagged as a benign multi-file follow-up — the Quick Assessment's headline is driven by `scaleUpScore` in the result, so neutral-tier detection is unaffected.)

**#54 — on-screen report rendered bare (follow-on, found in live testing).** The polished styling lives in `su-report.css`, scoped to `.su-public-brand .su-report`. Only the invited `(report)` route's layout imported it + supplied the wrapper; the **public in-place results** rendered `<BrandedReport>` with neither → unstyled (the **emailed** copy looked correct because it uses inline styles). Fix: wrap the in-place report in `.su-public-brand .su-report` and `import "@/styles/su-report.css"` in the public client; regression test asserts the wrapper. Rules stay scoped (ADR-0005, no leak).

**Launch state:** the Quick Assessment is live (public link + per-coach links); Five Dysfunctions live (invited). The SU-team lead address defaults to `ADMIN_EMAIL` (set `QUICK_ASSESSMENT_TEAM_EMAIL` in Vercel to redirect central leads). 114 tests across the touched suites green; `CI=true npx next build --turbopack` clean.

---

### 2026-06-10 — Five Dysfunctions assessment, both quizzes launched live, + participant-intro polish <!-- ENTRY_ISO:2026-06-10 ENTRY_SLUG:five-dysfunctions-and-participant-polish -->

Follow-on session after the Quick Assessment build (#45). Shipped PRs **#47–#51**, **launched** both the Quick Assessment and Five Dysfunctions to prod, and fixed two P1 bugs found during launch/testing. All work **additive migration only**; built TDD/SDD; reviewed by the **superpowers code-reviewer** (Greptile dropped — trial 50-review cap; the on-request code-reviewer/Codex/claudex pass replaces it). Process note: per the user, merge green PRs of greenlit work without per-PR confirmation, and fold SoT into batched updates rather than a docs-deploy per merge (this entry is one such batched flush).

**Quick Assessment — LAUNCHED to prod.** Via the live admin (guarded paths only): the `scaling-up-quick` template was seeded (additive DRAFT), **published**, and a **PUBLIC campaign** (`scaling_up_quick_pub_260610041810`) was created + activated through the new admin PUBLIC-campaign flow. Live at `…/quiz/scaling_up_quick_pub_260610041810` — branded welcome, 32 questions across People/Strategy/Execution/Cash (0–10), in-place results. Attached to a real Organization (Path C) for attribution; the org is never shown to takers.

**PR #47 — honest public-flow copy.** The public quiz reused invited-flow wording ("You're invited", "shared only with the coach who sent this", "your facilitator will follow up") which is inaccurate for a public lead-magnet and contradicted the submit consent line. Reworded the intro + contact steps to honest public copy (results shown instantly + shared with the SU team and the referring coach if any). `public-quiz-client.tsx` is public-only; the invited org-survey flow untouched.

**PR #48 — Five Dysfunctions of a Team assessment (DRAFT seed) → then launched.** Delivers Jeff's "totals by category" ask using the existing domains + per-domain-tier engine. New `src/prisma/seed-five-dysfunctions.ts` encodes the canonical Lencioni/Wiley **Team Assessment** (source: the Wiley excerpt PDF the user provided; Scaling Up is licensed to administer it): 38 SLIDER_LIKERT statements on a 1–5 scale, grouped into the **5 fundamentals** — Trust / Conflict / Commitment / Accountability / Results — by the instrument's own scoring-grid mapping (per-domain counts 8/8/7/7/8). Each fundamental is a scoring **domain** with the published bands (**High ≥3.75 · Medium 3.25–3.74 · Low ≤3.24**) tiling [1,5]; per-band interpretation text from the source. A single **neutral global tier** (no 0–100 rollup — the instrument reports five separate category scores). No reverse-scoring. Mirrors the Quick Assessment seed (`ensureTemplateVersionContent`, content-hash idempotent, fail-closed, **never publishes**; passes both `TemplateVersionForScoring` + `Publish` schemas). 32-test content guard. **Launched** this session: seeded → published → **granted to the "Scaling Up Coaches" access group** so it's selectable in the coach campaign wizard as an **INVITED team assessment**. Fidelity note: statements are grouped by fundamental (not the source's mixed 1–38 order) so the per-category report renders cleanly. (No third-party copyrighted text is reproduced here.)

**PR #49 — two P1 bugs found launching Five Dysfunctions.** (1) `buildQuestions` restarted `sortOrder` per section → `ensureTemplateVersionContent`'s integrity guard threw "duplicate question sortOrder" at seed time (the content test hadn't checked uniqueness). Renumber globally 1..38 + regression test. (2) `evaluateAccessChange` read `r.accessGroup.deletedAt` on `accessGroupCoach` rows but the `findMany` **never included the `accessGroup` relation** → `TypeError: Cannot read properties of undefined (reading 'deletedAt')` → **500 on every "add template to group"** for a group with coaches — which had been silently blocking admins from granting *any* newly-published template to coaches (confirmed against prod via Vercel logs). Added the `include` (+ permitted it in the tx type), dropped an unused import, and made the test `tx` mock faithful to Prisma (strip `accessGroup` unless included) so the existing ADD/REMOVE suite now catches this class of bug.

**PR #50 — Likert slider minimum is selectable.** User report: answering the minimum (e.g. "1" on a 1–5 scale) wouldn't let them proceed. The unanswered thumb rests at `min`; a tap the browser treats as a micro-drag fires neither `change` (value unchanged) nor `click` (movement cancels it), so the min never committed → `isAnswered` false → required gate blocked. Commit on `pointerup` too, so any tap/drag-release registers the current value; regression test for the 1-based min. Shared `QuestionInput` → fixes every assessment. Also realigned a stale `public-quiz-pager` test still asserting the #47-removed copy (the Vercel build gate doesn't run Jest, so it was red on `main`).

**PR #51 — polished two-screen participant intro.** Addresses the user's "the invitation card looks bare, then you get the nice welcome — confusing" feedback. Direction chosen by the user (two screens, both polished + distinct); designed via brainstorm → a `/frontend-design` mockup the user approved ("immaculate"). New shared `<AssessmentWelcome>` blocks de-bare the landing in BOTH the public quiz and invited org-survey: branded app-shell header + a "what to expect" value-prop list + **data-derived** stat chips (questions/sections/scale) + strong CTA; public keeps lead-magnet copy, invited keeps team framing. The `SectionPager` section intro is now visually **distinct**: per-domain **accent rail** (`domainColor`, neutral fallback) + number badge + a "What this section covers" callout (from `section.description`) + segmented progress. All new CSS scoped under `.su-assessment-brand` (ADR-0005, zero global-token change, zero leak to the blue admin/coach UI). Built via a **Workflow** (one implementer + a 3-lens adversarial review: **HIGH FIDELITY / FULLY SCOPED / a11y PASS**); review fixes applied (render the quiz route client full-bleed — it was constrained to `max-w-2xl`, making the new full-bleed welcome shell look inset vs the org-survey flow; darken the section number badge for legible contrast on light domains; drop a dead var) and **visually verified on the Vercel preview** (both welcome + section intro match the mockup). 41 tests / 5 suites green.

---

### 2026-06-09 — Scaling Up Quick Assessment (public 4-Decisions lead-magnet) <!-- ENTRY_ISO:2026-06-09 ENTRY_SLUG:scaling-up-quick-assessment -->

**PR #45** (`feat/scaling-up-quick-assessment`, squash `95e06ab`). Closes Jeff's "scaling up quick assessment" Slack ask (= the free public "website scaling up assessment"). A public, free **4-Decisions self-assessment** that doubles as a coach lead-magnet: the taker sees their own results immediately; a guarded notification routes the lead to the referring coach (only if a known active coach) + the Scaling Up team. Built TDD/SDD across 9 tasks; **140 tests across 8 suites**; `CI=true npx next build --turbopack` clean. Spec `docs/specs/v7.6/15-scaling-up-quick-assessment.md` + plan `15a` + [ADR-0008](docs/adr/0008-public-self-assessments-show-taker-results.md).

**Decisions / design:**
- **ADR-0008 — public self-assessments show the taker their own results.** The submit POST returns the full `ScoreResult`; the public client renders it in-place via `BrandedReport` (ScaleUp headline + per-Decision breakdown) with `Cache-Control: no-store`. No persistent per-respondent results endpoint for public takers (INVITED flows unchanged). A pre-submit **consent line** discloses that results are shown to the taker and shared with the SU team + referring coach (if any).
- **Path C (no schema relaxation).** `AssessmentCampaign.organizationId` is NOT NULL with a required FK, and `Organization.ownerCoachId` is NOT NULL — so a PUBLIC campaign still attaches to a **real admin-supplied Organization**; the PUBLIC-specific bits are `accessMode:"PUBLIC"` + `createdByCoachId:null`. This avoids relaxing a NOT-NULL column on a core table (the riskier alternative that would have rippled ~12 type-sensitive sites).

**Deliverables (9 tasks):**
- **Seed (DRAFT, no publish)** — `src/prisma/seed-scaling-up-quick-assessment.ts`: alias `scaling-up-quick`, 4 sections (domain people/strategy/execution/cash), 32 SLIDER_LIKERT (`scale {min:0,max:10}`), `scoringConfig` with `tierMetric:"overallAvg"`, `rollup.overall:"meanOfDomains"`, `scaleUpScore:true`, domains + 3 overall tiers (Foundational / Developing / Mastering). Uses the shared `ensureTemplateVersionContent` (content-hash idempotent, fail-closed, never publishes) inside a `$transaction` + `resolveSystemUser`. Content captured from Scaling Up's own public quiz + `From Jeff/.../Website-scalingup-assessment.xlsx` (Execution Q17–24 flagged `// VERIFY wording before publish`).
- **Additive migration** `20260609170000_add_quick_assessment_outbox_idempotency` — `AssessmentEmailOutbox` model (`@@unique([submissionId, recipientRole])`, status/attempts/nextAttemptAt) + `AssessmentSubmission.idempotencyKey String?` with a **partial unique index** `WHERE "idempotencyKey" IS NOT NULL` (raw SQL, mirroring the `externalId` pattern — so it is queried with `findFirst`, not `findUnique`). Hand-written, **ADDITIVE ONLY** (ADD COLUMN / CREATE TABLE / CREATE INDEX / ADD FK CASCADE); passes `check-migration-safety.mjs`. Deployed to prod via `prisma migrate deploy` on the Vercel build at merge.
- **Pure lead helpers** `src/src/lib/assessments/quick-assessment-lead.ts` — `lowestDecision` (canonical People→Strategy→Execution→Cash order, earliest-wins tie-break), `buildLeadEmail` (HTML-escaped body via `escapeHtml`, subject control-chars stripped), `resolveLeadRecipients` (SU team always when configured; coach only if non-null), `findActiveCoachByEmail` (**open-relay guard**: returns a coach only if `certificationStatus === ACTIVE` + not expired; blank email → no DB call).
- **Durable Inngest worker** `src/src/inngest/functions/quick-assessment-lead-email.ts` — `drainLeadOutbox` (injectable, tested) sends PENDING rows via `sendEmailViaSMTP` with exponential backoff + FAILED-after-maxAttempts; SENT rows never re-sent. Event trigger (`assessment/quick-lead.enqueued`) gives the immediate attempt; **`quickAssessmentLeadEmailCron` (every 3 min)** re-drains due PENDING rows so the backoff/retry bookkeeping actually runs (the event-only wiring was dead-code retry — caught in review). Registered + typed in `app/api/inngest/route.ts` + `inngest/types.ts`.
- **Submit route** `app/api/quiz/[campaignAlias]/submit/route.ts` — returns `data.scoreResult` with `Cache-Control: no-store`; accepts a client `idempotencyKey` (P2002 → return the existing submission via campaign-scoped `findFirst`, no re-enqueue/audit/send); writes a `CREATE` `AuditLog`; resolves the coach + builds escaped lead emails + creates `SU_TEAM` (always when an env recipient is set) and `REFERRING_COACH` (only via the guard) outbox rows **in the same `db.$transaction`** as the submission; then fires the Inngest event inside a try/catch (a send failure can't 500 the taker — the cron drains the outbox regardless).
- **Public client** `src/src/components/assessments/public-quiz-client.tsx` — new `"results"` step renders `BrandedReport` in-place from the response (no `router.push`); consent line; stable `crypto.randomUUID()` idempotencyKey per attempt.
- **Audited admin PUBLIC-campaign flow** — `app/api/admin/public-campaigns/route.ts` (create: admin/STAFF-gated → 403 for coaches; validates body; `resolvePublishedTemplateVersion` → 422 if unpublished; alias gen + P2002 fallback; `status:DRAFT accessMode:PUBLIC createdByCoachId:null`; audited) + `[id]/publish/route.ts` (DRAFT→ACTIVE; 400 NOT_PUBLIC / 409 ALREADY_ACTIVE; audited) + a minimal admin page (`(dashboard)/admin/assessments/public-campaigns/`).

**Review:** Greptile's **trial 50-review cap** blocked its automated pass, so the superpowers code-reviewer ran the adversarial pass instead — verified the public attack surface (open-relay guard, HTML-escape + header-injection stripping, no-store, rate-limit, admin gating, transactional outbox, idempotency) and the additive migration; caught + fixed 2 Important reliability findings (dead-code outbox retry → cron drain; unguarded post-commit `inngest.send`) + campaign-scoped the idempotency dedup.

**Phased rollout:** Phase 1 (this PR) ships the capability and **deploys the additive migration to prod**, but **nothing is live to users** — the template is **DRAFT** and **no PUBLIC campaign exists**. Launch is a separate confirmed step: seed → admin publishes the template → admin creates + publishes a PUBLIC campaign → smoke-test the live public quiz + lead emails → promote. **Five Dysfunctions** (Spec 14, the "totals by category"/exact-toolset ask) remains parked pending Scaling Up's licensed toolkit export.

---

### 2026-06-05 — Assessment brand polish + branded results report (Phase 1) <!-- ENTRY_ISO:2026-06-05 ENTRY_SLUG:assessment-brand-results-report -->

**PR #41** (`feat/assessment-brand-results-report`). Closes Jeff's 2026-06-05 Slack asks: (1) polish the look & feel of the assessments; (2) "when I look at completed assessments I see raw data — I want the PDF that gets sent to them." Investigation found the platform generated **no PDF** and sent respondents **nothing** on completion (the `resultsEmail*` template fields are dead wiring), and coaches reviewed a raw `stableKey → value` view (`AssessmentResultView`) in the blue app theme.

**Deliverables:**
- **Branded Results report ("the PDF")** — `BrandedReport` (`src/src/components/assessments/BrandedReport.tsx`) + pure `report-presentation.ts` helpers (`isNeutralTier`, `domainColor`, `headlineForTierMetric`). Esperto-anatomy: cover (Four-Decisions stripe + white logo + instrument title + respondent/company/date) → overall (tierMetric-driven headline) → per-section cards → scores table (your score + per-item average; **no team-average**) → recommendations (when present) → **Additional responses** (non-slider TEXT/NUMBER/MULTI_CHOICE answers, so retiring the raw view hides nothing) → conclusion + coach-as-text CTA → footer with provenance. **Adapts per template**: Rockefeller (checklist green-checks + Low/OK/Great band), QSP v1/v2 + LVA (neutral "Submitted", ratings only, no checks/chip), Scaling Up Full (domain-colored cards incl. You→purple + ScaleUp ring + recommendations — auto-renders when published). Degrades on missing/duplicate `stableKey` (first-wins) + malformed `result`.
- **Data** — `getRespondentReport(db, actor, campaignId, respondentId)` (`src/src/lib/assessments/respondent-report.ts`): one `$transaction` doing `canManageCampaign("read")` + the enriched `findFirst` (sections, questions incl. type/sectionStableKey/scale, raw answers, company + instrument names, provenance). Reads the frozen `ScoreResult` — never re-scores. **Zero schema migrations.**
- **Report route** — `(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx` in its OWN route group (sibling to `(portal)`, no sidebar/chrome — H1). `getApiActor()` + `canManageCampaign` (ADMIN/STAFF allowed — Jeff is an admin; never `requireCoach`); `forbidden`/`not-found` → `notFound()` (enumeration-safe). Audit `VIEW_REPORT` (free-string action → no migration), ops log markers, `force-dynamic`; middleware adds `Cache-Control: no-store` for the report path (PII). Print: `su-report.css` `@media print` (cover own page, `break-inside:avoid`, A4, fixed footer + provenance) + `PrintReportButton`.
- **CampaignDetail** — primary "View report" action as a plain `<a target=_blank rel=noopener>` (NOT a Next `<Link>` — no prefetch of every respondent's PII report, H6); the raw inline view is **de-emphasized but kept** and the `/result` API is **deprecated + hit-logged** (Phase 1; removed in Phase 2).
- **Quiz polish** — `AssessmentShellHeader` (white logo + Four-Decisions segmented progress + "Section N of M" + optional company) integrated **into** `SectionPager` (single state source); polished section title/intro slides (keeps `section.description`, ADR-0004); restyled Likert slider (**kept** `<input type=range>` per D4 — buttons were reverted in PR #33); fixed public-flow copy that falsely promised emailed results (D3 — no auto-email).

**Process:** brainstorm + `/frontend-design` mockups (approved) → `/grill-with-docs` (8 resolutions G1–G8) → **claudex** adversarial loop (3 rounds: correctness/security/ops → 17 hardening decisions **H1–H17**) → **Greptile** (1 P1 — section chip showed `N/N` on neutral templates, fixed; 1 P2 — cover-title ambiguity, fixed). Built via subagent-driven dev, TDD per task; full Turbopack build clean; 166+ tests across the touched suites green. ADR-0007 records the canonical-report decision. **Phased rollout (H13):** this PR is Phase 1 (additive, raw view/API retained); Phase 2 removes them after telemetry. Brand scoped per ADR-0005.

### 2026-06-05 — Esperto historical-data import (admin-only, staging-first, gated) <!-- ENTRY_ISO:2026-06-05 ENTRY_SLUG:esperto-historical-import -->

**Esperto historical-data import shipped** (branch `feat/esperto-import-design` merged via PR #39, squash commit `d11d473`). End-to-end import of a company's pre-existing Esperto ("Scaling Up Toolkit") assessment data so coaches see past results alongside new ones — the now-unblocked "Ask 2" from the June 2 Jeff call, re-opened by Jeff's June 4 identity-bearing exports (a Members roster, a per-respondent QSP v2 report, and the restricted Scaling Up Full CEO/aggregate pair) which flipped the earlier "anonymous-only" feasibility verdict.

**Design first (4 adversarial passes).** `/superpowers:brainstorm` → grilled (`grill-with-docs`, 9 decisions) → spec `docs/specs/v7.6/12-esperto-historical-import.md` + implementation plan `docs/specs/v7.6/12a-...md` + `docs/adr/0006-imported-campaigns-are-closed-campaigns.md` + CONTEXT.md "Historical import" terms (memo 11 flipped to RESOLVED). Hardened through a spec-level Codex pass (7 findings) + the claudex plan loop's senior-engineer / security-data-integrity / ops-SRE rounds + Greptile on the PR (6 findings) + a final Codex review of the implementation (2 findings: NUL-byte delimiters that made two source files binary; a silent-omit-on-malformed-value path). Every finding applied; 0 rejected.

**Implementation — 9 TDD slices** under `src/src/lib/assessments/esperto-import/` (+ admin route/UI). (1) Additive migration `AssessmentCampaign.externalId String? @unique` + partial-unique index (mirrors `Organization.externalId`); stored namespaced `esperto:<campaignid>`. (2) `scoreSubmission` gains a default-off `allowMissingRequired` option (live callers unchanged; Rockefeller BC snapshot green) so incomplete historical rows score partially instead of being rejected. (3) No-email guard on **every** send route (invite/reminders/resend) refusing `status==="CLOSED" || externalId != null`. (4) Pure `parse.ts`/`classify.ts`/`types.ts` + 4 **PII-free** sanitized fixtures. (5) Crosswalk module + registry + exhaustiveness guard (unknown answer key → hard error) + pinned-version type/scale validation (ADR-0001) + the QSP v2 22-key map (`locked:false` with a step-5b screenshot-confirmation checklist). (6) Roster import: pure `roster-plan.ts` + `commit.ts` (advisory-locked `pg_advisory_xact_lock(hashtext,hashtext)` org create, insert/null-backfill only, in-tx `auditLog`) + ADMIN-only `POST /api/admin/assessments/import` (preview/commit, rate-limit, 5MB/2000-row bounds). (7) Results import: pure `results-plan.ts` (group by campaignid, resolve respondents by `externalId`=memberid, slider `0`/blank→omit, zero-scorable→skip, present-but-wrong-type→block) + `results-commit.ts` (reconstructs a CLOSED back-dated campaign + Participant + `SUBMITTED` invitation + scored submission; upsert idempotent by `externalId`/`@@unique`/`invitationId`; single-CEO guard; never deletes) + route preflight (422 unpublished/type-drift, 409 roster-missing/multi-org). (8) Admin UI `/admin/assessments/import` (upload → preview → commit gating, owning-coach picker, brand-neutral). (9) **S1 restricted-client guard test** — a tx that throws on any `delete`/`deleteMany`/`updateMany`/non-allowlisted raw SQL, proving both commit layers are insert/upsert-only — plus an e2e roster→results idempotency test + a structural no-email test.

**Safety posture (the no-data-loss bar):** the importer is additive + non-overwriting (enforced by the S1 guard, not just a grep); imported invitations are born `SUBMITTED` and no import path calls an email sender; the single migration is additive-only (passes `check-migration-safety`); a 223-row prod snapshot was taken before merge (on top of Neon PITR). 113 esperto-import tests green; `CI=true npx next build --turbopack` clean; **zero new full-suite failures** (the 5 failures are pre-existing/flaky, untouched). Built subagent-driven + TDD, branch-only with zero prod-DB writes during development.

**GATED — deliberately NOT live (operator/human steps remain):** QSP results import stays `locked:false` until the crosswalk's 8 ambiguous orderings (Q3 slider matrix, START/STOP/CONTINUE, Q14/Q15) are screenshot-confirmed against the seed (a human PR-review gate) — until then only **roster import** functions, no historical answers attach. Rockefeller/LVA ship as `locked:false` crosswalk stubs (need Jeff's sample exports). **Scaling Up Full parked** (unpublished version + only 4/10 question-families mappable + privacy-by-data: only the CEO's individual answers are exportable). Also tracked separately: a **`git filter-repo` scrub of the pre-existing committed PII under `From Jeff/`** (GitHub issue #40) — the broadened `.gitignore` only stops future additions. Per ADR-0006, imported campaigns are first-class CLOSED campaigns with synthetic inert invitations (random `tokenHash`, never emailed). Notion: PR #39 task on the AI Solutions Team Tasks board.

**Follow-up (2026-06-05) — QSP v2 crosswalk flipped `locked:true`; results import ENABLED for QSP.** The 8 ambiguous orderings were screenshot-confirmed against the embedded survey screenshots in `qtr session prep v2.xlsx` (image12 = the 5-slider matrix in exact order, no 6th slider → confirms `Q3_1..Q3_4,Q3_6` with `Q3_5` as the dropped slot; image15/16/17 = START/STOP/CONTINUE → `Q6/Q7/Q8`, doubly corroborated by the export's start-/stop-/continue-like sample values; image20 = PART 4 showing Critical-Number first then Top-Priorities → `Q14/Q15`). The `qsp-v2.ts` 5b lock checklist now records each binding CONFIRMED with its image ref. QSP results import is no longer gated (Rockefeller/LVA stay `locked:false` stubs; SU Full parked). 135/135 import + route tests green; build clean. Shipped straight to main (no new SoT anchor — same `esperto-historical-import` feature, same day).

**Follow-up (2026-06-05) — historical import flipped to COACH-operated (Jeff's call).** Jeff confirmed the import should run from the coach perspective (not admin), with the roster landing in the coach's Members & Teams lane. Added a **coach-scoped** route `POST /api/assessments/import`: `ownerCoachId` is ALWAYS the authenticated coach (never from the body), and results org-resolution is filtered by `organization.ownerCoachId = actor.coachId` — so a coach is **structurally blocked from importing into another coach's company** (cross-coach isolation test). `EspertoImportClient` gained a `variant="coach"` mode (no owning-coach picker, no `/api/coaches` fetch, posts to the coach route); a new `/portal/members/import` coach page (requireCoach-guarded); and an **"Import from Esperto"** entry in the Members & Teams lane. The original ADMIN tool + route are retained unchanged (admins are a superset). 151+ import/route + 25 UI tests green; build clean. Shipped to main (same feature/anchor).

### 2026-06-04 — Assessment section intro-slide copy (Rockefeller + LVA) <!-- ENTRY_ISO:2026-06-04 ENTRY_SLUG:assessment-intro-copy -->

**PR #36** (squash `b1e9ba0`). Authored real intro-slide body copy for the two assessments that were section-name-only. Added a `description` to all **10 Rockefeller** sections (S1–S10, framing each Rockefeller Habit) and all **8 LVA** sections (S0_welcome…S7_completion) in `src/prisma/seed-rockefeller-assessment.ts` + `src/prisma/seed-lva-assessment.ts` — so the one-section participant pager (from PR #32) renders a written intro before each section's questions instead of a bare heading. (QSP v1/v2 and SU Full already carried section descriptions.) `SectionSchema` already declared `description` optional, so no schema/scoring change; the Rockefeller `scoring-bc-snapshot` test was verified UNCHANGED (it hashes `scoreSubmission` output, which is independent of section text — no re-lock needed). TDD: per-section description tests for both seeds; 89 targeted + 372 broader seed/scoring tests green; `CI=true npx next build --turbopack` clean. **Seed-only — no prod data touched.** The copy reaches respondents only after the guarded `safe-seed.mjs` creates new DRAFT versions in prod AND an admin publishes them (existing campaigns keep their pinned version, per the immutable-published-version model). Closes the deferred "real intro copy for Rockefeller/LVA" follow-up from the section-stepper work.

---

### 2026-06-04 — Registration + Thank-You pages branded to match the Solo Landing <!-- ENTRY_ISO:2026-06-04 ENTRY_SLUG:reg-thankyou-brand -->

Follow-on from the user (June 4): make the Registration and Thank-You workshop pages share the Solo Landing theme. Shipped to `main` as commit `7f397eb`.

**What changed.** The two public workshop pages are **React-rendered** (`customHtml` is enabled ONLY for SOLO_LANDING + DUO_LANDING — `CUSTOM_HTML_ELIGIBLE_TYPES`), and they were using the app's blue `--primary` token, so they looked off-brand next to the purple Solo Landing customHtml page. They are now restyled to the canonical Scaling Up brand:
- `src/src/components/templates/registration-page-template.tsx` — rebuilt as a **two-column** layout: left purple `#522583` hero (official white SU logo brandbar, workshop title, DAY/DATE/TIME/FORMAT meta row, a dark translucent coach card, the four-color Four Decisions signature stripe down the edge); right white form panel (Investment price, "Reserve your seat" + workshop title, the embedded `RegistrationForm`, secure-checkout footnote).
- `src/src/components/templates/thank-you-page-template.tsx` — rebuilt as a branded confirmation: a four-color Four Decisions top stripe → purple hero with the white SU logo + a Cash-green check + headline/subheadline → the dark **"The Details"** logistics card (format pill, orange rule, When/Where/Workshop rows, mirrors the landing's logistics card) → purple-accent additional-message callout → orange **Google Calendar** + outlined **Download .ics** actions → dark footer.
- `src/src/app/(public)/workshop/[slug]/registration-form.tsx` — added a `su-form` hook class (one line); inputs/labels/checkbox/submit are themed by the scoped CSS (orange submit CTA, purple focus rings).

**Theme delivery (scoped, no leak).** New stylesheet `src/src/styles/su-public-brand.css` — every rule nested under `.su-public-brand`; the palette + component CSS are ported from the canonical Solo Landing starter. The two components `import` the file and wrap their output in `.su-public-brand`, so it loads on BOTH the public workshop route and the admin template-editor preview WITHOUT touching the global stylesheet or `--primary`. This is the same scoping principle as the assessment `.su-assessment-brand` (ADR-0005); the blue admin/coach UI is provably untouched. Roboto is loaded via `@import` (matching the landing). Official white logo added as a real asset at `src/public/brand/su-logo-white.svg` (decoded from the landing's data-URI), served at `/brand/su-logo-white.svg`.

**Behavior preserved.** No data-binding or flow changes: h1 = headline/heroHeadline, coach name/title, DST-zoned event time via `formatTimeWithZone` (e.g. `09:00 - 17:00 EDT`), `Time TBA` fallback, Virtual Workshop/In-Person labels, formatted venue address, the Google Calendar **link** in live mode vs a **disabled button** in preview, the `.ics` link, `isPreview` banner + placeholder, the real `RegistrationForm` (free → redirect / paid → Stripe checkout), and the video iframe. 58 component tests across 6 suites green; `CI=true npx next build --turbopack` clean; zero migrations.

**Process.** `/frontend-design` skill → static HTML mockups built from the real landing CSS, **approved by the user** before any React was written. Then a 5-lens adversarial **Workflow** review (CSS scope-leak · behavior/data-binding · runtime-CSS-the-jsdom-tests-can't-catch · accessibility · security) + a **Codex** staff-engineer pass. All findings were nit/low/medium (no critical/high) and fixed: the phone field's visible border is on a wrapper `<div class="PhoneInput">` not the inner input, so it was themed at the wrapper; muted greys (`#8a8294`, `#7a7286`) darkened to clear WCAG-AA on white; `.su-cta`/`.su-btn-outline` hover guarded with `:not(:disabled)`; the Thank-You video `<iframe>` got a `title`; coach `<img alt>` falls back to "Workshop coach". A **live local-render screenshot** (real components + CSS + Tailwind, dev server) caught a real bug the jsdom tests + build could not: the logo asset had been written to the worktree-root `public/` instead of the app's `src/public/`, so it 404'd — moved to `src/public/brand/` and re-verified serving 200. The blue admin/coach UI and global tokens are untouched.

### 2026-06-04 — Assessment Likert slider: visible numbered scale + clear unanswered state <!-- ENTRY_ISO:2026-06-04 ENTRY_SLUG:assessment-slider-ticks -->

**PR #35** (squash `8b58038`; prod deploy `bytjwxy6i`). Refines the participant Likert **slider** after the user asked to research professional slider UX (we'd cycled several times on the control).

**Research finding** (survey-methodology literature): a pre-filled slider handle **biases responses** toward the start position, and respondents often leave it there — so a default becomes a fake answer indistinguishable from a real one; the recommended pattern is **no recorded value until the respondent moves the handle**, with the discrete scale shown. (Sliders also underperform radio/discrete buttons for rating scales — more missing data, slower, worse on mobile/low-literacy — but the user wants the slider, so it stays. The discrete-button control from PR #33 was actually the research-preferred option.) Sources: [MeasuringU](https://measuringu.com/uxlite-numeric-slider-desktop-mobile/), ["Where Should I Start?" slider-defaults study](https://www.researchgate.net/publication/323263106_Where_Should_I_Start_On_Default_Values_for_Slider_Questions_in_Web_Surveys), [Qualtrics slider docs](https://www.qualtrics.com/support/survey-platform/survey-module/editing-questions/question-types-guide/standard-content/slider/), [QuestionPro start-position bias](https://www.questionpro.com/blog/setting-the-start-position-of-sliding-scale/), [GESIS "Are sliders too slick?"](https://mda.gesis.org/index.php/mda/article/download/2015.013/42).

**Change** (`src/src/components/assessments/question-input.tsx` + `wireframes-scoped.css`): keep the native range slider with **no default** (commit-on-`onClick`/`onChange`/`onKeyUp` behavior from PR #34 unchanged — a single tap records any value incl. the minimum; an untouched slider stays `undefined` so the required gate still catches skips). Added: **numbered ticks `0..N`** rendered under the track (`.survey-slider-ticks`, `aria-hidden`), endpoint anchor words, the **selected tick highlighted** purple (`.is-current`), and a **status line** (`.survey-slider-status`) reading "Tap or drag the slider to rate." (italic, when unanswered) or "Your rating: N" (answered) — replacing the cryptic middle "—" (the `.survey-slider-value` span + the old `.survey-slider-hint` removed). All new CSS scoped under `.su-assessment-brand` (ADR-0005). Kept `0` (it is a scored value on the Rockefeller 0–3 scale, `passThreshold: 2` — dropping it would change Esperto's scale + scoring). Per-question control via the shared `QuestionInput` → applies to every assessment.

**Decisions confirmed with the user:** (1) no pre-filled default (vs default-at-min/middle) — chose the best-practice no-default + visible-scale; (2) keep `0`. **Verification:** TDD test for ticks-render + status text (unanswered vs "Your rating: N"); the PR #34 click-commits-min bug-lock + role="slider" tests unchanged; 28 control/pager + 40 regression tests green; `CI=true npx next build --turbopack` clean. Zero migrations.

---

### 2026-06-04 — Assessment Likert slider restored + default/min value selectable <!-- ENTRY_ISO:2026-06-04 ENTRY_SLUG:assessment-slider-restore -->

**PR #34** (squash `34cf5af`; prod deploy `54dcyj1gb`). Course-correction on PR #33 after the user clarified the intent: keep the **slider**, just fix its bug — PR #33 had replaced it with discrete buttons, which was not wanted.

**Reverted** the SLIDER_LIKERT control (`src/src/components/assessments/question-input.tsx`) from the radiogroup back to a native `<input type="range">`, branded purple (`accent-color: hsl(var(--primary))`). **Bug fixed:** the range only fired `onChange` on a value *change*, so when a respondent's answer was the minimum/leftmost, leaving the thumb at its default (value display "—") recorded nothing and the per-section required gate blocked submission — forcing a drag-away-and-back. The fix wires a single `commit(e) => onChange(stableKey, Number(e.currentTarget.value))` to `onChange` (drag, live), `onClick` (click/tap — fires even when the value is unchanged, so clicking at the minimum reads the DOM value = min and records it; reads `currentTarget`, not React state, so no stale-value race), and `onKeyUp` gated to slider-moving keys only (`ArrowLeft/Right/Up/Down`, `Home/End`, `PageUp/Down`). Critically, an **untouched** slider (no click, no drag, no move-key) never fires any commit, so a skipped question stays `undefined` and the required gate still catches it — no silent auto-answer, no bad data. `Tab`/hover/scroll/wheel commit nothing. When unanswered: value shows "—", a "Tap or drag the slider to rate." hint renders, `aria-valuenow` is omitted and `aria-valuetext="Not yet answered"` is exposed. Because this is the shared `QuestionInput` used by the shared `<SectionPager>`, the fix applies to every assessment.

**Kept** (unchanged from PR #32/#33): the one-section pager, per-section question cards, scoped `.su-assessment-brand` purple + Roboto, branded intro eyebrow. **Removed** the now-unused `.survey-scale*` discrete-control CSS; restored `.survey-slider*` (purple).

**Verification:** TDD bug-lock test (`fireEvent.click` on a default-min slider → `onChange(key, 0)`) + drag test; pager/control suites migrated radiogroup→slider; 27 control/pager + 40 regression tests green; `CI=true npx next build --turbopack` clean. Spec-compliance + code-quality reviewed — the code-quality pass **empirically verified the gesture in real Chrome 145 (Playwright)**: click-at-min commits min for both `min=0` and `min=1`; the click+change double-commit on click-to-move is idempotent/last-write-correct; and Tab/hover/scroll/wheel never auto-answer. **Follow-up (noted, not blocking):** add a Playwright E2E so the click-at-min gesture has permanent CI coverage (jsdom can't reproduce native range pointer semantics). Zero migrations.

---

### 2026-06-04 — Assessment Likert control fix + survey brand polish <!-- ENTRY_ISO:2026-06-04 ENTRY_SLUG:assessment-likert-control-fix -->

**PR #33** (squash `584aeb9`; prod deploy `cvh3sdc30`). Follow-up to the section-stepper (PR #32) after live testing surfaced a blocker + visual roughness.

**Blocker fixed:** the participant SLIDER_LIKERT control (`src/src/components/assessments/question-input.tsx`) was a native `<input type="range">` whose thumb defaults to `scale.min` and records an answer only on a *change* event — so the minimum value (`0` = "Not true") was **unselectable** (already at 0 → dragging to 0 is no change → never recorded), leaving the answer `undefined` and the per-section required gate permanently blocking submission. Reported on Rockefeller, reproduced on QSP v1. Replaced the range with a **discrete radiogroup**: `role="radiogroup"` named by the question label, one native `role="radio"` per scale value `min..max step` (named `q-<stableKey>` → free arrow-key roving focus + single tab stop), each firing `onChange(stableKey, v)` on selection, selected value `checked`, endpoints' `aria-label` carrying the anchor text. Clicking `0` now records it; `isAnswered(0)` is true; the gate passes. Because this is the shared control used by the shared `<SectionPager>`, the fix **cascades to every assessment** (Rockefeller, QSP v1/v2, LVA, SU Full) — no per-assessment UI. TEXT/NUMBER/MULTI_CHOICE branches unchanged.

**Brand polish:** purple `#522583` selected state on the control; per-section **question cards** (white, bordered, spaced — replacing the flat stack); branded the assessment **intro card** by adding `.su-assessment-brand` to both participant layout wrappers (`(public)/quiz/layout.tsx` + `(public)/org-survey/layout.tsx`) so the whole page (intro + pager) inherits purple `--primary` — the intro `.hero-eyebrow` already used the `--primary` token, so it turned purple with no client edit. All new CSS scoped under `.su-assessment-brand` (ADR-0005 — verified no leak into admin/coach). The control uses `flex-wrap` (≥44px targets) so wide 1–10 scales (QSP v2) wrap cleanly on mobile instead of cramping. Removed the now-dead `.survey-slider*` CSS.

**Process:** TDD — a bug-lock test (click value `0` → `onChange(key, 0)`) + a SectionPager gate test (select the minimum → Next/Submit advances), plus the pager/control suites migrated from `slider`→`radiogroup` interactions (same scenarios). 66 assessment tests across the control + pager + util + integration suites green; `CI=true npx next build --turbopack` clean. Built via the frontend-design skill with a controlled brand-scoped spec; spec-compliance + code-quality reviewed (no Critical/Important; a few Minors applied — mobile wrap, dead-CSS removal, lint-clean of touched tests). Zero migrations. **Still deferred:** real intro-slide copy for Rockefeller/LVA (name-only sections — pending Jeff's source wording); the Ask-2 Esperto-import memo stays gated.

---

### 2026-06-04 — Batch A — workshop & landing polish (timezone everywhere · pre-approval gating · status wrap · Solo Landing logo) <!-- ENTRY_ISO:2026-06-04 ENTRY_SLUG:batch-a-workshop-landing-polish -->

Four items from Jeff Verdun's June 2, 2026 call. App code merged to `main` as squash commit `af63fc2` ("feat(workshops): Batch A — timezone everywhere, pre-approval gating, status/workflow wrap, Solo Landing logo"); the two prod-data operations (#18 template PATCH, #20 snapshot backfill) were run this session against the prod Neon DB. Assessment title-slides (Feature B) and the Esperto JSON import spike (Spike C) from the same call were handled by a separate assessment-focused instance and are NOT part of this work.

**Item 1 — Hide coach-portal landing CTAs until a workshop is approved.** A workshop is "approved" when its status ∈ `APPROVED_WORKSHOP_STATUSES = ["PRE_EVENT","POST_EVENT","COMPLETED"]` (non-approved = `REQUESTED`/`AWAITING_APPROVAL`/`INFO_REQUESTED`/`DENIED`/`CANCELED`); `isApprovedWorkshopStatus()` added to `src/src/lib/registration-service.ts`.
- Coach My Workshops list (`components/workshops/workshop-list-filters.tsx`): a non-admin coach sees the `CopyUrlButton` only when the workshop is approved AND has a landing URL; otherwise the muted text **"Available after approval"**. Admin rows unchanged.
- Coach workshop detail (`(portal)/portal/workshops/[id]/page.tsx`): the landing-page block is clean-hidden until approved.
- Admin workshop detail (`(dashboard)/workshops/[id]/page.tsx`): the "Open" landing link is gated on approved status (previously linked to a live, registerable page for a pending workshop).

**Pre-approval registration BLOCK (item-1 admin-side gap).** Hiding the link wasn't enough — the public page was still directly reachable + registerable. Now:
- `(public)/workshop/[slug]/page.tsx` returns a `WorkshopNotOpenView` early (in BOTH the landingPage and fallback branches) for non-approved workshops: **"Registration isn't open yet — This workshop hasn't been approved for registration yet"** (CANCELED → "no longer available"). HTTP 200, no registration form.
- `POST /api/workshops/[id]/register` returns **403** "Registration is not open for this workshop" before any capacity/Stripe work, for non-approved status.

**Item 2 — Word-wrap the truncated status.** The real target was the **Workflow Status card** step descriptions on the admin workshop detail (`(dashboard)/workshops/[id]/page.tsx`): `truncate` → `block whitespace-normal break-words` with `items-start`. The admin Workshops table Status badge was also wrapped (`inline-block whitespace-normal break-words max-w-[8rem]`) and kept.

**Item 3 — DST-aware timezone abbreviation next to every event time.** New shared helper `formatTimeWithZone(eventTime, eventDate, timezone)` + `formatZoneAbbrev()` in `src/src/lib/utils.ts`: parser-independent, computes the zone at **noon UTC on the event's UTC calendar date** (avoids an off-by-one-day DST flip), formats via `Intl.DateTimeFormat({ timeZone, timeZoneName: "short" })`, **never throws** (falls back to the raw time on a bad zone), and appends **no** zone when the time is empty/TBD. Wired into:
- Every React event-time display (admin + coach lists/detail, wizard Step 3 review).
- Workflow emails: `workshopTime` is now zoned in `inngest/functions/execute-workflow.ts` + `trigger-workflow-step.ts`; `WorkflowContext.workshopTimezone` + new `{{timezone}}`/`{{workshop_timezone}}` tokens in `lib/workflows/workflow-service.ts`; the date-change email body in `services/notifications.ts` is zoned.
- Landing interpolation: `buildWorkshopVariables` (`lib/templates/template-interpolation.ts`) now selects `timezone` and emits a **zoned `event_time`** key (plus `workshop_time`/`eventTime`/`workshop_timezone`). This fixed a pre-existing dead `{{event_time}}` token — referenced by the Solo Landing starter but never emitted, so the landing "TIME" row had rendered blank. Admin token-help (`components/templates/template-content-editor.tsx`) updated with `{{workshop_timezone}}`.

**Item 4 — Solo Landing header logo.** The old CSS-recreated quadrant submark + text wordmark (`SCALING UP`) + tagline replaced with the **official white, no-tagline Scaling Up logo** as an inline `<img class="su-logo" src="data:image/svg+xml;base64,…" alt="Scaling Up">`. Inlined as a data-URI so it is self-contained, sanitizer-safe (passes `sanitizeCustomHtml` with no strips), and host-independent (survives the planned `platform.scalingup.com` domain change). Updated in the repo starter `From Jeff/style-guide/starter-templates/solo-landing.html` (branch commit `9941fd3`) and in prod (below).

**Prod data rollout (this session).**
- **#18 — PageTemplate PATCH.** Guarded one-off `src/scripts/patch-solo-landing-logo-template.ts`: sanitizes the new starter with the SAME default `sanitizeCustomHtml` the admin PATCH route uses (`allowTokenUris = true`), and overwrites a `SOLO_LANDING` `PageTemplate.customHtml` ONLY if its current value hashes byte-for-byte to `sanitize(old-starter)` (proving it is the unmodified pasted starter, so the swap loses nothing); diverged rows are reported and left untouched. All 3 prod templates ("Standard Solo Landing Page" active `cmpapmyzw…`, "E&V Solo Landing Page" `cmpappacp…`, "TEST" `cmpvp664w…`) matched the old starter exactly (`sha 122a2ee8…`, 17885 b) → all 3 updated to the new logo (`sha abdf3d64…`, 24043 b). Old values backed up to `src/.snapshots/backup-solo-template-logo-abdf3d64.json`; CAS on `updatedAt`. Idempotent (re-run = 0 eligible).
- **#20 — LandingPage snapshot backfill.** The public render reads the per-build `LandingPage.customHtml` snapshot and `runAutoBuild` skips already-built pages, so existing Solo landings kept the old logo + a literal `{{event_time}}`. `src/scripts/backfill-solo-landing-customhtml.ts --apply --i-know-this-is-prod` re-interpolates the NOW-updated template for each target workshop (the exact auto-build pipeline: `buildWorkshopVariables` → enrichedVars/two-pass `registration_url` → `interpolateContentForHtml` → strict `sanitizeCustomHtml`), WITHOUT auto-build's side effects (no "Workshop Ready" email, no workflow reassignment, no status flip). 2 target rows (`cmpvsv49o…`, `cmpwnh5d9…`), both CHANGE: new `<img>` present, `{{event_time}}` resolved, old logo gone, 0 sanitizer strips, 0 CAS-aborts. Backup in `src/.snapshots/`. (First apply hit a transient Neon pooler connection drop before any read/write; succeeded on retry.)
- **Live prod verification.** `…/workshop/test-landing-page-template-solo-landing-mpvsv49a` (PRE_EVENT) renders the white SU `<img class="su-logo" alt="Scaling Up">`, no `su-mark-q`, no literal token, and **TIME = `09:00 - 17:00 EDT`** (June → EDT for America/New_York). A pending/non-approved test workshop shows "Registration isn't open yet" with no form.

**Process / quality.** claudex adversarial plan loop (Codex, multi-round — caught the noon-UTC DST fix and the dead `{{event_time}}` token) + greptile-style multi-lens review + subagent-driven TDD. New test suites: `format-time-with-zone`, `solo-landing-logo-sanitize`, `wizard-step3-zone`, `backfill-solo-landing-customhtml` (+ extended register / interpolation / inngest / thank-you tests). `CI=true npx next build --turbopack` clean. **Zero migrations; zero destructive ops.** Reversible: `backup-solo-template-logo-abdf3d64.json` (manual restore), backfill `--restore <snapshot>`, and Neon PITR. Concurrent assessment instance on its own branch left undisturbed throughout.

### 2026-06-04 — Assessment section-stepper + intro slides (one-section participant UX) <!-- ENTRY_ISO:2026-06-04 ENTRY_SLUG:assessment-section-stepper -->

**PR #32** (squash `3d72cef`; prod deploy `a4oqh407j`, live on `scaling-up-platform-v2.vercel.app`). Closes Jeff's June 2 ask: present each assessment **one section at a time** (Esperto-style) with a short **intro slide** before each section's questions, branded.

**Participant UX.** Both clients — public `/quiz/[campaignAlias]` (`public-quiz-client.tsx`) and invited `/org-survey/[campaignAlias]` (`org-survey-client.tsx`) — replace the old single long-scroll form with a shared one-section-per-screen pager:
- New pure util `src/src/lib/assessments/section-pages.ts` — `buildSectionPages(sections, questions)` groups questions under their section (sorted), keeps **question-less sections as first-class intro/closing slides**, and routes orphan questions (missing/blank/unresolved `sectionStableKey`, via a trim check — not `??`) into a trailing synthetic "Other" page. Plus `isAnswered(value)` (undefined/null/blank-string/empty-array → false; **numeric `0` → true**), the single predicate driving BOTH the progress bar and the required gate.
- New shared `src/src/components/assessments/section-pager.tsx` (`<SectionPager>`) — owns `sectionIndex` + `view ∈ {intro,questions}`; intro slide (heading = `section.name`, body = `section.description`, plain-text `white-space:pre-line`) shown when a section has a description or is empty; "Start" on an empty section advances to the next; per-section required gate on Next (Submit on the last); Back is free (out of section 1 → the assessment intro/info phase); `role="progressbar"` (answered ÷ total, derived from pages); focus moves to the section heading on navigation; required asterisk `aria-hidden` so the slider's accessible name equals the label. Questions render via the shared accessible `QuestionInput` (this also fixes the public client's previously inaccessible bare-button slider).
- **Scoped Scaling Up brand** (ADR-0005): a NEW `.su-assessment-brand` wrapper (in `wireframes-scoped.css`) overrides `--primary`/`--ring` to purple `#522583` + Roboto (`lib/assessments/assessment-fonts.ts`, applied via `.variable` in both `(public)/quiz/layout.tsx` and `(public)/org-survey/layout.tsx`) + Helvetica-Neue headings; Four-Decisions domain accents (People orange / Strategy blue / Execution brown / Cash green / You purple) as borders only. Deliberately NOT applied to the shared `.wf-scope` (which the admin editor + coach wizard also use) — confirmed no leak into admin/coach.
- **localStorage autosave** (`lib/assessments/use-answer-draft.ts`): hydrate on mount, debounced write, **cleared on successful submit**. Public key = `assessment-draft:pub:<alias>:<sessionStorage UUID>` (isolates anonymous takers on a shared device); invited key = `assessment-draft:inv:<respondentKey>` where `respondentKey` (the invitation id) is now surfaced by the `/org-survey/[alias]/me` route (per-respondent isolation). Stable-setter ref so an unstable caller setter can't trigger re-hydration.

**Publish invariant + serialization fix (engine/admin).**
- `scoring.ts` gains `checkSectionRefsResolve` in `TemplateVersionForPublishSchema` — **forward-only**: every question with a non-blank `sectionStableKey` must resolve to a defined section. Intentionally NO "section must have ≥1 question" check (the live QSP v1 `S1_welcome` and LVA `S0_welcome`/`S7_completion` are description-bearing/empty welcome+closing sections — that reverse rule would reject published content + redden CI). `assertSeedContentIntegrity` aligned to the same trim predicate. All 5 live seeds pass; the `all-assessments-integration` CI test stays green.
- **Bug fixed:** the admin template editor silently dropped section `description`/`partLabel`/`domain` on any version save (the payload emitted `{stableKey,name}` only, included whenever any tab was dirty) — which stripped Scaling Up Full's section `domain` and broke its `meanOfDomains` per-domain scoring at publish. Fixed by extracting `template-editor/sections-serialization.ts` (`hydrateSectionsFromJson` reads all fields; `buildSectionsPayload` returns raw rows byte-for-byte when sections aren't dirty, and spreads `{...raw}` first when dirty) + a `rawSectionsRef` in `TemplateEditorTabbed.tsx` — content-hash stays stable (key-order preserved) so reseed idempotency is restored; FK-pinning means no submission detachment.
- **Bug fixed:** the invited client bucketed orphan questions under `?? "__unassigned"` and never rendered that bucket (and `if (list.length===0) return null` hid empty sections), so a required orphan question was invisible yet counted required = a permanent submit dead-end. The shared `buildSectionPages` "Other" page renders + makes it satisfiable. Both clients also gained an empty-submission guard mirroring the routes' `answers.min(1)` / `EMPTY_ANSWERS` 400.

**Process.** Design grilled + adversarially reviewed (Codex staff-engineer + a 6-lens panel + Greptile on PR #32) before any code — caught the empty-section invariant + the never-existed autosave premise. Built via subagent-driven development: 8 TDD tasks, each with a spec-compliance then code-quality review (+ fix loops), then a final whole-branch review (which caught + fixed the dead Roboto import + the per-respondent invited key). 60+ assessment tests across 8 suites green; `CI=true npx next build --turbopack` clean; **zero migrations; zero destructive ops**. Specs `docs/specs/v7.6/10-section-stepper-intro-slides.md` + `10a-section-stepper-implementation-plan.md`; decisions ADR-0004 (section fields, not a `SECTION_INTRO` type) / ADR-0005 (assessment-UI-only brand scope); CONTEXT.md terms.

**Deferred / follow-ups:** (1) real intro-slide copy for **Rockefeller** + **LVA** sections (name-only today — they render minimal name+Start slides until source wording is provided; QSP + SU Full already render their real descriptions). (2) The **Ask-2 Esperto historical-import feasibility memo** (`docs/specs/v7.6/11-esperto-import-feasibility.md`) remains GATED — no build until Jeff sends sample JSON exports. (3) **Doc correction:** the repeatedly-cited "3 known pre-existing test failures" is actually **4** — `portal-assessments-status-filter` is a 4th pre-existing/unrelated failure (per the whole-branch review's 264-suite sweep). (4) Temporary preview-only `ASSESSMENT_SESSION_SECRET` (added to debug the invited flow on the Vercel preview, which lacks it) was removed after merge.

---

### 2026-06-02 — Scaling Up Full: full 5-stop per-question recommendations + prod seed/publish of the re-seed <!-- ENTRY_ISO:2026-06-02 ENTRY_SLUG:su-full-5stop-recommendations -->

**PR #31** (squash `b3ef507`). Follow-up to the content re-seed below.

**SU Full recommendations 3-band → 5-stop.** Upgraded Scaling Up Full's per-question recommendations from the placeholder 3-band (LOW/MID/HIGH) set to the full **5-stop** set (score-stops 0/3/5/7/10). Source: Esperto exposes NO scoring config via its admin UI/API — confirmed by logging into the live white-labeled tool (scalinguptoolkit.com) and directly probing `/api/v1/*` (campaigns/settings/reports/variantaccess all return layout/metadata only; structure + scoring are server-side / taker-token-gated). So the authoritative source is the rendered **uniform-fill sample reports** (all 0s/3s/5s/7s/10s) — each renders every question's recommendation at that fill. A fan-out workflow (one agent per PDF) extracted them; an adversarial verifier confirmed **all 61 questions render at all 5 stops with zero label drift** (index-joined). Seed (`seed-scaling-up-full-assessment.ts`): per-question `low/mid/high` → `s0/s3/s5/s7/s10`; recommendation builder emits 5 bands tiling [0,10] `[0-2][3-4][5-6][7-9][10-10]`; band-count guard 3→5; docblock updated; **61/61 joined by exact label**. `TemplateVersionForPublishSchema` passes; 460 tests green across 25 suites; zero migrations. ScaleUp overall band cutoffs remain **PROVISIONAL** (4.0/6.5 on the 0–10 rollup; uniform-fill scores tightened the observed bounds to LOW/GOOD ∈ (28,47], GOOD/TOP ∈ (62,107] on the 0–100 score) — the exact weighting/bonus formula is Esperto-internal and still needs their spec (09b §C).

**Prod seed + publish (operational, this session).** Ran the guarded seed (`safe-seed.mjs --i-know-this-is-prod`, after a 212-row prod snapshot) to write all 5 real-content versions to prod as DRAFTs; cleaned 3 stale pre-helper qsp-v1 duplicate drafts + one superseded SU Full draft (each verified campaign-unreferenced before delete). **Published the 4 confirmed assessments live** — Rockefeller, QSP v1, QSP v2, LVA now serve v2 (real content) to new campaigns (existing campaigns keep their pinned version). **Scaling Up Full held as DRAFT** (v2, now with 5-stop recs) pending Esperto's scoring confirmation per 09b §C. All appends/publishes mirror the admin publish path (strict publish-schema validation); reversible via snapshot + Neon PITR.

### 2026-06-02 — Assessment content re-seed (real Esperto content, staged DRAFT) <!-- ENTRY_ISO:2026-06-02 ENTRY_SLUG:assessment-content-reseed -->

**PR #30** (squash `5c5e027`, branch `feat/assessment-content-reseed`). Replaces the placeholder/approximated question banks in the 5 seeded assessment templates with the **real Esperto instrument content** (questions + scoring), sourced from Jeff's `From Jeff/APP_scaling up assessemnt/` export and adversarially verified. Each template's content is appended as a **new DRAFT version** — nothing publishes or reaches respondents until an admin reviews and clicks Publish.

**Origin / process.** Jeff confirmed on the May 28 call that the seeded questions were samples, not the real reports. Scoped via brainstorming + `/grill-with-docs` (produced `CONTEXT.md` domain glossary + ADR-0001/0002/0003) + a 3-round claudex adversarial plan review. Verified content was extracted by a fan-out workflow (one agent per assessment) with an adversarial verifier per assessment — which caught real errors (QSP v2's first extraction mis-numbered the xlsx images and hallucinated questions; LVA's financial questions are three-year *aspirational* figures, not current state). Design spec: `docs/specs/v7.6/09-assessment-content-reseed.md`; publish runbook: `docs/specs/v7.6/09b-publish-review-checklist.md`. Built subagent-driven (implementer → spec review → code-quality review per task).

**Engine prerequisites.**
- `src/src/lib/assessments/seed-template-version.ts` (NEW) — `ensureTemplateVersionContent()` appends DRAFT vN+1 only when the content hash differs (reuses `computeTemplateContentHash`); no-ops only on the *latest* matching version; **fails closed** on an edited unpublished draft (unless `forceSupersedeDraft`); **never** mutates published rows or the template's live invitation subject/body (hashes against stored invitation for existing templates); pre-flight `assertSeedContentIntegrity` (dup stableKeys / dup sortOrder / orphan section refs / dup MULTI_CHOICE option keys); writes an `ASSESSMENT_VERSION_SEEDED` audit row in the same tx.
- `src/src/lib/assessments/scoring.ts` — server-side answer validation for ALL 4 question types: required-presence extended beyond SLIDER (semantic-empty guards for TEXT/MULTI_CHOICE) + `validateAnswerValues` (TEXT length cap, finite NUMBER, MULTI_CHOICE valid-keys/dedupe/maxChoices, SLIDER range), wired inside `scoreSubmission` so the submit routes inherit it.

**Per-assessment content** (verbatim from source; each guarded by a committed label fixture + a `TemplateVersionForPublishSchema` parse test):
- **Rockefeller** — content already near-correct; emptied the invented slider anchors ("Not true"/"Completely true" → "" — source has none), dropped Q1_1's stray trailing period, fixed section-7 quotes; reused existing published stableKeys (ADR-0001); 3 verbatim scoring-band messages kept; `scoring-bc-snapshot` SHA re-locked (content change, not engine drift).
- **QSP v1** — 28 questions / 8 sections (1 NUMBER + 7 SLIDER + 20 TEXT); aggregation-only → single neutral tier (ADR-0002); core-values "role models" modeled as 3 TEXT boxes.
- **QSP v2** — Parts 1–5, 22 questions (1 NUMBER + 6 SLIDER + 15 TEXT), transcribed from a visual read of the correctly-numbered survey screens (image9–22); 5-item P1 matrix (no self-performance item), no department start/stop/continue, no Rockefeller-methodology block (the first extraction's hallucinations); neutral tier.
- **LVA** — 67 questions / 8 sections (10 NUMBER + 40 TEXT + 16 SLIDER + 1 MULTI_CHOICE); 9 financials framed "in three years"; 16-factor matrix as 1–3 sliders (Weak/Average/Strong); obstacle MULTI_CHOICE pick-3 + 16 optional "why is X a hindrance" TEXT (platform has no conditional logic); fabricated Developing/Building/Scaling tiers removed → neutral tier; Esperto group factor-bar report deferred (ADR-0003).
- **Scaling Up Full** — 61 SLIDER questions + per-question recommendations kept verbatim; scoring reworked to the engine's 0–10 rollup + `scaleUpScore` + neutral per-domain tiers + 3 overall ScaleUp bands with **provisional** cutoffs 4.0/6.5 (interpolated from confirmed evidence ≤28 LOW / 47–62 GOOD / ≥73 TOP, ÷10); placeholder per-domain Critical/At-Risk tiers removed. **Open items flagged for Jeff/Esperto (block SU Full publish):** exact ScaleUp weighting+bonus formula, full 5-stop {0,3,5,7,10} per-question text, non-scored profile inputs — see 09b §C.

**Platform constraint (ADR-0002):** `scoringConfig` is non-nullable and requires ≥1 tier, so the no-scoring instruments (QSP v1/v2, LVA-overall) use a single neutral catch-all tier rather than inventing bands; the public thank-you page surfaces no score today, so it's schema plumbing.

**Ops/verification.** `safe-seed.mjs` (refuses a prod-host `DATABASE_URL` without `--i-know-this-is-prod` + optional `ASSESSMENT_PROD_EXPECTED_HOST` match; refuses dev-mode against the prod host), `run-assessment-seeds.mjs` (ordered stop-on-error runner + JSON run-manifest), `verify-seeded-versions.mjs` (read-only post-seed verifier), and a consolidated integration test asserting all 5 `build*Content()` pass the publish schema + `scoreSubmission`. `npm run db:seed-assessments` / `verify:seeded-assessments` added.

**Review.** Greptile scored the PR **4/5 "safe to merge"**; its 4 P2 comments were all fixed (parseHost first-`@` → `lastIndexOf` in both the `.mjs` runtime and the `.ts` test copy + a regression test for a password containing `@`; narrowed the integration test's recommendations error filter so structural errors still surface; unified the seed-runner's dry-run/exec arg arrays) and threads resolved. (Greptile was newly installed on the `jcbdelo26` account mid-review; its comment-trigger re-review proved flaky, so the 5/5 re-stamp was skipped — all findings were addressed in code.)

**Safety.** Zero Prisma migrations (all content lives in existing `Json` columns); zero destructive ops; **merging changes no assessment data** — the Vercel build does not run the seed scripts, so the reseed is a separate, guarded, manual operator step that produces DRAFT versions behind the admin publish gate. 495 tests across 29 assessment/seed/script suites green; Turbopack build clean. (`migration-verification.test.ts` is DB-connectivity-dependent and flaky without a live DB.)

### 2026-06-01 — TEMPLATE-02 — Custom HTML override on landing-page templates <!-- ENTRY_ISO:2026-06-01 ENTRY_SLUG:template-02-custom-html -->

Branch `feat/template-02-custom-html` merged via PR #24, squash commit `f0a177b`. Closes Jeff's May 29 look-and-feel-control ask ("Lets start with option 1 if we cant finish #3 by wednesday. Ultimate goal is the #3 option pasting html code"). Ships **Option 3** (paste HTML) ahead of the Wednesday June 3 deadline.

**Scope.** Admins paste raw HTML into a new Custom HTML section on `/admin/templates/[id]/edit` for SOLO_LANDING + DUO_LANDING templates ONLY. Section hidden entirely for REGISTRATION / THANK_YOU / BIO_PAGE (locked decision Q13). Pasted HTML is DOMPurify-sanitized at save time, stored on `PageTemplate.customHtml`; auto-build copies + interpolates onto `LandingPage.customHtml` at workshop-approval; render path echoes the sanitized string via React's HTML-injection prop at `/workshop/[slug]`. Empty field → existing React templates render exactly as before.

**Architecture** (spec lives at `~/.claude/plans/previous-instance-crashed-with-glittery-cake.md`).

- **Schema** — additive `PageTemplate.customHtml String?` + `LandingPage.customHtml String?`; migration `20260601000000_add_custom_html_to_templates` is two nullable TEXT columns.
- **Sanitizer (`lib/templates/sanitize-custom-html.ts`)** — per-call DOMPurify instance via `createDOMPurify(new JSDOM().window)`. Config: `USE_PROFILES: { html: true }`, `ADD_TAGS: ['iframe']`, `ADD_ATTR: ['allow','allowfullscreen','frameborder','loading']`, **`FORBID_ATTR: ['srcdoc']`** (iframe srcdoc bypass), `FORCE_BODY: true` (preserves `<style>` blocks). **`FRAME_SRC_ALLOWLIST`** mirrors `vercel.json` CSP `frame-src` (Vimeo / YouTube / youtube-nocookie / Stripe); `afterSanitizeAttributes` hook strips `src` from non-allowlisted iframes. **Two-stage URI regex** via `SanitizeOptions { allowTokenUris?: boolean }`: save-time (lax) accepts `{{token}}` / `{{ token }}` literals so they survive sanitization; build-time post-interpolation re-sanitize (strict) catches `javascript:` substitutions. Pre-scan for parser-dropped tags (`script` / `noscript` / `noembed` / `noframes`) because DOMParser drops them before DOMPurify hooks fire. Uses `dompurify` directly (declared as explicit dep alongside `isomorphic-dompurify`) with a `getWindow()` helper — `isomorphic-dompurify`'s `html-encoding-sniffer` → `@exodus/bytes` chain is ESM-only and breaks Next/Jest transforms.
- **HTML-escape helper (`lib/templates/interpolate-content-html.ts`)** — `escapeHtml` + `interpolateContentForHtml` that escapes every variable BEFORE `.split(token).join(value)` substitution. Highest-leverage XSS fix: `{{coach_bio}}` may contain user-authored HTML which would otherwise become live tags inside an already-sanitized string. Regression test 8 locks `interpolateContentForHtml('{{bio}}', { bio: '<img src=x onerror=alert(1)>' })` → `'&lt;img...&gt;'` (literal, NOT live img).
- **PATCH `/api/page-templates/[id]`** (admin-gated). Adds `customHtml: z.string().max(500_000).nullable().optional()`. Pipeline: 500k size cap → eligibility 400 if not SOLO/DUO → placeholder-guard escape hatch when customHtml non-empty → empty/whitespace/null normalized to stored null → `sanitizeCustomHtml(input, { allowTokenUris: true })` → store sanitized output. Audit uses existing `'UPDATE'` action with enriched `changes: { customHtmlChanged, customHtmlLength, strippedTags, strippedAttrs }` (no new `AuditAction` enum churn). Response includes `customHtmlSanitized: boolean` for the editor's inline notice.
- **Auto-build (`lib/auto-build-service.ts`)** — restructured into true two-pass. Both `findMany` `select` blocks add `customHtml: true`. Skip filter amended so customHtml-only templates (empty content) survive. **Pass 1**: build REGISTRATION first (or look up existing slug if `existingPage` skip fires — fixes Codex r2 HIGH #2 where partial rebuilds collapsed `registration_url` to empty). **Pass 2**: build the rest with `enrichedVars = { ...variables, registration_url: ${APP_URL}/workshop/<regSlug>, registrationUrl }`. For eligible (SOLO/DUO) templates with non-null customHtml: `interpolateContentForHtml(tpl.customHtml, enrichedVars)` → `sanitizeCustomHtml(interpolated, { allowTokenUris: false })` → store. Empty-string fallback for `registration_url` when no REGISTRATION template exists. Step 4b post-patch KEPT (idempotent, sets the React-template JSON `registrationUrl` field; marked with TODO for Phase-2 cleanup).
- **PUT `/api/workshops/[id]/landing-pages/[template]`** (coach-accessible via `canManageCoachData`). Slice 5 added body-level customHtml acceptance; Codex r2 BLOCK #1 flagged it. Fix in commit `e14aa6d`: removed Zod field, body destructure, UPDATE-path write. CREATE-path template-copy preserved — `chosenTemplate.customHtml` flows through `interpolateContentForHtml` + strict re-sanitize + `ELIGIBLE_CUSTOM_HTML` filter (cloning a SOLO_LANDING template into a REGISTRATION slot drops it).
- **POST `/api/landing-pages/library` (clone)** — clones `sourcePage.customHtml` only when destination template type is eligible. No re-interpolation (clone copies the frozen build-time value). Cross-workshop clone leaves the source's `registration_url` baked in (Phase-2 follow-on).
- **Render path (`(public)/workshop/[slug]/page.tsx`)** — single insert before the existing `switch`. When `landingPage.customHtml?.trim()` non-empty: a `<div data-custom-html-render>` wraps the stored HTML via React's HTML-injection prop and short-circuits React template + customCode resolver. Eslint-disable-next-line matches the existing `custom-code-renderer.tsx` pattern (only other site in the codebase using the same prop). The render is a TRUSTED echo — DOMPurify ran at save AND post-interpolation; render-path does not re-sanitize. Codex r2 HIGH #3 (render-path defense-in-depth re-sanitize) tracked as Phase-2.
- **Editor UI (`components/templates/template-content-editor.tsx`)** — Custom HTML Card at TOP of editor body; hidden entirely for ineligible templateTypes (Greptile r1 M7). Status pill toggles ("Active · overrides fields below" vs "Empty — fields below render"). Helper Alert documents body-HTML-only contract + 18 supported tokens + "Live workshop fields update only via explicit {{token}}" warning (no `mergedContent` overlay on customHtml). Monospace 24-row textarea + right-side variable reference panel (md+). Save POSTs `{ content, customCode, customHtml }` with client-side whitespace→null normalization. Yellow inline notice when response is `customHtmlSanitized: true`; notice clears on next clean save. DUO_LANDING uses a dedicated Save button on the Card (FallbackJsonEditor doesn't know about customHtml); SOLO_LANDING piggybacks on the existing visual-form Save.

**Review history.**
1. **Codex Round 1** (Thread `019e831f-7bdf-7780-8f86-dab1ef01de37`, 13 findings, all absorbed pre-implementation). Highlights: `registration_url` URL was wrong (no `/workshop/[slug]/register` route exists); Prisma client regen step missing; PUT + library-clone need to mirror customCode-copy pattern; iframe allowlist must match CSP; URI regex broken; body-HTML-only contract must be explicit; templateType eligibility server-side.
2. **Greptile-style Round 1** (3 parallel reviewers via Workflow, 2/5 aggregate, 7 critical + 10 major). Highlights: two-pass auto-build empty-string fallback; `interpolateContentForHtml` stored-XSS fix; `FORBID_ATTR: ['srcdoc']`; auto-build `select` + skip filter amendments; PATCH placeholder-guard escape hatch; PUT + library eligibility filter; schema migration as Slice 0 prerequisite; tightened URI regex; empty-string normalization; per-call DOMPurify instance; editor must HIDE not disable.
3. **Codex Round 2** (consolidated diff after Slices 0-6): 2 BLOCK + 3 HIGH + 3 MEDIUM. **BLOCK #1** coach PUT body acceptance (removed). **BLOCK #2** tokenized URL stripping (two-stage URI regex). **HIGH #2** REGISTRATION slug lookup on partial rebuild. **MEDIUM #2** explicit `dompurify` dep. Remaining HIGH #3 (render-path defense-in-depth) + MEDIUM #1 (manual-create registration_url) + MEDIUM #3 (un-mocked integration test) tracked as Phase-2.

**TDD discipline.** Implementer subagents per slice; RED tests → minimum GREEN code → broader regression sweep. Pre-existing failures (3 — `no-inline-tolocaledatestring` / `org-survey-exchange` / `assessment-campaigns-detail-route`) stable across the branch's diff; no new failures introduced.

**Tests.** 163/163 GREEN across 13 affected suites: sanitize 27, interpolate 15, page-templates API 17, auto-build 27, landing-pages-put 16, landing-page-library 16, workshop-slug-custom-html 5, template-content-editor-custom-html 10, w-slug 4, + 3 sibling suites. `CI=true npx next build --turbopack` clean. Zero migrations beyond the additive `20260601000000_add_custom_html_to_templates`; zero destructive ops.

**Slice timeline** (6 commits over Mon Jun 1, ~6 working hours):
- Slices 0–3 → **commit `e14acf0`** (Push #1, Mon EOD checkpoint): schema + migration + sanitize/interpolate modules + PATCH route extension + 51 tests.
- Slices 5 + 5b → **commit `ec63d6a`** (Push #2): auto-build two-pass + PUT + library-clone customHtml copy + render-path insert + 20 tests.
- Slice 6 → **commit `49ffe64`** (Push #3 dev): editor UI textarea + status pill + variable panel + sanitized-notice + 10 RTL tests.
- Slice 7 → **commit `e14aa6d`**: Codex r2 fixes (BLOCK #1 + BLOCK #2 + HIGH #2 + MEDIUM #2) + 9 net new tests.
- PR #24 squash-merged to main as `f0a177b`.

**Phase 2 follow-ups** (documented, not blocking):
- customHtml on REGISTRATION / THANK_YOU / BIO_PAGE (THANK_YOU + customCode coexistence design; per-coach scope decision for BIO_PAGE).
- Per-workshop `LandingPage.customHtml` override independent of `PageTemplate`.
- Live preview pane in the editor.
- Render-path defense-in-depth re-sanitize (Codex r2 HIGH #3 — covers raw-SQL / Prisma Studio bypass).
- Manual page create (`PUT`) `registration_url` enrichment in template-copy path (Codex r2 MEDIUM #1).
- Full save→build→render integration test with un-mocked interpolation (Codex r2 MEDIUM #3).
- CSP tightening + nonce (current is `'unsafe-inline'` report-only).
- iframe `sandbox` attribute via DOMPurify hook.
- Step 4b post-patch removal once seed `interpolateContent` is verified.

Notion: https://www.notion.so/3728c45dd829819aa9e3dac61a798bcb. Plan: `~/.claude/plans/previous-instance-crashed-with-glittery-cake.md`.

---

### 2026-05-29 — Assessment Slice 5 — coach landing companies + per-campaign metrics + CampaignDetail Team column + band labels <!-- ENTRY_ISO:2026-05-29 ENTRY_SLUG:assessment-slice-5-landing-metrics-band -->

Branch `feat/assessment-slice-5-landing-metrics` merged via PR #23, squash commit `9570871`. Closes the visibility layer of the v7.6 setup-first flip — coach landing AND `CampaignDetail` now both speak the same staged-progress vocabulary (`New / Invited / Started / Completed / Revoked`) sourced from a single canonical classifier. 5 commits, all TDD/SDD (one foreground helper-extraction by the human controller mid-slice).

**Task 5.1 — `lib/assessments/campaign-status-metrics.ts`** (commit `91e73f1`): pure aggregation helper `computeCampaignStatusMetrics` returning `{ total, new, invited, started, completed, revoked }`. Locked mapping from `docs/specs/v7.6/08-members-teams-lane.md`: `new = PENDING & sentAt null · invited = SENT · started = VIEWED · completed = SUBMITTED · revoked excluded from total`. Defensive against the `PENDING + sentAt set` edge (`sentAt` wins → invited) and participant-with-no-invitation (counts as new). 11 tests including a "bands sum to total" invariant.

**Task 5.2 — `components/assessments/CampaignStatusMetrics.tsx`** (commit `f629e78`): shared 5-tile presentational strip consuming the `CampaignStatusMetrics` type. Brand tones mirror `INV_STATUS_TONE` exactly: invited=primary, started=warning, completed=success, new=muted, total=neutral. Lucide icons: `Users / Clock / Mail / Eye / CheckCircle2`. Props: `metrics`, optional `emptyHint` (rendered in place of all-zero tiles for DRAFT campaigns), `className` passthrough, `compact` mode for table rows, `testIdPrefix` for downstream test targeting. 10 tests.

**Task 5.3 — coach landing rewrite** (commit `9bb21e6`): `/portal/assessments` now groups campaigns by company. Server-side: one `findMany` with `include: { participants, invitations }` round-trip; metrics precomputed per campaign before serialization. Client-side: extracted `CompanySection` subcomponent renders one section per company (header = "Acme Corp · 3 campaigns"), inside which each campaign row shows the precomputed `<CampaignStatusMetrics compact emptyHint={…}>` strip. Status filter pills stay global (counts across all companies); a company with zero matching campaigns after filter collapses entirely. `CampaignListItem` gains `organizationId` + `metrics`. 11 new tests on `CampaignsListWithFilter.test.tsx`.

**Task 5.4 — CampaignDetail Team column** (commit `7b2ec06`): participant table gains a Team column between Email and Status. Source = the **immutable** `AssessmentCampaignParticipant.teamPathAtAdd / teamLabelsAtAdd` snapshot (NOT the live `OrgRespondent.team` relation), so closed campaigns stay locked to the team a participant was in at add-time, regardless of later reassignments. Render: em-dash for empty path, leaf label alone for single-segment, leaf label + muted `›`-joined breadcrumb for multi-segment. `CampaignRespondentRow` gains `teamSnapshot: { pathIds, pathLabels }` — no extra DB query (scalar fields on the same participant row). Expanded-result row `colSpan` bumped from 6 to 7. 4 new tests + 1 existing fixture extension.

**Task 5.5 — header strip + per-row band labels** (commit `1500fb9`): extracts `getInvitationBand(invitation): InvitationBand` from `campaign-status-metrics.ts` as the single source of truth for per-row classification; `computeCampaignStatusMetrics` now calls it internally so per-row and aggregate views can never drift. `CampaignDetail` header gains the full-size `<CampaignStatusMetrics>` strip computed via `useMemo` from current respondents. Per-row Status cell switches from `<StatusPill status={"SENT"}>` to a band span (`New / Invited / Started / Completed / Revoked`) with matching brand tones. Resend/remove logic still gated on raw `invitation.status` (band is display-only). Orphaned `INV_STATUS_TONE` const removed. Existing `status-pill-<status>` test selectors migrated to `band-pill-<band>`. 8 new tests.

**77 tests across 7 suites green** (`campaign-status-metrics`, `campaign-detail`, `CampaignStatusMetrics`, `campaign-detail-band-pills`, `CampaignsListWithFilter`, `campaign-detail-close-button`, `campaign-detail-add-existing`). `CI=true npx next build --turbopack` clean. Zero migrations; zero destructive ops. Three known pre-existing failures unrelated to this branch (`no-inline-tolocaledatestring` / `org-survey-exchange` / `assessment-campaigns-detail-route`) stable across the slice. Prod deploy verifies the coach sees company sections + per-campaign tiles on `/portal/assessments` and the band header strip + Team column + band labels on `CampaignDetail`.

**Out of scope (deferred):** revoked tile on the metrics strip (count is tracked but not rendered); per-row mini-step progression dots (the simple band pill captures the same info more cleanly for a table); URL state persistence for the filter pills.

---

### 2026-05-29 — Coach portal nav exposes Members (Slice 2 anchor correction) <!-- ENTRY_ISO:2026-05-29 ENTRY_SLUG:coach-nav-members-correction -->

PR #22 squash-merged to main (`ea72a30`). Three-line cherry-pick of commit `0452e26` — adds the `Members` entry (`Building2` icon) to `coachPrimaryNavItems` between *My Workshops* and *Assessments*, plus the matching assertion update in `coach-nav.test.ts`. Closes a real discoverability gap from Slice 2: `/portal/members` shipped in Slice 1 and all its CRUD (edit-team / edit-member / edit-organization modals from Slice 2, bulk import + quick-add from Slice 4) shipped on the page itself, but the outer coach sidebar never linked to it. The only ways to reach it were a direct URL or the wizard's "Manage members" CTA.

**Correcting the record:** the Slice 2 CHANGELOG entry (`assessment-slice-2-edit-modals`) and the CLAUDE.md anchor that pointed to it both stated *"The outer coach portal nav (`coachPrimaryNavItems`) now exposes a Members entry (`Building2` icon) between My Workshops and Assessments"*. That claim was false at merge time — the actual coach-nav.ts change was committed on the Slice 2 branch **47 min after** PR #19 squash-merged (`0452e26` at 08:21 EDT vs. `3b85992` at 07:34 EDT), so it was orphaned on the branch and never made it to main. Prod deploys `h4fikoykx` (Slice 4) and every earlier deploy back to Slice 1 lacked the nav link. This PR makes the original Slice 2 claim true.

Cherry-pick was clean (2 files / 3 insertions). Build gate green after a `.next/` cache clear (the cache held a stale resolution error for `@/components/approvals/approval-thread` that vanished on rebuild — unrelated to the change). Targeted test `coach-nav.test.ts` 2/2 passing. Zero migrations; zero risk.

---

### 2026-05-28 — Assessment Slice 4 — Bulk CSV import + wizard persistent quick-add <!-- ENTRY_ISO:2026-05-28 ENTRY_SLUG:assessment-slice-4-bulk-import-quickadd -->

**Branch:** `feat/assessment-slice-4-import-quickadd` (off `main`, merged via PR #21, squash commit `8ffc3d4`). Same-session continuation of Slices 1-3 via `superpowers:subagent-driven-development`. 3 commits.

**What shipped.** Coaches can now (a) bulk-import members from CSV inside the Members lane, and (b) create a new member mid-wizard that persists into the company roster (per locked decision #8 — setup-first even when done in-flow).

- **Bulk CSV import** (commit `be0c21a`, Critical fix `54c79e1`):
  - New `src/src/components/organizations/import-members-modal.tsx` (~388 LOC) reachable from an "Import members" button next to "+ Add Member" in the right Members panel header. Disabled until a node is selected (org context required for the bulk POST).
  - Paste-area textarea + **live preview** using the existing pure parser `parseRespondentCsv` — first ~10 rows in a small table + a per-row parse-error list (line numbers + reasons). The Import button is disabled while `rows.length === 0 || errors.length > 0` — defense-in-depth client-side gating.
  - Conflict mode radio: `skip` (default, leave existing untouched) / `merge` (update firstName/lastName/teamId by email).
  - Submit → `POST /api/organizations/{orgId}/respondents/bulk` with `{ rows, mode }`. Server response `{ success, data: { created, updated, skipped, errors[] } }` renders as a summary panel inside the modal (counts + role="status" for screen readers).
  - **Critical caught in code-quality review** — server-returned row-level errors on `success: true` were silently dropped. Only the COUNT rendered. A coach who imports 50 rows and gets 5 quietly-failed rows would have no way to know which 5 or why. Fixed by rendering each `Row N: reason` in a `role="alert"` list below the counts panel AND keeping the modal open (no auto-close) when `errors.length > 0` so the user can read the failures; the footer button label flips from "Cancel" to "Close" to make the intent clear. Zero-error path retains the original 1.5s auto-close. Plus a `closeTimeoutRef` + `closedRef` double-close guard around the post-success timeout (Escape / overlay click during the 1.5s window no longer triggers `onClose` twice). `useId()` for the textarea (no hard-coded id collisions in SSR/testing). `role="alert"` on the parse-error `<ul>` and `role="status"` on the success-summary `<div>` for proper a11y announcements.
  - 11 modal tests (incl. partial-success path: `success: true` + `errors.length > 0` → row reasons render, modal stays open, `onUpdated` still awaits) + 1 view-integration test asserting the Import button gates on selection.

- **Wizard persistent quick-add** (commit `3281163`):
  - In `CampaignWizard.tsx`'s `ParticipantsStep`, a new "Add new member" button (UserPlus icon, disabled while loading) opens the existing `AddMemberModal` with a **DialogDescription override**: `Adds this person to {orgName}'s roster (not just this campaign).` This is the explicit locked-#8 labeling — setup-first even when the create happens mid-wizard.
  - `AddMemberModal` API extended **additively, backward-compatibly**: the existing `onCreated` callback now receives `{ respondent, created }` where `created` is the typed new-respondent payload (`id`, `firstName`, `lastName`, `email`, `jobTitle`, `teamId`, `roleType`). The existing Members-lane caller uses `_result: MemberCreatedResult` (ignored arg) — verified via grep. New `description?: string` prop overrides the default `DialogDescription` text only when passed.
  - `WizardState` gains an ephemeral `orgName: string` (deliberately omitted from auto-save draft persistence so it doesn't leak into the server-side schema). `OrganizationStep.onChange` widened to `{ id, name }` so the wizard captures the display name for the modal description.
  - On modal success: `handleMemberCreated` calls `onChange([...respondentIds, newId], ceoRespondentId)` first (auto-includes the new id in selection), then `await refresh()` re-fetches the respondents list so the new member appears in the picker already checked.
  - **CEO-from-Level handoff** through quick-add: a member with `roleType: "ceofounder"` (etc.) created via quick-add is auto-included → the existing Slice-3 CEO-suggestion `useEffect` re-runs after the refresh → it sees exactly one CEO-family member in the selection and auto-sets them as CEO via `setCeoPickSource("auto")`. No special-casing — the state machine handles it. (Test QA4 verifies; one known test-quality note: QA4's assertion ordering implies the auto-suggest fires synchronously, when in practice it requires the re-fetch to complete first. Not a runtime defect; tightening the test is a follow-on.)
  - 4 new wizard tests (QA1–QA4): button visibility, modal description text, auto-include + auto-fetch with right URL/body shapes, CEO-from-Level handoff.

**Verification.** Full suite: **2152 passing, 3 failing** — exactly the 3 known pre-existing failures (`no-inline-tolocaledatestring` / `org-survey/exchange` / `assessment-campaigns/detail-route`) in files this branch never touched. 142/142 organizations test suites green (11 suites); 17/17 wizard test suite (4 new). `CI=true npx next build --turbopack` clean under the safety gate. Zero migrations; zero destructive operations. The new `AddMemberModal` API change verified backward-compatible (only one existing non-test caller, intentionally ignored arg).

**Out of scope (deferred to Slice 5).** Coach landing companies-supported list + per-campaign nag metrics (total/new/invited/started/completed); CampaignDetail Team column + staged-progress icons (the `new → invited → started → completed` lifecycle visualization Jeff stressed). Esperto-faithful pixel polish, top-level Reports lane, admin-lane mirror, Edit-Campaign advanced tabs all still out of v1 entirely.

**Plan:** `~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md`.

---

### 2026-05-28 — Assessment Slice 3 — Levels + CEO-from-Level suggestion <!-- ENTRY_ISO:2026-05-28 ENTRY_SLUG:assessment-slice-3-levels-ceo-suggest -->

**Branch:** `feat/assessment-slice-3-levels` (off `main`, merged via PR #20, squash commit `37dcd96`). Same-session continuation of Slices 1 + 2 via `superpowers:subagent-driven-development`. 3 commits.

**What shipped.** End-to-end `roleType` wiring + a never-silent CEO auto-suggest.

- **Levels infrastructure** (commit `9d1e890`, Critical fix `b5012fa`):
  - New `src/src/lib/assessments/respondent-levels.ts` — canonical 6-level taxonomy matching Esperto's Add Member dropdown verbatim: `Leadership team member` (`teamleader`), `Employee` (`employee`), `Guest` (`guest`), `CEO/Founder with team` (`ceofounderwithteam`), `CEO/Founder alone` (`ceofounderalone`), `CEO/Founder` (`ceofounder`). Only `ceofounder` is confirmed against a live Esperto stored value (Rodriguez Jaime's row); the 3 CEO-variant slugs are flagged in code as best-guess pending a real Esperto CSV export. Exports `RESPONDENT_LEVELS`, `RESPONDENT_LEVEL_VALUES` tuple for `z.enum(...)`, `levelLabel(value)` (returns `"—"` for null/undefined; the raw value for unknown legacy slugs), and `isCEOFamily(value)` (true for the 3 CEO/Founder slugs only).
  - `validations.ts` — both `createRespondentSchema` and `updateRespondentSchema` gain `roleType: z.enum(RESPONDENT_LEVEL_VALUES).optional().nullable()`. BC preserved (existing callers don't send `roleType`).
  - Add Member modal — Level `<select>` after Team; selecting → POST body includes `roleType`; "— no level —" → key omitted.
  - Edit Member modal — Level pre-fill from `member.roleType`; **legacy passthrough**: if the value is outside the 6 known slugs, the select renders a `(value) (legacy)` option so it's preserved + visible; clearing sends `roleType: null` to explicitly unset.
  - Members table column — `m.roleType ?? "—"` replaced with `levelLabel(m.roleType)`, so users see human labels (and the raw slug for unknown values, not "—" which would hide them).
  - 22 new respondent-levels tests + extensions to Add Member / Edit Member / members-teams-view tests.
  - **Critical bug caught in code-quality review** — Zod validated `roleType` but the API handlers NEVER forwarded it to Prisma. The whole feature was silently no-op at the persistence layer; the UI/test suite passed because tests mocked `fetch` and verified request shape, not DB writes. Fixed by adding `roleType: data.roleType ?? null` to `db.orgRespondent.create({ data })` in the POST route and `if (data.roleType !== undefined) updateData.roleType = data.roleType` in the PATCH route (the `!== undefined` check lets explicit `null` clear the field while body-omits remain no-ops). Six new API tests now assert the Prisma `data` argument shape directly (not the request body) to lock this invariant.
  - **Legacy slug + Zod rejection** — separately, the Edit modal previously sent the legacy unchanged value back in PATCH, which `z.enum(...)` would 400-reject on first encounter with imported data. Fixed by tracking `initialRoleType` and omitting `roleType` from the PATCH body when it equals the original AND the original is not in `RESPONDENT_LEVEL_VALUES`. Legacy values now survive an unrelated edit untouched. 3 modal tests cover unchanged-legacy / legacy→known / legacy→cleared paths.

- **CEO-from-Level suggestion in the wizard** (commit `20accd2`):
  - In `CampaignWizard.tsx`'s `ParticipantsStep`, when exactly **one** CEO/Founder-Level member is selected (`isCEOFamily(roleType) === true`) → auto-suggest that member as the campaign CEO, set `ceoRespondentId`, and render an inline `Suggested by Level` hint next to their CEO radio.
  - State machine via `ceoPickSource: 'auto' | 'user' | null` (discriminator chosen over a bare flag so a cleared auto-suggestion is distinct from "never set" — fixes the "re-suggest after |C| drops back to 1" edge case).
  - **A deliberate user click on the CEO radio always wins** — auto-logic returns early if `ceoPickSource === 'user'` and the picked member is still selected.
  - **|C| === 0 → CEO null** (clears any prior auto). **|C| > 1 → CEO null** (per decision #5 — never silently first-wins under ambiguity; the coach must explicitly pick one or leave it null). Removing the suggested member clears the CEO.
  - Members with `roleType: null` are never auto-suggested. Manual CEO selection still works for any member (including non-CEO-Level), and that pick persists across selection changes as long as the picked member stays in `respondentIds`.
  - 6 new wizard tests cover all six branches (single-suggest, multi-no-suggest, manual-wins, removal-clears, re-suggest-after-removal-back-to-one, null-roleType-never-suggested).
  - `canActivate` rule unchanged — a campaign can still ship without a CEO. The wizard's Review step + the Save click remain the explicit confirmation point (decision #5: "explicit single-CEO confirmation before save").

**Verification.** Full suite: **2140 passing, 3 failing** — exactly the 3 known pre-existing failures (`no-inline-tolocaledatestring` / `org-survey/exchange` / `assessment-campaigns/detail-route`) in files this branch never touched. `CI=true npx next build --turbopack` clean under the safety gate (PR #17). Zero migrations; zero destructive operations.

**Out of scope (deferred).** Bulk CSV import in the Members lane + persistent quick-add in the wizard (Slice 4). Coach landing companies-supported + per-campaign metrics + CampaignDetail Team column + staged-progress icons (Slice 5). Esperto-faithful pixel polish, admin-lane mirror, Reports lane, Edit-Campaign advanced tabs all still out of v1 entirely.

**Plan:** `~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md`.

---

### 2026-05-28 — Assessment Slice 2 — Members & Teams edit modals + coach nav entry <!-- ENTRY_ISO:2026-05-28 ENTRY_SLUG:assessment-slice-2-edit-modals -->

**Branch:** `feat/assessment-slice-2-polish` (off `main`, merged via PR #19, squash commit `3b85992`). Same-session continuation of Slice 1 via `superpowers:subagent-driven-development`. 5 commits.

**What shipped.** Polish on top of Slice 1's Members & Teams lane — coaches now have full CRUD on every node.

- **Edit Team modal** (commit `98cd8eb`, polish `0484db5`) — opens from a Pencil affordance on every team row. PATCHes `/api/organizations/{orgId}/teams/{teamId}` with the standard envelope. Enforces decision #3's schema invariant at edit-time (which the create modal already enforced):
  - **Type may NOT become "Company"** — omitted from the Type select; submit-time guard blocks any forced value.
  - **Parent may NOT become root** — omitted from the Parent select; placeholder `<option disabled>` reveals when the team is itself root-level and forces the user to consciously pick a parent (closes a real "silent auto-reparent on rename" bug caught in review).
  - **Parent may NOT be self or any descendant** — `collectSubtreeIds` DFS + `excludeTeamSubtree` client-side prune; server-side cycle-detection is the backstop.
  - **Delete affordance** in the modal footer with `window.confirm` + inline 409-children message ("Cannot delete — this team has sub-teams").
  - **Null-type helper text** when a legacy team has `type: null` — surfaces the data-state to the user rather than silently stranding their edit.
  - **Awaitable `onUpdated`** (`() => void | Promise<void>`) `await`ed BEFORE `onClose()`, so the tree reflects the rename/move before the modal disappears. `submitting`/`deleting` flags stay true through the await.
  - 10 tests (8 in the modal suite + 2 integration in `members-teams-view.test.tsx`).

- **Edit Member modal** (commit `0a6eb25`, hardening `5e5c826`) — Pencil affordance on every member row. PATCHes `/api/organizations/{orgId}/respondents/{memberId}` with `{ firstName, lastName, jobTitle?, teamId? }`. **Email field is `disabled + readOnly` and is NEVER included in the PATCH body** (the dedupe key is immutable via this surface; `updateRespondentSchema` doesn't accept it). Mirrors all the Add Member conventions (useId-linked labels, error unwrap, submitting guard).

- **Edit Organization modal** (commit `0a6eb25`, fix `5e5c826`) — Pencil affordance on every company root node. PATCHes `/api/organizations/{orgId}` with `{ name, externalId }`. Empty-name blocks submit; cleared `externalId` sends `null` (the route coerces `null` and `""` identically).
  - **Critical fix caught by code-quality review** — `OrgSummary` (the type the server page hands to the client) was missing `externalId`, the Pencil onClick was passing `externalId: undefined`, and the modal pre-filled empty. **Every single org edit was silently nulling out a real `externalId` value.** Fixed by threading `externalId` through schema-select → `OrgSummary` → Pencil onClick → modal pre-fill → PATCH body, plus updating the local state on refresh so subsequent edits see fresh data.
  - **Race-safe refresh**: close-the-modal-before-the-fetch ordering (rather than seqRef) — serializes naturally because the modal can't fire `onUpdated` again until reopened. Documented inline.

- **Coach nav entry** (commit `0452e26`) — `coachPrimaryNavItems` now includes **Members** (Building2 icon) between **My Workshops** and **Assessments**. Closes a discoverability gap that Slice 1 left open: I'd repointed the `AssessmentsSidebar` "My Organizations" placeholder to `/portal/members`, but that sidebar component doesn't actually render in the coach lane (it's the admin-lane nav), so `/portal/members` was only reachable by direct URL or via the wizard Step-3 "Manage members" CTA. Now it's first-class in the outer portal sidebar. 2/2 nav tests pass.

**A11y disambiguation.** Per-row Pencil buttons now use distinct `aria-label`s — `Edit organization {name}` / `Edit team {name}` / `Edit {firstName} {lastName}` — so a screen reader user navigating a list of 10 orgs doesn't hear "Edit organization" ten times. The 7 pre-existing `members-teams-view.test.tsx` tests that queried `getByRole('button', { name: /acme corp/i })` were tightened to anchored regexes (`/^Acme Corp$/i`) to disambiguate from the new edit buttons.

**Verification.** Full suite: **2080 passing, 3 failing** — the 3 failures are exactly the known pre-existing (`no-inline-tolocaledatestring` / `org-survey-exchange` / `assessment-campaigns-detail-route`) in files this branch never touched. `CI=true npx next build --turbopack` clean under the safety gate from PR #17. Zero migrations; zero destructive operations.

**Out of scope (deferred).** Task 2.3's pixel-faithful Esperto layout polish — pure cosmetic and Jeff judges on "is it built." Slices 3-5 (Levels + CEO suggestion / bulk import + persistent quick-add / coach landing companies-supported + staged-progress + Team column on CampaignDetail) all still pending.

**Plan:** `~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md`.

---

### 2026-05-28 — Assessment Setup-First Flip — Slice 1 (Members lane + pick-existing wizard) <!-- ENTRY_ISO:2026-05-28 ENTRY_SLUG:assessment-setup-first-coach-lane -->

**Branch:** `feat/assessment-setup-first` (off `main`, merged via PR #18, squash commit `3d3dc10`). Implementation via `superpowers:subagent-driven-development`: fresh implementer subagent per task → spec-compliance review → code-quality review → fix → re-verify.

**Why.** May 26 Jeff redirect: the assessment module's order-of-operations was wrong (the campaign wizard inline-created people in the middle of building a campaign). Flip it: coaches set up **Company → Team → Users FIRST**, then a campaign just **picks** an existing company + a subset of its existing members. Reuses people across future modules, supports targeted campaigns (not always everyone), gives the coach a "who do I nag" tracking view. Modeled on Esperto Assessments (white-labeled "Scaling Up Toolkit") — the incumbent we're replacing by July 1.

**Decision (A+).** Company = our `Organization` (zero migration; campaigns keep `organizationId` FK), but **presented Esperto-style** as a unified team tree with the company as the root node. Diverges from Esperto only where Esperto allows cross-company campaigns / a single all-companies workspace — neither asked for.

**What shipped (Slice 1, 6 tasks, 12 commits):**
- **Task 1 — Members & Teams read-only display** (commit `a0f57f8`, hardening `4d86f01`): new `/portal/members` server page (`requireCoach` + `db.organization.findMany`) + `MembersTeamsView` client (two-panel: companies as root nodes lazy-loading their `OrgTeam` tree, "not associated with any team" bucket, members panel right). Typed node contract `{ kind: 'organization' | 'team' | 'unassigned' }`; every select/handler branches on `kind`. Sidebar coach "My Organizations" placeholder repointed to `/portal/members` ("Members"). Request-sequencing refs (`memberSeqRef`/`teamSeqRef`) prevent stale fetch overwrites; distinct error states (`teamsError`/`membersError`) with Retry affordance (no longer silently rendering empty). 7 tests.
- **Task 2 — Add Team modal** (`aded908`, polish `c42c8d1`): single modal, **dual-create** based on Parent — `Parent=root + Type=Company → POST /api/organizations` (creates `Organization`); other → `POST /api/organizations/{orgId}/teams` (creates `OrgTeam` with `parentTeamId: null` or the selected team's id). **Create-time guards:** Type=Company only at root; non-Company only with a non-root parent (inline `role="alert"`, no fetch). Auto-expand the org on team-create so the new node is visible. Real Zod error unwrap (`Array.isArray(json.error) ? json.error[0]?.message : …`). DialogDescription added (a11y). 8 tests.
- **Task 3 — Add Member modal** (`5f31bb7`, fix `84ac4d4`): single member create (First/Last/Email required + Job title + Team optional) → `POST /api/organizations/{orgId}/respondents`. Mirrors Add Team's hardening (`submitting` double-submit guard, error unwrap, useId-linked labels). On open, if the company's teams haven't been lazy-loaded yet, triggers `loadTeams(orgId)` so the Team selector populates reactively (closes a real "can't pick a team after just selecting the company" UX gap). 8 tests.
- **Task 4 — Wizard flip** (`99c2758`, Critical fix `efc3631`): Step 0 picks an EXISTING company only (no inline org creation; CTA to `/portal/members` if none). Step 2 picks from the selected company's team tree (checkbox list, scoped to ONE company), no inline-create / no bulk-CSV. `saveCampaign` drops `bulkRespondents`; posts participants via the existing `/participants` route. **Server helper `processBulkRespondentsForCreate` + the `bulkRespondents` field on `createAssessmentCampaignSchema` retained intact (deprecated comment only) — older drafts/clients still work.** Codex opus review caught a **Critical** cross-company stale-selection bug — switching Step 0's org left previous `respondentIds`/`ceoRespondentId` in state, which would create the campaign and then fail at `/participants` ("don't belong to this campaign's organization") = orphaned empty campaign + late confusing error. Fixed with a functional `setState` clearing the selection only when the org actually changes; preserve-on-same; teams-fetch failure now also raises an error state (not silently mis-grouping all members into "unassigned"). Two regression tests pin both behaviors. Sidebar test updated for the Task 1 repoint (`6f537fa`).
- **Task 5 — CampaignDetail Add Respondent → add-existing only** (`b24b5a2`, fix `f4fbaeb`): post-creation Add Respondent now lists the campaign's company members excluding current participants as a multi-select checkbox list; POSTs `{ orgRespondentId }` to the existing `/api/assessment-campaigns/[id]/respondents` route. **Inline single-create form + bulk-CSV UI removed** (closes the "campaign-only people quietly pollute the roster" trap). Multi-add loop tracks `successCount`, treats `ALREADY_PARTICIPANT` (409) as benign, refreshes the table even on partial failure, and reports `"N added, M couldn't be added: <reason>"` (not the misleading `ids.length` count). Empty-state CTA → `/portal/members`. 8 tests.
- **Task 6 — Roadmap reconciliation + browser smoke** (docs commit `29b3a4c`): new canonical spec `docs/specs/v7.6/08-members-teams-lane.md` (context, A+ decision, 12 locked decisions, contract-first slice plan, staged-progress mapping, risks, out-of-scope). PLAN.md status line + spec-library row + decisions-ledger row 10 added. `project_assessment_tool` memory updated to mark the Esperto replacement project ACTIVE (was DEFERRED) with the flip as the current priority. Browser smoke on the Vercel preview as a coach against the prod DB: created `TEST DELETE ME 2026-05-28 sub-team` under "Test" / `TestDelete MeSmoke` member / `TEST DELETE ME 2026-05-28 smoke campaign` (Draft); confirmed Step 1 pick-existing only, Step 2 picks from the company-scoped tree, save-as-draft posts the participant via `/participants` cleanly (no orphan campaign — C1 fix holds in prod-like conditions), CampaignDetail Add Respondent excludes the existing CEO participant. **Legacy May 22 pre-flip QSP v1 campaign confirmed still renders + functions** (1 participant fully submitted, 100% completion, all controls intact) — no data displacement.

**Verification.** Build clean (now gated by `check-migration-safety.mjs` per PR #17 — passed with zero new migrations on this branch). 114/114 organizations + wizard + detail + sidebar suites green; full suite **2038 passing** + 3 known pre-existing failures (`no-inline-tolocaledatestring` / `org-survey/exchange` / `assessment-campaigns/detail-route`) in files this branch never touched (verified via `git diff --name-only main..HEAD`).

**Staged-progress mapping** (the canonical contract for the per-campaign nag view, to be surfaced in Slice 5): `new = PENDING & sentAt null · invited = SENT · started = VIEWED · completed = SUBMITTED · REVOKED excluded`.

**Out of scope (deferred to Slices 2–5).** Esperto-faithful UX polish (lazy-loaded tree with company-as-root layout + edit-team/edit-member modals); Levels (Esperto's 6: Leadership team member / Employee / Guest / CEO/Founder with team / alone / plain) + CEO-from-Level auto-suggestion with explicit confirm; bulk CSV import in the Members lane + persistent quick-add in the wizard (with explicit roster labeling); coach landing "Companies I support" + per-campaign metrics + CampaignDetail Team column + staged-progress icons. Esperto Home chart/clock/calendar, top-level Reports lane, edit-campaign advanced tabs (Notifications/Relations/Mail-Log/Access), and admin-lane mirror all out of v1 entirely.

**Plan:** `~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md` (12 grilled decisions + Codex adversarial review applied + SDD execution).

---

### 2026-05-27 — Database-wipe protection: enforce migration gate + guard destructive prisma commands <!-- ENTRY_ISO:2026-05-27 ENTRY_SLUG:db-wipe-protection-enforced -->

**Branch:** `fix/db-wipe-protection` (off `main`; isolated worktree, parallel to assessment work). **P0** — production data was wiped twice (coaches + user logins lost).

**Diagnosis.** `prisma migrate deploy` (the deploy path) **cannot** wipe data — it only applies pending migrations and errors on drift. A scan of all 29 migrations found exactly one destructive statement, already `-- @approved:` and scoped (orphan `DELETE FROM workflow_step_executions` in `20260401000000_add_workshop_cascade_deletes`). So the wipes did **not** come through migrations. Most likely cause: an **unguarded `prisma migrate reset` / `migrate dev` run locally against the prod `DATABASE_URL`** during a migration conflict — both were exposed as `npm run db:reset` / `db:migrate` with no guard, and `migrate dev` prompts a reset on drift. Catalyst: the Mar 31 baseline migration introduced migration files into a `db push`-managed prod DB that Prisma then saw as fully drifted. Matches the operator's "conflicting with a commit, I replaced it." Full confirmation needs Neon query/branch history (see runbook §7).

**What shipped (this branch):**
- **`scripts/safe-prisma.mjs`** — single guard wrapper. `db:reset`, `db:migrate`, `db:push` now route through it (`node scripts/safe-prisma.mjs <migrate reset|migrate dev|db push>`). Blocks the destructive command against a Neon-host `DATABASE_URL` unless `--i-know-this-is-prod`, and **consumes** that flag before spawning prisma. This fixes a latent bug in the old `guard-db-push.mjs && prisma db push` form: `npm run … -- --flag` appended the flag to prisma, not the guard, so the documented override never actually worked. `guard-db-push.mjs` deleted (superseded). 8 tests (`safe-prisma.test.ts`).
- **Migration safety gate now ENFORCED on every deploy.** `node scripts/check-migration-safety.mjs` prepended before `prisma migrate deploy` in `vercel.json` buildCommand (the real Vercel path) and `package.json` build. An unapproved destructive migration fails the build before any migration runs (proven with a temp `DROP TABLE "User"` migration → build chain halted before `migrate deploy`). Also added to `src/.github/workflows/deploy.yml` as a future-proof tripwire — though that workflow is currently **inert** (workflows must live at repo-root `.github/workflows/`, not `src/.github/workflows/`; live deploys go through Vercel git integration).
- **Snapshot hardened** (`snapshot-prod-tables.ts` + new pure `snapshot-prod-helpers.mjs`): retries transient connection drops (a Neon cold-start blip had silently dropped the `User` table from a snapshot); a snapshot missing any core table is written as `*.PARTIAL.json` and exits non-zero, so a partial can never be mistaken for a complete recovery fixture. 7 helper tests.
- **Config-integrity + negative-scan tests** (`deploy-safety-config.test.ts`, parses JSON not string-grep): asserts the gate ordering, that destructive db scripts route through `safe-prisma`, and that no npm script invokes a raw `prisma migrate dev|reset` / `db push`.
- **Immediate safety net:** a complete read-only prod snapshot was taken (User 12, Coach 7, Survey 8, SurveyTemplate 3, Workflow 3, WorkflowStep 6, CoachCertification 16 — 185 rows, 0 errors), stored locally in gitignored `.snapshots/`.

**Verification:** 28/28 script tests green (4 suites); `CI=true npx next build --turbopack` clean; ESLint clean; `npm run db:reset` / `db:push` against the live prod env both BLOCKED before prisma is spawned (no DB contact); override DRY-RUN confirmed the flag is now honored + stripped.

**Open items (need the Neon-account owner, `josh-4119`) — documented in runbook §8 + Notion:** least-privilege runtime DB role (highest leverage), confirm PITR retention window, Neon protected branch, pre-migration Neon checkpoint branch, move CI to repo root, branch protection + CODEOWNERS on migrations, long-term removal of `migrate deploy` from buildCommand.

### 2026-05-26 — Workflow cancellation ghost emails: Inngest memoization bypass fixed <!-- ENTRY_ISO:2026-05-26 ENTRY_SLUG:workflow-cancel-ghost-emails -->

**Commit:** `5cd3fec` — 3 files changed, 46 insertions, 1 deletion.

**Bug:** Workflows continued sending emails after a workshop was canceled or permanently deleted. Jeff reported 3 emails arriving at 8pm Saturday from test workshops he had already deleted.

**Root cause:** `execute-workflow.ts` opens with `step.run("fetch-assignment", ...)` which fetches `WorkflowAssignment` (including `isActive: true`). Inngest **memoizes** all `step.run` results — on any subsequent replay after a `step.sleepUntil`, this step returns the **cached** value, not a fresh DB read. Canceling a workshop sets `WorkflowAssignment.isActive = false` in the DB, but the function's in-flight `fetch-assignment` result is already cached as `isActive: true`. The outer guard at `if (!assignment.isActive)` therefore never fires after a sleep. Each email-sending `step.run("execute-stepN")` ran a dedup check only for `status: "SENT"` executions — CANCELED executions looked identical to "never sent", so the email fired.

The `cancelWorkflowExecutions` function had a comment explicitly flagging this: *"Future fix: emit a workflow/cancel event."* — this commit is that fix.

**Fix:** At the top of every `step.run("execute-${stepName}")` callback (before any email logic), added a **fresh** `db.workflowAssignment.findUnique({ select: { isActive } })`. This query is NOT memoized because it's the first run of this specific named step. If the assignment is `null` (permanently deleted, cascade) or `isActive: false` (canceled), returns early — no email sent.

**Covers both deletion paths:**
- Workshop canceled (status → CANCELED): `WorkflowAssignment.isActive = false` → fresh check catches it
- Workshop permanently deleted: `WorkflowAssignment` cascade-deleted → `findUnique` returns `null` → fresh check catches it

**Tests:** 2 new TDD tests in `execute-workflow.test.ts` under `"cancellation guard (stale fetch-assignment memoization fix)"`:
1. `skips EMAIL_COACH when assignment becomes inactive during sleep (workshop canceled)`
2. `skips EMAIL_COACH when assignment is permanently deleted during sleep`
42/42 suite green. Updated stale comment in `cancelWorkflowExecutions`.

### 2026-05-25 — Delete coach: FK constraint fix for assessment data + org ownership guard <!-- ENTRY_ISO:2026-05-25 ENTRY_SLUG:delete-coach-fk-fix -->

**Commit:** `c488308` | **Files:** 2

**Root cause:** `DELETE /api/coaches/[id]` was returning 500 for any coach with:
1. `AccessGroupCoach` memberships — the `coach` FK on that model has no `onDelete: Cascade`, causing P2003 on `tx.coach.delete()`
2. Organization ownership — `Organization.ownerCoachId` is non-nullable with no cascade

**Fix (`src/src/app/api/coaches/[id]/route.ts`):**
- Pre-delete org ownership check: returns 400 with clear message "Cannot delete coach who owns N organization(s). Transfer ownership first."
- Transaction now pre-cleans non-cascade Coach FK relations before `coach.delete()`:
  - `accessGroupCoach.deleteMany({ where: { coachId } })`
  - `organizationOwnershipEvent.updateMany` — nullifies old/newOwnerCoachId (nullable Coach? fields)
  - `assessmentCampaign.updateMany` — nullifies createdByCoachId (nullable Coach? field)
- User.delete() is wrapped in try/catch for P2003 — if the user created assessment data with non-nullable `createdBy` fields, the account is retained instead of failing the whole operation; coach portal access is blocked by `requireCoach()` redirect anyway
- Added `import { Prisma } from "@prisma/client"` for `PrismaClientKnownRequestError` check

**Tests (TDD — RED first):** 9 tests — 401/403/404/active-workshop guards, org ownership 400 block, accessGroupCoach cleanup, assessmentCampaign nullify, user account deleted, user account retained on P2003. All 9 green.

### 2026-05-25 — {{workshopLocation}} virtual link fix <!-- ENTRY_ISO:2026-05-25 ENTRY_SLUG:workshoplocation-virtual-fix -->

**Commit:** `05fb7f1` | **Files:** 4

**Root cause:** `buildLocationString` was updated in the Gmail Directions button fix to return `""` for VIRTUAL workshops (correct for ICS LOCATION field). However, `execute-workflow.ts` and `trigger-workflow-step.ts` both called `buildLocationString(workshop)` to build the `workshopLocation` workflow email context variable. This meant `{{workshopLocation}}` rendered as blank in all automated emails for virtual workshops.

**Fix:** Both Inngest function files now check `workshop.format === "VIRTUAL"` and return `workshop.virtualLink ?? ""` directly, bypassing `buildLocationString`. IN_PERSON and HYBRID still go through `buildLocationString` (which includes venue + address + Online link for HYBRID). ICS and Google Calendar link generation are unaffected.

**Tests (TDD — RED first):** 4 tests — VIRTUAL uses `virtualLink`, IN_PERSON uses `buildLocationString`, once in each Inngest handler. All 4 green.

### 2026-05-25 — Export Registrations: workshopId filter + live admin button <!-- ENTRY_ISO:2026-05-25 ENTRY_SLUG:export-registrations-workshopid-filter -->

**Commit:** `197d1f3` | **Files:** 3

**Root cause:** `GET /api/registrations/export` exported all registrations across every workshop because the route accepted no query params and had a hard-coded `where: { paymentStatus: { not: "PENDING" } }`. The "Export Registrations" button in `quick-actions.tsx` was a completely dead stub (`alert("Configuration Required…")`).

**Fix:**
- `src/src/app/api/registrations/export/route.ts`: changed `GET()` → `GET(request: Request)`, extracted `workshopId` from `searchParams`, added conditional `workshopId` spread to the Prisma `where` clause. Filename switches to `registrations-<date>.csv` when filtered (vs `contacts-<date>.csv` for the all-workshops export).
- `src/src/app/(dashboard)/workshops/[id]/quick-actions.tsx`: replaced `alert(...)` with `window.location.href = /api/registrations/export?workshopId=${encodeURIComponent(workshopId)}`.

**Tests (TDD — RED first):** 4 tests in `src/src/__tests__/api/registrations-export.test.ts` — 401 unauthenticated, 403 not admin/staff, CSV returned with no `workshopId` filter when param absent, `workshopId` correctly passed to Prisma `where` when param present. All 4 green.

### 2026-05-25 — ICS timezone offset fix: UTC absolute datetime (Z suffix) <!-- ENTRY_ISO:2026-05-25 ENTRY_SLUG:ics-utc-datetime-fix -->

**Commit:** `528a9de`. 2 files changed, 66 insertions, 37 deletions.

**Bug:** ICS downloads (`.ics` files) and Google Calendar links showed wrong times for US timezone workshops. Jeff described it as "ICS timezone offset wrong (CST/PST)". Root cause: `generateIcsContent` and `buildGoogleCalendarUrl` used `start.setHours(hours)` (server-local time method) then emitted `DTSTART;TZID=America/Chicago:20260615T090000` — a floating datetime with TZID but WITHOUT the required `VTIMEZONE` block. Clients like Outlook ignore TZID without a `VTIMEZONE` companion and treat the time as UTC or local, producing 5–8 hour offsets for US attendees.

**Fix:** Replaced the `setHours`/`getHours` approach in `generateIcsContent` and `buildGoogleCalendarUrl` with `resolveEventStartMoment` (already existed in `lib/workflows/resolve-event-start-moment.ts` — uses `Intl.DateTimeFormat` to correctly handle DST). Emit `DTSTART:20260615T140000Z` (RFC 5545 UTC absolute form, Z suffix) instead of the floating TZID form. Z-suffix datetimes are universally supported by all calendar clients including Outlook, Apple Calendar, and Google Calendar. Removed `formatIcsDate` (local-time formatter) and `parseStartTime` (no longer needed in this file); added `formatIcsDateUtc` (UTC formatter). Google Calendar URLs updated similarly; `ctz` parameter retained for timezone labeling.

**Tests (TDD):** 2 new failing tests first: Chicago workshop (CDT=UTC-5: `20260615T140000Z`) + LA workshop (PDT=UTC-7: `20260615T160000Z`). 3 existing tests updated from TZID pattern to UTC expected values. 29/29 green. Full suite: same 3 pre-existing lint failures. Build gate clean.

---

### 2026-05-25 — Admin-created workshops no longer bypass approval queue <!-- ENTRY_ISO:2026-05-25 ENTRY_SLUG:admin-workshop-no-premature-build -->

**Commit:** `24e7535`. 2 files changed, 51 insertions, 15 deletions.

**Bug:** When an admin created a workshop via `POST /api/workshops`, the route immediately emitted `workshop/approved` (the Inngest event that triggers `runAutoBuild()`), causing landing pages to be created and the "Workshop Ready" email to fire before Suzanne had reviewed the approval queue entry created in the same request.

**Root cause:** Lines 440–452 of `src/src/app/api/workshops/route.ts` contained an explicit "Admin/staff bypass" block that called `inngest.send({ name: "workshop/approved", ... })` for any privileged actor. The approval route (`POST /api/approvals/[id]/respond`) already calls `runAutoBuild()` and emits `workshop/approved` on all three approval paths — the bypass was redundant and destructive.

**Fix:** Removed the 13-line bypass block and the orphaned `import { inngest }` from `api/workshops/route.ts`. Admin-created workshops now sit in `AWAITING_APPROVAL` with a `PENDING` approval queue entry and pages are built only after Suzanne approves.

**Tests (TDD):** New failing test first: `"does NOT fire workshop/approved Inngest event during admin creation — pages wait for Suzanne's approval"` in `src/src/__tests__/api/workshops.test.ts`. Confirmed RED (inngest.send called once). After fix: 12/12 green. Full suite: same 3 pre-existing lint failures, no regressions. Build gate clean.

---

### 2026-05-25 — Venue address bug fixes (admin create + thank-you page) <!-- ENTRY_ISO:2026-05-25 ENTRY_SLUG:venue-address-bug-fixes -->

**Commit:** `d1033d4`. 5 files changed, 68 insertions, 5 deletions.

**Bug A — form sends object instead of string:** `src/src/app/(dashboard)/workshops/new/page.tsx` line ~432 built `venueAddress` as a plain JS `{street,city,state,zip}` object. The Zod schema declares `venueAddress: z.string().optional()` so this threw "expected string, received object". Fix: `JSON.stringify({...})` with an all-field truthy guard — if all four sub-fields are empty the field is `undefined` (not `"{}"`).

**Bug B — API double-encodes the string:** `src/src/app/api/workshops/route.ts` line 370 called `JSON.stringify(data.venueAddress)` on the value again after it arrived as a JSON string, producing double-escaped output like `"\"{\\"street\\"...}\""` in the DB. Fix: `venueAddress: data.venueAddress ?? null` (pass through as-is).

**Bug C — thank-you page renders raw JSON:** `src/src/components/templates/thank-you-page-template.tsx` joined `workshop.venueAddress` directly into the location label. Fix: import `formatVenueAddress` from `@/lib/utils` (already existed) and call it — returns parsed "Street, City, ST ZIP" string; returns `""` for null/undefined/unparseable (safe for `.filter(Boolean)`).

**Tests (TDD):** 3 new failing tests written first, then fixed: Test A + B in `src/src/__tests__/components/thank-you-page-template.test.tsx` (raw JSON not rendered; null address no crash); Test C in `src/src/__tests__/api/workshops.test.ts` (venueAddress stored as-is, not double-encoded). 33/33 in both suites green. Pre-existing 3 failures confirmed pre-existing on clean main. Build gate: `CI=true npx next build --turbopack` clean.

**Bug D — workflow emails render raw JSON address (`b87e3bc`):** `src/src/inngest/functions/schedule-emails.ts` line 67 was setting `venue_address: workshop.venueAddress` — the raw JSON string — into the email template variable. Any scheduled workflow email containing `{{venue_address}}` would show `{"street":"...","city":"..."}` to attendees. Fix: `venue_address: formatVenueAddress(workshop.venueAddress)` using the same `formatVenueAddress` from `@/lib/utils`. 2 new tests in `src/src/__tests__/inngest/schedule-emails.test.ts` (JSON address formats to readable string; null falls back to default message). Build gate clean.

---

### 2026-05-25 — Assessment Full Roster Build: multi-type questions + LVA seed <!-- ENTRY_ISO:2026-05-25 ENTRY_SLUG:assessment-full-roster-multi-type-questions-lva-seed -->

**Branch:** `feat/assessment-full-roster` → squash-merged to main as `22d2578`. 5 commits (`be29d5a`–`7c9342a` + merge `22d2578`). 13 files changed, 1838 insertions, 132 deletions.

**Phase B — Scoring engine discriminated union** (`be29d5a` + `d57a669`):
- `src/src/lib/assessments/scoring.ts`: `QuestionBase` split into `SliderLikertQuestion` (type literal `"SLIDER_LIKERT"`, `scale` required, exported) + `QualitativeQuestion` (enum `["TEXT","NUMBER","MULTI_CHOICE"]`, optional `options`/`maxChoices`, no scale). Replaced with `z.discriminatedUnion("type", [SliderLikertQuestion, QualitativeQuestion])`.
- `scoreSubmission`: `scorableQuestions = v.questions.filter((q): q is SliderLikertQuestion => q.type === "SLIDER_LIKERT")` for scoring math. `questionByKey` built from ALL questions (prevents UNKNOWN_STABLE_KEY on non-slider answers). Non-SLIDER answers skip via `if (q.type !== "SLIDER_LIKERT") continue`.
- `checkRecommendationsRuntime` / `checkRecommendationsPublish`: `.map((q, origIdx) => ({ q, origIdx })).filter(...)` pattern preserves original array indices for Zod error paths.
- `checkScaleUpScoreOptIn`, `computeTierDomain`, `computeRollupTierDomain`, `computePerDomainTierContexts`: typed to `SliderLikertQuestion[]`.
- Follow-on commit fixes `qi` (filtered index) → `origIdx` (original index) bug in Zod error paths; updates stale file header comment.
- New test file `src/src/__tests__/lib/assessments/scoring-multi-type.test.ts` (5 tests). 83/83 scoring tests green.
- Backward-compatible: QSP v1/v2, Rockefeller, SU Full all SLIDER_LIKERT-only, unchanged.

**Phase C — Frontend multi-type rendering** (`1fcef66` + `43f59de`):
- New `src/src/components/assessments/question-input.tsx`: shared `QuestionInput` component for all 4 types. MULTI_CHOICE uses `aria-label={q.label}` (no dangling aria-labelledby; fixed in follow-on). `maxChoices` enforced by disabling unchecked boxes once limit reached.
- `org-survey-client.tsx`: `Question.scale` made optional; `type`/`options`/`maxChoices` added; `answers` state widened to `Record<string, number|string|string[]>`; required validation handles empty string + empty array; inline slider replaced with `<QuestionInput>`.
- `public-quiz-client.tsx`: same interface widening + `<QuestionInput>` for non-SLIDER_LIKERT; SLIDER_LIKERT keeps existing button-picker UI; `toQuestions()` guard relaxed.
- `me/route.ts`: removed `allQuestions.filter((q) => q.type === "SLIDER_LIKERT")` — returns all question types.
- `quiz/[campaignAlias]/page.tsx`: removed `.filter((q) => q.type === "SLIDER_LIKERT")` from questions prop.
- Both submit routes: store `rawAnswers` (all types) in DB; SLIDER_LIKERT filter applied before `scoreSubmission` call; `schema-error` transaction kind wired to 500.
- `wireframes-scoped.css`: added `.survey-textarea`, `.survey-input-number`, `.survey-checkbox-group`, `.survey-checkbox-item` (with disabled state).
- `QuestionsTab.tsx`: read-only fallback row for non-SLIDER_LIKERT questions in editor config panel.
- New test file `src/src/__tests__/components/assessments/question-input.test.tsx` (8 tests).

**Phase D — LVA seed** (`7c9342a`):
- New `src/prisma/seed-lva-assessment.ts`: Leadership Vision Alignment, alias `leadership-vision-alignment`, 9 sections, 54 questions. S1 NUMBER×9 (financials), S2–S3 TEXT×8 (context/vision), S4 SLIDER_LIKERT×16 (scale 1–3, Weak→Strong, isRequired:true), S5 MULTI_CHOICE×1 (pick-3 obstacles), S6 TEXT×5, S7 1×NUMBER + 5×TEXT, S8 TEXT×6, S9 TEXT×3. Advisory lock `"assessment-lva-v1-seed"`, 6-state idempotency (A–F). DRAFT (publishedAt: null). ScoringConfig: tierMetric `overallAvg`, tiers Developing(1.0–1.67)/Building(1.67–2.34)/Scaling(2.34–3.01) — thresholds are placeholders, Jeff to confirm before publish.

**Phase E — Deploy**:
- Build gate: `CI=true npx next build --turbopack` ✓ clean.
- LVA seed ran against production (state A — first run). Template ID `cmpl64cb30003mjdszd2e5fql`, version `cmpl64csb0005mjdsvhq4q94x`, hash `bb2b3b90...`.
- Scaling Up Full seed: state B idempotent no-op (already present as DRAFT from May 20).
- No DB migration — `AssessmentSubmission.answers` is `Json`, both submit routes accept `value: z.unknown()`.
- Admin next step: publish both DRAFT templates after Jeff confirms tier thresholds (SU Full pending since May 20; LVA thresholds are mathematical thirds, pending confirmation).

---

### 2026-05-21 — Admin template editor wireframe rebuild + production data protection scaffold <!-- ENTRY_ISO:2026-05-21 ENTRY_SLUG:assessment-editor-wireframe-rebuild-plus-data-protection -->

**Single squash commit on main:** `35ee73b` (36 files changed, +8620/−1146). Replaces 19 commits on `feat/assessment-e1-tier-editor` (E1 foundation 6 commits + 12 wireframe rebuild + 1 data protection).

#### Why this rebuild

Phase E1 (May 20) shipped per-domain tier UI + publish failure modal as an extension to the existing single-page `AssessmentVersionEditor.tsx`. User review on May 20 PM revealed the existing editor did not match Jeff-approved wireframes WF16/17/18 (May 15 approval). Wireframes were in the repo the whole time but were not opened during E1 planning. New process rule saved to memory: `feedback_wireframes_are_the_spec.md` — before scoping any admin/portal UI work, open `src/public/wireframes-phase2/admin/*.html` first. The wireframe IS the spec; current implementation is irrelevant as a baseline.

#### Editor rebuild

New 7-tab editor under `src/src/components/admin/`:
- `TemplateEditorTabbed.tsx` — editor shell (persistent header + 7-tab nav + URL `?tab=` persistence)
- `template-editor/MetadataTab.tsx` — WF16 2-column body
- `template-editor/SectionsTab.tsx` + `SectionsCard.tsx` — Sections (shared card between Metadata right column + standalone Sections tab)
- `template-editor/QuestionsTab.tsx` — WF17 3-column layout
- `template-editor/ScoringTiersTab.tsx` — WF18 tier table + per-domain extension (Gap D)
- `template-editor/VersionsTab.tsx` — version history with per-row Edit/Duplicate/Publish
- `ui/tabs.tsx` — shadcn tabs primitive, Tailwind-restyled to WF16 `wf-tab` bottom-border-on-active pattern

**Tab order (verbatim from WF16 lines 805–815):**
Metadata · Sections · Questions · Scoring & Tiers · Conditional Logic [v1.5 disabled] · Access [nav-link to `/admin/assessments/access-groups`] · Versions

**WF16 Metadata tab** — 2-column body (60/40 on `lg:`+): Template Metadata + Invitation Email + Results Email cards left, Sections card right, Version History strip below.

**WF17 Questions tab** — 3-column sticky layout (20% / 50% / 30%): section navigator / question list (drag-sortable via @dnd-kit) / per-question config form with SLIDER_LIKERT editable; NUMBER + MULTI_CHOICE accordions ghosted with v1.5 badges (Question Type dropdown HTML-disables them per grill Q9); v1.5 informational cards (TEXT/TEXTAREA/COMPOUND) below the grid.

**WF18 Scoring & Tiers tab:** Scoring Configuration card (Tier Metric select + Pass Threshold) + Tiers table (Order/minMetric/maxMetric/Label/Message/Action) + 4-bullet validation hint card + inline alert on gap/overlap (metric-mode-aware) + live midpoint-answer preview via existing `scoreSubmission` engine + **per-domain tiers sub-section (Gap D, D2 extension)** when `scoringConfig.domains[]` is present (SU Full only) + deferred Conditional Sections + Peer Benchmarks ghost cards + explanation card verbatim.

**Versions tab:** version-history table (newest first) with per-row Edit (draft only) / Duplicate / Publish (draft only); Publish handler lifted to shell, same E1.2 `PublishFailureModal` wiring; current draft highlighted with `(you are here)` caption.

**Schema additive only** (migration `20260520180000_add_results_email_to_template`): 3 nullable fields on `AssessmentTemplate` — `resultsEmailSubject`, `resultsEmailBodyMarkdown`, `resultsEmailContentApproved`.

**Detail-route redirect** (F6 + grill Q6): `/admin/assessments/templates/[id]/page.tsx` redirects to `.../versions/{latestVersionId}/edit?tab=versions`.

**E1 engine work preserved byte-for-byte:** `validateTierTiling`, `assertTierTiling`, `computePerDomainTierContexts`, `TemplateVersionForPublishSchema` per-domain refine, runtime `scoreSubmission` per-domain check, `PublishFailureModal.tsx`.

**Live app nav UNTOUCHED.** No nav/sidebar/layout files modified in the rebuild commits. Editor mounts inside the existing `AssessmentsSidebar` lane (shipped pre-E1 per WF24). Wireframe chrome (dark "Scaling Up" sidebar, custom breadcrumbs) is mockup-only — NOT replicated in production per explicit user constraint.

**Process:** 10 grill-locked decisions (Results Email schema / explicit Save Draft / shadcn tabs + restyle / Access nav-link / Sections own tab / detail URL redirect / live midpoint preview / @dnd-kit drag / NUMBER+MULTI_CHOICE disabled / per-tab checkpoints) + 5 per-tab Codex review checkpoints (1a → 1b → 2 → 3 → 4 → F7 cleanup) all wireframe-fidelity reviewer-approved with minor deviations explicitly accepted (current-draft ring uses primary not warning to avoid amber-on-amber collision; section name editable input vs WF plain text per plan F2; live preview replaces static fixture; Required toggle native checkbox vs WF custom switch for a11y; drag handles + up/down arrow a11y fallback retained on Sections).

**TDD inside SDD** — implementer subagent writes failing tests first, watches them fail, then makes green; wireframe-fidelity reviewer subagent verifies WF-verbatim labels/layouts + TDD process. ~100 new tests across 6 tab-component test suites.

**Codex adversarial plan review** (May 20): 8 findings, 7 accepted (Access tab consistency, Sections tab explicit deliverable, save-strategy cleanup, F6 defers delete to F7, checkpoint 1 split into 1a + 1b, subagent simplification, no-blind-shadcn pre-flight, test-rewrite vs delete). 1 override with rationale (Results Email schema field stays on Template not Version — invitation precedent + schema consistency).

**F7 cleanup** — deleted deprecated `AssessmentVersionEditor.tsx` (1,586 LOC) + 3 E1 test files whose behavior is replicated by new tab-component tests.

**Playwright verification** (May 21): logged in via admin → navigated to `/admin/assessments/templates/{rockefellerId}` → confirmed F6 redirect to `.../edit?tab=versions` → screenshots of Versions tab + Metadata tab match WF16 content with live-app top nav + AssessmentsSidebar lane intact.

#### Production data protection scaffold

Five layered protections so manually-configured prod data (Surveys / Workflows / Coaches / Assessment Templates / etc.) survives future schema changes:

1. **Pre-deploy snapshot** — `npm run snapshot:prod` (`src/scripts/snapshot-prod-tables.ts`) exports 22 critical tables to `.snapshots/snapshot-YYYY-MM-DD-HHmmss.json`. Belt-and-suspenders alongside Neon's continuous backups (point-in-time recovery). `.snapshots/` added to `.gitignore` (PII; local-only).

2. **Restore tool** — `npm run restore:from-snapshot <file> [--table=<TableName>]` (`src/scripts/restore-from-snapshot.ts`). Upsert-by-id so additive prod activity isn't blown away. For true point-in-time recovery (including row reverts), use Neon PITR via dashboard.

3. **Migration safety gate** — `npm run db:check-migrations` (`src/scripts/check-migration-safety.mjs`) greps every migration.sql for `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE FROM` / `ALTER COLUMN ... DROP`. Fails (exit 1) on any unapproved destructive op. Escape hatch: `-- @approved: <reason>` comment immediately preceding the destructive SQL. macOS `/var` → `/private/var` realpath fix on the CLI entrypoint check. 7 unit tests via `execFileSync` against tmp migration dirs. **One legacy destructive op retroactively approved**: `20260401000000_add_workshop_cascade_deletes` step 1 (`DELETE FROM workflow_step_executions WHERE workshopId NOT IN ...`) — orphan cleanup required before adding the FK CASCADE in step 2; targets only orphans, no operator data at risk.

4. **`db:push` env-guard** — `src/scripts/guard-db-push.mjs` wraps `npm run db:push` and blocks Neon-host DATABASE_URLs (`prisma db push` skips the migrations table and can drop columns on schema divergence). Override: `npm run db:push -- --i-know-this-is-prod`.

5. **Runbook** — [docs/runbooks/database-protection.md](docs/runbooks/database-protection.md) covering layered-protections table, pre-deploy checklist, Neon PITR restore procedure, snapshot restore, destructive-migration approval workflow, snapshot PII housekeeping.

#### Build + test gates

- `CI=true npx next build --turbopack` ✓
- 494/494 tests across 49 suites green
- Migration safety check ran against all 29 migrations on main — 0 unapproved destructive ops after the legacy approval

#### Known follow-ons (deferred)

- Create flow at `/admin/assessments/templates/new` still uses old flat `AssessmentTemplateForm.tsx` (out of scope per pre-grill). Convert to tabbed editor in "create mode" as separate phase if needed.
- Conditional Sections + Peer Benchmarks editors (deferred placeholders only per WF18 — v1.5)
- NUMBER / MULTI_CHOICE / TEXT / TEXTAREA / COMPOUND question type editors (ghosted per WF17 — v1.5)
- Results Email content-approval toggle persists per-template Boolean; env-var content gate (`INVITED_RESULTS_EMAIL_COPY_APPROVED`) NOT used (per Gap B decision)
- Results Email fields on Template not Version — flagged by Codex as schema smell; precedent-consistent with invitation fields. Known follow-on if Jeff wants version-scoped email copy.
- Coach-side wireframes don't exist in Phase 2 (admin + participant only); coach portal changes are separate scope

Plan: `~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md`

---

### 2026-05-20 — Assessment Tool v7.6 Phase D2 — engine extension + Scaling Up Full seed (DRAFT) <!-- ENTRY_ISO:2026-05-20 ENTRY_SLUG:assessment-v7-6-d2-engine-extension-su-full-seed -->

**Context.** D1 shipped the QSP v1/v2 seeds + the Rockefeller engine path. Phase D2 extends the scoring engine to support Jeff's flagship product — the Scaling Up Full assessment, which has 5 domains (People / Strategy / Execution / Cash / You), 10 nested sections, ~65 questions on a 0–10 SLIDER_LIKERT scale, per-question score-band narratives, and a 0–100 ScaleUp Score on the profile page. The engine pre-D2 only supported flat per-section scoring with template-level tier resolution; the D1 QSP seeds also had a runtime-breaking `scoringConfig` field-name drift that would throw on any submission scoring attempt.

**3 commits on `feat/assessment-d2-engine` → merged to main via `b3bbcb4` (merge commit).**

#### D2.0 — QSP v1/v2 scoringConfig hotfix (commit `bb6c2d3`)

D1's seeds shipped with five defects that would throw at Zod validation:
1. `scoringConfig.tiers[].minScore`/`maxScore` → renamed to `minMetric`/`maxMetric` (engine canonical names)
2. `scoringConfig.tierMetric: "average"` → `"overallAvg"` (the engine's valid enum value)
3. Tier tiles had fractional gaps (`{1–4.99}, {5–6.99}, {7–8.99}, {9–null}`) — engine's `validateTierTiling` requires touching boundaries on fractional domains. Retiled to `{1–5}, {5–7}, {7–9}, {9–open}` with first-match-wins.
4. Top tier had `maxScore: null` (Zod expects `number | undefined`, not null) — dropped the field on the open-ended tier
5. Every tier was missing `message: string` (Zod required) — added coach-facing prose per tier
6. Question scales missing `anchorMin`/`anchorMax` strings — added "Strongly disagree" / "Strongly agree" defaults
7. QSP v2's TEXT questions can't be scored by the v1 engine — `buildTemplateContent()` filters to SLIDER_LIKERT-only + re-numbers `sortOrder` contiguously for the scoring path; DB still stores all questions (TEXT visible in the questionnaire UI)

Added end-to-end regression test in `scoring.test.ts`: scores a QSP template with synthetic answers, asserts no throw + tier resolution. Locks the engine contract so future field-name drift fails CI.

**ContentHash changes for both QSP versions.** Operator note in the commit: any env with QSP v1/v2 already seeded will hit State C drift on re-seed. Resolution: (a) bump `versionNumber` to 2 for next deploy, or (b) `prisma migrate resolve` existing rows + re-seed. Recommend (a) for production.

#### D2.1 — Engine extension (commit `7bc8ebd`)

**New question/section/config shapes (Zod, all backwards-compatible)**:
- `Question.recommendations?: Array<{minScore, maxScore, text}>` — optional per-question score-band narratives. Bands inclusive, no overlap, full-scale coverage required at publish time but gaps tolerated at runtime (returns `undefined` recommendation).
- `Section.domain?: string` — optional domain key. If set, must match a key in `scoringConfig.domains[]`. Domain lives on Section (not Question) — single source of truth for the section↔domain relationship.
- `ScoringConfig.rollup?: { overall: "meanOfQuestions" | "meanOfSections" | "meanOfDomains" }` — canonical overall rollup contract. When set, replaces legacy `tierMetric` for global tier resolution. When omitted, engine runs legacy `tierMetric` switch byte-for-byte unchanged (BC preserved per Codex round 2 #1).
- `ScoringConfig.domains?: Array<{key, label, tiers}>` — per-domain tier definitions. Required when any section has a `domain` field.
- `ScoringConfig.scaleUpScore?: boolean` — opt-in for 0–100 score emission. Requires `rollup.overall` set + all questions on 0–10 scale (Codex round 2 #5).

**New ScoreResult fields (all optional)**:
- `perQuestion[].recommendation?: string` — matched band text or undefined
- `perDomain?: Array<{key, label, averagePoints: number | null, answeredSectionCount, totalSectionCount, tier}>` — emitted when `scoringConfig.domains` set. Zero-answer domains return `averagePoints: null` (Codex round 1 #1 — never conflate "no data" with "scored 0"). `answeredSectionCount` / `totalSectionCount` let the report distinguish.
- `scaleUpScore?: number` — `round(overallMetric * 10)` when opted-in

**Two Zod schemas built via shared base components + `.superRefine()` composition** (Codex round 3 #5 — single source of truth, no drift between runtime and publish):
- `TemplateVersionForScoringSchema` — runtime permissive. Accepts existing template shapes; allows recommendation gaps (returns undefined at runtime); rejects `scaleUpScore: true` without `rollup.overall` (no BC risk — `scaleUpScore` is new).
- `TemplateVersionForPublishSchema = TemplateVersionForScoringSchema.superRefine(...)` — publish-strict. Adds: full-scale band coverage required, sentinel text (`TODO`, `PLACEHOLDER`, `Lorem`) rejected, domains assignment complete when `rollup.overall === "meanOfDomains"`.

**Server-side gates (Codex round 2 #3 + round 3 #1)**:
- Publish endpoint at `/api/admin/assessment-templates/[id]/versions/[versionId]/publish` runs strict schema before flipping `publishedAt`. Returns `422 PUBLISH_VALIDATION_FAILED` with Zod issues on failure.
- Campaign-create flow extracted into `src/src/lib/assessments/campaign-create-service.ts` → `resolvePublishedTemplateVersion` throws `CampaignCreateError("TEMPLATE_VERSION_NOT_PUBLISHED")` if the target version is draft. Route maps to `422`. Server-side enforcement in the service layer (not just route wrapper), so future callers can't bypass.

**Backwards compatibility — Rockefeller scoring locked via SHA-256 snapshot test**: `scoring-bc-snapshot.test.ts` computes Rockefeller's `ScoreResult` for a deterministic answer set and asserts SHA `b5997e68bf0379f149b16e14056bb4807fad491e161c5d3cb10c183a7379fc50`. Snapshot is committed-as-fixture; any future engine change that drifts the SHA fails CI. Snapshot was locked BEFORE any engine edit (Codex final guardrail #3).

**21 new scoring tests + null-domain consumer tests** (JSON serialization + React component render via `formatNullableNumber` helper that returns "—" for null/undefined/NaN/Infinity). Existing campaigns-route + templates-crud tests updated to reflect new schema-validation behavior (1 test updated 409→422 for the new service-layer error code).

#### D2.2 — Scaling Up Full seed (commit `dec05ce`)

**Created** `src/prisma/seed-scaling-up-full-assessment.ts` mirroring the Rockefeller scaffold (`resolveSystemUser` + advisory lock + 6-state safety model + `computeContentHash` + `ensureAccessGroupAndTemplateLink` + `require.main === module` guard + `buildTemplateContent` export).

**61 questions across 5 domains, 10 sections** — extracted via Bash + unzip + Python from Jeff's source materials:
| Domain | Sections | Question count |
|---|---|---|
| People | Your Employees, Company Culture | 13 |
| Strategy | Strategy (flat) | 7 |
| Execution | Leadership Team, Operational Processes, Sales and Marketing, Scalability/Innovation/Technology | 20 |
| Cash | Cash (flat) | 5 |
| You | Your Leadership, Internal Communication | 13 |

Question labels + LOW-band narratives from `matrix.xlsx` (133 sharedStrings; 61 question/narrative pairs). MEDIUM-band narratives from the all-5s sample PDF. HIGH-band narratives from the all-7s sample PDF (chose 7s over 10s — the [7,10] band wants a voice that works near the lower edge of "Strong"). **100% narrative coverage** — zero `[PLACEHOLDER]` markers shipped. No XLSX runtime dep added to `package.json`; the seed file ships with inline hardcoded data.

**Scoring config**: `tierMetric: "overallAvg"` (legacy field for BC), `rollup.overall: "meanOfDomains"`, `scaleUpScore: true`, 4 global tiers (Critical 0–3, At Risk 3–5, On Track 5–7, Strong 7–10) with touching boundaries, 5 domains in `scoringConfig.domains[]` each using the same 4-tier shape.

**DRAFT only** (`publishedAt: null` on insert) per Codex round 1 #4: tier thresholds are placeholders pending Jeff's confirmation, and the strict publish schema actually passes outright on the seed's content. Operators verify+publish via the admin editor when content is reviewed. Application-layer enforcement, not schema-layer (the schema is publish-ready).

**Pre-write extraction audit** (Codex final guardrail #4): `runExtractionAudit()` runs BEFORE `runSeed`'s DB transaction. Asserts 5 domains, 10 sections, every section has a domain, every domain has ≥1 section, ~50–70 questions, all SLIDER_LIKERT scale 0–10, 3 recommendation bands each. Fails fast with no DB writes if structure drifts. New strengthening beyond Rockefeller/QSP's seed pattern; worth back-porting later.

**13 smoke tests** in `src/src/__tests__/seed/scaling-up-full.test.ts`: State A creates DRAFT version, State B is idempotent, State C throws on hash drift, cross-seed hash uniqueness, extraction audit assertions, runtime schema passes, publish schema either passes or fails only on text content.

**npm script alias**: `seed:scaling-up-full` added to `src/package.json` alongside `seed:rockefeller`, `seed:qsp-v1`, `seed:qsp-v2`.

#### Plan + adversarial review trail

Full plan at `~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md` includes 14 user-locked decisions + 4 rounds of Codex adversarial review. Major plan refinements driven by Codex:
- Round 1 #1: Zero-answer domains return null not 0; add `answeredSectionCount` + `totalSectionCount`
- Round 1 #2: ScaleUp Score derives from canonical rollup, not `overallAverage * 10` (avoids weighting question-rich domains)
- Round 1 #5: QSP hotfix ships as separate first commit with own verify cycle
- Round 1 #6: Canonical rollup contract replaces ad-hoc `perDomainAverage` tier metric
- Round 2 #1: Legacy `tierMetric` code path preserved byte-for-byte, NOT mapped to `meanOfQuestions`
- Round 2 #2: Two Zod schemas (runtime vs publish) — split strict-validation from runtime-scoring
- Round 2 #4: Null-domain consumer tests for JSON serialization + report rendering
- Round 3 #1: Publish/campaign gates as explicit scope, not "verify later"
- Round 3 #4: Band boundaries explicit (inclusive integer, no overlap, full coverage)
- Round 3 #5: Schemas built from shared base via `.superRefine()` composition

#### Test totals

245 tests across 30 suites green at the final review checkpoint. Build gate `CI=true npx next build --turbopack` passes in ~22–53s. One unrelated pre-existing test failure (`no-inline-tolocaledatestring` in `public-quiz-client.tsx`) flagged but not introduced by D2.

#### Phases A–D1 (also landed via this merge)

The IA refactor commits from `feat/assessment-ia-refactor-phase-a` (10 commits, May 19) rolled in with the D2 merge:
- Phase A: top-nav consolidated from 4 separate assessment entries into single "Assessments" entry; new sidebar layout at `/admin/assessments/*` with 7 admin entries + 2 coach-lane entries; 308 redirects for old URLs (`/admin/assessment-templates` → `/admin/assessments/templates`, `/admin/access-groups` → `/admin/assessments/access-groups`, `/admin/observability` → `/admin/assessments/observability`); new admin landing page with 3 stat cards + Getting Started panel
- Phase B: aggregate dashboard reverted to wireframe 23 v1 contract (removed `startDate`/`endDate`/`organizationId` filters that violated the locked spec); dropped 4th `filters` arg from `getAggregateReport` service signature
- Phase C: coach empty-state CTA + Getting Started 4-step panel on admin landing; Rockefeller seed now wires default coach to AccessGroup so end-to-end flow works on fresh DB
- Phase D1: QSP v1 + QSP v2 seeds (later hotfixed in D2.0)

#### What's deferred

MULTI_CHOICE / TEXT / NUMBER question types (Vision Alignment seed needs these), question weights, ScaleUp Score "bonus points" layer (ambition/growth multipliers), Vision Alignment seed, SunHub Quiz seed (D3), per-domain authoring UI in the admin form-builder, peer comparison / team averaging / benchmarking on the report side.

---

### 2026-05-19 — Registration email: append location block to admin-template body: <!-- ENTRY_ISO:2026-05-19 ENTRY_SLUG:registration-email-location-block-append -->

**Symptom.** Per the May 19 morning Zoom (recording: `fathom.video/share/MxkvcUW9QvAHzxe_nqVgm5dAs1TJj1mN`), after yesterday's kill-switch flip made the admin-edited registration confirmation template go live, Jeff confirmed his custom body was reaching registrants — but **without the Zoom link for virtual workshops or the venue address for in-person**. The old hardcoded email had auto-rendered a location block at the bottom; the admin-edited template body doesn't include `{{virtualLink}}` (or `{{venueName}}`/`{{venueAddress}}`) by default, and coaches aren't expected to know the token list.

**Decision.** Always-append the location block at the bottom of the rendered body, on the DB-template path. Decision rationale: meeting transcript explicitly said "just put the connection information at the bottom" — auto-append is simpler than a per-template "include location?" toggle and removes a foot-gun (coach forgets to add the token, registrants get no link).

**Fix.** In `composeRegistrationConfirmationEmail` ([src/src/lib/notifications/transactional-email-template.ts](../src/src/lib/notifications/transactional-email-template.ts)), after token interpolation:

```ts
const subject = interpolateTokens(row.subject, escapedTokens);
const bodyInterpolated = interpolateTokens(row.body, escapedTokens);
const locationBlock = buildLocationBlock(ctx);
const html = locationBlock
  ? `${bodyInterpolated}\n<hr>\n${locationBlock}`
  : bodyInterpolated;
return { subject, html };
```

`buildLocationBlock(ctx)` already existed for the hardcoded fallback path — it handles all four branches (`VIRTUAL + virtualLink → Join online: <a>`, `VIRTUAL + no link → "Join details will be shared by the coach"`, `IN_PERSON/HYBRID + venueName → venue + Get Directions map link`, `no format/no venue → ""`). Empty string short-circuits the `<hr>` so non-physical/non-virtual workshops don't get a stray separator.

**Subject deliberately not modified.** Stuffing `Join online: https://zoom.us/j/…` into the subject would (a) push the workshop title past Gmail's inbox-preview truncation, and (b) raise spam-filter heuristics around URLs in subject lines. Body-only matches the meeting ask.

**Hardcoded fallback path** ([transactional-email-template.ts:94](../src/src/lib/notifications/transactional-email-template.ts#L94)) untouched — it already inlines `buildLocationBlock(ctx)` in its HTML template.

**Tests.** 4 new cases in a third `describe` block of [transactional-email-template.test.ts](../src/src/__tests__/lib/transactional-email-template.test.ts) exercising the DB-template path (kill switch on, mock DB row returns custom subject + body) across each format branch:
- VIRTUAL + virtualLink → interpolated body comes first, then `<hr>`, then `Join online: <a href=...>` (and subject **lacks** the URL).
- VIRTUAL + no virtualLink → fallback "Join details will be shared by the coach" appended.
- IN_PERSON + venue/address → venue name + Get Directions map link appended.
- no `format` field → no `<hr>`, no location block, body unchanged (backwards compat).

11/11 in the suite green. Existing 7 tests (4 fundamentals + 3 hardcoded-path location tests) untouched.

**Build gate.** `CI=true npx next build --turbopack` → ✓ Compiled successfully in 42s. Worktree-isolated build (parallel session was actively editing main workspace).

**Commit.** `4c026b5` (pushed direct to main).

**Open coach-facing follow-on.** The 4 location tokens (`{{virtualLink}}`, `{{venueName}}`, `{{venueAddress}}`, `{{format}}`) are still individually interpolatable in the template body — a coach can still write `<p>Join via Zoom: {{virtualLink}}</p>` inside their custom body. They'd then get the link rendered twice (once where they put it, once at the auto-appended bottom). Not breaking — the auto-append is the safety net, the inline token is the deliberate placement. If anyone hits this, the fix is to either remove the inline token OR suppress the auto-append when the body already contains the token (string match). Not implementing today.

---

### 2026-05-19 — Assessment Tool v7.6 — Observability dashboard v1 (DB-derived counters): <!-- ENTRY_ISO:2026-05-19 ENTRY_SLUG:assessment-v7-6-observability-dashboard-v1 -->

Honest v1 of the observability dashboard spec'd in `docs/specs/v7.6/06-observability.md`. The spec calls for 7 Vercel/Inngest-backed metrics + 6 alert gates configured via the existing SMTP path — that's deploy/infra work outside this codebase. v1 ships a DB-derived dashboard that gives operators a usable live signal without the time-series backend. v1.5 swaps for real metrics.

**Route** — `GET /api/admin/observability` (admin-only, 403 otherwise):
- Coaches by certification status (`ACTIVE` / `PENDING` / `DEACTIVATED`).
- Organizations: total + with-campaigns (any).
- Assessment templates: total + published-version count + draft-version count.
- Campaigns: by status (`DRAFT` / `ACTIVE` / `CLOSED`) + by accessMode (`INVITED` / `PUBLIC`).
- Submissions: total + last 24h + last 7d + public + invited.
- AuditLog: last-24h count + per-action breakdown (sorted descending).

**UI** — `/admin/observability`:
- Stat-card grids per section (responsive 2/3/5-column).
- Per-action audit log table sorted by count desc.
- Manual refresh button re-fetches without a page reload.
- Nav entry under "Access Groups".

**Tests**: 3 new in `observability-route.test.ts` (401 unauth, 403 non-admin, 200 happy path asserting documented shape).

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 24.9s. Commit `6b35556`.

**v1.5 work explicitly deferred** (from spec 06):
- 7 Vercel Analytics / Inngest event counters (access.evaluate.outcome, access.change.outcome, org.transfer.outcome, seed.duration_ms, seed.result, fingerprint.outcome, aggregate.query.duration_ms).
- 6 SMTP-paged alert gates (audit-fail, fingerprint-mismatch, seed-error, intersection-empty sustained, certified-zero-template-count, aggregate p95 > 2s).
- The `certified_zero_effective_template_count` gauge refreshed by Inngest cron.

### 2026-05-19 — Assessment Tool v7.6 — Public quiz mode (Decision #4 MVP): <!-- ENTRY_ISO:2026-05-19 ENTRY_SLUG:assessment-v7-6-public-quiz-mode -->

Anonymous self-assessment flow for templates configured as PUBLIC. Closes Decision #4 from the v7.6 spec lock. Anyone with the campaign alias can land on `/quiz/[alias]`, enter name + email, answer the questions, and submit. Scoring runs server-side using the same engine as INVITED. Marketing-funnel surface, indexable by design.

**Routes**:
- `/quiz/[campaignAlias]` — server-rendered landing. Reads `campaign + first published version` server-side, computes the open/closed window inline, hands to the client funnel. Indexable; per-campaign de-indexing can land via `publicConfig` in a future slice.
- `/quiz/[campaignAlias]/thank-you` — generic confirmation. Public results delivery via a `resultsToken` email is a follow-on slice (schema columns already exist on `AssessmentSubmission`: `resultsTokenHash` / `resultsTokenIssuedAt` / `…ExpiresAt` / `…RevokedAt` / `…ViewedAt`).
- `POST /api/quiz/[campaignAlias]/submit` — Zod-validated body `{ publicTaker: {firstName, lastName, email}, answers, referringCoachEmail? }`. Outcomes: 404 `CAMPAIGN_NOT_FOUND` (unknown alias or unpublished version), 403 `NOT_PUBLIC` (INVITED-only campaign), 410 `NOT_OPEN` (DRAFT/CLOSED/before-openAt/past-closeAt), 400 surfaces `ScoringValidationError` codes verbatim. Creates submission with `respondentId=null` + `invitationId=null` + `publicTaker` JSON. Rate-limited via `RateLimits.standard`.

**UI** (`public-quiz-client.tsx`):
- 3-step funnel: intro card (with question count + time estimate) → info-capture form → grouped-by-section question list with sticky progress header.
- SLIDER_LIKERT renders as a row of value buttons + anchor labels at min/max.
- Required-question gate on submit; inline error banner on submission failure; redirect to thank-you on 200.

**Middleware**: `/quiz/*` and `/api/quiz/*` added to both auth-bypass blocks (mirrors the existing `/org-survey/*` pattern for INVITED).

**Tests**: 6 new in `submit-post.test.ts` covering Zod 400, 404 unknown alias, 403 INVITED, 410 DRAFT, 410 past-closeAt, 200 happy path with `publicTaker` written + null FK fields.

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 27.1s. Commit `a8ac8b5`.

**Deferred**:
- Admin UI to flip a campaign's `accessMode` to PUBLIC + edit `publicConfig`. Today admin uses the API directly via dev tools.
- Cookie-tracked dedup of repeat submissions from the same browser. The schema accepts multiple submissions today.
- `publicConfig`-driven feature flags (e.g., require-email-only / require-full-name / de-index toggle).
- Public results page via `resultsToken` (the schema columns exist; the route + page do not).

### 2026-05-19 — Assessment Tool v7.6 — Template content form builder + multi-version forks: <!-- ENTRY_ISO:2026-05-19 ENTRY_SLUG:assessment-v7-6-form-builder-multi-version -->

Two complementary slices that complete the in-app template-authoring story. Together they replace the May 18 paste-JSON MVP with a real authoring workflow: structured form fields for everything in the scoring engine's input shape, plus the ability to evolve a published template by duplicating its latest version into a fresh editable draft.

**Form builder** (commit `72a3b6e`) — replaces the new-template paste-JSON textareas with structured inputs:
- Sections editor — name + description + partLabel + reorder buttons + add/remove. Removing a section also drops its questions (FK-like behavior in component state).
- Questions editor — label + helpText + section selector + required toggle + 5-field scale (min/max/step/anchorMin/anchorMax). All questions today are `SLIDER_LIKERT` — matches the runtime scoring engine.
- Scoring editor — `tierMetric` enum + `passThreshold` + tiers array with min / max-blank-for-unbounded / label / message. Reorder.
- `stableKey` auto-generated from order (`S1`, `S2`; `S1_Q1`, `S1_Q2`, `S2_Q1`, with counter resetting per section). No hand-coded identifiers in the UI.
- Submit-time validation: every section needs a name; every question needs a label + section + valid scale; every tier needs a label + message. Inline red banner gates the network call.
- `reportConfig` kept as paste-JSON for now (not part of scoring engine; advanced field).

**Multi-version forks** (commit `9d101e0`) — admins can evolve a published template without losing audit history:
- `POST /api/admin/assessment-templates/[id]/versions/[versionId]/duplicate` — copies all content + reportConfig into a new row with `publishedAt=null`. `versionNumber = max(existing for template+language) + 1`. Returns new id; UI redirects to the editor.
- `GET /api/admin/assessment-templates/[id]/versions/[versionId]` — fetches version + parent template (hydrates the editor form).
- `PATCH /api/admin/assessment-templates/[id]/versions/[versionId]` — edits content on a draft only. **409 `ALREADY_PUBLISHED`** on published versions (content is immutable post-publish). Recomputes `contentHash` from the canonical helper so the audit trail stays valid.
- New page `/admin/assessment-templates/[id]/versions/[versionId]/edit` hosts `AssessmentVersionEditor.tsx` — a content-only twin of the new-template form. Hydrates server JSON tolerantly (anything missing falls back to defaults). Renders read-only when published (with a banner explaining the workflow).
- Template detail page rows gain Edit (draft only) + Duplicate (any) + Publish (draft only) buttons.

**Tests**: 6 new in `versions-edit-duplicate.test.ts` — GET cross-template 404, PATCH 409 on published, PATCH happy path with `contentHash` recompute + audit, POST duplicate 404 cross-template, POST duplicate happy path with `versionNumber` bump + audit. Combined with the prior 14 template CRUD tests, the admin template surface is now 20 tests covered. Full suite still green.

**Build gates**: both slices passed `CI=true npx next build --turbopack` (26.6s + 26.1s).

**Deferred**:
- Multi-language version forks (today the duplicate copies the source language; admins can't fork to a new language from the UI).
- Per-question type extensions (TEXT, MULTI_SELECT, etc.) — scoring engine only handles `SLIDER_LIKERT` today.

### 2026-05-18 — Assessment Tool v7.6 — Admin template editor MVP: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-template-editor-mvp -->

Closes the largest remaining gap in the Assessment Tool v7.6 arc. Before today, admins had to ask a developer to write a seed script every time they wanted to launch a new assessment template. With this MVP, admins can name + describe + paste-JSON-content a new template, see it in a versions list, edit metadata, and publish a draft version — all from the in-app admin UI. The full form-builder (question editor, scoring tier editor, drag-to-reorder sections) is a separate future slice.

**Routes**:
- `POST /api/admin/assessment-templates` — atomic transaction creates `AssessmentTemplate` + first `AssessmentTemplateVersion` (versionNumber=1, language="en" default, `publishedAt=null` draft). Canonical `contentHash` via the new shared helper. 409 on alias collision (caught from Prisma P2002 in the catch). 400 on Zod validation. Audit `'CREATE'`.
- `PATCH /api/admin/assessment-templates/[id]` — edit metadata only (name, description, invitationSubject, invitationBodyMarkdown, aggregationMode). **alias is intentionally immutable** (URL-stability invariant); content is version-locked. Audit `'UPDATE'`.
- `DELETE /api/admin/assessment-templates/[id]` — soft-delete via `deletedAt`. 409 `TEMPLATE_HAS_ACTIVE_CAMPAIGNS` if any DRAFT or ACTIVE campaign references the template (CLOSED campaigns are fine — historical data). Audit `'DELETE'`.
- `POST /api/admin/assessment-templates/[id]/versions/[versionId]/publish` — sets `publishedAt` + `publishedBy`. 409 `ALREADY_PUBLISHED` (idempotent at the route boundary). 404 if version is on a different template. Audit `'UPDATE'` on the version.

**Shared helper** — `src/lib/assessments/template-content-hash.ts`: pulled out of the seed script so the admin POST route and the seed script produce byte-identical `contentHash` values for the same canonical content. Fixed key order: `{ questions, sections, scoringConfig, reportConfig, invitationSubject, invitationBodyMarkdown }` → `JSON.stringify` → sha256 → hex. DO NOT pretty-print, sort, or add whitespace.

**UI**:
- `/admin/assessment-templates` — list page with table (name / alias / aggregation / per-row delete). "New Template" button (top-right). Soft-delete uses a window.confirm; 409 surfaces as a friendly toast ("Close all active campaigns on this template first").
- `/admin/assessment-templates/new` — single-form-page create flow. Metadata fields (name, alias with regex hint, description, language, aggregationMode, invitation subject + body) + 4 paste-JSON textareas (questions, sections, scoringConfig, reportConfig optional). Client-side `JSON.parse` per field with inline error banner before submit.
- `/admin/assessment-templates/[id]` — detail page with metadata view + inline edit panel (Save / Cancel-reverts), versions table (versionNumber / language / Draft|Published pill / contentHash prefix / per-row Publish button on drafts).
- Nav entry "Assessment Templates" added to the dashboard layout under "Aggregate Report".

**Prisma JsonNull**: the create route uses `Prisma.JsonNull` for the optional `reportConfig` field — Prisma's `InputJsonValue` rejects plain JS `null` for nullable Json columns under strict tsc. Caught by Vercel's TS pass, not local turbopack.

**Tests**: 14 new in `templates-crud.test.ts`:
- POST: 401 unauth, 403 non-admin, 400 zod, 409 alias collision (P2002), 201 happy path asserting both rows created + audit
- PATCH: 404 missing, 200 happy path with audit + correct fields written
- DELETE: 404 missing, 409 active-campaigns, 200 soft-delete + audit
- Publish: 404 missing, 404 cross-template, 409 already-published, 200 happy path with publishedAt/publishedBy + audit

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 41s. Commit `b9fe0ab`.

**Deferred (separate slices)**:
- Form builder for questions/sections/scoringConfig/reportConfig (paste-JSON for now).
- Adding new draft versions to an existing template (today the create flow always creates version 1; producing version 2+ needs a "duplicate version" action).
- Multi-language version forks.
- Translation workflow.

### 2026-05-18 — Assessment Tool v7.6 — Admin aggregate dashboard filters (Decision #8 MVP): <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-aggregate-filters -->

Decision #8 reserved this filter scope for day 1 but explicitly deferred it from the v1 MVP shape (template + version selector only). Now landed.

**Service** — `getAggregateReport(db, templateId, versionId, filters?)`:
- New optional 4th arg: `{ startDate?: Date | null, endDate?: Date | null, organizationId?: string | null }`.
- `organizationId` → added to `campaign` sub-where (`{ templateId, versionId, organizationId }`).
- `startDate` / `endDate` → built into a `submittedAt: { gte?, lte? }` clause on the top-level submission query. Only emitted when at least one is set, so the unfiltered call shape stays unchanged (existing 21 tests still green).

**API** — `GET /api/admin/assessments/aggregate?templateId=...&versionId=...&startDate=...&endDate=...&organizationId=...`:
- Date parsing accepts both `YYYY-MM-DD` and full ISO. 400 if a date param is present but invalid.
- Same params honored by `export.csv` and `submissions.csv` so CSV exports respect the current filter.

**UI** — `AssessmentsAggregateReport.tsx`:
- 3-column filter row below the existing template + version selectors: From date / To date / Organization select.
- Organizations sourced from `GET /api/organizations` (admin sees all). Best-effort; empty list just disables the dropdown.
- "Clear filters" link appears when any filter is set.
- ExportLink components forward `startDate` / `endDate` / `organizationId` into the CSV download URL.
- Report re-fetches on any filter change (added to the existing useEffect deps).

**Tests** — 3 new in `aggregate-report.test.ts`: organizationId WHERE plumbing, startDate+endDate `submittedAt` range, no-filter shape unchanged. 9/9 service-layer suite green; 21/21 across the 4 aggregate suites still green.

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 64s. Commit `bf099c0`.

### 2026-05-18 — Assessment Tool v7.6 — CEO designation post-creation: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-ceo-post-create -->

Coaches can mark a respondent as CEO after the wizard submit — previously this required discarding the draft and re-running the wizard. Real workflow gap for the `template.aggregationMode === CEO_ONLY` reports, where one designated respondent's submission carries the campaign result.

**API** — `POST /api/assessment-campaigns/[id]/ceo/route.ts`:
- Body `{ participantId: string | null }` Zod-validated (string → set as CEO, null → clear all designation).
- `canManageCampaign` mode `"write"` (404 on auth-fail, hidden — Task F pattern).
- 409 `CAMPAIGN_CLOSED` for CLOSED campaigns (results immutable — no point changing CEO after close).
- 404 if `participantId` does not belong to this campaign (cross-campaign defense).
- Transaction: `updateMany({ where: { campaignId, isCEO: true }, data: { isCEO: false } })` first (honors the partial unique index on `campaignId WHERE isCEO=true`), then `update({ where: { id: participantId }, data: { isCEO: true } })` if non-null.
- Audit `'UPDATE'` with `{ ceoChanged: true, previousCeoParticipantId, currentCeoParticipantId }`.
- Rate-limited via `RateLimits.standard`.

**UI** — `CampaignDetail.tsx`:
- Per-row "Mark as CEO" button (small underlined link style) appears next to the name when row is NOT the current CEO AND campaign is not CLOSED.
- Current CEO row shows the existing badge + a small "(clear)" link.
- Loading state: button shows `"Setting…"` while in-flight; disabled across rows during the network call.
- Success → toast + `refreshRespondents()` + `router.refresh()` so the badge appears/moves.

**Tests** — 7 new in `ceo-post.test.ts`: 401/404/400/409 paths, 404 cross-campaign, set-and-clear-prior happy path with audit assertion, null-clears-all-without-update happy path.

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 81s. Commit `af047f8`.

### 2026-05-18 — Ops fix: enable transactional email overrides in production (registration confirmation): <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:registration-email-overrides-enabled -->

**Symptom.** Jeff reported on a 9-min Zoom that the custom registration-confirmation email he authored at `/admin/transactional-emails/REGISTRATION_CONFIRMATION` was not being delivered — registrants received an older hardcoded version with different copy and styling. He also asked how to attach the `.ics` file and how to merge in the workshop's Zoom link.

**Root cause.** `composeRegistrationConfirmationEmail` ([src/src/lib/notifications/transactional-email-template.ts](../src/src/lib/notifications/transactional-email-template.ts)) opens with a Round-3 hardening kill switch:

```ts
function isOverrideEnabled() {
  return process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED === "true";
}
// ...
if (!isOverrideEnabled()) {
  return hardcodedDefaults(ctx);
}
```

The env var was never set in Vercel production (confirmed via `vercel env ls production`), so every registration-confirmation send — paid and free — short-circuited to `hardcodedDefaults()` and the DB-stored admin template was never read. Jeff's edits were saved correctly to the `TransactionalEmailTemplate` row (verified: `subject = "You're Registered: {{workshopTitle}}"`, body 1523 chars, `updatedAt 2026-05-18T20:28:45Z`) — the read path just never reached them.

**Fix.** Env-var-only change, no code:

```bash
echo "true" | npx vercel env add TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED production
npx vercel --prod --yes
```

Production deploy `pyghzkw2z` (56s build) → ● Ready. From this deploy onward, every registration confirmation reads the DB row, interpolates the supported tokens, and HTML-escapes registrant-controlled values (M3 security invariant from the original kill-switch implementation is preserved).

**Verified.**
- `vercel env ls production` shows `TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED` (Encrypted, Production scope).
- Latest two production deploys both ● Ready, post-dating the env-add timestamp.
- DB row for `emailType = "REGISTRATION_CONFIRMATION"` exists and is populated.

**Supported tokens on this template** (interpolator at [src/src/lib/notifications/transactional-email-template.ts:131-138](../src/src/lib/notifications/transactional-email-template.ts#L131-L138)): `{{workshopTitle}}`, `{{coachName}}`, `{{registrantName}}`, `{{registrantEmail}}`, `{{format}}`, `{{virtualLink}}`, `{{venueName}}`, `{{venueAddress}}`. All HTML-escaped.

**ICS attachment.** Already wired and not gated by this flag. The free-registration Inngest handler ([src/src/inngest/functions/handle-registration-created-free.ts:83-97](../src/src/inngest/functions/handle-registration-created-free.ts#L83-L97)) generates the `.ics` and passes it to `sendPaidRegistrationNotificationStrict` as an attachment — independent of the template body. So Jeff's custom body now goes out **with** the calendar file attached. The paid path follows the same code path post-payment.

**Open follow-ons for Jeff** (template content, not code):
- Add `{{virtualLink}}` to the body where the Zoom paragraph should land. Auto-populates from `Workshop.virtualLink` for virtual workshops; resolves to empty string for in-person.
- Conditional rendering ("only show this paragraph if virtual") is **not** supported by the current interpolator — it does simple `{{token}}` substitution only. If product wants a "join online" block to disappear for in-person workshops, that's a separate scope: either (a) extend the interpolator with `{{#if format=VIRTUAL}}...{{/if}}` syntax, or (b) maintain two templates and route by `workshop.format` at send-time.

**Why this slipped through.** The kill switch was added in Round 3 H1 hardening with the intent to gate the admin override behind a deliberate prod flip. The flag was tested ([src/src/__tests__/lib/transactional-email-template.test.ts:94](../src/src/__tests__/lib/transactional-email-template.test.ts#L94)) but the prod-side flip was never queued as an explicit follow-on, so it stayed off indefinitely. No runbook entry pointed to it either, so when Jeff edited the template at the admin URL the system gave no feedback that the edits weren't going live.

**No commit** — env-var change in Vercel only.

---

### 2026-05-18 — Assessment Tool v7.6 — Task O UI follow-on — wizard email customization panel: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-o-ui -->

Backend for per-campaign invitation email overrides shipped earlier today. Task O UI follow-on wires the inputs into the campaign-create wizard's Review step so non-developer coaches can actually use the feature without hitting PATCH manually.

**Wizard state**:
- `WizardState` gains `invitationSubject: string` + `invitationBodyMarkdown: string` (empty string default → omitted from payload → backend null → fallback to template default).
- Auto-save resume path (`Task K`) merges both fields when present in stored `stepsData`.
- Campaign-create POST sends `invitationSubject` / `invitationBodyMarkdown` only when trimmed value is non-empty; otherwise the keys are omitted entirely (matches the schema's `.optional().nullable()` shape).

**UI** (`ReviewStep`):
- New collapsible "Customize invitation email" panel sits between the campaign summary and the action buttons. Closed by default; the subhead text reads `"Custom subject/body set for this campaign"` when either field is set, or `"Optional — leave blank to use the template default"` otherwise.
- When expanded: token-reference hint listing the 5 supported tokens (`{{respondentFirstName}}`, `{{respondentFullName}}`, `{{campaignName}}`, `{{invitationUrl}}`, `{{closeAt}}`), subject input (200-char cap, validation mirrors backend Zod), and Markdown body textarea (5000-char cap with live count).
- Placeholder text on both fields: `"Leave blank to use template default"` (we intentionally do NOT fetch the template default — that would require a new GET endpoint and the placeholder is sufficient signal).

**Follow-on (same day, commit `815d3d2`) — `CampaignDetail` post-create edit panel**:
- `CampaignOverview.campaign` now surfaces `invitationSubject` + `invitationBodyMarkdown` (the `findUnique({ include })` already returned them; only the type signature needed plumbing).
- `CampaignDetail.tsx`: new collapsible "Invitation email" card above the respondents table, hidden when status is CLOSED. Subhead reads `"Custom subject/body set for this campaign"` or `"Using template default — click to customize"`.
- Edit form: same shape as the wizard panel (subject input 200-char + Markdown body 5000-char + 5-token reference hint + char counter). Save button is dirty-aware; Cancel reverts to last-saved.
- Hits `PATCH /api/assessment-campaigns/[id]` (Task O backend already accepted both fields). Empty values send `null` so the campaign falls back to the template default. `router.refresh()` on success so the subhead updates.

**Build gate** (combined slice): `CI=true npx next build --turbopack` ✓ compiled in 79s (CampaignDetail run) + 105s (wizard run). 18/18 campaign-detail suite + 17/17 reminders/freshness suites green.

### 2026-05-18 — P0 fix: decouple HubSpot sync from paid registration email path: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:paid-registration-email-hubspot-decouple -->

**Symptom.** Coach reported the post-registration "you're registered" confirmation email never arrived. Production DB inspection showed both recent paid registrations (`cs_test_…` checkout sessions, Stripe test mode) with `paymentStatus=COMPLETED` but `paymentProcessedAt=NULL` and `notificationSentAt=NULL`. Across the entire DB, **zero registrations had ever had `notificationSentAt` set** — the paid path had never delivered an attendee email end-to-end.

**Root cause.** `processPaymentCompleted` ([src/src/inngest/functions/process-payment-completed.ts](../src/src/inngest/functions/process-payment-completed.ts)) ran steps in order: `fetch → hubspot-sync → send-notification-strict → mark-processed`. The HubSpot step called `createOrUpdateContact` which sent `workshop_name` and `workshop_date` as Contact properties — but those custom properties don't exist on HubSpot portal `4727286`. HubSpot returned `400 PROPERTY_DOESNT_EXIST`, the step threw, Inngest retried 4× (all retries hit the same validation error), then dead-lettered the entire function run. The `send-notification-strict` step never executed.

**Live replay confirmed the diagnosis.** Manually invoking `syncHubSpotIfMissing` against the most-recent stuck registration surfaced the exact `PROPERTY_DOESNT_EXIST` error; manually invoking `sendNotificationWithAtomicClaim` for the same row delivered all 3 emails (admin notification, coach notification, attendee confirmation with .ics attachment) successfully.

**Recovery (operational).** For the 2 stuck rows (`cmpbklvm4000o3uf21q0t6mli`, `cmpbkvfes00103uf2pfvli03u`), ran the notification helper directly to deliver the emails and set `paymentProcessedAt` so Inngest won't replay them.

**Fix (code).** Wrap the `step.run("hubspot-sync", …)` body in a try/catch that swallows + logs the error and returns `{ skipped: true, error }`. HubSpot is best-effort CRM sync and must not block transactional email delivery. Notification + mark-processed now execute even when HubSpot fails. Pattern mirrors the FREE-path HubSpot call which already uses `.catch((err) => console.error(…))` ([src/src/app/api/workshops/[id]/register/route.ts](../src/src/app/api/workshops/%5Bid%5D/register/route.ts)).

**Followups (not in this change).**
- The two missing HubSpot Contact properties (`workshop_name`, `workshop_date`) still get sent on every paid + free registration and will keep logging 400s until either (a) the properties are created in HubSpot portal `4727286` or (b) the fields are dropped from the `createOrUpdateContact` call sites. Cosmetic now that the step no longer throws, but worth cleaning up.
- The `step.run("hubspot-sync")` ghost-success: when the inner try/catch swallows, Inngest sees the step as succeeded. If we ever want HubSpot sync to retry on transient failures (without blocking email), we'd need a separate child function with its own retry policy.

**Test coverage.** Added regression test `HubSpot step: failure does not block email send or mark-processed` to [src/src/__tests__/inngest/process-payment-completed.test.ts](../src/src/__tests__/inngest/process-payment-completed.test.ts) — asserts `createOrUpdateContact` rejecting still results in `sendPaidRegistrationNotificationStrict` being called and `paymentProcessedAt` being set. Full suite: 10/10 green.

**Commit.** `2d4c604` (pushed direct to main).

---

### 2026-05-18 — Assessment Tool v7.6 — Task O — per-campaign invitation email overrides: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-o -->

Coaches can override the default invitation subject + body on a per-campaign basis. Before today, the only way to customize was at the `AssessmentTemplate` level — a single shared default across every campaign that used the template. Task O makes the override campaign-local.

**Schema**:
- `AssessmentCampaign.invitationSubject String?`, `AssessmentCampaign.invitationBodyMarkdown String?` (both nullable; `null` = use template default).
- Migration `20260518160000_add_campaign_invitation_overrides`.

**Validation**:
- `createAssessmentCampaignSchema`: accepts optional `invitationSubject` (≤200 chars) + `invitationBodyMarkdown` (≤5000 chars), both nullable.
- `updateAssessmentCampaignSchema`: same fields for PATCH (any-status — does not require DRAFT, since editing the reminder email body should be allowed on ACTIVE campaigns too).

**Route changes**:
- Campaign-create route persists both fields (defaults to `null`).
- Campaign PATCH route writes both fields when present.
- `invite` route and `reminders` route at the email call site:
  ```ts
  template: {
    invitationSubject:
      campaign.invitationSubject ?? campaign.template.invitationSubject,
    invitationBodyMarkdown:
      campaign.invitationBodyMarkdown ??
      campaign.template.invitationBodyMarkdown,
  }
  ```
  (Both routes already used `findUnique({ include })` so the new scalar fields flow through automatically without changing the query shape.)

**Tests**: 2 new in `reminders-post.test.ts` — `"Task O — campaign overrides take precedence over template defaults"` and `"Task O — null overrides fall back to template defaults"`. 13/13 suite green.

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 4.2min. Commit `3fee453`.

**Deferred**:
- **Wizard UI for editing overrides** — backend + fallback ship now. Coaches can edit via PATCH today (e.g. from a future detail-page form). The wizard "Review" step should grow a small textarea pair in a follow-up slice.
- **No Markdown preview in the UI** when added — the existing helper does minimal HTML escaping + paragraph splitting. If product wants WYSIWYG, that's a separate scope.

### 2026-05-18 — Coach cert auto-promote — PENDING → ACTIVE on first workshop-type grant: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:coach-cert-autopromote -->

Closes a long-standing gap in the coach approval flow surfaced via the admin coaches page: coaches were stuck at `certificationStatus = "PENDING"` indefinitely because nothing in the app ever wrote that field after creation. The signup route (`POST /api/auth/coach-signup`) and admin coach-create (`POST /api/coaches`) both hardcode `"PENDING"`, `updateCoachSchema = createCoachSchema.partial()` doesn't include the field, and the coach-edit UI exposes no status control. The only existing `ACTIVE` rows in prod came from seed scripts or direct SQL — every coach who joined via the canonical flow showed PENDING beside their granted workshop-type cert chips. Fix: auto-promote on first cert grant.

- **Route change** — `src/src/app/api/coaches/[id]/certifications/route.ts` (POST handler): after the pre-flight duplicate check, if the loaded coach's `certificationStatus === PENDING_STATUS` (canonical constant from `lib/auth/coach-status.ts`) the cert create + a `coach.updateMany({ where: { id, certificationStatus: PENDING }, data: { certificationStatus: ACTIVE } })` flip run inside a single `db.$transaction([...])`. Non-PENDING coaches (ACTIVE / DEACTIVATED) skip the transaction and the route falls through to the plain cert create. DEACTIVATED is intentionally NOT promoted — reactivation must be explicit.
- **Race-guard** (Codex high-severity finding): the `updateMany` predicate filters on `certificationStatus: PENDING` so a concurrent DEACTIVATE between the pre-transaction read and the transactional write produces `count: 0` (no-op) rather than silently overwriting the deactivation. `promotion.count === 1` is required to emit the status-delta in the audit log; on `count: 0` the audit row only records `certificationAdded` with no status transition claim.
- **P2002 → 409** (Codex medium-severity finding): a concurrent grant that races past the preflight duplicate check now lands on the `@@unique([coachId, workshopTypeId])` constraint. The top-level catch detects `Prisma.PrismaClientKnownRequestError` with `code === "P2002"` and returns the same `409 "Coach already has this certification"` response shape as the preflight path — no more generic 500 on a concurrency loss.
- **Audit log** (Codex medium-severity finding): `logAudit({ entityType: "Coach", entityId: coachId, action: "UPDATE", performedBy: actor.email, changes })` fires on every successful grant. `changes` always includes `certificationAdded: workshopTypeId`; on promotion it also includes `certificationStatus: { from: "PENDING", to: "ACTIVE" }`. Fires AFTER the transaction so a failed grant never leaves a phantom audit row.
- **Tests** — `src/src/__tests__/api/coaches-certifications-auto-promote.test.ts` (8 cases, 246 lines): PENDING promotion happy path with sentinel-mocked `$transaction` args asserted in order, race-guard no-op when `updateMany.count === 0`, transaction-rejection returns 500 with no echoed cert and no audit row, already-ACTIVE skip, DEACTIVATED no-promote, pre-flight 409, P2002 in-catch 409 (via inline-mocked `PrismaClientKnownRequestError`), and 404 on missing coach.
- **Commits**: `94f067f` (feature) + `152efee` (Codex hardening pass).
- **Verification**: Turbopack build green on both commits, 8/8 auto-promote tests + 1740/1741 full suite green (the 1 fail is the known `registration-form-redirect.test.tsx` 5s timing flake — passes in isolation). Vercel deploy `rbrdxqb8w` Ready in 58s.
- **Coach Detail / Coaches list UI** unchanged — the existing PENDING/ACTIVE badge logic already reads `coach.certificationStatus`, so the next granted cert now flips the pill automatically.

---

### 2026-05-18 — Assessment Tool v7.6 — Tasks M + N — bulk CSV import + reminder emails: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-tasks-m-n -->

Two follow-on slices that close real workflow gaps coaches hit at scale: roster bulk-import (so big-org coaches don't click 50× to add respondents) and a single button to re-prompt invited participants who haven't yet submitted.

**Task M — Bulk respondent CSV import**

Pure parser, idempotent route, two UI surfaces (wizard + post-create modal).

- **Parser** — `src/src/lib/assessments/respondent-csv.ts` (194 lines): headers required (`name,email[,team]`, case-insensitive), Zod email validation per row, `/`-delimited team path, dedupe-on-email (first occurrence wins), 500-row cap with truncation errors emitted for rows 501+, RFC-friendly CSV parsing (handles quoted fields with embedded commas). Pure function returning `{ rows, errors }` — no I/O.
- **API** — `POST /api/organizations/[id]/respondents/bulk/route.ts` (399 lines): body `{ rows, mode: 'skip' | 'merge' }` Zod-validated, ownership gate (`organization.ownerCoachId === actor.coachId`), 500-row server-side cap (422 if exceeded). Wraps the batch in a single Prisma transaction. Returns ARRAYS `{ created: [{id, email}], updated: [{id, email}], skipped: [{email}], errors }` rather than bare counts — caller needs IDs to chain participant-add calls. Audit `'CREATE'` with summary counts. Rate-limited `RateLimits.standard`.
- **Campaign-create route extension** — accepts optional `bulkRespondents: Array<{name, email, teamPath}>` field. Server-side processes alongside the existing single-respondent list; same skip-on-email-conflict semantics. Teams auto-created via `buildTeamPath`.
- **UI 1 (CampaignDetail Add modal)**: new "Bulk CSV" tab next to "Single". Paste textarea OR live-preview table OR per-row error highlight (`text-destructive`). Conflict-mode radio (Skip / Merge, default Skip). Submit chains bulk-create → loop participant-add (Task L's `POST /respondents`) with `"Adding N of M…"` progress text. Final toast + modal close + respondents refetch.
- **UI 2 (CampaignWizard respondents step)**: inline panel (not modal — wizard) for paste-preview-submit. Rows stored in wizard state's `bulkRespondents` field; processed at final wizard submit by the extended campaign-create route.
- **Tests**: 36 new across 2 suites (`respondent-csv.test.ts` 25 cases, `respondents-bulk-post.test.ts` 11 cases).
- **Vercel-only TS hotfixes** (`fb42efc` + `0c84b24`): the `(await tx.orgTeam.create(...)) as TeamRow` pattern triggers `'implicitly has type any because it is referenced directly or indirectly in its own initializer'` under Vercel's strict tsc but passes the local turbopack build. Fix: explicit annotation `const created: TeamRow = (await ...) as TeamRow`. Applied in both `assessment-campaigns/route.ts:407` and `respondents/bulk/route.ts:203`.

**Task N — Reminder emails for non-responders**

Reuses Task D's invitation infrastructure; adds a single-click bulk action.

- **API** — `POST /api/assessment-campaigns/[id]/reminders/route.ts` (340 lines): body `{ participantIds?: string[] }` — omitted means "all pending non-submitted, non-revoked, non-soft-deleted participants". `canManageCampaign` gate (404 on auth-fail). 409 `CAMPAIGN_NOT_ACTIVE` on DRAFT/CLOSED. **Token rotation**: reuses the existing invitation row id and `expiresAt`/status, but rotates the cryptographic token (mirrors `/resend` route's security model — `tokenHash` is one-way, so the prior raw token is invalidated). Per-participant skips logged in audit; SMTP failure on one participant does NOT 500 the batch. Returns `{ sent, skipped, failed: Array<{participantId, reason}> }`. Audit action `'INVITE'`. Rate-limited.
- **UI** — `CampaignDetail.tsx`: new "Send Reminders" header button (visible only when `campaign.status === 'ACTIVE'`). Click → `window.confirm` with pending-count → POST → toast `"Sent X, skipped Y, failed Z"` + respondents refetch. Per-row Resend button already shipped in Task D — Task N adds the bulk action only.
- **Tests**: 11 new in `reminders-post.test.ts` covering bulk + single + skip-submitted + skip-no-invitation + skip-revoked + 409-not-active + auth + SMTP-failure-continues + all-skipped happy path.

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in ~5min. Task M deploy `rbrdxqb8w-chief-aio-fficer.vercel.app` ● Ready in 58s; Task N deploy `41f259f` pending. 1738 / 1738 tests green across 204 suites (up from 1691).

**Concerns (deferred)**:
- Task M wizard preview has no inline-edit (typos require re-paste). Gold-plate skipped.
- Task N reminder email body uses the Task D template verbatim — no "Reminder:" prefix differentiation yet. Acceptable for v1; product can iterate.
- A parallel session shipped unrelated coach-cert-autopromote work (`94f067f`) and repeatedly stashed Task M files mid-session as "park unrelated changes". Recovered via `git stash` reflog (`stash@{0}^3` for untracked, `stash@{0}` for tracked). No data lost.

### 2026-05-18 — Assessment Tool v7.6 — Task L — post-creation participant management: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-l-participant-mgmt -->

Closes a real workflow gap: coaches can now add a forgotten respondent or remove a stale one after creating a campaign, without having to discard and recreate. Builds on Task D's invitation token system + Task F's CampaignDetail UI.

**API**:
- `POST /api/assessment-campaigns/[id]/respondents` — body `{ orgRespondentId }` Zod-validated. Auth via `canManageCampaign` (404 on auth-fail). Error matrix: 409 `ALREADY_PARTICIPANT`, 422 `WRONG_ORGANIZATION`, 409 `CAMPAIGN_CLOSED`. On success: transaction creates `AssessmentCampaignParticipant` row, snapshots `teamPath` via the shared `buildTeamPath` helper, AND — only when `campaign.status === 'ACTIVE'` — mints a PENDING `AssessmentInvitation` row (token + sha256 hash via Task D's `invitation-tokens.ts` helper; SMTP send NOT triggered here — coach uses the existing Resend button). DRAFT campaigns intentionally skip invitation creation. Audit log action `'CREATE'`. Rate-limited via `RateLimits.standard`.
- `DELETE /api/assessment-campaigns/[id]/participants/[participantId]` — auth via `canManageCampaign`. 404 on missing-participant or campaignId mismatch. 409 `ALREADY_SUBMITTED` when any `AssessmentSubmission` row exists for `(campaignId, respondentId)` — results are immutable. On success: transaction `deleteMany` on invitation rows (covers 0-or-1) then `delete` on the participant row. Audit `'DELETE'`. Returns 204. Rate-limited.

**Schema cascade finding**: `AssessmentCampaignParticipant`, `AssessmentInvitation`, `AssessmentSubmission` relations have **no `onDelete: Cascade`** in `prisma/schema.prisma`. The DELETE route therefore deletes invitation rows explicitly inside a transaction; submissions are guarded by the 409 check.

**UI — `CampaignDetail.tsx`**:
- "Add Respondent" button above respondents table, hidden when `campaign.status === 'CLOSED'`.
- Add modal: select from existing org respondents (filtering out current participants), OR inline "Create new respondent" form that posts to `/api/organizations/[orgId]/respondents` then auto-selects the new ID.
- Per-row Trash icon hidden when `hasSubmission || invitation.status === 'SUBMITTED' || campaign.status === 'CLOSED'`. Confirm dialog → DELETE → re-fetch respondents + `router.refresh()` so the stats card updates.

**Tests**: 19 new (11 in `respondents-post.test.ts` + 8 in `participants-delete.test.ts`). Full project suite **1691 / 1691 green across 202 suites** (up from 1672).

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 55s. ESLint clean on 5 changed files. Commit `2de6786`, Vercel `ngvosvan4-chief-aio-fficer.vercel.app` ● Ready in 1m.

**Concerns (deferred)**:
- POST does NOT send SMTP — only mints a PENDING invitation. Coach uses Resend button. Keeps single-add fast and out of Vercel's 30s SMTP budget.
- Used "submission exists" as immutability guard (schema has no `scoredAt` — spec referenced it but only `submittedAt` exists). Stricter than scoredAt-based gating, matches spirit.

### 2026-05-18 — Assessment Tool v7.6 — Task K — campaign wizard auto-save drafts: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-k-wizard-drafts -->

Wizard UX gap closed: coaches who walk away mid-creation can now resume where they left off. Mirrors the existing `WorkshopDraft` pattern verbatim (same upsert contract, same `coachId`-unique gating) so future maintainers have a stable precedent.

**Schema**:
- New model `CampaignWizardDraft` (`@@map("assessment_campaign_wizard_drafts")`) with `coachId` as a unique foreign key to `coaches(id)` with `ON DELETE CASCADE`. Stores `currentStep` (Int, default 1), `stepsData` (TEXT, JSON-stringified wizard state), `lastSavedAt`, `createdAt`, `updatedAt`.
- Back-relation `campaignWizardDraft CampaignWizardDraft?` on `Coach`.
- Migration `20260518130000_add_campaign_wizard_draft` (raw SQL: CREATE TABLE + unique index + FK).

**API — `/api/assessment-campaign-drafts/route.ts`** (153 lines):
- `GET` — `findUnique` by coachId; returns the draft or `null`.
- `PUT` — `{ step, data }` Zod-validated, upsert by `coachId`. Returns `{ success: true, draftId }`. Rate-limited via `RateLimits.standard`.
- `DELETE` — `deleteMany` (no-op if no row). Returns `{ success: true }`. Rate-limited.
- Auth pattern uses `getApiActor()` + `actor.coachId` gate (matches `assessment-campaigns/route.ts`) — deliberately NOT `requireCoach()` because that helper calls `redirect()` which is unsafe inside API routes. Returns 401 (unauthenticated) / 403 (non-coach actor).

**UI — `CampaignWizard.tsx`** (+244 net lines):
- Resume banner above wizard: `"Resume your draft? Last saved {formatDistanceToNow}. [Resume] [Discard]"`. Resume hydrates state via `JSON.parse(draft.stepsData)`, jumps to `draft.currentStep`. Discard fires `DELETE` and starts fresh.
- Debounced 800ms auto-save during field edits. Immediate flush on step transitions (back/next).
- Subtle "Saving…" / "Saved Xs ago" indicator in wizard header (uses `useMemo` for the timeago text).
- Clear-on-submit: successful campaign creation fires `DELETE` so the next campaign starts blank.
- Defensive parse: `JSON.parse` wrapped in try/catch — on failure, treats as no draft AND fires `DELETE` to clean up the corrupt row.

**Tests**: 15 new cases in `src/src/__tests__/api/assessment-campaign-drafts.test.ts` (GET null/200 paths, PUT create + update + validation, DELETE idempotent, 401/403 on unauth/non-coach, corrupt-data handling). Full suite 1672/1672 passing (200 suites; up from 1657).

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 41s. ESLint 0/0 on changed files. Deploy: commit `fbd6e94`, Vercel `crr3v4ixv-chief-aio-fficer.vercel.app` ● Ready in 57s.

**Known follow-on (deferred)**: `stepsData` has no schema version. Future wizard schema changes that add new fields will load old drafts with default values for the new fields — acceptable today; a `version` field is the obvious upgrade path if step shapes start to drift incompatibly.

### 2026-05-18 — Assessment Tool v7.6 — Tasks I + J — campaign status transitions + CSV exports: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-tasks-i-j -->

Two polish slices on top of the Tasks A–H arc, plus three Vercel-only hotfixes for staging-miss bugs across the session. v1 implementation now covers daily-ops + reporting.

**Task I — Campaign status transitions**:
- `POST /api/assessment-campaigns/[id]/close` — DRAFT|ACTIVE → CLOSED with optional `reason` (≤500 chars, audit-logged). `canManageCampaign` gate (404 on auth-fail). 409 if already CLOSED. Tolerant body parser (missing/empty/bad-JSON → `{}`, only well-formed schema-failing body 400s).
- Close button on `/portal/assessments/[id]`: label adapts by status — "Discard Draft" (destructive variant) for DRAFT, "Close Campaign" (outline + destructive text) for ACTIVE, HIDDEN when CLOSED. Confirmation dialog with optional reason textarea, spinner during request, toast on success/failure.
- Status filter pills on `/portal/assessments` landing: All / Draft / Active / Closed with per-status counts. Client-side filter, empty state when filtered to zero.
- 18 new tests (3 suites): close-route 7 + campaign-detail-close-button 6 + portal-assessments-status-filter 5.

**Task J — CSV export endpoints + UI download buttons**:
- 4 new audit-logged, rate-limited routes:
  - `GET /api/assessment-campaigns/[id]/respondents/export.csv` — coach/admin, per-respondent summary.
  - `GET /api/assessment-campaigns/[id]/respondents/[rid]/result/export.csv` — coach/admin, per-question shape joined to version sections + questions.
  - `GET /api/admin/assessments/aggregate/export.csv?templateId=&versionId=` — admin only, summary stats block + per-section means block separated by blank line.
  - `GET /api/admin/assessments/aggregate/submissions.csv?templateId=&versionId=` — admin only, one row per submission with dynamic `Section_S{n}_Total` columns from `version.sections`. CEO joined from `AssessmentCampaignParticipant`.
- UI wiring on `CampaignDetail.tsx` (header export + per-row download) and `AssessmentsAggregateReport.tsx` (two export buttons under selectors, disabled when selector empty). Native `<a download>` links; no JS state.
- AuditAction extended with `'EXPORT'` (mirrors recent `'CLOSE'` addition).
- 17 new tests (4 suites): respondents-export 4 + per-respondent result export 4 + aggregate summary export 5 + aggregate submissions export 4. Each asserts Content-Type, Content-Disposition filename pattern, and a sample data row.

**Hotfixes shipped in the same window** (Vercel-only catches — local builds passed):
1. `Prisma.sql` arg vs tagged template (Task A audit). `tx.$executeRaw(Prisma.sql\`…\`)` → `tx.$executeRaw\`…\`` across 5 call sites. Jest mocks hid the type error.
2. Missing `org-survey-client.tsx` (Task D). Untracked new file not in the staging path list; Turbopack on Vercel fails fast on missing modules; webpack lazy-resolves.
3. Missing `CampaignsListWithFilter.tsx` (Task I-1). Same pattern.
4. Missing `'CLOSE'` in `AuditAction` union (Task I-2). MODIFIED existing service-layer file (`src/lib/audit.ts`), not a new file. The grep-imports rule from `feedback_turbopack_build_gate` only caught NEW untracked files; this was a modified one. Memory updated to default to `git add -A` + visual review of `git diff --cached --stat`.

**Tests**: 1657 passing across 199 suites (up from 1622 after Task H). 35 new tests across 7 suites for Tasks I+J. Zero regressions.

**Discipline**: pre-push gate stays `CI=true npx next build --turbopack`. Staging discipline expanded — default to `git add -A` for subagent work, review the staged diff, never rely on a hand-curated path list.

---

### 2026-05-18 — Assessment Tool v7.6 — Task H coach trends/longitudinal page (Wave 1 wireframe 10 made real — year-over-year composite-score line + per-section trend table + per-question sparkline grid): <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-h-trends -->

Coach picks (template, organization) at `/portal/assessments/trends` and sees year-over-year score progression across all their campaigns for that pair. Closes the v1 "year-over-year" feature gap that's the entire reason for Issue #10.

**Service** (`src/lib/assessments/trends.ts`):
- `getLongitudinalTrend(db, templateId, organizationId)` — resolves the latest published version of the template; partitions campaigns into included (latestVersion) vs excluded (older versions); builds per-campaign series + per-question sparkline series + means.
- v1 single-version constraint enforced server-side (older-version campaigns excluded + counted; banner surfaces in UI).
- Reads `submission.result` frozen — no recomputation.
- Composite score per v7.1 spec: uses `tierMetricValue` (per-template metric), NOT blind mean of numeric answers.

**Backend**:
- `GET /api/assessment-templates/[id]/longitudinal?organizationId=…` — coach can query if they own the org (canAccessOrganization); admin/staff bypass. 400 if organizationId missing; 401/404/200 otherwise.

**UI**:
- `/portal/assessments/trends` server page — selectors form if templateId/organizationId not yet picked; otherwise fetches via service helper and hands off to client component.
- `CampaignTrendsView` client component — three states:
  - **Zero campaigns**: empty card linking to `/portal/assessments/new`.
  - **Single campaign**: stats card + banner "Trends require 2+ campaigns for the same template + org. Run another to see comparison."
  - **Multi-campaign (≥2)**: SVG composite-score line chart (X=campaign openAt, Y=mean countAchieved) with dots + axis labels; per-section trend table (rows S1–S10, columns = campaigns, cells color-shaded green/yellow/red by improvement vs prior campaign); collapsible per-question sparkline grid (40 mini-charts for Rockefeller).
- "View Trends" link added to `/portal/assessments/[id]` (Task F detail page) — deep-links with prefilled templateId + organizationId.

**Type addition**: `CampaignOverview.campaign` gains `templateId` + `organizationId` (purely additive; needed for the deep-link).

**Tests**: 19 new across 3 suites (trends service 9 + longitudinal route 5 + CampaignTrendsView component 5). Full suite: 1622 passing (was 1603), zero regressions. `CI=true npx next build --turbopack` green locally.

**Deferred to v1.5** (per spec, locked decisions):
- Team/participant filter dropdown (team-slicing is v1.5 across all surfaces, same as aggregate report)
- TEXT / NUMBER / COMPOUND question-type panels (only Rockefeller exists today; those types ship with Vision Alignment / QSP v2 seed when Jeff signs off content)
- YoY / QoQ delta cards

---

### 2026-05-18 — Assessment Tool v7.6 — Task G admin AccessGroup management UI (closes ops gap; wires Wave 5 wireframes 21 + 22 to real product): <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-g-access-group-ui -->

Admin can now create, edit, archive AccessGroups and add/remove coaches + templates via the app — no more manual scripts. Wires Wave 5 wireframes 21 (list) + 22 (detail with evaluateAccessChange preview) into the real product on top of Task A's service-layer transactional guard.

**Backend** (9 new admin-only routes; every membership mutation routes through `evaluateAccessChange` inside `$transaction` for advisory lock + SELECT FOR UPDATE + audit):
- `POST/GET /api/admin/access-groups` — create + list (with `?includeArchived=true` to include soft-deleted)
- `GET/PATCH /api/admin/access-groups/[id]` — detail (with `_count` + populated joins) + name/description update
- `POST /api/admin/access-groups/[id]/archive` — soft-delete
- `POST/DELETE /api/admin/access-groups/[id]/coaches[/coachId]` — add/remove coach membership; DELETE returns 409 BLOCKED_ZERO_ACCESS with diff payload unless `?force=true&forceReason=…`
- `POST/DELETE /api/admin/access-groups/[id]/templates[/templateId]` — add/remove template; same BLOCKED_ZERO_ACCESS + force pattern
- `POST /api/admin/access-groups/[id]/preview-change` — DRY-RUN endpoint that wraps `evaluateAccessChange` in a rolled-back transaction; returns the per-coach BEFORE/AFTER diff for the UI to render in a modal BEFORE the actual mutation; writes no audit logs
- `GET /api/admin/coaches` — autocomplete with `?search=…` + `?excludeGroupId=…`

**UI**:
- Added `Access Groups` entry to admin sidebar (adjacent to `Aggregate Report`)
- `/admin/access-groups` — list table (Name | Description | Coach count | Template count | Updated | Manage chevron) + create dialog + show-archived toggle + INTERSECTION info banner
- `/admin/access-groups/[id]` — detail page with metadata card, coaches table, templates table, Add buttons opening autocomplete dialogs, archive button
- `AccessGroupPreviewModal` — two-stage flow: stage 1 shows per-coach BEFORE/AFTER effective-template diff (red-highlight coaches dropping to zero); stage 2 (only on 409 BLOCKED_ZERO_ACCESS) requires non-empty forceReason free-text and re-calls with `?force=true`
- `CoachAutocomplete` + `TemplateAutocomplete` — reusable type-ahead pickers

**Tests**: 35 new across 6 suites. Full suite: 1603 passing (was 1568), zero regressions. `CI=true npx next build --turbopack` green locally.

**Deferred to v1.5** (per spec):
- Archive/undelete/hard-delete with full evaluateAccessChange preview UX (current archive button does plain soft-delete; full preview ships when archive UX is designed)
- Bulk-add certified coaches affordance from wireframe 22 (separate confirmation/preview flow needed)
- Click-to-edit inline metadata (shipped as `Edit Metadata` dialog instead per shadcn idiom)

---

### 2026-05-18 — Assessment Tool v7.6 — Implementation arc Tasks A–F (service layer → coach portal → INVITED flow → admin aggregate → campaign detail): <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-implementation-tasks-a-f -->

Full v1 INVITED loop now operational on prod. Coach creates an organization, runs the 5-step campaign wizard, activates a Rockefeller campaign, respondents get magic-link emails, fill the 40-question survey, submit, scoring runs server-side and stores a frozen `result` JSON, coach views completion + inline results on the campaign detail page, admin sees aggregate stats across all submissions.

**Task A — Service-layer foundation** (commit `62c7af3`):
- `lib/auth/coach-status.ts` — `CERTIFIED_STATUS = "ACTIVE"` canonical constant + `isCertified()` helper
- `lib/auth/access-policy-version.ts` — runtime `ACCESS_POLICY_VERSION` env reader (intersection | union | shadow-union)
- `lib/assessments/errors.ts` — typed error classes with `code` discriminators (no HTTP coupling)
- `lib/assessments/access-control.ts` — `canAccessTemplate` (INTERSECTION), `canAccessOrganization`, `canCreateCampaign`, `canManageCampaign`
- `lib/assessments/evaluate-access-change.ts` — pre-save guard with `pg_advisory_xact_lock` + SELECT FOR UPDATE + BLOCKED_ZERO_ACCESS path
- `lib/assessments/transfer-ownership.ts` — admin org transfer with cascading campaign updates + `OrganizationOwnershipEvent` audit
- 72 new tests (5 suites)

**Task B — Organization + Team + Respondent CRUD APIs** (commit `c80540c`):
- 13 endpoints under `/api/organizations/...` (orgs + nested teams + nested respondents).
- `POST /organizations` resolves coach from actor.coachId, sets `ownerCoachId` self. Admin/staff list all; coach lists owned only.
- Composite dedupe for OrgRespondent via `(organizationId, dedupeSource, dedupeValue)`; P2002 → 409 with existing id.
- Team tree-shape listing; cycle detection on PATCH parentTeamId; refuse DELETE on parents of non-deleted children.
- `canAccessOrganization` returns 404 (not 403) on auth-fail to prevent ID enumeration.
- 52 new tests (3 suites)

**Hotfix #1** (commit `6b63783`): Prisma `Sql` arg vs tagged-template — Task A's `tx.$executeRaw(Prisma.sql\`…\`)` failed Vercel's strict Turbopack TS. Switched 5 call sites to tagged-template `tx.$executeRaw\`…\``. Test mocks hid the type error; only `next build` caught it.

**Task C — Coach portal + 5-step campaign wizard** (commit `1d7e452`):
- Added `Assessments` entry to coach portal sidebar (between My Workshops + Registrations).
- `/portal/assessments` landing page — empty-state CTA + table of this coach's campaigns.
- `/portal/assessments/new` — 5-step wizard (Organization → Template → Participants → Schedule → Review). Steps 0 and 2 have inline `+ New …` forms so the coach can seed org + respondents without leaving the wizard.
- Backend: 5 new routes (`POST/GET /api/assessment-campaigns`, `GET/PATCH /api/assessment-campaigns/[id]`, `POST/DELETE /api/assessment-campaigns/[id]/participants`, `POST /api/assessment-campaigns/[id]/activate`, `GET /api/assessment-templates` INTERSECTION-filtered).
- Step 1 template list is server-side filtered via `canAccessTemplate` — never exposes unfiltered list to client.
- CEO uniqueness enforced via Zod (refuses 2+ in payload) + service-layer swap in same tx when re-assigning.
- 44 new tests (5 suites)

**Task D — INVITED participant magic-link flow** (commit `0820234` + hotfix `58fd1ec`):
- Iron-session cookie auth, path-scoped to `/org-survey/${campaignAlias}`, ttl 1800s. `ASSESSMENT_SESSION_SECRET` provisioned in Vercel prod env.
- Token helpers: random 32B base64url; sha256 stored to DB; `crypto.timingSafeEqual` compare; token in URL fragment (`#t=…`), client clears via `history.replaceState`.
- `POST /api/assessment-campaigns/[id]/invite` — idempotent batch (cap 25); sends via existing SMTP transport; PENDING→SENT on 2xx.
- `POST /api/assessment-campaigns/[id]/invitations/[iid]/resend` — same token (no rotation), increment resentCount.
- 4 public routes under `/org-survey/[campaignAlias]/`: page.tsx (client) + exchange/me/submit/thank-you.
- Lifecycle gate on every cookie-bearing route (re-fetch invitation + campaign each call; 410 on revokedAt, expired, SUBMITTED, status≠ACTIVE, time-window miss).
- Strict v6.6 answer validation; `SELECT FOR UPDATE` on submit; 409 on double-submit; calls `scoreSubmission()` and stores frozen `result`.
- Middleware allowlist updated at BOTH insertion points (authorized callback + body allowlist).
- `Cache-Control: no-store` + `Referrer-Policy: no-referrer` on the survey page; no-store on the 3 JSON responses.
- 37 new tests (5 suites)
- Hotfix: `org-survey-client.tsx` was untracked in the initial commit; `next build --webpack` lazy-resolved it locally, Turbopack on Vercel failed fast.

**Task E — Admin aggregate dashboard** (commit `bd713f2`):
- New `Aggregate Report` nav entry in admin sidebar (between Surveys + Files).
- `/admin/assessments/aggregate` page — template + version selectors only (MVP scope per locked decision 8; time-range / group / per-org filters deferred to v1.5).
- Yellow info banner: "Admin bypasses CEO_ONLY anonymity in aggregate" (operator-mode bypass).
- 4 stat cards + tier histogram (semantic-token colored bars) + per-section means table + SVG sparkline of submissions over time + empty state.
- Reads `submission.result` (frozen at submit) — no recomputation.
- 3 admin-only API endpoints (`/api/admin/assessments/aggregate`, `/api/admin/assessment-templates`, `/api/admin/assessment-templates/[id]/versions`).
- Service helper `lib/assessments/aggregate-report.ts` does in-memory aggregation (fine for v1 scale).
- 17 new tests (4 suites)

**Task F — Coach campaign detail page** (commit `88c6d91`):
- Replaced placeholder `/portal/assessments/[id]` with the real daily-ops surface.
- Overview card (campaign name + status pill + template + org + schedule + stats: totalParticipants / invited / viewed / submitted / completionPct).
- Respondents table — per-row participant + invitation status pill + sent/submitted timestamps + CEO badge + actions.
- "View results" action lazy-loads `submission.result` from a new GET endpoint and inline-expands `<AssessmentResultView>` panel (tier banner + per-section table + per-question collapsible detail).
- "Resend invite" action wires existing resend route (only enabled for PENDING/SENT/VIEWED, not revoked; double-click protected; optimistic resentCount bump).
- Service helper `lib/assessments/campaign-detail.ts` — pure aggregation against a narrow Db interface (testable, no DB). Revoked invitations excluded from "invited" stat but still surfaced in the row for future revoke-affordance.
- 2 new admin-only API routes (`/api/assessment-campaigns/[id]/respondents`, `/api/.../respondents/[rid]/result`) — 404 (not 403) on auth-fail to prevent campaign-ID enumeration.
- 31 new tests (4 suites)

**Tests**: 1568 passing across 184 suites (up from 1310 on the foundation-slice commit). 213 new tests added over Tasks A–F. Zero regressions.

**Discipline lesson banked**: pre-push gate is now `CI=true npx next build --turbopack` (matches Vercel's pipeline). Plain `next build` can lazy-resolve missing modules via webpack and pass locally while Turbopack on Vercel fails fast. Memory entry: `feedback_turbopack_build_gate.md`.

**Deferred to v1.5** (per spec):
- Results-emailed-back to respondent (`sendAssessmentResultsEmail`) — gated on Jeff's `INVITED_RESULTS_EMAIL_COPY_APPROVED` content-flag sign-off
- Inngest async send (v1 uses sync SMTP)
- Admin AccessGroup management UI (Wave 5 wireframes 21 + 22)
- PUBLIC participant flow (`/quiz/[alias]` — Website Assessment + SunHub)
- Conditional report sections + peer benchmarks (Scaling Up Assessment)
- Wave 3 wireframes (output/report screens) — Jeff's stated next design priority
- Trends / longitudinal page

---

### 2026-05-18 — Assessment Tool v7.6 — Foundation slice + spec library + prod DB rebuild: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-foundation-spec-library -->

Assessment Tool v1 foundation (Issue #10) shipped end-to-end across two sessions (May 14 Tasks 0-4 + May 17/18 Tasks 5-9), reviewed across 6 rounds of Codex adversarial review.

**Spec library** (NEW at `docs/specs/v7.6/`, ~795 lines): 01-schema, 02-service-layer-rules (INTERSECTION RBAC, `evaluateAccessChange`, `canCreateCampaign`, ownership transfer, `ACCESS_POLICY_VERSION` env flag), 03-seed-rockefeller (`resolveSystemUser`, advisory lock, 6 states), 04-deploy-runbook (mandatory `dotenv-cli`, DB fingerprint, `prisma migrate diff` baselining, PITR), 05-wireframes-wave5 (Wave 2 revisions + Wave 5 deliverables), 06-observability (7 metrics, 6 alerts, `/admin/observability`), 07-bootstrap-runbook, operator-task-9-steps.

**PLAN.md** restructured from a 3,200-line monolith into a 70-line hub. Pre-v7.6 history archived to `plans/history/v6-v7.5-archive.md` (2,541 lines). Discipline: future spec revisions land in the appropriate spec file under `docs/specs/v7.6/`, NOT in PLAN.md.

**Schema migration** `20260514230000_add_assessment_infrastructure_v7_5` (amended in place v7.5 → v7.6) — 13 new tables, greenfield additive (zero new columns on existing tables):
- `Organization` (+ `ownerCoachId` NOT NULL per Jeff May 15 hierarchy flip — coaches own organizations directly)
- `OrgTeam` (recursive), `OrgRespondent`
- `AssessmentTemplate`, `AssessmentTemplateVersion` (immutable via Postgres trigger), `AssessmentCampaign` (+ `createdByCoachId` for transfer history), `AssessmentCampaignParticipant`, `AssessmentInvitation`, `AssessmentSubmission`
- **`AccessGroup` + `AccessGroupCoach` + `AccessGroupTemplate`** (replaces dropped `TemplateAccessGrant`; INTERSECTION semantics — coach effective access = templates that ALL their groups grant; `ACCESS_POLICY_VERSION` env flag for runtime policy flip / shadow-union mode)
- `OrganizationOwnershipEvent` (audit history for ownership transfers)
- Partial unique indexes (externalId, results-token-hash, single-CEO, access-group-name-where-not-deleted, campaign-respondent-where-respondent-not-null)
- GIN index on `AssessmentCampaignParticipant.teamPathAtAdd`
- **DROPPED** from May 14 v7.5: `OrganizationMembership`, `TemplateAccessGrant`, `OrgMembershipRole` enum (per Jeff May 15 — admins don't manage org memberships; coaches own their orgs)

**Pure scoring function** at `src/src/lib/assessments/scoring.ts` — Zod-typed config, no DB coupling, typed `ScoringValidationError` codes (no HTTP coupling). 25/25 tests green including Rockefeller golden fixture (`countAchieved=37`, `overallTotal=85`, `overallAverage=2.125`, tier="Great").

**Seed** at `src/prisma/seed-rockefeller-assessment.ts` — transactional, advisory-locked, fail-on-mismatch. 6 states (A nothing/B match/C mismatch/D heal/E orphan/F multi). Helpers: `resolveSystemUser`, `ensureAccessGroupAndTemplateLink` (runs on all 3 success paths A/B/D so the "Scaling Up Coaches" → Rockefeller link is idempotent).

**Wave 2 wireframe revisions** (per Jeff May 15 impromptu meeting):
- DELETED `admin/13-admin-memberships.html`
- REVISED `admin/12-admin-user-detail.html` (Memberships card → read-only Owned Organizations list)
- REWROTE `admin/15-admin-template-access.html` (per-coach grants table → Access Groups index with INTERSECTION banner)

**Wave 5 wireframes** (NEW — 4 admin screens, paired markdown spec each):
- `admin/21-admin-access-groups-list.html` + markdown
- `admin/22-admin-access-group-detail.html` (evaluateAccessChange before/after preview, BLOCKED_ZERO_ACCESS path) + markdown
- `admin/23-admin-aggregate-report.html` (MVP: template + version selectors only, no filters on day 1) + markdown
- `admin/24-platform-nav-assessments-entry.html` (Scaling Up top-nav + sidebar transition into Assessments lane) + markdown

**Deploy-safety scripts**: `src/scripts/db-fingerprint.ts` (fails-closed preflight; verifies `ASSESSMENT_PROD_EXPECTED_HOST` matches connected DATABASE_URL host; exit 0 match, 1 config error, 2 mismatch rollback-blocking). `dotenv-cli@^11` added to devDependencies (mandatory env injector; `source`/`set -a` forbidden per spec).

**Production DB rebuilt** (May 18 03:30–04:40 UTC): Free-tier Neon DB was found wiped to a Jan 2026 16-table snapshot (no `_prisma_migrations`, no users, no workshops). Recovery plan: `prisma db push --force-reset` against the empty DB to apply v7.6 schema directly, raw SQL appendix executed via `prisma db execute` (partial unique indexes + GIN index + immutability trigger + function), all 26 historical migrations baselined via `prisma migrate resolve --applied`, full seed cascade (seed.ts → seed-real-data.ts → seed-templates.ts → seed-ev-templates.ts → seed-pre-workshop-survey-template.ts → seed-rockefeller-assessment.ts). End state: 47 tables, 26 migrations baselined, 1 Rockefeller template (alias `RockHabits`, v1 enUS, published, contentHash `46b14e8e…`), 1 AccessGroup (`Scaling Up Coaches` → Rockefeller). Admin login verified via NextAuth (302 → `/admin/dashboard`, session cookie set).

**Tests**: 1310 total passing (up from 1262 on origin/main and 1121 on the May 14 baseline). 48 new lib/assessments tests across 3 suites (scoring, schema-presence, migration-verification — now fully green since prod schema applied).

**Discipline rule (persistent memory)**: `feedback_assessment_spec_library.md` — future Assessment Tool spec revisions land in `docs/specs/v7.6/<NN>-*.md`, never appended to PLAN.md. PLAN.md stays a thin hub.

**Operator notes**:
- Local `.env` was never modified during deploy; `.env.production.local` (gitignored) handles prod commands via `npx dotenv-cli -e .env.production.local -- <cmd>`.
- Neon Free tier is unsafe for production data (6h PITR window; this incident lost ~60 days of test workshops/registrations because no external backups existed). Recommend Pro tier with 7+ day PITR before next deploy.

---

### 2026-05-14 — Round 16 Wave 1 — Affiliate tracking iDev→PAP migration kickoff (cookie-script mount + CSP allowlist + tracker registry foundation, May 14 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-14 ENTRY_SLUG:round-16-wave-1-affiliate-cookie -->

Source: Jeff Verdun's May 14 standing meeting (transcript: https://fathom.video/share/VEQERXhbtBM3TtoJZZRcaai1kZxc9zTi). Jeff asked to move the affiliate cookie-setting script onto the Vercel app's landing pages so direct-link visitors get attribution, and to migrate from iDev to Post Affiliate Pro (PAP) without redeploying everything. Plan written + reviewed by Codex (8 critical findings absorbed) + Superpowers code-reviewer (11 conditions absorbed) before implementation. Plan at `~/.claude/plans/do-we-need-to-cryptic-swan.md`. Executed via SDD workflow: implementer subagent → spec compliance reviewer → code quality reviewer. 18 new tests, 1244 → 1262.

**Architecture: Tracker Registry (Strangler Fig + Adapter pattern).**

Research across migration literature (IREV, Acceleration Partners, Cellxpert, Martin Fowler) converged on parallel tracking during a 4–12 week reconciliation window with the new provider in shadow mode alongside the legacy provider in primary mode — NOT a hard cutover env-var pair. A small `AffiliateTracker` interface (id, mode, getCookieScriptDescriptor, getCommissionScriptDescriptor) lets each provider live in its own adapter file. Registry assembles active trackers from env vars. Modes per tracker: `primary` (live attribution), `shadow` (fires but provider-side flagged as non-payout — verified in merchant dashboard before turning on), `off` (not loaded).

**ScriptDescriptor is a 3-form discriminated union** (`image | externalScript | inlineScriptGroup`) so iDev's current `<img>` pixel form, iDev's URL-based script load, and PAP's library-then-init ordered group pattern can all be represented without races. Wave 1 ships the type but only emits/handles `externalScript` for cookie-setters.

**Wave 1 — Cookie-only mount.** Wave 1 ships ZERO impact on existing iDev `<img>` pixel attribution (CHG-03 path). Legacy `<CustomCodeRenderer>` on thank-you pages unchanged. `interpolateCustomCode`, `validateCustomCode`, `AFFILIATE_PIXEL_HOSTS`, `LandingPage.customCode` schema, Stripe webhook handler — all unchanged.

**Files created:**
- `src/lib/affiliate/affiliate-types.ts` — `TrackerMode`, `ScriptDescriptor` discriminated union, `AffiliateTracker` interface
- `src/lib/affiliate/registry.ts` — `parseMode` (CASE-STRICT lowercase; typos disable rather than fire half-configured), `getActiveTrackers` (per-call env reads — explicit `// DO NOT cache` comment guards against future regression)
- `src/lib/affiliate/idev-tracker.ts` — iDev adapter, cookie-only in Wave 1 (commission descriptor returns `null` stub — tested to guard against accidental Wave 2 leakage)
- `src/components/affiliate/affiliate-cookie-script.tsx` — server component, `next/script` with `strategy="afterInteractive"`, key `affiliate-${t.id}-cookie`, defensive `if (d.type !== "externalScript") return null` skip for forward-prep
- `src/app/(public)/layout.tsx` — NEW file (verified no prior layout in route group). Returns `<>{children}<AffiliateCookieScript /></>`. No `<html>`/`<body>` wrap (root layout owns those). No `metadata` export (inherits from root)

**Routes covered (`(public)/` group, all unauthenticated public surfaces):** `/login`, `/register`, `/workshop/[slug]`, `/w/[slug]`, `/registration/success`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/unauthorized`. **NOT covered (siblings of group):** `/` (redirects to `/login` so cookie fires on redirect target), `/survey/[id]` (post-conversion path).

**Files modified:**
- `next.config.ts` — extended `Content-Security-Policy-Report-Only` `script-src` + `connect-src` with `scalingup.idevaffiliate.com` (Wave 1 iDev) AND `*.postaffiliatepro.com` (forward-prepare Wave 3 PAP). `img-src` deliberately untouched (Wave 2 task — iDev's `image` descriptor renders `<img src>` on `scalingup.idevaffiliate.com` which needs `img-src` allowlist before that path activates).
- `.env.example` — documented 4 new env vars: `AFFILIATE_TRACKER_IDEV_MODE` (default `off`), `AFFILIATE_TRACKER_IDEV_COOKIE_URL`, `AFFILIATE_TRACKER_PAP_MODE`, `AFFILIATE_TRACKER_PAP_COOKIE_URL`.

**18 new tests (4 idev-tracker + 10 registry + 3 affiliate-cookie-script + 1 public-layout):**
- `idev-tracker.test.ts`: cookie descriptor shape when URL set; null when URL is `undefined`; null when URL is `""` empty string (env-var unset-vs-empty deploy footgun guard); commission stub returns null.
- `registry.test.ts`: 10 tests covering case-strict mode parsing ("Primary"/"PRIMARY"/"Shadow"/"SHADOW"/garbage → off); tracker activation by env; PAP block placeholder verified empty for Wave 3 forward-prep.
- `affiliate-cookie-script.test.tsx`: no-trackers → renders nothing; iDev-active → renders `next/script` with correct src and key; skips non-`externalScript` descriptor types (defensive).
- `public-layout.test.tsx`: regression guard asserting `<AffiliateCookieScript />` is mounted by `(public)/layout.tsx` output (catches future-cleanup regression).

**Codex adversarial findings absorbed before code (8 critical reshapes):**
1. `ScriptDescriptor` originally weak single-form union — fixed to 3-form to model real-world tracker shapes.
2. Suppression rule was too aggressive (would kill non-affiliate pixels) — moved to Wave 2 only AND scoped to `primary`+configured.
3. Original Wave 1 included commission+suppression — was hard cutover in strangler-fig costume. Reshaped Wave 1 to cookie-only.
4. Shadow mode underspecified — explicit per-provider verification step added (PAP merchant dashboard MUST confirm non-payout before enabling against production orders).
5. Single global URL-encoding interpolator was context-unsafe (PAP inline JS needs `JSON.stringify`, not percent-encoding). No global interpolator — adapters encode per their own context (`URLSearchParams` for URLs, `JSON.stringify` for inline JS).
6. Coupon capture via Stripe webhook was racy + wrong field. Moved to checkout-creation-time write (Wave 2).
7. Duplicate-fire risk on refresh/back/bookmark unaddressed. Wave 2 adds canonical commission surface per registration + stable `orderNumber = stripeSessionId` for provider dedupe + manual 5×-refresh test.
8. iDev's current production form is `<img>` pixel — adapter originally only supported scripts (would have broken existing iDev attribution). `image` descriptor added to ScriptDescriptor; Wave 2 iDev commission emits `image`.

**Code-reviewer findings absorbed (11 conditions, all signed off):**
- `(public)/layout.tsx` corrected from "Modified" → "New" file in plan.
- Route coverage enumeration explicit (in vs out of `(public)/` group).
- CSP `img-src` task added to Wave 2 with explicit ordering requirement.
- CSP header name verified `Content-Security-Policy-Report-Only` (not `Content-Security-Policy`).
- Empty-string env-var URL test added.
- Case-strict mode parsing test added.
- `public-layout.test.tsx` regression guard added.
- Ad-blocker behavior characterization (uBlock Origin baseline) added to Wave 1 manual acceptance test.
- Authenticated-user no-exclusion note (Wave 2 may add session guard if self-referrals surface).
- Env-var read-timing comment in `registry.ts` (locks against future caching regression).
- "What does NOT change in Wave 1" mechanical enumeration for rollback safety.

**Wave 2-4 roadmap (deferred):**
- Wave 2: commission registry with all three descriptor forms; `Registration.appliedCouponCode` schema (captured at checkout creation, NOT webhook); iDev `image` adapter emit; suppression rule for legacy `<CustomCodeRenderer>` (only when primary+fully-configured); ~22 new tests.
- Wave 3: PAP adapter, shadow mode. Blocked until Jeff invites user as PAP merchant user.
- Wave 4: flip primary to PAP after 4–6 weeks PAP↔iDev variance <1%; deprecate iDev.
- Phase 4 (long-term roadmap): server-side (S2S) postback via Stripe webhook for ad-blocker resilience (15–25% conversion-rate gain per Voluum/Tracknow/RedTrack).

**Wave 1 acceptance test (manual, after deploy):**
1. User fetches iDev cookie-setter script URL from Kajabi site-header settings (admin access granted in meeting).
2. Set `AFFILIATE_TRACKER_IDEV_MODE=primary` + `AFFILIATE_TRACKER_IDEV_COOKIE_URL=<from-Kajabi>` in Vercel; redeploy.
3. Visit a Vercel-hosted public page (e.g. `/login`); DevTools → Application → Cookies → confirm iDev cookie set in first-party storage.
4. Test with uBlock Origin enabled — characterize baseline blocked-rate so post-deploy attribution-shortfall isn't a surprise (legacy `<img>` pixel has same blocker exposure today).
5. Complete the existing register flow on a Lynn workshop URL — legacy `<img>` pixel commission tracking still fires from `LandingPage.customCode`; verify Jeff's iDev dashboard records the conversion correctly.

Direct push to main per Alpha-mode deploy convention. Notion task: https://www.notion.so/3608c45dd829815f8657f7b767253d22

---

### 2026-05-14 — Round 15 — Survey Data Sort/Categorize Tool (Item #5 from Jeff's 5/12 email, May 14 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-14 ENTRY_SLUG:round-15-survey-sort-categorize -->

Source: Jeff Verdun, 5/12 email Item #5 — *"Create a new tool to sort and categorize survey data. Think a screen like financials that allows the sorting of survey data."* Plan written + 2-round adversarial review (Codex + independent self-review caught 5 critical + 4 missing edge cases before any code landed). Executed via SDD workflow: implementer subagent → spec compliance reviewer → code quality reviewer per wave, with targeted polish dispatches when reviewers flagged Important items. 9 commits, 52 new tests, 1192 → 1244.

**Wave 1 — Shared CSV helpers (commit `b4477d9`):**
- New module `src/lib/utils/csv.ts` with two exports: `escapeCsvCell(value): string` (RFC 4180 always-quoted; doubles internal `"`; prepends `'` for cells starting with `=` `+` `-` `@` `\t` `\r` per OWASP injection-defense pattern) and `rowsToCsv(headers, rows): string` (joins with `\r\n`, trailing `\r\n`).
- Refactored `src/app/api/registrations/export/route.ts` to call `rowsToCsv` — replaced ~11 lines of inline escape logic with one helper call. Output is strictly RFC 4180 (every cell now quoted; injection prefix is `'` not `\t`); no existing tests locked the old byte shape; spreadsheet reparse is identical.
- 6 new tests at `__tests__/lib/csv-utils.test.ts` (quote/comma/newline escape, all 6 injection chars, null/undefined → bare empty, Date stringification, RFC 4180 line endings, round-trip reparse).
- Wave 1 code-review deferred items addressed in Wave 5: type-narrow `escapeCsvCell` param from `unknown` → exported `CsvCellInput` union (`string | number | boolean | bigint | Date | null | undefined`); JSDoc clarifying that Date is NOT pre-formatted by the helper.

**Wave 2 — `parseSurveyDateRange` helper + endDate same-day bug fix (commit `cca46ff`):**
- The aggregate page filtered `completedAt` as `lte: new Date("2026-05-13")` = midnight UTC → same-day responses with `completedAt > 00:00` were silently excluded. Fix: new `parseSurveyDateRange(params: { startDate, endDate })` at `src/lib/surveys/survey-types.ts` returns `{ startDate, endDateExclusive }` where `endDateExclusive = new Date(endDate); end.setUTCDate(end.getUTCDate() + 1)`. Query bound switched from `lte` to `lt` (exclusive). Same-day responses now correctly included; month-end (May 31 → Jun 1) + year-end (Dec 31 → Jan 1) rollover tested.
- Migrated `getSurveyResults` in `src/lib/surveys/survey-service.ts` to use the helper. `SurveyResultsFilters.startDate/endDate` widened from `Date` to `Date | string` (back-compat shim; helper-aware string path handles inclusive-of-day correctly).
- Updated `src/app/(dashboard)/admin/surveys/aggregate/page.tsx` to drop inline `new Date(sp.startDate)` and pass raw YYYY-MM-DD strings.
- Bonus: `src/app/api/survey-templates/[id]/results/route.ts` Zod schema migrated from `z.coerce.date()` (which produced midnight UTC at the API surface, same bug) to YYYY-MM-DD regex string. Safe because UI input is `<input type="date">` which always emits YYYY-MM-DD.
- 7 new tests at `__tests__/lib/parse-survey-date-range.test.ts` + 1 updated/added in `__tests__/lib/survey-service-filters.test.ts` (`lte` → `lt` rationale comment).
- Wave 2 code-review Issue 3 (`Record<string, unknown>` → `Prisma.WorkshopWhereInput`) deferred to Wave 6 since Wave 6 rewrites that page.

**Wave 3 — `getSurveyResponseRows` service helper (commits `d927268` + polish `0f2f5e5`):**
- New exported function `getSurveyResponseRows(templateId, filters, options?: { cap?: number | null })` returning `{ template, questions, rows, totalCount, cappedAt }`. Single backbone consumed by both the new UI table (Wave 4) and the CSV export endpoint (Wave 5). Existing `getSurveyResults` UNTOUCHED (different responsibility — aggregate stats vs per-response drill-down).
- **Codex-critical fix:** Workshop→Category relation is `workshopCategory` (Prisma `@relation`), NOT `category` (legacy `WorkshopCategory @default(AI)` enum). The plan originally used `category` and would have crashed at runtime. Test asserts `call.include.workshop.select.workshopCategory).toBeDefined()` AND `call.include.workshop.select.category).toBeUndefined()`.
- Default cap `ROW_CAP = 500` for UI; pass `{ cap: null }` for unbounded CSV export. `cappedAt` is set ONLY when truncation actually occurred AND `totalCount > cap`.
- Each row's `answersByQuestionId: Map<questionId, { value, numValue }>` built in-memory from the include payload for O(1) per-cell lookup in the table/CSV.
- `coach.name`: null-safe trim of firstName+lastName; empty → `null`. `category`: from `workshopCategory` relation; `null` when workshop has no `categoryId`.
- Throws `Error("Survey template not found: ...")` on missing template — deliberate choice over silent null-return to surface consumer bugs (stale templateIds in URLs, deleted-template races).
- Polish commit applied 3 reviewer-flagged fixes: (1) `Promise.all([template, count, findMany])` parallel fetch (was sequential — 3 round-trips → 1); (2) `cappedAt` now uses pre-filter `surveys.length` not post-filter `rows.length` (defensive in-memory filter could have hidden a true cap); (3) `respondent: { firstName, lastName, email } | null` field added (registration-linked surveys — powers Wave 5 CSV identification).
- 12 new tests at `__tests__/lib/survey-response-rows.test.ts` (9 in original commit + 3 in polish). Covers all 6 spec acceptance bullets + null-coach/null-category fallback + template+question ordering + parallel-fetch invariant + respondent shape.

**Wave 4 — `<SurveyResponsesTable>` client component (commits `6f196b4` + polish `8a4df5e`):**
- New `"use client"` component at `src/components/surveys/survey-responses-table.tsx`. Renders per-response rows with sortable column headers, conditional answer columns, empty state, cap banner, Export CSV button.
- **Always-shown columns:** Workshop (Next.js `<Link>` to `/workshops/<id>`), Workshop Code, Coach, Category, Completed At.
- **Conditional columns:** NPS Score (when `surveyType === "NPS"` OR any row has numeric NPS answer); Avg Rating (when any RATING-type `numValue` present; per-row cell = mean rounded to 1 decimal); Comment (when any TEXT/TEXTAREA non-empty value; per-row cell = first such answer truncated to 60 chars + ellipsis).
- **Sortable:** local `useState` for `sortKey + sortDir`. Default `completedAt DESC` (matches server-side `findMany`). First click on a different column resets to ASC; subsequent clicks toggle ASC↔DESC. Stable sort via `[...rows].sort()` (V8 Array.sort is stable). Nulls last in ASC, first in DESC.
- **Empty state:** "No responses match these filters." with widen-filters hint.
- **Cap banner:** "Showing N of M responses — narrow filters or use Export CSV to see all." rendered above the table when `cappedAt !== null`.
- **Anti-feature confirmed:** NO "Respondent" column — PII stays in CSV-only territory (the `respondent` field on `SurveyResponseRow` is intentionally not rendered; doc-comment at top of file explains why).
- Polish commit applied 3 reviewer-flagged a11y fixes: (1) `aria-sort="ascending|descending|none"` on the active column `<TableHead>` (screen readers can now perceive sort state — the visual `ArrowUp`/`ArrowDown` icons are `aria-hidden`); (2) removed redundant `aria-label` shadowing visible text (was causing "Workshop, Workshop" double-read); (3) tightened fragile test selector from `/Workshop$/i` (substring-anchored) to `/^Workshop$/i` (exact match — won't break if column renamed).
- 9 new tests at `__tests__/components/survey-responses-table.test.tsx` (workshop link href, sort toggle, NPS column hidden when no NPS answers, cap banner gating, empty state, Export CSV href, 60-char truncation, Avg Rating math, aria-sort attribute lifecycle).

**Wave 5 — CSV export endpoint (commits `816e1a5` + polish `3f0048f`):**
- New route `GET /api/survey-templates/[id]/responses/export/route.ts`. Auth chain matches `/api/registrations/export`: `getApiActor` → null → 401; `!isPrivilegedRole(actor.role)` → 403; ADMIN/STAFF → 200. (NOT ADMIN-only per Codex review.)
- Zod-validates query params `coachId`, `categoryId`, `workshopFormat`, `startDate`, `endDate` (YYYY-MM-DD regex). Bad params → 400.
- Internally calls `getSurveyResponseRows(templateId, filters, { cap: null })` for unbounded export. The UI table caps at 500; CSV bypasses it.
- **CSV base columns (in order):** Workshop, Workshop Code, Coach, Category, Format, Survey Type, Respondent Name, Respondent Email, Sent At, Completed At.
- **Per-question columns:** one per question, named after `question.label`, ordered by `sortOrder`. Per-type serialization: TEXT/TEXTAREA raw (no truncation); RATING/NPS numeric (`numValue`); SINGLE_CHOICE label (`value`); MULTI_CHOICE → JSON.parse + `"; "`-joined with comma-split fallback; YES_NO → `"Yes"`/`"No"` mapped from `true/yes/1` and `false/no/0`.
- Filename `survey-<slug>-<YYYY-MM-DD>.csv` via Next.js `Content-Disposition: attachment` (no JS needed for download). Empty-slug fallback `"survey"`.
- Service helper extended (additive only): `SurveyResponseRow.workshop.format: string | null` + `SurveyResponseRow.sentAt: Date | null`. Wave 4's table consumer ignores the new fields (forward-compatible).
- Polish commit applied 3 reviewer-flagged fixes: (1) **404 not 500** on unknown template — wraps the service call in try/catch detecting `Error("Survey template not found")` and returns `404 { error: "Template not found" }` (other errors still throw to default handler); (2) **DRY slug** — replaced the local `slugifyTemplateName()` with `generateSlug` from `lib/utils.ts` (byte-identical output, single source of truth); (3) one-line comment noting `today` uses UTC and may drift up to 5h ahead of admin local time at UTC midnight.
- **Wave 1 deferred items applied:** `escapeCsvCell` param narrowed from `unknown` to new exported `CsvCellInput` union; JSDoc warning Date is NOT pre-formatted. Existing registrations export's call sites still compile (pass only strings/numbers).
- 14 new tests at `__tests__/api/survey-responses-export.test.ts` (13 in original commit + 1 in polish for 404 path). Covers all 8 spec acceptance bullets + per-type serialization + query threading + bad-date 400 + respondent composition + sentAt rendering + 404 on missing template.

**Wave 6 — Aggregate page wiring + Wave 2 Issue 3 leftover (commit `d7ad545`):**
- `src/app/(dashboard)/admin/surveys/aggregate/page.tsx`: added `Promise.all([getSurveyResults, getSurveyResponseRows])` parallel fetch (the row helper takes `coachId`, `categoryId`, `workshopFormat`, `startDate`, `endDate` — `groupBy` is intentionally NOT passed since the per-response view doesn't group).
- New `<section aria-labelledby="individual-responses-heading">` rendered conditionally on `!groupBy && responseRowsData`, positioned AFTER the existing "Per-Workshop Breakdown" table. When `groupBy` is active, the existing groups table covers the categorize intent — flat response table redundant.
- `exportHref` built via `URLSearchParams` preserving all 5 filter keys; no trailing `?` when no filters set. Single Export CSV button rendered exactly once (the table component owns it; no duplicate at section heading per plan).
- **Wave 2 Issue 3 leftover applied:** `workshopSubFilter: Record<string, unknown>` → `Prisma.WorkshopWhereInput`; `completedAtBoundary: Record<string, unknown>` → `Prisma.DateTimeNullableFilter` (canonical types already used in `survey-service.ts:518/523`). Added `import { Prisma } from "@prisma/client"`. Prisma type-check now catches schema drift in the side-breakdown query.
- No page-level tests (high-friction for async server components; no pre-existing tests for this page to extend; underlying pieces — table, helper, route — all already test-covered).

**Test totals:** 149 suites / 1244 tests passing (was 1192 → +52). `CI=true npm run build` clean.

**Scope decisions (Josh, 2026-05-13/14):**
- Item #3 (upload web page templates) **deferred** pending Jeff scoping call — codebase has hardcoded React templates that can't accept arbitrary HTML without major refactor. Concept memo for Thursday meeting: this is "theming" in industry terms (WordPress mental model). Full memo in agent memory.
- Plan reviewed by Codex (5 critical + 1 simplification) + independent self-review (3 issues). All 9 accepted before any code. See plan changelog at `/Users/diushianstand/.claude/plans/do-we-need-to-cryptic-swan.md`.

**Open follow-ons for Beta (not blockers):**
- Streaming CSV for huge exports (current pattern materializes in memory — ~50MB at 10K respondents × 50 questions is still well within Vercel's 1024MB limit; revisit if exports start timing out)
- `@@index on Survey.completedAt` for performant date-range filters at scale
- Multi-dimensional grouping (`groupBy` is single-dimension today)
- Time-series trend chart (avg NPS per month)
- Workshop-to-workshop comparison view
- Response tagging/marking workflow
- `serializeAnswer` extracted to a shared module once a second consumer appears (e.g. preview-before-download)
- `buildExportSearchParams` extracted helper if another page reuses the same filter-preserve pattern

---

### 2026-05-13 — Squash Round 14 — BUG-MAY13-3 (Thank-You Redirect) + BUG-MAY13-2 (Survey View Mismatch) (May 13 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-13 ENTRY_SLUG:squash-round-14 -->

Two bugs filed during Sprint 13 verification, fixed in one push. Plan reviewed by Codex (5 findings accepted before implementation). 7 commits, 26 new tests, 1169 → 1192.

**Wave A — BUG-MAY13-3 (per-workshop thank-you redirect):**
- New helper `resolveRegistrationSuccessUrl` at `src/lib/workshops/thank-you-redirect.ts` resolves post-registration redirect URLs. Uses discriminated union `{ kind: "free"; registrationId } | { kind: "paid"; stripeSessionToken }` to prevent callers from mixing identifiers. Returns `${appUrl}/workshop/<thank-you-slug>` (no query string per Codex review) for free + published THANK_YOU; `${appUrl}/workshop/<slug>?session_id={CHECKOUT_SESSION_ID}` for paid. Falls back to `/registration/success` when no THANK_YOU LandingPage exists.
- New `getAppUrl()` helper colocated in same module returns `process.env.APP_URL || "http://localhost:3000"` — matches sibling-route pattern. Eliminates the divergent `?? NEXTAUTH_URL ?? ""` chain originally introduced in /api/registrations.
- All four registration call sites unified:
  - Public `RegistrationForm` (`(public)/workshop/[slug]/registration-form.tsx`) reads `data.redirectUrl` from POST response and navigates via injectable `navigate()` prop (DI seam for JSDOM testability; defaults to `window.location.href = url`). Defensive fallback to `/registration/success?id=X` if server omits the field.
  - `POST /api/registrations` now returns `redirectUrl` in JSON response body alongside existing fields.
  - `POST /api/workshops/[id]/register` free path (303 redirect Location header) + paid path (Stripe `successUrl` argument) both route through helper. Cancel URL untouched.
  - `POST /api/checkout` migrated from inline `db.landingPage.findFirst` + ternary URL construction (~13 lines) to single helper call. Coupons, Stripe params, cancel URL all unchanged.
- 14 new tests across 3 files: 6 unit tests for the helper (`__tests__/lib/thank-you-redirect.test.ts`), 2 API + 2 component tests for /api/registrations + RegistrationForm, 4 integration tests for /api/workshops/[id]/register.
- Commits: `ea57936` (A1), `6997487` (A2), `64f68e3` (A2 fix — `getAppUrl` extraction), `242970a` (A3), `500e057` (A4).
- THANK_YOU template content gate (pre-implementation): verified `ThankYouPageTemplate` already renders calendar (Google + .ics), workshop date/time/timezone, format, location, and title — registrants lose nothing under the new redirect.

**Wave B — BUG-MAY13-2 (survey-template editor Results tab):**
- Extracted `<SurveyResultsContent>` (pure body) from `<SurveyResultsView>` (page-chrome wrapper). `SurveyResultsView` becomes a thin shell: header + "Back to Workshop" link + mounts `<SurveyResultsContent>`. Public API of `SurveyResultsView` preserved verbatim — workshop-page consumers (admin + coach) untouched.
- `<SurveyResultsContent>` gains optional `showWorkshop?: boolean` prop (default `false`). When `true` and a response has a `workshop` field, renders workshop attribution as a structured `<span>` element next to each respondent — NOT spliced into label strings. Codex anti-splice catch enforced by DOM-node-identity tests (`expect(janeNode).not.toBe(codeNode)`, not just textContent matching).
- Extended `SurveyResultResponse` type with optional `workshop?: { title: string; workshopCode: string } | null` (structurally consistent with existing `registration?: { ... } | null` on same interface).
- Template editor Results tab in `survey-template-editor.tsx` now mounts `<SurveyResultsContent showWorkshop templateGroups={...} />` instead of the deleted `<SurveyResultsPanel>`. Fixes Jeff's 5/12 complaint: "Survey results from the workshop view show correctly. The view from the results button on the survey setup shows differently." Both surfaces now use the same component; the template-editor side additionally shows a workshop column since responses span workshops.
- Fixed Prisma fetch in `admin/surveys/templates/[id]/page.tsx` to include `answers: { include: { question: true } }` in the surveys include — previously missing, would have caused runtime failures when `<SurveyResultsContent>` tried to render per-question per-person results.
- `<SurveyResultsPanel>` (~120 lines) deleted entirely (zero remaining consumers). `useEffect` import dropped from `survey-template-editor.tsx`.
- 7 new tests across 2 files: 4 component tests for `SurveyResultsContent` (structural anti-splice + Wave 12-C regression guard + showWorkshop=false default + empty state), 3 admin tests for template-editor Results tab.
- Commits: `3fccb22` (B1), `1f597fb` (B2).

**Plan validation:** Codex review (`mcp__validate-plans-and-brainstorm-ideas__codex`) found 5 critical issues with the original plan, all accepted before any code was written:
1. Missed `/api/registrations` + `RegistrationForm` client as the actual user-facing path
2. Fake centralization — original plan didn't migrate `/api/checkout` (which already had inline duplicate logic)
3. Speculative `regId` query param work — `/workshop/[slug]/page.tsx` ignores unused query params today
4. Survey-template editor fetch missed `answers` join — `SurveyResultsView` cannot render without answers
5. `SurveyResultsView` is page chrome (has "Back to Workshop" link) — must extract `SurveyResultsContent` body instead of reusing the wrapper

Plan at `~/.claude/plans/do-we-need-to-cryptic-swan.md`. Adversarial-review loop caught issues that would have shipped broken on the original draft.

**Test count:** 1169 → 1192 (+23 new tests). `CI=true npm run build` clean. ESLint clean (2 pre-existing warnings on `survey-template-editor.tsx` for `QUESTION_TYPES` and `SurveyType` unused imports — pre-date Wave B).

**Followups filed (non-blocking, future polish):**
- `/api/survey-templates/[id]/results` route may be orphaned (aggregate page calls `getSurveyResults()` directly, bypassing the HTTP route). Confirm + delete.
- `SerializedSurveyAnswer` type narrower than what the page serializes — tighten serialization or widen type.
- Tombstone comment on the route in `survey-template-editor.tsx` slightly inaccurate.
- Pre-existing ESLint warnings on `survey-template-editor.tsx`.
- Add registrant-level variables to `buildWorkshopVariables()` for THANK_YOU template personalization (deferred from plan).
- iDev pixel firing for free-workshop thank-you pages (deferred from plan).
- Consolidation of `/admin/surveys/aggregate/page.tsx` with the template-editor Results tab (likely redundant after Wave B).

---

### 2026-05-13 — Sprint 13 Follow-ons — DTSTART Fix, Virtual Format Defaults, ICS Directions Suppression (May 13 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-13 ENTRY_SLUG:squash-round-13-followon -->

**Sprint 13 Follow-ons — DTSTART, Virtual Default, ICS Directions** (May 13 2026, direct push to main, Alpha mode):
Source: live QA of Squash Round 13 revealed 3 new bugs. 1148 → 1169 tests (+21).

**ICS DTSTART Minutes Fix** (`8583ec3`):
- `split(":")` on range `eventTime` like `"14:30 - 16:00"` yielded NaN for minutes, silently truncating calendar invite start to 14:00.
- `parseStartTime(eventTime: string)` helper: strips range suffix via `/\s*[-–]\s*.*/`, then splits. Used in `generateIcsContent` and `buildGoogleCalendarUrl`.
- 7 new tests in `ics-generator.test.ts` (14 → 17 in that file, 1148 → 1155 total).

**Virtual Format Default — Admin + Resubmit + Inline Forms** (`3c993e5`):
- Wave 12-A only patched `WizardContext.tsx` (coach portal). Admin `new/page.tsx:138` had own `useState({ format: "IN_PERSON" })`. `resubmit-workshop.tsx` and `WorkshopInlineEditForm.tsx` had same `|| "IN_PERSON"` fallback.
- 3 one-line `IN_PERSON → VIRTUAL` changes; 3 new regression test files (4 tests).
- 1155 → 1159 tests total.

**ICS LOCATION Triggers Gmail Directions Button on Virtual Workshops** (`9167b26`):
- `buildLocationString` returned `workshop.virtualLink || "Virtual Workshop"` for VIRTUAL, populating ICS `LOCATION:` field — Gmail uses this to render a "Directions" button in calendar invite preview.
- Fix 1: `buildLocationString` returns `""` for VIRTUAL (and HYBRID with no venue).
- Fix 2: `buildIcsDescription(workshop)` helper appends `"\n\nJoin online: <link>"` for VIRTUAL/HYBRID; used in `handleRegistrationCreatedFree` and `process-payment-completed-helpers`.
- 10 new tests in `ics-generator.test.ts` (17 → 27); mocks updated in 2 handler test files.
- 1159 → 1169 tests total.

**BUG-MAY13-3 filed** (not yet shipped):
- `/registration/success` hardcoded redirect bypasses per-workshop thank-you template system. Root cause: template upload/download feature surfaced the disconnect; sprint focus shifted to email/ICS critical bugs. Fix A queued: `register/route.ts` redirect to per-workshop thank-you slug with `?regId=X`.

### 2026-05-12 — Squash Round 13 — Registration Email + ICS + Survey Pinning + Refund Hint (May 12 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-12 ENTRY_SLUG:squash-round-13 -->

**Squash Round 13 — Registration Email + ICS + Survey Pinning + Refund Hint** (May 12 2026, direct push to main, Alpha mode):
Source: Jeff Verdun email + Slack follow-ons from May 12. All Notion tasks created before implementation and assigned to gabriel@chiefaiofficer.com. 1121 → 1148 tests (+27).

**Wave 13-A — Registration Email Fix:**
- Removed legacy `"send-registration-email"` Inngest step from `schedule-emails.ts` — was firing an old Azure template for ALL registrations, causing PAID double-send.
- Extended `RegistrationConfirmationContext` with `format`, `virtualLink`, `venueName`, `venueAddress` fields.
- `buildLocationBlock()` helper in `transactional-email-template.ts`: VIRTUAL+virtualLink → join link (https-only scheme guard); IN_PERSON/HYBRID+venue → Get Directions (uses `buildLocationString` for Maps query, not raw JSON).
- `sendPaidRegistrationNotificationStrict` + `sendNotificationWithAtomicClaim` thread all 4 location fields.
- New `handleRegistrationCreatedFree` Inngest function on `registration/created` event: skip conditions (not_found, paid_path_handles, pre_cutoff, already_sent, race_lost), atomic claim pattern, ICS generation, SMTP rollback on failure.
- `REGISTRATION_HANDLER_CUTOFF_AT` env var (documented in `.env.example`) controls which free registrations the handler processes.
- `/api/workshops/[id]/register` route: removed fire-and-forget `sendRegistrationNotification`; now publishes `registration/created` to Inngest for FREE workshops.
- 15 new tests across `handle-registration-created-free.test.ts` (8) + `transactional-email-template.test.ts` (3) + `workshop-register.test.ts` (4 updated).

**Wave 13-B — ICS End-Time Fix:**
- `parseDurationHours` extended: numeric-prefix regex (`"2 hours"` → 2, `"3 hours"` → 3), explicit `"8hr"`/`"4hr"` branches, `"full"` → 8, fallback changed from 8 → 2.
- `parseDurationHoursFromEvent(duration, eventTime)` implemented: parses `"HH:MM - HH:MM"` (hyphen or en-dash) to derive duration from range; falls back to `parseDurationHours`.
- All 5 remaining bare `parseDurationHours` callers migrated: `api/workshops/[id]/ics/route.ts`, `workshop-date-change.ts`, `thank-you-page-template.tsx`, `registration/success/page.tsx`, `process-payment-completed-helpers.ts` (already migrated in 13-A).
- 11 new tests in `ics-generator.test.ts`.

**Wave 11-G — Survey Template Pinning:**
- `getOrCreateSurveyLink` in `survey-automation.ts` (line ~67): removed `isActive: true` from pinned-template lookup. Auto-attach paths keep `isActive: true`.
- Workflow editor `StepCard` + `NewStepForm` state type updated to include `isActive: boolean`. Picker renders `(inactive)` suffix for inactive templates. Empty-state text changed to "No survey templates."
- 5 new tests: `survey-automation-pinned.test.ts` (3) + `workflow-editor-survey-picker.test.tsx` (2).

**Wave 13-C — Refund Screen Stripe ID Hint:**
- `mark-refunded-button.tsx` prompt string updated: removed misleading "replace pi_ with re_" tip (Stripe refund IDs are separate objects). New text directs operators to Payments → [charge] → Refunds in Stripe dashboard. Validation regex (`/^re_[A-Za-z0-9]{14,}$/`) unchanged.

### 2026-05-12 — ENH-MAY12-2 — Survey Step Email Customization Fix (May 12 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-12 ENTRY_SLUG:enh-may12-2-survey-step-fix -->

**ENH-MAY12-2 — Survey Step Email Customization Fix** (May 12 2026, direct push to main, Alpha mode):
- Jeff reported: "The surveys if you make them as templates you do not have any control over the email that comes with it."
- Root cause: `StepCard` initialized `templateId` from `step.emailTemplateId` even for `SEND_SURVEY_LINK` steps — a stale `emailTemplateId` in the DB (or set by switching from another step type) caused `{!templateId && ...}` block to hide the subject/body fields.
- Fix 1: `StepCard` `useState` initializer clears templateId when `step.stepType === SEND_SURVEY_LINK`.
- Fix 2: `StepCard` step-type onChange clears `templateId` when switching TO `SEND_SURVEY_LINK`.
- Fix 3: `NewStepForm` step-type onChange clears `templateId` when switching TO `SEND_SURVEY_LINK`.
- Fix 4: Both submit handlers validate that non-blank body includes `{{surveyUrl}}` — destructive toast + early return if missing (blank body allowed = uses default email).
- Fix 5: Help text added below body textarea in both forms when `stepType === SEND_SURVEY_LINK`.
- New test file `__tests__/components/workflow-editor-survey-email.test.tsx` (7 RED→GREEN tests).
- 1121 tests passing (up from 1114).

### 2026-05-12 — Squash Round 12 — Jeff May 12 Follow-On Items (May 12 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-12 ENTRY_SLUG:squash-round-12 -->

**Squash Round 12 — Jeff May 12 Follow-On Items** (May 12 2026, direct push to main, Alpha mode):
Source: Jeff Verdun email "Bug List/Improvement List 5/12/26". Wave 11 already shipped double-email + format-default fixes. Wave 12 + Wave 8-D cover the remaining items. 1030 → 1114 tests (+84).

**Wave 12-A — Password UI Label Fix:**
- Password hint text in 3 UI surfaces corrected from "12 characters" → "8 characters" to match the Zod schema `.min(8)` already enforced since Sprint 1.
- Files: `app/(public)/register/page.tsx`, `components/auth/change-password-form.tsx`.
- New test file `__tests__/auth/password-hint-text.test.tsx` (2 RED→GREEN render tests).

**Wave 12-B — Coach Integration IDs:**
- `hubspotId` and `circleId` were in the Prisma schema (`Coach` model, both `String? @unique`) but not exposed in any UI.
- Admin coach create form (`coaches/new/page.tsx`) and edit form (`coaches/[id]/edit/page.tsx`) now show editable "HubSpot Contact ID" + "Circle Member ID" text inputs via new `allowEditIntegrationIds?: boolean` prop on `CoachProfileForm`.
- Coach portal settings page shows both IDs as read-only monospace text (no editing — protects HubSpot/Circle sync integrity).
- API PATCH `api/coaches/[id]/route.ts`: coach session → 403; Prisma P2002 unique constraint on either ID → 409 with message "This HubSpot/Circle ID is already assigned to another coach".
- New test file `__tests__/api/coach-integration-ids.test.ts` (3 tests: admin 200, coach 403, duplicate 409).

**Wave 12-C — Survey Per-Person Ratings:**
- `SurveyResultsView` (per-workshop view) now lists individual respondent ratings below the average for RATING/NPS questions. Uses existing `formatRespondentLabel()` helper (full name → email → "Anonymous"). Denominator: `/5` for RATING, `/10` for NPS.
- `SurveyResultsPanel` (template editor aggregate view) distribution histogram was already implemented — 12-C-2 was a no-op.
- New test file `__tests__/surveys/survey-results-per-person.test.tsx` (4 tests: named respondents, anonymous, email-only fallback, empty state).

**Wave 12-D — Admin Approvals Price Display** (May 12 2026, direct push to main, Alpha mode):
- Admin approvals list for CUSTOM_PRICING now shows both "Original" and "Requested" prices for easy comparison.
- **Original price source priority:** (1) `requestData.oldPriceCents` (snapshot stored at request time), (2) fallback to live `workshop.priceCents`.
- Include pricing tier name when available: "Original: $X (Tier Name)".
- API route `/api/approvals` now includes `workshop.priceCents` + `workshop.pricingTier.name` in Prisma select.
- Approval interface extended with optional `workshop` property carrying pricing data.
- CUSTOM_PRICING badge changed from showing the price to generic label "Custom Price Requested".
- New test file `__tests__/admin/custom-price-approval.test.tsx` (5 tests covering fallback logic, tier display, both price lines, non-CUSTOM_PRICING no-op).
- 1114 tests passing; build succeeds.

### 2026-05-12 — Wave 8-D — HubSpot coach_contract_status auto-approval (May 12 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-12 ENTRY_SLUG:wave-8-d-hubspot-auto-approve -->

**Wave 8-D — HubSpot coach_contract_status auto-approval** (May 12 2026, direct push to main, Alpha mode):
- New `getHubSpotCoachContractStatus(hubspotContactId)` exported from `services/hubspot.ts`: calls `basicApi.getById` with `["coach_contract_status"]` property, returns `string | null`, throws on API error (fail-closed).
- New `evaluateHubSpotAutoApprove()` private helper in `lib/approval-engine.ts` inserts before the Circle cert check for `WORKSHOP_REQUEST` type. Three safety levers: `HUBSPOT_AUTO_APPROVE_ENABLED="true"` kill switch (default off), `HUBSPOT_AUTO_APPROVE_SHADOW="true"` log-only mode, `HUBSPOT_AUTO_APPROVE_ALLOWLIST="a@b,c@d"` comma-separated email allowlist. API error → `console.error` + return `{ autoApproved: false, reason: "hubspot_api_error: ..." }` (fail-closed, no DB write).
- Auto-approve path: creates ApprovalQueue row (PENDING), updates it to APPROVED with `respondedBy: "system:hubspot-coach-status"`, writes AuditLog row, emits `workshop/approved` Inngest event.
- `ApprovalEvaluationInput` gains optional `hubspotId?: string` field.
- `api/approvals/route.ts` coachBio select now includes `hubspotId: true` and passes it to `evaluateApproval`.
- 9/9 RED→GREEN tests at `__tests__/lib/hubspot-approval-engine.test.ts` (all 9 safety-lever scenarios).
- 1114 tests passing (up from 1105).

**v2.5 Sprint — COMPLETE** (May 8 2026 + Wave 6 May 10): 13 tickets shipped across 6 waves over three sessions. Direct push to main, Alpha mode. Test count 964 → 1021 (+57). Sprint plan: `~/.claude/plans/do-we-need-to-cryptic-swan.md`. Sprint ledger with full per-wave impl details: `plans/JEFF_MAY6_SPRINT.md`.

### 2026-05-11 — BUG-MAY11-1 — workshop PATCH never persisted stripePromotionCodeId (May 11 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-11 ENTRY_SLUG:bug-may11-1-stripe-promotion-id -->

**BUG-MAY11-1 — workshop PATCH never persisted stripePromotionCodeId** (May 11 2026, direct push to main, Alpha mode):
- Surfaced during the v2.5 end-to-end verification sweep. ENH-MAY6-7 (Wave 3 dollar-amount coupons) shipped with passing unit tests for `services/stripe.ts createWorkshopPromotionCode` (Stripe API call shape) but the integration was never exercised end-to-end. Saving any new coupon via the admin workshop edit form returned PATCH 200, but the public registration → Stripe Checkout flow rejected the code with "Discount code is invalid or expired" (POST `/api/checkout` → 400 `StripeDiscountCodeError`). Affected BOTH PERCENT and AMOUNT coupons — Stripe-side promotion code WAS created, the platform just never wrote the returned `stripePromotionCodeId` back into `Workshop.coupons`. Checkout-time validator read all-null `stripePromotionCodeId` from stored coupons → `allowedPromotionCodeIds` empty → reject.
- Fix at `src/app/api/workshops/[id]/route.ts`: Stripe sync moved BEFORE the workshop.update (was a fire-and-forget block after). Each parsedCoupon's Stripe call result is merged back via `{ ...coupon, stripeCouponId, stripePromotionCodeId }` so the `serializeWorkshopCoupons(parsedCoupons)` written to DB carries the IDs. New pre-pass diff-checks each incoming coupon against `parseStoredWorkshopCoupons(existing.coupons)` and reuses existing `stripePromotionCodeId` when `code + discountType + discountPercent + discountAmountCents + singleUse` are unchanged — prevents orphaning a fresh Stripe promo code on every re-save (e.g. when the admin edits only the title).
- 6/6 tests passing in `__tests__/api/workshop-coupons.test.ts`: existing-save-shape test updated to reflect the new merge; 3 new tests added (persist new ID, reuse existing ID on unchanged shape, recreate on changed shape). Full suite 1030/1030 (up from 1027).
- Operator follow-up: the `WAVE6TEST10` Stripe promotion code created during today's reproduction is orphaned in Stripe (not deleted from Stripe's account; just removed from `Workshop.coupons`). Recommend deleting via Stripe dashboard. Pre-fix promo codes for historical coupons may also be orphaned — auditing them is a separate cleanup.

### 2026-05-10 — Wave 6 — BUG-MAY6-9 + finalizeParentRollup wiring (May 10 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-10 ENTRY_SLUG:wave-6-bug-may6-9-rollup -->

**Wave 6 — BUG-MAY6-9 + finalizeParentRollup wiring** (May 10 2026, direct push to main, Alpha mode):
- **BUG-MAY6-9** — per-survey respondent attribution. The component `<SurveyResultsView>` shared between admin + coach per-workshop survey results pages was discarding `survey.registration` even though both consumer pages already fetched it via Prisma include. `SurveyResultResponse` interface now carries optional `registration: { firstName, lastName, email } | null`; both consumer pages thread it through; component renders attribution next to TEXT/TEXTAREA answers + a Respondents pill panel mirroring the aggregate-page (ENH-MAY6-8) pattern. Inline `formatRespondentLabel()` helper: trimmed full name → email → "Anonymous". 5 RED→GREEN tests at `__tests__/components/survey-results-view-respondent.test.tsx`.
- **Tier B: link-gen FAILED children + finalizeParentRollup wiring.** `execute-workflow.ts` SEND_SURVEY_LINK now writes a per-recipient FAILED child row (`errorMessage: "link_generation_failed"`) when `getOrCreateSurveyLink` returns null (was a silent `continue`). Post-loop `finalizeParentRollup(db, executionId)` call added after `recordWorkflowExecution` for SEND_SURVEY_LINK / SEND_FILE_LINK / EMAIL_ATTENDEES — parent now reflects FAILED > SENT > SKIPPED precedence over actual children. Both gated on `executionId` (set by pre-loop `scheduleWorkflowExecution` on the future RELATIVE_TO_EVENT path); the immediate path remains a documented gap until per-recipient idempotency lands in Beta. SEND_FILE_LINK + EMAIL_ATTENDEES rollup is a no-op today (no FAILED children) — enables future SMTP error classification work to flip them on without further wiring. 1 new RED→GREEN test extends `__tests__/inngest/execute-workflow.test.ts`.
- 1021 tests passing (up from 1015).

### 2026-05-10 — Wave 6 follow-on Part 2 — Trigger Now EMAIL_ATTENDEES + SEND_FILE_LINK parity (May 10 2026, commit `d88eb8c`, direct push to main): <!-- ENTRY_ISO:2026-05-10 ENTRY_SLUG:wave-6-followon-part-2 -->

**Wave 6 follow-on Part 2 — Trigger Now EMAIL_ATTENDEES + SEND_FILE_LINK parity** (May 10 2026, commit `d88eb8c`, direct push to main):
- Extends the Part 1 pattern (parent pre-create + per-recipient SENT writes + post-loop update + finalizeParentRollup) to the EMAIL_ATTENDEES and SEND_FILE_LINK handlers in `trigger-workflow-step.ts`. Manual Trigger Now now produces the same audit shape as scheduled fires across all three per-recipient step types.
- Side-effect: fixes latent BUG-MAY4-1b twin on Trigger Now EMAIL_ATTENDEES — the post-loop terminal write was `status: "SENT"` unconditionally, even with 0 registrants. Now `sentEmails.size > 0 ? "SENT" : "SKIPPED"` matching execute-workflow.ts.
- Terminal-auth-error FAILED branches in both handlers now transition the existing parent via `update()` (was a second `create()` that orphaned the SCHEDULED row).
- 3 new RED→GREEN tests + 2 existing tests updated. 1024 → 1027 tests.

### 2026-05-10 — Wave 6 follow-on Part 1 — Trigger Now SEND_SURVEY_LINK parity (May 10 2026, commit `c204dbf`, direct push to main): <!-- ENTRY_ISO:2026-05-10 ENTRY_SLUG:wave-6-followon-part-1 -->

**Wave 6 follow-on Part 1 — Trigger Now SEND_SURVEY_LINK parity** (May 10 2026, commit `c204dbf`, direct push to main):
- Closes Codex round-3 MED 3 from the Wave 6 review. `trigger-workflow-step.ts` (manual Trigger Now path) SEND_SURVEY_LINK handler was diverging from the scheduled `execute-workflow.ts` path: silently `continue`d on `!surveyLink` and wrote no per-recipient rows. On-call manual repro produced different audit data than the scheduled fire that originally failed.
- Fix at `src/inngest/functions/trigger-workflow-step.ts`: (1) Pre-create parent WorkflowStepExecution row with `status: "SCHEDULED"` at top of SEND_SURVEY_LINK handler, capture `parentId`. (2) On `!surveyLink`, call `recordRecipientExecution` with `status: "FAILED"` + `errorMessage: "link_generation_failed"` then continue. (3) After successful SMTP send, call `recordRecipientExecution` with `status: "SENT"`. (4) Replace post-loop `db.workflowStepExecution.create({ data: { status: TERMINAL } })` with `update({ where: { id: parentId } })` — was a second create. (5) Call `finalizeParentRollup(db, parentId)` post-update.
- Scope: SEND_SURVEY_LINK only. SEND_FILE_LINK + EMAIL_ATTENDEES Trigger Now paths still use the old shape — they ship together with the Beta rollup-retry-safety unit once SMTP error classification lands (same scope decision as Wave 6 scheduled-path).
- 3 new RED→GREEN tests + 3 existing tests updated for create→update transition. 1021 → 1024 tests.

### 2026-05-08 — Wave 5 — BUG-MAY6-4a (Notion: [3598c45d…f634](https://www.notion.so/3598c45dd82981c5847fe5be0eb1f634)) — Audit script at `src/scripts/audit-cross-workshop-coupons.ts` lists historical Stripe redemptions where the promo code's `metadata.workshopCode` doesn't match the registration's workshopCode (cross-workshop redemptions before the May 7 fix). Output is CSV to stdout with verdict per row. Read-only / dry-run only. Operator-invoked via `npx tsx scripts/audit-cross-workshop-coupons.ts [--since YYYY-MM-DD] [--limit N]`. Hand-off to Jeff for per-case refund/accept judgment. NO auto-refunds. <!-- ENTRY_ISO:2026-05-08 ENTRY_SLUG:wave-5-bug-may6-4a-audit-script -->

**Wave 5 — BUG-MAY6-4a** (Notion: [3598c45d…f634](https://www.notion.so/3598c45dd82981c5847fe5be0eb1f634)) — Audit script at `src/scripts/audit-cross-workshop-coupons.ts` lists historical Stripe redemptions where the promo code's `metadata.workshopCode` doesn't match the registration's workshopCode (cross-workshop redemptions before the May 7 fix). Output is CSV to stdout with verdict per row. Read-only / dry-run only. Operator-invoked via `npx tsx scripts/audit-cross-workshop-coupons.ts [--since YYYY-MM-DD] [--limit N]`. Hand-off to Jeff for per-case refund/accept judgment. NO auto-refunds.


### 2026-05-07 — Jeff May 6 Workflow Bugs — Complete (May 7 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-07 ENTRY_SLUG:jeff-may6-workflow-bugs -->

**Jeff May 6 Workflow Bugs** — Complete (May 7 2026, direct push to main, Alpha mode):
- Source: Jeff Verdun email "Updated_workflow testing results" (May 6 7:29 PM). Workshop `WS-2026-SVOY` test surfaced two bugs; Codex co-validate caught a third latent bug that ships with the fix.
- **BUG-MAY6-1** (Notion: [3598c45d…81e9](https://www.notion.so/3598c45dd82981e98578c7a6069f4ba4)) — "Standard Test Event" Step 2 (Send Survey Link, **2h before**) fired at 1h before. Root cause: `execute-workflow.ts` iterated `workflow.steps` in `sortOrder` with sequential `step.sleepUntil`. After Step 1's sleep ended at 3 PM, Step 2's scheduled time (2 PM) was already in the past → past-guard fired immediately. New `lib/workflows/order-steps-for-execution.ts` pure helper sorts RELATIVE_TO_EVENT steps by ascending `sendAt` before the loop. Inngest step keys (`step-${sortOrder}-${stepType}`) are immutable per step, so reordering iteration doesn't drift idempotency keys.
- **BUG-MAY6-2** (Notion: [3598c45d…8165](https://www.notion.so/3598c45dd82981658cddc67c70c1aee3)) — "Post-Event Coach Survey Sequence" did not auto-attach on approval. Root cause: `auto-build-service.ts:assignWorkflow` had three issues. (1) Asymmetric WHERE — `workshopFormat` was `OR null` wildcard, but `categoryId` was hard equality when workshop had a category, so the seeded wildcard-category workflow never matched a categoried workshop. (2) `orderBy: { workshopFormat: "desc" }` actually puts NULL **first** under Postgres default null-ordering, so wildcard beat specific (Codex catch). (3) No `isTemplate: true` filter — admin-cloned customizations could shadow templates. Replaced inline `findFirst` with new `lib/workflows/find-auto-attach-workflow.ts` pure ranker: filter eligible candidates in code (category-compatible + format-compatible), then rank by specificity (categoryId 2pts + workshopFormat 1pt, tiebreak `updatedAt`). DB query is now `findMany` filtered to `isActive: true` AND `isTemplate: true` AND matching `workflowPhase`. Verified prod DB has the workflow with correct shape (was always there; matcher just couldn't see it).
- **BUG-MAY6-3** (Notion: [3598c45d…81ab](https://www.notion.so/3598c45dd82981abbce9c584b79ecae7)) — `calculateSendDate` declared a `timezone` param but never used it. `sendTimeOfDay: "09:00"` called `setHours(9, 0, 0, 0)` which on Vercel's UTC server set UTC 09:00, not workshop-local 09:00. Post-Event Step 1 ("1 day after at 9 AM") would fire at 4–5 AM Eastern. New `setWallClockInTimezone(date, timezone, hours, minutes)` exported helper in `lib/workflows/resolve-event-start-moment.ts` reuses the existing `Intl.DateTimeFormat` offset pattern. `calculateSendDate` now uses it when `timezone` is provided; falls back to `setUTCHours` when no timezone (production code always passes a timezone). The `offsetHours` path is unchanged.
- 964 tests passing (up from 951) — 3 new RED→GREEN test files: `order-steps-for-execution.test.ts` (5 tests), `find-auto-attach-workflow.test.ts` (8 tests), `calculate-send-date-timezone.test.ts` (5 tests). Updated `auto-build-service.test.ts` (mock `findMany` instead of `findFirst`) and `workflow-service.test.ts` (3 assertions switched from `setHours` → `setUTCHours` for the no-timezone branch — they were latently TZ-dependent and only passed on UTC servers; production unchanged).
- Tech debt note (Codex): the right long-term shape is per-step Inngest fan-out (one event per step → independent function with `sleepUntil`), creating SCHEDULED rows up-front and isolating 1-day/30-day post-event sleeps. Filed as follow-on: hotfix scope only.
- Plan: `~/.claude/plans/workflow-bugs-elegant-curry.md`. Sprint ledger: `plans/JEFF_MAY6_SPRINT.md`.

### 2026-05-05 — Jeff May 4 Meeting Bugs — Complete (May 5 2026, merged in two PRs #12 + #13): <!-- ENTRY_ISO:2026-05-05 ENTRY_SLUG:jeff-may4-meeting-bugs -->

**Jeff May 4 Meeting Bugs** — Complete (May 5 2026, merged in two PRs #12 + #13):
- BUG-MAY4-1a (timing): `Workshop.eventDate` stored as midnight UTC; `eventTime` ("16:00 - 18:00") and `timezone` ("America/New_York") were never combined when computing `scheduledFor`. New `lib/workflows/resolve-event-start-moment.ts` helper converts wall-clock + IANA zone → true UTC start moment via `Intl.DateTimeFormat` offset math (no new deps, handles DST). `execute-workflow.ts` now feeds `resolveEventStartMoment(workshop)` into `calculateSendDate` instead of raw `new Date(workshop.eventDate)`. Fixes the 20-hour skew that made all steps fire immediately at workflow assignment.
- BUG-MAY4-1b (false-SENT): `EMAIL_ATTENDEES` always wrote `status="SENT"` even with 0 registrants. Fixed to `sentEmails.size > 0 ? "SENT" : "SKIPPED"` with `error: "No recipients at scheduled time"`. `SEND_SURVEY_LINK` already used `sentCount`-based status; `SEND_FILE_LINK` already had an early-exit guard.
- BUG-MAY4-2 (duplicate email): `runAutoBuild` called concurrently from GET email-link + POST dashboard approval handlers, both calling `sendWorkshopBuiltEmail`. Fixed with atomic `db.workshop.updateMany({ where: { workshopBuiltEmailSentAt: null } })` claim — only the first concurrent caller wins. New `Workshop.workshopBuiltEmailSentAt DateTime?` column (migration `20260505100000_add_workshop_built_email_sent_at`). Also added `id: "workshop-approved-${workshopId}-${approvalId}"` to all 3 `inngest.send("workshop/approved")` calls for Inngest-level dedup keyed to approvalId.
- BUG-MAY4-3 (misleading badges): Per-step SENT/SKIPPED/FAILED badges removed from workshop detail Workflow Status card and workflow editor Execution Status tab. A step fires per-recipient — a single badge across N attendees is meaningless.
- **Follow-on PR #15 (May 6 2026, commit `07c58a8`):** three residual fixes surfaced during May 5 production manual test:
  - SEND_SURVEY_LINK 0-recipients message: `execute-workflow.ts` now early-exits before the survey loop and writes `error: "No recipients at scheduled time"` (was misleading `"No survey link could be generated"`). Existing `sentCount === 0` fallback preserved for genuine link-gen failures (regression-guarded).
  - SEND_FILE_LINK false-SENT: `execute-workflow.ts` SEND_FILE_LINK handler now tracks `fileEmailsSent` and writes `status: "SENT"` only if at least one email went out. With files attached AND 0 registrants the row was previously written as SENT — same shape as the EMAIL_ATTENDEES bug fixed in BUG-MAY4-1b.
  - Trigger Now midnight-UTC body context: `trigger-workflow-step.ts:109` now feeds `resolveEventStartMoment({ eventDate, eventTime, timezone })` into the email body interpolation context. Was using raw `new Date(workshop.eventDate)` (midnight UTC) so `{{workshopDate}}` / `{{workshopTime}}` substitutions landed on the wrong day for workshops where the local-zone moment differs from midnight UTC. Same swap `execute-workflow.ts` got in BUG-MAY4-1a.
- 936 tests passing (up from 933) — 3 new RED→GREEN guards (SEND_SURVEY_LINK error msg, SEND_FILE_LINK files-with-0-recipients, trigger-workflow-step `workshopDate` uses `resolveEventStartMoment`)
- **Direct-push gap fix (May 6 2026, commit `47f7073`):** during PR #15 production verification, found that `trigger-workflow-step.ts` (the manual Trigger Now path) had IDENTICAL twin bugs PR #15 didn't touch — its SEND_SURVEY_LINK handler at line 425 wrote `"No survey link could be generated"` for 0 recipients, and its SEND_FILE_LINK handler at line 582 wrote unconditional `status: "SENT"`. Both fixed with the same shape PR #15 used: early-exit before survey loop with `errorMessage: "No recipients at scheduled time"`, and `fileEmailsSent` counter for file-link terminal status. Direct push to main per Alpha-mode deploy rule. 939 tests passing (up from 936).

### 2026-05-06 — Vimeo Embed Bug — Complete (May 6 2026, commit `22ec4f7`, direct push to main): <!-- ENTRY_ISO:2026-05-06 ENTRY_SLUG:vimeo-embed-bug -->

**Vimeo Embed Bug** — Complete (May 6 2026, commit `22ec4f7`, direct push to main):
- Source: Jeff email May 5 5:53 PM — pasting bare Vimeo URLs (no embed HTML) failed to render. Confirmed via production trace + read of `normalizeVideoUrl()` in `lib/templates/landing-page-overlay.ts`.
- Two root causes:
  1. **Regex undercount.** Old regex `/(?:vimeo\.com\/)(\d+(?:\/[a-f0-9]+)?)/` ignored Vimeo's `?h=HASH` query-string share URLs (the modern share form for unlisted videos) — the hash was silently dropped, so unlisted videos served a privacy-blocked player. Path-form `/HASH` was preserved verbatim, but `player.vimeo.com/video/ID/HASH` 410s on the player domain — Vimeo's canonical embed URL is query-form `?h=HASH`. Fix: regex now captures both path-form `/HASH` and query-form `?h=HASH` and emits canonical query form for both.
  2. **Editor preview / template-content-editor / thank-you preview** rendered raw `formData.videoUrl` straight into the iframe `src` — `normalizeVideoUrl` was only called on the public `/workshop/[slug]` route. Fix: moved the normalize call inside `solo-landing-page-template.tsx` and `thank-you-page-template.tsx` so all 4 broken render paths benefit at once (idempotent for already-canonical URLs).
- Production verification on the live editor preview: all 4 supported input forms produce canonical iframe src (`vimeo.com/ID` → `player.vimeo.com/video/ID`; `vimeo.com/ID/HASH` → `player.vimeo.com/video/ID?h=HASH`; `vimeo.com/ID?h=HASH` → unchanged player form; `player.vimeo.com/video/ID?h=HASH` → idempotent). Vimeo's player domain returns 200 on the canonical URL.
- 946 tests passing (up from 939) — 7 new RED→GREEN guards: 3 normalizeVideoUrl unit tests + 4 template component tests asserting iframe src is normalized.
- CSP `frame-src` is currently Stripe-only and report-only (not enforced) — not the root cause here, but tightening it (allowlist `player.vimeo.com` + `youtube.com`) is queued as a defense-in-depth follow-on if/when CSP gets enforced.

### 2026-05-04 — Jeff Apr 30 Sprint — Complete (May 4 2026, all 12 items on main): <!-- ENTRY_ISO:2026-05-04 ENTRY_SLUG:jeff-apr30-sprint -->

**Jeff Apr 30 Sprint** — Complete (May 4 2026, all 12 items on main):
- BUG-01 (commit b139380): password-reset welcome email link no longer 404s — dropped `/auth/` prefix from `api/coaches/route.ts:142` + `api/coaches/[id]/send-password-reset/route.ts:34`
- CHG-02 (commit e00139e): `CERTIFICATION_CONFIDENCE_THRESHOLD` raised 85→101 — every workshop now hits Suzanne. Dead branch preserved as re-enable point
- BUG-03 + BUG-04 + BUG-10 (commit f5bb323): coach detail "Open ↗" button alongside copy-URL; "View Registrations" gated to PRE_EVENT/POST_EVENT/COMPLETED only; workflow editor help tooltip lists `{{surveyUrl}}` + `{{fileLinks}}`
- BUG-02 + ENH-01 + ENH-02 (commit 603b6f9): coach My Workshops "Pricing" column split into Workshop Type + Cost (with isFree-aware render rules); admin Create Workshop wizard label "Workshop Price *" → "Workshop Type *"
- BUG-05 (commit 2f2fc0f): date-format sweep on "Oct 1, 2026" (`dateStyle: "medium"`) + utility renames `formatDate→formatTimestamp`, `formatEventDate→formatEventDateUTC`, `formatDateTime→formatTimestampDateTime`. Five sites switched from zoned → UTC for event dates (workshops list, registration success, financials, admin coach detail, notifications)
- BUG-05-followup (commit 80e7df6): caught during May 4 prod verification — coach workshop detail still rendered `8/12/2026` from inline `.toLocaleDateString()` shims that pre-dated the sprint and weren't part of the original sweep's named-utility scope. Fixed 17 sites across 12 files (coach workshop detail + admin approvals/workflows + invite section + file manager + approval thread + workshop list filters + workflow editor + activate-template modal + Step2Logistics + approvals route email body). New regression guard at `src/__tests__/lint/no-inline-tolocaledatestring.test.ts` flags zero-arg / timezone-only / numeric-month patterns; CI will fail any future reintroduction
- BUG-02-admin-followup (commit 3bc65fb): caught during May 4 transcript-grounded re-verification — admin `/workshops` list still showed only `Cost + Format` columns; the half-day/full-day pricing-tier label only appeared as a subtitle under the workshop title. Original BUG-02 (commit 603b6f9) fixed the coach side but missed the admin dashboard, which was Jeff's literal Apr 30 ask (transcript 1:13–2:11). Added `pricingTier: true` to the admin Prisma include, inserted a new `Workshop Type` header + cell rendering `pricingTier?.name` with em-dash fallback. Regression guard at `src/__tests__/admin/workshops-list-columns.test.ts` asserts both `Cost` + `Workshop Type` headers + the `pricingTier: true` include remain in source
- CHG-01 (commit 0c8ae69): edit-and-resubmit flow removed entirely — `api/workshops/[id]/resubmit/route.ts` deleted; `resubmit-workshop.tsx` pruned to info_requested-only; DENIED + CANCELED workshops show "Submit a new request" CTA → `/portal/request`. INFO_RESPONSE post body fixed to include `action: "INFO_RESPONSE"` (was silently rejected by route handler)
- BUG-09 (commit db9245d): WorkflowStepExecution `scheduledFor` now preserved end-to-end. New helpers `scheduleWorkflowExecution()` + `recordWorkflowExecution()`. RELATIVE_TO_EVENT future sends now create a SCHEDULED row pre-sleep so the portal Workflow Status card shows the planned fire time. Cancel cleanup broadened from `status: "PENDING"` to `status: { in: ["PENDING", "SCHEDULED"] }`
- BUG-06–08 (commit 6941e64): every approval mutation now appends a thread message — initial coach REQUEST (Prisma nested write), admin INFO_REQUEST/COUNTER_OFFER/APPROVED/DENIED (POST + email-link GET), coach INFO_RESPONSE/COUNTER_ACCEPT/COUNTER_DECLINE/COUNTER_COUNTER (with COUNTER_COUNTER newly wrapped in `$transaction`). Helper at `lib/approvals/approval-thread.ts`. New `ApprovalMessage.synthetic` column with index for clean backfill rollback. One-time backfill at `scripts/backfill-approval-messages.ts` with mandatory `--dry-run` + dup-check on `synthetic = true` AND text shape
- CHG-03 (commit ef9fb39): iDev affiliate pixel now driven by admin-pasted `LandingPage.customCode` instead of `IDEV_SCRIPT_URL` env var. New `LandingPage.customCode` column + `Registration.@@index([stripeSessionId])`. parse5-based `validateCustomCode()` (img-only, https-only, host pinned to scalingup.idevaffiliate.com, no scripts/event handlers/style/data:/javascript:) at both save-time AND render-time. `interpolateCustomCode()` substitutes `{{saleAmount}}`, `{{orderNumber}}`, `{{email}}`, `{{currency}}` URL-encoded then HTML-escaped. Shared `<CustomCodeRenderer>` mounted at both `/workshop/[slug]?session_id=` (THANK_YOU LandingPage path) and `/registration/success` (fallback). `IdevTracking` component + `IDEV_SCRIPT_URL` env var deleted. customCode never accepted from request bodies on coach-accessible routes
- 914 tests passing (up from 861) — adds the `no-inline-tolocaledatestring` regression guard from BUG-05-followup + the `workshops-list-columns` guard from BUG-02-admin-followup

### 2026-04-29 — Jeff Apr 28 Sprint — Complete (commit 229faee on main, Apr 29 2026): <!-- ENTRY_ISO:2026-04-29 ENTRY_SLUG:jeff-apr28-sprint -->

**Jeff Apr 28 Sprint** — Complete (commit 229faee on main, Apr 29 2026):
- `formatStepLabel()` helper strips `{{tokens}}`, falls back to STEP_TYPE_LABELS
- Workflow Status card: step names now visible (flex min-w-0 layout fix)
- Trigger Now: auto-refreshes page after fire; SENT steps re-triggerable via `forceResend=true` flag
- `SEND_SURVEY_LINK` step now fires: passes `surveyTemplateId` to `getOrCreateSurveyLink`; PRE_WORKSHOP template seeded to prod
- CSV export `GET /api/registrations/export` (RFC 4180, injection-safe, confirmed-only)
- Contacts page: h1 → "Contacts", Export All button
- 861 tests passing (up from 847)

### 2026-02-15 — Sprint 0 (Schema Foundation) — Complete <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-0-schema-foundation -->

**Sprint 0** (Schema Foundation) — Complete
### 2026-02-15 — Sprint 1 (Security + Auth + Critical Bug Fixes) — Complete <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-1-security-auth -->

**Sprint 1** (Security + Auth + Critical Bug Fixes) — Complete
### 2026-02-15 — Sprint 2 (Workshop Wizard & UI) — Complete (15/15 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-2-wizard-ui -->

**Sprint 2** (Workshop Wizard & UI) — Complete (15/15 tasks)
### 2026-02-15 — Sprint 3 (Dashboards + Notifications + Polish) — Complete (11/11 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-3-dashboards -->

**Sprint 3** (Dashboards + Notifications + Polish) — Complete (11/11 tasks)
### 2026-02-15 — Sprint 4 Track D (ICS Calendar Files) — Complete (3/3 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-4-d-ics -->

**Sprint 4 Track D** (ICS Calendar Files) — Complete (3/3 tasks)
### 2026-02-15 — Sprint 4 Track A (Workflow Editor) — Complete (6/6 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-4-a-workflow-editor -->

**Sprint 4 Track A** (Workflow Editor) — Complete (6/6 tasks)
### 2026-02-15 — Sprint 4 Track C (Survey System) — Complete (6/6 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-4-c-surveys -->

**Sprint 4 Track C** (Survey System) — Complete (6/6 tasks)
### 2026-02-15 — Sprint 4 Track B (File Attachments) — Complete (4/4 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-4-b-files -->

**Sprint 4 Track B** (File Attachments) — Complete (4/4 tasks)
### 2026-02-15 — QA Sprint (Visual QA & Blocker Fixes) — Complete (6/6: mobile nav, follow-up form, settings save, search cleanup, error boundaries, quick actions) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:qa-sprint-visual -->

**QA Sprint** (Visual QA & Blocker Fixes) — Complete (6/6: mobile nav, follow-up form, settings save, search cleanup, error boundaries, quick actions)
### 2026-02-15 — JV Gap Fixes (Admin Create Workshop Form) — Complete (3/3: dynamic categories, pricing tier dropdown, terms checkbox) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:jv-gap-fixes -->

**JV Gap Fixes** (Admin Create Workshop Form) — Complete (3/3: dynamic categories, pricing tier dropdown, terms checkbox)
### 2026-02-20 — Production Readiness — Complete (7/7 gaps fixed): <!-- ENTRY_ISO:2026-02-20 ENTRY_SLUG:production-readiness -->

**Production Readiness** — Complete (7/7 gaps fixed):
- Category + PricingTier seed data added to `prisma/seed.ts`
- Approvals route now wires `categoryId`/`pricingTierId` into Workshop create
- Survey submission rate limiting (20 req/min via Redis)
- File upload filename sanitization (path traversal prevention)
- File DELETE ownership check (only uploader or admin/staff can delete)
- INNGEST env vars added to `.env.example`
### 2026-02-20 — UI/UX Overhaul Phase 1 — Complete (via UI/UX Pro Max Skill): <!-- ENTRY_ISO:2026-02-20 ENTRY_SLUG:ui-ux-overhaul-phase-1 -->

**UI/UX Overhaul Phase 1** — Complete (via UI/UX Pro Max Skill):
- Design system generated: Trust & Authority style, data-dense dashboard palette
- Font: Plus Jakarta Sans (replaced Geist Sans) — professional, SaaS-friendly
- Primary color deepened to #1D4ED8 (Blue 700) for trust/authority
- Extended CSS tokens: success/warning/info semantics, shadow depth scale, animation tokens
- `prefers-reduced-motion` support added globally
- 7 upgraded components: Button (success/warning variants, hover lift, active press), Card (hover shadow), Input (focus animation), Badge (rounded-full, semantic colors), Table (header bg, uppercase tracking), StatusPill (pulse on active), ConfirmationModal (polish)
- 9 new components: Skeleton, Tooltip, Popover, Progress, Avatar, Separator, Alert (5 variants), EmptyState, PageHeader
- 4 Radix dependencies added: tooltip, popover, progress, separator
- Framer Motion installed + `src/lib/animations.ts` with reusable variants
- Admin layout: sticky nav with backdrop blur, avatar, semantic tokens
- Coach layout: polished sidebar with primary-colored avatar
- Design system persisted: `design-system/scaling-up-platform/MASTER.md` + page overrides
- DB tables confirmed in sync via `prisma db push` (no migration needed)

### 2026-02-25 — UI/UX Phase 2+ (Animations + Dark Mode) — Complete: <!-- ENTRY_ISO:2026-02-25 ENTRY_SLUG:ui-ux-phase-2-dark-mode -->

**UI/UX Phase 2+ (Animations + Dark Mode)** — Complete:
- Framer Motion animations added to 15+ pages (FadeUp, StaggerContainer, StaggerItem wrappers)
- Dark mode: next-themes integration, ThemeProvider, ThemeToggle in all 3 layouts
- `.dark` CSS variable overrides in globals.css

### 2026-02-25 — Dark Mode Color Migration — Complete: <!-- ENTRY_ISO:2026-02-25 ENTRY_SLUG:dark-mode-color-migration -->

**Dark Mode Color Migration** — Complete:
- 1,000+ hardcoded gray Tailwind classes replaced across 80 files
- Replacements: text-gray-* → text-foreground/text-muted-foreground, bg-white → bg-card, bg-gray-50 → bg-muted, border-gray-* → border-border, divide-gray-* → divide-border, hover:bg-gray-* → hover:bg-accent
- Admin approvals page rewritten from inline JSX styles to Tailwind classes
- Semantic status colors (green, red, yellow, orange, blue) intentionally preserved
- Commit: `edfc722`

### 2026-02-25 — Phase F: Defensive Code Fixes — Complete (3/3): <!-- ENTRY_ISO:2026-02-25 ENTRY_SLUG:phase-f-defensive -->

**Phase F: Defensive Code Fixes** — Complete (3/3):
- HubSpot: Lazy client init via Proxy, `isHubSpotConfigured()` guard on all 8 exported functions — returns no-op when `HUBSPOT_ACCESS_TOKEN` missing
- Circle.so: `getCircleProfileByEmail()` returns `null` when `CIRCLE_API_KEY` missing (verifyCertification already handled)
- Inngest: Startup warnings when `INNGEST_EVENT_KEY` or `INNGEST_SIGNING_KEY` missing

### 2026-02-20 — CIO Revision Audit Pass (Feb 20, 2026) — Complete (P0 updates): <!-- ENTRY_ISO:2026-02-20 ENTRY_SLUG:cio-audit-feb20 -->

**CIO Revision Audit Pass (Feb 20, 2026)** — Complete (P0 updates):
- Navigation clarity: `All Workshops` naming restored in admin IA
- Added direct `Bio` nav route and `Financials` nav route in admin header
- Workshop Editor scope tightened to workshop pages (removed BIO page from template picker)
- Admin Create Workshop: removed visible Workshop Type field (category-first flow)
- Paid workshops now require approved pricing tier selection (manual fallback removed)
- Free registration path now syncs to HubSpot (paid sync already handled by Stripe webhook)

### 2026-02-26 — Context Bloat Cleanup (Feb 26, 2026) — Complete: <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:context-bloat-cleanup -->

**Context Bloat Cleanup (Feb 26, 2026)** — Complete:
- Deleted 6 dead code files (~800 lines): animations.ts, cache.ts, api-handler.ts, logger.ts, landing-page-auto-populate.ts, workshop-generator.ts
- Fixed toast dismiss bug in `use-toast.ts` L109 (`onsubmit` → `toastId`)
- Removed unused `bullmq` dependency (12 sub-packages)
- Consolidated 3 duplicate SMTP transports into shared `lib/smtp-transport.ts`
- Merged dual admin layouts: moved 6 pages from standalone `/admin/` into `(dashboard)/admin/`
- npm audit fix: 1 fixed, 3 low-severity cookie vulns deferred (next-auth breaking change)
- All verified: 0 type errors, 226/226 tests pass, build succeeds

### 2026-02-27 — Security Hardening S1-S8 (Feb 27, 2026) — Complete (commit `3a685ca`): <!-- ENTRY_ISO:2026-02-27 ENTRY_SLUG:security-hardening-s1-s8 -->

**Security Hardening S1-S8 (Feb 27, 2026)** — Complete (commit `3a685ca`):
- S1: Nonce added to password reset tokens (`lib/auth/password-reset.ts`)
- S2: Webhook secret enforcement in production (Typeform + Stripe)
- S3: Question-to-survey template validation (`lib/surveys/survey-service.ts`)
- S4: JSON.parse try-catch in forgot-password route
- S5: Error handlers on 3 API routes (workflow assign, survey submit, survey endpoint)
- S6: 15-second AbortController timeouts on external APIs (Stripe, Circle, HubSpot)
- S7: Auto-build idempotency guard (prevents duplicate builds on Inngest retry)
- S8: Email attendee deduplication via Set in workflow execution
- S9 (Mar 2): Auto-build idempotency guard returns structured `{ skip, pageCount, status }` (replaces bare boolean for debuggability)

### 2026-02-27 — Test Coverage Push T1-T10 (Feb 27, 2026) — Complete: <!-- ENTRY_ISO:2026-02-27 ENTRY_SLUG:test-coverage-t1-t10 -->

**Test Coverage Push T1-T10 (Feb 27, 2026)** — Complete:
- 37 test suites / 415 tests total (up from 28/269)
- 9 new test files: auto-build, execute-workflow, workshop-status, surveys, auth, files, workshop-resubmit, completion-summary, typeform-webhook
- All critical paths now covered: Inngest functions, auth routes, status transitions, file upload, webhooks
- 8 Playwright E2E spec files covering 40+ automatable checks across 12 rounds
- 12 remaining manual checks require email inbox / external service access (see `plans/MANUAL_VERIFICATION_REMAINING_CHECKS.md`)
- Production launch guide: `plans/PRODUCTION_LAUNCH_GUIDE.md`

### 2026-03-02 — Phase 4 Smoke Test (Mar 2, 2026) — Complete (12/12 checks passed): <!-- ENTRY_ISO:2026-03-02 ENTRY_SLUG:phase-4-smoke-test -->

**Phase 4 Smoke Test (Mar 2, 2026)** — Complete (12/12 checks passed):
- Tests #1-6: Image upload, emails (requested/approved/denied), auto-status, landing pages
- Test #7: Auto-build pipeline verified end-to-end (7 Inngest steps, status → PRE_EVENT)
- Test #8: Workflows — code correct, no workflows configured yet (content dependency)
- Tests #9-10: No broken placeholders, registration flow works
- Test #11: Stripe payment (verified in Phase 3)
- Test #12: Inngest running (5 functions registered)
- Fix 8 deployed: Structured idempotency logging in auto-build (`{ skip, pageCount, status }` instead of bare boolean)
- Content gaps identified: No active landing page templates, no workflows configured (data setup, not code bugs)
- Production launch assessment: `plans/PRODUCTION_LAUNCH_GUIDE.md` (Steps 1-3, 5, 8 still pending)

### 2026-03-03 — Production Configuration (Mar 3, 2026) — Complete (Steps 1-10): <!-- ENTRY_ISO:2026-03-03 ENTRY_SLUG:production-configuration -->

**Production Configuration (Mar 3, 2026)** — Complete (Steps 1-10):
- 35 env vars pushed to Vercel via `scripts/push-env-to-vercel.mjs` (with production overrides for NEXTAUTH_URL, APP_URL, LANDING_PAGE_BASE_URL, DEMO_MODE)
- Stripe webhook configured (3 events: checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed)
- Inngest verified: 5 functions active (auto-build-workshop, check-stale-approvals, execute-workflow, schedule-email-sequence, workshop-completion-summary)
- "Standard Pre-Event Sequence" workflow created (Phase=Pre-Event, 1 email step: 1 day before event)
- Snake_case variable aliases added to `interpolateTemplate()` — both `{{workshop_title}}` and `{{workshopTitle}}` now work
- `workshopFormat` variable added to workflow context
- Production smoke test passed (5/5 tests): workshop create, approve, auto-build, Inngest runs, landing page render
- Vercel Analytics + Speed Insights installed (`@vercel/analytics`, `@vercel/speed-insights` in root layout)
- Go-live checklist: `plans/GO_LIVE_CHECKLIST.md`
- Handoff document: `plans/PRODUCTION_HANDOFF_MARCH_2026.md`
- Commits: `c0c002d` (variable aliases), pending commit (analytics + handoff docs)

### 2026-03-10 — Admin Capabilities (Mar 6-10, 2026) — Complete: <!-- ENTRY_ISO:2026-03-10 ENTRY_SLUG:admin-capabilities -->

**Admin Capabilities (Mar 6-10, 2026)** — Complete:
- Workshop permanent delete: `POST /api/workshops/[id]/delete` (ADMIN-only, CANCELED/COMPLETED only, title confirmation)
- Coach delete fix: CASCADE on Workshop/ApprovalQueue/FollowUpReport FKs, transaction deletes Coach + User, cascade counts in audit log
- Admin invite system: `AdminInvite` model, crypto token (7-day TTL), accept-invite page, bcrypt(12) passwords
- Auth modification: `src/lib/auth/auth.ts` — non-canonical ADMIN emails checked against AdminInvite (must have acceptedAt set)
- New files: `delete-workshop-dialog.tsx`, `delete-coach-button.tsx`, `invite-admin-section.tsx`, `accept-invite/page.tsx`
- New API routes: `/api/workshops/[id]/delete`, `/api/admin/invite`, `/api/admin/invite/[id]`, `/api/auth/accept-invite`

### 2026-03-10 — Verification Hardening (Mar 10, 2026) — Complete: <!-- ENTRY_ISO:2026-03-10 ENTRY_SLUG:verification-hardening -->

**Verification Hardening (Mar 10, 2026)** — Complete:
- MR-28: Auto-build logs warning + returns `noTemplatesAvailable` flag when no active templates exist
- MR-37: Workflow tooltip replaced with Radix `<Tooltip>` (accessible, keyboard-navigable, aria-label)
- Coach delete: audit trail counts inside transaction, `hasActiveWorkshops` uses dedicated count query (not limited by `take: 10`)
- Coach delete UI: uses `useToast` instead of `alert()`, confirmation mentions approvals + follow-up reports
- Security: `isCanonicalAdminEmail` now fails closed (returns false when `ADMIN_EMAIL` unset)
- Security: accept-invite token comparison uses `crypto.timingSafeEqual` (timing-safe)
- Security: admin invite API routes properly return 401 for unauthenticated (not 403)
- Invite UI: loading state prevents false "No invitations yet" flash during initial fetch
- March audit state: 36 PASS, 10 CONCERN (5 resolved by design, 2 fixed, 1 need manual proof, 2 flagged for Jeff), 0 GAP

### 2026-03-18 — Figma Revisions Batch (Mar 17–18, 2026) — ALL 11 REVISIONS COMPLETE (52 suites / 488 tests): <!-- ENTRY_ISO:2026-03-18 ENTRY_SLUG:figma-revisions-batch -->

**Figma Revisions Batch (Mar 17–18, 2026)** — **ALL 11 REVISIONS COMPLETE** (52 suites / 488 tests):
- Sprint 1 (P0 bugs): FIG-001 auto-title category reactive useEffect; FIG-010 isFree = priceCents===0 fix; FIG-003 dropdown bg-background fix
- Sprint 2 (edit access): FIG-004 View Public Page conditional button (PRE_EVENT+); FIG-006 WorkshopInlineEditForm full field set incl. category/format
- Sprint 3 (pricing flow): FIG-007 CUSTOM_PRICING approval flow (coach submits → admin approves → Workshop.priceCents updated, no auto-build); FIG-008 customPricingNotes in emails; FIG-009 ResubmitWorkshop `variant="info_requested"` — full edit + pricing read-only
- Sprint 4 (validation + templates): FIG-011 virtualLink required server+client; FIG-005 LandingPage.categoryId + per-category template matching in auto-build
- PRE-3: Deleted `coach-respond/route.ts` duplicate; canonical is `coach-response/route.ts` (added rate limiting)
- Key new capability: PATCH `/api/workshops/[id]` expanded for COACH role with `COACH_EDITABLE_FIELDS` allowlist; pricing fields create CUSTOM_PRICING approval instead of direct update
- Key new email: `sendCustomPriceChangeEmail()` — old/new price comparison + custom notes
- Lead-time bypass: `isCoach && existing.status === "INFO_REQUESTED"` skips 14-day date validation
- E&V templates seeded via `prisma/seed-ev-templates.ts` (inactive — admin must activate at `/templates`)
- Branch: `figma-revisions-mar2026` — PR open at github.com/jcbdelo26/Scaling-up-platform-v2/compare/figma-revisions-mar2026
- Parsed revisions: `plans/FIGMA_REVISIONS_PARSED.md` | Sprint plan: `plans/FIGMA_REVISIONS_SPRINT_PLAN_MAR2026.md`

### 2026-03-18 — New API Routes (Figma Batch): <!-- ENTRY_ISO:2026-03-18 ENTRY_SLUG:figma-batch-api-routes -->

**New API Routes (Figma Batch):**
- `PATCH /api/workshops/[id]` — Expanded: COACH role now allowed with `COACH_EDITABLE_FIELDS` allowlist; pricing fields intercepted → CUSTOM_PRICING approval
- `POST /api/approvals/[id]/coach-response` — Coach respond to INFO_REQUESTED (canonical; `coach-respond` deleted)
- CUSTOM_PRICING approval type fully handled in `approvals/[id]/respond/route.ts` — updates priceCents/isFree/pricingTierId, returns early (no auto-build)

### 2026-03-18 — Schema Changes (Figma Batch): <!-- ENTRY_ISO:2026-03-18 ENTRY_SLUG:figma-batch-schema -->

**Schema Changes (Figma Batch):**
- `LandingPage.categoryId` (String?, FK→Category) — per-category template matching in auto-build
- Migration: `add_landing_page_category`

### 2026-03-11 — MR-21 Coupon/Checkout Fix (Mar 11, 2026) — Complete (commits `0556da5`, `5abcda2`): <!-- ENTRY_ISO:2026-03-11 ENTRY_SLUG:mr-21-coupon-checkout -->

**MR-21 Coupon/Checkout Fix (Mar 11, 2026)** — Complete (commits `0556da5`, `5abcda2`):
- Stripe `allow_promotion_codes` and `discounts` are mutually exclusive — conditional spread in `services/stripe.ts:148`
- `/api/checkout` added to middleware public routes (both `authorized` callback and middleware function)
- `registration-form.tsx` — defensive content-type check before `.json()` parsing, Zod error array formatting
- TDD tests added: `stripe.test.ts` (allow_promotion_codes exclusion), `checkout.test.ts` (discount forwarding + StripeDiscountCodeError), `template-interpolation.test.ts` (10 tests)
- Test totals: 51 suites / 488 tests (up from 50/473); Figma batch brought to 52 suites / 488 tests

### 2026-03-11 — MR-30 Paid Attendee Removal Verified (Mar 11, 2026): <!-- ENTRY_ISO:2026-03-11 ENTRY_SLUG:mr-30-paid-attendee-removal -->

**MR-30 Paid Attendee Removal Verified (Mar 11, 2026):**
- Coach unregister on paid attendee → routes to approval queue (not direct delete)
- Admin email: "[ACTION REQUIRED] Cancellation Request" with "REFUND REQUIRED", attendee name, $199.50
- CANCELLATION approval in admin queue with Approve/Deny
- Refund is manual via Stripe dashboard — by design
- Verified via fake paid registration seeded in Neon SQL (no real payment)
- Known gap: approval respond route treats CANCELLATION same as WORKSHOP_REQUEST (advances status to PRE_EVENT, sends workshop-approved email) — needs CANCELLATION-specific branch

### 2026-02-27 — Design Token Consolidation + Color Sweep (Feb 27, 2026) — Complete: <!-- ENTRY_ISO:2026-02-27 ENTRY_SLUG:design-token-consolidation -->

**Design Token Consolidation + Color Sweep (Feb 27, 2026)** — Complete:
- Single source of truth: `globals.css` (`brand-tokens.css` deleted — had zero imports)
- Added `--status-*` tokens (requested/awaiting/active/post/completed/canceled) with light+dark
- Added `--sidebar-*` tokens (sidebar/foreground/muted/border) for coach portal
- Swept ~1,087 hardcoded Tailwind colors → semantic tokens across ~80 files
- Foundation components fixed: utils, status-pill, badge, alert, confirmation-modal, checkbox
- Workflow/survey components fixed: timeline, editor, executions, template-editor, template-toggle
- Coach sidebar fixed: portal layout + mobile nav use `--sidebar-*` tokens
- Bulk page sweep: dashboard, portal, public, components all tokenized
- `MASTER.md` updated to match actual implementation

### 2026-02-26 — Feb 25 Call Revisions (Feb 26-27, 2026) — ALL 7 SPRINTS COMPLETE (65/65 tasks): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-call-revisions -->

**Feb 25 Call Revisions (Feb 26-27, 2026)** — **ALL 7 SPRINTS COMPLETE** (65/65 tasks):
- Source: 64-min walkthrough by Jeff Verdun + Suzanne Krygier (Feb 24, 2026)
- 42 revisions + 5 gap fixes identified, organized into 7 sprints
- 24 video frames extracted and analyzed for visual context
- Sprint 1 complete: Form cleanup (HYBRID, virtualPlatform, early bird removed; free-form pricing, venue instructions, T&C link)
- Sprint 2 complete: Schema migration (Category defaults, Workshop geo/excluded, Registration attendance/marketing); auto-title/description; category admin editor
- Sprint 3 complete: Coach portal enhancements (unregister API + UI, attendance tracking, survey results page, workflow status on coach + admin detail, rejection/edit/resubmit flow)
- Sprint 4 complete: Coach profile + notification emails (Circle.so cleanup, image upload, LinkedIn URL, CTA toggle, 3 notification emails wired)
- Sprint 5 complete: Auto-Build on Approval (flagship) — Inngest function, template toggle, workflow auto-assign, variable interpolation, status automation, built email
- Sprint 6 complete: Financials filters (coach/category/date range), workshop completion summary Inngest function, registration form (phone+company required, marketing opt-in)
- Sprint 7 complete: Aggregated survey results page, cross-workshop API mode, coach post-workshop + 30-day follow-up survey seeds, post-event coach survey workflow seed

### 2026-02-26 — New API Routes (Sprints 3-5): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-api-routes -->

**New API Routes (Sprints 3-5):**
- `DELETE /api/registrations/[id]` — Direct unregister (coach-scoped, Stripe refund)
- `PATCH /api/registrations/[id]` — Toggle attendance (attended + attendedAt)
- `POST /api/workshops/[id]/resubmit` — Resubmit denied workshop for approval
- `POST /api/portal/profile/image` — Coach profile image upload (Vercel Blob, 5MB max)
- `PATCH /api/landing-pages/[id]` — Update landing page properties (isActiveTemplate toggle)

### 2026-02-26 — New Pages (Sprint 3): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-new-pages -->

**New Pages (Sprint 3):**
- `/portal/workshops/[id]/surveys` — Coach survey results (grouped by template)

### 2026-02-26 — New Components (Sprints 3 + 5): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-new-components -->

**New Components (Sprints 3 + 5):**
- `components/workshops/resubmit-workshop.tsx` — Rejection reason + edit + resubmit client component
- `components/templates/active-template-toggle.tsx` — Toggle "Set as Active Template" for auto-build

### 2026-02-26 — Schema Changes (Sprint 4): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-schema-sprint-4 -->

**Schema Changes (Sprint 4):**
- `Coach.linkedinUrl` (String?) — LinkedIn profile URL
- `Coach.showBookCallCta` (Boolean, default true) — Toggle CTA on bio page
- Migration: `20260227000000_feb25_coach_profile_fields`

### 2026-02-26 — Schema Changes (Sprint 5): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-schema-sprint-5 -->

**Schema Changes (Sprint 5):**
- `LandingPage.isActiveTemplate` (Boolean, default false) — Marks page as template for auto-build cloning
- `Workflow.categoryId` (String?, FK→Category) — Auto-assign by category
- `Workflow.workshopFormat` (String?) — "IN_PERSON" or "VIRTUAL", null = any
- `Workflow.workflowPhase` (String?) — "PRE_EVENT" or "POST_EVENT"
- Migration: `20260227100000_feb25_sprint5_auto_build_fields`

### 2026-02-26 — Notification Emails (Sprints 4 + 5): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-notification-emails -->

**Notification Emails (Sprints 4 + 5):**
- `sendWorkshopRequestedEmail()` — To coach + admin on workshop submit
- `sendWorkshopApprovedEmail()` — To coach when workshop approved
- `sendWorkshopDeniedEmail()` — To coach when workshop denied (includes reason + resubmit link)
- `sendWorkshopBuiltEmail()` — To coach after auto-build (pages created, workflows assigned)

### 2026-02-26 — Auto-Build on Approval (Sprint 5 - Flagship): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-auto-build -->

**Auto-Build on Approval (Sprint 5 - Flagship):**
- `inngest/functions/auto-build-workshop.ts` — Triggered by `workshop/approved` event
- Copies active landing page templates with variable interpolation (20+ variables)
- Auto-assigns PRE_EVENT + POST_EVENT workflows by category/format match
- Advances workshop status AWAITING_APPROVAL → PRE_EVENT
- Emits `workflow/schedule` events for each assigned workflow
- Sends coach notification with build summary

### 2026-02-26 — Sprint 6 — Dashboard, Financials & Registration: <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-sprint-6 -->

**Sprint 6 — Dashboard, Financials & Registration:**
- `components/financials/financial-filters.tsx` — Client component: coach/category dropdowns, custom date range picker
- `admin/financials/page.tsx` — Updated with coach/category/date filtering on all queries
- `inngest/functions/workshop-completion-summary.ts` — Triggered by `workshop/completed` event, emails admin with attendee list + revenue total
- `services/notifications.ts` — Added `sendWorkshopCompletionSummary()` (attendee table + revenue breakdown)
- `api/workshops/[id]/status/route.ts` — Emits `workshop/completed` Inngest event on COMPLETED transition
- Registration form: phone + company now required, marketing opt-in checkbox added
- `lib/validations.ts` — `createRegistrationSchema` updated: company required, phone required, marketingOptIn field
- `lib/registration-service.ts` — Passes `marketingOptIn` through to `db.registration.create`
- `api/workshops/[id]/register/route.ts` — Updated Zod schema + parseRegistrationInput for new fields
- `inngest/types.ts` — Added `workshop/completed` event type
- `api/inngest/route.ts` — Registered `workshopCompletionSummary` function
### 2026-02-26 — Sprint 7 — Aggregated Surveys & Coach Surveys: <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-sprint-7 -->

**Sprint 7 — Aggregated Surveys & Coach Surveys:**
- `admin/surveys/aggregate/page.tsx` — Cross-workshop aggregated survey results page (template selector tabs, summary cards, per-question distribution bars, per-workshop breakdown table)
- `api/survey-templates/[id]/results/route.ts` — Added `workshopId=all` support (passes undefined for cross-workshop aggregation)
- `admin/surveys/page.tsx` — Added "Aggregated Results" link button
- `prisma/seed.ts` — Added "Coach Post-Workshop Survey" template (5 questions), "Coach 30-Day Follow-Up Survey" template (5 questions), "Post-Event Coach Survey Sequence" workflow (2 steps: 1-day + 30-day)

### 2026-02-26 — Status Automation (Sprint 5): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-status-automation -->

**Status Automation (Sprint 5):**
- Manual "Move to" buttons removed from workshop-actions (kept Cancel + POST_EVENT/COMPLETED)
- "Send Reminder Email" button removed from quick-actions (handled by workflows)

### 2026-02-26 — Circle.so Cleanup (Sprint 4): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-circle-cleanup -->

**Circle.so Cleanup (Sprint 4):**
- Removed Circle sync button from `coaches/[id]/page.tsx`
- Removed Circle import from `bio/[id]/page.tsx`
- Removed Circle populate from `workshops/[id]/landing-pages/bio-page/page.tsx`
- Removed "imported from Circle.so" text from `coach-profile-form.tsx`

### 2026-02-26 — Feb 25 Roadmap: `D:\The CTO Project\plans\FEB25_CALL_REVISIONS_IMPLEMENTATION_ROADMAP.md` <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-roadmap-pointers -->

**Feb 25 Roadmap:** `D:\The CTO Project\plans\FEB25_CALL_REVISIONS_IMPLEMENTATION_ROADMAP.md`
**Feb 25 Task Tracker:** `D:\The CTO Project\plans\FEB25_IMPLEMENTATION_TASKS.md` (65/65 tasks — ALL SPRINTS COMPLETE)
**Feb 25 Video Frames:** `docs/Context Building Call Transcripts/Feb 25/frames/` (24 frames, 7 sprint folders)

### 2026-02-15 — Previous Plans: <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:previous-plans-pointers -->

**Previous Plans:**
- Production Readiness: `plans/PRODUCTION_READINESS_ROADMAP.md` + `plans/PRODUCTION_READINESS_TASKS.md`
- JV Revisions (Feb 15): `plans/JEFF_VERDUN_REVISIONS_IMPLEMENTATION_ROADMAP.md` + `plans/JEFF_VERDUN_REVISION_TASKS.md`
- CIO Audit (Feb 20): `plans/CIO_WORD_FOR_WORD_REVISION_AUDIT_AND_IMPLEMENTATION_PLAN_FEB20_2026.md`
- Figma Revisions (Mar 17): `plans/FIGMA_REVISIONS_SPRINT_PLAN_MAR2026.md` (11 revisions, 4 sprints — COMPLETE)

