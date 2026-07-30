# Scaling Up Platform v2 - Development Instructions

> **IMPORTANT: Keep this file current.** After completing any sprint, feature, or schema change,
> update the relevant sections below. This is the single source of truth for AI assistants
> working on this codebase.

## Project Context

**Scaling Up Platform v2** is a workshop management application replacing Kajabi for Scaling Up coaches.
Coaches request workshops through a self-service portal; admin/staff review, approve, and manage
the full workshop lifecycle from request through post-event follow-up.

| Key | Value |
|-----|-------|
| **Source Path** | `D:\The CTO Project\Scaling Up Platform v2\src` |
| **Repository** | `github.com/ChiefAI-Officer/Scaling-up-platform-v2` (deploys from `main`) |
| **Live URL** | `scaling-up-platform-v2.vercel.app` |
| **Client** | Jeff Verdun, CIO - Scaling Up |
| **Operations** | Suzanne (handles manual approvals) |
| **Last Updated** | <!-- LAST_UPDATED_ISO:2026-07-30 LAST_UPDATED_SLUG:jeff-48-qsp-story-group-built --> July 30, 2026 — **Jeff #48 QSP core-values story grouping BUILT behind a default-off flag; pending independent review, PR, merge, and production launch.** The exact QSP v2 story triplet now has one progressive public/invited/Preview presentation while preserving all three stable keys, payloads, seed/import contracts, and a winning kill switch. Full detail in CHANGELOG `jeff-48-qsp-story-group-built`. _Prior, same day — **Jeff #83 Referred Results LAUNCHED**_ (PR #245, squash `e0e2bc9b`; production `dpl_BZtaegoNCrfjpZAoVPpYQu7LxeDX`). Verified public referrals freeze canonical Coach ownership; authenticated Coach and ADMIN/STAFF result surfaces are live; the approved disclosure is live; the reviewed four-row historical candidate set was deliberately left unassigned. Greptile was unavailable, so clean two-axis fallback review and the full validation/canary/production walk are recorded transparently. Full detail in CHANGELOG `jeff-83-referred-results-launched`. _(Prior, same day — 🔴 **SoT RE-CORRECTION (docs-only): yesterday's flag correction was ITSELF wrong — an empty read is not an empty value.** Two adversarial reviews (Vercel primary docs + this repo) both returned "NOT safe to publish" on the draft, so this is the third version. **The error:** I inferred "flag reads empty ⇒ feature dark" from a REST read without checking the read could see the value — **8 of 29 prod `WAVE_*` vars are `type:"sensitive"`, whose values are NEVER returned.** **The proof was already in our own CHANGELOG:** ED10/ED9 both require `activeAuthoringMode === "single"`, produced only by `isOn(WAVE_ED6_SINGLE_COLUMN_ENABLED)` — and the 07-22 session read ED6 EMPTY, excluded it from the re-set, then live-verified ED9+ED10 **in that same session**. ED6 was ON while being reported empty. **`sensitive` never meant dark** (values still inject at build+runtime; local proof: `WAVE_O_..._HASH_SALT` reads empty yet its resolver THROWS when falsy, and the Wave O/X import handlers ran clean in prod). **RETRACTED:** (a) ED1/ED8 "dark" — never measured, and for **ED8 the evidence says it was ON** (the 07-22 "Roll back/Archive" sighting matches labels existing only in the ED8 branch, so my "misread" explanation is refuted); (b) **"ED10 does not depend on ED6"** — it does; **I wrongly rejected an audit agent that was right**; (c) the 07-22 **"piped stdin stores empty"** root cause — CLI 51.8.0 made `vercel env add` default to `sensitive` and skip the prompt on piped input, explaining it with **no value loss**; (d) "`WAVE_S_PEER_BENCHMARKS_KILL` is empty" — it is itself unreadable, so peers may be killed (**GH #233**). **SURVIVES:** the prod-project correction (team `scaling-up`, 77 env vars vs 0) — metadata-based, untouched by the confound; sharpened with `.vercel/project.json` holding the right projectId with the WRONG orgId, so `push-env-to-vercel.mjs` would target the wrong team. ED1/ED8 now rewritten as `encrypted "1"` (readable, **not live until the next build**); their prior values are unrecoverable. **Lesson, inverted from yesterday: "I saw it render" BEATS "the flag reads empty"** — the render is downstream of the real value. Detail in CHANGELOG `flag-state-recorrection`. _(Prior, same day — **SoT CORRECTION: the prod Vercel project was mis-documented, and `ED1`/`ED8` are DARK in prod, not "flagless".** Found while re-baselining the 23 unaccounted rows of Jeff's July-10 tracker — a sweep triggered by discovering **#43 was a re-report of work shipped 8 days before he wrote it** (Wave P, 2026-07-02), with **#40** turning out to be a second such row (same commit). **(1)** Production lives in the **`scaling-up` team** (`prj_xcAWuAmGZAU3DCHgAauRv2WPKneo`) — it owns `scaling-up-platform-v2.vercel.app` + `platformtest.scalingup.com`, has **77 env vars**, and its 2026-07-28 12:26/12:34 UTC deploys match PRs #230/#231. The `chief-aio-fficer` project this file used to name has **0 env vars** — so our own documented command returned an empty list and would support a false "no flags set" reading. **(2)** `ED1` Test Mode + `ED8` version lifecycle are **flag-gated and their prod flags are EMPTY**, so both are **dark despite being recorded as launched** (`isOn()` has no default-on path; ED1 hides the Test Mode button/drawer, ED8 404s its APIs). Root cause: the 07-22 re-flip excluded `ED1/2/4/6/8` as "superseded" — right for the presentation waves ED2/ED4/ED6 (ADR-0024) but **wrong for ED1/ED8, which ED10 does not replace**. Flipping them on is a separate ops decision, NOT done here. Rejected with evidence: the claim that ED10 requires ED6 (they are independent flags). **Lesson: a live sighting is only evidence if you can name the gate it passed through.** Detail in CHANGELOG `flag-state-correction-ed1-ed8`. _(Prior, July 28 — **Jeff July-10 items #63 / #67 / #73 / #78 / #81 SHIPPED — coach byline below the SU mark on the report cover + footer** (PR #230, squash `febbdcc1`). Fifth item in the one-item-at-a-time pass. **One item, not five, and not by preference** — all three renderers emit structurally identical brandbar markup, `report-config.ts` has zero layout knobs, `CoachLogo` is alias-agnostic; there is no selector that can mean "LVA only", so splitting = four empty diffs. **Only ONE delta was unshipped**: the coach NAME half already shipped in PR #203, and #81c's CTA removal was already complete on both emitters. **Cover** = CSS only on the report-scoped `.su-report-cover .su-brandbar` (stacks; coach logo 56→40px; `margin-left:20px` dropped; **plus `position:relative; z-index:1`** because `.su-report-cover-inner::after`, the decorative blob at `z-index:0`, paints above non-positioned in-flow siblings — `.su-report-title` already had that guard). **NEVER** touch the global `.su-brandbar` (`su-public-brand.css:56`) — shared with the thank-you hero, no test guards it (ADR-0005). **Footer** = new shared **`ReportFooter`** (all 3 footers were byte-identical — same condition that justified extracting `CoachLogo`), SU mark now **ahead of** the coach byline via a **real DOM reorder, not `order:-1`** (which would leave DOM/screen-reader order lying and make it untestable — `next/jest` stubs CSS). ⚠️ **The footer was NOT Jeff's ask and Codex advised dropping it — overridden on hard evidence:** A4 print at 14mm margins is **~688 CSS px, below the 720px breakpoint**, and that media block is not `screen`-qualified, so **every saved/printed PDF rendered the coach ABOVE the SU mark** — the literal inverse of his instruction, on the artifact clients keep. **#78 needed no round-trip** (`scaling-up-full` is `reportType:"scored"` → the identical `BrandedReport`; report it as *verified in code*, not Jeff-confirmed). **7 aliases inherit, not 5** (`qsp-v1` + `scaling-up-quick`); audience is coach/admin-only behind the Report access gate. **The emailed report is PROVABLY not the surface** — `report-email.ts`/`results-email.ts` have **zero `<img>` tags**, while all five rows describe a coach image that IS present → falsified the gate's biggest flagged risk instead of deferring it (**GH #228**). Geometry measured on **real component output** (no throwaway route): cover **+20px**, tallest **533px of 1016px** A4 printable → no overflow; **footer height unchanged**. **9 tests / 1 suite** — DOM-order guards on all 3 footers AND all 3 covers (cover guards became load-bearing: with `flex-direction:column`, DOM order IS visual order); **accepted limit — jsdom can't see `flex-direction`**, so deleting the cover rule fails nothing (screenshot/PDF review covers it). **`/co-validate` reversed 3 gate decisions** (dropped the CSS source-drift-guard as text-pinning; **no new ADR** — amend spec-13 **G7** instead, since two CSS numbers fail the hard-to-reverse bar; added a row-level acceptance matrix) and **1 was overridden** (the footer). **The two-axis review then found the gap the grill AND Codex both missed** — the cover, the literal ask, had **no guard at all**, a hole opened by dropping the CSS guard; closed with cover DOM-order tests rather than a 4th component extraction. Also caught: a **prose overclaim** (footer coach cap 40px vs 22px SU mark — pre-existing, untouched, now recorded as seen-and-judged) and a dead `vertical-align:middle`. **One finding REJECTED with evidence:** "`qsp-v1` is disabled" repeats a stale CHANGELOG claim — prod shows `disabledAt` **NULL**. ⚠️ **Caveat on #67:** the byline renders only when the campaign has a `creatorCoach` (Wave K design), so an admin-created QSP campaign still shows no name — wants a live check before reporting #67 done (the **#76 pattern**, GH #220). Split out: **#228** (email chrome), **#229** (`CoachLogo` unvalidated `src`). Detail in CHANGELOG `jeff-jul10-report-header-byline`. _(Prior, same day — **Jeff July-10 items #62 / #66 / #70 / #77 SHIPPED — per-template Welcome-screen copy** (PR #225, squash `0663641a`). Fourth item in the one-item-at-a-time pass, after the invite-email family. The participant **Welcome screen** ("Screen 1", before the Section pager) showed **one hardcoded paragraph shared by every INVITED template**; it is now per-template copy in a **code-owned per-alias map** (`lib/assessments/welcome-copy.ts`, `resolveWelcomeLede()`, fail-open to the previous paragraph). **Flagless — no migration, no feature flag, no prod write, no seed edit**; rollback = revert. **ADR-0026** records why this is code and not a template-row column: the discriminator against **ADR-0025** is **authorship** — invitation copy is data because coaches *author* it; nobody asked to author this. **Five aliases carry bespoke copy, but only FOUR are Jeff's** — `five-dysfunctions` is **drafted by us, not dictated** (he asked for four the same day he sent Five-Dysf invite wording for #80, so it reads as an oversight; three earlier drafts were rejected for claiming things the instrument does not do). **#70 shipped with one clause OMITTED and that is a decision routed to him (GH #223), not a completed ask**: Rockefeller renders no score table (his own **#24** removed it) *and* we print no page numbers at all (`su-report.css` `@page` counter is commented out), so "the table on page 4" is unshippable even if the table returned; its two true facts (0–3 scale, four items per habit) are kept. **Also fixed a regression we would have introduced** — the replaced sentence was the only place the card promised resume (true, via `useAnswerDraft`), now in the fine print gated by `shouldShowResumeNote()` so it never appears twice; **caught by the RED step**, where three tests passed *before* implementation. Accepted + visually verified: #77 pushes the CTA below the fold at 375px, and the resume promise loses prominence (76.7% size, centred). **39 tests / 2 suites**; two guards worth naming — resolution **keys off `templateAlias`** (not `campaign.alias`, which would be a prod no-op) and **every map key must be declared by a seed**. Review-loop **3 rounds + a targeted verification → 5/5, 17 findings, exactly ONE code defect** (a prototype-chain crash: `resolveWelcomeLede("constructor")` returned a function and would have white-screened the card; the admin alias validator admits it). **The other 16 were prose** — three citation-drifts, three stale counts, overstated claims. Lessons: **line numbers belong in code comments, never in `docs/adr/`**; **verify prose like code**. Split out: **GH #222** (stat chip mislabels non-slider banks), **#223** (the #70 clause), **#224** ("Honest & confidential" vs `FULL_VISIBILITY`). ⚠️ **NOT Codex-signed-off** — Codex reviewed revision 1 (its findings split #70 out and moved visuals before code), but the second call died on an 1800s MCP idle timeout with no `threadId`; a three-lens adversarial panel substituted and found more. Detail in CHANGELOG `jeff-jul10-welcome-lede-copy`. _(Prior, July 27 — **Jeff July-10 items #76 + #80 SHIPPED — the coach-forward invitation-email family is now complete 4/4** (LVA #61 · Rockefeller #69 · SU-Full #76 · Five Dysfunctions #80). Third item in the one-item-at-a-time pass; reused the #69 pattern (seed edit as factory default + atomic-CAS prod-row patch, **ADR-0025**). **SU-Full**: body leads `{{coachName}} has invited you to complete the {{templateName}}` (renders "Scaling Up Full Assessment" — no hardcoding needed, unlike #69) and the duplicate above-button raw `{{invitationUrl}}` is gone (that removal is an **extension** of the #61/#69 pattern, not a literal #76 ask). **Five Dysfunctions**: names the coach instead of the generic "Your coach", using Jeff's wording "the Five Dysfunctions assessment". Subjects unchanged on both. **#80 ask 3 (suspected duplicate link) = NO-OP on the branded renderer** — `dropRedundantCta` already stripped the inline `[Take the Assessment]({{assessmentUrl}})` line (0 body anchors); it IS a real fix on the dormant legacy renderer (#217). **#76/#80 ask 1 (coach logo below the SU logo) = ALREADY TRUE** (shared chrome, existing regression test). **#76 QSP got NO prod write** — Jeff's observation was right but his "regression" diagnosis was not: the `qsp-v2` row has been coach-forward since 2026-07-03; what he saw was a campaign-level `invitationBodyHtml` override on `2026 QSP Q2` that **replaces the branded shell entirely**. Evidenced by prod telemetry — **4 `renderer:"custom_html"` invitation sends on 2026-07-10, the day of his report**, all from that campaign (soft-deleted 07-24). QSP's real defect was **seed drift** (seed still had pre-Wave-P copy) → seed pinned byte-for-byte to the live row. Prod rows patched + verified live (`b83288bc4ce4`→`31dd729e162b`, `fc88f616501f`→`56e4f11ebdcb`; dry-run idempotent; **0 campaign overrides** on either, so all 9 SU-Full + 6 Five Dysfunctions campaigns are covered). A new shared **ADR-0025 coverage receipt** (`scripts/patch-invitation-copy-coverage.ts`, adopted by all four patch scripts) surfaced a previously unreported trap: **`RockHabits` v3 and `leadership-vision-alignment` v4 are unpublished DRAFTs, so re-seeding either now FAILS CLOSED** (publish v3/v4 or re-run those seeds with `forceSupersedeDraft`) — SU-Full/Five-Dysf unaffected. The override-bypass gap is **split out to GH issue #220**. TDD (3 new drift-guards + parity guards + 2 renderer asymmetry tests; closes the #69 subject-by-omission residual) — **279 tests / 16 suites**, review-loop **4 rounds → 5/5**, Turbopack gate, CI-gated merge (PR #219); no migrations. Detail in CHANGELOG `jeff-jul10-76-80-invite-copy`. _(Prior, same day — **#69 Rockefeller invitation email SHIPPED** — second item in the one-item-at-a-time July-10 pass (grill + domain-modeling + Codex co-validate → thin-spec gate → TDD → PR → review-loop → merge → SoT). A pre-build state-check found #69 is **not** a clean four-ask build: **Ask 1** (removed the duplicate raw URL above the Start button) + **Ask 4** (body now leads "`{{coachName}}` has invited you to complete the Rockefeller Habits" — name **hardcoded** since `{{templateName}}`="…Checklist"; **subject unchanged**) shipped as seed-copy; **Ask 3** (keep the purple-header company line — deliberate contrast with #61) + **Ask 2a** (coach logo already renders below the SU logo) are **NO-OP guardrails** (added a logo-ORDER regression test); **Ask 2b** the broken red-X coach logo was **diagnosed CLEAN** — a live check of all 9 Rockefeller campaigns found both coach `profileImage`s return `200 image/jpeg` (Jeff's red-X was a stale historical send; invites read the image live at send so new ones render fine) → no code/data change. Invitation copy is a template-row field read live at send (seed edits don't reach prod): seed updated + the live prod row corrected by a new **atomic compare-and-swap** `scripts/patch-rockefeller-invitation-copy.ts` (**ADR-0025**; run + verified — `b294ebd969b4`→`b417f147939a`, dry-run idempotent, **0 campaign overrides** so it reaches all 9). TDD (seed drift-guard + seed↔script parity guard + logo-order guard) + review-loop **2 rounds → 5/5** + Turbopack gate + CI-gated merge (PR #216); no migrations. The #61 follow-on **F1** (legacy `ASSESSMENT_INVITE_BRANDED=0` kill-switch hardening) was **split out to GH issue #217** (not a Jeff #69 ask); **F2** (the atomic-patch pattern) shipped here. Detail in CHANGELOG `jeff-jul10-69-rockefeller-invite`.)_ _(Prior, July 24 — **#61 LVA invitation email SHIPPED**: coach-forward body, mid-email raw URL removed, header company line hidden for **LVA only** via a `showOrgLine` flag; seed + prod-row patch `scripts/patch-lva-invitation-copy.ts`; review-loop 5/5, PR #213; detail in CHANGELOG `jeff-jul10-61-lva-invite`.)_ **Prior (July 20–22, 2026):** the prod flag re-flip + live verification, the July-10 decision forks (#72 group reports, #64 Print/Download split), the July-10 no-decision batch, and **Wave ED10 LAUNCHED** (ED1–ED10 all live). ⚠️ The July-22 entry's "piped stdin stores an empty value" root cause is **RETRACTED** — see the 2026-07-29 recorrection above and the Known Quirks flag bullet. Detail in CHANGELOG `prod-flag-reflip-live-verify`, `jeff-jul10-forks-72-64`, `jeff-jul10-feedback-batch`, `ed10-launched`.)_)_)_)_)_ **Full history (Waves A–ED10, all earlier sprints) in [plans/CHANGELOG.md](plans/CHANGELOG.md).** |
| **Jeff #48 validation gate** | Visual validation is complete through two explicitly separated evidence sources. Published QSP v2 editor Preview proved desktop/mobile, flag-off, flag-on, Preview-disabled, and non-QSP states. Because Preview is read-only, a temporary uncommitted DB-free route mounted the real `QspStoryGroup`, canonical fixture, local answer state, and production CSS to directly prove Add/focus/restore; it was then removed. This harness is not claimed as Preview or Test Mode evidence, and no shared-data draft was created. |
| **Latest progress** | Jeff #48 **QSP core-values story grouping is BUILT behind a default-off flag and pending PR review / production launch**. Public, invited, and editor Preview paths retain the three original stable keys while presenting one progressive question when enabled; the kill switch restores the ordinary three-question UI. Full detail: `plans/CHANGELOG.md` entry `jeff-48-qsp-story-group-built`. |
| **Work Logs** | Session work logs at `~/.claude/worklogs/` — invoke `/log-session` to log or generate reports |

