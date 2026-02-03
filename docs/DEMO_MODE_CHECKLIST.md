# 🎬 Demo Mode Checklist
## Get the Dashboard Live for Tomorrow's Presentation

**Time Required:** ~10 minutes  
**Difficulty:** Easy (Copy-Paste)

---

## ✅ Pre-Flight Check

Before you start, confirm you have:
- [ ] Access to your Vercel dashboard (vercel.com)
- [ ] Access to your Neon database dashboard (neon.tech)

---

## Step 1: Get Your Database URL (5 mins)

### 1.1 Open Neon Dashboard
1. Go to **[console.neon.tech](https://console.neon.tech)**.
2. Log in with your account.

### 1.2 Find Your Connection String
1. Click on your **project name** (e.g., "scaling-up-platform").
2. In the left sidebar, click **"Dashboard"** (or it may already be selected).
3. Look for the **"Connection string"** box.
4. Make sure the dropdown says **"Prisma"** (not "psql").
5. Click the **"Copy"** icon (📋) next to the connection string.

> [!TIP]
> The string looks like: `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

### 1.3 Save It
Paste it somewhere safe (Notepad, sticky note). You'll need it in Step 2.

---

## Step 2: Add Variables to Vercel (5 mins)

### 2.1 Open Vercel Project Settings
1. Go to **[vercel.com](https://vercel.com)**.
2. Click on your project: **"scaling-up-platform-v2"**.
3. Click the **"Settings"** tab (top navigation bar).
4. In the left sidebar, click **"Environment Variables"**.

### 2.2 Add Variable #1: DATABASE_URL
1. In the **"Key"** box, type: `DATABASE_URL`
2. In the **"Value"** box, paste the connection string you copied from Neon.
3. Under **"Environment"**, check ALL boxes: ✅ Production, ✅ Preview, ✅ Development.
4. Click **"Save"**.

### 2.3 Add Variable #2: NEXTAUTH_URL
1. In the **"Key"** box, type: `NEXTAUTH_URL`
2. In the **"Value"** box, type: `https://scaling-up-platform-v2.vercel.app`
   - *(Replace with your actual Vercel URL if different)*
3. Check ALL environment boxes.
4. Click **"Save"**.

### 2.4 Add Variable #3: NEXTAUTH_SECRET
1. In the **"Key"** box, type: `NEXTAUTH_SECRET`
2. In the **"Value"** box, copy and paste this secure key:
   ```
   kX9vM2qL7pRtYw4sFgHjKmNbVcXzA8eD3uIoP6yTrEwQ1aZsLkJhGfDcBvNmQwErTyUi
   ```
3. Check ALL environment boxes.
4. Click **"Save"**.

### 2.5 Add Variable #4: DEMO_MODE (Critical for Login!)
1. In the **"Key"** box, type: `DEMO_MODE`
2. In the **"Value"** box, type: `true`
3. Check ALL environment boxes.
4. Click **"Save"**.

> [!IMPORTANT]
> This variable enables demo authentication with password `demo123`. Remove this in production!

---

## Step 3: Redeploy the App (2 mins)

After adding variables, Vercel needs to rebuild:

### 3.1 Trigger Redeploy
1. Still in Vercel, click the **"Deployments"** tab.
2. Find the most recent deployment.
3. Click the **three dots (⋮)** on the right side.
4. Click **"Redeploy"**.
5. In the popup, click **"Redeploy"** again.

### 3.2 Wait for Build
- Watch the progress bar. It should take 1-2 minutes.
- When it says **"Ready"** with a green checkmark ✅, you're done!

---

## Step 4: Test the Dashboard

### 4.1 Open Your Site
1. Click the **"Visit"** button in Vercel, OR
2. Go directly to: `https://scaling-up-platform-v2.vercel.app`

### 4.2 What You Should See
- ✅ **Landing Page** or **Login Screen** loads
- ✅ No "Application Error" or blank page
- ⚠️ Some features may show "Demo Mode" placeholders (this is expected)

---

## 🎉 You're Ready for the Demo!

### What Works in Demo Mode
| Feature | Status |
|---------|--------|
| Dashboard UI | ✅ Fully visible |
| Workshop List | ✅ Shows seeded data |
| Coach Portal | ✅ Navigation works |
| Admin Panel | ✅ Displays correctly |
| Login/Logout | ✅ Works with test accounts |

### What's Disabled (By Design)
| Feature | Reason |
|---------|--------|
| Real Payments | No Stripe key |
| Email Notifications | No SMTP configured |
| Coach Certification Check | No Circle API key |

---

## 📅 Post-Demo: Full Configuration Session

After the presentation, schedule 30 minutes to add:
1. **Stripe Keys** → Enable real payments
2. **Mailgun SMTP** → Enable email notifications
3. **HubSpot Token** → Enable CRM integration
4. **Circle API Key** → Enable certification verification

Use the **[VERCEL_ENV_COPY_PASTE.txt](./VERCEL_ENV_COPY_PASTE.txt)** file for the complete list.

---

## ❓ Troubleshooting

### "Application Error" after deploy
→ Double-check `DATABASE_URL` is correct (no extra spaces).

### "Invalid URL" or redirect loop
→ Make sure `NEXTAUTH_URL` matches your exact Vercel domain.

### Page loads but data is empty
→ Database may need seeding. Run: `npx prisma db seed` from your local machine.

---

**Good luck with your presentation! 🚀**
