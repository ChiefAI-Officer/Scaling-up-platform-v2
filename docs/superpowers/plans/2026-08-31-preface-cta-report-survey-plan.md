# Preface and CTA Report Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Jeff Phase 1 item 7 by retaining the tested 24-line Closing expansion and adding a guarded successor-campaign operation that preserves v1 history while serving authored v7 Preface/Closing content at the existing mini-quiz URL.

**Architecture:** Keep Campaign→Template Version immutability unchanged. A one-off dry-run-default CLI delegates to a pure planner and an injected database runner. A guarded quiesce closes v1 and starts a mandatory 15-minute drain; a later serializable apply revalidates all invariants, transfers the alias, creates a deterministic v7 successor, and writes an audit receipt. No write operation is executed during implementation.

**Tech Stack:** TypeScript, Prisma/PostgreSQL transactions, Jest, existing safe-seed Production guard, Next.js report renderer, Playwright/Chromium, Poppler.

**Spec:** `docs/superpowers/specs/2026-08-31-preface-cta-report-survey-design.md`

**Command working directory:** Run Node, Jest, ESLint, migration-safety, and build commands from the app root, `src/`. File paths in each task are repository-root-relative.

## Global Constraints

- Exact source campaign: `cmsm0jlxo0002lvi3lvb8u2gy`, alias `sunhub-quick-quiz`, version `cmsm0efu30005dlwfucrosxdm` (v1).
- Exact target Template Version: `cmtd124fz000413xies2p6bh8` (v7).
- Retired source alias: `sunhub-quick-quiz-retired-v1`; successor keeps `sunhub-quick-quiz`.
- Deterministic successor id: `item7-sunhub-quick-quiz-v7-successor`.
- Writes require exactly one of `--quiesce`/`--apply`, `--i-know-this-is-prod`, exact database host, source `updatedAt`, and submission count.
- Apply additionally requires v1 to have remained CLOSED for at least 15 minutes.
- Questions, sections, scoring, Template, and language must match; the Template must be enabled, undeleted, and `PUBLIC_MARKETING_QUIZ`; the source must be published; v7 must be published, non-archived, the latest Active version, and pass the real safe loader for Introduction and Closing.
- Existing Campaign version ids and existing submissions are never mutated.
- No environment variable, feature flag, schema, migration, report-loader fallback, email/group authoring, merge, deployment, or Production operation.

---

### Task 1: Pure successor plan and invariant failures

**Files:**
- Create: `src/src/lib/scripts/promote-sunhub-quick-quiz-core.ts`
- Test: `src/src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts`

**Interfaces:**
- Produces: `parsePromotionArgs(argv: string[]): PromotionArgs`.
- Produces: `buildPromotionPlan(input: PromotionInput): PromotionPlan`.
- Produces: `validateWriteAuthorization(args, actualDatabaseHost): void`.
- Produces constants `SOURCE_CAMPAIGN_ID`, `SOURCE_VERSION_ID`, `TARGET_VERSION_ID`, `LIVE_ALIAS`, and `RETIRED_ALIAS`.
- `PromotionInput` contains source campaign, source/target versions including lifecycle state, latest published non-archived version id, retired-alias occupancy, and expected CAS values.

- [x] **Step 1: Write failing pure tests**

Cover default dry-run argument parsing; mutually exclusive complete quiesce/apply arguments; missing/malformed expected values; exact happy-path plans; wrong campaign/version/template/language/status/access mode; deleted/disabled/wrong-delivery Template; occupied retired alias; target not latest/published; unsafe or missing Introduction/Closing; mismatched questions/sections/scoring; stale `updatedAt`; submission-count drift; and apply before the 15-minute drain expires.

- [x] **Step 2: Run the pure tests and verify RED**

Run: `npx jest src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts --runInBand`

Expected: FAIL because the core module does not exist.

- [x] **Step 3: Implement the pure planner**

Compare stored JSON payloads with the existing `stableCanonicalJson` helper; do not add a second canonicalization or content-hash scheme. Return a schema-versioned manifest containing exact source/target identity, deterministic successor id, copied successor fields, expected CAS values, and audit payload; throw field-specific `PromotionInvariantError` messages for every failed guard.

- [x] **Step 4: Run the pure tests and verify GREEN**

Run: `npx jest src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts --runInBand`