## Current Status

**Active items:** see `plans/JEFF_MAY6_SPRINT.md` for the open sprint ledger.

- **Jeff #48 QSP core-values stories:** built on `codex/issue-48-qsp-story-ui-design`, default-OFF and not launched. The approved progressive presentation is covered in public, invited, and read-only Preview paths without schema, seed-content, Esperto-import, payload, scoring, report, or historical-data changes. Published Preview plus a temporary DB-free real-component harness completed the visual states without creating a shared-data draft; pending independent whole-branch review before push/PR/merge. Full detail: `plans/CHANGELOG.md` entry `jeff-48-qsp-story-group-built`.
- **Jeff #83 Referred Results:** launched from PR #245 on production deployment `dpl_BZtaegoNCrfjpZAoVPpYQu7LxeDX`; enabled by the Production-only encrypted flag with the kill switch retained. Historical candidates remain unassigned by decision. Full detail: `plans/CHANGELOG.md` entry `jeff-83-referred-results-launched`.

**Open follow-ons (deferred for Beta hardening or external input):**
- Wave O: wire a log drain + the `18o-ops-runbook.md` §7 alert queries (launch observability = human-read `vercel logs` + kill switch)
- Wave O: align the report READ-path transaction budget with the #117 commit-path fix (5s Prisma default; fine same-region, trips on high-latency clients)
- Wave O: "Imported from Esperto (historical)" badge on rendered reports (campaign name carries "imported" today)
- Wave O: import pages' flag check is global-only — an org-scoped `_CANARY` hides the SU-Full UI even for the canaried org (page-gate follow-on if a future org canary is wanted)
- Per-recipient pre-send DB-check idempotency (Inngest replay duplicate-send risk)
- Immediate-path `executionId` synthesis with deterministic idempotency key (`inngestRunId` + `stepId`) so SEND_SURVEY_LINK FAILED-child writes work on the immediate path too — Wave 6 covers only the future RELATIVE_TO_EVENT path
- SEND_FILE_LINK / EMAIL_ATTENDEES FAILED-child writes (need SMTP error classification: terminal vs transient) — applies to BOTH execute-workflow.ts and trigger-workflow-step.ts
- Deterministic parent.id via `inngestRunId` for forceResend audit trail
- Error redaction codes for `WorkflowStepExecution.errorMessage`
- Structured logging/alerts/runbook for parent/child workflow execution state
- PII retention/erasure policy for recipient email audit data
- Concurrency limit + load test for large-attendee workshops
- ENH-MAY6-6 — affiliate provider switch (needs Jeff)
- ENH-MAY6-9 — aggregator as top-level toolset (needs design)
- ENH-MAY6-11 — coach-editable transactional emails (needs product call)
- Q-MAY6-1, Q-MAY6-2 — questions, not tasks
- STRIPE_WEBHOOK_SECRET rotation — pending Josh's authenticator

