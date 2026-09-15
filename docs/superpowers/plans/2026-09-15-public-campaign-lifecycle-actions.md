# Public Campaign Lifecycle Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the existing public-campaign lifecycle branch with the approved UI and add a dedicated, flag-gated lifecycle closure timestamp plus server-enforced Close-before-Delete safety.

**Architecture:** The server page owns the private feature flag and passes a boolean to the existing client list/actions. A nullable `AssessmentCampaign.closedAt` records the terminal transition without corrupting scheduled `closeAt`; the existing generic Close/Delete routes apply conditional PUBLIC-only rules only while the lifecycle flag is active. Existing INVITED and flag-off callers preserve their behavior.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma/PostgreSQL, Jest, Testing Library, shadcn Dialog/Button.

**Spec:** `docs/superpowers/specs/2026-09-15-public-campaign-lifecycle-actions-design.md`

## Global Constraints

- Jeff's Sep 14 decision is terminal Close; do not add pause, resume, reopen, or a new lifecycle state.
- Live public campaigns must be closed before deletion, and the server must enforce this against stale clients.
- `closeAt` remains the scheduled availability cutoff; only `closedAt` records the lifecycle transition.
- Flag OFF or kill ON restores the previous UI and generic-route behavior.
- Use inline actions, shadcn `Button`/`Dialog`, existing Notice styling, and 44px responsive targets.
- No production data or environment-variable write is part of this implementation.

---

### Task 1: Add the dedicated lifecycle timestamp

**Files:**
- Modify: `src/prisma/schema.prisma`
- Create: `src/prisma/migrations/20260915090000_add_assessment_campaign_closed_at/migration.sql`
- Create: `src/src/__tests__/prisma/assessment-campaign-closed-at-migration.test.ts`

**Interfaces:**
- Produces: `AssessmentCampaign.closedAt: Date | null` in Prisma and a nullable `closedAt` database column.
- Consumes: no application-layer changes.

- [ ] **Step 1: Write the failing migration-shape test**

Assert that the schema declares `closedAt DateTime?` and the migration uses one additive nullable `ALTER TABLE ... ADD COLUMN` statement with no default, destructive clause, or backfill.

- [ ] **Step 2: Run the migration test and verify RED**

Run: `npx jest src/__tests__/prisma/assessment-campaign-closed-at-migration.test.ts --runInBand`  
Expected: FAIL because the field and migration do not exist.

- [ ] **Step 3: Add the nullable field and additive migration**

Add the Prisma field near `openAt`/`closeAt`. Create SQL equivalent to:

```sql
ALTER TABLE "assessment_campaigns"
ADD COLUMN "closedAt" TIMESTAMP(3);
```

- [ ] **Step 4: Regenerate Prisma and verify GREEN**

Run: `npx prisma generate`  
Run: `npx jest src/__tests__/prisma/assessment-campaign-closed-at-migration.test.ts --runInBand`

### Task 2: Carry lifecycle time through the public list model

**Files:**
- Modify: `src/src/app/api/admin/public-campaigns/route.ts`
- Modify: `src/src/lib/assessments/public-campaign-ui.ts`
- Modify: `src/src/__tests__/api/admin-public-campaigns.test.ts`
- Modify: `src/src/__tests__/lib/assessments/public-campaign-ui.test.ts`

**Interfaces:**
- Produces: `PublicCampaignViewModel.closedAt: string | null`.
- Produces: `publicCampaignScheduleLabel()` fallback order `closedAt`, then `closeAt`, then bare Closed.

- [ ] **Step 1: Add RED tests for API serialization and Closed label precedence**

