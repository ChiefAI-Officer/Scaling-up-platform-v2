# Workshop Deletion Cascade Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two cascade bugs that leave orphaned records when a workshop is permanently deleted, and correct the confirmation dialog's inaccurate bullet list.

**Architecture:** Add `onDelete: Cascade` to `ApprovalQueue`'s existing workshop `@relation`, promote `WorkflowStepExecution.workshopId` from a plain String to a proper FK `@relation` with `onDelete: Cascade`, and prepend an orphan-cleanup SQL step to the generated migration to protect against any pre-existing dirty data in production. The delete route and dialog are then updated to reflect the new counts and accurate impact list.

**Tech Stack:** Prisma 6.x (schema + migration), Next.js App Router API route, React component, Jest (unit tests)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/__tests__/api/workshop-delete.test.ts` | **Create** | New unit tests for enhanced route (new `_count` fields, audit log contents) |
| `prisma/schema.prisma` | **Modify** | `ApprovalQueue` onDelete: Cascade; `WorkflowStepExecution` @relation + onDelete: Cascade; `Workshop` workflowStepExecutions[] |
| `prisma/migrations/20260401000000_add_workshop_cascade_deletes/migration.sql` | **Create** | Orphan cleanup + FK constraint additions |
| `src/app/api/workshops/[id]/delete/route.ts` | **Modify** | Add `approvals` + `workflowStepExecutions` to `_count`, update audit log JSON |
| `src/components/workshops/delete-workshop-dialog.tsx` | **Modify** | Fix bullet list — remove "audit history", add approvals + execution logs |

---

## Task 1: Write Failing Tests (TDD — Red Phase)

> **Invoke `superpowers:test-driven-development` before this task.**

**Files:**
- Create: `src/src/__tests__/api/workshop-delete.test.ts`

- [ ] **Step 1.1: Create the test file**

```typescript
// src/src/__tests__/api/workshop-delete.test.ts
import { POST } from "@/app/api/workshops/[id]/delete/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    $transaction: jest.fn(),
    workshop: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
}));

const mockWorkshop = {
  id: "ws-1",
  title: "Test Workshop",
  workshopCode: "WS-2026-TEST",
  status: "CANCELED",
  coachId: "coach-1",
  _count: {
    registrations: 3,
    landingPages: 2,
    surveys: 1,
    approvals: 2,
    workflowStepExecutions: 5,
  },
};

function routeParams(id = "ws-1") {
  return { params: Promise.resolve({ id }) };
}