**Full sprint/wave history:** see [plans/CHANGELOG.md](plans/CHANGELOG.md) (extracted Feb 2026 → May 2026).

> Rollout note (2026-05-13): future history goes to `plans/CHANGELOG.md`, NOT here. CLAUDE.md "Current Status" stays a short summary.

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.1.6 |
| Language | TypeScript | 5.x |
| Database | PostgreSQL (Neon) + Prisma ORM | Prisma 6.x |
| Auth | NextAuth.js (JWT sessions, credentials provider) | |
| Payments | Stripe | |
| CRM | HubSpot | |
| Certifications | Circle.so | |
| Job Queue | Inngest | |
| Cache | Redis (Upstash) | |
| Email | Azure Communication Services | |
| Forms | Typeform (5 forms, webhook integration) | |
| CSS | Tailwind CSS + shadcn/ui | |
| Hosting | Vercel | |

## Workshop Lifecycle (JV-02: Jeff's 6 Stages)

```
REQUESTED → AWAITING_APPROVAL → PRE_EVENT → POST_EVENT → COMPLETED
                                    ↓
                                 CANCELED (from REQUESTED, AWAITING_APPROVAL, or PRE_EVENT)
```

- **REQUESTED**: Coach submits via wizard → Workshop + ApprovalQueue created simultaneously
- **AWAITING_APPROVAL**: Auto-approved (cert confidence >=85%) or manual review by Suzanne
- **PRE_EVENT**: Active, accepting registrations, landing pages live
- **POST_EVENT**: Event concluded, collecting feedback/surveys
- **COMPLETED**: All follow-up done
- **CANCELED**: Soft-delete; $500 fee if within 14 days of event (JV-28)

