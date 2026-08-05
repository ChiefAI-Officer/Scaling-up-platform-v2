# Jeff #83 Referred Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a verified referring coach persistent, authenticated access to the public assessment submissions attributed to that Coach, while completing the existing ADMIN/STAFF result view.

**Architecture:** Persist immutable `AssessmentSubmission.referringCoachId` ownership independently of the feature flag, then expose frozen results through one public-referral domain loader and the existing report access-gate protocol. Gate only navigation/read surfaces, reuse the canonical `RespondentReport` renderer, and keep Public Campaign management separate from referral ownership.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript, Prisma/PostgreSQL, Jest + Testing Library, Tailwind/CSS utilities.

## Global Constraints

- Fixed review point: `dc846fbcefec249acb23e33e711b5feb2b3a6004`.
- Use `Referring coach`, `Referred Results`, `Public Campaign`, and `Results report` exactly as defined in `CONTEXT.md`.
- Ownership writes are always on; `WAVE_83_REFERRED_RESULTS_ENABLED` plus `WAVE_83_REFERRED_RESULTS_KILL` gate only new read surfaces and matching public copy.
- Coach authorization uses `getApiActor()` and `Coach.userId`; never use the legacy email fallback.
- Scores, findings, and answers come only from frozen submission data and the referenced published Template Version; never rescore.
- ADMIN/STAFF retain oversight. Unverified referrals remain ADMIN/STAFF-only.
- Missing and unauthorized report IDs are enumeration-safe not-found responses.
- Public referral reports are private/no-store and report views are fail-closed audited.
- The feature is read-only; no CRM, reassignment, answer editing, or campaign management.
- Final legal copy requires approval and links to `https://scalingup.com/privacy-policy/`.

---

### Task 1: Add durable referral ownership and the read-surface flag

**Files:**
- Modify: `src/prisma/schema.prisma`
- Create: `src/prisma/migrations/20260729230000_add_public_referring_coach_identity/migration.sql`
- Create: `src/src/lib/assessments/wave-83-flags.ts`
- Create: `src/src/__tests__/lib/assessments/wave-83-flags.test.ts`

**Interfaces:**
- Produces: `AssessmentSubmission.referringCoachId`, `AssessmentSubmission.referringCoach`, `Coach.referredAssessmentSubmissions`.
- Produces: `isReferredResultsEnabled(): boolean`.

- [ ] **Step 1: Write the failing flag test**

```ts
import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";

it("is default-off and the kill switch wins", () => {
  delete process.env.WAVE_83_REFERRED_RESULTS_ENABLED;
  delete process.env.WAVE_83_REFERRED_RESULTS_KILL;
  expect(isReferredResultsEnabled()).toBe(false);
  process.env.WAVE_83_REFERRED_RESULTS_ENABLED = "1";
  expect(isReferredResultsEnabled()).toBe(true);
  process.env.WAVE_83_REFERRED_RESULTS_KILL = "1";
  expect(isReferredResultsEnabled()).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest src/__tests__/lib/assessments/wave-83-flags.test.ts --runInBand`

Expected: FAIL because `wave-83-flags.ts` does not exist.

- [ ] **Step 3: Add the minimal flag implementation**

```ts
function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isReferredResultsEnabled(): boolean {
  if (isOn(process.env.WAVE_83_REFERRED_RESULTS_KILL)) return false;
  return isOn(process.env.WAVE_83_REFERRED_RESULTS_ENABLED);
}
```

- [ ] **Step 4: Add the additive schema and SQL migration**

```prisma
// Coach
referredAssessmentSubmissions AssessmentSubmission[] @relation("AssessmentSubmissionReferringCoach")

// AssessmentSubmission
referringCoachId String?
referringCoach Coach? @relation("AssessmentSubmissionReferringCoach", fields: [referringCoachId], references: [id], onDelete: Restrict)

@@index([referringCoachId, submittedAt])
```

