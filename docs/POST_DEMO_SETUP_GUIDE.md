# 🚀 Post-Demo Setup Guide: Scaling Up Platform v2
**For Non-Technical CIOs** | Time Required: ~45 minutes

---

## ✅ Current Status

| Item | Status |
|------|--------|
| Vercel Deployment | ✅ Live |
| Database (Neon) | ✅ Connected |
| Demo Login | ✅ Working |
| Mailgun (Email) | ⏳ Pending Setup |
| Stripe (Payments) | ⏳ Pending Setup |
| HubSpot (CRM) | ⏳ Pending Setup |

---

## 📧 Step 1: Configure Mailgun (Email Notifications)

Mailgun sends registration confirmations, event reminders, and survey requests.

### 1.1 Get Your Mailgun Credentials

1. **Go to** [mailgun.com](https://www.mailgun.com) and log in.
2. **Navigate to** Sending → Domains (left sidebar).
3. **Select your domain** (e.g., `mg.yourdomain.com`).
4. **Click** "SMTP credentials" tab.
5. **Copy these values:**
   - **SMTP Hostname**: `smtp.mailgun.org`
   - **Port**: `587`
   - **Username**: Usually `postmaster@mg.yourdomain.com`
   - **Password**: Click "Reset Password" to generate one → Copy it

### 1.2 Add to Vercel

Go to **Vercel → Settings → Environment Variables** and add:

| Key | Value |
|-----|-------|
| `SMTP_HOST` | `smtp.mailgun.org` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `postmaster@mg.yourdomain.com` |
| `SMTP_PASSWORD` | (paste your password) |
| `FROM_EMAIL` | `noreply@yourdomain.com` |

> [!IMPORTANT]
> After adding all variables, click **Deployments → ⋮ → Redeploy** to apply changes.

---

## 💳 Step 2: Configure Stripe (Payments)

Stripe processes workshop payments and issues refunds.

### 2.1 Get Your Stripe Keys

1. **Go to** [dashboard.stripe.com](https://dashboard.stripe.com).
2. **Click** Developers → API keys (top right corner).
3. **Copy:**
   - **Publishable key**: Starts with `pk_live_` or `pk_test_`
   - **Secret key**: Click "Reveal" → Starts with `sk_live_` or `sk_test_`

### 2.2 Create a Webhook

1. **Go to** Developers → Webhooks.
2. **Click** "Add endpoint".
3. **Endpoint URL**: `https://scaling-up-platform-v2.vercel.app/api/webhooks/stripe`
4. **Select events:**
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.updated`
5. **Click** "Add endpoint".
6. **Copy the Signing secret** (starts with `whsec_`).

### 2.3 Add to Vercel

| Key | Value |
|-----|-------|
| `STRIPE_SECRET_KEY` | `sk_live_...` (or `sk_test_...` for testing) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` (or `pk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |

> [!TIP]
> Use **Test Mode** keys first (`sk_test_...`) to verify everything works before going live.

---

## 🔗 Step 3: Configure HubSpot (CRM Integration)

HubSpot syncs coach and registration data with your CRM.

### 3.1 Create a Private App

1. **Go to** [app.hubspot.com](https://app.hubspot.com).
2. **Navigate to** Settings (⚙️) → Integrations → Private Apps.
3. **Click** "Create a private app".
4. **Name it**: `Scaling Up Platform`
5. **Go to** Scopes tab and enable:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.objects.deals.read`
   - `crm.objects.deals.write`
6. **Click** "Create app".
7. **Copy the Access Token** (starts with `pat-na1-...`).

### 3.2 Add to Vercel

| Key | Value |
|-----|-------|
| `HUBSPOT_ACCESS_TOKEN` | `pat-na1-...` |

---

## 🔐 Step 4: Security Hardening

### Immediate Actions

1. **Remove DEMO_MODE** (when ready for production):
   - Go to Vercel → Environment Variables
   - Delete `DEMO_MODE` or set it to `false`
   - This will require real password authentication

2. **Add Production Secrets**:
   | Key | How to Generate |
   |-----|-----------------|
   | `APPROVAL_LINK_SECRET` | Run `openssl rand -base64 32` in terminal |

3. **Enable Two-Factor Authentication** on:
   - Your Vercel account
   - Your Neon database account
   - Your Stripe account
   - Your Mailgun account

---

## 🛡️ Platform Improvement Roadmap

### Phase 1: Stability (Week 1-2)

| Task | Priority | Effort |
|------|----------|--------|
| Add password hashing (bcrypt) | 🔴 Critical | Medium |
| Set up error monitoring (Sentry) | 🔴 Critical | Low |
| Configure backup for Neon DB | 🟡 High | Low |
| Add rate limiting on login | 🟡 High | Medium |

### Phase 2: Features (Week 3-4)

| Task | Priority | Effort |
|------|----------|--------|
| Coach self-service portal | 🟡 High | High |
| Automated reminder emails | 🟡 High | Medium |
| Payment reports dashboard | 🟢 Medium | Medium |
| Multi-language support | 🟢 Medium | High |

### Phase 3: Scale (Month 2+)

| Task | Priority | Effort |
|------|----------|--------|
| CDN for static assets | 🟢 Medium | Low |
| Database read replicas | 🟢 Medium | Medium |
| Audit logging dashboard | 🟢 Medium | Medium |
| Mobile app (PWA) | 🔵 Low | High |

---

## 🎨 About MCP Tools for This Project

### Stitch MCP (UI Design)

> **Can it enhance the visual UI/UX?**

**Yes, partially.** Stitch MCP generates UI mockups and design concepts from text prompts. Here's how it fits:

| Use Case | Stitch MCP Capability |
|----------|----------------------|
| Generate new screen mockups | ✅ Excellent |
| Create branding concepts | ✅ Excellent |
| Iterate on design ideas | ✅ Excellent |
| Directly edit React code | ❌ No (requires manual implementation) |

**Workflow:**
1. Use Stitch to generate design mockups
2. Review and approve the designs
3. I implement the approved designs in Next.js/React code

### Dart/Flutter MCP

> **Can it verify code functionality?**

**No, not for this project.** The Dart/Flutter MCP is specifically for Flutter mobile apps written in Dart. The Scaling Up Platform is a **Next.js web app** written in TypeScript/React.

**For code verification, we use:**

| Tool | Purpose | Already Set Up? |
|------|---------|-----------------|
| Jest | Unit tests | ✅ Yes |
| Playwright | E2E browser tests | ✅ Yes |
| TypeScript | Type checking | ✅ Yes |
| ESLint | Code quality | ✅ Yes |

I can run these tests anytime to verify functionality.

---

## 📋 Final Checklist

After completing all steps, verify:

- [ ] Can send a test email (check Mailgun logs)
- [ ] Can process a test payment (use Stripe test mode)
- [ ] HubSpot contacts sync correctly
- [ ] DEMO_MODE is removed for production
- [ ] All secrets are stored only in Vercel (not in code)

---

## 🆘 Need Help?

If you encounter issues during setup:

1. **Email not sending?** → Check Mailgun domain verification status
2. **Payment failing?** → Verify webhook URL is exactly correct
3. **HubSpot not syncing?** → Check API scopes include read/write for contacts

**For any configuration questions, I'm here to help!**