## Workshop Code (JV-03)

Every workshop gets a unique human-readable ID: `WS-YYYY-XXXX` (e.g., `WS-2026-A1B2`).
Generated by `src/lib/workshops/workshop-code.ts` via `generateUniqueWorkshopCode()`.

## Source Structure

```
src/
├── prisma/
│   ├── schema.prisma          # Data model (20+ models)
│   ├── seed.ts                # Dev seed data
│   └── seed-real-data.ts      # Real Kajabi migration data
├── src/
│   ├── app/
│   │   ├── (dashboard)/       # Admin/staff dashboard (requires ADMIN/STAFF role)
│   │   │   ├── layout.tsx     # Nav: Dashboard, All Workshops, Bio, Templates, Workflows, Surveys, Files, Partners, Coaches, Approvals, Categories, Pricing, Financials
│   │   │   ├── dashboard/     # Admin overview
│   │   │   ├── workshops/     # Workshop CRUD, detail, landing pages, quick-actions
│   │   │   ├── coaches/       # Coach management
│   │   │   ├── bio/           # BIO pages
│   │   │   ├── templates/     # Template management
│   │   │   ├── admin/surveys/  # Survey template management (form builder + results)
│   │   │   ├── admin/files/   # File manager (upload, filter, delete)
│   │   │   ├── partners/      # Partner management
│   │   │   └── contacts/      # CRM contacts
│   │   ├── (portal)/          # Coach self-service portal (requires COACH role)
│   │   │   ├── layout.tsx     # Sidebar nav with search, notifications, sign out
│   │   │   └── portal/
│   │   │       ├── home/      # Coach dashboard
│   │   │       ├── assessments/referred-results/ # Authenticated Coach-owned public submission results
│   │   │       ├── workshops/ # My Workshops + detail (with cancel button)
│   │   │       ├── registrations/ # Registration management
│   │   │       ├── request/   # Workshop request wizard (3-step)
│   │   │       ├── settings/  # Profile + password change
│   │   │       ├── templates/ # Available templates
│   │   │       └── follow-up/ # 90-day follow-up
│   │   ├── (public)/          # Public pages (no auth)
│   │   │   ├── login/         # Credentials login
│   │   │   ├── register/      # Coach signup
│   │   │   ├── workshop/[slug]/ # Public landing pages
│   │   │   ├── quiz/[campaignAlias]/ # Public Quick Assessment + consent-matched referral flow
│   │   │   ├── w/[slug]/      # Short URL redirect
│   │   │   └── registration/success/ # Post-registration confirmation
│   │   ├── (report)/assessments/public-submissions/[submissionId]/report/ # Authenticated frozen public report
│   │   │   ├── admin/approvals/  # Approval queue management (merged into dashboard layout)
│   │   │   ├── admin/categories/ # Category CRUD (JV-16)
│   │   │   ├── admin/dashboard/  # Admin analytics + 6-stage pipeline (JV-01)
│   │   │   ├── admin/financials/ # Financial dashboard (JV-21)
│   │   │   ├── admin/pricing/    # Pricing tier CRUD (JV-17)
│   │   │   └── admin/settings/   # Admin settings + password change
│   │   └── api/               # API routes (see below)
│   ├── components/
│   │   ├── ui/                # shadcn/ui + custom (status-pill, copy-url-button)
│   │   ├── auth/              # Shared auth (change-password-form)
│   │   ├── workshops/         # Workshop components (wizard, cancel-dialog)
│   │   │   └── wizard/        # 3-step wizard (Step1Details, Step2Logistics, Step3Review, WizardContext)
│   │   ├── templates/         # Landing page templates
│   │   ├── contacts/          # Contact management
│   │   ├── surveys/           # Survey components (template-editor)
│   │   ├── files/             # File management components
│   │   ├── assessments/       # Assessment UI, including ReferredResultsList
│   │   └── affiliate/         # Partner/affiliate components
│   ├── lib/                   # Core business logic
│   │   ├── auth/              # Auth: auth.ts, authorization.ts, password-reset.ts, auth-posture.ts, access-control.ts
│   │   ├── workshops/         # Workshop logic: workshop-code.ts, workshop-coupons.ts, workshop-financials.ts, lead-time-validator.ts
│   │   ├── surveys/           # Survey logic: survey-service.ts, survey-types.ts, survey-automation.ts
│   │   ├── templates/         # Template logic: template-interpolation.ts, template-interpolation-core.ts, template-utils.ts, template-preview.ts, template-editor-utils.ts
│   │   ├── workflows/         # Workflow logic: workflow-service.ts, workflow-types.ts
│   │   ├── files/             # File logic: file-service.ts, file-access.ts, file-download-path.ts, file-rules.ts
│   │   ├── assessments/       # Scoring, referral ownership/access, frozen reports, feature flags
│   │   ├── approval-engine.ts # Auto-approval logic (cert confidence >=85%)
│   │   ├── smtp-transport.ts  # Shared SMTP transport (single source of truth for email sending)
│   │   ├── registration-service.ts # Registration with capacity/duplicate checks
│   │   ├── validations.ts     # Zod schemas
│   │   ├── utils.ts           # formatDate, formatCurrency, generateSlug, getWorkshopStatusLabel
│   │   ├── rate-limit.ts      # API rate limiting
│   │   └── db.ts              # Prisma client singleton
│   ├── services/              # External service integrations
│   │   ├── stripe.ts          # Payments, cancellation fees, refunds
│   │   ├── hubspot.ts         # CRM sync
│   │   ├── circle.ts          # Certification verification
│   │   ├── email-sender.ts    # Email sending (uses shared smtp-transport)
│   │   └── notifications.ts   # Multi-channel notifications (uses shared smtp-transport)
│   ├── inngest/               # Background job definitions
│   └── __tests__/             # Jest unit tests
└── package.json
```

