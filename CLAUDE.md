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
| **Integrated main history** | **GH #233 peer-benchmark Production auditability is LAUNCHED** from PR #300 (squash `df3f2f51`) with exact Production deployment `dpl_EMoVJ6H2VFBrwTBZquXEcCCAffpd`, both health endpoints healthy, secure unauthenticated interception, and issue/claim/Notion closeout complete. **GH #257 residual assessment-email outbox reconciliation is LAUNCHED + DEFAULT-OFF** from PR #296 (squash `613cb0ce`) with exact Production deployment `dpl_CKS139kLjuXPJpFXdohxbc5384Bn`, the capability flag absent, both health endpoints healthy, and issue/claim/Notion closeout complete. **GH #220 branded campaign invitation HTML is LAUNCHED + DEFAULT-OFF** from PR #292 (squash `fe3deeba`) with the new branded-body flag and renderer kill absent, existing full-replacement semantics still active, both health endpoints healthy, and issue/claim/Notion closeout complete. **GH #228 Results report email branding is LAUNCHED + DEFAULT-OFF** from PR #288 (squash `5f1d53d3`) with all three Production rollout variables absent, both health endpoints healthy, and the claim released. **Jeff #65 stable reminder links are LAUNCHED** from PR #282 (squash `050573fa`) with the Production global flag enabled, the kill switch off, and the claim released. Its additive token-history migration backfilled all 103 invitations without a missing parent or duplicate hash/sequence group. **Jeff #48 shipped in PR #251** (squash `d676aa77`) after the protected gates. The assessment-email duplicate-delivery hotfix from PR #250 (`d4df6db1`) is launched and its controlled Inngest cutover is complete. Wave EV remains shipped from PR #241 (`cc370aa9`). **Wave OSR (#71) is LAUNCHED, not dark**; its Production flag is enabled and its fast kill remains the campaign checkbox. |
| **Last Updated** | <!-- LAST_UPDATED_ISO:2026-08-11 LAST_UPDATED_SLUG:coach-profile-fields-aligned-release-ready --> August 11, 2026 — **Coach profile-field alignment is locally verification-complete except for the final post-fix Turbopack retry.** Professional Title now maps to `Coach.title` and Company Name to `Coach.company` across profile, BIO, Circle, and new landing/default paths; legacy reads retain a company fallback without a migration or data rewrite. The post-fix full Jest gate passed, the final local build attempt was inconclusive while type-checking, and authenticated local visual acceptance remains pending because the displayed localhost demo credentials are invalid and no authorized local test account is available. Full evidence is in CHANGELOG entry `coach-profile-fields-aligned-release-ready`. |
| **Jeff #48 validation** | Pre-launch validation passed 15/15 focused suites and 224/224 tests plus the production-context real-component harness/editor Preview coverage. Live production verification was read-only: the invited QSP route returned `200` with `qspStoryGroupEnabled=true`; no valid token was opened, no assessment was submitted, no authenticated editor session was used, and no PUBLIC QSP campaign exists. |
| **Latest progress** | The [July 10 canonical closeout ledger](docs/agents/jul10-feedback-closeout.md) records 45 DONE, 3 PARTIAL, and 5 NEEDS DECISION. #84 closed after bounded Production acceptance of the separate SunHub quick quiz. The tracked [August 1–7 consolidated delta](docs/agents/jul10-progress-delta-2026-08-01-to-2026-08-07.md) remains exactly 12 eligible outcomes because #84 work began on August 8. |
| **Work Logs** | Session work logs at `~/.claude/worklogs/` — invoke `/log-session` to log or generate reports |

## Current Status

**Active items:** see `plans/JEFF_MAY6_SPRINT.md` for the open sprint ledger.

