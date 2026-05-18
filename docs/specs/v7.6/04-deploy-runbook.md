# Deploy Runbook — Assessment Tool v7.6

**Spec ref**: v7.6, locked May 15-16 2026 (Jeff impromptu meeting + 3 rounds of Codex adversarial review)
**Status**: Locked. Future revisions land here, NOT in PLAN.md or another spec file.
**Cross-references**: [01-schema](./01-schema.md), [03-seed-rockefeller](./03-seed-rockefeller.md), [06-observability](./06-observability.md), [07-bootstrap-runbook](./07-bootstrap-runbook.md)

---

## Locked decisions implemented in this file

- **Decision 9** — Deploy via `.env.production.local` + `dotenv-cli` one-shot env injection; local `.env` is NEVER overwritten; DB fingerprint preflight MANDATORY before any prod Prisma command; migration baselining uses `prisma migrate diff` (not `--from-empty`); PITR snapshot captured before any destructive step.

## HARD RULE — repeats Round 2 H-1 + Round 3 H-1, never to be relaxed

Local `.env` is NEVER modified, sourced, or overwritten by ANY step in this runbook. Every prod command takes its env from `.env.production.local` via `dotenv-cli` ONE shot at a time. Any deviation is a rollback-blocking error. If the operator finds themselves typing `vi .env` or `cp ... .env`, STOP.

## Why this exists (May 14 finding)

The May 14 finding: local `.env` `DATABASE_URL=ep-falling-sound-aiilz991` is a stale 16-table dev DB without `_prisma_migrations`. The live prod DB Vercel uses is a different Neon endpoint. **Task 9 must run before any `npx prisma migrate deploy` or `npx tsx prisma/seed-rockefeller-assessment.ts` is invoked locally.**

## Step A — pull prod env (one-time, per operator machine)

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
npx vercel env pull .env.production.local --environment=production --yes
chmod 600 .env.production.local   # protect the file
```

Local `.env` STAYS pointed at the stale dev sandbox. Operators MUST NOT replace local `.env` with prod values — the dual-mode `source .env.production.local` then `source .env` pattern from the May 15 draft is **REMOVED** because lingering shell variables like `DIRECT_URL` could leak across commands (addresses Round 1 H-4).

## Step B — one-shot env injection via `dotenv-cli` ONLY (Round 2 H-1 + M-7 + Round 3 L-1)

The `env $(grep ... | xargs)` pattern is REMOVED — it mangles secrets containing spaces, quotes, `$`, or `#`, and silently produces wrong-credential commands. Use `dotenv-cli` exclusively, AND pin it as a devDependency so `npx` always resolves the same package:

```bash
# One-time setup (per checkout):
cd /Users/diushianstand/Scaling-up-platform-v2/src
npm install --save-dev dotenv-cli   # commits a known version to package.json

# Every prod command goes through dotenv-cli with explicit env file.
# Use `npx dotenv-cli` (full name) to disambiguate from the unrelated `dotenv` package:
npx dotenv-cli -e .env.production.local -- npx prisma migrate status
npx dotenv-cli -e .env.production.local -- npx tsx scripts/db-fingerprint.ts
npx dotenv-cli -e .env.production.local -- npx tsx prisma/seed-rockefeller-assessment.ts
```

`dotenv-cli` correctly parses `.env` syntax (quoted values, multiline, embedded `#`, dollar signs). Each command is its own process; no shell-state leakage; no possibility of a prod variable persisting into a follow-on local command. `source` / `set -a` patterns are FORBIDDEN — they violate the one-shot rule.

## Step C — DB fingerprint preflight (REQUIRED before every destructive prod command)

The expected prod host comes from a non-secret env var `ASSESSMENT_PROD_EXPECTED_HOST` checked into `.env.production.local` (committed during the Vercel env pull; the value is the Neon endpoint hostname, NOT a secret). Hardcoding the expected host is FORBIDDEN — operators on different machines may have different shapes. Add a tiny script at `src/scripts/db-fingerprint.ts`:

```ts
// Connects via the currently-active env, prints host + schema name + table count.
// Fails closed (non-zero exit) if expected host env var is missing OR if the actual
// connection host doesn't match.
import { PrismaClient } from "@prisma/client";

const expected = process.env.ASSESSMENT_PROD_EXPECTED_HOST;
if (!expected) {
  console.error("ASSESSMENT_PROD_EXPECTED_HOST not set in active env. " +
    "Pull Vercel prod env first: `npx vercel env pull .env.production.local --environment=production --yes`. " +
    "Add ASSESSMENT_PROD_EXPECTED_HOST=<the-prod-Neon-host> to .env.production.local. " +
    "Then re-run.");
  process.exit(2);
}

const db = new PrismaClient();
const url = new URL(process.env.DATABASE_URL!);
const rows = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
  `SELECT COUNT(*)::bigint AS count FROM information_schema.tables WHERE table_schema='public'`
);
const match = url.hostname === expected;
console.log(JSON.stringify({
  host: url.hostname,
  expectedHost: expected,
  database: url.pathname.replace(/^\//, ""),
  publicTableCount: Number(rows[0].count),
  match,
}, null, 2));
await db.$disconnect();
if (!match) {
  console.error("FINGERPRINT MISMATCH — connected host does not match ASSESSMENT_PROD_EXPECTED_HOST. STOP.");
  process.exit(2);
}
```