## API Routes

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/approvals` | GET, POST | List/create approval requests | Admin (GET), Any auth (POST) |
| `/api/approvals/[id]/respond` | GET, POST | Approve/deny (GET=email link, POST=dashboard) | Admin |
| `/api/workshops` | GET, POST | List/create workshops | Auth required |
| `/api/workshops/[id]` | GET, PATCH, DELETE | Workshop CRUD + cancellation | GET: owner/admin, PATCH: admin, DELETE: owner/admin |
| `/api/workshops/[id]/clone` | POST | Clone a workshop | Admin |
| `/api/workshops/[id]/register` | POST | Public registration | Public |
| `/api/workshops/[id]/status` | PATCH | Status transitions | Admin |
| `/api/workshops/[id]/lock` | POST | Lock/unlock workshop | Admin |
| `/api/workshops/[id]/circle-profile` | GET | Fetch Circle bio for landing page auto-populate | Auth required |
| `/api/workshops/[id]/ics` | GET | Download .ics calendar file for workshop | Public |
| `/api/workshop-drafts` | GET, POST | Auto-save wizard drafts | Coach |
| `/api/auth/change-password` | POST | Change password (any user) | Any auth |
| `/api/auth/coach-signup` | POST | Coach self-registration | Public |
| `/api/auth/forgot-password` | POST | Password reset request | Public |
| `/api/auth/reset-password` | POST | Password reset execution | Public |
| `/api/categories` | GET, POST | Category CRUD (GET=public, POST=admin) | GET: Public, POST: Admin |
| `/api/categories/[id]` | PATCH, DELETE | Update/delete category | Admin |
| `/api/pricing-tiers` | GET, POST | Pricing tier CRUD (GET=public, POST=admin) | GET: Public, POST: Admin |
| `/api/pricing-tiers/[id]` | PATCH, DELETE | Update/delete pricing tier | Admin |
| `/api/coaches` | GET, POST | Coach CRUD | Admin |
| `/api/coaches/[id]` | GET, PATCH, DELETE | Coach detail/update/delete | Admin |
| `/api/coaches/[id]/certifications` | POST, DELETE | Grant/revoke workshop type certification | Admin |
| `/api/assessments/referred-results` | GET | Coach-owned public submissions with scoped pagination/search | Coach |
| `/api/admin/public-campaigns/[id]/submissions` | GET | Public campaign submissions with result/report oversight | Admin/Staff |
| `/api/quiz/[campaignAlias]/submit` | POST | Public Quick Assessment submission with verified referral ownership | Public, rate-limited |
| `/api/registrations` | GET | Registration list | Auth required |
| `/api/landing-pages` | GET | Landing page list | Admin |
| `/api/workflows` | GET, POST | List/create workflows | Auth required |
| `/api/workflows/[id]` | GET, PATCH, DELETE | Workflow CRUD | Auth required |
| `/api/workflows/[id]/steps` | POST, PATCH | Add/reorder workflow steps | Auth required |
| `/api/workflows/[id]/steps/[stepId]` | PATCH, DELETE | Update/delete step | Auth required |
| `/api/workflows/[id]/assign` | POST, DELETE | Assign/unassign workflow to workshop | Auth required |
| `/api/workflows/[id]/executions` | GET | Workflow execution status by workshop | Auth required |
| `/api/survey-templates` | GET, POST | List/create survey templates | Auth required |
| `/api/survey-templates/[id]` | GET, PATCH, DELETE | Survey template CRUD | Auth required |
| `/api/survey-templates/[id]/questions` | POST, PATCH | Add/reorder questions | Auth required |
| `/api/survey-templates/[id]/questions/[qId]` | PATCH, DELETE | Update/delete question | Auth required |
| `/api/survey-templates/[id]/results` | GET | Aggregated survey results | Auth required |
| `/api/surveys/[id]` | GET | Get survey form (public) | Public |
| `/api/surveys/[id]/submit` | POST | Submit survey answers (public) | Public |
| `/api/surveys/assign` | POST | Assign template to workshop | Auth required |
| `/api/files` | GET, POST | List files (filterable) / Upload file (FormData) | Auth required |
| `/api/files/[id]` | GET, PATCH, DELETE | File details / Link to workflow step / Delete | Auth required |
| `/api/webhooks/typeform` | POST | Typeform form submission | Webhook secret |
| `/api/webhooks/stripe` | POST | Stripe payment events | Webhook signature |

## Data Model (Key Models)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `User` | Auth accounts | email, role (ADMIN/STAFF/COACH), passwordHash |
| `Coach` | Coach profiles | email, userId (FK to User), certificationStatus, territory |
| `AssessmentSubmission` | Frozen assessment answers/results and immutable verified referral ownership | campaignId, result, publicTaker, referringCoachId, referringCoachEmail |
| `AssessmentEmailOutbox` | Transactional public assessment report/lead email delivery | submissionId, recipientRole, status, attempts |
| `Workshop` | Workshop events | workshopCode, coachId, status (6 stages), eventDate, priceCents, termsAcceptedAt |
| `WorkshopType` | Workshop templates | name, slug, pricingTiers (JSON), durationOptions (JSON) |
| `Category` | Dynamic categories (JV-16) | name, slug (replaces enum) |
| `PricingTier` | Pricing dropdown (JV-17) | categoryId, amountCents |
| `Registration` | Attendee records | workshopId, email, paymentStatus, stripePaymentId |
| `ApprovalQueue` | HITL approval system | type, coachId, workshopId, status |
| `LandingPage` | Generated pages | workshopId, template, slug, content (JSON) |
| `WorkshopPage` | Unique pages per workshop (JV-10) | workshopId, workshopCode, pageType |
| `AuditLog` | All actions tracked | entityType, entityId, action, performedBy |
| `WorkshopDraft` | Wizard auto-save | userId, stepsData (JSON), currentStep |
| `Workflow` | Email sequence definitions (JV-11) | name, isTemplate, isActive, steps[] |
| `WorkflowStep` | Individual steps in a workflow | stepType, triggerType, offsetDays, subject, body |
| `WorkflowAssignment` | Links workflows to workshops (JV-04) | workflowId, workshopId, workshopCode |
| `WorkflowStepExecution` | Tracks step execution state | stepId, workshopId, status, scheduledFor |
| `Workshop.workshopBuiltEmailSentAt` | Atomic guard — set when "Workshop Ready" email is sent | DateTime?, null = not yet sent (BUG-MAY4-2) |
| `SurveyTemplate` | Reusable survey definitions (JV-13) | name, surveyType, isActive, questions[] |
| `SurveyQuestion` | Individual questions in a template | templateId, questionType, label, options (JSON) |
| `Survey` | Survey instance per workshop | templateId, workshopId, workshopCode, completedAt |
| `SurveyAnswer` | Individual answers per question | surveyId, questionId, value, numValue |
| `FileAttachment` | Uploaded files (Vercel Blob) (JV-12) | filename, blobUrl, contentType, workshopId, workflowStepId |

## Authorization Model

| Role | Access |
|------|--------|
| **ADMIN** | Full access to all routes and data |
| **STAFF** | Same as admin except certain settings |
| **COACH** | Portal only; can manage own workshops, registrations, profile |

Key functions in `lib/auth/authorization.ts`:
- `getApiActor()` — Returns authenticated user info from JWT session
- `requireCoach()` — Server component guard; redirects if not a coach
- `isPrivilegedRole(role)` — Returns true for ADMIN or STAFF
- `canManageCoachData(actor, coachId)` — Coach can manage own data, admin can manage any

## Human-in-the-Loop (HITL)

All these require manual approval by Suzanne:
- Custom pricing requests (auto-approve if cert confidence >=85%)
- Workshop cancellations within 14 days ($500 fee)
- Refund processing
- Certification edge cases (<85% confidence)

**Notification:** Email via Azure Communication Services (NOT Slack)

## Jeff Verdun's 29 Revisions (Feb 15, 2026)

Cataloged in `plans/JEFF_VERDUN_REVISIONS_IMPLEMENTATION_ROADMAP.md` (IDs JV-01 through JV-29).

### Completed JV revisions

**JV revisions shipped (25 of 29):** JV-01, 02, 03, 04, 05, 06, 07, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 26, 27, 28, 29. Per-revision implementation detail: [plans/CHANGELOG.md](plans/CHANGELOG.md).

**JV revisions remaining (4):** JV-08 (HTTPS env canonicalization), JV-12 hardening (protected file delivery by stage threshold), JV-23 (email tracking), JV-24 (Circle SSO/auth).

## Development Commands

```bash
cd "D:\The CTO Project\Scaling Up Platform v2\src"

