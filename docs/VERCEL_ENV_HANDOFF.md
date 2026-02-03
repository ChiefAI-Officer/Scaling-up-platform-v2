# Vercel Environment Variables Handoff

**Project**: Scaling Up Platform v2
**Platform**: Vercel (Next.js)

## 1. Database (PostgreSQL)
*Required for: Core application data*
- **DATABASE_URL**: `postgresql://[user]:[password]@[host]:5432/[db_name]?sslmode=require`
- **DIRECT_URL**: `postgresql://[user]:[password]@[host]:5432/[db_name]?sslmode=require` (Same as above usually, port 5432)

## 2. Authentication (NextAuth.js)
*Required for: Login/Logout*
- **NEXTAUTH_URL**: `https://[your-project].vercel.app` (or custom domain)
- **NEXTAUTH_SECRET**: `[Run: openssl rand -base64 32]`

## 3. Stripe Payments
*Required for: Workshop checkout*
- **STRIPE_SECRET_KEY**: `sk_live_...`
- **STRIPE_PUBLISHABLE_KEY**: `pk_live_...`
- **STRIPE_WEBHOOK_SECRET**: `whsec_...` (From Stripe Dashboard > Developers > Webhooks)

## 4. Third-Party Integrations
*Required for: CRM and Community*
- **HUBSPOT_ACCESS_TOKEN**: `pat-na1-...`
- **CIRCLE_API_KEY**: `[Circle API Key]`
- **CIRCLE_COMMUNITY_ID**: `[Community ID]`

## 5. Email (SMTP - Mailgun)
*Required for: Notifications*
- **SMTP_HOST**: `smtp.mailgun.org`
- **SMTP_PORT**: `587`
- **SMTP_USER**: `postmaster@[your-domain]`
- **SMTP_PASSWORD**: `[SMTP Password]`
- **FROM_EMAIL**: `noreply@scalingup.com`

## 6. Security
*Required for: Approval workflows*
- **APPROVAL_LINK_SECRET**: `[Run: openssl rand -base64 32]`

## 7. AI (Optional)
*Required for: Content generation features*
- **OPENAI_API_KEY**: `sk-...`
- **ANTHROPIC_API_KEY**: `sk-ant-...`

---

## Instructions for Implementation
1. Go to **Vercel Project Settings** > **Environment Variables**.
2. Copy/Paste values for all environments (**Production**, **Preview**, **Development**).
3. **Restaging/Redeploy** is required after saving variables.
