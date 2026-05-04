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
| **Last Updated** | May 4, 2026 — Jeff Apr 30 sprint shipped (12 items: BUG-01–10, CHG-01–03) |
| **Work Logs** | Session work logs at `~/.claude/worklogs/` — invoke `/log-session` to log or generate reports |

## Current Status

**Jeff Apr 30 Sprint** — Complete (May 4 2026, all 12 items on main):
- BUG-01 (commit b139380): password-reset welcome email link no longer 404s — dropped `/auth/` prefix from `api/coaches/route.ts:142` + `api/coaches/[id]/send-password-reset/route.ts:34`
- CHG-02 (commit e00139e): `CERTIFICATION_CONFIDENCE_THRESHOLD` raised 85→101 — every workshop now hits Suzanne. Dead branch preserved as re-enable point
- BUG-03 + BUG-04 + BUG-10 (commit f5bb323): coach detail "Open ↗" button alongside copy-URL; "View Registrations" gated to PRE_EVENT/POST_EVENT/COMPLETED only; workflow editor help tooltip lists `{{surveyUrl}}` + `{{fileLinks}}`
- BUG-02 + ENH-01 + ENH-02 (commit 603b6f9): coach My Workshops "Pricing" column split into Workshop Type + Cost (with isFree-aware render rules); admin Create Workshop wizard label "Workshop Price *" → "Workshop Type *"
- BUG-05 (commit 2f2fc0f): date-format sweep on "Oct 1, 2026" (`dateStyle: "medium"`) + utility renames `formatDate→formatTimestamp`, `formatEventDate→formatEventDateUTC`, `formatDateTime→formatTimestampDateTime`. Five sites switched from zoned → UTC for event dates (workshops list, registration success, financials, admin coach detail, notifications)
- BUG-05-followup (commit 80e7df6): caught during May 4 prod verification — coach workshop detail still rendered `8/12/2026` from inline `.toLocaleDateString()` shims that pre-dated the sprint and weren't part of the original sweep's named-utility scope. Fixed 17 sites across 12 files (coach workshop detail + admin approvals/workflows + invite section + file manager + approval thread + workshop list filters + workflow editor + activate-template modal + Step2Logistics + approvals route email body). New regression guard at `src/__tests__/lint/no-inline-tolocaledatestring.test.ts` flags zero-arg / timezone-only / numeric-month patterns; CI will fail any future reintroduction
- CHG-01 (commit 0c8ae69): edit-and-resubmit flow removed entirely — `api/workshops/[id]/resubmit/route.ts` deleted; `resubmit-workshop.tsx` pruned to info_requested-only; DENIED + CANCELED workshops show "Submit a new request" CTA → `/portal/request`. INFO_RESPONSE post body fixed to include `action: "INFO_RESPONSE"` (was silently rejected by route handler)
- BUG-09 (commit db9245d): WorkflowStepExecution `scheduledFor` now preserved end-to-end. New helpers `scheduleWorkflowExecution()` + `recordWorkflowExecution()`. RELATIVE_TO_EVENT future sends now create a SCHEDULED row pre-sleep so the portal Workflow Status card shows the planned fire time. Cancel cleanup broadened from `status: "PENDING"` to `status: { in: ["PENDING", "SCHEDULED"] }`
- BUG-06–08 (commit 6941e64): every approval mutation now appends a thread message — initial coach REQUEST (Prisma nested write), admin INFO_REQUEST/COUNTER_OFFER/APPROVED/DENIED (POST + email-link GET), coach INFO_RESPONSE/COUNTER_ACCEPT/COUNTER_DECLINE/COUNTER_COUNTER (with COUNTER_COUNTER newly wrapped in `$transaction`). Helper at `lib/approvals/approval-thread.ts`. New `ApprovalMessage.synthetic` column with index for clean backfill rollback. One-time backfill at `scripts/backfill-approval-messages.ts` with mandatory `--dry-run` + dup-check on `synthetic = true` AND text shape
- CHG-03 (commit ef9fb39): iDev affiliate pixel now driven by admin-pasted `LandingPage.customCode` instead of `IDEV_SCRIPT_URL` env var. New `LandingPage.customCode` column + `Registration.@@index([stripeSessionId])`. parse5-based `validateCustomCode()` (img-only, https-only, host pinned to scalingup.idevaffiliate.com, no scripts/event handlers/style/data:/javascript:) at both save-time AND render-time. `interpolateCustomCode()` substitutes `{{saleAmount}}`, `{{orderNumber}}`, `{{email}}`, `{{currency}}` URL-encoded then HTML-escaped. Shared `<CustomCodeRenderer>` mounted at both `/workshop/[slug]?session_id=` (THANK_YOU LandingPage path) and `/registration/success` (fallback). `IdevTracking` component + `IDEV_SCRIPT_URL` env var deleted. customCode never accepted from request bodies on coach-accessible routes
- 911 tests passing (up from 861) — adds the `no-inline-tolocaledatestring` regression guard from BUG-05-followup

