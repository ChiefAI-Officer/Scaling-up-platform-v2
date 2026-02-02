# Supabase Setup Guide - Scaling Up Platform v2
## For Non-Technical Users

> **Time Required:** 5-10 minutes  
> **Cost:** Free (sufficient for development and initial production)

---

## Step 1: Create Supabase Account

1. **Open your web browser** and go to:
   ```
   https://supabase.com
   ```

2. **Click the green "Start your project" button** in the top right corner

3. **Sign up with GitHub** (recommended) or email:
   - **Option A (Recommended):** Click "Continue with GitHub"
     - You'll be redirected to GitHub
     - Click "Authorize Supabase"
     - You'll be redirected back to Supabase
   
   - **Option B:** Click "Continue with Email"
     - Enter your email address
     - Check your email for verification link
     - Click the link to verify

4. **You're now logged in** - you'll see the Supabase dashboard

---

## Step 2: Create New Project

1. **Click the "New Project" button**
   - It's a green button in the center or top-right of the screen

2. **Fill in the project details:**

   **Organization:**
   - If this is your first time, you'll be asked to create an organization
   - Name it: `Scaling Up` or `The CTO Project`
   - Click "Create organization"

   **Project Name:**
   ```
   scaling-up-v2
   ```
   
   **Database Password:**
   - Click the "Generate a password" button (🔄 icon)
   - **IMPORTANT:** Copy this password immediately!
   - Paste it into a secure location (password manager or secure note)
   - You'll need this later and **cannot retrieve it** if lost

   **Region:**
   - Choose the region closest to you:
     - **US East (N. Virginia)** - if you're in Eastern US
     - **US West (Oregon)** - if you're in Western US
     - **Southeast Asia (Singapore)** - if you're in Asia
     - **Europe (Frankfurt)** - if you're in Europe

   **Pricing Plan:**
   - Leave as "Free" (already selected)

3. **Click "Create new project"**
   - Wait 1-2 minutes while Supabase sets up your database
   - You'll see a progress indicator
   - When complete, you'll see the project dashboard

---

## Step 3: Get Your Connection String (DATABASE_URL)

1. **Look at the "Connect to your project" dialog** (from your screenshot)
2. **Click the "Method" dropdown**
   - It currently says "Direct connection" in your screenshot
3. **Select "Transaction pooler"** from the list
   - This is essential for serverless apps like Next.js
   - This prevents "too many connections" errors
4. **Copy the connection string:**
   - It will start with `postgresql://...` and end with port `:6543`
   - **IMPORTANT:** Replace `[YOUR-PASSWORD]` with the password you saved earlier
5. **Save this as your `DATABASE_URL`**

---

## Step 4: Get Your Direct Connection String (DIRECT_URL)

1. **Click the "Method" dropdown again**
2. **Select "Direct connection"**
   - This is required for running database migrations
3. **Copy this connection string:**
   - It will start with `postgresql://...` and end with port `:5432`
   - **IMPORTANT:** Replace `[YOUR-PASSWORD]` with your password
4. **Save this as your `DIRECT_URL`**

---

## Step 5: Update Your .env File

1. **Open your project folder:**
   ```
   D:\The CTO Project\Scaling Up Platform v2\src
   ```

2. **Find the file named `.env`**
   - If you don't see it, make sure "Show hidden files" is enabled in Windows Explorer
   - Or create a new file named `.env` (no extension)

3. **Open `.env` in a text editor** (Notepad, VS Code, etc.)

4. **Add these lines** (replace with your actual connection strings from Steps 3 & 4):

   ```bash
   # Supabase Database
   DATABASE_URL="postgresql://postgres.xxxxxxxxxxxx:YOUR_ACTUAL_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres.xxxxxxxxxxxx:YOUR_ACTUAL_PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

   # Circle.so (already validated)
   CIRCLE_API_KEY="esuz3N4Q3xarzefFRDW1D3HX85VYuUQq"

   # Other variables (fill these in later)
   HUBSPOT_ACCESS_TOKEN=""
   STRIPE_SECRET_KEY=""
   STRIPE_WEBHOOK_SECRET=""
   NEXTAUTH_SECRET="your-32-character-secret-here"
   NEXTAUTH_URL="http://localhost:3000"
   ```

5. **Save the file** (Ctrl+S or File → Save)

---

## Step 6: Update Prisma Schema

1. **Open this file:**
   ```
   D:\The CTO Project\Scaling Up Platform v2\src\prisma\schema.prisma
   ```

2. **Find the `datasource db` section** (near the top, around line 5-8)

3. **Replace it with this:**
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```

4. **Save the file**

---

## Step 7: Run Database Migrations

1. **Open PowerShell or Command Prompt**

2. **Navigate to your project:**
   ```powershell
   cd "D:\The CTO Project\Scaling Up Platform v2\src"
   ```

3. **Generate Prisma Client:**
   ```powershell
   npx prisma generate
   ```
   - Wait for "✔ Generated Prisma Client"

4. **Run the migration:**
   ```powershell
   npx prisma migrate dev --name init_v2_schema
   ```
   - You'll see a list of tables being created
   - Wait for "✔ Migration applied successfully"

5. **Verify the setup:**
   ```powershell
   npx prisma studio
   ```
   - This opens a browser window at http://localhost:5555
   - You should see all your database tables (Coach, Workshop, Registration, etc.)
   - **Success!** Your database is ready

---

## Step 8: Verify in Supabase Dashboard

1. **Go back to your Supabase project dashboard**
   - https://supabase.com/dashboard/project/YOUR_PROJECT_ID

2. **Click "Table Editor" in the left sidebar**
   - You should see all the tables created by Prisma:
     - coaches
     - workshops
     - registrations
     - approval_queue
     - audit_logs
     - email_templates
     - landing_pages
     - follow_up_reports
     - And more...

3. **If you see these tables, you're all set! ✅**

---

## Troubleshooting

### "Connection refused" or "Connection timeout"
- Check that your password is correct in `.env`
- Make sure there are no extra spaces in the connection string
- Verify your internet connection

### "Migration failed"
- Make sure you ran `npx prisma generate` first
- Check that both `DATABASE_URL` and `DIRECT_URL` are in `.env`
- Try running `npx prisma migrate reset` to start fresh (WARNING: deletes all data)

### "Cannot find module"
- Run `npm install` in the project directory
- Make sure you're in the correct folder: `D:\The CTO Project\Scaling Up Platform v2\src`

---

## What's Next?

✅ **Database is ready!**  
✅ **Circle.so API validated**  
✅ **Schema deployed with 15 models**

**Next Steps:**
1. Configure HubSpot and Stripe API keys (when ready)
2. Begin Phase 2: Core Services development
3. Build Circle.so certification verification service

---

## Important Notes

📌 **Keep your database password secure** - don't share it or commit it to GitHub  
📌 **Free tier limits:** 500MB storage, 2GB bandwidth (sufficient for MVP)  
📌 **Upgrade when needed:** $25/mo for Pro plan (unlimited API requests)  
📌 **Backups:** Supabase automatically backs up your database daily

---

*Setup guide created: January 29, 2026*  
*For: Scaling Up Platform v2*
