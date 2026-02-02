# Production Go-Live Runbook

> Step-by-step guide for launching Scaling Up Platform v2 to production

---

## Pre-Launch Checklist (T-3 Days)

### Infrastructure
- [ ] Neon PostgreSQL production database created
- [ ] Redis instance provisioned (Upstash or Railway)
- [ ] Vercel Pro plan activated (for crons)
- [ ] Custom domain configured (`platform.scalingup.com`)
- [ ] SSL certificate verified

### Environment Variables
```bash
# Generate secrets
openssl rand -base64 32  # → NEXTAUTH_SECRET
openssl rand -base64 32  # → APPROVAL_LINK_SECRET

# Required in Vercel Dashboard:
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
NEXTAUTH_URL=https://platform.scalingup.com
NEXTAUTH_SECRET=<generated>
APPROVAL_LINK_SECRET=<generated>
HUBSPOT_ACCESS_TOKEN=pat-na1-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
CIRCLE_API_KEY=...
CIRCLE_COMMUNITY_ID=...
SMTP_HOST=...
SMTP_USER=...
SMTP_PASSWORD=...
FROM_EMAIL=noreply@scalingup.com
REDIS_URL=redis://...
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...
```

### API Keys
- [ ] HubSpot: Production portal access token
- [ ] Stripe: Switch to live keys (sk_live, pk_live)
- [ ] Circle.so: Production API key

---

## Go-Live Day (T-0)

### 1. Final Checks (30 min before)
```bash
# Run all tests
cd src
npm test
npm run type-check

# Verify build
npm run build
```

### 2. Deploy to Production (15 min)
```bash
# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

### 3. Database Migration (5 min)
```bash
# Apply migrations
npx prisma migrate deploy

# Seed production data (coaches, workshop types)
npx tsx prisma/seed-real-data.ts
```

### 4. Smoke Tests (10 min)
```bash
# Health check
curl https://platform.scalingup.com/api/health

# Homepage
curl -I https://platform.scalingup.com/

# Admin panel
curl -I https://platform.scalingup.com/admin/
```

### 5. Stripe Webhook Setup (5 min)
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://platform.scalingup.com/api/webhooks/stripe`
3. Select events: `checkout.session.completed`, `payment_intent.succeeded`
4. Copy signing secret → Add to Vercel as `STRIPE_WEBHOOK_SECRET`

### 6. Enable Cron Jobs
Crons are auto-enabled in vercel.json:
- `/api/cron/check-stale-approvals` - Every 6 hours
- `/api/cron/send-scheduled-emails` - Every 15 min
- `/api/cron/check-followup-reports` - Daily at 9 AM

---

## Parallel Running with Kajabi (2 Weeks)

### Week 1: Shadow Mode
- [ ] Create workshops in BOTH systems
- [ ] Compare registration counts daily
- [ ] Verify email delivery
- [ ] Test payment processing

### Week 2: Primary Switch
- [ ] New workshops → Platform v2 only
- [ ] Migrate active workshop attendees
- [ ] Redirect Kajabi pages to v2
- [ ] Monitor error rates

### Kajabi Sunset
- [ ] Export all historical data
- [ ] Archive Kajabi landing pages
- [ ] Update DNS/redirects
- [ ] Cancel Kajabi subscription

---

## Monitoring Setup

### Vercel Dashboard
1. Enable **Web Analytics** → Settings → Analytics
2. Enable **Speed Insights** → Settings → Speed Insights
3. Set up **Alerts** → Settings → Notifications

### Uptime Monitoring (UptimeRobot)
Add monitors:
- `https://platform.scalingup.com/` (Homepage)
- `https://platform.scalingup.com/api/health` (API)

### Error Tracking (Sentry)
```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

---

## Rollback Procedure

### Quick Rollback (< 5 min)
```bash
# List recent deployments
vercel ls

# Rollback to previous
vercel rollback [deployment-url]
```

### Database Rollback
```bash
# Restore to previous migration
npx prisma migrate restore <migration_name>
```

---

## Emergency Contacts

| Role | Contact | Escalation Time |
|------|---------|-----------------|
| On-Call Engineer | tech@scalingup.com | Immediate |
| Product Owner | Jeff Donaldson | 15 min |
| Stripe Issues | support@stripe.com | N/A |
| Vercel Issues | support@vercel.com | N/A |

---

## Success Criteria

| Metric | Target | Measured |
|--------|--------|----------|
| Homepage Load | < 2s | Vercel Analytics |
| API Response | < 500ms | Health endpoint |
| Uptime | > 99.9% | UptimeRobot |
| Error Rate | < 0.1% | Sentry |
| Registration Conv. | > 10% | Analytics |

---

*Last updated: February 2, 2026*
