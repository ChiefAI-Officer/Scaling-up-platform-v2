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
| **Last Updated** | February 18, 2026 — ALL SPRINTS + QA + JV Gap Fixes + Production Readiness + UI/UX Phase 1 + Phase 2 (Animations) + Phase 2+ (Full Page Animations + Dark Mode) COMPLETE |

## Current Status

**Sprint 0** (Schema Foundation) — Complete
**Sprint 1** (Security + Auth + Critical Bug Fixes) — Complete
**Sprint 2** (Workshop Wizard & UI) — Complete (15/15 tasks)
**Sprint 3** (Dashboards + Notifications + Polish) — Complete (11/11 tasks)
**Sprint 4 Track D** (ICS Calendar Files) — Complete (3/3 tasks)
**Sprint 4 Track A** (Workflow Editor) — Complete (6/6 tasks)
**Sprint 4 Track C** (Survey System) — Complete (6/6 tasks)
**Sprint 4 Track B** (File Attachments) — Complete (4/4 tasks)
**QA Sprint** (Visual QA & Blocker Fixes) — Complete (6/6: mobile nav, follow-up form, settings save, search cleanup, error boundaries, quick actions)
**JV Gap Fixes** (Admin Create Workshop Form) — Complete (3/3: dynamic categories, pricing tier dropdown, terms checkbox)
**Production Readiness** — Complete (7/7 gaps fixed):
- Category + PricingTier seed data added to `prisma/seed.ts`
- Approvals route now wires `categoryId`/`pricingTierId` into Workshop create
- Survey submission rate limiting (20 req/min via Redis)
- File upload filename sanitization (path traversal prevention)
- File DELETE ownership check (only uploader or admin/staff can delete)
- INNGEST env vars added to `.env.example`
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

**Roadmap:** `D:\The CTO Project\plans\JEFF_VERDUN_REVISIONS_IMPLEMENTATION_ROADMAP.md`
**Task Tracker:** `D:\The CTO Project\plans\JEFF_VERDUN_REVISION_TASKS.md`

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
Generated by `src/lib/workshop-code.ts` via `generateUniqueWorkshopCode()`.

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
│   │   │   ├── layout.tsx     # Nav: Dashboard, Workshops, Coaches, Templates, Workflows, Surveys, Files, Partners
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
│   │   ├── admin/             # Admin-only pages
│   │   │   ├── approvals/     # Approval queue management
│   │   │   ├── categories/    # Category CRUD (JV-16)
│   │   │   ├── dashboard/     # Admin analytics + 6-stage pipeline (JV-01)
│   │   │   ├── financials/    # Financial dashboard (JV-21)
│   │   │   ├── pricing/       # Pricing tier CRUD (JV-17)
│   │   │   └── settings/      # Admin settings + password change
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
│   │   ├── auth.ts            # NextAuth config
│   │   ├── authorization.ts   # Role-based access (getApiActor, requireCoach, canManageCoachData)
│   │   ├── approval-engine.ts # Auto-approval logic (cert confidence >=85%)
│   │   ├── workshop-code.ts   # WS-YYYY-XXXX generator
│   │   ├── workshop-generator.ts # Automated workshop creation
│   │   ├── registration-service.ts # Registration with capacity/duplicate checks
│   │   ├── lead-time-validator.ts  # 14-day minimum lead time
│   │   ├── validations.ts     # Zod schemas
│   │   ├── utils.ts           # formatDate, formatCurrency, generateSlug, getWorkshopStatusLabel
│   │   ├── rate-limit.ts      # API rate limiting
│   │   ├── db.ts              # Prisma client singleton
│   │   └── cache.ts           # Redis/Upstash cache
│   ├── services/              # External service integrations
│   │   ├── stripe.ts          # Payments, cancellation fees, refunds
│   │   ├── hubspot.ts         # CRM sync
│   │   ├── circle.ts          # Certification verification
│   │   ├── email-sender.ts    # Azure Communication Services
│   │   └── notifications.ts   # Multi-channel notifications
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

Key functions in `lib/authorization.ts`:
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

### Completed (Sprint 0 + Sprint 1 + Sprint 2 + Sprint 3 JV tasks)

| ID | Revision | Sprint |
|----|----------|--------|
| JV-01 | Admin dashboard with 6-stage pipeline view | S3 |
| JV-02 | 6 workshop stages | S0 |
| JV-03 | Unique alphanumeric workshop code (WS-YYYY-XXXX) + displayed in all tables | S0+S3 |
| JV-04 | Workshop code visible in all views | S0+S3 |
| JV-05 | "Coaches" nav link in dashboard | S2 |
| JV-06 | "All Workshops" renamed to "Workshops" | S2 |
| JV-07 | Landing URL copyable (CopyUrlButton component) | S1 |
| JV-09 | "Landing Page Editor" renamed to "Workshop Editor" (all pages) | S2 |
| JV-10 | Workshop Editor tabbed interface (Landing/Registration/Thank You tabs) | S2 |
| JV-14 | Password change for all users + logout in dashboard | S1 |
| JV-15 | Inline approve/deny on workshops page | S2 |
| JV-16 | Dynamic Category model + dropdown in wizard (replaces hardcoded types) | S0+S2 |
| JV-17 | PricingTier model + dropdown in wizard (replaces freeform input) | S0+S2 |
| JV-19 | Format selector (Virtual/In-Person/Hybrid) in coach wizard | S2 |
| JV-20 | Workshop submission creates Workshop record (was approval-only) | S1 |
| JV-21 | Financial dashboard (revenue by workshop, by type, period filters) | S3 |
| JV-26 | Registration email notifications (admin + coach, scoped to workshop) | S3 |
| JV-27 | Terms acceptance checkbox before submission | S1 |
| JV-28 | Coach self-service cancellation with fee disclosure | S1 |
| JV-29 | Approval email enriched with Circle certification + HubSpot standing | S3 |
| JV-18 | ICS calendar files (.ics download + Google Calendar + email attachment) | S4D |
| JV-11 | Workflow editor (create/edit email sequences, assign to workshops) | S4A |
| JV-22 | Date-relative scheduling in workflow editor (X days before/after event) | S4A |
| JV-13 | Survey system (custom form builder, per-workshop, results dashboard) | S4C |
| JV-12 | File attachments (Vercel Blob upload, workflow email attachments, file manager) | S4B |

### Future Sprints

- **Sprint 4+:** JV-23 (email tracking)
- **Roadmap:** JV-08 (HTTPS), JV-24 (Circle SSO/bio), JV-25 (HubSpot sync)

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
- **No pending migrations**: All schema changes applied via `prisma db push`. Run `npx prisma db seed` after fresh DB setup to populate Categories and PricingTiers.
- **File uploads**: Filenames are sanitized (path separators, null bytes, `..` stripped) before Vercel Blob storage
- **File deletion**: Ownership verified — only the uploader or ADMIN/STAFF can delete files
- **Survey submission**: Public endpoint rate-limited at 20 req/min per IP

## Continuous Update Protocol

**After every sprint or significant change, update this file:**
1. Move completed JV revisions to the "Completed" table
2. Update "Current Status" section with sprint progress
3. Update "Last Updated" date
4. Add any new API routes, models, or components to the relevant sections
5. Document new gotchas or quirks discovered during development
