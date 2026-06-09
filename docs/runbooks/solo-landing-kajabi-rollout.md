# Runbook — Global SOLO_LANDING Kajabi design rollout

> Owner: CAIO (operator). Sign-off gate: do NOT run any `--apply` step against prod
> without an explicit go-ahead recorded in the rollout ticket. Every write step is
> CAS-guarded, on-disk-backed-up, audited (`AuditLog`), and reversible.

This rollout replaces the global SOLO_LANDING design with the Kajabi-faithful
Custom HTML block (`docs/specs/master-class-landing-kajabi.html`) in two guarded,
ordered moves:

1. **Script 1** — `scripts/update-solo-landing-template.ts` — CAS-updates the single
   global `PageTemplate.customHtml` to the new artifact. Affects ALL workshops
   approved AFTER this point (auto-build reads the template).
2. **Script 2** — `scripts/backfill-solo-landing-kajabi.ts` — re-renders the new
   artifact per-workshop and rewrites the EXISTING per-workshop
   `LandingPage.customHtml` snapshots that are still on the old global design.

Both scripts run from `src/`. Dry-run is the default; writes require
`--apply --i-know-this-is-prod` (the safe-seed prod guard). `OPERATOR_EMAIL`
(falls back to `ADMIN_EMAIL`, then `SYSTEM`) is stamped into each `AuditLog` row.

---

## Why a backfill at all (the targeting fact)

`LandingPage.customHtml` is the **interpolated per-workshop snapshot** captured at
auto-build time — it is NOT a live read of the template. Updating the template
(Script 1) does **nothing** to pages that were already built. So the backfill
(Script 2) must re-render the page per workshop and rewrite the snapshot.

The backfill targets a row **only** when its current `customHtml` byte-for-byte
equals the BACKED-UP OLD template re-rendered for THAT workshop (same two-pass
auto-build pipeline + strict sanitize). A mismatch ⇒ bespoke / category-scoped /
hand-edited ⇒ **skipped, never clobbered**. It never gates on a shared raw-template
hash (which would match nothing).

---

## Preconditions

- [ ] Guard tests green: `npm run test -- sanitize-custom-html interpolate-content-html workshop-slug-custom-html solo-landing-kajabi --passWithNoTests`
- [ ] Build gate clean: `CI=true npx next build --turbopack`
- [ ] Playwright render verification of the new artifact passed (desktop + mobile; fonts/icons; no global leak) — Task 5.
- [ ] A complete prod snapshot taken: `npm run snapshot:prod` (belt-and-suspenders on top of Neon PITR).
- [ ] `APP_URL` in the prod env points at the production host (the CTA preflight derives the expected host from it).
- [ ] Decide the canary slug (the Martin Segnitz page) and have it handy.

---

## Step 1 — Template update (Script 1)

### 1a. Dry-run (no write, no prod flag needed)
```bash
cd src
npx tsx scripts/update-solo-landing-template.ts
```
Confirm: exactly one global SOLO_LANDING template is found, the artifact sanitizes
with `didStripContent=false`, and the printed `oldSha`/`newSha`/`oldUpdatedAt`.

### 1b. Apply (CAS + backup + audit)
```bash
npx tsx scripts/update-solo-landing-template.ts --apply --i-know-this-is-prod
# Optionally pin the CAS expectation captured in 1a:
#   --expected-sha <oldSha> --expected-updated-at <oldUpdatedAt ISO>
```
On success it prints **`NEW_GLOBAL_SHA`** and the **backup path**
(`src/.snapshots/solo-landing-template-update-<ISO>.json`).
**Record both** — the backfill consumes that backup, and the backup carries
`NEW_GLOBAL_SHA` for the rollout-window inventory.

> Rollout-window note (Task 10): between 1b and the backfill, any newly-approved
> workshop auto-builds with the NEW design but is NOT in any backfill backup.
> Prefer a brief approval freeze, or run the full backfill promptly after 1b.
> The inventory step (below) finds these post-patch pages.

---

## Step 2 — Backfill (Script 2)

Always pass `--old-template-backup` (the Script 1 backup) so targeting compares
against the exact old template bytes; the new value comes from the explicit
artifact (`--new-template`, default `docs/specs/master-class-landing-kajabi.html`).

### 2a. Full dry-run inventory
```bash
npx tsx scripts/backfill-solo-landing-kajabi.ts \
  --old-template-backup .snapshots/solo-landing-template-update-<ISO>.json
```
Review the per-row report + summary (`N candidates — T target, K no-op, S skip`) and
the persisted JSON report under `src/.snapshots/solo-landing-kajabi-report-dry-run-*.json`.
Inspect every SKIP reason (`bespoke-or-category-scoped`, `missing-coach-photo`,
`cta-preflight-failed`, `price-preflight-failed`, `new-value-invalid`,
`source-template-mismatch`). **Note the TARGET count `T`** — you assert it on apply.