- **Coach profile-field alignment:** **LOCAL VERIFICATION COMPLETE EXCEPT FINAL POST-FIX TURBOPACK RETRY; not deployed.** The canonical `Coach.title` / `Coach.company` separation is covered across Admin and self-profile routes, BIO, Circle import, coach creation/details, new landing defaults, and new duo-workshop setup metadata. Legacy reads still fall back from blank `title` to `company`; no migration, data rewrite, saved landing-page snapshot rewrite, deployment, or Production access occurred. The native JSON full suite passed **688 suites / 8,531 tests / 16 snapshots**. The post-fix Turbopack process compiled successfully but ended with diagnostics still at type-checking and no build ID, so its outcome is inconclusive rather than recorded as passed. A retry with the canonical local environment confirmed NextAuth routes are configured, but the displayed localhost demo credentials were invalid and no authorized local test account is available; authenticated visual acceptance remains pending. Full detail: `plans/CHANGELOG.md` entry `coach-profile-fields-aligned-release-ready`.
- **Create assessment Welcome parity:** **LAUNCHED + PRODUCTION-VERIFIED.** PR #329 squash-merged as `235b18f4`; exact Production deployment `dpl_FFUVXcZ9AnUwQQpAoYkwHGZHk3kx` is Ready and owns both healthy canonical aliases. Simplified ADMIN/STAFF creation now uses the same fixed, collapsed-by-default seven-field Welcome card as draft Build, directly after Assessment name and before Advanced / Internal ID. Valid authoring fields persist with the template and v1 draft in one transaction; local errors prevent the POST and focus the first invalid field on every failed submit. Enabled create accepts exactly the seven authoring keys and rejects arbitrary nested properties before any transaction. The existing global presentation flag was already enabled and its kill switch absent, so no environment change was required. The change applies only to assessments created from launch onward and does not rewrite any existing template, invited campaign snapshot, PUBLIC campaign, response, or historical record. Full detail: `plans/CHANGELOG.md` entry `create-assessment-welcome-parity-launched`.
- **Admin-owned invited Welcome screens:** **LAUNCHED + GLOBALLY ENABLED + PRODUCTION-VERIFIED.** PR #327 squash-merged as `8433f9cf`; enabled deployment `dpl_C5mJHCDHwDgUTLidkjfbhC4SpoTx` is Ready on both canonical aliases. ADMIN/STAFF author seven safe plain-text Welcome fields in the first Build card; every future INVITED campaign freezes that default at creation, while the migration backfilled all 86 existing INVITED campaigns with their exact legacy presentation and left both PUBLIC campaigns null. Coach campaign creation/detail no longer expose Report appearance controls; stored report styles and report rendering remain intact. `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED=1` is present and the kill switch is absent. Both health aliases are healthy; unauthenticated login and expired-link shells render without console errors. Authenticated Production visual acceptance was intentionally not performed with a real account. Full detail: `plans/CHANGELOG.md` entry `admin-owned-assessment-presentation-launched`.
- **Universal individual-report appearances:** **LAUNCHED + GLOBALLY ENABLED + AUTOMATED PRODUCTION CHECKS GREEN.** PR #311 passed Build, Migration Safety Gate, Assessment Email Lease (PostgreSQL), Vercel, and Vercel Preview Comments, then squash-merged as `ab7dacca`. Enabled deployment `dpl_D7WnRzpiuY1PGMukp9LAjVqsANyV` is Ready on `platformtest.scalingup.com`; `WAVE_REPORT_STYLES_ENABLED` is present in Production, the exact-campaign canary remains harmlessly present, and `WAVE_REPORT_STYLES_KILL` is absent and available for containment. Classic, Executive Boardroom, and Modern Dashboard now apply across scored, qualitative, custom, and public individual on-screen/browser-print reports while group, aggregate, longitudinal/trend, CSV, and report-email HTML remain separate output families. The public health check reports healthy database and safe auth posture; sampled scored/qualitative/custom preview assets return `200 image/webp`; protected Admin, Coach, and preview routes redirect unauthenticated requests to sign-in. No signed-in browser session was available, so the final read-only Admin/Coach picker visual check is pending and no Production assessment, campaign, response, report, or email was created or changed. Runbook: [docs/runbooks/report-style-rollout.md](docs/runbooks/report-style-rollout.md); closeout evidence: `plans/CHANGELOG.md` entry `universal-individual-report-appearances-launched`.
- **Jeff July-10 assessment-feedback closeout:** the tracked [53-row canonical ledger](docs/agents/jul10-feedback-closeout.md) is authoritative at **45 DONE / 3 PARTIAL / 5 NEEDS DECISION**. #84's separate source-backed eight-question quiz is published, ACTIVE, and Production-accepted. Exact Section 2 wording is the acceptance boundary; generated PDFs and `tmp/` dictionaries remain derivatives.
- **Jeff July-10 #65 stable reminder links:** **LAUNCHED + GLOBALLY ENABLED + PRODUCTION-VERIFIED.** PR #282 squash-merged as `050573fa`; production deployment `dpl_HAF1FS2BpUXQxjVLXz4Tu1h3YoJB` is Ready on that exact SHA. `WAVE_J65_STABLE_LINKS_ENABLED=1`, the kill switch is off, and no canary override remains. Original and successfully delivered bulk-reminder links remain valid against one invitation lifecycle; failed sends create no usable link, and exact rejected-token tombstones fail closed. The parent hash remains the compatibility mirror, the ID-only audit outbox durably repairs fallback state without raw-token data, and partial-batch failures remain explicitly unsafe to retry as a whole. The additive migration backfilled all 103 invitations to 103 history rows with zero missing parents or duplicate hash/sequence groups. Both production aliases report healthy database/auth posture. Manual **Resend** remains parent-only and outside the stable-link guarantee; there is no UI or invitation-copy change. The shared claim is released. Full evidence: `plans/CHANGELOG.md` entry `jeff-65-stable-reminder-links-launched`.
- **GH #228 Results report email branding:** **LAUNCHED + DEFAULT-OFF + PRODUCTION-VERIFIED.** PR #288 squash-merged as `5f1d53d3`; exact deployment `dpl_R5KcAvkxxQyYTfbch16K9pWwQyLu` is Ready on every production alias, both health endpoints report healthy database and safe auth posture, and the hosted Build, Migration Safety Gate, Assessment Email Lease, and Vercel checks passed. All three Results report roles have Scaling Up-first email chrome and trusted frozen Coach-byline provenance when the dedicated global or exact-campaign canary gate is enabled; the dedicated kill restores legacy for new renders. Production contains none of the three GH #228 rollout variables, so behavior remains legacy. `ASSESSMENT_SENDS_PAUSED` stops applicable new enqueue activity, while containing queued rows requires pausing both Inngest functions `quick-assessment-lead-email` and `quick-assessment-lead-email-cron` before quarantine or rollback. No live customer email was sent. Issue #228 is closed, the [shared claim is released](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/261#issuecomment-5166913739), and the matching Notion task is Done. Full evidence: `plans/CHANGELOG.md` entry `gh-228-report-email-branding-launched`.
- **GH #220 branded campaign invitation HTML:** **LAUNCHED + DEFAULT-OFF + PRODUCTION-VERIFIED + CLOSED OUT.** Independently approved PR #292 squash-merged as `fe3deeba`; exact Ready deployment `dpl_AJ2gQhRtmuYYP6dU8bhT2a4mQfx4` is tied to that SHA and owns all four production aliases. `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` is present as the pre-existing capability gate, while new `ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED` and renderer kill `ASSESSMENT_INVITE_BRANDED` are absent, so branded-body composition remains inactive and existing `full_replace` semantics remain active. No flag value was read or changed, no live email was sent, and no audit, activation, or production-data write ran. Issue #220 is closed, the [shared claim is released](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/261#issuecomment-5168968677), and the [matching Notion task](https://app.notion.com/p/3b18c45dd829814aac48dc656a96e4a1) is Done. GH #228 report branding, GH #256 image policy, and GH #257 outbox reconciliation remain out of scope. Full detail: `plans/CHANGELOG.md` entry `gh-220-branded-invitation-html-launched-default-off`.
- **GH #257 residual assessment-email outbox reconciliation:** **LAUNCHED + DEFAULT-OFF + PRODUCTION-VERIFIED + CLOSED OUT.** Independently approved PR #296 squash-merged as `613cb0ce`; exact Ready deployment `dpl_CKS139kLjuXPJpFXdohxbc5384Bn` and successful GitHub deployment `5744293546` are tied to that SHA and own all four Production aliases. Main Build, Migration Safety Gate, and Assessment Email Lease (PostgreSQL) passed, and both public health aliases returned HTTP `200` with healthy database and safe auth posture. Invited submissions can atomically persist exact frozen delivery intents, the event fast path plus bounded scheduled scan can hand authorized bytes to the unchanged ADR-0030 outbox, and ADMIN/STAFF can review HELD drift and either release exact stored bytes or permanently cancel. Production has no `ASSESSMENT_EMAIL_DELIVERY_INTENTS_ENABLED` variable, so the new path remains inactive. Issue #257 is closed, the [shared claim is released](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/261#issuecomment-5179518345), and the [matching Notion task](https://app.notion.com/p/3af8c45dd82981ec9820d35bc4890970) is Done. No flag value was read or changed, and no production legacy audit, replay/backfill, payload reconstruction, manual database write, operator release/cancellation, or customer email send occurred. Full detail: `plans/CHANGELOG.md` entry `gh-257-outbox-reconciliation-launched-default-off`.
- **GH #233 peer-benchmark Production auditability:** **LAUNCHED + PRODUCTION-VERIFIED + CLOSED OUT.** PR #300, authored by `jcbdelo26`, received independent approval and squash-merged as `df3f2f51`; exact Ready deployment `dpl_EMoVJ6H2VFBrwTBZquXEcCCAffpd` and successful GitHub deployment `5746429992` are tied to that SHA and own all four Production aliases. Both public health endpoints returned HTTP `200` with healthy database and safe auth posture. The ADMIN/STAFF Observability surface derives effective peer-benchmark state and value-free prerequisite/key coverage without exposing raw flag inputs or benchmark values. An unauthenticated live request was redirected to sign-in with `Cache-Control: no-store`; no authenticated Production admin session was available, so benchmark-row coverage remains unknown. No environment value or flag was read or changed, and no benchmark row, template version, schema, migration, customer data, or capability state was mutated. Issue #233 is closed, the [shared claim is released](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/261#issuecomment-5181041189), and the [matching Notion task](https://app.notion.com/p/3b28c45dd8298179bc6affe41ee8e3be) is Done. Full detail: `plans/CHANGELOG.md` entry `gh-233-peer-benchmark-auditability-launched`.
- **GH #256 narrow Circle-sync Coach image validation:** **LAUNCHED + PRODUCTION-VERIFIED.** PR #287 squash-merged as `cc38dd50`; Ready deployment `dpl_4yDfLC92HEPVinAVxsVSEXQnhu7o` owns both healthy production aliases. Eligible Circle avatars now pass through the existing HTTPS-only image policy before persistence; rejected avatars preserve the stored image, continue unrelated sync work, and produce successful operator warnings plus PII-safe post-persistence telemetry. The narrow claim is released and the validation checkbox is complete. Arbitrary HTTPS hosts remain accepted; GH #256 remains open with host allowlisting, proxying, and rehosting undecided.
- **GH #217 legacy invitation fallback hardening:** **OWNER-ACCEPTED + MERGED + LIVE, dormant unless the existing kill switch is activated.** PR #280 squash-merged as `a683e55d`; receipt corrections landed through PR #284 (`2a858e07`) and final Ready deployment `dpl_HD6UVhYtVYhmmXVi8ifLJBsKj1Md` owns both healthy production aliases. The dormant `ASSESSMENT_INVITE_BRANDED=0` renderer threads Coach identity, sends a plain-text twin, and supplies an escaped bottom fallback URL. Production still leaves the flag unset, so the branded renderer remains active. Issue, claim, and Notion closeout are complete. Full detail: `plans/CHANGELOG.md` entry `gh-217-accepted-gh-257-primed`.
- **Jeff #48 QSP core-values stories:** launched from PR #251 (squash `d676aa77`) on Ready production deployment `dpl_BK3vSFFQPyo6REpXq74sFmPrX5tJ`. The approved progressive presentation is enabled by a Production-only encrypted flag and retains the winning kill switch. Live verification stopped at read-only route/RSC evidence because opening a valid invited token or submitting would write production data; no PUBLIC QSP campaign or authenticated production editor smoke was available. Full detail: `plans/CHANGELOG.md` entry `jeff-48-qsp-story-group-launched`.
- **Jeff #83 Public Quiz / Referred Results: Complete.** PR #245 launched the
  Coach-facing Referred Results surface; PR #266 (squash `ddc83e8f`) launched
  taker email identity, verified Learn More/contact actions, and the filtered
  five-column Coach CSV. PR #250 separately supplies the already-live
  duplicate-delivery protection. The existing Production-only encrypted
  Referred Results flag remains enabled with its kill switch retained; #266
  needed no undark. Historical pre-ownership candidates remain unassigned by
  decision. Full detail: `plans/CHANGELOG.md` entry
  `jeff-public-survey-closure-launched`.
