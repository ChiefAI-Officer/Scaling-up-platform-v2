# Referred Results Coach Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an eligible referring Coach remove garbage public submissions from their own Referred Results collection without erasing the submission or weakening ADMIN/STAFF oversight.

**Architecture:** Add a purpose-specific nullable tombstone to `AssessmentSubmission`, mutate it through one enumeration-safe Coach endpoint backed by an atomic domain transaction, and apply the tombstone only to Coach collection reads. Privileged list and report paths deliberately retain the row. The client uses an explicit native confirmation and reloads server-owned pagination state after success.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 5/PostgreSQL, Zod, Jest, Testing Library, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-30-referred-results-coach-removal-design.md`

## Global Constraints

- Branch/worktree: `codex/387-item-8-delete-referred`, based exactly on fetched `origin/main` commit `f84ad2ed7ce070a314d8bd75ad19254dc36a1544`.
- Do not change or add an environment variable, feature flag, Production record, campaign, response, or email.
- Use `referredResultsDeletedAt`; do not add a generic submission `deletedAt` and do not hard-delete submissions.
- Coach ownership comes only from frozen `referringCoachId`; never authorize from email.
- Missing, foreign-owned, non-Public, deleted-campaign, and already-removed rows all return `404`.
- An ineligible current Coach returns `403`; unauthenticated returns `401`; wrong role returns `403`.
- The mutation rate limiter fails closed and the tombstone plus audit row commit atomically.
- ADMIN/STAFF list and report access must not filter on `referredResultsDeletedAt`.
- Every code task follows RED → GREEN → focused regression → commit.
- Final gates are focused Jest, migration safety, changed-file ESLint, `git diff --check`, and `CI=true npm run build` from `src/`.

## File map

- `src/prisma/schema.prisma` — declares the purpose-specific submission tombstone.
- `src/prisma/migrations/20260830100000_add_referred_results_coach_removal/migration.sql` — additive nullable-column migration.
- `src/src/lib/assessments/referred-results-removal.ts` — pure narrow database contract and atomic owned-removal transaction.
- `src/src/app/api/assessments/referred-results/[submissionId]/route.ts` — HTTP auth, feature gate, validation, strict limiting, response and headers.
- `src/src/lib/assessments/public-referrals.ts` — Coach list/export/report tombstone boundaries.
- `src/src/app/api/assessments/referred-results/route.ts` — filter-option tombstone boundary.
- `src/src/components/assessments/ReferredResultsList.tsx` — confirmation, mutation state, error, and page refresh.
- Existing admin Public Campaign submission route — intentionally unchanged; its regression test pins oversight.
- `CONTEXT.md`, `CLAUDE.md`, `plans/CHANGELOG.md` — domain and implementation source of truth.

---

### Task 1: Add the purpose-specific tombstone

**Files:**
- Create: `src/prisma/migrations/20260830100000_add_referred_results_coach_removal/migration.sql`
- Create: `src/src/__tests__/prisma/referred-results-coach-removal-migration.test.ts`
- Modify: `src/prisma/schema.prisma:1420-1455`

**Interfaces:**
- Produces: `AssessmentSubmission.referredResultsDeletedAt: Date | null` in Prisma and PostgreSQL.
- Consumes: no new runtime interface.

- [x] **Step 1: Write the failing schema/migration test**

```ts
expect(schema).toMatch(
  /^\s*referredResultsDeletedAt\s+DateTime\?\s+\/\/ Coach-collection tombstone/m,
);
expect(sql).toContain(
  'ALTER TABLE "assessment_submissions" ADD COLUMN "referredResultsDeletedAt" TIMESTAMP(3);',
);
expect(sql).not.toMatch(/DELETE|DROP\s+(?:TABLE|COLUMN)|UPDATE\s+/i);
```

- [x] **Step 2: Run the test and verify RED**

Run: `npx jest src/__tests__/prisma/referred-results-coach-removal-migration.test.ts --runInBand`

Expected: FAIL because the schema field and migration file do not exist.

- [x] **Step 3: Add the minimal additive schema and SQL**

```prisma
referredResultsDeletedAt DateTime? // Coach-collection tombstone; ADMIN/STAFF oversight remains intact
```

```sql
ALTER TABLE "assessment_submissions"
  ADD COLUMN "referredResultsDeletedAt" TIMESTAMP(3);
