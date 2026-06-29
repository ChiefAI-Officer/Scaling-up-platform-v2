# Wave J — SU-Full Group Report: Ops Runbook

**Feature:** SU-Full scored group report + Peers benchmark (Wave J / J-3 + J-2)  
**ADR:** ADR-0015 (suppress SU-Full tier band; standing = peer-deviation)  
**Design:** `docs/specs/v7.6/18j-wave-j-su-full-design.md`  
**Branch merged as DARK:** `feat/wave-j-su-full-group-report` → `main`

---

## Scope

This runbook covers the **group-report-only** launch surface. It does NOT cover:

- Per-respondent SU-Full report (unchanged)
- SU-Full campaign wizard / public quiz / submission (controlled by `publishedAt` and Jeff's content sign-off — see §5 Launch)
- LVA group report (separate flags; blast radius = none — see §3 Gates)
- Appendix B per-member detail, per-question Peers, benchmark DB editor (all deferred)

---

## 1. Enforced Dark Gates

Three independent gates must ALL pass before any group report renders for SU-Full. All three are enforced in code; failing any one returns `notApplicable` or `notEnabled` (silent 404):

| Gate | What it checks | Test file |
|------|---------------|-----------|
| **G1 — Feature flag** | `WAVE_J_SUFULL_GROUP_ENABLED=1` (or canary hit), AND `WAVE_J_SUFULL_GROUP_KILL` is not set | `wave-f-flags.test.ts` — "SU-Full independent flag" describe block |
| **G2 — Publish guard** | `version.publishedAt IS NOT NULL` for the SU-Full template version backing the campaign | `group-report.loader.test.ts` — "DRAFT SU-Full → notApplicable … even with WAVE_J on" |
| **G3 — Alias allowlist** | Campaign template alias is in `GROUP_REPORT_ALIASES` (`wave-f-flags.ts`) | `wave-f-flags.test.ts` — "allowlist is exactly LVA + SU-Full" |

**All three gates apply to both the loader path and the direct route** — the route's `classify()` maps `notEnabled` to a silent 404 (no audit), and `notApplicable` to the unpublished panel (no audit).

---

## 2. Flag Reference

| Env var | Purpose | Default |
|---------|---------|---------|
| `WAVE_J_SUFULL_GROUP_ENABLED` | Global on-switch for SU-Full group report | OFF (`""` / unset) |
| `WAVE_J_SUFULL_GROUP_CANARY` | Comma-separated campaign IDs to canary (campaign-id-only — see §6) | unset |
| `WAVE_J_SUFULL_GROUP_KILL` | Kill switch — overrides BOTH global and canary | unset |

**Kill precedence:** `WAVE_J_SUFULL_GROUP_KILL=1` beats any value of `_ENABLED` or `_CANARY`. A stale canary entry does NOT bypass the kill switch. Tests: `wave-f-flags.test.ts` — "kill precedence" assertion.

**LVA independence:** `WAVE_J_SUFULL_GROUP_KILL` has no effect on LVA. LVA is controlled exclusively by `WAVE_F_GROUP_REPORT_ENABLED` / `WAVE_F_GROUP_REPORT_CANARY`. Tests: "WAVE_J_SUFULL_GROUP_KILL does not affect LVA".

---

## 3. Launch Order

> Publishing SU-Full is a SEPARATE, BROADER step that also enables the campaign wizard, public quiz, and submission. The `WAVE_J` flag is the group-report-specific control only.

### Prerequisites (Jeff-gated)

1. Jeff signs off on SU-Full content (question wording, scoring config, benchmark values).
2. Operator runs `npx tsx prisma/safe-seed.mjs` (if a content-version update is needed) and **publishes** the SU-Full template version via the admin UI — setting `version.publishedAt`.
3. Verify the broader surfaces are stable post-publish:
   - Coach campaign wizard now offers SU-Full — confirm with a test coach account.
   - Public quiz (`/quiz/scaling-up-full`) is reachable and submittable.
   - Per-respondent report renders for a completed SU-Full submission.
4. Run the synthetic alert smoke (see §7 Observability) — **no canary until the smoke passes**.

### Group-report launch (flag flip)

5. Set `WAVE_J_SUFULL_GROUP_CANARY=<campaign-id>` for a single pilot campaign (≤25 completed members — run the preflight query in §6 first).
6. Redeploy on Vercel (`vercel --prod`).
7. Monitor for 15 minutes: check observability dashboard (§7) and log-drain alerts.
8. If clean, set `WAVE_J_SUFULL_GROUP_ENABLED=1` and clear `_CANARY`. Redeploy.
9. Monitor for 1 hour before calling the launch complete.

**Pre-deploy env preflight (before step 6):** Verify production Vercel env does NOT already have `WAVE_J_SUFULL_GROUP_ENABLED` / `_CANARY` / `_KILL` set unexpectedly (dark-merge safety). Use `vercel env ls --environment=production | grep WAVE_J` to confirm.

---

## 4. Kill Switch

### L1 — Group-report-only kill (SU-Full assessment stays live)

Fastest path during an active incident:

1. Set `WAVE_J_SUFULL_GROUP_KILL=1` on Vercel Production. Redeploy.
2. Effect: every SU-Full group-report request returns `notEnabled` → silent 404. No audit. The assessment itself (wizard / quiz / per-respondent report) is unaffected.

Or for instant kill with no rebuild:

1. **Vercel → Deployments → promote the pinned pre-Wave-J deployment** (see §5 Rollback). This is instant (no rebuild). Verify: entry point and direct route are dark (see §5 post-rollback smoke).

**L1 does NOT unpublish SU-Full.** The assessment version remains published. Coaches can still run campaigns; participants can still submit; per-respondent reports still render.

### L2 — Full assessment rollback (remove SU-Full from production)

This is a heavier, Jeff-gated decision:

1. Confirm with Jeff that unpublishing SU-Full is warranted.
2. Via admin UI or `prisma` console: set `publishedAt = NULL` on the SU-Full template version (unpublish/deactivate).
3. Run smoke suite:
   - Coach wizard no longer offers SU-Full (verify with a test coach account).
   - Public quiz (`/quiz/scaling-up-full`) returns 404 or "not available".
   - Submit endpoint returns an error for a SU-Full campaign.
   - Group-report entry point and direct route both return dark (no group report rendered).
4. Clear all `WAVE_J_*` env vars. Redeploy.

---

## 5. Rollback

### Pinned rollback target

Before launching (at step 5 of §3), **record the deployment ID of the last known-good pre-Wave-J / pre-alias deployment:**

```bash
vercel ls --prod 2>&1 | head -10
# Record the deployment ID from the line BEFORE the Wave J deploy.
# Example: prj_abc123xyz — store in a ops note / Notion task.
```

### Promote-previous (instant — no rebuild)

```bash
vercel promote <pinned-deployment-id> --prod
```

### Post-rollback smoke (required before declaring rollback complete)

After promoting, verify:

1. **Code version check:** the deployment shows the pre-Wave-J commit SHA (check Vercel deployment detail).
2. **Entry point dark:** navigate to `/assessments/<any-SU-Full-campaign-id>` as admin — the group report link must NOT appear.
3. **Direct route dark:** `curl -s -o /dev/null -w "%{http_code}" https://scaling-up-platform-v2.vercel.app/assessments/<id>/report` with a valid admin session — must return 404 (silent, no error panel).
4. **LVA unaffected:** navigate to an LVA campaign's group report — it must still render (LVA uses `WAVE_F_GROUP_REPORT_ENABLED`, not `WAVE_J_*`).

### Post-rollback env cleanup

After rollback is declared complete:

1. Run `vercel env ls --environment=production | grep WAVE_J` — remove all `WAVE_J_*` vars.
2. Verify `WAVE_F_GROUP_REPORT_ENABLED` / `_CANARY` are intact (should be unaffected; confirm).
3. Redeploy (to pick up the env cleanup if you set `_KILL` as an L1 step).
4. Re-run the post-rollback smoke above.
5. A future relaunch starts from a clean env state.

---

## 6. Canary

### Campaign-id-only scope

The SU-Full canary is **campaign-id-only** — it does NOT accept coach ID, org ID, or `createdByCoachId`. This prevents accidentally exposing many campaigns through a broad org canary.

Tests: `wave-f-flags.test.ts` — "SU-Full canary: coach id does NOT match", "org id does NOT match", "createdByCoachId does NOT match".

### Pre-canary preflight query (≤25-member cap)

Before adding a campaign ID to `WAVE_J_SUFULL_GROUP_CANARY`, run this preflight query to confirm the cohort is ≤25 completed members:

```sql
SELECT COUNT(*) AS completed_count
FROM "AssessmentSubmission" s
JOIN "AssessmentCampaign" c ON s."campaignId" = c."id"
WHERE c."id" = '<campaign-id>'
  AND s."completedAt" IS NOT NULL
  AND s."deletedAt" IS NULL;
```

If `completed_count > 25`, do NOT add this campaign to the canary — select a smaller cohort.

### Canary growth guard

The ≤25-member preflight is point-in-time. A canaried campaign can grow after the preflight. The loader emits a `capacityOverBudget=true` metric flag when a SU-Full group report renders with `completed-members > 25`. Alert on this flag (see §7).

### Setting the canary

```bash
vercel env set WAVE_J_SUFULL_GROUP_CANARY "<campaign-id>" production
vercel --prod  # redeploy to pick up the new value
```

To expand to multiple campaigns:

```bash
vercel env set WAVE_J_SUFULL_GROUP_CANARY "<campaign-id-1>,<campaign-id-2>" production
vercel --prod
```

---

## 7. Observability

> The source of truth for SU-Full group report health is **tested log-drain alert queries**, NOT the `/admin/observability` DB-count panel (which counts `GROUP_REPORT_VIEW` rows but has no latency, failure, or mismatch signal).

### Required alert smokes (gate the canary)

Before enabling the canary (§3 step 4), run a synthetic smoke to prove each alert actually fires. Use a test SU-Full campaign with a known-good group report. Trigger each condition manually and confirm the alert fires within the drain window.

### Log-drain alert queries

All queries filter on `template="scaling-up-full"` (low-cardinality, indexed) to avoid cross-assessment noise.

#### A. View latency p95

```
filter template="scaling-up-full" AND action="GROUP_REPORT_VIEW" AND status="ok"
| stats p95(latencyMs) AS p95_latency BY bin(5m)
| alert when p95_latency > 3000
```

**Threshold:** p95 > 3000ms. Owner: on-call engineer. Synthetic smoke: trigger 10 rapid views from a test session; confirm p95 appears in the query output within 5 min.

#### B. Render or audit failures

```
filter template="scaling-up-full" AND action="GROUP_REPORT_VIEW" AND status="error"
| stats count() AS failure_count BY bin(5m)
| alert when failure_count > 0
```

**Threshold:** any failure. Owner: on-call engineer. Synthetic smoke: force a render failure (e.g., temporarily corrupt the benchmark version string in a test env) and confirm an alert fires.

#### C. not_applicable by reason

```
filter template="scaling-up-full" AND metric_name="not_applicable"
| stats count() BY reason, bin(10m)
| alert when count(reason="unpublished") > 5
```

**Threshold:** >5 `unpublished` events in 10 min (signals SU-Full was unexpectedly unpublished or the publish gate is misfiring). Owner: on-call engineer. Synthetic smoke: unpublish the SU-Full version in a test env and trigger 6 group-report requests; confirm the alert fires.

#### D. benchmarkKeyMismatch

```
filter template="scaling-up-full" AND action="GROUP_REPORT_VIEW" AND benchmarkKeyMismatch=true
| stats count() AS mismatch_count BY bin(5m)
| alert when mismatch_count > 0
```

**Threshold:** any mismatch (launch-blocking — see below). Owner: engineering lead. Synthetic smoke: add a dummy key to `SU_FULL_BENCHMARK_KEYS` in a test env and trigger a group-report view; confirm the alert fires.

#### E. Canary capacity growth (capacityOverBudget)

```
filter template="scaling-up-full" AND capacityOverBudget=true
| stats count() AS over_budget BY bin(10m)
| alert when over_budget > 0
```

**Threshold:** any event. Owner: on-call engineer. Synthetic smoke: add a campaign with >25 completions to a test env and trigger a view; confirm the alert fires.

### benchmarkKeyMismatch=true is LAUNCH-BLOCKING

If the `benchmarkKeyMismatch` alert fires during canary or post-launch:

1. **Do NOT expand canary / Do NOT launch global flag** until resolved.
2. Set `WAVE_J_SUFULL_GROUP_KILL=1` immediately.
3. Investigate: a `true` mismatch means the SU-Full seed's domain/section key set has diverged from `su-full-benchmarks.ts`. The Peers column is already hidden on the rendered report (fail-closed render), but the mismatch is a data-quality signal.
4. Fix: update `su-full-benchmarks.ts` (bump `SU_FULL_BENCHMARKS_VERSION`), pass the benchmark key-integrity test (`su-full-benchmarks.test.ts` — "benchmark domain keys exactly match seed"), and redeploy.
5. Clear the kill switch and re-canary.

---

## 8. Pre-deploy Checks (Dark-merge Safety)

Run before every merge of the alias change (Task 3 gate):

```bash
# Confirm WAVE_J_* is not unexpectedly set in production Vercel env.
vercel env ls --environment=production | grep WAVE_J
# Expected: no output. If any WAVE_J_* var appears, investigate before merging.

# Confirm GROUP_REPORT_ALIASES includes scaling-up-full (source of truth).
grep "GROUP_REPORT_ALIASES" src/src/lib/assessments/wave-f-flags.ts
# Expected: "leadership-vision-alignment", "scaling-up-full"

# Confirm SU-Full is still DRAFT (publishedAt IS NULL) in production DB:
# (run via Neon console or prisma studio)
# SELECT "publishedAt" FROM "AssessmentTemplateVersion" v
#   JOIN "AssessmentTemplate" t ON v."templateId" = t."id"
# WHERE t."alias" = 'scaling-up-full'
# ORDER BY v."createdAt" DESC LIMIT 1;
# Expected: publishedAt = NULL
```

---

## 9. Two-Level Rollback Summary

| Level | Trigger | Action | Effect |
|-------|---------|--------|--------|
| **L1 — Group-report only** | Group report is broken, assessment is healthy | Set `WAVE_J_SUFULL_GROUP_KILL=1` + redeploy, OR promote pinned pre-Wave-J deployment | No group report renders; SU-Full wizard/quiz/submit/per-respondent all unaffected |
| **L2 — Full assessment** | SU-Full itself is causing harm (wizard/quiz/submit/report) | Jeff approval → unpublish SU-Full version → smoke all surfaces | Group report + campaign creation + quiz + submit all gone; LVA unaffected |

L1 does NOT perform L2. L2 requires a separate, deliberate operator+Jeff action.

---

## 10. Capacity Budget

Design targets (from Task 8 spec): model build < 500ms, render < 1s.  
CI test budget: `< 1500ms` (3× multiplier for slow runners) — see `group-report-capacity.test.ts`.  
Actual measured: **~15ms** for a 41-person cohort (1 CEO + 40 members) on the dev runner.

Leadership teams are inherently small. The loader has no hard runtime cap (consistent with LVA). The `capacityOverBudget` metric flag (alert E above) provides visibility if unexpectedly large cohorts appear.

---

_Last updated: 2026-06-29 — Wave J Task 8 (dark, no flag flip)_
