# Spec 17 — Jeff June 9 Feedback Punch-List

> **Status:** Master catalog. Wave A is build-ready; Waves B–F are catalogued with decisions and designed in detail when reached.
> **Sources:**
> - `From Jeff/gabriel-feedback.docx` — 33-item assessment-tool feedback (Jeff Verdun, June 9 2026).
> - `From Jeff/ChiefAIOfficer.com Mail - on workshops.pdf` — workshop landing-page HTML editor thread (June 9 2026; Jeff: "Add to list").
> **Constraints:** additive migrations only (2 prior prod wipes — no `migrate reset/dev`, no destructive ops, guarded DRAFT seeders only). Build gate `CI=true npx next build --turbopack`. Source under `src/src/`. Scoped brand CSS only (ADR-0005, no leak into `.wf-scope`).

## ⛔ Per-wave implementation gate (READ FIRST)

This spec catalogues waves at **two depths**. **A GATED wave MUST NOT be implemented** until it has (1) a written, user-approved **detailed design** (in this spec or a linked wave spec) AND (2) a **per-wave implementation plan**. The per-item "decision" entries in the catalog below are **provisional defaults for planning — NOT build instructions.** No approved design + no plan ⇒ do not write code for that wave; run its brainstorm + `/grill-with-docs` pass and get sign-off first.

| Wave | Readiness |
|------|-----------|
| A — Invite email | ✅ BUILD-READY — grilled + Codex-reviewed (senior-eng/ops/security) + signed off 2026-06-12 |
| B — Workshop HTML | ✅ BUILD-READY — grilled + Codex-reviewed (senior-eng/ops/security) + signed off 2026-06-12 |
| C — Survey UX | 🚧 GATED — needs brainstorm + grill + user approval |
| D — Campaign setup | 🚧 GATED — needs brainstorm + grill + user approval |
| E — Report polish | 🚧 GATED — needs brainstorm + grill + Jeff's #33 diffs |
| F — Net-new | 🚧 GATED — needs own spec + ADR + Jeff design call |

When a wave clears its gate, flip its row to BUILD-READY here and link its plan.

## Goal

Work through Jeff's consolidated June 9 feedback in shippable waves, fixing the one confirmed bug first, then high-visibility UX, then features, then report accuracy, deferring the net-new report subsystems to their own specs.

## Wave sequence

Letter = execution order. Module = which subsystem the wave touches.

| Wave | Scope | Items | Module |
|------|-------|-------|--------|
| **A** | Invitation email correctness + branding | #4, #5 | Assessment |
| **B** | Per-workshop landing-page HTML editor | (workshops PDF) | Workshop landing pages |
| **C** | Survey participant UX | #6–#14 | Assessment (participant) |
| **D** | Campaign setup features | #1, #2, #3, #15, #16, #17, #18, #19, #20 | Assessment (wizard) |
| **E** | Report polish & accuracy | #21, #24, #25, #26, #27, #28, #29, #30, #31, #33 | Assessment (report) |
| **F** | Net-new report subsystems (own specs) | #22, #23, #32 | Assessment (new) |

Each wave ships independently behind the build gate + targeted tests. Waves C–F get their own brainstorm/design pass before implementation so Jeff's incoming report diffs (#33) can shape Wave E rather than us guessing now.

---

## Full catalog — all 33 items

Decision column legend: **A–F** = wave; *[confirm]* = recommended default, to be finalized at that wave's brainstorm; *[verify]* = likely already shipped, verify against live; *[needs Jeff]* = blocked on external input.

