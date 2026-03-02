# Production Handoff — Scaling Up Platform v2

> **Date:** March 3, 2026
> **From:** AI CTO (Development)
> **To:** Jeff Verdun (CIO), Suzanne Krygier (Operations), Josh Delos Santos (GTM Engineer)
> **Production URL:** https://scaling-up-platform-v2.vercel.app

---

## 1. Executive Summary

The Scaling Up Workshop Platform v2 is **live in production** and ready for controlled launch. The platform replaces Kajabi with a purpose-built workshop management system covering the full lifecycle: coach onboarding, workshop requests, approval workflows, automated landing page generation, attendee registration with Stripe payments, email automation, surveys, and financial reporting.

**Key metrics:**
- 142 tasks completed across 8 sprints
- 29 Jeff Verdun revisions implemented
- 65 Feb 25 call revision tasks implemented
- 8 security hardening items deployed
- 5 Inngest background functions active
- 415 unit tests + 40 E2E checks
- Production smoke test passed (5/5 tests on Mar 3)

---

## 2. What Was Accomplished

### Workshop Lifecycle (6-Stage Pipeline)

The core business process is fully automated:

```
REQUESTED → AWAITING_APPROVAL → PRE_EVENT → POST_EVENT → COMPLETED
                                    ↓
                                 CANCELED ($500 fee if <14 days)
```

- **Coach submits** via 3-step wizard → Workshop + Approval Queue created
- **Admin/Suzanne reviews** → Approve or Deny (with reason + resubmit option)
- **Auto-build fires on approval** → 3 landing pages generated, workflow assigned, status → PRE_EVENT
- **Registration** → Stripe checkout, confirmation email, HubSpot sync
- **Post-event** → Surveys, completion summary, follow-up workflows

### Coach Portal

Self-service portal for certified coaches:
- Workshop request wizard (3 steps: details, logistics, review)
- View own workshops, registrations, survey results
- Unregister attendees (with Stripe refund)
- Mark attendance
- Profile management (image upload, LinkedIn, bio, "Book a Call" CTA toggle)
- Password change
- Rejection → edit → resubmit flow

### Admin Dashboard

Full management interface:
- 6-stage pipeline overview with counts
- All Workshops list with search, filter, inline approve/deny
- Financial dashboard with coach/category/date range filters
- Approval queue with Circle.so cert + HubSpot data
- Category CRUD (dynamic, replaces hardcoded types)
- Pricing tier CRUD (per-category)
- Workflow editor (create email sequences, assign to workshops)
- Survey builder (custom forms, results analytics, cross-workshop aggregation)
- File manager (upload, filter, delete with ownership checks)
- Coach management (certifications, profiles)
- Bio page editing

### Landing Pages (Auto-Generated)

When a workshop is approved, the auto-build system:
1. Clones active landing page templates (SOLO_LANDING, REGISTRATION, THANK_YOU)
2. Interpolates 20+ variables (workshop title, coach name, date, price, format, location, etc.)
3. Populates coach profile photo from their uploaded image
4. Generates unique slugs for public access

Both `{{camelCase}}` and `{{snake_case}}` variable formats are supported.

### Email Automation

**5 notification email types:**
1. Workshop Requested — to coach + admin
2. Workshop Approved — to coach
3. Workshop Denied — to coach (with reason + resubmit link)
4. Workshop Built — to coach (pages created, workflow assigned)
5. Workshop Completion Summary — to admin (attendee list + revenue)

**Workflow engine:**
- Date-relative scheduling (X days before/after event)
- Variable interpolation in subject + body
- Custom recipient targeting
- Step execution tracking with status
- Inngest-powered reliable delivery

### Integrations

| Integration | Status | Purpose |
|-------------|--------|---------|
| **Inngest** | Active (5 functions) | Background jobs: auto-build, workflows, completion summaries, stale approval checks |
| **Stripe** | Configured (test mode) | Registration payments, cancellation refunds |
| **HubSpot** | Connected (lazy-init) | CRM sync for free + paid registrations |
| **Circle.so** | Read-only | Certification verification for approval enrichment |
| **Typeform** | 5 forms configured | Survey collection via webhooks |
| **Azure Comm Services** | SMTP configured | All transactional email sending |
| **Upstash Redis** | Connected | API rate limiting (survey submissions) |
| **Vercel Blob** | Connected | Coach image uploads, file attachments |
| **Vercel Analytics** | Installed | Page views + Web Vitals tracking |

### UI/UX Design System

- **Font:** Plus Jakarta Sans (professional, SaaS-friendly)
- **Primary color:** #1D4ED8 (Blue 700 — trust/authority)
- **Dark mode:** Full support with `next-themes` + CSS variable overrides
- **Animations:** Framer Motion with `prefers-reduced-motion` respect
- **16 upgraded/new components:** Button, Card, Input, Badge, Table, StatusPill, ConfirmationModal, Skeleton, Tooltip, Popover, Progress, Avatar, Separator, Alert, EmptyState, PageHeader
- **Semantic tokens:** Status colors, sidebar tokens, shadow depth scale

### Security (S1-S8)

| # | Hardening | Details |
|---|-----------|---------|
| S1 | Password reset nonces | Prevents token reuse |
| S2 | Webhook secret enforcement | Typeform + Stripe signatures verified |
| S3 | Survey template validation | Question-to-template ownership check |
| S4 | JSON parse safety | Try-catch on all API body parsing |
| S5 | Error handlers | Consistent error responses on 3 critical routes |
| S6 | External API timeouts | 15-second AbortController on Stripe, Circle, HubSpot |
| S7 | Auto-build idempotency | Prevents duplicate builds on Inngest retry |
| S8 | Email deduplication | Set-based dedup in workflow execution |