```

- [x] **Step 4: Generate Prisma and verify GREEN**

Run: `npx prisma generate && npx jest src/__tests__/prisma/referred-results-coach-removal-migration.test.ts --runInBand`

Expected: PASS.

- [x] **Step 5: Commit the schema unit**

```bash
git add src/prisma/schema.prisma src/prisma/migrations/20260830100000_add_referred_results_coach_removal src/src/__tests__/prisma/referred-results-coach-removal-migration.test.ts
git commit -m "feat: add referred result removal tombstone"
```

### Task 2: Build the atomic owned-removal mutation

**Files:**
- Create: `src/src/lib/assessments/referred-results-removal.ts`
- Create: `src/src/__tests__/lib/assessments/referred-results-removal.test.ts`
- Create: `src/src/app/api/assessments/referred-results/[submissionId]/route.ts`
- Create: `src/src/__tests__/api/referred-results-delete-route.test.ts`

**Interfaces:**
- Produces: `removeReferredResult(db, actor, submissionId, audit): Promise<"removed" | "forbidden" | "not-found">`.
- Produces: `DELETE /api/assessments/referred-results/[submissionId]` returning private JSON plus strict rate headers.
- Consumes: `ApiActor`, `isCoachCurrentlyCertified`, `checkRateLimitStrict`, the existing Referred Results flag, Prisma transaction methods.

- [x] **Step 1: Write failing domain tests**

Cover an active owner success, inactive Coach `forbidden`, foreign/non-Public/deleted-campaign/already-removed/missing rows as `not-found`, conditional `updateMany`, and audit atomicity. Pin the write shape:

```ts
expect(updateMany).toHaveBeenCalledWith({
  where: {
    id: "sub-1",
    referringCoachId: "coach-1",
    referredResultsDeletedAt: null,
    campaign: { accessMode: "PUBLIC", deletedAt: null },
  },
  data: { referredResultsDeletedAt: now },
});
expect(auditLog.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    entityType: "AssessmentSubmission",
    entityId: "sub-1",
    action: "DELETE",
    performedBy: "coach@example.com",
  }),
});
```

Assert the serialized audit changes contain `referred-results-removal`, `softDelete`, and `requestId`, and do not contain taker identity, answers, results, or referral email.

- [x] **Step 2: Run domain tests and verify RED**

Run: `npx jest src/__tests__/lib/assessments/referred-results-removal.test.ts --runInBand`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the minimal transaction**

Define a narrow database interface. In one `$transaction`, load only the Coach certification fields, return `forbidden` when ineligible, run the conditional `assessmentSubmission.updateMany`, return `not-found` on count zero, then create the bounded audit row through `tx.auditLog.create`. Accept `now` and `requestId` through an audit/options argument so tests are deterministic.

- [x] **Step 4: Run domain tests and verify GREEN**

Run: `npx jest src/__tests__/lib/assessments/referred-results-removal.test.ts --runInBand`

Expected: PASS.

- [x] **Step 5: Write failing route tests**

Cover:

```ts
await expect(deleteRequest({ actor: null })).toHaveStatus(401);
await expect(deleteRequest({ enabled: false })).toHaveStatus(404);
await expect(deleteRequest({ role: "STAFF" })).toHaveStatus(403);
await expect(deleteRequest({ submissionId: "" })).toHaveStatus(400);
await expect(deleteRequest({ limiter: "deny" })).toHaveStatus(429);
await expect(deleteRequest({ limiter: "throw" })).toHaveStatus(503);
await expect(deleteRequest({ outcome: "not-found" })).toHaveStatus(404);
await expect(deleteRequest({ outcome: "forbidden" })).toHaveStatus(403);
await expect(deleteRequest({ outcome: "removed" })).toHaveStatus(200);
```

Also assert auth runs before the feature gate/limiter, limiter runs before the domain write, the key is `referred-results-delete:coach-1`, private/no-store headers are present, and the request ID is returned.

- [x] **Step 6: Run route tests and verify RED**

Run: `npx jest src/__tests__/api/referred-results-delete-route.test.ts --runInBand`

Expected: FAIL because the route does not exist.

- [x] **Step 7: Implement the minimal route**

Use a strict Zod identifier schema (`trim`, `min(1)`, `max(191)`, `/^[A-Za-z0-9_-]+$/`), `randomUUID` fallback for `x-request-id`, `checkRateLimitStrict` with `{ interval: 60_000, maxRequests: 10 }`, and map the three domain outcomes exactly as specified.

- [x] **Step 8: Run mutation tests and verify GREEN**

Run: `npx jest src/__tests__/lib/assessments/referred-results-removal.test.ts src/__tests__/api/referred-results-delete-route.test.ts --runInBand`

Expected: PASS.

- [x] **Step 9: Commit the mutation unit**

```bash
git add src/src/lib/assessments/referred-results-removal.ts src/src/app/api/assessments/referred-results/'[submissionId]'/route.ts src/src/__tests__/lib/assessments/referred-results-removal.test.ts src/src/__tests__/api/referred-results-delete-route.test.ts
git commit -m "feat: add coach-owned referred result removal"
```

### Task 3: Enforce Coach hiding and preserve privileged oversight

**Files:**
- Modify: `src/src/lib/assessments/public-referrals.ts`
- Modify: `src/src/app/api/assessments/referred-results/route.ts`
- Modify: `src/src/__tests__/lib/assessments/public-referrals.test.ts`
- Modify: `src/src/__tests__/api/referred-results-route.test.ts`
- Modify: `src/src/__tests__/api/admin/public-campaigns/submissions-route.test.ts`

**Interfaces:**
- Consumes: `AssessmentSubmission.referredResultsDeletedAt` from Task 1.
- Preserves: `listPublicReferrals`, `exportPublicReferrals`, and `getPublicReferralReport` public return types.
- Produces: Coach reads exclude tombstoned rows; privileged report/admin list reads retain them.

- [ ] **Step 1: Write failing Coach-read tests**

Pin `referredResultsDeletedAt: null` in ordinary `where` and `ownedWhere`, both raw search scopes, search-cursor SQL, and export SQL. For example:

```ts
expect(listWhere).toMatchObject({
  referringCoachId: "coach-owner",
  referredResultsDeletedAt: null,
});
expect(exportSql.sql).toContain('s."referredResultsDeletedAt" IS NULL');
expect(searchSql.sql).toContain('s."referredResultsDeletedAt" IS NULL');
```

Add a route assertion that assessment options require `submissions.some` to contain both `referringCoachId` and `referredResultsDeletedAt: null`.

- [ ] **Step 2: Write failing report/admin boundary tests**

Add `referredResultsDeletedAt` to the report fixture. Assert Coach report lookup includes null in its `where`, while ADMIN/STAFF lookup omits that predicate and succeeds for a tombstoned fixture. In the admin submissions route test, assert `findMany.where` remains exactly campaign-scoped and has no `referredResultsDeletedAt` filter.

- [ ] **Step 3: Run focused readers and verify RED**

Run: `npx jest src/__tests__/lib/assessments/public-referrals.test.ts src/__tests__/api/referred-results-route.test.ts src/__tests__/api/referred-results-export-route.test.ts src/__tests__/api/admin/public-campaigns/submissions-route.test.ts --runInBand`

Expected: FAIL on missing Coach tombstone constraints.

- [ ] **Step 4: Add minimal Coach-only predicates**

Add `s."referredResultsDeletedAt" IS NULL` to export and shared search SQL; add `referredResultsDeletedAt: null` to Prisma list/count/cursor filters; add it to the assessment-option nested submission filter. In `getPublicReferralReport`, spread the predicate only when `!isPrivilegedRole(actor.role)`:

```ts
where: {
  id: submissionId,
  ...(!isPrivilegedRole(actor.role)
    ? { referredResultsDeletedAt: null }
    : {}),
  campaign: { accessMode: "PUBLIC", deletedAt: null },
}
```

- [ ] **Step 5: Run focused readers and verify GREEN**

Run the command from Step 3 plus `src/__tests__/app/public-submission-report-page.test.tsx`.

Expected: PASS.

- [ ] **Step 6: Commit the read-boundary unit**

```bash
git add src/src/lib/assessments/public-referrals.ts src/src/app/api/assessments/referred-results/route.ts src/src/__tests__/lib/assessments/public-referrals.test.ts src/src/__tests__/api/referred-results-route.test.ts src/src/__tests__/api/admin/public-campaigns/submissions-route.test.ts
git commit -m "feat: hide removed referrals from coach reads"
```

### Task 4: Add confirmed desktop and mobile removal controls

**Files:**
- Modify: `src/src/components/assessments/ReferredResultsList.tsx`
- Modify: `src/src/__tests__/components/assessments/referred-results-list.test.tsx`

**Interfaces:**
- Consumes: `DELETE /api/assessments/referred-results/[submissionId]` from Task 2.
- Preserves: `ReferredResultsList` props and GET response shape.
- Produces: per-entry Delete controls, confirmation, in-flight state, inline error, and server refresh.

- [ ] **Step 1: Write failing interaction tests**

Add tests that render both responsive actions and assert:

```ts
expect(screen.getAllByRole("button", { name: /delete jordan lee/i })).toHaveLength(2);
expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("administrators retain"));
expect(fetch).toHaveBeenCalledWith(
  "/api/assessments/referred-results/sub-1",
  expect.objectContaining({ method: "DELETE" }),
);
```

Cover cancel (no DELETE), in-flight disabled controls, successful reload, later-page fallback to the previous cursor trail when the refreshed page is empty, and failed DELETE preserving the row with `role="alert"`.

- [ ] **Step 2: Run the component suite and verify RED**

Run: `npx jest src/__tests__/components/assessments/referred-results-list.test.tsx --runInBand`

Expected: FAIL because no Delete controls exist.

- [ ] **Step 3: Implement minimal client behavior**

Extend `ResultActions` with `onDelete`, `deleting`, and a unique accessible label. Track one `deletingId` and one `deleteError`. Confirm with copy that removal affects the Coach list while administrators retain oversight. Send `DELETE` with JSON accept headers. On success call `loadPage` for current query/filter/trail; if that returns an empty page while `pageIndex > 0`, repeat with the final cursor removed. Keep the item visible on all failures.

- [ ] **Step 4: Run the component suite and verify GREEN**

Run: `npx jest src/__tests__/components/assessments/referred-results-list.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 5: Run the complete feature regression matrix**