### 2b. Canary apply (one slug)
```bash
# dry-run the canary first
npx tsx scripts/backfill-solo-landing-kajabi.ts \
  --old-template-backup .snapshots/solo-landing-template-update-<ISO>.json \
  --slug <martin-segnitz-slug>
# then apply it (expect-count must equal the canary target count, normally 1)
npx tsx scripts/backfill-solo-landing-kajabi.ts \
  --old-template-backup .snapshots/solo-landing-template-update-<ISO>.json \
  --slug <martin-segnitz-slug> --expect-count 1 --apply --i-know-this-is-prod
```
**Smoke check the canary** (see Monitoring) before going wider.

### 2c. Cohort apply (batch)
```bash
npx tsx scripts/backfill-solo-landing-kajabi.ts \
  --old-template-backup .snapshots/solo-landing-template-update-<ISO>.json \
  --limit 10 --expect-count <cohort-target-count> --apply --i-know-this-is-prod
```
`--limit` caps the candidate scan; re-run dry-run with the same `--limit` first to
read off the cohort target count for `--expect-count`. Smoke-check between batches.

### 2d. Full apply
```bash
# re-confirm the full target count with a fresh dry-run, then:
npx tsx scripts/backfill-solo-landing-kajabi.ts \
  --old-template-backup .snapshots/solo-landing-template-update-<ISO>.json \
  --expect-count <T> --apply --i-know-this-is-prod
```
`--apply` aborts unless `--expect-count` exactly equals the live TARGET count (a
drift means the targeting changed under you — investigate, do not force).
Per-workshop price exceptions: `--allow-price <workshopId>` (repeatable).

Each apply writes a backup (`solo-landing-kajabi-backfill-<ISO>.json`, carries
`oldGlobalTemplateId` + `newGlobalSha`), a JSON report, an `AuditLog`
`SOLO_LANDING_BACKFILL_APPLY` row (updated/skipped IDs + targeting-skip reasons),
and CAS-writes each row (`where id + updatedAt`; a concurrent edit is skipped, not
clobbered).

---

## Monitoring / smoke checks (between every batch)

For each touched slug, load `https://<APP_URL>/workshop/<slug>` and confirm:
- [ ] Renders the NEW look (Kajabi hero, four-color stripe, coach photo present).
- [ ] `h1` font is "Fira Sans" (fonts load via `@import` under prod CSP).
- [ ] CSS hero icons draw; hero grid collapses to one column on mobile (≤760px).
- [ ] **Register button** resolves to the correct PUBLISHED registration page
      (absolute https, prod host, right workshop) — NOT a relative/staging/404 URL.
- [ ] Price shows a real amount (no `TBD`/`Free` unless intended via `--allow-price`).
- [ ] No coach-photo broken-image icon.
- [ ] No global style leak into app/admin chrome.

Synthetic check: `--inventory` lists every SOLO_LANDING slug + current SHA so you
can confirm post-patch pages and spot any row still on an unexpected hash.
```bash
npx tsx scripts/backfill-solo-landing-kajabi.ts --inventory
```

---

## Rollback (idempotent, CAS-guarded)

Roll back in REVERSE order. Each restore is CAS-guarded so it never clobbers a
legitimate later edit, and is audited.

### R1 — Restore the backfilled rows
```bash
npx tsx scripts/backfill-solo-landing-kajabi.ts \
  --restore .snapshots/solo-landing-kajabi-backfill-<ISO>.json --i-know-this-is-prod
```
Restores each row whose current value still hashes to the `newSha` we wrote; rows
edited since are skipped (reported). Run once per apply backup if you applied in
batches (newest first).

### R2 — Restore the global template
```bash
npx tsx scripts/update-solo-landing-template.ts \
  --restore .snapshots/solo-landing-template-update-<ISO>.json --i-know-this-is-prod
```
CAS-restores the pre-update template `customHtml` (only if live still equals
`NEW_GLOBAL_SHA`).

### R3 — Verify no target row remains on the rolled-back design
```bash
npx tsx scripts/backfill-solo-landing-kajabi.ts --inventory
```
Confirm no SOLO_LANDING page still carries a NEW-design render. For any post-patch
page that auto-built with the new design and is NOT in a backfill backup (the
rollout-window case), re-publish it via the normal auto-build/landing-page path or
hand-restore using the inventory SHA as the diff reference.

Last resort: Neon PITR or `npm run restore:from-snapshot <snapshotFile>` per
`docs/runbooks/database-protection.md`.

---

## Owner / sign-off checkpoints

| Step | Gate | Owner |
|------|------|-------|
| Preconditions | tests + build + Playwright + snapshot all green | CAIO |
| 1b template apply | go-ahead recorded; `NEW_GLOBAL_SHA` + backup path captured | CAIO + ticket |
| 2b canary apply | canary smoke check passed | CAIO |
| 2c cohort apply | each batch smoke-checked | CAIO |
| 2d full apply | `--expect-count` matches the fresh dry-run target count | CAIO + ticket |
| Rollback | any smoke failure → R1→R2→R3 immediately | CAIO |
