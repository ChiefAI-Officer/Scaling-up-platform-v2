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
| **Repository** | `github.com/jcbdelo26/Scaling-up-platform-v2` (deploys from `main`) |
| **Live URL** | `scaling-up-platform-v2.vercel.app` |
| **Client** | Jeff Verdun, CIO - Scaling Up |
| **Operations** | Suzanne (handles manual approvals) |
| **Last Updated** | <!-- LAST_UPDATED_ISO:2026-05-19 LAST_UPDATED_SLUG:assessment-v7-6-observability-dashboard-v1 --> May 19, 2026 — Assessment Tool v7.6 — Observability dashboard v1 shipped (Issue #10). Honest v1 of spec 06: DB-derived counters on `/admin/observability` (admin-only) — coaches by cert status, orgs total + with-campaigns, templates + published/draft version counts, campaigns by status + accessMode, submissions total + 24h + 7d + public/invited splits, audit log 24h count + per-action breakdown. `GET /api/admin/observability` route + `ObservabilityDashboard.tsx` client with refresh button + stat-card grids. Nav entry added. 3 new tests. Commit `6b35556`. v1.5 deferred: 7 Vercel/Inngest counters + 6 SMTP-paged alert gates from the spec (deploy/infra work, outside codebase scope). Earlier today: Assessment Tool v7.6 — Public quiz mode shipped (Decision #4 MVP, Issue #10). Anonymous self-assessment flow for PUBLIC-mode campaigns. New `/quiz/[campaignAlias]` landing (server-rendered, indexable), client funnel (intro → info → questions → submit), `/quiz/[campaignAlias]/thank-you` confirmation. `POST /api/quiz/[campaignAlias]/submit` — Zod body `{ publicTaker: {firstName, lastName, email}, answers }`, 404 CAMPAIGN_NOT_FOUND, 403 NOT_PUBLIC, 410 NOT_OPEN (DRAFT/CLOSED/window), creates submission with `respondentId=null` + `publicTaker` JSON. Middleware: `/quiz/*` + `/api/quiz/*` added to public-bypass. 6 new tests. Commit `a8ac8b5`. Deferred: admin UI to toggle accessMode, cookie dedup, public results page via resultsToken. Earlier today: Assessment Tool v7.6 — Template content form builder + multi-version forks shipped (Issue #10). Replaces yesterday's paste-JSON MVP with a real authoring flow + adds the ability to evolve published templates. **Form builder** (`72a3b6e`): structured editors for sections (name + description + partLabel + reorder), questions (label + helpText + section selector + required + 5-field scale), and scoring (tierMetric + passThreshold + tiers with unbounded-max support). `stableKey` auto-generated from order (S1, S1_Q1 …). Submit-time validation gates the network call. **Multi-version** (`9d101e0`): `POST /api/admin/assessment-templates/[id]/versions/[versionId]/duplicate` copies content into a fresh draft with bumped versionNumber. `GET` + `PATCH` on the version (PATCH 409 ALREADY_PUBLISHED on published rows + contentHash recompute). New `/admin/assessment-templates/[id]/versions/[versionId]/edit` page hosts `AssessmentVersionEditor.tsx` (read-only banner when published). Template detail rows gain Edit + Duplicate + Publish buttons. 6 new tests; full assessment-template admin surface now 20 tests covered. Earlier today: Assessment Tool v7.6 Admin template editor MVP shipped (Issue #10). **Largest remaining gap closed**: admins can now create + edit + publish assessment templates from the in-app UI instead of asking a dev to write seed scripts. New routes: `POST /api/admin/assessment-templates` (atomic create with `contentHash`), `PATCH /[id]` (metadata only — alias immutable, content version-locked), `DELETE /[id]` (soft-delete with 409 TEMPLATE_HAS_ACTIVE_CAMPAIGNS guard), `POST /[id]/versions/[versionId]/publish` (409 ALREADY_PUBLISHED). Shared `template-content-hash.ts` helper extracted from the seed script so admin-UI writes + seed script produce byte-identical hashes. UI: list / new (paste-JSON content) / detail-with-inline-edit + versions table. Nav entry added. Prisma `JsonNull` used for nullable `reportConfig`. 14 new tests (auth, validation, alias 409, transaction shape, 404/409 paths, soft-delete, publish flow). Commit `b9fe0ab`. Form builder for questions/scoring + multi-language version forks deferred. Earlier today: Assessment Tool v7.6 Admin aggregate dashboard filters shipped (Issue #10). **Decision #8 MVP follow-on**: `getAggregateReport` now accepts an optional 4th-arg `{ startDate?, endDate?, organizationId? }`. `GET /api/admin/assessments/aggregate` parses + forwards `startDate` / `endDate` / `organizationId` query params (date strings 400 if invalid). Both CSV export routes honor the same filter set. UI: 3-column filter row (From date / To date / Organization select) under the template+version selectors, Clear-filters link when set, report re-fetches on any filter change, ExportLink forwards params into download URLs. 3 new service-layer tests on WHERE-shape behavior (9/9 service + 21/21 across the 4 aggregate suites green). Commit `bf099c0`. Earlier today: Assessment Tool v7.6 CEO designation post-creation shipped (Issue #10). **Per-row CEO toggle**: `POST /api/assessment-campaigns/[id]/ceo` (body `{ participantId: string | null }`, `canManageCampaign` write gate, 409 `CAMPAIGN_CLOSED`, 404 cross-campaign, transaction clears prior then sets new — honors the partial unique index on `(campaignId WHERE isCEO=true)`). `CampaignDetail.tsx`: per-row "Mark as CEO" link next to the name (hidden when CLOSED); current CEO row shows the existing badge + small "(clear)" link. 7 new tests. Commit `af047f8`. Earlier today: **P0 ops fix**: registration-confirmation email finally uses the admin-panel template. Jeff reported his custom template at `/admin/transactional-emails/REGISTRATION_CONFIRMATION` wasn't sending — recipients got hardcoded HTML. Root cause: `composeRegistrationConfirmationEmail` has a Round-3-H1 kill switch (`TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED === "true"`) that was never flipped on in Vercel production, so every send fell through to `hardcodedDefaults()`. Set the env var to `true` in production and redeployed (deploy `pyghzkw2z` Ready). DB row for `REGISTRATION_CONFIRMATION` is present (subject `You're Registered: {{workshopTitle}}`, 1523-char body using `{{workshopTitle}}` + `{{registrantName}}`). No code change. ICS attachment continues automatically (built in the registration handler, not the template). For virtual workshops, the `{{virtualLink}}` token is already supported by the interpolator — Jeff just needs to add it to his template body. Earlier today: Assessment Tool v7.6 Task O UI follow-on shipped end-to-end (Issue #10). **Wizard email customization panel** (`cddcaa7`): `CampaignWizard.tsx` `ReviewStep` gains a collapsible "Customize invitation email" panel — subject input (200-char) + body textarea (5000-char) + 5-token reference hint. Wizard state gains `invitationSubject` + `invitationBodyMarkdown`; resume-from-draft merge handles both. **CampaignDetail post-create edit panel** (`815d3d2`): same shape as wizard panel, mounted above the respondents table, hidden when CLOSED. Dirty-aware Save / Cancel-reverts. Hits `PATCH /api/assessment-campaigns/[id]`; empty values send `null` so the campaign falls back to the template default. Both surfaces empty → backend null → template default fallback (Task O backend logic). 18/18 campaign-detail + 17/17 reminders suites green. Earlier today: **P0 fix**: paid-registration confirmation email never arrived because `processPaymentCompleted` ran `step.run("hubspot-sync")` before the email step and HubSpot rejected `workshop_name` / `workshop_date` with `PROPERTY_DOESNT_EXIST` → 4× retry → dead-letter. Wrapped the HubSpot step so it swallows + logs (best-effort CRM sync must not block transactional email). Regression test added. Recovered the 2 stuck registrations in prod by manually running the notification helper. Earlier today: Assessment Tool v7.6 Task O shipped (Issue #10). **Per-campaign invitation email overrides**: `AssessmentCampaign` gains `invitationSubject String?` + `invitationBodyMarkdown String?` (migration `20260518160000_add_campaign_invitation_overrides`). Both create and PATCH schemas accept the new fields. Invite + reminder routes use the campaign override when set, otherwise fall back to the template default (`campaign.invitationSubject ?? campaign.template.invitationSubject`). 2 new tests cover precedence + fallback (13/13 reminders suite green). Wizard UI for editing the overrides is deferred — backend ships now so coaches can edit via PATCH or a future detail-page form. Earlier today: Coach cert auto-promote shipped. `POST /api/coaches/[id]/certifications` now flips `Coach.certificationStatus` from `PENDING` → `ACTIVE` atomically when an admin grants a first workshop-type cert (canonical constants, `db.$transaction([create, updateMany])`, race-guard via `updateMany` predicate on `certificationStatus: PENDING`, `Prisma.P2002 → 409` in the catch, `logAudit('Coach', 'UPDATE')` with `certificationAdded` + conditional status-delta on `count === 1`). DEACTIVATED is intentionally NOT promoted (explicit reactivation only). Closes the gap where signup/admin-create both hardcoded PENDING with no in-app write path — previously the only ACTIVE coaches were seeded directly into the DB. 8 tests (`coaches-certifications-auto-promote.test.ts`: PENDING atomicity with sentinel `$transaction` args, race-guard no-op, transaction-reject 500, ACTIVE skip, DEACTIVATED no-promote, preflight 409, in-catch P2002 → 409, 404 missing coach). Two commits: `94f067f` (feature) + `152efee` (Codex hardening for race / P2002 / audit / test sentinels). 1740/1741 full suite green (1 known timing flake). Earlier today: Assessment Tool v7.6 Tasks M + N shipped (Issue #10). **Task M — Bulk respondent CSV import**: pure `parseRespondentCsv` helper (header validation, Zod email validation, `/`-delimited team path, dedupe-on-email, 500-row cap). `POST /api/organizations/[id]/respondents/bulk` (skip/merge modes; returns id arrays so caller can chain participant-add). Campaign-create route accepts optional `bulkRespondents` payload (server-side dedupe + team auto-create). UI: new "Bulk CSV" tab inside the Task L Add Respondent modal (paste-area + live preview + per-row error highlight + conflict-mode radio + progress indicator) AND inline bulk-import panel in the wizard respondents step (parsed rows stored in wizard state for batch creation at submit-time). 36 new tests across 2 suites. Two Vercel-only TypeScript hotfixes (`fb42efc`+`0c84b24`) for the same `as-cast-inside-await` implicit-any pattern in both `assessment-campaigns/route.ts` and `respondents/bulk/route.ts` — local turbopack didn't flag, only Vercel's TS strict pass did. **Task N — Reminder emails**: `POST /api/assessment-campaigns/[id]/reminders` (bulk by default, single-participant when `participantIds` supplied). Reuses existing PENDING invitation rows; rotates the cryptographic token but preserves the row id (mirrors `/resend` security model). Skips submitted/no-invite/revoked/soft-deleted with audit logging; per-participant SMTP failures continue the batch. `canManageCampaign` gate, 409 `CAMPAIGN_NOT_ACTIVE` on DRAFT/CLOSED. CampaignDetail header "Send Reminders" button (ACTIVE-only) with confirm dialog + result toast. 11 new tests. Prior Tasks I/J/K/L unchanged. **Post-creation participant management**: coaches can add or remove respondents from a campaign after creation. `POST /api/assessment-campaigns/[id]/respondents` (canManageCampaign gate, 409 ALREADY_PARTICIPANT, 422 WRONG_ORGANIZATION, 409 CAMPAIGN_CLOSED, conditional invitation row only when campaign is ACTIVE — DRAFT skips invitation creation, teamPath snapshot via `buildTeamPath`). `DELETE /api/assessment-campaigns/[id]/participants/[participantId]` (404 on auth/missing, 409 if any submission exists, transaction deletes invitation rows then participant — schema has no cascade rules so deletes are explicit). `CampaignDetail.tsx` UI: Add Respondent modal (existing-respondent select + inline "Create new respondent" form), per-row Trash button hidden when submitted/CLOSED, confirmation dialog, re-fetch + `router.refresh()` on mutation. 19 new tests (1691/1691 green across 202 suites). Earlier today: Task K — Campaign wizard auto-save drafts (`CampaignWizardDraft` model mirroring WorkshopDraft, GET/PUT/DELETE `/api/assessment-campaign-drafts`, resume banner + debounced 800ms auto-save in `CampaignWizard.tsx`, migration `20260518130000_add_campaign_wizard_draft`). Tasks I+J still in effect: campaign close transitions + CSV exports. **Task I — Campaign status transitions**: `POST /api/assessment-campaigns/[id]/close` (DRAFT\|ACTIVE → CLOSED with optional reason, canManageCampaign gate, 409 on already-closed); Close button on `/portal/assessments/[id]` (label adapts: "Discard Draft" / "Close Campaign" / hidden when CLOSED) with confirmation dialog + reason textarea; status filter pills on `/portal/assessments` landing (All / Draft / Active / Closed with per-status counts). **Task J — CSV exports**: 4 new audit-logged + rate-limited routes (campaign respondents, per-respondent result, admin aggregate summary, admin per-submission CSV with dynamic `Section_S{n}_Total` columns); native `<a download>` UI buttons on the campaign detail page (header export + per-row download) and admin aggregate dashboard (2 buttons under selectors). AuditAction extended with `'CLOSE'` + `'EXPORT'`. 1657 tests (+35 across 7 suites). Three Vercel-only hotfixes in the same window for staging-miss bugs (missing untracked component files + a missing modified-file union member); memory updated — default to `git add -A` + visual `git diff --cached --stat` review; pre-push gate stays `CI=true npx next build --turbopack`. Prior Tasks A–H unchanged. |
| **Work Logs** | Session work logs at `~/.claude/worklogs/` — invoke `/log-session` to log or generate reports |

## Current Status

**Active items:** see `plans/JEFF_MAY6_SPRINT.md` for the open sprint ledger.

**Open follow-ons (deferred for Beta hardening or external input):**
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
│   │   │   ├── w/[slug]/      # Short URL redirect
│   │   │   └── registration/success/ # Post-registration confirmation
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
│   │   └── affiliate/         # Partner/affiliate components
│   ├── lib/                   # Core business logic
│   │   ├── auth/              # Auth: auth.ts, authorization.ts, password-reset.ts, auth-posture.ts, access-control.ts
│   │   ├── workshops/         # Workshop logic: workshop-code.ts, workshop-coupons.ts, workshop-financials.ts, lead-time-validator.ts
│   │   ├── surveys/           # Survey logic: survey-service.ts, survey-types.ts, survey-automation.ts
│   │   ├── templates/         # Template logic: template-interpolation.ts, template-interpolation-core.ts, template-utils.ts, template-preview.ts, template-editor-utils.ts
│   │   ├── workflows/         # Workflow logic: workflow-service.ts, workflow-types.ts
│   │   ├── files/             # File logic: file-service.ts, file-access.ts, file-download-path.ts, file-rules.ts
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
- **Vercel env vars** need a redeploy to take effect
- **Workshop status spelling**: Workshop uses "CANCELED" (American); Registration/PageStatus uses "CANCELLED" (British) — different domains, intentional
- **workshopType is optional**: Made nullable in Sprint 0 (JV-16). Always use `workshop.workshopType?.` with optional chaining.
- **Build script runs migrations**: `prisma migrate deploy` runs automatically during `npm run build` (added Feb 27). Never remove this — without it, new schema columns cause runtime crashes on Vercel because the Prisma client expects columns the DB doesn't have yet.
- **Dashboard canonical route is `/admin/dashboard`**: The `/dashboard` route redirects to `/admin/dashboard`. Do NOT create pages at `/dashboard` directly.
- **File uploads**: Filenames are sanitized (path separators, null bytes, `..` stripped) before Vercel Blob storage
- **File deletion**: Ownership verified — only the uploader or ADMIN/STAFF can delete files
- **Survey submission**: Public endpoint rate-limited at 20 req/min per IP
- **SMTP transport**: All email sending goes through `lib/smtp-transport.ts` — do NOT create new nodemailer transports elsewhere
- **Admin layout unified**: All admin pages are under `(dashboard)/admin/` — the standalone `/admin/` layout was removed in Feb 26 cleanup
- **Nav bar has 13 items**: Dashboard, All Workshops, Bio, Templates, Workflows, Surveys, Files, Partners, Coaches, Approvals, Categories, Pricing, Financials. Uses `overflow-x-auto` for horizontal scroll on tight screens. Desktop nav shows at `lg` (1024px+); mobile hamburger shows below `lg`. Email shows at `xl` (1280px+) only.
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

Issues live as GitHub Issues on `jcbdelo26/Scaling-up-platform-v2`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five state labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus category labels (`bug`, `enhancement`, `security`, `documentation`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. `CLAUDE.md` is the primary reference; `CONTEXT.md` and `docs/adr/` are created lazily by `/grill-with-docs`. See `docs/agents/domain.md`.

### Historical work lookup

For sprint/wave detail: read [plans/CHANGELOG.md](plans/CHANGELOG.md). For code-level history: `git log -p` + `git blame -C -C`. For session-level work logs: `~/.claude/worklogs/` (invoke `/log-session`).