Run:

```bash
npx jest \
  src/__tests__/prisma/referred-results-coach-removal-migration.test.ts \
  src/__tests__/lib/assessments/referred-results-removal.test.ts \
  src/__tests__/api/referred-results-delete-route.test.ts \
  src/__tests__/lib/assessments/public-referrals.test.ts \
  src/__tests__/api/referred-results-route.test.ts \
  src/__tests__/api/referred-results-export-route.test.ts \
  src/__tests__/api/admin/public-campaigns/submissions-route.test.ts \
  src/__tests__/components/assessments/referred-results-list.test.tsx \
  src/__tests__/app/public-submission-report-page.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit the UI unit**

```bash
git add src/src/components/assessments/ReferredResultsList.tsx src/src/__tests__/components/assessments/referred-results-list.test.tsx
git commit -m "feat: confirm referred result removal in coach UI"
```

### Task 5: Record source of truth and run release gates

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Modify: `docs/superpowers/plans/2026-08-30-referred-results-coach-removal.md` (check completed steps)
- Already modified/committed: `CONTEXT.md`

**Interfaces:**
- Consumes: final verified behavior and exact test/build counts from Tasks 1–4.
- Produces: same-PR source-of-truth receipt and review-ready branch.

- [ ] **Step 1: Update source of truth without launch overclaims**

Prepend a `2026-08-30` changelog entry with slug `referred-results-coach-removal-implemented`. Update the `CLAUDE.md` `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor and short current-status prose. Add the DELETE route to the API table. State explicitly: locally implemented and verified; not merged, deployed, activated, or Production-tested; no environment/flag/Production-data mutation.