- **Assessment email duplicate-delivery hotfix:** launched from PR #250 on
  production deployment `dpl_94JiUEjjpDrwpg4ng6a2oEAxef6R`. Atomic PostgreSQL
  leases prevent overlapping worker claims and same-mailbox suppression removes
  the known taker/coach duplicate path. The controlled Inngest cutover completed
  with a clean post-resume cron tick and zero in-flight or failed rows. Full detail:
  `plans/CHANGELOG.md` entry `assessment-email-lease-hotfix-implemented`.
- **GH #242 retired pinned-edition warning:** **MERGED + LIVE** from PR #273 (squash `54d0c215`) on Ready production deployment `dpl_Do162d5YEbpUjDyUTNXEo2HEQYzi`. The read-only, flagless campaign-detail warning remains preventive because the production audit found zero natural retired-pinned records. Full detail: [`gh-242-retired-edition-warning-launched`](plans/CHANGELOG.md#gh-242-retired-edition-warning-launched).

**Blocked on external or product input:**
- **Jeff July-10 closeout rows:** use the [canonical ledger](docs/agents/jul10-feedback-closeout.md) for the exact gate and owner on every unresolved row. #32 needs an approved benchmark scope/data contract; #33 needs one sanitized annotated report pair at a time; #41/#44/#45 need content intent; #47 needs an authorized standard-renderer live smoke; #57/#58 need an authorized restore, real peer values, and live report verification. #75 and #84 are closed; later enhancements do not reopen their exact July 10 asks.
- ENH-MAY6-6 — affiliate provider switch; resume when Jeff selects the provider.
- ENH-MAY6-9 — aggregator as top-level toolset; resume after product design approval.
- ENH-MAY6-11 — coach-editable transactional emails; resume after the product/security boundary is approved.
- Q-MAY6-1, Q-MAY6-2 — questions, not implementation tasks; resume only if converted into accepted requirements.
- STRIPE_WEBHOOK_SECRET rotation — resume when Josh's authenticator access is available.