**Jeff Apr 28 Sprint** — Complete (commit 229faee on main, Apr 29 2026):
- `formatStepLabel()` helper strips `{{tokens}}`, falls back to STEP_TYPE_LABELS
- Workflow Status card: step names now visible (flex min-w-0 layout fix)
- Trigger Now: auto-refreshes page after fire; SENT steps re-triggerable via `forceResend=true` flag
- `SEND_SURVEY_LINK` step now fires: passes `surveyTemplateId` to `getOrCreateSurveyLink`; PRE_WORKSHOP template seeded to prod
- CSV export `GET /api/registrations/export` (RFC 4180, injection-safe, confirmed-only)
- Contacts page: h1 → "Contacts", Export All button
- 861 tests passing (up from 847)

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

**UI/UX Phase 2+ (Animations + Dark Mode)** — Complete:
- Framer Motion animations added to 15+ pages (FadeUp, StaggerContainer, StaggerItem wrappers)
- Dark mode: next-themes integration, ThemeProvider, ThemeToggle in all 3 layouts
- `.dark` CSS variable overrides in globals.css

**Dark Mode Color Migration** — Complete:
- 1,000+ hardcoded gray Tailwind classes replaced across 80 files
- Replacements: text-gray-* → text-foreground/text-muted-foreground, bg-white → bg-card, bg-gray-50 → bg-muted, border-gray-* → border-border, divide-gray-* → divide-border, hover:bg-gray-* → hover:bg-accent
- Admin approvals page rewritten from inline JSX styles to Tailwind classes
- Semantic status colors (green, red, yellow, orange, blue) intentionally preserved
- Commit: `edfc722`

**Phase F: Defensive Code Fixes** — Complete (3/3):
- HubSpot: Lazy client init via Proxy, `isHubSpotConfigured()` guard on all 8 exported functions — returns no-op when `HUBSPOT_ACCESS_TOKEN` missing
- Circle.so: `getCircleProfileByEmail()` returns `null` when `CIRCLE_API_KEY` missing (verifyCertification already handled)
- Inngest: Startup warnings when `INNGEST_EVENT_KEY` or `INNGEST_SIGNING_KEY` missing

**CIO Revision Audit Pass (Feb 20, 2026)** — Complete (P0 updates):
- Navigation clarity: `All Workshops` naming restored in admin IA
- Added direct `Bio` nav route and `Financials` nav route in admin header
- Workshop Editor scope tightened to workshop pages (removed BIO page from template picker)
- Admin Create Workshop: removed visible Workshop Type field (category-first flow)
- Paid workshops now require approved pricing tier selection (manual fallback removed)
- Free registration path now syncs to HubSpot (paid sync already handled by Stripe webhook)

**Context Bloat Cleanup (Feb 26, 2026)** — Complete:
- Deleted 6 dead code files (~800 lines): animations.ts, cache.ts, api-handler.ts, logger.ts, landing-page-auto-populate.ts, workshop-generator.ts
- Fixed toast dismiss bug in `use-toast.ts` L109 (`onsubmit` → `toastId`)
- Removed unused `bullmq` dependency (12 sub-packages)
- Consolidated 3 duplicate SMTP transports into shared `lib/smtp-transport.ts`
- Merged dual admin layouts: moved 6 pages from standalone `/admin/` into `(dashboard)/admin/`
- npm audit fix: 1 fixed, 3 low-severity cookie vulns deferred (next-auth breaking change)
- All verified: 0 type errors, 226/226 tests pass, build succeeds

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

**Test Coverage Push T1-T10 (Feb 27, 2026)** — Complete:
- 37 test suites / 415 tests total (up from 28/269)
- 9 new test files: auto-build, execute-workflow, workshop-status, surveys, auth, files, workshop-resubmit, completion-summary, typeform-webhook
- All critical paths now covered: Inngest functions, auth routes, status transitions, file upload, webhooks
- 8 Playwright E2E spec files covering 40+ automatable checks across 12 rounds
- 12 remaining manual checks require email inbox / external service access (see `plans/MANUAL_VERIFICATION_REMAINING_CHECKS.md`)
- Production launch guide: `plans/PRODUCTION_LAUNCH_GUIDE.md`

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