Expected: all pure planner tests pass.

- [x] **Step 5: Commit the pure plan seam**

```bash
git add src/src/lib/scripts/promote-sunhub-quick-quiz-core.ts src/src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts
git commit -m "feat(assessments): plan mini quiz successor safely"
```

### Task 2: Transactional apply and idempotency

**Files:**
- Create: `src/src/lib/scripts/promote-sunhub-quick-quiz-runner.ts`
- Modify: `src/src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts`

**Interfaces:**
- Consumes: `PromotionPlan` from Task 1.
- Produces: `loadPromotionInput(db, expected): Promise<PromotionInput>`.
- Produces: `quiescePromotion(db, plan, operator): Promise<{ status: "quiesced" | "idempotent" }>`.
- Produces: `applyPromotion(db, plan, operator, databaseJsonNull): Promise<{ status: "applied" | "idempotent"; successorCampaignId: string }>`; the Prisma database-NULL sentinel is dependency-injected only at the runner create seam.
- `DbClient` is a narrow injected Prisma-compatible interface for unit tests.

- [x] **Step 1: Write failing runner tests**

Require dry-run loading to perform no writes; quiesce to CAS ACTIVE→CLOSED without changing the alias and write a quiescence receipt; apply to use one serializable transaction and re-read every invariant inside it; source alias CAS to match exact id/version/status/deletedAt/updatedAt/count; successor to use the deterministic id, copy only approved fields, and pin v7; promotion AuditLog to be created in the transaction; CAS count zero to abort; and the complete deterministic source/successor/receipt manifest to return idempotent success without writes.

- [x] **Step 2: Run the runner tests and verify RED**

Run: `npx jest src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts --runInBand`

Expected: FAIL because runner exports do not exist.

- [x] **Step 3: Implement transactional apply**

Use the injected `$transaction` seam. Quiesce uses one exact `updateMany` plus `PUBLIC_CAMPAIGN_SUCCESSOR_QUIESCE` receipt. Apply runs at `Serializable`, reloads the locked logical state, repeats the pure invariant checks, performs exact source alias CAS, creates the deterministic successor from the allow-list, and creates `PUBLIC_CAMPAIGN_SUCCESSOR_PROMOTION`. Do not mutate or copy submissions, participants, invitations, summary reports, lease timestamps, or import provenance.

- [x] **Step 4: Run runner and pure tests and verify GREEN**

Run: `npx jest src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts --runInBand`

Expected: all tests pass.

- [x] **Step 5: Commit the transactional seam**

```bash
git add src/src/lib/scripts/promote-sunhub-quick-quiz-runner.ts src/src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts
git commit -m "feat(assessments): apply mini quiz successor atomically"
```

### Task 3: Guarded CLI and read-only dry run

**Files:**
- Create: `src/scripts/promote-sunhub-quick-quiz.ts`
- Modify: `src/src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts`

**Interfaces:**
- Consumes: `parsePromotionArgs`, `buildPromotionPlan`, `validateWriteAuthorization`, `loadPromotionInput`, `quiescePromotion`, and `applyPromotion`.
- Produces: operator command `npx tsx scripts/promote-sunhub-quick-quiz.ts [apply arguments]`.

- [x] **Step 1: Write failing CLI-policy tests**

Assert dry-run is the default; quiesce/apply without expected host/timestamp/count fails parsing; every write without `--i-know-this-is-prod` is blocked; host mismatch is blocked independent of provider; dry-run never invokes a write; a no-operator dry-run prints only a shell-safe read-only rerun; a real operator permits a complete quiesce command; quiesced output with less than 15 minutes prints no apply command; and drained output with a real operator includes a complete copy-pastable apply command.

- [x] **Step 2: Run the CLI-policy tests and verify RED**

Run: `npx jest src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts --runInBand`

Expected: FAIL because the CLI seam/output formatter is absent.

- [x] **Step 3: Implement the CLI**

Do not load any env file in application code. The operator must supply credentials explicitly through the runtime command. Connect read-only for dry-run, print the verified plan, and exit. On quiesce/apply, require the unconditional confirmation and exact-host guard before invoking the runner. Keep `main()` behind `require.main === module` and export formatting helpers for tests so CI never connects to a database.

- [x] **Step 4: Run tests and a Production read-only dry-run**

Run tests as above, then:

