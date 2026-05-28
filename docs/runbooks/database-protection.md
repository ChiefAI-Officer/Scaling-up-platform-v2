# Database Protection Runbook

Audience: anyone deploying schema changes or running scripts against the production database. This runbook covers the layered protections in place so manually-configured production data (Surveys, Workflows, Coaches, Assessment Templates, etc.) survives future schema updates.

---

## 1. Layered protections — what's in place

| Layer | Mechanism | When it fires |
|---|---|---|
| **Continuous backup** | Neon point-in-time recovery (PITR) | Always-on; restore via Neon dashboard. **Retention window must be confirmed in the Neon dashboard** — see §7. |
| **Migration apply** | `prisma migrate deploy` (in `npm run build` / `vercel.json` buildCommand) | Every Vercel deploy. Only applies pending migrations; **cannot** reset or drop tables on its own. |
| **Migration safety gate (ENFORCED)** | `node scripts/check-migration-safety.mjs` runs in the `vercel.json` buildCommand + `package.json` build, BEFORE `prisma migrate deploy` | Every deploy. Greps each migration for destructive ops (DROP TABLE/COLUMN, TRUNCATE, DELETE FROM, ALTER…DROP). A migration with an unapproved destructive op FAILS the build before any migration runs. Approve with an immediately-preceding `-- @approved:` comment. |
| **Destructive-command guard (`safe-prisma`)** | `db:reset`, `db:migrate`, `db:push` all route through `scripts/safe-prisma.mjs` | Always. Blocks `prisma migrate reset` / `migrate dev` / `db push` against a Neon-host `DATABASE_URL` unless `--i-know-this-is-prod` is passed. **These are the commands that actually wiped prod** (see §7). |
| **Pre-deploy snapshot** | `npm run snapshot:prod` | Manual; run before any schema change. Exports critical tables to a timestamped JSON in `.snapshots/`. Retries transient drops; a snapshot missing a core table is saved as `*.PARTIAL.json` and exits non-zero so it can never be mistaken for a complete fixture. Forensic/export aid — **not** a transactionally-consistent backup; PITR is the real recovery path. |
| **Seed-script convention** | All seed scripts use `upsert`, not `delete + create` | Always; re-running a seed against prod is idempotent and won't wipe user-configured rows. |

---

## 2. Before any production schema change

Run these in order:

```bash
cd src

# 0) (One-time per shell session) Pull live production env to a local file.
#    Required because the snapshot script needs the prod DATABASE_URL.
#    Vercel writes .env.production.local, which is already gitignored.
npx vercel env pull .env.production.local --environment=production --yes

# 1) Snapshot critical tables (Surveys / Workflows / Coaches / Templates / etc.)
npm run snapshot:prod
# → snapshot script auto-loads .env.production.local; no env-var prefix needed
# → writes src/.snapshots/snapshot-YYYY-MM-DD-HHmmss.json

# 2) Verify the new migration has no unapproved destructive ops
npm run db:check-migrations
# → exits 0 if clean; lists offenders if not

# 3) Build locally to confirm prisma migrate deploy completes cleanly
CI=true npx next build --turbopack
```

Only push the branch after all three pass. The pre-deploy snapshot is your emergency rollback fixture if anything goes sideways at deploy time — even if Neon PITR also covers you.

**Env resolution priority** in `snapshot:prod` and `restore:from-snapshot`:
1. `process.env.DATABASE_URL` (already exported in shell)
2. `.env.production.local` (what `vercel env pull` writes — preferred)
3. `.env.local` (Next.js local override convention)
4. `.env` (default — usually dev DB)

---

## 3. If something does go wrong on deploy

**Symptom A — Vercel build fails on `prisma migrate deploy`**
- Vercel hasn't touched the DB yet (migrate aborted). Roll back the branch / revert the bad migration commit and re-deploy. No data loss.

**Symptom B — Build succeeded but expected data is missing in prod**
- Open Neon dashboard → select the prod database → "Branches" tab → "Restore" → choose a timestamp from before the deploy.
- Alternatively, use the pre-deploy snapshot:
  ```bash
  cd src
  DATABASE_URL=$PROD_DATABASE_URL npx tsx scripts/restore-from-snapshot.ts \
    .snapshots/snapshot-<timestamp>.json \
    --table=Survey
  ```
  Limitations of the snapshot restore: it upserts by primary key — so it brings back deleted rows but won't undo edits applied to rows that already exist. For true point-in-time recovery (including row reverts), use Neon PITR.

**Symptom C — A bad migration partially applied and the DB is in an inconsistent state**
- Don't deploy further code from main until fixed.
- Open Neon → restore to a snapshot from before the deploy. This nukes the migration entirely.
- Then revert the bad migration commit on main, apply a corrected migration, deploy.

---

## 4. Adding new tables to the snapshot

`scripts/snapshot-prod-tables.ts` has a `CRITICAL_TABLES` constant. Add a model name when:

- The table holds operator-configured data (manually entered via the admin UI).
- Losing the table's contents would force someone to re-do work.

Avoid adding:
- Tables that are pure system bookkeeping (e.g., `_prisma_migrations`, `WorkflowStepExecution` job-run logs)
- Tables that are easily re-derivable from other tables (e.g., snapshot caches)

