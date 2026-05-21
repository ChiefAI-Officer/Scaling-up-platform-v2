# Database Protection Runbook

Audience: anyone deploying schema changes or running scripts against the production database. This runbook covers the layered protections in place so manually-configured production data (Surveys, Workflows, Coaches, Assessment Templates, etc.) survives future schema updates.

---

## 1. Layered protections — what's in place

| Layer | Mechanism | When it fires |
|---|---|---|
| **Continuous backup** | Neon point-in-time recovery (PITR) | Always-on; restore via Neon dashboard |
| **Migration apply** | `prisma migrate deploy` (in `npm run build`) | Every Vercel deploy. Only applies pending migrations; never drops tables. |
| **Migration safety gate** | `npm run db:check-migrations` | Manual / CI step. Greps each migration for destructive ops (DROP TABLE/COLUMN, TRUNCATE, DELETE FROM, ALTER COLUMN DROP). Fails on any without an `-- @approved:` comment. |
| **Pre-deploy snapshot** | `npm run snapshot:prod` | Manual; run before any schema change. Exports critical tables to a timestamped JSON in `.snapshots/`. |
| **db:push guard** | `npm run db:push` (wrapped) | Blocks against Neon-host DATABASE_URLs unless `--i-know-this-is-prod` is passed. |
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
