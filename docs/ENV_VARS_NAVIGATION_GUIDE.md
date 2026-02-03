# 🧭 Environment Variables Navigation Guide

This guide helps you find the specific API keys and secrets needed for the Scaling Up Platform v2.

---

## 1. Stripe Keys (Payments)

**Goal**: Get `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET`.

### Step 1: Login
Go to [dashboard.stripe.com](https://dashboard.stripe.com) and log in.

### Step 2: Ensure Live Mode
Toggle the "Test mode" switch at the top right to **OFF** (so it says "Live"). 
*(Note: For testing, you can use Test keys, but for production, use Live).*

### Step 3: API Keys
1. Click **"Developers"** in the top-right corner.
2. Click **"API keys"** in the "Developers" tab (or left sidebar).
3. **Publishable key**: Copy the key starting with `pk_live_...`.
4. **Secret key**: Click "Reveal live key" and copy the key starting with `sk_live_...`.

### Step 4: Webhook Secret
1. Click **"Webhooks"** in the left sidebar (under "Developers").
2. Find the URL endpoint we added earlier (`.../api/webhooks/stripe`).
3. Click on that endpoint.
4. Click **"Reveal"** under "Signing secret".
5. Copy the key starting with `whsec_...`.

---

## 2. HubSpot Private Apps (CRM)

**Goal**: Get `HUBSPOT_ACCESS_TOKEN`.

### Step 1: Settings
Go to your HubSpot portal and click the **Gear Icon** (Settings) in the top-right.

### Step 2: Integrations
1. In the left sidebar, navigate to **Integrations** > **Private Apps**.
2. Click **"Create a private app"** (orange button).

### Step 3: Create App
1. **Name**: Enter "Scaling Up Platform".
2. Click **"Scopes"** tab.
3. Check these boxes (Critical):
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.schemas.contacts.read`
4. Click **"Create app"**.

### Step 4: Get Token
1. You will see a modal with your Access Token.
2. Click **"Show token"** and copy it. It starts with `pat-na1-...`.

---

## 3. Mailgun (Email SMTP)

**Goal**: Configure SMTP settings for email notifications (Free Plan).

### Step 1: Create Account / Login
Go to [mailgun.com](https://www.mailgun.com/) and sign up.

### Step 2: Get SMTP Credentials
1. In the left sidebar, go to **Sending** > **Overview**.
2. Select your domain (or the sandbox domain if testing).
3. Click **"Select"** (SMTP).
4. You will see:
   - **Hostname**: `smtp.mailgun.org`
   - **Port**: `587`
   - **Username**: `postmaster@yourdomain.com`
   - **Password**: [Click "Reset Password" if you don't know it, or copy the Default Password]

### Step 3: Environment Variables
Use these values for Vercel:

| Variable | Value |
|----------|-------|
| `SMTP_HOST` | `smtp.mailgun.org` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | [Your Mailgun Postmaster Username] |
| `SMTP_PASSWORD` | [Your Mailgun SMTP Password] |
| `FROM_EMAIL` | `noreply@scalingup.com` (or your verified domain email) |

### Step 4: Verify Domain (Critical for Production)
1. You **MUST** verify your domain (e.g., `scalingup.com`) to send to anyone outside your authorized recipients list.
2. Go to **Sending** > **Domains** > **Add New Domain**.
3. Follow the instructions to add DNS records (TXT, MX, CNAME) to your DNS provider (GoDaddy, Cloudflare, etc.).


---

## 4. Circle.so (Community)

**Goal**: Get `CIRCLE_COMMUNITY_ID`.

### Step 1: API Token
*(You already provided this: `esuz3N4Q3xarzefFRDW1D3HX85VYuUQq`)*

### Step 2: Community ID
1. Log in to your Circle community.
2. Look at the URL in your browser.
3. It usually looks like `https://app.circle.so/home`.
4. Go to **Settings** > **General**.
5. Often the Community ID is just the subdomain (e.g., if URL is `scalingup.circle.so`, try using `scalingup` first, or verify via API). 
   * *Note: For many integrations, the ID is numeric. If you need help finding the numeric ID, let me know.*

