# Vercel & Stripe Setup Guide
## For Non-Technical GTM Engineers

> ⏱️ **Estimated Time**: 20-30 minutes  
> 📋 **What You'll Need**: Browser access to Vercel and Stripe dashboards

---

## Part 1: Vercel Environment Variables

### Step 1: Access Vercel Dashboard

1. Open your browser and go to: **https://vercel.com/login**
2. Sign in with your account (GitHub, GitLab, or email)
3. You'll see your project dashboard

### Step 2: Navigate to Your Project

1. Click on your project name (e.g., "scaling-up-platform-v2")
2. Click the **"Settings"** tab at the top
3. In the left sidebar, click **"Environment Variables"**

### Step 3: Add Each Variable

For each variable below, do these steps:
1. Click **"Add New"** button
2. Enter the **Name** (exactly as shown)
3. Paste the **Value** 
4. Select environments: ✅ Production, ✅ Preview, ✅ Development
5. Click **"Save"**

---

## Required Environment Variables

### 🔐 Database (Get from Neon or Supabase)

| Name | Where to Get It |
|------|-----------------|
| `DATABASE_URL` | Neon Dashboard → Connection String → Full URL |
| `DIRECT_URL` | Same as above (use for migrations) |

**Example format**: 
```
postgresql://username:password@host.neon.tech:5432/database?sslmode=require
```

---

### 🔑 Authentication

| Name | How to Generate |
|------|-----------------|
| `NEXTAUTH_URL` | Your production URL: `https://platform.scalingup.com` |
| `NEXTAUTH_SECRET` | Generate with command below |

**Generate NEXTAUTH_SECRET**:
1. Open terminal/command prompt
2. Run: `openssl rand -base64 32`
3. Copy the output (looks like: `Kj8xN2pV5m...`)

---

### 🔒 Security

| Name | How to Generate |
|------|-----------------|
| `APPROVAL_LINK_SECRET` | Same as above: `openssl rand -base64 32` |

---

### 💳 Stripe (See Part 2 below)

| Name | Where to Find |
|------|---------------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys |
| `STRIPE_PUBLISHABLE_KEY` | Same location (starts with `pk_`) |
| `STRIPE_WEBHOOK_SECRET` | After webhook setup (Part 2) |

---

### 📧 HubSpot

| Name | Where to Find |
|------|---------------|
| `HUBSPOT_ACCESS_TOKEN` | HubSpot → Settings → Integrations → Private Apps |

---

### 👥 Circle.so

| Name | Where to Find |
|------|---------------|
| `CIRCLE_API_KEY` | Circle.so → Settings → API & Webhooks |
| `CIRCLE_COMMUNITY_ID` | Same location |

---

### ✉️ Email (SMTP)

| Name | Example Value |
|------|---------------|
| `SMTP_HOST` | `smtp.sendgrid.net` or `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Your email service username |
| `SMTP_PASSWORD` | Your email service password |
| `FROM_EMAIL` | `noreply@scalingup.com` |

---

### 🤖 AI (Optional - for content generation)

| Name | Where to Find |
|------|---------------|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GEMINI_API_KEY` | aistudio.google.com |
| `OPENAI_API_KEY` | platform.openai.com |

---

### ⚡ Redis & Notifications (Optional)

| Name | Where to Find |
|------|---------------|
| `REDIS_URL` | Upstash → Database → REST URL |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams → Channel → Connectors |

---

## Part 2: Stripe Webhook Setup

### Step 1: Open Stripe Dashboard

1. Go to: **https://dashboard.stripe.com**
2. Sign in to your Stripe account
3. Make sure you're in **Live mode** (not Test mode)

### Step 2: Navigate to Webhooks

1. Click **"Developers"** in the left sidebar
2. Click **"Webhooks"**
3. Click **"+ Add endpoint"**

### Step 3: Configure the Webhook

Fill in these fields:

| Field | Value |
|-------|-------|
| **Endpoint URL** | `https://platform.scalingup.com/api/webhooks/stripe` |
| **Description** | Scaling Up Platform payment notifications |
| **Listen to** | Events on your account |

### Step 4: Select Events

Click **"+ Select events"** and check these boxes:

- ✅ `checkout.session.completed`
- ✅ `payment_intent.succeeded`
- ✅ `payment_intent.payment_failed`
- ✅ `customer.subscription.created`
- ✅ `customer.subscription.deleted`

Click **"Add endpoint"**

### Step 5: Get the Signing Secret

1. Click on your new webhook endpoint
2. Click **"Reveal"** under "Signing secret"
3. Copy the secret (starts with `whsec_`)
4. Go back to Vercel and add it as `STRIPE_WEBHOOK_SECRET`

---

## Part 3: Verify Configuration

### Checklist

After adding all variables in Vercel:

- [ ] DATABASE_URL
- [ ] DIRECT_URL
- [ ] NEXTAUTH_URL
- [ ] NEXTAUTH_SECRET
- [ ] APPROVAL_LINK_SECRET
- [ ] STRIPE_SECRET_KEY
- [ ] STRIPE_PUBLISHABLE_KEY
- [ ] STRIPE_WEBHOOK_SECRET
- [ ] HUBSPOT_ACCESS_TOKEN
- [ ] CIRCLE_API_KEY
- [ ] CIRCLE_COMMUNITY_ID
- [ ] SMTP_HOST
- [ ] SMTP_USER
- [ ] SMTP_PASSWORD
- [ ] FROM_EMAIL

### Deploy

1. Go back to your Vercel project
2. Click **"Deployments"** tab
3. Click the **"..."** menu on the latest deployment
4. Click **"Redeploy"**

---

## Troubleshooting

### "Environment variable not found" error
→ Make sure you selected all 3 environments (Production, Preview, Development)

### Stripe webhook not working
→ Check that the URL matches exactly: `https://platform.scalingup.com/api/webhooks/stripe`

### Database connection failed
→ Verify the connection string includes `?sslmode=require` at the end

---

## Need Help?

If you get stuck:
1. Take a screenshot of where you are
2. Note any error messages
3. Reach out to tech support

---

*Last updated: February 2, 2026*