**Admin Capabilities (Mar 6-10, 2026)** — Complete:
- Workshop permanent delete: `POST /api/workshops/[id]/delete` (ADMIN-only, CANCELED/COMPLETED only, title confirmation)
- Coach delete fix: CASCADE on Workshop/ApprovalQueue/FollowUpReport FKs, transaction deletes Coach + User, cascade counts in audit log
- Admin invite system: `AdminInvite` model, crypto token (7-day TTL), accept-invite page, bcrypt(12) passwords
- Auth modification: `src/lib/auth/auth.ts` — non-canonical ADMIN emails checked against AdminInvite (must have acceptedAt set)
- New files: `delete-workshop-dialog.tsx`, `delete-coach-button.tsx`, `invite-admin-section.tsx`, `accept-invite/page.tsx`
- New API routes: `/api/workshops/[id]/delete`, `/api/admin/invite`, `/api/admin/invite/[id]`, `/api/auth/accept-invite`

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

**New API Routes (Figma Batch):**
- `PATCH /api/workshops/[id]` — Expanded: COACH role now allowed with `COACH_EDITABLE_FIELDS` allowlist; pricing fields intercepted → CUSTOM_PRICING approval
- `POST /api/approvals/[id]/coach-response` — Coach respond to INFO_REQUESTED (canonical; `coach-respond` deleted)
- CUSTOM_PRICING approval type fully handled in `approvals/[id]/respond/route.ts` — updates priceCents/isFree/pricingTierId, returns early (no auto-build)

**Schema Changes (Figma Batch):**
- `LandingPage.categoryId` (String?, FK→Category) — per-category template matching in auto-build
- Migration: `add_landing_page_category`

**MR-21 Coupon/Checkout Fix (Mar 11, 2026)** — Complete (commits `0556da5`, `5abcda2`):
- Stripe `allow_promotion_codes` and `discounts` are mutually exclusive — conditional spread in `services/stripe.ts:148`
- `/api/checkout` added to middleware public routes (both `authorized` callback and middleware function)
- `registration-form.tsx` — defensive content-type check before `.json()` parsing, Zod error array formatting
- TDD tests added: `stripe.test.ts` (allow_promotion_codes exclusion), `checkout.test.ts` (discount forwarding + StripeDiscountCodeError), `template-interpolation.test.ts` (10 tests)
- Test totals: 51 suites / 488 tests (up from 50/473); Figma batch brought to 52 suites / 488 tests

**MR-30 Paid Attendee Removal Verified (Mar 11, 2026):**
- Coach unregister on paid attendee → routes to approval queue (not direct delete)
- Admin email: "[ACTION REQUIRED] Cancellation Request" with "REFUND REQUIRED", attendee name, $199.50
- CANCELLATION approval in admin queue with Approve/Deny
- Refund is manual via Stripe dashboard — by design
- Verified via fake paid registration seeded in Neon SQL (no real payment)
- Known gap: approval respond route treats CANCELLATION same as WORKSHOP_REQUEST (advances status to PRE_EVENT, sends workshop-approved email) — needs CANCELLATION-specific branch

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

**New API Routes (Sprints 3-5):**
- `DELETE /api/registrations/[id]` — Direct unregister (coach-scoped, Stripe refund)
- `PATCH /api/registrations/[id]` — Toggle attendance (attended + attendedAt)
- `POST /api/workshops/[id]/resubmit` — Resubmit denied workshop for approval
- `POST /api/portal/profile/image` — Coach profile image upload (Vercel Blob, 5MB max)
- `PATCH /api/landing-pages/[id]` — Update landing page properties (isActiveTemplate toggle)

**New Pages (Sprint 3):**
- `/portal/workshops/[id]/surveys` — Coach survey results (grouped by template)

**New Components (Sprints 3 + 5):**
- `components/workshops/resubmit-workshop.tsx` — Rejection reason + edit + resubmit client component
- `components/templates/active-template-toggle.tsx` — Toggle "Set as Active Template" for auto-build

**Schema Changes (Sprint 4):**
- `Coach.linkedinUrl` (String?) — LinkedIn profile URL
- `Coach.showBookCallCta` (Boolean, default true) — Toggle CTA on bio page
- Migration: `20260227000000_feb25_coach_profile_fields`

**Schema Changes (Sprint 5):**
- `LandingPage.isActiveTemplate` (Boolean, default false) — Marks page as template for auto-build cloning
- `Workflow.categoryId` (String?, FK→Category) — Auto-assign by category
- `Workflow.workshopFormat` (String?) — "IN_PERSON" or "VIRTUAL", null = any
- `Workflow.workflowPhase` (String?) — "PRE_EVENT" or "POST_EVENT"
- Migration: `20260227100000_feb25_sprint5_auto_build_fields`