- [ ] **Step 2: Run source-of-truth and migration gates**

Run:

```bash
npx jest src/__tests__/lint/changelog-freshness.test.ts src/__tests__/prisma/referred-results-coach-removal-migration.test.ts --runInBand
node scripts/check-migration-safety.mjs
git diff --check
```

Expected: all exit 0.

- [ ] **Step 3: Run changed-file ESLint**

Run `npx eslint` with every changed `.ts` and `.tsx` path reported by `git diff --name-only origin/main`.

Expected: exit 0 with no diagnostics.

- [ ] **Step 4: Run the Production-equivalent build**

Run: `CI=true npm run build`

Expected: exit 0 after Prisma generation, migration safety, TypeScript, and Turbopack static generation.

- [ ] **Step 5: Commit documentation and verification receipt**

```bash
git add CLAUDE.md plans/CHANGELOG.md docs/superpowers/plans/2026-08-30-referred-results-coach-removal.md
git commit -m "docs: record referred result removal verification"
```

- [ ] **Step 6: Run the required review loop**

Use the repository code-review skill against merge-base `origin/main`, review both Standards and Spec Compliance, repair every actionable finding through RED/GREEN tests, rerun affected gates, and repeat until the review returns no actionable findings. Do not open or merge the PR while a review pass is still running.

- [ ] **Step 7: Push and open the PR**

Push `codex/387-item-8-delete-referred`, open one PR referencing #387 item 8 and the #261 claim, include exact local verification, and explicitly state the no-environment/no-Production-data boundary. Wait for hosted checks and review the final PR diff; do not merge.