---

## 3. Production Configuration (Completed Mar 3)

| Step | Status |
|------|--------|
| Environment variables pushed (35 vars) | Done |
| Stripe webhook configured (3 events) | Done |
| Inngest verified (5 functions active) | Done |
| PRE_EVENT workflow created | Done |
| Snake_case variable aliases deployed | Done |
| Vercel Analytics installed | Done |
| Production smoke test passed (5/5) | Done |

---

## 4. Suggested Validation Checklist for Scaling Up Team

Jeff and Suzanne should walk through these scenarios to validate the platform:

### Scenario A: Full Workshop Lifecycle
1. **Log in as admin** at `https://scaling-up-platform-v2.vercel.app/login`
2. **Create a workshop:**
   - Go to Workshops → New
   - Select a coach, category (AI), format (Virtual), future event date
   - Submit
3. **Approve the workshop:**
   - Go to Approvals → find the workshop → click Approve
   - Expected: Status changes to PRE_EVENT, auto-build fires
4. **Verify auto-build:**
   - Go to the workshop detail page → Landing Pages tab
   - Should show 3 pages with populated content
   - Click a landing page link — variables should be filled in
5. **Verify workflow:**
   - Go to Workflows → "Standard Pre-Event Sequence"
   - Check Assigned Workshops — should show the new workshop
6. **Test registration:**
   - Visit the landing page URL
   - Fill in registration form
   - Use Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC
   - Should redirect to thank-you page

### Scenario B: Coach Portal
1. **Log in as a coach** (or create one via Admin → Coaches)
2. **Submit a workshop request** via Portal → Request Workshop
3. **Check profile** — upload photo, add LinkedIn URL
4. **View workshops** — see submitted workshop with status

### Scenario C: Admin Operations
1. **Check financial dashboard** — Financials page should show revenue data
2. **Check surveys** — Survey Templates, Aggregated Results
3. **Deny a workshop** — verify coach receives denial email with reason
4. **Test category/pricing management** — Categories and Pricing pages

### Scenario D: Email Verification
1. After approving a workshop, check if the coach email arrives
2. After a registration, check if admin + coach notification emails arrive
3. If no emails: verify Azure Communication Services connection string in Vercel env vars

---

## 5. Remaining Items Before Full Go-Live

### P0 — Blockers

| # | Item | Owner | Notes |
|---|------|-------|-------|
| 1 | **Add Vercel payment method** | Josh | Trial expiring — needs Pro plan |
| 2 | **Switch Stripe to live keys** | Josh + Jeff | Replace test keys with production keys in Vercel env vars, update webhook endpoint |

### P1 — Should Do Before Launch

| # | Item | Owner | Notes |
|---|------|-------|-------|
| 3 | Configure custom domain | Josh | Point domain to Vercel, update NEXTAUTH_URL + APP_URL |
| 4 | Verify email delivery | Josh + Suzanne | Send test emails, check inbox delivery + spam folder |
| 5 | Create real coach accounts | Suzanne | Onboard 2-3 coaches for initial launch |

### P2 — Recommended

| # | Item | Owner | Notes |
|---|------|-------|-------|
| 6 | Add more workflow email steps | Jeff/Suzanne | Expand pre-event sequence (2-week reminder, 1-week, day-of) |
| 7 | Create POST_EVENT workflow | Jeff/Suzanne | Post-event thank you, survey request, 30-day follow-up |
| 8 | Review landing page template content | Jeff | Customize default template text, images |

---

## 6. Future Roadmap (Phase 2/3)

| Feature | Phase | Description |
|---------|-------|-------------|
| Email open/click tracking (JV-23) | 2 | Track engagement on workflow emails |
| HubSpot nurture campaigns | 2 | Automated lead nurturing sequences |
| Currency conversion (non-USD) | 2 | International pricing support |
| Coach payment automation | 2 | Automate coach fee payouts |
| Circle.so SSO (JV-24) | 3 | Single sign-on with Circle community |
| Advanced attendance analytics | 3 | Cross-workshop attendance patterns |
| Coach conversion tracking | 3 | HubSpot deal pipeline integration |

---

## 7. Key Access & Contacts

| System | URL | Who Has Access |
|--------|-----|----------------|
| **Vercel** | vercel.com | Josh (owner) |
| **Neon (PostgreSQL)** | neon.tech | Josh |
| **Inngest** | app.inngest.com | Josh (ChiefAIOfficer org) |
| **Stripe** | dashboard.stripe.com | Josh + Jeff |
| **HubSpot** | app.hubspot.com | Jeff + team |
| **Circle.so** | circle.so | Jeff + team |
| **Typeform** | admin.typeform.com | Josh |
| **Upstash (Redis)** | console.upstash.com | Josh |
| **GitHub** | github.com/jcbdelo26/Scaling-up-platform-v2 | Josh |
| **Azure Comm Services** | portal.azure.com | Josh |

### Important Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` (project root) | AI CTO system instructions |
| `Scaling Up Platform v2/CLAUDE.md` | Codebase single source of truth |
| `plans/GO_LIVE_CHECKLIST.md` | Pre-launch verification checklist |
| `plans/PRODUCTION_LAUNCH_GUIDE.md` | 10-step configuration guide |
| `.env` (local only, gitignored) | All secrets — backup securely |

---

**The platform is production-ready. The two blockers (Vercel payment + Stripe live keys) are configuration tasks, not code issues. Once those are resolved, the Scaling Up team can begin onboarding coaches and running real workshops.**