```sql
ALTER TABLE "assessment_submissions"
  ADD COLUMN "referringCoachId" TEXT;

CREATE INDEX "assessment_submissions_referringCoachId_submittedAt_idx"
  ON "assessment_submissions"("referringCoachId", "submittedAt");

ALTER TABLE "assessment_submissions"
  ADD CONSTRAINT "assessment_submissions_referringCoachId_fkey"
  FOREIGN KEY ("referringCoachId") REFERENCES "coaches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 5: Verify GREEN and schema validity**

Run:

```bash
PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest src/__tests__/lib/assessments/wave-83-flags.test.ts --runInBand
PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/prisma validate
node scripts/check-migration-safety.mjs
```

Expected: PASS.

### Task 2: Canonically dual-write verified Coach identity and block hard deletion

**Files:**
- Modify: `src/src/app/api/quiz/[campaignAlias]/submit/route.ts`
- Modify: `src/src/__tests__/api/quick-assessment-submit.test.ts`
- Modify: `src/src/app/api/coaches/[id]/route.ts`
- Modify: `src/src/__tests__/api/coaches-delete.test.ts`

**Interfaces:**
- Consumes: `AssessmentSubmission.referringCoachId`.
- Produces: verified submission data `{ referringCoachId: coach.id, referringCoachEmail: coach.email }`.
- Produces: HTTP `409` when a Coach has referred submissions.

- [ ] **Step 1: Repair the stale public-submit fixture and write the failing ownership test**

Add `deletedAt: null` to the shared campaign fixture, then assert the route's public response seam:

```ts
it("stores only the verified Coach identity and canonical email", async () => {
  (db.coach.findUnique as jest.Mock).mockResolvedValue(activeCoach);
  await POST(makeRequest({ ...VALID_BODY, referringCoachEmail: " COACH@EXAMPLE.COM " }) as never, makeParams() as never);
  expect(txMock.assessmentSubmission.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        referringCoachId: "coach-1",
        referringCoachEmail: "coach@example.com",
      }),
    }),
  );
});
```

Add a second public-interface test proving an unknown/inactive email stores both fields as null and emits no `REFERRING_COACH` outbox row.

- [ ] **Step 2: Run the focused submit test and verify RED**

Run: `PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest src/__tests__/api/quick-assessment-submit.test.ts --runInBand`

Expected: the new ownership assertions fail.

- [ ] **Step 3: Implement canonical dual-write**

Use the already resolved `coach` object as the only source:

```ts
referringCoachId: coach?.id ?? null,
referringCoachEmail: coach?.email.trim().toLowerCase() ?? null,
```

Pass the canonical verified email into the report/email model. Do not persist the untrusted supplied email when verification fails.

- [ ] **Step 4: Write the failing coach-delete guard test**

```ts
it("returns 409 when the coach owns referred public submissions", async () => {
  (db.assessmentSubmission.count as jest.Mock).mockResolvedValue(2);
  const res = await DELETE(makeRequest("coach-1"), routeParams("coach-1"));
  expect(res.status).toBe(409);
  expect((await res.json()).error).toMatch(/deactivate/i);
  expect(db.coach.delete).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Implement the transactional guard and verify GREEN**

Count `{ where: { referringCoachId: id } }` before relation cleanup and throw a typed `HAS_REFERRED_SUBMISSIONS` error mapped to HTTP 409.

Run:

```bash
PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest src/__tests__/api/quick-assessment-submit.test.ts src/__tests__/api/coaches-delete.test.ts --runInBand
npx tsc --noEmit
```

Expected: PASS.

### Task 3: Build the public-referral domain loader and frozen result summary

**Files:**
- Create: `src/src/lib/assessments/public-referrals.ts`
- Create: `src/src/__tests__/lib/assessments/public-referrals.test.ts`
- Modify: `src/src/lib/assessments/respondent-report.ts`
- Modify: `src/src/__tests__/lib/assessments/respondent-report.test.ts`

**Interfaces:**
- Produces: `getPublicReferralReport(db, actor, submissionId): Promise<PublicReferralReportOutcome>`.
- Produces: `listPublicReferrals(db, actor, input): Promise<PublicReferralListOutcome>`.
- Produces: `summarizePublicResult(alias, result): PublicResultSummary`.
- Produces: shared `buildStoredRespondentReport(input): RespondentReport`.

- [ ] **Step 1: Write failing authorization tests through the loader**

Cover literal outcomes:

```ts
expect(await getPublicReferralReport(db, ownerActor, "sub-1")).toMatchObject({ status: "ok" });
expect(await getPublicReferralReport(db, otherCoachActor, "sub-1")).toEqual({ status: "forbidden" });
expect(await getPublicReferralReport(db, inactiveOwnerActor, "sub-1")).toEqual({ status: "forbidden" });
expect(await getPublicReferralReport(db, adminActor, "sub-1")).toMatchObject({ status: "ok" });
```

The fake submission includes `campaign.deletedAt = null`, `campaign.accessMode = "PUBLIC"`, frozen `result`/`answers`, and published version metadata. Add a closed campaign case that succeeds and a soft-deleted case that returns not-found.

- [ ] **Step 2: Run the loader test and verify RED**

Run: `PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest src/__tests__/lib/assessments/public-referrals.test.ts --runInBand`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal report loader**

Use one transaction to fetch the public submission and verify:

```ts
if (isPrivilegedRole(actor.role)) return ok;
if (!actor.coachId || actor.coachId !== submission.referringCoachId) return forbidden;
if (!submission.referringCoach || !isCertified(submission.referringCoach)) return forbidden;
```

Require `accessMode === "PUBLIC"` and `deletedAt === null`; ignore ACTIVE/CLOSED status. Build the report from `submission.result`, `submission.answers`, and the referenced version only. Never call scoring.

- [ ] **Step 4: Extract and reuse the stored-report pure builder**

Move the invited loader's object construction into:

```ts
export function buildStoredRespondentReport(input: StoredRespondentReportInput): RespondentReport
```

Call it from both `getRespondentReport` and `getPublicReferralReport`. Preserve invited report tests byte-for-byte.

- [ ] **Step 5: Add scored and qualitative summary tests**

Assert a Four Decisions frozen result returns `{ kind: "scored", overallScore: 7.4, domains: [...] }`; a qualitative alias/result returns `{ kind: "qualitative", label: "Completed" }`; malformed results return `{ kind: "degraded", label: "Result unavailable" }`.

- [ ] **Step 6: Implement newest-first list ownership and verify GREEN**

`listPublicReferrals` accepts `{ query?: string; templateId?: string; cursor?: string; take?: number }`, pins `referringCoachId = actor.coachId`, verifies current Coach activity, orders by `[{submittedAt:"desc"},{id:"desc"}]`, and returns no raw answers.

Run:

```bash
PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest src/__tests__/lib/assessments/public-referrals.test.ts src/__tests__/lib/assessments/respondent-report.test.ts --runInBand
npx tsc --noEmit
```

Expected: PASS.

### Task 4: Add authenticated report access and no-store coverage

**Files:**
- Modify: `src/src/lib/assessments/report-access-gate.ts`
- Modify: `src/src/__tests__/lib/assessments/report-access-gate.test.ts`
- Create: `src/src/app/(report)/assessments/public-submissions/[submissionId]/report/page.tsx`
- Create: `src/src/__tests__/app/public-submission-report-page.test.tsx`
- Modify: `src/src/middleware.ts`
- Modify: `src/src/__tests__/middleware-no-store.test.ts`

**Interfaces:**
- Produces: `viewPublicReferralReport(deps, { submissionId })`.
- Produces: `/assessments/public-submissions/[submissionId]/report`.

- [ ] **Step 1: Write failing gate tests**

Assert flag-off not-found occurs before loader work, owner success writes `VIEW_REPORT` audit with `kind: "public-referral-report"`, forbidden outcomes are enumeration-safe, and audit failure prevents rendering.

- [ ] **Step 2: Run the focused gate test and verify RED**

Run: `PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest src/__tests__/lib/assessments/report-access-gate.test.ts --runInBand`

- [ ] **Step 3: Implement the adapter and report page**

Call `getApiActor`, use `isReferredResultsEnabled` as the gate, rate-limit by actor/submission/IP, load with `getPublicReferralReport`, and reuse `BrandedReport` plus `PrintReportButton`.

- [ ] **Step 4: Extend the middleware matcher**

Include:

```ts
/^\/assessments\/public-submissions\/[^/]+\/report\/?$/
```

and assert `Cache-Control: no-store, private`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest src/__tests__/lib/assessments/report-access-gate.test.ts src/__tests__/app/public-submission-report-page.test.tsx src/__tests__/middleware-no-store.test.ts --runInBand
npx tsc --noEmit
```

Expected: PASS.

### Task 5: Add the Coach-lane Referred Results surface

**Files:**
- Create: `src/src/app/api/assessments/referred-results/route.ts`
- Create: `src/src/__tests__/api/referred-results-route.test.ts`
- Create: `src/src/app/(portal)/portal/assessments/referred-results/page.tsx`
- Create: `src/src/components/assessments/ReferredResultsList.tsx`
- Create: `src/src/__tests__/components/assessments/referred-results-list.test.tsx`
- Modify: `src/src/app/(portal)/portal/assessments/page.tsx`
- Modify: `src/src/components/nav/assessments-sidebar.tsx`
- Modify: `src/src/__tests__/components/nav/assessments-sidebar.test.tsx`

**Interfaces:**
- Consumes: `listPublicReferrals`, `isReferredResultsEnabled`.
- Produces: Coach API and `/portal/assessments/referred-results`.

- [ ] **Step 1: Write failing API tests**

Assert unauthenticated 401, COACH without immutable `coachId` 403, flag-off 404, owner receives only display-safe rows, and query/template/cursor parameters are validated and passed to the loader.

- [ ] **Step 2: Implement the API and verify GREEN**

Use `getApiActor` only. Never call `requireCoach`/`getCoachForSession` in the API.

- [ ] **Step 3: Write failing navigation and page tests**

Assert flag-on Coach sidebar includes Referred Results, flag-off does not, the Quick Assessment link no longer appears on My Campaigns when enabled, and the new page owns the link card.

- [ ] **Step 4: Implement the server page and list**

Render the link card, newest-first rows, scored/qualitative/degraded summaries, Details expansion only for supported domains, View report, empty/no-results/error states, 25-row pagination, search, assessment filter, keyboard controls, and mobile-safe cards.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest src/__tests__/api/referred-results-route.test.ts src/__tests__/components/assessments/referred-results-list.test.tsx src/__tests__/components/nav/assessments-sidebar.test.tsx --runInBand
npx tsc --noEmit
```

Expected: PASS.

### Task 6: Complete the ADMIN/STAFF surface and public disclosure

**Files:**
- Modify: `src/src/app/api/admin/public-campaigns/[id]/submissions/route.ts`
- Modify: `src/src/__tests__/api/admin/public-campaigns/submissions-route.test.ts`
- Modify: `src/src/components/admin/PublicCampaignsManager.tsx`
- Modify: `src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx`
- Modify: `src/src/components/assessments/public-quiz-client.tsx`
- Modify: `src/src/__tests__/components/public-quiz-results.test.tsx`

**Interfaces:**
- Consumes: `summarizePublicResult`, `isReferredResultsEnabled`.
- Produces: enriched admin rows and feature-matched disclosure.

- [ ] **Step 1: Write failing admin response/UI tests**

Assert flag-on rows contain verified Coach name/email, discriminated result summary, and authenticated report href. Unreferred rows say `Scaling Up only`. Flag-off response/UI preserves the current shape.

- [ ] **Step 2: Implement admin enrichment**

Select frozen `result`, Template alias/name, and `referringCoach` display fields. Render summary, supported Details expansion, and View report without raw answers.

- [ ] **Step 3: Write the failing consent test**

When enabled, assert the pre-submit copy contains “available to that verified coach while their account remains active” and an anchor to `https://scalingup.com/privacy-policy/`. When disabled, assert current copy remains.

- [ ] **Step 4: Implement feature-matched disclosure and verify GREEN**

Pass a server-derived enablement prop into `PublicQuizClient`; do not read a server environment flag from client code.

Run:

```bash
PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest src/__tests__/api/admin/public-campaigns/submissions-route.test.ts src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx src/__tests__/components/public-quiz-results.test.tsx --runInBand
npx tsc --noEmit
```

Expected: PASS.

### Task 7: Add reviewed historical mapping tooling and rollout documentation

**Files:**
- Create: `src/scripts/review-public-referral-backfill.mjs`
- Create: `src/scripts/apply-public-referral-backfill.mjs`
- Create: `src/src/__tests__/scripts/public-referral-backfill.test.ts`
- Modify: `src/.env.example`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**
- Produces: read-only candidate JSON without automatic assignment.
- Consumes: an explicit JSON array of `{ "submissionId": "...", "coachId": "..." }`.

- [ ] **Step 1: Write failing script-helper tests**

Test pure validation rejects duplicate submissions, duplicate/conflicting Coach mappings, nonexistent IDs, non-public submissions, and mappings without a `REFERRING_COACH` outbox row.

- [ ] **Step 2: Implement candidate and apply scripts**

The review script prints IDs and normalized evidence for human confirmation. The apply script is invoked as `--mapping /private/tmp/jeff-83-reviewed-mapping.json`, validates every row in one transaction, updates only null `referringCoachId`, and aborts the entire batch on any conflict. It never maps by email automatically.

- [ ] **Step 3: Add environment and implementation-history entries**

Document the two feature variables and prepend a changelog entry that says the feature is implemented default-OFF and not launched. Do not change `CLAUDE.md` production anchors during local implementation; those update only with the eventual production push.

- [ ] **Step 4: Verify script tests and migration gate**

Run:

```bash
PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest src/__tests__/scripts/public-referral-backfill.test.ts --runInBand
node scripts/check-migration-safety.mjs
```

Expected: PASS.

### Task 8: Full verification, commits, and review loop

**Files:**
- Review all files changed from `dc846fbcefec249acb23e33e711b5feb2b3a6004`.

**Interfaces:**
- Produces: a reviewed, committed #83 implementation.

- [ ] **Step 1: Run changed-file lint and typecheck**

```bash
npx eslint $(git diff --name-only dc846fbcefec249acb23e33e711b5feb2b3a6004...HEAD | rg '\.(ts|tsx)$')
npx tsc --noEmit
```

- [ ] **Step 2: Run migration safety and the complete Jest suite**

```bash
node scripts/check-migration-safety.mjs
PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/jest --runInBand
```

- [ ] **Step 3: Run the production build gate**

```bash
CI=true PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:$PATH ./node_modules/.bin/next build --turbopack
```

- [ ] **Step 4: Commit the implementation**

```bash
git add src/prisma src/src src/scripts src/.env.example CLAUDE.md CONTEXT.md plans/CHANGELOG.md docs/adr docs/superpowers
git commit -m "feat(assessments): add referred public results (#83)"
```

- [ ] **Step 5: Run two-axis code review**

Use `/code-review dc846fbcefec249acb23e33e711b5feb2b3a6004` with:

- Spec: `docs/superpowers/specs/2026-07-29-jeff-83-referred-results-design.md`
- Standards: `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, and the code-review smell baseline.

- [ ] **Step 6: Fix every actionable finding and reverify**

Repeat targeted tests, full typecheck, affected lint, full Jest, migration gate, and Turbopack build. Commit fixes, then run the two-axis review again until both axes have no actionable findings.