npm run dev              # Start dev server (Turbopack)
npm run build            # Production build (always run before committing)
npm run test             # Jest unit tests
npm run test:e2e         # Playwright E2E tests
npm run lint             # ESLint
npx prisma generate      # Regenerate Prisma client after schema changes
npx prisma migrate dev   # Create + apply migrations
npx prisma db push       # Push schema without migration (dev only)
npx tsx prisma/seed.ts   # Seed dev data
npx tsx prisma/seed-real-data.ts  # Seed real Kajabi migration data
npx tsx prisma/seed-templates.ts # Seed active landing page templates for auto-build
```

## Environment Variables

Secrets are in local `.env` (gitignored) and Vercel dashboard. Key variables:

- `DATABASE_URL` / `DIRECT_URL` — Neon PostgreSQL
- `NEXTAUTH_SECRET` / `NEXTAUTH_URL` — Auth
- `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` — Canonical admin
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Payments
- `HUBSPOT_ACCESS_TOKEN` — CRM
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` — Job queue
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Cache
- `TYPEFORM_WEBHOOK_SECRET` — Form webhooks
- `AZURE_COMMUNICATION_CONNECTION_STRING` — Email
- `APP_URL` — Public URL for landing page links

## Known Quirks & Gotchas

- **Inngest event keys** do NOT start with `evt_` — use key-in-URL format `https://inn.gs/e/<key>`
- **Typeform webhook signature**: HMAC SHA-256, base64, header `typeform-signature: sha256=<base64>`. May append trailing `\n` to body.
- **🔴 The PRODUCTION Vercel project is under the `scaling-up` team, NOT `chief-aio-fficer` (corrected 2026-07-29)**: **two** projects are named `scaling-up-platform-v2`, and the older guidance in this file pointed at the wrong one. Ground truth, verified via the REST API on 2026-07-29:
  | Team | Project id | Domains | Env vars |
  |---|---|---|---|
  | **`scaling-up`** (`team_ek3PMuEYCgI0DKZ2EFexMgya`) | **`prj_xcAWuAmGZAU3DCHgAauRv2WPKneo`** | **`scaling-up-platform-v2.vercel.app` + `platformtest.scalingup.com`** | **77 (29 wave flags)** |
  | `chief-aio-fficer` (`team_NSqdz5YhYnOlVU5ksBnXWyC8`) | `prj_5sLDrY9JRaCvSR3s8sqlXgepVWfh` | `scaling-up-platform-v2-dun.vercel.app` only | **0** |
  The `scaling-up` project is the one that receives our merges — its two most recent Production deploys (2026-07-28 12:26 and 12:34 UTC) match PR #230 and PR #231 exactly. **Querying `--scope chief-aio-fficer` returns an EMPTY env list and will make you conclude "no flags are set" when they are.** Note the repo lives in the `ChiefAI-Officer` GitHub org while the Vercel project lives in the `scaling-up` team — the mismatch is the trap.
  **The local `.vercel` link is MIS-PAIRED, not merely stale:** `src/.vercel/project.json` holds the **correct** `projectId` (`prj_xcAWuAmGZAU3DCHgAauRv2WPKneo`) with **chief-aio-fficer's** `orgId` (`team_NSqdz5YhYnOlVU5ksBnXWyC8`) — a right-project/wrong-team pairing, which is exactly why `vercel env pull` reports "Your Project was either deleted, transferred… or you don't have access". ⚠️ **`scripts/push-env-to-vercel.mjs` builds every REST call as `?teamId=…` and would therefore target the wrong team — do NOT run it until the link is repaired.** `vercel link` writes `.vercel/` + edits `.gitignore` — avoid it; prefer passing the right `teamId` explicitly. Read env via the REST API with the CLI's own token (`~/Library/Application Support/com.vercel.cli/auth.json` → `.token`): `GET https://api.vercel.com/v9/projects/<id>/env?teamId=<team>&decrypt=true`. **`decrypt=true` did NOT decrypt on this plan** — non-empty values come back as ~970-char ciphertext, so you can reliably tell **set vs empty** but NOT `"1"` vs `"0"`. That distinction is usually enough, because `isOn()` only accepts `"1"|"true"|"TRUE"|"yes"`. Never paste secret values anywhere; filter to the `WAVE_*` keys you actually need.