**Notification Emails (Sprints 4 + 5):**
- `sendWorkshopRequestedEmail()` — To coach + admin on workshop submit
- `sendWorkshopApprovedEmail()` — To coach when workshop approved
- `sendWorkshopDeniedEmail()` — To coach when workshop denied (includes reason + resubmit link)
- `sendWorkshopBuiltEmail()` — To coach after auto-build (pages created, workflows assigned)

**Auto-Build on Approval (Sprint 5 - Flagship):**
- `inngest/functions/auto-build-workshop.ts` — Triggered by `workshop/approved` event
- Copies active landing page templates with variable interpolation (20+ variables)
- Auto-assigns PRE_EVENT + POST_EVENT workflows by category/format match
- Advances workshop status AWAITING_APPROVAL → PRE_EVENT
- Emits `workflow/schedule` events for each assigned workflow
- Sends coach notification with build summary

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
**Sprint 7 — Aggregated Surveys & Coach Surveys:**
- `admin/surveys/aggregate/page.tsx` — Cross-workshop aggregated survey results page (template selector tabs, summary cards, per-question distribution bars, per-workshop breakdown table)
- `api/survey-templates/[id]/results/route.ts` — Added `workshopId=all` support (passes undefined for cross-workshop aggregation)
- `admin/surveys/page.tsx` — Added "Aggregated Results" link button
- `prisma/seed.ts` — Added "Coach Post-Workshop Survey" template (5 questions), "Coach 30-Day Follow-Up Survey" template (5 questions), "Post-Event Coach Survey Sequence" workflow (2 steps: 1-day + 30-day)

**Status Automation (Sprint 5):**
- Manual "Move to" buttons removed from workshop-actions (kept Cancel + POST_EVENT/COMPLETED)
- "Send Reminder Email" button removed from quick-actions (handled by workflows)

**Circle.so Cleanup (Sprint 4):**
- Removed Circle sync button from `coaches/[id]/page.tsx`
- Removed Circle import from `bio/[id]/page.tsx`
- Removed Circle populate from `workshops/[id]/landing-pages/bio-page/page.tsx`
- Removed "imported from Circle.so" text from `coach-profile-form.tsx`

**Feb 25 Roadmap:** `D:\The CTO Project\plans\FEB25_CALL_REVISIONS_IMPLEMENTATION_ROADMAP.md`
**Feb 25 Task Tracker:** `D:\The CTO Project\plans\FEB25_IMPLEMENTATION_TASKS.md` (65/65 tasks — ALL SPRINTS COMPLETE)
**Feb 25 Video Frames:** `docs/Context Building Call Transcripts/Feb 25/frames/` (24 frames, 7 sprint folders)

**Previous Plans:**
- Production Readiness: `plans/PRODUCTION_READINESS_ROADMAP.md` + `plans/PRODUCTION_READINESS_TASKS.md`
- JV Revisions (Feb 15): `plans/JEFF_VERDUN_REVISIONS_IMPLEMENTATION_ROADMAP.md` + `plans/JEFF_VERDUN_REVISION_TASKS.md`
- CIO Audit (Feb 20): `plans/CIO_WORD_FOR_WORD_REVISION_AUDIT_AND_IMPLEMENTATION_PLAN_FEB20_2026.md`
- Figma Revisions (Mar 17): `plans/FIGMA_REVISIONS_SPRINT_PLAN_MAR2026.md` (11 revisions, 4 sprints — COMPLETE)

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

### Completed (Sprint 0 + Sprint 1 + Sprint 2 + Sprint 3 JV tasks)

| ID | Revision | Sprint |
|----|----------|--------|
| JV-01 | Admin dashboard with 6-stage pipeline view | S3 |
| JV-02 | 6 workshop stages | S0 |
| JV-03 | Unique alphanumeric workshop code (WS-YYYY-XXXX) + displayed in all tables | S0+S3 |
| JV-04 | Workshop code visible in all views | S0+S3 |
| JV-05 | Coach bio editing accessible from admin navigation (`/bio`) | S2 + Feb20 audit pass |
| JV-06 | Naming clarity: admin list view uses **All Workshops** | S2 + Feb20 audit pass |
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

### Future Sprints / Remaining Roadmap Gaps

- **Sprint 4+:** JV-23 (email tracking)
- **Roadmap:** JV-08 (HTTPS env canonicalization), JV-24 (Circle SSO/auth), JV-12 hardening (protected file delivery by stage threshold)

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

## Agent skills

### Issue tracker

Issues live as GitHub Issues on `jcbdelo26/Scaling-up-platform-v2`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five state labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus category labels (`bug`, `enhancement`, `security`, `documentation`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. `CLAUDE.md` is the primary reference; `CONTEXT.md` and `docs/adr/` are created lazily by `/grill-with-docs`. See `docs/agents/domain.md`.
