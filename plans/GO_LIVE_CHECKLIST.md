# Go-Live Checklist — Scaling Up Platform v2

> **Date:** March 3, 2026
> **Verified by:** AI CTO + Josh Delos Santos
> **Production URL:** https://scaling-up-platform-v2.vercel.app

---

## Infrastructure

- [x] Vercel deployment — **GREEN** (auto-deploys from `main` branch)
- [x] Neon PostgreSQL — Connected, schema synced via `prisma db push`
- [x] Upstash Redis — Connected (rate limiting active on survey submissions)
- [x] Vercel Blob — Connected (coach image uploads, file attachments)
- [ ] Vercel payment method — **PENDING** (trial expiring, needs Pro plan for production use)
- [ ] Custom domain — **PENDING** (configure when domain is ready)

## Auth & Security

- [x] Admin login — Works (credentials provider, JWT sessions)
- [x] Coach login — Works (self-registration + credentials)
- [x] Password reset — Works (email-based reset with nonce tokens)
- [x] Security headers — Configured in `next.config.ts` (X-Frame-Options, HSTS, CSP-adjacent)
- [x] Webhook secret enforcement — Typeform + Stripe signatures verified in production
- [x] Rate limiting — Survey submissions: 20 req/min per IP
- [x] File upload sanitization — Path traversal prevention, ownership checks on delete
- [x] S1-S8 security hardening — All 8 items deployed (commit `3a685ca`)

## Core Pipeline (Verified via Smoke Test — Mar 3)

- [x] Workshop creation — Admin creates workshop, auto-generates workshop code (WS-YYYY-XXXX)
- [x] Approval queue — Workshop submission creates approval entry, admin can approve/deny
- [x] Auto-build on approval — Inngest fires, creates 3 landing pages, assigns workflow
- [x] Landing page rendering — Variables interpolated (title, coach, date, price, format)
- [x] Workflow auto-assignment — PRE_EVENT workflow matched by phase/category/format
- [x] Registration form — All fields present (name, email, company, phone, job title, discount code, marketing opt-in)

## Integrations

- [x] Inngest — 5 functions active:
  - `auto-build-workshop` (7/7 runs completed, 0 failures)
  - `check-stale-approvals`
  - `execute-workflow`
  - `schedule-email-sequence`
  - `workshop-completion-summary`
- [x] Stripe webhook — Configured (3 events: checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed)
- [ ] Stripe webhook — Enable `checkout.session.expired` event in Stripe Dashboard webhook settings (required to clean up PENDING registrations when Stripe Checkout sessions expire without payment)
- [x] Azure Communication Services — SMTP transport configured
- [x] HubSpot — Lazy-init client with `isHubSpotConfigured()` guard
- [x] Circle.so — Read-only cert verification (sync removed)
- [x] Typeform — 5 forms configured, webhook secret set
- [ ] Stripe live keys — **PENDING** (currently using test mode keys)

## Analytics

- [x] Vercel Analytics — `@vercel/analytics` installed, `<Analytics />` in root layout
- [x] Vercel Speed Insights — `@vercel/speed-insights` installed, `<SpeedInsights />` in root layout

## Data & Content

- [x] Categories seeded — AI, Leadership, Strategy, etc.
- [x] Pricing tiers seeded — Per-category pricing options
- [x] Landing page templates — Active templates set for auto-build cloning
- [x] PRE_EVENT workflow — "Standard Pre-Event Sequence" (1 email step, 1 day before event)
- [x] Survey templates — Coach post-workshop + 30-day follow-up seeded
- [ ] Additional workflow steps — **RECOMMENDED** (add more email steps to the pre-event sequence)
- [ ] POST_EVENT workflow — **RECOMMENDED** (create post-event follow-up sequence)

## Email Notifications

- [x] Workshop requested email — To coach + admin on submission
- [x] Workshop approved email — To coach on approval
- [x] Workshop denied email — To coach with reason + resubmit link
- [x] Workshop built email — To coach after auto-build (pages + workflows)
- [x] Workshop completion summary — To admin with attendee list + revenue
- [ ] Email delivery verification — **MANUAL CHECK NEEDED** (send test email, verify inbox delivery)

## Remaining Before Full Go-Live

| # | Item | Owner | Priority |
|---|------|-------|----------|
| 1 | Add Vercel payment method (Pro plan) | Josh | **P0 — Blocker** |
| 2 | Switch Stripe to live keys | Josh + Jeff | **P0 — Before real payments** |
| 3 | Configure custom domain | Josh | P1 |
| 4 | Verify email delivery end-to-end | Josh + Suzanne | P1 |
| 5 | Add more workflow email steps | Jeff/Suzanne (content) | P2 |
| 6 | Create POST_EVENT workflow | Jeff/Suzanne (content) | P2 |

---

**Status: READY FOR CONTROLLED LAUNCH** (pending Vercel payment + Stripe live keys)