- **Prod feature-flags: verify VALUES via the Vercel CLI, and WRITE them via the REST API — NOT piped `vercel env add` (2026-07-22, ROOT-CAUSED + FIXED)**: An authenticated `vercel env pull --environment=production` audit found ~15 "launched" wave-flags (`WAVE_ED9/ED10/O/X/P/Q/S/T/U/U3/V/W`, plus `ED1/2/4/6/8`) stored EMPTY (OFF) in Production despite the docs. **Proven cause:** `vercel env add <KEY> production` fed from **piped stdin** (`printf '1' | …`) silently stores an EMPTY value (reproduced live: add via pipe → pull shows `=""`; add the same key via REST → pull shows `="1"`). It is **NOT** `scripts/push-env-to-vercel.mjs` — that script only touches keys present in local `src/.env` (the wave toggles aren't there — only `WAVE_O_ESPERTO_IMPORT_HASH_SALT` is) and its line-172 guard skips empty values before the delete; **no SKIP-list change is needed** (the earlier suspicion was wrong). **Correct write path = the Vercel REST API** (`POST /v10/projects/{id}/env`, `type:"encrypted"`, `target:["production"]`) — the same path `push-env-to-vercel.mjs` uses, which is why `WAVE_D_*`/`F`/`J`/`M`/`N`/`WORKSHOP_CUSTOM_HTML` stayed "1". After any env change, **redeploy** (env is injected at build time). On 2026-07-22 the 12 clean flags were re-set via REST + redeployed (build `mcflc46pq`) and live-verified as admin: **9 confirmed live in-app** (ED9/ED10/O/X/Q/T/U/W/V); **S** flag-on but the LVA "Peer averages" panel needs the published version to expose SLIDER_LIKERT keys (follow-up); **P/U3** flag-on but only observable in a sent email. `isOn("")` is false. 🔴 **YOU CANNOT READ A `sensitive`-TYPED FLAG'S VALUE — AN EMPTY READ IS NOT AN EMPTY VALUE (established 2026-07-29, after TWO wrong conclusions).** Read this whole bullet before drawing any conclusion about prod flag state.
  - **The proof needs no Vercel knowledge, and it is in our own records.** ED10's `ed10Active` requires `activeAuthoringMode === "single"` (`TabbedShell.tsx:472-476`), and `"single"` comes *only* from `singleColumnEnabled` (`:461-463`) ← `isOn(WAVE_ED6_SINGLE_COLUMN_ENABLED)`; ED9's FormsBuilder swap needs the same (`:969`). The 2026-07-22 session read **ED6 as empty**, deliberately **excluded** it from the re-set — and then **live-verified ED9 and ED10 in that same session**. **ED6 was ON while being reported empty.** That entry contradicts itself.
  - **`sensitive` values still inject at build AND runtime** (Vercel docs + a staff repro). `sensitive` never meant dark. Local proof: `WAVE_O_ESPERTO_IMPORT_HASH_SALT` reads empty, yet `resolveEspertoImportHashSalt()` (`esperto-import/restricted-route-helpers.ts:431`) **throws** when it is falsy under `VERCEL_ENV`, and the Wave O / Wave X import handlers ran clean in prod — so it is demonstrably set.
  - **Which flags are unreadable:** as of 2026-07-29, 8 of 29 `WAVE_*` prod vars are `type:"sensitive"` and read back empty — `ED1`, `ED2`, `ED4`, `ED6`, `ED8`, `WAVE_F_GROUP_REPORT_CANARY`, `WAVE_O_ESPERTO_IMPORT_HASH_SALT`, `WAVE_S_PEER_BENCHMARKS_KILL`. The other 21 are `encrypted` and readable. That partition matches **write path**, not truth: `vercel env add` defaults to `sensitive` since CLI 51.8.0 (2026-04-20) and skips the prompt on piped input, while REST `type:"encrypted"` stays readable. Treat every `sensitive` var's value as **UNKNOWN**.
  - ⚠️ **`WAVE_S_PEER_BENCHMARKS_KILL` is one of the unreadable 8** — an earlier claim here that it is "empty, therefore peers are not killed" was unfounded. If it is set, peers are dark regardless of `_ENABLED`. Tracked in **GH #233**.
  - **`vercel env pull` does NOT resolve this even on a current CLI.** 56.3.0 writes a `[SENSITIVE]` placeholder, but it derives that from *falsy value ∧ sensitive type* — so a genuinely-empty sensitive var renders identically. **The only reliable answer is a live in-app check, or rewriting the var via REST as `encrypted`.**
  - **Method note:** read env via `GET /v10/projects/{id}/env?teamId=…&decrypt=true` (Vercel documents v10; a v9 call was used on 2026-07-29). Vercel documents no sensitive carve-out for REST — the empty read there is our observation, not documented behaviour.
  **⚠️ RETRACTED CLAIMS — do not restore any of these:** (a) that `ED1`/`ED8` "are flagless" (they are flag-gated); (b) that `ED1`/`ED8` are **dark in prod** — never measured, and for **ED8 the evidence says it was ON**: the 07-22 sighting of "Roll back/Archive" matches labels that exist only in the ED8 branch (`VersionsTab.tsx:371,416`), unreachable behind the early return at `:124` (which falls back to a **legacy Version History table**, not to nothing); (c) that **ED10 does not depend on ED6** — it does, via `activeAuthoringMode`; (d) that the 07-22 **"piped stdin stores an empty value"** root cause is proven — CLI 51.8.0's sensitive-by-default fully explains the observation with no value loss. Gate-citation precision: ED8 has its **own** `isOn` (`wave-ed8-flags.ts:24-26`) and an **unchecked KILL lever** (`:33`) — a second way it could be dark.
  **Current state of `WAVE_ED1_TEST_MODE_ENABLED` / `WAVE_ED8_VERSION_LIFECYCLE_ENABLED`: both were rewritten as `encrypted` `"1"` on 2026-07-29 and are now readable — but that change is NOT live until the next production build.**
  **Standing lesson (twice-earned):** *"I saw it render" beats "the flag reads empty"* — the render is downstream of the real value; the read may be an artifact. When they disagree, **the sighting wins** unless you can name the gate that would have blocked it. Detail in CHANGELOG `flag-state-recorrection` (supersedes `flag-state-correction-ed1-ed8`) + memory `project_prod_flag_state_discrepancy`.
- **Vercel env vars** need a redeploy to take effect
- **Workshop status spelling**: Workshop uses "CANCELED" (American); Registration/PageStatus uses "CANCELLED" (British) — different domains, intentional
- **workshopType is optional**: Made nullable in Sprint 0 (JV-16). Always use `workshop.workshopType?.` with optional chaining.
- **Build script runs migrations**: `prisma migrate deploy` runs automatically during `npm run build` (added Feb 27). Never remove this — without it, new schema columns cause runtime crashes on Vercel because the Prisma client expects columns the DB doesn't have yet.
- **Dashboard canonical route is `/admin/dashboard`**: The `/dashboard` route redirects to `/admin/dashboard`. Do NOT create pages at `/dashboard` directly.
- **File uploads**: Filenames are sanitized (path separators, null bytes, `..` stripped) before Vercel Blob storage
- **File deletion**: Ownership verified — only the uploader or ADMIN/STAFF can delete files
- **Survey submission**: Public endpoint rate-limited at 20 req/min per IP
- **SMTP transport**: All email sending goes through `lib/smtp-transport.ts` — do NOT create new nodemailer transports elsewhere
- **Invitation copy lives on the TEMPLATE ROW, and two things bypass it (2026-07-27)**: `invitationSubject` / `invitationBodyMarkdown` are `AssessmentTemplate` fields read **live at send** — a deploy never rewrites them, so seed edits do NOT reach prod. Correct a live row with an atomic compare-and-swap script (**ADR-0025**; four exist: `scripts/patch-{lva,rockefeller,scaling-up-full,five-dysfunctions}-invitation-copy.ts`, all sharing `scripts/patch-invitation-copy-coverage.ts`). **Bypass 1 — campaign overrides:** `AssessmentCampaign.invitationBodyMarkdown` / `invitationBodyHtml` / `invitationSubject` take precedence, so a template patch never reaches those campaigns. A **full-HTML override replaces the branded shell entirely** — no SU logo, no coach logo, no coach-forward body (`notifications.ts` render precedence). This is the proven root cause of Jeff #76's QSP report (prod telemetry: 4 `renderer:"custom_html"` sends on 2026-07-10) and is tracked in **GH #220** — before treating an invite-copy complaint as a template regression, check for campaign overrides and the `EMAIL_DELIVERY` renderer telemetry. **Bypass 2 — the legacy renderer:** `ASSESSMENT_INVITE_BRANDED=0` routes to `sendLegacyInvitationEmail`, which has no `dropRedundantCta` and hardcodes `coachName: null`; dormant in prod, tracked in **GH #217**. **Also:** patching a row makes the latest version's `contentHash` stale — if that version is an unpublished DRAFT and the seed doesn't pass `forceSupersedeDraft`, the next re-seed **fails closed**. True today for `RockHabits` v3 and `leadership-vision-alignment` v4. The patch scripts' coverage receipt prints all of this on every run.
- **Admin layout unified**: All admin pages are under `(dashboard)/admin/` — the standalone `/admin/` layout was removed in Feb 26 cleanup
- **Admin nav is grouped (Wave H)**: 7 top-level entries — Dashboard · Workshops▾ · Approvals · Assessments · Automation▾ · People▾ · Financials▾. Group labels are menu-only (open a dropdown, don't navigate); only leaves + the Dashboard/Approvals/Assessments links navigate. Group chevrons are 16px lucide icons that rotate on open (no "→" arrows). Approvals + Refunds carry fail-soft pending-count badges (zero→no badge). Disclosure pattern, single `openGroup` state, NOT `role=menu`. Source of truth `lib/nav/admin-nav-model.ts` (homes all 16 routes); counts via `lib/nav/admin-nav-badges.ts`. The full grouped bar shows at `xl` (1280px+); the hamburger (same groups, collapsed by default) shows below `xl`.
- **Dead code removed (Feb 26)**: animations.ts, cache.ts, api-handler.ts, logger.ts, landing-page-auto-populate.ts, workshop-generator.ts — all deleted, zero imports
- **Approval engine emits Inngest events**: `workshop/approved` event emitted on approval (added in Sprint 5) — triggers auto-build function
- **Bio page CTA toggle exists**: Bio page editor already has "Show CTA button on bio page" checkbox (discovered via video analysis)
- **npm audit**: 3 low-severity `cookie` vulns via `@auth/core` → next-auth. Fix requires next-auth downgrade — deferred
- **Design tokens live in globals.css only**: `brand-tokens.css` was deleted (zero imports). `MASTER.md` is reference docs only.
- **Never use hardcoded Tailwind colors for semantic states**: Use `text-destructive` not `text-red-600`, `bg-success/10` not `bg-green-50`, `text-primary` not `text-blue-600`.
- **Sidebar uses `--sidebar-*` tokens**: Coach portal sidebar uses `bg-sidebar`, not `bg-slate-900`.
- **Workshop status colors use `--status-*` tokens**: `getWorkshopStatusColor()` and `StatusPill` both use dedicated status tokens.
- **Security S1-S8 applied**: Nonces, webhook secrets, survey validation, JSON safety, error handlers, 15s timeouts, idempotency, email dedup.
- **Never push NODE_ENV to Vercel**: Vercel manages NODE_ENV automatically. Pushing `NODE_ENV=production` causes `npm install` to skip devDependencies, breaking builds (e.g., `@tailwindcss/postcss` not found). The `scripts/push-env-to-vercel.mjs` script has NODE_ENV in its SKIP list.
- **Workshop.eventDate is midnight UTC — always use resolveEventStartMoment**: `eventDate` is stored as 00:00 UTC. The actual event time is in `eventTime` (string, "16:00 - 18:00") and `timezone` (IANA). Always call `lib/workflows/resolve-event-start-moment.ts` → `resolveEventStartMoment(workshop)` before passing a time to `calculateSendDate`. Bypassing this causes scheduledFor to land ~20h in the past.
- **workshopBuiltEmailSentAt is the "Workshop Ready" email claim**: `runAutoBuild` sets this atomically before sending. If it's already non-null, the email was already sent — don't send again. Cleared on SMTP failure so a retry can re-send.
- **Workflow variables support both naming conventions**: `interpolateTemplate()` in `lib/workflows/workflow-service.ts` accepts both camelCase (`{{workshopTitle}}`) and snake_case (`{{workshop_title}}`). Also supports `{{attendee_name}}` as alias for `{{registrantName}}`.
- **lib/ is now domain-organized**: `lib/auth/`, `lib/workshops/`, `lib/surveys/`, `lib/templates/`, `lib/workflows/`, `lib/files/` subdirectories. Cross-cutting utilities stay at `lib/` root. See `project-file-map` skill for quick lookup.
- **Next.js middleware lives at `src/src/middleware.ts`** — renamed from the inactive `proxy.ts`. Next.js picks it up because `app/` and middleware must share the same parent directory (`src/src/`).
- **`prisma/*.db` is gitignored**: SQLite dev databases are excluded. The app uses Neon PostgreSQL in all environments.
- **Env push script (`scripts/push-env-to-vercel.mjs`)**: Uses Node.js `input` option on `execSync` to pipe values — NOT shell `echo` (which breaks on Windows due to literal quote preservation). Production overrides for URL-related vars. SKIP list: `BLOB_READ_WRITE_TOKEN`, `NODE_ENV`.
- **Node version pinned**: `.nvmrc` pins Node 20 for Vercel compatibility. Local development should use Node 20.
- **tsconfig excludes scripts**: `prisma/seed*.ts` and `scripts/**` are excluded from TypeScript build checking — they're standalone CLI scripts, not app code.
- **Always run `CI=true npm run build` before pushing**: See "Deployment Verification Protocol" section below.

## Deployment Verification Protocol

**MANDATORY before every `git push` to `main`:**

1. **Run the FULL Vercel build command locally** (not just `next build`):
   ```bash
   CI=true npm run build
   ```
   This runs `prisma generate && prisma db push && next build` with CI mode — matching Vercel exactly.

2. **Check ESLint on changed files:**
   ```bash
   npx eslint <changed-files>
   ```
   Fix ALL warnings AND errors. Vercel may treat warnings as build failures.

3. **Run tests on changed areas:**
   ```bash
   npm run test -- --passWithNoTests
   ```

4. **After pushing, verify Vercel deployment status:**
   ```bash
   npx vercel ls 2>&1 | head -5
   ```
   Wait for `● Ready` status. If `● Error`, check build logs in Vercel dashboard.

5. **If Vercel build fails but local passes:**
   - Check Node version: `.nvmrc` pins Node 20 (Vercel default). Local must match.
   - Check `tsconfig.json` exclude list: standalone scripts (`prisma/seed*.ts`, `scripts/**`) are excluded to prevent cross-platform TS issues.
   - Check for stale build cache: try redeploying from Vercel dashboard with "Clear Build Cache" option.
   - Check `prisma db push` connectivity: Neon databases may cold-start timeout on Vercel's build server.

**Why this matters:** Local `npx next build` does NOT match the Vercel build pipeline. The Vercel build also runs `prisma generate` + `prisma db push` (database migration), and runs in a Linux/Node 20 environment. A passing local build does NOT guarantee a passing Vercel build.

## Standing Security Practice

Security improvements ship with every sprint — no separate security sprint needed. Jeff is already aware of the security posture. On every sprint:
- Validate input at all new API boundaries (Zod)
- Rate-limit any new POST/mutation endpoints (`withRateLimit`)
- Auth check first (`getApiActor()` → 401 if null)
- No raw HTML injection in JSX (escape user-controlled fields)
- Audit log on sensitive mutations (`logAudit()`)
- No secrets or tokens in console.log

## Continuous Update Protocol

**After every sprint or significant change, update this file:**
1. Move completed JV revisions to the "Completed" table
2. Update "Current Status" section with sprint progress
3. Update "Last Updated" date
4. Add any new API routes, models, or components to the relevant sections
5. Document new gotchas or quirks discovered during development
6. Append full implementation detail to [plans/CHANGELOG.md](plans/CHANGELOG.md) (newest first with HTML-comment anchor `<!-- ENTRY_ISO:YYYY-MM-DD ENTRY_SLUG:kebab-slug -->`); update only the LAST_UPDATED_ISO/LAST_UPDATED_SLUG anchor + brief prose in the Project Context table.

## Agent skills

### Issue tracker

Issues live as GitHub Issues on `ChiefAI-Officer/Scaling-up-platform-v2`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five state labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus category labels (`bug`, `enhancement`, `security`, `documentation`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. `CLAUDE.md` is the primary reference; `CONTEXT.md` and `docs/adr/` are created lazily by `/grill-with-docs`. See `docs/agents/domain.md`.

### Historical work lookup

For sprint/wave detail: read [plans/CHANGELOG.md](plans/CHANGELOG.md). For code-level history: `git log -p` + `git blame -C -C`. For session-level work logs: `~/.claude/worklogs/` (invoke `/log-session`).
