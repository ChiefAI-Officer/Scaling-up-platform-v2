# Task 9 — Operator steps (env-mismatch resolution)

**Spec ref**: `04-deploy-runbook.md`
**Status**: scripts shipped May 17; awaiting operator action to complete

## Prerequisites

- `vercel` CLI installed + logged in (`npx vercel whoami` returns the right account)
- Working directory: `/Users/diushianstand/Scaling-up-platform-v2/src/`
- Neon account access for PITR snapshot capture

## Steps

1. **Pull Vercel prod env to `.env.production.local`**:
   ```bash
   cd /Users/diushianstand/Scaling-up-platform-v2/src
   npx vercel env pull .env.production.local --environment=production --yes
   ```
   Confirm the file appears with `DATABASE_URL`, `DIRECT_URL`, and other prod vars. NEVER copy this file to `.env`.

2. **Identify the prod Neon host**:
   ```bash
   grep "^DATABASE_URL" .env.production.local | head -1 | sed 's|.*@\([^:/]*\).*|\1|'
   ```
   Copy the hostname output.

3. **Add `ASSESSMENT_PROD_EXPECTED_HOST` to `.env.production.local`** (one-time, never committed):
   ```bash
   echo "ASSESSMENT_PROD_EXPECTED_HOST=<paste-hostname-here>" >> .env.production.local
   ```

4. **Capture a Neon PITR snapshot** via the Neon dashboard. Note the timestamp. This is the rollback checkpoint.

5. **Run the fingerprint preflight**:
   ```bash
   npx dotenv-cli -e .env.production.local -- npx tsx scripts/db-fingerprint.ts
   ```
   Expect: JSON `{ match: true, host: "...", server_addr: ... }`, exit 0.
   If exit 1 or 2: STOP. Fix env, re-verify.

6. **Run `prisma migrate status` against prod**:
   ```bash
   npx dotenv-cli -e .env.production.local -- npx prisma migrate status
   ```
   Confirm `_prisma_migrations` exists on prod. Note which historic migrations need `prisma migrate resolve --applied`.

7. **For each historic migration NOT recorded** in `_prisma_migrations` but structurally present in prod, run the diff-then-resolve sequence (per `04-deploy-runbook.md` Step D):
   ```bash
   # Diff against actual prod schema — must be exit 0 (empty diff)
   npx dotenv-cli -e .env.production.local -- npx prisma migrate diff \
     --from-url "$DATABASE_URL" \
     --to-migrations prisma/migrations \
     --shadow-database-url "$DIRECT_URL" \
     --exit-code

   # Only if exit 0:
   npx dotenv-cli -e .env.production.local -- npx prisma migrate resolve --applied "<migration-name>"
   ```
   Stop on any non-zero diff exit and triage.

8. **Verify**: `prisma migrate status` should now show only `20260514230000_add_assessment_infrastructure_v7_5` as pending. That's the v7.6 (in v7.5 directory) migration ready to deploy via `git push` → Vercel build.

## What's still gated AFTER this task

- Pushing to main (triggers Vercel build which runs `prisma migrate deploy`)
- Running `seed-rockefeller-assessment.ts` against prod (`npx dotenv-cli -e .env.production.local -- npx tsx prisma/seed-rockefeller-assessment.ts`)
- Running `verify-assessment-foundation.ts` post-deploy gate

These are deploy steps, not env-mismatch resolution. They live in `04-deploy-runbook.md`.