Runbook requires the operator to: (a) add `ASSESSMENT_PROD_EXPECTED_HOST=<host>` to `.env.production.local` ONCE (one-time setup per machine), (b) run `npx dotenv-cli -e .env.production.local -- npx tsx scripts/db-fingerprint.ts`, (c) visually verify exit 0 + `match: true`. If exit non-zero, operator MUST stop, fix env, re-verify.

## Step D — migration drift inventory + diff-verified baselining (Round 1 M-7 + Round 2 M-6)

Before `prisma migrate deploy` runs on prod, the operator confirms state AND captures a PITR checkpoint:

```bash
# 1. Inventory: what does Prisma think is pending?
npx dotenv-cli -e .env.production.local -- npx prisma migrate status

# 2. Capture PITR checkpoint timestamp (Neon dashboard or CLI) BEFORE any resolve/deploy.
#    Record in the deploy runbook log as "rollback_target: <ISO timestamp>".

# 3. If baselining is needed (no _prisma_migrations row but tables exist):
#    Compare ACTUAL prod state against the cumulative migration history.
#    --from-url reads live DB; --to-migrations reads the on-disk migration folder.
#    An EMPTY diff means prod already matches the migrations and resolve --applied is safe.
#    A NON-EMPTY diff means drift — STOP and triage; do NOT run resolve --applied.
npx dotenv-cli -e .env.production.local -- npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-migrations prisma/migrations \
  --shadow-database-url "$DIRECT_URL" \
  --exit-code  # exit 0 = no diff (safe to baseline); exit 2 = diff exists (STOP)

# ONLY if --exit-code returned 0 above, mark each historic migration applied:
for name in $(ls prisma/migrations | grep -v _prisma_migrations | sort); do
  npx dotenv-cli -e .env.production.local -- npx prisma migrate resolve --applied "$name"
done
```

`migrate resolve --applied` MUST NOT run on a non-empty diff — it would claim "this is already in the DB" when it isn't, and corrupt migration history. The `--from-url` flag is non-negotiable: `--from-empty` (Round 2's spec) only prints expected DDL and does NOT compare against live prod. (Addresses Round 3 H-6.) PITR checkpoint captured in step 2 above is the rollback path if a baseline goes wrong.

- If `_prisma_migrations` is populated and only `20260514230000_add_assessment_infrastructure_v7_5` is pending → safe to proceed to `migrate deploy`.
- If `_prisma_migrations` is missing or stale → baseline with diff-verified `resolve --applied` per the loop above, then deploy.

## Step E — local dev DB strategy

The 16-table dev DB local `.env` points at is unsalvageable for foundation testing. v7.6 deliberately does NOT prescribe modifying local `.env`:
- **Default**: leave local `.env` ALONE. Use Vercel preview deploys to test v7.5+ changes against a Neon preview branch (Vercel auto-creates one per PR, populated via `prisma migrate deploy` in the build).
- **If a fresh local dev DB is desired**: that's a separate workstream OUTSIDE the foundation slice — operator creates a new Neon dev branch or local Postgres, points an `.env.development.local` (NEVER overwriting `.env`) at it, runs `npx dotenv-cli -e .env.development.local -- npx prisma migrate deploy` to populate, and uses dotenv-cli for all local-dev commands the same way they do for prod. Local `.env` STAYS pointed at the stale 16-table sandbox so accidental commands hit a known-throwaway target.

The runbook NEVER tells operators to overwrite local `.env`. Reduces blast radius to zero.

## Full deploy sequence (the end-to-end summary)

1. **Pull Vercel prod env** to confirm the actual `DATABASE_URL` and `DIRECT_URL`:
   ```bash
   cd /Users/diushianstand/Scaling-up-platform-v2/src
   npx vercel env pull .env.production.local --environment=production --yes
   ```
2. **Diff** the pulled `DATABASE_URL` vs local `.env`. Use `.env.production.local` for prod-targeted commands. NEVER overwrite local `.env`.
3. **Re-run** `npx dotenv-cli -e .env.production.local -- npx prisma migrate status` against the real prod DB. Confirm `_prisma_migrations` exists and the v7.5 migration is the only pending one. If history baselining is needed, use diff-verified `prisma migrate resolve --applied <name>` per Step D.
4. **Then** push to main. Vercel build runs `prisma migrate deploy` → applies v7.5 cleanly (additive: 14 new tables — original 11 minus 1 dropped + 3 new join/group tables; trigger; partial unique indexes; GIN index).
5. **After `● Ready`**: run prod seed via `npx dotenv-cli -e .env.production.local -- npx tsx prisma/seed-rockefeller-assessment.ts` with the verified prod env. Capture emitted JSON line (template id, version id, contentHash, state) in the deploy runbook.
6. **Post-deploy gate**: `npx dotenv-cli -e .env.production.local -- npx tsx scripts/verify-assessment-foundation.ts --env=prod` exits non-zero on missing delegates/indexes/triggers/seed-hash mismatch. See [03-seed-rockefeller](./03-seed-rockefeller.md) for what the gate verifies.
7. **Bootstrap step**: admin opens the Access Groups list (Wave 5 wireframe 21), creates / verifies the "Scaling Up Coaches" group, and bulk-adds every certified coach (`certificationStatus === "ACTIVE"`). Until this step runs, the assessment tool is invisible/unusable for coaches. See [07-bootstrap-runbook](./07-bootstrap-runbook.md).
8. **Observability gate**: confirm the `/admin/observability` dashboard renders all 7 metrics and no alert gate is currently firing. Otherwise rollback per the PITR checkpoint. See [06-observability](./06-observability.md).

---

**Decision provenance**: see `plans/history/v6-v7.5-archive.md` for the full Codex Round changelogs that produced this spec.
