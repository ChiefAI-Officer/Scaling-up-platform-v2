# SunHub v7 Production Successor Cutover Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This is a guarded Production operation; do not delegate or improvise write commands.

**Goal:** Move the existing `sunhub-quick-quiz` public URL from v1 to a deterministic v7 successor so new individual reports receive the authored Preface and Closing/CTA while preserving every historical v1 submission and report.

**Architecture:** Reuse the shipped successor operation from PR #405. Quiesce the source with compare-and-swap, drain for at least 15 minutes, then atomically retire its alias and create a zero-history v7 successor under the live alias. Never repin the existing Campaign or load the latest Template Version at report-render time.

**Tech Stack:** TypeScript CLI, Prisma/PostgreSQL serializable transaction, Vercel/Next.js Production deployment, curl.

**Spec:** `docs/superpowers/specs/2026-09-01-all-public-presentation-design.md`

**Command working directory:** `/Users/diushianstand/Scaling-up-platform-v2/src` after the Welcome code PR is merged and its exact Production deployment is Ready.

## Immutable Identities and Safety Boundary

- Source Campaign: `cmsm0jlxo0002lvi3lvb8u2gy`, v1 `cmsm0efu30005dlwfucrosxdm`.
- Target Template Version: v7 `cmtd124fz000413xies2p6bh8`.
- Live alias: `sunhub-quick-quiz`; retired alias: `sunhub-quick-quiz-retired-v1`.
- Deterministic successor id: `item7-sunhub-quick-quiz-v7-successor`.
- Every write uses exact values printed by the immediately preceding operator-bearing dry-run: database host, source `updatedAt`, and submission count.
- The user approved temporary closure and the mandatory 15-minute drain on September 1, 2026.
- Do not create a synthetic Production submission. Jeff or the user performs final respondent acceptance.

---

### Task 1: Re-verify the shipped operation before Production writes

**Files (test/read only):**
- `src/scripts/promote-sunhub-quick-quiz.ts`
- `src/src/lib/scripts/promote-sunhub-quick-quiz-core.ts`
- `src/src/lib/scripts/promote-sunhub-quick-quiz-runner.ts`
- `src/src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts`

- [ ] **Step 1: Run the successor-operation suite**

Run: `npx jest src/__tests__/scripts/promote-sunhub-quick-quiz.test.ts --runInBand`

Expected: all dry-run, authorization, quiesce, drain, apply, idempotency, provenance, and zero-relation tests pass.

- [ ] **Step 2: Confirm the deployed application is the merged Welcome release**

Resolve the merge SHA, wait for the Vercel deployment to be Ready, and verify `/api/health` on the exact deployment, `scaling-up-platform-v2.vercel.app`, and `platformtest.scalingup.com`. Do not quiesce while an older build is serving.

### Task 2: Quiesce v1 using only fresh emitted values

- [ ] **Step 1: Run an operator-bearing dry-run**

Run the existing CLI with the Production env file and the real operator identity. Save its complete source/target manifest and emitted quiesce command. Confirm source is ACTIVE, owns `sunhub-quick-quiz`, remains pinned to v1, target is published Active v7, and retired alias/successor are unoccupied.

- [ ] **Step 2: Execute exactly the emitted quiesce command**

Do not hand-edit host, timestamp, count, operator, or identifiers. The command must include `--quiesce`, `--i-know-this-is-prod`, exact host, exact source `updatedAt`, and exact submission count. Any drift aborts without mutation.

- [ ] **Step 3: Verify the quiescence receipt**

Run a fresh dry-run. Confirm the source is CLOSED, still owns the public alias, historical counts are unchanged, and the `PUBLIC_CAMPAIGN_SUCCESSOR_QUIESCE` receipt exists. Record the exact quiesced timestamp.

### Task 3: Drain and atomically apply the successor

- [ ] **Step 1: Wait at least 15 minutes from the durable quiesce time**

Do not use the local command start time. During the drain, the public quiz is intentionally closed; monitor only read-only health and state.

- [ ] **Step 2: Run a fresh operator-bearing dry-run after the drain**

Use newly reported `updatedAt` and submission count. Confirm the drain is eligible and the CLI emits an apply command. If any invariant or count changed, stop and diagnose rather than reusing old values.

- [ ] **Step 3: Execute exactly the emitted apply command**

The transaction must rename/retire v1 and create the deterministic v7 successor under `sunhub-quick-quiz`. Do not mutate source `versionId`, submissions, participants, invitations, reports, delivery state, or import provenance.

### Task 4: Verify Production provenance and presentation

- [ ] **Step 1: Verify complete manifests and idempotency**

Run a post-apply dry-run. Confirm source v1 is retired under `sunhub-quick-quiz-retired-v1`, retains all historical relations, successor is ACTIVE at `sunhub-quick-quiz`, is pinned to v7, begins with zero inherited relations, and the promotion receipt matches the deterministic manifest. Re-running apply in inspection mode must report idempotent completion without writes.

- [ ] **Step 2: Verify route and report inputs**

Confirm `/quiz/sunhub-quick-quiz` returns HTTP 200 and resolves the successor. Verify v7's safe loaded `introductionHtml` and `conclusionHtml` are present at the supported individual browser/print report seam. Do not claim group/aggregate/email custom HTML support.

- [ ] **Step 3: Verify health on exact and canonical deployments**

Check HTTP 200, database `healthy`, and auth posture `safe` on the exact deployment and both canonical aliases.

- [ ] **Step 4: Record the Production receipt**

Update `CLAUDE.md`, prepend `plans/CHANGELOG.md`, and amend the implementation plan/spec status with deployment id/SHA, quiesce and apply receipts, before/after counts, health responses, and exact non-goals. Ship documentation through a protected-branch PR.

- [ ] **Step 5: Hand off manual acceptance**

Give Jeff/the user the existing public URL and concise steps to verify the stored Welcome screen, complete a new v7 response, and inspect its individual browser/print report for Preface and Closing/CTA. State explicitly that historical v1 reports intentionally remain unchanged.