function asPostRequest(body: object): Parameters<typeof POST>[0] {
  return new Request("http://localhost/api/workshops/ws-1/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/workshops/[id]/delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
    (db.$transaction as jest.Mock).mockImplementation(
      async (fn: (...args: unknown[]) => unknown) => fn(db)
    );
    (db.workshop.delete as jest.Mock).mockResolvedValue(mockWorkshop);
    (db.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "coach-1",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });
    const res = await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(res.status).toBe(403);
  });

  it("returns 400 for non-CANCELED/COMPLETED status", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      ...mockWorkshop,
      status: "PRE_EVENT",
    });
    const res = await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("PRE_EVENT");
  });

  it("returns 400 when title confirmation does not match", async () => {
    const res = await POST(asPostRequest({ confirmTitle: "Wrong Title" }), routeParams());
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("confirmation does not match");
  });

  it("queries approvals count via _count", async () => {
    await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(db.workshop.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: expect.objectContaining({
            select: expect.objectContaining({
              approvals: true,
            }),
          }),
        }),
      })
    );
  });

  it("queries workflowStepExecutions count via _count", async () => {
    await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(db.workshop.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: expect.objectContaining({
            select: expect.objectContaining({
              workflowStepExecutions: true,
            }),
          }),
        }),
      })
    );
  });

  it("records approvalsDeleted in audit log", async () => {
    await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PERMANENT_DELETE",
          changes: expect.stringContaining('"approvalsDeleted":2'),
        }),
      })
    );
  });

  it("records workflowExecutionsDeleted in audit log", async () => {
    await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PERMANENT_DELETE",
          changes: expect.stringContaining('"workflowExecutionsDeleted":5'),
        }),
      })
    );
  });

  it("returns success message on valid deletion", async () => {
    const res = await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain("Test Workshop");
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
npm run test -- --testPathPattern="workshop-delete" --no-coverage
```

Expected output: Tests for `approvals` and `workflowStepExecutions` in `_count` will FAIL (those fields don't exist in the route yet). Auth/status/title tests may already PASS — that's fine.

---

## Task 2: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 2.1: Add `onDelete: Cascade` to ApprovalQueue's workshop relation**

In `prisma/schema.prisma` at line 482, replace:

```prisma
  workshop Workshop? @relation(fields: [workshopId], references: [id])
```

With:

```prisma
  workshop Workshop? @relation(fields: [workshopId], references: [id], onDelete: Cascade)
```

- [ ] **Step 2.2: Add `@relation` to WorkflowStepExecution.workshopId**

In `prisma/schema.prisma`, find the `WorkflowStepExecution` model (around line 830). Replace:

```prisma
  workshopId     String    // Which workshop this execution is for
```

With:

```prisma
  workshopId     String    // Which workshop this execution is for
  // Both cascades (step + workshop) are intentional and independent:
  // - step cascade: handles workflow template edits/deletions
  // - workshop cascade: handles workshop permanent deletion
  workshop       Workshop  @relation(fields: [workshopId], references: [id], onDelete: Cascade)
```

- [ ] **Step 2.3: Add `workflowStepExecutions` to the Workshop model's relation list**

In `prisma/schema.prisma`, find line 225 inside the `Workshop` model:

```prisma
  fileAttachments     FileAttachment[]      // JV-12: File attachments
```

Add the new relation on the line immediately after it:

```prisma
  fileAttachments        FileAttachment[]      // JV-12: File attachments
  workflowStepExecutions WorkflowStepExecution[]
```

- [ ] **Step 2.4: Regenerate the Prisma client**

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
npx prisma generate
```

Expected output: `✔ Generated Prisma Client` with no errors.

---

## Task 3: Create and Edit the Migration File

**Files:**
- Create: `prisma/migrations/20260401000000_add_workshop_cascade_deletes/migration.sql`

> **Do NOT run `prisma migrate dev` against the Neon shared database.** Write the migration file manually to avoid prompts, shadow DB issues, or accidental applies.

- [ ] **Step 3.1: Create the migration directory and SQL file**

Create the directory:
```bash
mkdir -p /Users/diushianstand/Scaling-up-platform-v2/src/prisma/migrations/20260401000000_add_workshop_cascade_deletes
```

Create `prisma/migrations/20260401000000_add_workshop_cascade_deletes/migration.sql` with this exact content:

```sql
-- Migration: add_workshop_cascade_deletes
-- Fixes two cascade gaps on workshop permanent deletion.

-- Step 1: Clean up any existing orphaned WorkflowStepExecution rows.
-- These exist because workshopId had no FK constraint before this migration.
-- We must remove them BEFORE adding the FK constraint or the ALTER will fail.
DELETE FROM "workflow_step_executions"
WHERE "workshopId" NOT IN (SELECT "id" FROM "workshops");

-- Step 2: Add FK constraint on workflow_step_executions → workshops (ON DELETE CASCADE).
ALTER TABLE "workflow_step_executions"
  ADD CONSTRAINT "workflow_step_executions_workshopId_fkey"
  FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 3: Drop and recreate the approval_queue → workshops FK with ON DELETE CASCADE.
-- Previously had no onDelete behavior (Prisma default SetNull for optional FK).
ALTER TABLE "approval_queue"
  DROP CONSTRAINT IF EXISTS "approval_queue_workshopId_fkey";

ALTER TABLE "approval_queue"
  ADD CONSTRAINT "approval_queue_workshopId_fkey"
  FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3.2: Apply migration locally to verify it runs clean**

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
npx prisma migrate deploy
```

Expected: `1 migration applied` with no errors. If you see a constraint violation on Step 2, it means orphaned rows exist — the DELETE in Step 1 should have cleared them. If the error persists, check `SELECT * FROM "workflow_step_executions" WHERE "workshopId" NOT IN (SELECT id FROM workshops)` directly.

---

## Task 4: Update the Delete Route (Green Phase)

**Files:**
- Modify: `src/src/app/api/workshops/[id]/delete/route.ts`

- [ ] **Step 4.1: Add `approvals` and `workflowStepExecutions` to the `_count` select**

Find the `_count` block in the `db.workshop.findUnique` call. Replace:

```typescript
        _count: {
          select: {
            registrations: true,
            landingPages: true,
            surveys: true,
          },
        },
```

With:

```typescript
        _count: {
          select: {
            registrations: true,
            landingPages: true,
            surveys: true,
            approvals: true,
            workflowStepExecutions: true,
          },
        },
```

- [ ] **Step 4.2: Update the audit log `changes` JSON**

Find the `changes: JSON.stringify({...})` block. Replace:

```typescript
          changes: JSON.stringify({
            workshopTitle: workshop.title,
            workshopCode: workshop.workshopCode,
            status: workshop.status,
            registrationsDeleted: workshop._count.registrations,
            landingPagesDeleted: workshop._count.landingPages,
            surveysDeleted: workshop._count.surveys,
          }),
```

With:

```typescript
          changes: JSON.stringify({
            workshopTitle: workshop.title,
            workshopCode: workshop.workshopCode,
            status: workshop.status,
            registrationsDeleted: workshop._count.registrations,
            landingPagesDeleted: workshop._count.landingPages,
            surveysDeleted: workshop._count.surveys,
            approvalsDeleted: workshop._count.approvals,
            workflowExecutionsDeleted: workshop._count.workflowStepExecutions,
          }),
```

- [ ] **Step 4.3: Run the tests — they should now pass**

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
npm run test -- --testPathPattern="workshop-delete" --no-coverage
```

Expected: All tests PASS.

---

## Task 5: Fix the Confirmation Dialog Bullet List

**Files:**
- Modify: `src/src/components/workshops/delete-workshop-dialog.tsx`

- [ ] **Step 5.1: Replace the inaccurate bullet list**

Find the `<ul>` block in `delete-workshop-dialog.tsx`. Replace:

```tsx
        <ul className="mt-3 text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li>All registrations</li>
          <li>All landing pages</li>
          <li>All surveys and responses</li>
          <li>All workflow assignments</li>
          <li>All audit history</li>
        </ul>
```

With:

```tsx
        <ul className="mt-3 text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li>All registrations (including paid registration records)</li>
          <li>All landing pages</li>
          <li>All surveys and responses</li>
          <li>All workflow assignments and execution logs</li>
          <li>All approval queue entries for this workshop</li>
          <li>All follow-up reports</li>
          <li>File links (uploaded files remain in Blob storage)</li>
        </ul>
```

> Note: Audit logs are intentionally **preserved** — removed from this list.

---

## Task 6: Full Verification

- [ ] **Step 6.1: Run the full test suite**

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
npm run test -- --no-coverage
```

Expected: All 489 tests PASS (488 existing + 9 new in workshop-delete.test.ts).

- [ ] **Step 6.2: Run a full production build**

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
CI=true npm run build
```

Expected: Build succeeds with 0 type errors.

- [ ] **Step 6.3: Manual end-to-end test**

1. Start the dev server: `npm run dev`
2. Log in as admin
3. Create a test workshop → submit it (this generates an `ApprovalQueue` entry)
4. Approve the workshop (this generates `WorkflowAssignment` + `WorkflowStepExecution` records)
5. Cancel the workshop
6. Open the workshop detail page — confirm the "Delete Permanently" button appears
7. Click it — confirm the updated bullet list shows without "audit history"
8. Type the workshop title and click "Delete Permanently"
9. Confirm redirect to `/workshops`

- [ ] **Step 6.4: Verify clean DB after deletion**

In the Neon console (or local DB), run:

```sql
-- Replace '<deleted_id>' with the actual workshop id from step 6.3
SELECT * FROM approval_queue WHERE "workshopId" = '<deleted_id>';
-- Expected: 0 rows

SELECT * FROM workflow_step_executions WHERE "workshopId" = '<deleted_id>';
-- Expected: 0 rows

SELECT * FROM audit_logs WHERE "entityId" = '<deleted_id>';
-- Expected: rows present (audit log preserved)
```

---

## Task 7: Commit

- [ ] **Step 7.1: Commit all changes**

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
git add \
  prisma/schema.prisma \
  "prisma/migrations/20260401000000_add_workshop_cascade_deletes/migration.sql" \
  src/app/api/workshops/[id]/delete/route.ts \
  src/components/workshops/delete-workshop-dialog.tsx \
  "src/__tests__/api/workshop-delete.test.ts"

git commit -m "fix: cascade workshop deletion to approvals and workflow executions

- Add onDelete: Cascade to ApprovalQueue workshop relation
- Add @relation + onDelete: Cascade to WorkflowStepExecution.workshopId
- Migration prepends orphan cleanup before adding FK constraints
- Delete route now logs approvalsDeleted + workflowExecutionsDeleted counts
- Dialog bullet list corrected: remove 'audit history', add approvals + execution logs

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Request Code Review

> **Invoke `superpowers:requesting-code-review` after the commit in Task 7.**

- [ ] **Step 8.1: Get SHAs and dispatch review**

```bash
BASE_SHA=$(git rev-parse HEAD~1)
HEAD_SHA=$(git rev-parse HEAD)
echo "BASE: $BASE_SHA  HEAD: $HEAD_SHA"
```

Dispatch `superpowers:code-reviewer` with:
- `WHAT_WAS_IMPLEMENTED`: Workshop deletion cascade fix — ApprovalQueue + WorkflowStepExecution
- `PLAN_OR_REQUIREMENTS`: `docs/superpowers/plans/2026-04-01-workshop-deletion-cascade-fix.md`
- `BASE_SHA` / `HEAD_SHA`: from above
- `DESCRIPTION`: Schema cascade fix, migration with orphan cleanup, route _count + audit log update, dialog bullet list correction

- [ ] **Step 8.2: Act on review feedback**
  - **Critical** issues: fix immediately before proceeding
  - **Important** issues: fix before deploy
  - **Minor** issues: note for later