```bash
npx tsx --env-file=/Users/diushianstand/Scaling-up-platform-v2/src/.env scripts/promote-sunhub-quick-quiz.ts
```

Observed twice: source v1 and target v7 matched, source remained `ACTIVE` at `updatedAt=2026-08-09T16:27:07.375Z`, and the submission count was 14 on both reads. Because no operator identity was supplied, the CLI truthfully printed only the `--dry-run --operator '<REQUIRED_NONBLANK_OPERATOR_IDENTITY>'` rerun instruction—not a write command. No quiesce or apply occurred.

- [x] **Step 5: Commit the guarded CLI**

```bash
git add src/scripts/promote-sunhub-quick-quiz.ts src/src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts
git commit -m "feat(assessments): guard mini quiz successor operation"
```

**Implementation/co-validation receipt:** Tasks 1–3 landed through `8be770fb`.
Review removed invited authoring fields from the successor allow-list, required
complete canonical manifests and ISO timestamps, added persisted `inviteTiming` and
zero-relation completion checks, proved all writes use the callback transaction,
rejected blank operators before connection/transaction creation, shell-quoted every
dynamic command argument, restricted URL hosts, and made completion inspection reuse
the full runner manifest/receipt predicate. Final review additionally translated
nullable copied JSON to injected database-NULL sentinels, aligned target resolution
with the shared published/non-archived Active-version contract, and made durable
completion reconstruct its historical plan from a strict schema-versioned receipt
without rerunning mutable current preflight invariants.

### Task 4: Re-verify report completion and repository gates

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-08-31-preface-cta-report-survey-design.md`
- Modify: `docs/superpowers/plans/2026-08-31-preface-cta-report-survey-plan.md`

**Interfaces:**
- Consumes: all prior tasks and the existing 24-line sanitizer/report tests.
- Produces: final review receipts and the explicitly unexecuted Production checklist.

- [x] **Step 1: Run focused and all-surface tests**

Run the successor-operation suite, sanitizer suite, public quiz result/submit suites, invited report loader, report styles/sections, group report, email report, and the real Chromium/PDF boundary matrix.

Fresh results: successor **74/74**, sanitizer **74/74**, public submit **69/69**,
capture contract **2/2**, and the non-browser surface coverage **9 suites / 258
tests / 2 snapshots** passed. Two report-style tests and all 52 physical matrix
tests stopped before assertions because this host lacks Playwright Chromium
headless-shell revision 1200. Chromium was not installed. The already-recorded
branch receipt remains **52/52** across Scaling Up Full, Classic scored, Classic
qualitative, Executive Boardroom, and Modern Dashboard; it is prior evidence, not a
fresh pass.

- [x] **Step 2: Run repository gates**

Run changed-file ESLint, `node scripts/check-migration-safety.mjs`, `git diff --check`, and `CI=true npm run build`. If the wrapper stops only because the isolated worktree lacks `DIRECT_URL`, do not import credentials; run `CI=true ./node_modules/.bin/next build --turbopack` and rely on hosted Build for the migration-bearing wrapper.

Changed-file ESLint, all **51** migration checks, and fixed-point diff hygiene
passed. The exact wrapper exited 1 solely at missing `DIRECT_URL`; the credential-free
Turbopack command exited 0 after compilation, TypeScript, and **95/95** pages.

- [x] **Step 3: Update source-of-truth documentation**

Record the corrected v5-v7 content chronology, the successor design, dry-run receipt, exact unexecuted apply command, safety boundary, and verification results. Do not claim the live campaign is repaired until a separately authorized apply and smoke test occur.

- [x] **Step 4: Commit documentation and verification receipts**

```bash
git add CLAUDE.md plans/CHANGELOG.md docs/superpowers/specs/2026-08-31-preface-cta-report-survey-design.md docs/superpowers/plans/2026-08-31-preface-cta-report-survey-plan.md
git commit -m "docs: record mini quiz successor operation"
```

- [ ] **Step 5: Complete review and PR update**

Review from the fixed point, remediate actionable findings, rerun affected checks, push the branch, update PR #405, and wait for every hosted check. Keep merge, deployment, feature-flag changes, and Production apply out of scope.

This remains unchecked. The controller owns final whole-branch review, push, PR #405
update, and hosted checks. This documentation task performs none of those operations.