**Internal engineering debt (independent of the July-10 acceptance ledger):**
- Wave O: wire a log drain + the `18o-ops-runbook.md` §7 alert queries (launch observability = human-read `vercel logs` + kill switch)
- Wave O: align the report READ-path transaction budget with the #117 commit-path fix (5s Prisma default; fine same-region, trips on high-latency clients)
- Wave O: import pages' flag check is global-only — an org-scoped `_CANARY` hides the SU-Full UI even for the canaried org (page-gate follow-on if a future org canary is wanted)
- Per-recipient pre-send DB-check idempotency (Inngest replay duplicate-send risk)
- Immediate-path `executionId` synthesis with deterministic idempotency key (`inngestRunId` + `stepId`) so SEND_SURVEY_LINK FAILED-child writes work on the immediate path too — Wave 6 covers only the future RELATIVE_TO_EVENT path
- SEND_FILE_LINK / EMAIL_ATTENDEES FAILED-child writes (need SMTP error classification: terminal vs transient) — applies to BOTH execute-workflow.ts and trigger-workflow-step.ts
- Deterministic parent.id via `inngestRunId` for forceResend audit trail
- Error redaction codes for `WorkflowStepExecution.errorMessage`
- Structured logging/alerts/runbook for parent/child workflow execution state
- PII retention/erasure policy for recipient email audit data
- Concurrency limit + load test for large-attendee workshops

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
│   │   │   ├── admin/assessments/delivery-holds/ # Held assessment-email intent review: exact frozen release or permanent cancellation
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
│   │   ├── admin/             # Admin surfaces, including AssessmentEmailDeliveryHolds
│   │   ├── ui/                # shadcn/ui + custom (status-pill, copy-url-button)
│   │   ├── auth/              # Shared auth (change-password-form)
│   │   ├── workshops/         # Workshop components (wizard, cancel-dialog)
│   │   │   └── wizard/        # 3-step wizard (Step1Details, Step2Logistics, Step3Review, WizardContext)
│   │   ├── templates/         # Landing page templates
│   │   ├── contacts/          # Contact management
│   │   ├── surveys/           # Survey components (template-editor)
│   │   ├── files/             # File management components
│   │   ├── assessments/       # Assessment UI, including QspStoryGroup and ReferredResultsList
│   │   └── affiliate/         # Partner/affiliate components
│   ├── lib/                   # Core business logic
│   │   ├── auth/              # Auth: auth.ts, authorization.ts, password-reset.ts, auth-posture.ts, access-control.ts
│   │   ├── workshops/         # Workshop logic: workshop-code.ts, workshop-coupons.ts, workshop-financials.ts, lead-time-validator.ts
│   │   ├── surveys/           # Survey logic: survey-service.ts, survey-types.ts, survey-automation.ts
│   │   ├── templates/         # Template logic: template-interpolation.ts, template-interpolation-core.ts, template-utils.ts, template-preview.ts, template-editor-utils.ts
│   │   ├── workflows/         # Workflow logic: workflow-service.ts, workflow-types.ts
│   │   ├── files/             # File logic: file-service.ts, file-access.ts, file-download-path.ts, file-rules.ts
│   │   ├── assessments/       # Scoring, referral ownership/access, frozen reports, feature flags, delivery-intent ledger/reconciliation/operator controls
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
│   ├── inngest/               # Background jobs, including event-fast-path and scheduled assessment-email intent reconciliation
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
| `/api/admin/assessment-email-delivery-intents` | GET | Paginated HELD assessment-email recovery intents with masked identity | Admin/Staff |
| `/api/admin/assessment-email-delivery-intents/[id]` | GET | Audited frozen-payload and authorization-drift review detail | Admin/Staff |
| `/api/admin/assessment-email-delivery-intents/[id]/release` | POST | Recheck and hand off the exact stored payload; editing/rerendering forbidden | Admin/Staff |
| `/api/admin/assessment-email-delivery-intents/[id]/cancel` | POST | Audited permanent cancellation and payload purge | Admin/Staff |
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
| `AssessmentEmailDeliveryIntent` | Forward-only durable recovery ledger for exact frozen invited-assessment email obligations | submissionId, recipientRole, status, authorizationSnapshot, contentProvenance, expiresAt |
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
- **A green CI Build does NOT mean the production deploy ran — always check the deployment state after a merge (2026-07-30)**: the prod deploy of `002e58fd` reported **ERROR ~200ms in, before any build step**, with *"We were unable to fetch required git information required to complete the deployment."* That is a Vercel↔GitHub integration failure, not a code failure — CI's own `Build` job had passed on the same commit. A failed deploy **silently leaves the previous commit serving**, so `main` and production can diverge with nothing red in GitHub. Verify with `GET /v6/deployments?projectId=…&teamId=…&target=production&limit=3` and confirm the newest is `READY` with the expected `meta.githubCommitSha`. To retry the same commit: `POST /v13/deployments?teamId=…&forceNew=1` with `{"project":"<prj_…>","target":"production","gitSource":{"type":"github","ref":"main","repoId":<id>}}` — the `repoId` must come from `GET /v9/projects/<prj_…>` (`.link.repoId`, currently `1148074775`); a guessed one fails with `incorrect_git_source_info`. This redeploy path worked where the earlier-documented ones were blocked.
- **Workshop status spelling**: Workshop uses "CANCELED" (American); Registration/PageStatus uses "CANCELLED" (British) — different domains, intentional
- **workshopType is optional**: Made nullable in Sprint 0 (JV-16). Always use `workshop.workshopType?.` with optional chaining.
- **Build script runs migrations**: `prisma migrate deploy` runs automatically during `npm run build` (added Feb 27). Never remove this — without it, new schema columns cause runtime crashes on Vercel because the Prisma client expects columns the DB doesn't have yet.
- **Dashboard canonical route is `/admin/dashboard`**: The `/dashboard` route redirects to `/admin/dashboard`. Do NOT create pages at `/dashboard` directly.
- **File uploads**: Filenames are sanitized (path separators, null bytes, `..` stripped) before Vercel Blob storage
- **File deletion**: Ownership verified — only the uploader or ADMIN/STAFF can delete files
- **Survey submission**: Public endpoint rate-limited at 20 req/min per IP
- **SMTP transport**: All email sending goes through `lib/smtp-transport.ts` — do NOT create new nodemailer transports elsewhere
- **Invitation copy lives on the TEMPLATE ROW, and two things bypass it (2026-07-27)**: `invitationSubject` / `invitationBodyMarkdown` are `AssessmentTemplate` fields read **live at send** — a deploy never rewrites them, so seed edits do NOT reach prod. Correct a live row with an atomic compare-and-swap script (**ADR-0025**; four exist: `scripts/patch-{lva,rockefeller,scaling-up-full,five-dysfunctions}-invitation-copy.ts`, all sharing `scripts/patch-invitation-copy-coverage.ts`). **Bypass 1 — campaign overrides:** `AssessmentCampaign.invitationBodyMarkdown` / `invitationBodyHtml` / `invitationSubject` take precedence, so a template patch never reaches those campaigns. Campaign `invitationBodyHtml` bypasses template-row copy. With `ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED=1`, it is sanitized and used as the body inside the shared branded invitation shell; with the flag off, token-bearing legacy HTML uses complete replacement and tokenless HTML safely falls back to branded markdown/template content. `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` remains the broader capability gate. GH #220 changes no stored bytes and activation requires the read-only override audit. The historical full-replacement path caused Jeff #76's QSP report (prod telemetry: 4 `renderer:"custom_html"` sends on 2026-07-10) — before treating an invite-copy complaint as a template regression, check for campaign overrides and the `EMAIL_DELIVERY` renderer telemetry. **Bypass 2 — the legacy renderer:** `ASSESSMENT_INVITE_BRANDED=0` routes to `sendLegacyInvitationEmail`, which has no `dropRedundantCta` and hardcodes `coachName: null`; dormant in prod, tracked in **GH #217**. **Also:** patching a row makes the latest version's `contentHash` stale — if that version is an unpublished DRAFT and the seed doesn't pass `forceSupersedeDraft`, the next re-seed **fails closed**. True today for `RockHabits` v3 and `leadership-vision-alignment` v4. The patch scripts' coverage receipt prints all of this on every run.
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