Cover a persisted lifecycle timestamp, a legacy scheduled cutoff, and a legacy row with neither timestamp.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx jest src/__tests__/api/admin-public-campaigns.test.ts src/__tests__/lib/assessments/public-campaign-ui.test.ts --runInBand`

- [ ] **Step 3: Add `closedAt` to the API mapping, decoder, view model, and label resolver**

Serialize dates as ISO strings and reject malformed non-null model values at the decode seam.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same two-suite command.

### Task 3: Make flagged PUBLIC Close atomic and reconcilable

**Files:**
- Modify: `src/src/app/api/assessment-campaigns/[id]/close/route.ts`
- Modify: `src/src/__tests__/api/assessment-campaigns/close-route.test.ts`

**Interfaces:**
- Consumes: `isPublicCampaignLifecycleEnabled()` and Prisma `closedAt`.
- Produces: success `{ success: true, data: { id, status: "CLOSED", closedAt } }` for flagged PUBLIC Close.
- Produces: conflict `{ success: false, code: "ALREADY_CLOSED", data: { id, status: "CLOSED", closedAt } }` when the conditional transition loses.

- [ ] **Step 1: Add RED tests for flagged PUBLIC persistence, flag-off parity, INVITED parity, and CAS conflict**

The flagged test asserts one conditional write containing `status: "CLOSED"` and a `Date` `closedAt`. Compatibility tests assert the legacy update data remains exactly `{ status: "CLOSED" }`.

- [ ] **Step 2: Run the route suite and verify RED**

Run: `npx jest src/__tests__/api/assessment-campaigns/close-route.test.ts --runInBand`

- [ ] **Step 3: Implement the PUBLIC-only conditional transition**

Resolve the flag server-side, select `accessMode` and `closedAt`, and use `updateMany` with the expected nonterminal status only for flagged PUBLIC campaigns. On a zero-count write, reload the campaign and return authoritative Closed data. Preserve existing generic behavior otherwise. Audit only the winning transition.

- [ ] **Step 4: Run the route suite and verify GREEN**

Run the same route-suite command.

### Task 4: Enforce flagged PUBLIC Close-before-Delete

**Files:**
- Modify: `src/src/app/api/assessment-campaigns/[id]/route.ts`
- Modify: `src/src/__tests__/api/assessment-campaigns/delete.test.ts`

**Interfaces:**
- Consumes: `isPublicCampaignLifecycleEnabled()` and the loaded campaign's `accessMode`/`status`.
- Produces: `409 CAMPAIGN_STATUS_CHANGED` for a flagged PUBLIC Active row or a conditional-write race.
- Preserves: unflagged PUBLIC and INVITED any-state soft-delete behavior.

- [ ] **Step 1: Add RED tests for Active rejection, Draft/Closed success, stale Draft race, and flag-off/INVITED parity**

Assert no audit row is written when the conditional delete fails.

- [ ] **Step 2: Run the delete suite and verify RED**

Run: `npx jest src/__tests__/api/assessment-campaigns/delete.test.ts --runInBand`

- [ ] **Step 3: Implement the flagged PUBLIC conditional soft delete**

For flagged PUBLIC rows, condition the update on `status in [DRAFT, CLOSED]`, `deletedAt: null`, and the campaign ID. Keep the existing unconditioned legacy path for every other caller.

- [ ] **Step 4: Run the delete suite and verify GREEN**

Run the same delete-suite command.

### Task 5: Match the approved action and dialog design

**Files:**
- Modify: `src/src/components/admin/public-campaigns/PublicCampaignActions.tsx`
- Modify: `src/src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx`

**Interfaces:**
- Consumes: `campaign.closedAt`, `lifecycleActionsEnabled`, existing generic endpoints.
- Produces: `onCampaignUpdated({ status: "CLOSED", closedAt })` and zero-argument `onCampaignDeleted()`.

- [ ] **Step 1: Extend the lifecycle matrix and add one RED dialog/request slice**

Assert triggers are exactly **Close** and **Delete**, Close appears only for Live, Delete only for Draft/Closed, and no **More** control appears. Assert the accessible Close dialog title/body, optional Reason field, `0/500` counter, Cancel behavior, and JSON request body.

- [ ] **Step 2: Run the component suite and verify RED**

Run: `npx jest src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx --runInBand`

- [ ] **Step 3: Implement the Close slice and verify GREEN**

Use destructive trigger/confirm buttons. Validate `id`, `status`, and parseable `closedAt`; patch all owned fields. Reconcile `ALREADY_CLOSED` from authoritative response data. Keep raw codes private.

- [ ] **Step 4: Add the RED Delete-dialog copy slices**

Cover zero, singular, and plural responses; exact irreversible/unreachable wording; Cancel/Escape; in-flight disabling; malformed success envelopes; and status-change conflicts.

- [ ] **Step 5: Implement the Delete slices and verify GREEN**

Keep the row until a validated success envelope invokes `onCampaignDeleted()`.

- [ ] **Step 6: Extend responsive RED/GREEN coverage**

Assert new triggers and dialog controls receive the established 44px classes when `responsiveEnabled`, while flag-off rendering retains prior action classes and labels.

### Task 6: Update and remove list rows accessibly

**Files:**
- Modify: `src/src/components/admin/public-campaigns/PublicCampaignList.tsx`
- Modify: `src/src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx`

**Interfaces:**
- Consumes: Close updates containing `status` and `closedAt`; Delete callback scoped by the row closure.
- Produces: updated Closed label without reload; target-only removal; focused list-level deletion status.

- [ ] **Step 1: Add RED tests for Close date, target-only Delete, expanded-row cleanup, duplicate names, and focus**

Use campaign IDs as row identity and assert sibling rows survive.

- [ ] **Step 2: Run the list suite and verify RED**

Run: `npx jest src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx --runInBand`

- [ ] **Step 3: Extend the row patch type and use the shared schedule label**

Remove any lifecycle-only hardcoded `"Closed"` override. Let `publicCampaignScheduleLabel()` render the timestamp fallback chain.

- [ ] **Step 4: Implement target-only removal and focused status, then verify GREEN**

Run the same list-suite command.

### Task 7: Verify flag propagation and compatibility

**Files:**
- Modify: `src/src/app/(dashboard)/admin/assessments/public-campaigns/page.tsx`
- Modify: `src/src/__tests__/app/admin-public-campaigns-page.test.tsx`
- Verify: `src/src/lib/assessments/wave-public-campaign-lifecycle-flags.ts`
- Verify: `src/src/__tests__/lib/assessments/wave-public-campaign-lifecycle-flags.test.ts`

**Interfaces:**
- Produces: server-resolved `lifecycleActionsEnabled` prop only inside the simple Public campaigns UI.

- [ ] **Step 1: Add or update flag ON/OFF/kill propagation tests**

Assert client components never read the private environment variable and the legacy manager path remains unchanged.

- [ ] **Step 2: Run flag and page suites**

Run: `npx jest src/__tests__/lib/assessments/wave-public-campaign-lifecycle-flags.test.ts src/__tests__/app/admin-public-campaigns-page.test.tsx --runInBand`

- [ ] **Step 3: Verify the existing server-to-client wiring and correct only any failing contract**

Keep `isPublicCampaignLifecycleEnabled()` in the server page and pass `lifecycleActionsEnabled` through `PublicCampaignList` to `PublicCampaignActions`; do not add a public environment variable.

### Task 8: Documentation and full validation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Modify: `docs/wireframes-phase2/wave6/25-admin-public-campaigns-simple-ui.md` to record the approved lifecycle matrix.

**Interfaces:**
- Produces: current source-of-truth entry and release receipt without claiming deployment or flag enablement.

- [ ] **Step 1: Restore and reconcile the preserved task-specific documentation**

Update the prior text to name `closedAt`, the additive migration, exact approved Close copy, server-enforced public deletion rule, and actual verification counts. Preserve newer `origin/main` entries above it.

- [ ] **Step 2: Run focused validation**

Run all changed test suites together with `--runInBand`, then run changed-file ESLint.

- [ ] **Step 3: Run repository gates**

From `src/`:

```bash
node scripts/check-migration-safety.mjs
CI=true NODE_OPTIONS=--max-old-space-size=4096 npx next build --turbopack
npm test -- --runInBand
```

Record exact results; do not convert inherited baseline failures into a pass claim.

- [ ] **Step 4: Review against the fixed point**

Use `origin/main` resolved at execution start as the fixed point. Run Standards and Spec reviews, address actionable findings, rerun affected checks, and repeat until clear.

- [ ] **Step 5: Commit the reconciled documentation and implementation**

Use narrow commits that preserve the rebased prior implementation history. Do not push, merge, deploy, or change production flags without separate operator direction.