---

## 5. Approving a destructive migration

If you genuinely need to drop a column / table (e.g., removing dead code), the migration safety gate requires an explicit approval comment immediately preceding the destructive statement:

```sql
-- AlterTable
-- @approved: Linear SCL-123, dropping the old status enum after migration v42
ALTER TABLE "Workshop" DROP COLUMN "oldStatus";
```

The approval comment is documentation of WHY the destructive op is intentional, not a permission flag — it must reference the PR / Linear ticket / discussion that approved the change. Reviewers should still scrutinize the commit.

---

## 6. Snapshot housekeeping

`.snapshots/` is gitignored — snapshot JSON files are local-only. Don't commit them; they contain user PII (emails, names, etc.). Retain them locally for ~30 days, then delete.

If you need to share a snapshot with another operator for incident response, transfer it via 1Password / Slack DM with the same care you'd give a credential dump.

---

## 7. Post-mortem — what caused the two production wipes (May 2026)

**Confirmed by reading the repo:**

- The deploy build runs `prisma generate && prisma migrate deploy && next build`. **`prisma migrate deploy` cannot wipe data** — it only applies pending migrations and *errors* on drift; it never resets.
- All 29 migrations were scanned. The only destructive SQL is a single, scoped, `-- @approved:` `DELETE FROM workflow_step_executions WHERE workshopId NOT IN (...)` (orphan cleanup in `20260401000000_add_workshop_cascade_deletes`). No migration drops or truncates an operator-data table. **So the wipes did not come through the deploy/migration path.**

**Most likely cause:** a destructive Prisma command run **locally against the production `DATABASE_URL`** during a migration conflict:

- `prisma migrate reset` (was exposed as `npm run db:reset`, **unguarded**) — a full drop+recreate.
- `prisma migrate dev` (was `npm run db:migrate`, **unguarded**) — a development-only command that *prompts to reset the database* when it detects drift or a failed migration.
- The catalyst was the **Mar 31 baseline migration** (`20260331000000_add_missing_tables_baseline`). The project used `prisma db push` with no migration files from Sprint 1 onward; introducing migration files into a database Prisma then saw as fully "drifted" is exactly the state in which `migrate dev`/`reset` offers to wipe and recreate. This matches the operator's description: *"conflicting with a commit, I replaced it."*

This **cannot be fully confirmed from the repo alone** — confirming the exact command + timestamp requires Neon's query/branch history (Console → project → *Monitoring* / *History*). Whoever owns the Neon account should check the activity around each wipe date.

**Why it can't reship the same way:** `db:reset`, `db:migrate`, and `db:push` now route through `scripts/safe-prisma.mjs`, which refuses to run against a Neon-host `DATABASE_URL` unless `--i-know-this-is-prod` is explicitly passed (and consumes that flag itself — the previous `guard && prisma` composition silently ignored the override because `npm run … -- --flag` appends the flag to prisma, not the guard). Proven: running `npm run db:reset` / `npm run db:push` with the live prod env is blocked *before* prisma is ever spawned (no DB contact).

---

## 8. Open items / stronger protections (need the Neon-account owner)

The code-level guards above stop the known wipe vector, but the **single highest-leverage control is at the database, not in this repo.** These need whoever owns the Neon + Vercel account:

1. **Least-privilege runtime DB role (highest leverage).** The Vercel runtime should connect with a role that *cannot* `DROP`/`ALTER`/`TRUNCATE`/own schemas. A separate, DDL-capable role is used only by the (protected) migration step. Then no leaked or mis-pointed app `DATABASE_URL` can wipe anything, regardless of which client runs.
2. **Confirm PITR retention.** Neon PITR is always-on, but the **history-retention window depends on the plan** (Neon Console → project → *Settings* → *Storage* / history retention). Record the actual window here once confirmed:
   - `DATABASE_URL` host: `ep-falling-sound-aiilz991-pooler.c-4.us-east-1.aws.neon.tech` (project `neondb`)
   - PITR retention window: **TODO — confirm in Neon dashboard (account owner = `josh-4119`).**
3. **Neon protected branch for prod** — prevents branch reset/delete. (Does *not* block a `DELETE` over a valid connection, so pair with #1.)
4. **Pre-migration Neon restore branch/checkpoint** instead of (or in addition to) the JSON snapshot — Vercel's build FS is ephemeral, and a Neon branch is a real, consistent recovery point.
5. **Activate CI at the repo root.** The GitHub workflows live at `src/.github/workflows/` and are therefore **never discovered by GitHub** (workflows must be at repo-root `.github/workflows/`). The live deploy path is Vercel's git integration. Moving the workflows to the repo root would activate the migration-safety gate as a true CI step (it's currently kept there as a future-proof tripwire).
6. **Branch protection + CODEOWNERS on `main`** — no direct pushes; require review on `prisma/schema.prisma`, `prisma/migrations/**`, `vercel.json`, `package.json`, and `scripts/safe-prisma.mjs` / `scripts/check-migration-safety.mjs`.
7. **Long-term: remove `prisma migrate deploy` from the buildCommand** and run exactly one protected migration step (with the safety gate + the DDL-only role) before deploy, so schema and code roll forward together.