| # | Area | Jeff's ask (verbatim, condensed) | Decision | Wave |
|---|------|----------------------------------|----------|------|
| 1 | Campaigns | Add the ability to delete campaigns. | Soft-delete: additive `deletedAt` column; hidden from lists; data preserved; confirm dialog; admin + owning coach. *[confirm]* | D |
| 2 | Campaigns – Reading | Add a timing radio that defaults to "Immediately". | Timing radio in setup, default Immediately. Pairs with #3. *[confirm]* | D |
| 3 | Invitation Timing | Send immediately on creation; future-dated campaigns auto-send when they open — no manual trigger. | On create (immediate) → auto-invite all participants. For future `openAt` → Inngest scheduled/cron auto-send at open. *[confirm]* | D |
| 4 | Email – Merge Fields | `{{organization_name}}` etc. render literally instead of values. Fix. | **BUG.** Comprehensive token map (both `{{camelCase}}` + `{{snake_case}}`); known-but-empty → neutral fallback; unknown → stripped. | **A** |
| 5 | Invitation Emails | Must use high-end HTML-based formatting. | Branded inline-styled shell (purple `#522583` hero + SCALING UP wordmark + branded CTA), reusing the `report-email.ts` pattern; body stays coach-authored markdown. | **A** |
| 6 | Survey – Header | Remove the white header bar (logo/name/progress). Everything inside the purple card: logo → survey name → progress bar. | Restructure participant shell so logo, friendly name, and progress live inside the purple card; remove the white top bar. *[confirm]* | C |
| 7 | Survey – Section Numbers | Remove the large orange "01" section numbers. | Remove the section number badge (reverses part of PR #51). *[confirm]* | C |
| 8 | Survey – Sliders (start) | Sliders start at zero → false impression of a selection. Default to a neutral/invalid position (visually off the scale) forcing an active selection. | Render the thumb visually absent/off-scale until first interaction; `0` still a valid answered value once chosen (we already removed the logical default — this completes the visual side). | C |
| 9 | Survey – Sliders (handle) | Increase slider handle size. | Enlarge handle via scoped CSS. | C |
| 10 | Survey – Title | Show survey title only before the first question, not every page. | Title on intro/first question only. *[confirm]* | C |
| 11 | Survey – Text Boxes | All text boxes need a visible placeholder or border. | Visible border + placeholder on every text input. | C |
| 12 | Survey – Char Limits | Confirm whether char limits exist, what they are, whether appropriate. | Investigate existing `maxLength`; document; add sensible limits if missing. *[verify]* | C |
| 13 | Survey – Validation | Highlight missed questions in red on next-page validation. | Red highlight on unanswered required questions when validation blocks advance. | C |
| 14 | Survey – Section Intro | Add intro/context text before a group of questions. | Likely shipped (PR #36/#51 added section `description` + intro slide). Verify Jeff's example renders + is editable. *[verify]* | C |
| 15 | Setup – Results Toggle | Toggle: send results to end users or not. Landing message adapts ("We are sending you your results" vs "Thank you — your coach will review your results with you."). | Additive `sendResultsToRespondent` boolean; adaptive thank-you copy. Public quiz keeps ADR-0008 (taker always sees); toggle governs invited + the emailed copy. *[confirm]* | D |
| 16 | Setup – Coach Notify | Toggle for the coach to get an email on each completion, incl. link to results or full output. | Additive `notifyCoachOnCompletion` boolean; on SUBMITTED email the owning coach a link/report (reuse Spec 16 report-email). *[confirm]* | D |
| 17 | Setup – Step 4 | In Step 4 (schedule/name), display the selected template for reference. | Show chosen template name on the schedule/name step. | D |
| 18 | Setup – Select All | "Select All" when picking participants for a company. | Select-All control in the participant picker. | D |
| 19 | Setup – Custom Slides | Insert custom slides during setup (promo/branded, like the Verve slide). | Campaign custom slides shown in the participant flow. Heaviest Wave D item — may warrant its own ADR. *[confirm]* | D |
| 20 | Custom Email Editor | Upload/paste own HTML email template while keeping merge tags. | Per-campaign custom HTML on the wizard invite step, sanitized via `sanitize-custom-html.ts` (DOMPurify), merge tags preserved + interpolated by the Wave A interpolator. *[confirm]* | D |
| 21 | Coaches Portal – Raw Data | Replace question codes (q1_1) with actual question text. | Map stableKeys → question labels in the deprecated raw view (BrandedReport already replaced it as canonical). *[confirm]* | E |
| 22 | CEO / Group Report | Combine multiple respondents into one CEO/group report. | **Net-new subsystem — own spec + ADR.** Aggregation of N submissions into one report. | F |
| 23 | Comparison / Longitudinal | See how a respondent's answers change across iterations (Q1 vs Q2, Y1 vs Y2). | **Net-new subsystem — own spec.** Cross-submission longitudinal comparison. | F |
| 24 | Rockefeller PDF | Remove the "All Sections" score/average summary table. | Remove the per-section score table for the Rockefeller report variant. | E |
| 25 | PDF Footer (all) | Footer = submission date + Scaling Up logo + "Generated by Scaling Up Platform" only. Remove test/debug codes. | Clean BrandedReport footer; drop the provenance/debug stamp from the visible footer. | E |
| 26 | QSPv2 – Decimals | First question says rate with one decimal. Remove decimals — whole numbers 1–10 only. | Scale config: whole-number step, no decimal; update seed content + input. | E |
| 27 | QSPv2 Output | Remove "Score Summary – All Sections". | Remove score-summary section for the QSPv2 report variant. | E |
| 28 | QSPv1 Output | Same as QSPv2: remove score summary + footer cleanup. | Apply #25 + #27 to the QSPv1 variant. | E |
| 29 | Vision Alignment – Questions | Questions (esp. "Obstacles and Challenges" section) don't match Jeff's source material. | **Content recheck** of the LVA template against Jeff's source. Contradicts our verbatim Esperto reseed — needs Jeff's source doc to reconcile. *[needs Jeff]* | E |
| 30 | Vision Alignment PDF | Remove the "All Sections" section. | Remove the per-section table for the LVA report variant. | E |
| 31 | Vision Alignment Layout | Restructure the report — currently one long unbroken block. | Break LVA report into readable sections/cards. | E |
| 32 | SU Full – Benchmarking | Missing industry benchmarking (answers vs industry standards) from the Esperto version. Discuss universal vs report-specific. | **Net-new — own spec; Jeff wants a design discussion first.** | F |
| 33 | All Reports – Accuracy | Reports close but not 100% aligned; Jeff will send a full side-by-side diff. | Awaiting Jeff's detailed diffs; folds into Wave E as they arrive. *[needs Jeff]* | E |

---

## Wave B — Per-workshop landing-page HTML editor (from the workshops PDF)

**Ask:** the global template editor offers a custom-HTML option; Jeff wants the same on an **individual workshop's** landing page. Editing a single workshop currently drops into the old block editor. If HTML was used on the global template, that code should be **brought across into the per-workshop editor** so it can be modified per workshop.

**Current state (confirmed):**
- `LandingPage.customHtml` column **exists** and is **populated at build-time** by copying the global `PageTemplate.customHtml` (eligibility-filtered to SOLO/DUO + interpolated). [`landing-pages/[template]/route.ts`]
- The public render path **already echoes** `LandingPage.customHtml`.
- **Missing:** (1) no HTML textarea on the per-workshop editor; (2) the PUT route **deliberately blocks** writing `customHtml` from the body (TEMPLATE-02 hardening — coach-writable HTML was a stored-XSS vector because that route didn't sanitize).

**Design (grilled + confirmed):**
- **Editor UI — edit the RESOLVED this-workshop HTML (grill, decided = Option A):** surface a custom-HTML textarea on the per-workshop SOLO/DUO landing-page editor (`workshops/[id]/landing-pages/solo-landing|duo-landing/page.tsx`), **pre-filled with this workshop's resolved HTML**: `LandingPage.customHtml` (the built, token-filled copy) if present, else `interpolateContentForHtml(global PageTemplate.customHtml, this workshop's variables)` so there's brought-across, filled-in content to edit. The admin edits the concrete page for THIS workshop (he may still type `{{tokens}}` — they resolve on save). Eligibility-gated to SOLO/DUO only (hidden for REGISTRATION/THANK_YOU/BIO). **Make clear in the UI that a non-empty HTML override replaces the block layout** (render precedence below); clearing the textarea reverts to the block layout. **Static-snapshot tradeoff (Codex R1-H2, decided): the saved HTML is a frozen snapshot — later workshop edits (date/venue/price/virtual link) do NOT flow into it.** The UI states this, and a **"Refresh from current workshop data"** action re-pulls + re-interpolates current logistics on demand. See the Codex-hardening section for the full Wave B requirement set (admin-only payload handling, fallback endpoint, audit + restore, CAS).
- **Write path:** add `customHtml` to the PUT route's UPDATE `data` (today it's deliberately not written). On save: **`interpolateContentForHtml(edited, workshop variables)` then strict `sanitizeCustomHtml`** (same two-stage pattern auto-build uses) → store the resolved+sanitized result into `LandingPage.customHtml`. This is required because the public render echoes `LandingPage.customHtml` as-is (no view-time interpolation), so any `{{token}}` the admin typed must be filled before storage, and a `javascript:` substitution is stripped even after save. The edit becomes this workshop's own fork (auto-build won't clobber it — confirmed).
- **Who can edit (CONFIRMED):** **admin/staff-only**, mirroring `customCode` (ENH-MAY6-5) — coaches get 403 even via crafted bodies; server re-sanitize runs regardless. Coaches keep the block editor; this feature serves admin/staff editing per-workshop HTML. Rationale: consistent with the existing "raw markup is privileged" rule, matches who asked (Jeff/admin), keeps the stored-XSS surface off coaches.
- **No-clobber (CONFIRMED via code):** auto-build uses `create()` and skips existing landing-page rows; the UPDATE path preserves `customHtml`. So a hand-edited per-workshop `customHtml` is NOT overwritten by a later rebuild — **no dirty-flag column required.**
- **Render precedence (CONFIRMED):** the public render at `workshop/[slug]/page.tsx:156` already echoes a non-empty `customHtml` (via the existing save-time-sanitized HTML-injection prop) instead of the React/block template — per-workshop edits take effect with no render change needed.
- **Tests:** PUT accepts `customHtml` for admin/staff, **403 for coach** (incl. crafted body); sanitize-on-write strips scripts/`javascript:`; merge tags survive; eligibility filter (SOLO/DUO only); render reflects the per-workshop edit.

**Migration:** none (columns exist). **Security:** sanitize-on-write + admin/staff-only gate are both mandatory — do not merge a write path without them.

---

## Wave A — Invitation email correctness + branding (BUILD-READY)

**Files:**
- **Create** `src/src/lib/assessments/invitation-email.ts` — extracted, unit-testable: `interpolateInvitationTemplate`, `buildInvitationEmailHtml`, **and `buildInvitationEmailText`** (the plain-text twin) (mirrors `report-email.ts`).
- **Modify** `src/src/lib/smtp-transport.ts` → add an **optional `text?: string`** to `SendEmailOptions` and pass it to `transporter.sendMail` so emails go out as **multipart/alternative** (HTML + plain text). Purely additive — existing HTML-only callers are unchanged.
- **Modify** `src/src/services/notifications.ts` → `sendAssessmentInvitationEmail` — add `organizationName` + `coachName` params; delegate to the new module instead of the inline `substitute()` + ad-hoc HTML; pass both `html` (branded shell) and `text` (plain-text twin) to `sendEmailViaSMTP`.
- **Modify** callers to supply org + coach (extend campaign query `include`):
  - `src/src/app/api/assessment-campaigns/[id]/invite/route.ts`
  - `src/src/app/api/assessment-campaigns/[id]/reminders/route.ts`
  - `src/src/app/api/assessment-campaigns/[id]/invitations/[invitationId]/resend/route.ts`
- **Create** `src/src/__tests__/lib/assessments/invitation-email.test.ts`; **update** the 3 route tests.

**`interpolateInvitationTemplate(text, vars)`** — token set, both `{{camelCase}}` and `{{snake_case}}`. **Grounded in the tokens the 7 seeded invitation templates actually use** (not just what the old `substitute()` handled): the seeds use `{{invitationUrl}}`/`{{assessmentUrl}}`, `{{respondentFirstName}}`/`{{firstName}}`, `{{organizationName}}`, and `{{templateName}}` — the templates are internally inconsistent, so the interpolator MUST accept all of them (aliases below). Today 4 of these render literally (incl. `{{assessmentUrl}}`, which is the CTA link in Five Dysfunctions & Quick — a broken link, not just cosmetic).

| Token (+ aliases) | Source | Empty-value fallback |
|-------|--------|----------------------|
| respondentFirstName / firstName | respondent.firstName | "there" |
| respondentLastName / lastName | respondent.lastName | "" |
| respondentFullName / respondentName / fullName | first + last | "there" |
| respondentEmail / email | respondent.email | "" |
| organizationName | campaign.organization.name | "your organization" |
| campaignName | campaign.name | "your assessment" |
| templateName | campaign.template.name | "your assessment" |
| coachName | campaign.organization.owner (firstName + lastName) | "your coach" |
| invitationUrl / assessmentUrl | computed | (always present) |
| closeAt | campaign.closeAt formatted | "ongoing" |

Every alias resolves in both `{{camelCase}}` and `{{snake_case}}` forms (`organization_name`, `assessment_url`, `first_name`, `template_name`, …). **Decision (grill, confirmed):** support the full alias set so all 7 seed templates work as-is; do NOT rewrite the seeds now (normalizing them to one convention is optional later polish, not required).

- Known tokens with no value → neutral fallback (above). After substitution, a final sweep strips any remaining `{{…}}` (genuinely-unknown tokens) → "".
- **Data loading:** `templateName` needs `campaign.template.name` — the invite/reminders/resend routes already load `campaign.template` (for subject/body), so add `name` to that select.
- HTML-escape every value before insertion into the HTML body (`escapeHtml`). Subject uses `stripControlChars` (no escape) — header-injection safe, per `report-email.ts`.

**`buildInvitationEmailHtml({ bodyHtml, invitationUrl, coachName?, orgName? })`** — branded inline-styled, table-based, Outlook/Gmail-safe shell:
Four-Decisions top stripe → `#522583` purple hero (**SU logo image** + optional org/campaign subhead) → white body panel (interpolated markdown → `<p>` paragraphs) → purple CTA "Start the assessment" (`#522583`, replaces the bare blue `#1D4ED8`) → fallback raw-link line → "— Scaling Up Platform" footer.

**Logo (grill, decided):** use the **SU logo image** on the hero, delivered as a **CID inline attachment** of a **white PNG** (`alt="Scaling Up"`, explicit width). Rationale (grill): modern clients render images by default and degrade gracefully; CID inline (the image travels with the email, like a signature) is more reliable than a remote `<img src>` which strict setups can block. **Asset task:** we only have `public/brand/su-logo-white.svg` — SVG isn't email-safe, so generate a white PNG (≈2× retina) and attach it via `cid:`. Our SMTP transport already supports `attachments` (it sends `.ics`); confirm/extend the attachment mapping to pass `cid`/`contentId` through to nodemailer.

**Body rendering (grill + Codex R1-M5, decided): minimal + safe inline links & bold** — paragraphs/line-breaks plus a safe subset (markdown links → sanitized `<a>`, bold), and **normalize/dedupe the redundant markdown CTA line** (the shell already has the button). Required because the seeded Five Dysfunctions / Quick bodies literally contain `[Take the Assessment]({{assessmentUrl}})`, which strict-minimal rendering would show as literal text. No full markdown (no lists/headings/images).

**`buildInvitationEmailText(...)`** — the plain-text twin (multipart/alternative, grill-confirmed): the interpolated raw body (markdown as typed, no escaping/HTML) followed by a blank line and the invitation URL spelled out (`Start the assessment: <url>`). Improves inbox delivery (spam filters favor a plain-text part, especially alongside the inline logo attachment) + accessibility/text-only clients.

**Resolve coach name** from the campaign creator's coach (`createdByCoachId`) **??** `campaign.organization.owner`. None of the 7 seed templates currently use `{{coachName}}` (it's for custom templates); admin PUBLIC campaigns with no coach context fall back to "your coach".

**Tests (TDD-first):**
- Each token resolves in both conventions.
- Empty org name → "your organization"; null coach → "your coach"; null closeAt → "ongoing".
- Unknown `{{foo}}` → stripped (no literal `{{` in output).
- XSS: respondent name `"<script>"` → escaped in HTML body.
- Subject: control chars stripped; no header injection.
- `buildInvitationEmailHtml`: contains `#522583`; CTA `href` === invitationUrl; no literal `{{`.
- `buildInvitationEmailText`: plain text only (no HTML tags), contains the invitation URL as bare text, no literal `{{`.
- Route tests: callers pass org + coach; sent `html` AND `text` contain no literal `{{`; `sendEmailViaSMTP` receives a non-empty `text`.

**Non-goals (scope):** Wave A is a **rendering + token + branding** change only. It does NOT change who is emailed, when, send timing, idempotency, or the invite/reminder/resend trigger logic. The branded shell + plain-text twin + logo apply equally to **invite, reminder, and resend** (all route through `sendAssessmentInvitationEmail`).

**Migration:** none. **Gate:** `CI=true npx next build --turbopack` + `eslint` changed files + targeted tests.

---

## Codex review (claudex, rounds 1 & 3) — accepted hardening

> Adversarial review via claudex on 2026-06-12 (senior-eng round 1 + ops/SRE round 3; the security round's findings file was lost to a runner desync, so it was **re-run as a dedicated synchronous read-only Codex pass** — see the "Security pass" subsection below). **Every item below is a requirement for the Wave A/B implementation plans.** Deferred items are additive-later, listed with reasoning.

### Wave A — accepted
- **Resend honors per-campaign overrides (R1-M3):** the resend route currently ignores `campaign.invitationSubject`/`invitationBodyMarkdown` (invite + reminders honor them). Fix resend to use the same effective subject/body; route test.
- **Typed render paths (R1-M4):** `invitation-email.ts` separates raw token interpolation from context rendering — distinct `forHtml` (escape), `forText` (no escape), `forSubject` (`stripControlChars`) paths — so text isn't entity-escaped and HTML isn't under-escaped. Tests for apostrophes, control chars, `<script>` names.
- **Body = minimal + safe inline links & bold + normalize CTA (R1-M5):** see Wave A "Body rendering"; test the seeded `[Take the Assessment](url)` bodies render without literal markdown.
- **coachName precedence helper (R1-L10):** one helper resolving `creatorCoach ?? organization.owner`; callers load both; test both paths.
- **CID logo robustness (R1-L11 + R3-L7):** add `cid`/`contentId` to `SmtpAttachment` + the nodemailer mapping; commit the white PNG at a deterministic `public/brand` path; build/preflight-check the asset exists; email smoke test covers a blocked/missing image (alt text shows).
- **Env kill-switch (R3-H1, scoped):** an env flag falls back to the legacy renderer for all sends; keep the legacy renderer as the off-switch. (Per-campaign canary/allowlist DEFERRED.)
- **Reminder send safety (R3-H3):** the reminder route **rotates the invitation token every send** and loops targets uncapped. Add a batch cap/chunk, and **rotate the token only after a successful send** (or transactionally restore the prior token on failure) so a failed reminder never leaves a dead link + no email. (Token rotation is pre-existing; Wave A's attachment weight raises failure odds, so harden it here.)

### Wave B — accepted
- **Enriched variable resolution (R1-H1):** save-time interpolation must use a shared landing-page variable builder that includes the REGISTRATION page URL (two-pass, like auto-build) — else an admin-typed `{{registration_url}}` resolves empty. Test it.
- **Static-snapshot tradeoff + refresh (R1-H2):** keep Option A; UI states the static-snapshot tradeoff; add a "Refresh from current workshop data" action (re-pull + re-interpolate current logistics).
- **Admin-only boundary done right (R1-M7 + R3-M5):** render the textarea only for admin/staff; **omit `customHtml` from coach save payloads entirely** (absent field = no change), so ordinary coach block-saves never 403; server returns an explicit `customHtmlSaved` / echoed SHA; client fails closed if absent; mixed-version contract test. Test: coach save without `customHtml` still succeeds.
- **Resolved-fallback endpoint (R1-M6):** add a privileged endpoint that returns the *resolved* fallback HTML (PageTemplate category precedence applied) for pre-fill when no `LandingPage.customHtml` exists — the current GET only returns existing rows.
- **Size cap + audit (R1-M9):** reuse `CUSTOM_HTML_MAX_LENGTH`; audit-log `customHtml` changes with old/new SHA + the previous body + actor (metadata, not full HTML in the log line).
- **Sanitizer CSS scope (R1-M8):** add CSS `url()`/`@import` validation to the post-interpolation sanitize, OR explicitly document `<style>`/inline-style as admin-trusted with the residual risk noted — do not over-claim "strict re-sanitize" without one of these.
- **Concurrency guard (R1-L12):** `updatedAt` compare-and-set on the editor PUT; stale-save warning.
- **One-click restore (R3-H2, PULLED IN):** a "revert to previous version" action restoring the prior body from the audit snapshot. (Full multi-version revision UI still deferred.)
- **Sanitized/blanked HTML log signal (R3-M4, partial):** log when a save is sanitized/blanked (security signal). (Full dashboards deferred.)

### Security pass (dedicated synchronous Codex review) — accepted
> Replaces the lost round-2 security file. Two High findings the senior-eng/ops rounds missed.
- **Clone-route bypass of the admin-only gate (HIGH, verified in code):** `POST /api/landing-pages/library` is coach-accessible (`canManageCoachData`, not `isPrivilegedRole`) and copies `sourcePage.customHtml` into the target SOLO/DUO page ([library/route.ts:273]) — bypassing the Wave B admin-only PUT gate AND copying resolved STALE HTML without re-interpolating for the target workshop. **Fix:** non-privileged actors never receive `customHtml` via clone (copy as `null`); for admin/staff, re-sanitize + re-interpolate against the TARGET workshop's variables (or regenerate). Test: coach clone drops `customHtml`.
- **Subject-line token/credential leak (HIGH):** the token set exposes `invitationUrl`/`assessmentUrl` to general interpolation; if a subject references that token, the raw `#t=<token>` invitation credential lands in email headers, SMTP logs, and delivery telemetry (subjects are persisted). **Fix:** the subject uses a restricted token allowlist EXCLUDING url/email/token-bearing values; assert the rendered subject contains no `#t=`/assessment URL/raw token; redact or hash subjects in telemetry/logs.
- **Send token rotation non-atomic under concurrency (MEDIUM, refines R3-H3):** SMTP send + DB token activation can't be atomic; concurrent reminder/resend can double-send or let the last DB write invalidate an already-delivered link. **Fix:** serialize per-invitation sends (row lock / lease / idempotency key); use a token-version + brief grace window so the old and newly-emailed tokens are both valid momentarily.
- **Restore source must be transactional, not best-effort audit (MEDIUM):** `logAudit` swallows DB failures, so the audit log is an unreliable restore source — a save could land with no restorable prior body. **Fix:** write the previous HTML to a dedicated restricted store IN THE SAME TRANSACTION as the `LandingPage` update (keep audit to SHA/metadata); restore is admin-only, entity-bound, CAS-guarded, re-sanitized. (Upgrades the one-click-restore impl — a small transactional prior-body store, still not a full revision UI.)
- **Markdown link URL policy (MEDIUM, refines R1-M5):** "safe inline links" needs an explicit post-interpolation URL policy. **Fix:** link sanitizer rejecting `javascript:`/`data:`/protocol-relative/encoded-control/malformed URLs; default to allowing only the assessment URL / same-origin unless external links are an explicit product decision.
- **"Refresh from workshop data" edit-preservation (LOW, refines R1-H2):** refresh from the global template can overwrite intentional edits; refresh of the resolved textarea won't update stale literals. **Fix:** make refresh a preview/diff with an explicit source choice, run the same interpolate→sanitize pipeline, require `updatedAt` CAS before saving.

### Deferred (additive later — reasoning)
- **Per-campaign canary/allowlist control plane (R3-H1):** the env kill-switch covers blast radius at a fraction of the cost; low email volume; no evidence staged email rollout is needed (YAGNI).
- **Gradual-rollout control plane for Wave B (R3-M6):** the editor is admin/staff-only and opt-in per workshop by a trusted operator — it self-gates.
- **Full per-feature metrics dashboards + alerts (R3-M4):** premature at near-zero volume; revisit with traffic + a known signal. (The sanitized-HTML log signal is taken now.)
- **Dedicated multi-version revision table + diff UI (R3-H2):** the audit snapshot + one-click restore give recovery; full version history is a later enhancement.

## Waves C–F — recommended defaults (designed when reached)

- **Wave C (survey UX):** all participant-facing, scoped brand. #6/#7 partially reverse PR #51's intro polish (per Jeff). #14 likely already done — verify. Two logic changes (#8 slider visual-unset, #13 red validation); the rest CSS/layout. One brainstorm pass before build to lock #6 layout + #8 control.
- **Wave D (campaign setup):** additive columns (`deletedAt`, timing, `sendResultsToRespondent`, `notifyCoachOnCompletion`, custom-slides). #3 needs Inngest scheduled-send for future-dated opens. #19 (custom slides) + #20 (custom HTML email) are the heaviest — each may need its own design note.
- **Wave E (report polish):** all in `BrandedReport.tsx` + per-template config + LVA seed. #25 footer + #24/#27/#28/#30 score-table removals are mechanical once the per-variant config is mapped. #26 is a scale change (whole numbers). #29 + #31 (Vision Alignment) need Jeff's source + a layout pass. Sequence after Jeff's #33 diffs land.
- **Wave F (net-new):** #22 CEO/group report, #23 longitudinal, #32 benchmarking — each gets its own brainstorm → spec → ADR. #32 starts with a design discussion with Jeff (universal vs report-specific).

## ADR candidates

- **CEO/group report aggregation model** (#22) — how N submissions combine; hard to reverse.
- **Longitudinal comparison data model** (#23) — how iterations are linked across campaigns.
- **Industry benchmarking source + scope** (#32) — universal vs report-specific; where benchmark data comes from.
- **Per-workshop HTML write path** (Wave B) — re-opening a deliberately-blocked write with sanitize-on-write (document why it's now safe).

## Out of scope

Anything not in Jeff's June 9 docx or workshops PDF. Net-new waves (F) are catalogued here but specified separately.