### 🔴 Several agent threads ship to `main` at once — claim before you build

**Claim board: pinned issue #261.** Read it, and `docs/agents/parallel-threads.md`, before scoping any tracker row — then re-check right before you write code. `main` moved six times during one session on 2026-07-30, and two planned items were shipped by another thread mid-task (Jeff #48 as pager grouping in #251/#253, and #71's production launch walk). Per-thread memory cannot prevent this: two ledgers were each internally consistent and neither could see the other.

Three rules travel with it: **never merge a PR while its review loop is running** (#249 merged 52 min before its fixes existed, forcing the corrections into a second PR, #252); **put the SoT update in the same PR as the code** (standalone SoT PRs keep colliding on this file and `plans/CHANGELOG.md` — #244 was discarded for it); and **verify the production deployment after every merge** (see the `git information` Known Quirks bullet).

### Issue tracker

Issues live as GitHub Issues on `ChiefAI-Officer/Scaling-up-platform-v2`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five state labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus category labels (`bug`, `enhancement`, `security`, `documentation`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. `CLAUDE.md` is the primary reference; `CONTEXT.md` and `docs/adr/` are created lazily by `/grill-with-docs`. See `docs/agents/domain.md`.

### Historical work lookup

For sprint/wave detail: read [plans/CHANGELOG.md](plans/CHANGELOG.md). For code-level history: `git log -p` + `git blame -C -C`. For session-level work logs: `~/.claude/worklogs/` (invoke `/log-session`).
