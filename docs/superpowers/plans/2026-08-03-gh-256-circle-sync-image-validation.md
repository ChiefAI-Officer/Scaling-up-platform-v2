# GH #256 Circle-Sync Coach Image Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Circle sync from persisting a Coach image that fails the existing HTTPS-only policy while preserving unrelated sync work and giving manual operators a nonfatal warning.

**Architecture:** Keep `safeImageSrc` unchanged as the single image policy and enforce it only inside `syncCoachFromCircle` when a Circle avatar is eligible to be written. Return typed warnings from the service, pass them through the manual-import route with truthful three-way outcome copy, and render successful warnings separately in the existing client button.

**Tech Stack:** TypeScript 5, Next.js 16 App Router, React 19, Prisma 5, Jest 30, Testing Library, Tailwind CSS, ESLint, Turbopack.

## Global Constraints

- Reuse `safeImageSrc` unchanged; accept every parseable HTTPS URL regardless of host.
- Validate a Circle avatar only when it is eligible to write: `forceOverwrite === true` or the stored Coach image is empty.
- An invalid eligible avatar omits only `profileImage`, preserves any stored image, continues unrelated field updates, and still advances `syncedAt`.
- Every `SyncResult` has a `warnings` array. The rejection warning is exactly `{ code: "invalid-image-url", field: "profileImage", message: "Profile image skipped because Circle supplied an invalid URL." }`.
- Manual sync remains HTTP `200` and `success: true` for an avatar rejection.
- Manual base copy is exactly:
  - changed fields: `Synced N field(s) from Circle.`;
  - no changed fields plus warnings: `Sync completed; no profile fields were updated.`;
  - no changed fields and no warnings: `Coach profile already up to date.`
- Render successful warnings in a separate amber, non-destructive `role="status"` block and render every warning.
- Emit field-skipped telemetry only after the Prisma update succeeds. Log only `coachId`, sync mode, `field`, and reason; never log the email, raw URL, profile payload, query string, or warning message.
- Emit one warning for every rejected eligible sync attempt; add no deduplication state.
- Add no host allowlist, proxy, image download/rehosting, policy change, migration, schema change, feature flag, data repair, backfill, or production fixture.
- Leave GH #256 open for its host-policy decision. Release only the narrow issue #261 claim after this slice is merged and verified.
- Preserve the separately owned GH #257 reconciliation work.
- Update `CLAUDE.md` and prepend `plans/CHANGELOG.md` in the implementation PR. Do not claim this slice is merged, live, or all of GH #256 is resolved before exact evidence exists.

## File Map

- Modify `src/src/services/circle-sync.ts`: define the warning contract, apply `safeImageSrc` at the eligible write boundary, return warnings on every result, and log after persistence.
- Modify `src/src/__tests__/unit/circle-sync.test.ts`: pin valid, invalid, forced, ineligible, persistence-failure, PII-safe logging, and repeated-attempt behavior.
- Modify `src/src/app/api/coaches/[id]/circle-import/route.ts`: serialize warnings and select the approved three-way base message.
- Create `src/src/__tests__/api/coaches-circle-import.test.ts`: pin HTTP status, response warnings, base messages, and existing failure mapping.
- Modify `src/src/components/coach/circle-sync-button.tsx`: retain the base result and display every successful warning in a separate amber status block.
- Create `src/src/__tests__/components/coach/circle-sync-button.test.tsx`: pin success, multiple-warning, error, refresh, and accessible warning behavior.
- Consume `src/src/lib/assessments/safe-image-src.ts` unchanged.
- Modify `CLAUDE.md`: update the freshness anchor and concise active-state summary without displacing GH #257.
- Modify `plans/CHANGELOG.md`: prepend the implementation and local-verification receipt with the host-policy residual stated explicitly.

---

### Task 1: Enforce the Coach image policy in the Circle-sync service

**Files:**
- Modify: `src/src/__tests__/unit/circle-sync.test.ts:1-150`
- Modify: `src/src/services/circle-sync.ts:1-96`
- Consume unchanged: `src/src/lib/assessments/safe-image-src.ts`

**Interfaces:**
- Consumes: `safeImageSrc(raw: string | null | undefined): string | null`, `getCircleProfileByEmail(email): Promise<CircleProfile | null>`, and `db.coach.update`.
- Produces:

```ts
export interface SyncWarning {
  code: "invalid-image-url";
  field: "profileImage";
  message: string;
}

export interface SyncResult {
  success: boolean;
  updated: boolean;
  fieldsUpdated: string[];
  warnings: SyncWarning[];
  error?: string;
}
```

- [ ] **Step 1: Reconcile upstream and shared-claim state before feature work**

Run from the repository root:

```bash
git status --short --branch
git fetch origin main --prune
gh issue view 256 --repo ChiefAI-Officer/Scaling-up-platform-v2 --comments
gh issue view 261 --repo ChiefAI-Officer/Scaling-up-platform-v2 --comments
gh pr list --repo ChiefAI-Officer/Scaling-up-platform-v2 --state all --limit 200 \
  --json number,title,state,headRefName,url \
  --jq '.[] | select((.headRefName | test("256|circle|avatar|profile.?image"; "i")) or (.title | test("256|circle|avatar|profile.?image"; "i")))'
git log --left-right --cherry-pick --oneline origin/main...HEAD
```

Expected: branch `codex/256-circle-sync-image-validation`; issue #256 open; issue
#261 comment `5162188735` claims only this slice for this branch; no competing
implementation PR. If `origin/main` advanced, inspect its delta, rebase this
unpushed branch normally, and rerun this step before editing.

- [ ] **Step 2: Add the warning fixture and console spy to the service suite**

Add beside the imports:

```ts
const invalidImageWarning = {
  code: "invalid-image-url",
  field: "profileImage",
  message: "Profile image skipped because Circle supplied an invalid URL.",
} as const;
```

Extend the suite setup:

```ts
let warnSpy: jest.SpiedFunction<typeof console.warn>;

beforeEach(() => {
  jest.resetAllMocks();
  process.env.CIRCLE_API_KEY = "test-key";
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});
```

Keep the existing `afterAll` restoration of `CIRCLE_API_KEY`. Add
`expect(result.warnings).toEqual([])` to the existing configuration-error,
not-found, valid-fill, default-mode, and forced-mode result assertions.

- [ ] **Step 3: Add failing field-local rejection tests**

First pin the currently untested Coach-record not-found result:

```ts
it("returns Coach not found with no warnings", async () => {
  (db.coach.findUnique as jest.Mock).mockResolvedValue(null);

  const result = await syncCoachFromCircle("coach-1");

  expect(result).toEqual({
    success: false,
    updated: false,
    fieldsUpdated: [],
    warnings: [],
    error: "Coach not found",
  });
  expect(getCircleProfileByEmail).not.toHaveBeenCalled();
  expect(db.coach.update).not.toHaveBeenCalled();
});
```

Then add these cases to `circle-sync.test.ts`:

```ts
it("rejects an eligible non-https avatar but persists unrelated fields", async () => {
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    email: "coach@example.com",
    bio: null,
    profileImage: null,
    company: null,
    circleId: null,
  });
  (getCircleProfileByEmail as jest.Mock).mockResolvedValue({
    memberId: "circle-123",
    bio: "Circle bio",
    avatarUrl: "http://cdn.example.com/private?token=SECRET",
    title: "Scaling Up Coach",
  });

  const result = await syncCoachFromCircle("coach-1");

  const updateCall = (db.coach.update as jest.Mock).mock.calls[0][0];
  expect(updateCall.data.profileImage).toBeUndefined();
  expect(updateCall.data).toEqual(
    expect.objectContaining({
      bio: "Circle bio",
      company: "Scaling Up Coach",
      circleId: "circle-123",
      syncedAt: expect.any(Date),
    }),
  );
  expect(result).toEqual({
    success: true,
    updated: true,
    fieldsUpdated: ["bio", "company", "circleId"],
    warnings: [invalidImageWarning],
  });
  expect(warnSpy).toHaveBeenCalledWith("[Circle Sync] Field skipped", {
    coachId: "coach-1",
    syncMode: "fill-empty",
    field: "profileImage",
    reason: "invalid-image-url",
  });
  expect(warnSpy.mock.invocationCallOrder[0]).toBeGreaterThan(
    (db.coach.update as jest.Mock).mock.invocationCallOrder[0],
  );
  expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("coach@example.com");
  expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("SECRET");
});

it("forceOverwrite preserves an existing image when the Circle avatar is invalid", async () => {
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    email: "coach@example.com",
    bio: "Existing bio",
    profileImage: "https://existing.example.com/photo.jpg",
    company: "Existing company",
    circleId: "circle-old",
  });
  (getCircleProfileByEmail as jest.Mock).mockResolvedValue({
    memberId: "circle-new",
    bio: "New bio",
    avatarUrl: "javascript:alert(1)",
    title: "New title",
  });

  const result = await syncCoachFromCircle("coach-1", { forceOverwrite: true });

  const updateCall = (db.coach.update as jest.Mock).mock.calls[0][0];
  expect(updateCall.data.profileImage).toBeUndefined();
  expect(updateCall.data).toEqual(
    expect.objectContaining({
      bio: "New bio",
      company: "New title",
      circleId: "circle-new",
      syncedAt: expect.any(Date),
    }),
  );
  expect(result.fieldsUpdated).toEqual(["bio", "company", "circleId"]);
  expect(result.warnings).toEqual([invalidImageWarning]);
  expect(warnSpy).toHaveBeenCalledWith("[Circle Sync] Field skipped", {
    coachId: "coach-1",
    syncMode: "force-overwrite",
    field: "profileImage",
    reason: "invalid-image-url",
  });
});

it("does not validate or warn about an ineligible avatar in fill-empty mode", async () => {
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    email: "coach@example.com",
    bio: "Existing bio",
    profileImage: "https://existing.example.com/photo.jpg",
    company: "Existing company",
    circleId: "circle-123",
  });
  (getCircleProfileByEmail as jest.Mock).mockResolvedValue({
    memberId: "circle-123",
    bio: "Ignored bio",
    avatarUrl: "http://ignored.example.com/avatar.jpg",
    title: "Ignored title",
  });

  const result = await syncCoachFromCircle("coach-1");

  expect((db.coach.update as jest.Mock).mock.calls[0][0].data).toEqual({
    syncedAt: expect.any(Date),
  });
  expect(result).toEqual({
    success: true,
    updated: false,
    fieldsUpdated: [],
    warnings: [],
  });
  expect(warnSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Add failing image-only, database-failure, and repeated-attempt tests**

Add these cases:

```ts
it("returns success updated=false when only an eligible invalid avatar is skipped", async () => {
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    email: "coach@example.com",
    bio: "Existing bio",
    profileImage: null,
    company: "Existing company",
    circleId: "circle-123",
  });
  (getCircleProfileByEmail as jest.Mock).mockResolvedValue({
    memberId: "circle-123",
    avatarUrl: "https://",
  });

  const result = await syncCoachFromCircle("coach-1");

  expect((db.coach.update as jest.Mock).mock.calls[0][0].data).toEqual({
    syncedAt: expect.any(Date),
  });
  expect(result).toEqual({
    success: true,
    updated: false,
    fieldsUpdated: [],
    warnings: [invalidImageWarning],
  });
});

it("emits no field-skipped warning when persistence fails", async () => {
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    email: "coach@example.com",
    bio: null,
    profileImage: null,
    company: null,
    circleId: null,
  });
  (getCircleProfileByEmail as jest.Mock).mockResolvedValue({
    avatarUrl: "http://cdn.example.com/avatar.jpg",
  });
  (db.coach.update as jest.Mock).mockRejectedValue(new Error("database unavailable"));

  const result = await syncCoachFromCircle("coach-1");

  expect(warnSpy).not.toHaveBeenCalled();
  expect(result).toEqual({
    success: false,
    updated: false,
    fieldsUpdated: [],
    warnings: [],
    error: "database unavailable",
  });
});

it("emits one warning for every repeated eligible sync attempt", async () => {
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    email: "coach@example.com",
    bio: "Existing bio",
    profileImage: null,
    company: "Existing company",
    circleId: "circle-123",
  });
  (getCircleProfileByEmail as jest.Mock).mockResolvedValue({
    memberId: "circle-123",
    avatarUrl: "data:image/png;base64,abc",
  });

  await syncCoachFromCircle("coach-1");
  await syncCoachFromCircle("coach-1");

  expect(db.coach.update).toHaveBeenCalledTimes(2);
  expect(warnSpy).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 5: Run the focused suite and verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/unit/circle-sync.test.ts --runInBand
```

Expected: new tests fail because invalid avatars are written, `warnings` is
missing, and no structured field-skipped warning exists.

- [ ] **Step 6: Implement the minimal service contract**

Add the import:

```ts
import { safeImageSrc } from "@/lib/assessments/safe-image-src";
```

Add `SyncWarning` and the mandatory `warnings` field shown in this task's
Interfaces block. Add `warnings: []` to every configuration, not-found,
no-Circle-profile, and catch-path result.

Replace the avatar payload block with:

```ts
const warnings: SyncWarning[] = [];
const syncMode = forceOverwrite ? "force-overwrite" : "fill-empty";

if (profile.avatarUrl && (forceOverwrite || !coach.profileImage)) {
    const safeAvatarUrl = safeImageSrc(profile.avatarUrl);
    if (safeAvatarUrl) {
        updateData.profileImage = safeAvatarUrl;
        fieldsUpdated.push("profileImage");
    } else {
        warnings.push({
            code: "invalid-image-url",
            field: "profileImage",
            message: "Profile image skipped because Circle supplied an invalid URL.",
        });
    }
}
```

Immediately after the successful `await db.coach.update(...)`, add:

```ts
for (const warning of warnings) {
    console.warn("[Circle Sync] Field skipped", {
        coachId,
        syncMode,
        field: warning.field,
        reason: warning.code,
    });
}
```

Return:

```ts
return {
    success: true,
    updated: fieldsUpdated.length > 0,
    fieldsUpdated,
    warnings,
};
```

- [ ] **Step 7: Run focused tests, lint, and diff validation**

Run from `src/`:

```bash
npx jest src/__tests__/unit/circle-sync.test.ts --runInBand
npx eslint src/services/circle-sync.ts src/__tests__/unit/circle-sync.test.ts
git diff --check
```

Expected: the Circle-sync suite passes; ESLint exits `0`; diff check is silent.

- [ ] **Step 8: Commit the service slice**

```bash
git add src/src/services/circle-sync.ts src/src/__tests__/unit/circle-sync.test.ts
git commit -m "fix(coaches): validate Circle-synced Coach images"
```

---

### Task 2: Expose truthful warning outcomes from the manual-import route

**Files:**
- Create: `src/src/__tests__/api/coaches-circle-import.test.ts`
- Modify: `src/src/app/api/coaches/[id]/circle-import/route.ts:54-105`

**Interfaces:**
- Consumes: `syncCoachFromCircle(id, { forceOverwrite: true }): Promise<SyncResult>` from Task 1.
- Produces a successful JSON response with:

```ts
{
  success: true;
  data: CoachResponse | null;
  fieldsUpdated: string[];
  warnings: SyncWarning[];
  message: string;
}
```

- [ ] **Step 1: Create the focused route test harness**

Create `coaches-circle-import.test.ts` with:

```ts
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
    coach: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/services/circle-sync", () => ({
  syncCoachFromCircle: jest.fn(),
}));

import { POST } from "@/app/api/coaches/[id]/circle-import/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { syncCoachFromCircle } from "@/services/circle-sync";

const warning = {
  code: "invalid-image-url",
  field: "profileImage",
  message: "Profile image skipped because Circle supplied an invalid URL.",
};

const updatedCoach = {
  id: "coach-1",
  email: "coach@example.com",
  firstName: "Jane",
  lastName: "Coach",
  company: "Scaling Up Coach",
  bio: "Circle bio",
  profileImage: "https://existing.example.com/photo.jpg",
  circleId: "circle-123",
  syncedAt: new Date("2026-08-03T00:00:00.000Z"),
};

function routeParams(id = "coach-1") {
  return { params: Promise.resolve({ id }) };
}

function request() {
  return new Request("http://localhost/api/coaches/coach-1/circle-import", {
    method: "POST",
  }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  jest.resetAllMocks();
  (getApiActor as jest.Mock).mockResolvedValue({
    userId: "admin-1",
    email: "admin@example.com",
    role: "ADMIN",
    coachId: null,
  });
  (db.coach.findUnique as jest.Mock)
    .mockResolvedValueOnce({ id: "coach-1", email: "coach@example.com" })
    .mockResolvedValueOnce(updatedCoach);
});
```

- [ ] **Step 2: Add failing response and message tests**

Append:

```ts
it("returns changed fields and nonfatal warnings with the changed-fields message", async () => {
  (syncCoachFromCircle as jest.Mock).mockResolvedValue({
    success: true,
    updated: true,
    fieldsUpdated: ["bio", "company"],
    warnings: [warning],
  });

  const response = await POST(request(), routeParams());
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.fieldsUpdated).toEqual(["bio", "company"]);
  expect(body.warnings).toEqual([warning]);
  expect(body.message).toBe("Synced 2 field(s) from Circle.");
});

it("uses warned-without-changes copy for an image-only rejection", async () => {
  (syncCoachFromCircle as jest.Mock).mockResolvedValue({
    success: true,
    updated: false,
    fieldsUpdated: [],
    warnings: [warning],
  });

  const response = await POST(request(), routeParams());
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.warnings).toEqual([warning]);
  expect(body.message).toBe("Sync completed; no profile fields were updated.");
  expect(body.message).not.toBe("Coach profile already up to date.");
});

it("keeps already-current copy when there are no warnings", async () => {
  (syncCoachFromCircle as jest.Mock).mockResolvedValue({
    success: true,
    updated: false,
    fieldsUpdated: [],
    warnings: [],
  });

  const response = await POST(request(), routeParams());
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.warnings).toEqual([]);
  expect(body.message).toBe("Coach profile already up to date.");
});

it.each([
  ["Coach not found", 404],
  ["No Circle profile found for this email", 404],
  ["Circle not configured", 503],
  ["database unavailable", 500],
])("preserves the existing %s failure mapping", async (error, status) => {
  (syncCoachFromCircle as jest.Mock).mockResolvedValue({
    success: false,
    updated: false,
    fieldsUpdated: [],
    warnings: [],
    error,
  });

  const response = await POST(request(), routeParams());
  const body = await response.json();

  expect(response.status).toBe(status);
  expect(body).toEqual({ success: false, error });
});
```

- [ ] **Step 3: Run the route suite and verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/api/coaches-circle-import.test.ts --runInBand
```

Expected: success cases fail because the route omits `warnings` and still uses
the two-way message branch.

- [ ] **Step 4: Implement warning serialization and three-way copy**

Before the successful response, add:

```ts
const message = result.updated
  ? `Synced ${result.fieldsUpdated.length} field(s) from Circle.`
  : result.warnings.length > 0
    ? "Sync completed; no profile fields were updated."
    : "Coach profile already up to date.";
```

Replace the response tail with:

```ts
return NextResponse.json({
  success: true,
  data: responseData,
  fieldsUpdated: result.fieldsUpdated,
  warnings: result.warnings,
  message,
});
```

- [ ] **Step 5: Run route and service regressions**

Run from `src/`:

```bash
npx jest \
  src/__tests__/api/coaches-circle-import.test.ts \
  src/__tests__/unit/circle-sync.test.ts \
  --runInBand
npx eslint \
  'src/app/api/coaches/[id]/circle-import/route.ts' \
  src/__tests__/api/coaches-circle-import.test.ts
git diff --check
```

Expected: both suites pass; ESLint exits `0`; diff check is silent.

- [ ] **Step 6: Commit the API slice**

```bash
git add \
  'src/src/app/api/coaches/[id]/circle-import/route.ts' \
  src/src/__tests__/api/coaches-circle-import.test.ts
git commit -m "feat(coaches): report Circle image sync warnings"
```

---

### Task 3: Present successful warnings in the manual-sync button

**Files:**
- Create: `src/src/__tests__/components/coach/circle-sync-button.test.tsx`
- Modify: `src/src/components/coach/circle-sync-button.tsx:1-61`

**Interfaces:**
- Consumes the Task 2 response fields `success`, `message`, and
  `warnings: Array<{ code: string; field: string; message: string }>`.
- Produces the unchanged success/error base result plus a separate amber
  `role="status"` warning block on successful partial syncs.

- [ ] **Step 1: Create failing component tests**

Create `circle-sync-button.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CircleSyncButton } from "@/components/coach/circle-sync-button";

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  global.fetch = originalFetch;
});

it("keeps success copy and renders a nonfatal warning separately", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      message: "Synced 2 field(s) from Circle.",
      warnings: [
        {
          code: "invalid-image-url",
          field: "profileImage",
          message: "Profile image skipped because Circle supplied an invalid URL.",
        },
      ],
    }),
  });

  render(<CircleSyncButton coachId="coach-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Sync from Circle" }));

  const success = await screen.findByText("Synced 2 field(s) from Circle.");
  expect(success).toHaveClass("text-success");
  const status = screen.getByRole("status");
  expect(status).toHaveClass("border-warning/20", "bg-warning/10");
  expect(status).toHaveTextContent(
    "Profile image skipped because Circle supplied an invalid URL.",
  );
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it("renders every successful warning", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      message: "Sync completed; no profile fields were updated.",
      warnings: [
        {
          code: "invalid-image-url",
          field: "profileImage",
          message: "Profile image skipped because Circle supplied an invalid URL.",
        },
        {
          code: "future-warning",
          field: "company",
          message: "A second nonfatal warning.",
        },
      ],
    }),
  });

  render(<CircleSyncButton coachId="coach-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Sync from Circle" }));

  const status = await screen.findByRole("status");
  expect(within(status).getAllByRole("listitem")).toHaveLength(2);
  expect(status).toHaveTextContent("A second nonfatal warning.");
  expect(
    screen.queryByText("Coach profile already up to date."),
  ).not.toBeInTheDocument();
});

it("retains destructive styling for a failed sync and renders no warning block", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({
      success: false,
      error: "Circle not configured",
    }),
  });

  render(<CircleSyncButton coachId="coach-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Sync from Circle" }));

  const error = await screen.findByText("Circle not configured");
  expect(error).toHaveClass("text-destructive");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(mockRefresh).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the component suite and verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/components/coach/circle-sync-button.test.tsx --runInBand
```

Expected: warning assertions fail because the component discards the response
warning array and has no amber status block.

- [ ] **Step 3: Extend the component result state**

Add:

```ts
interface SyncWarning {
    code: string;
    field: string;
    message: string;
}

interface SyncResultState {
    type: "success" | "error";
    text: string;
    warnings: SyncWarning[];
}
```

Change the state declaration to:

```ts
const [result, setResult] = useState<SyncResultState | null>(null);
```

Use these exact state updates:

```ts
setResult({
    type: "success",
    text: data.message || "Synced from Circle.",
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
});
```

```ts
setResult({
    type: "error",
    text: data.error || "Failed to sync from Circle.",
    warnings: [],
});
```

```ts
setResult({
    type: "error",
    text: "Network error. Please try again.",
    warnings: [],
});
```

- [ ] **Step 4: Render every successful warning separately**

Keep the existing result paragraph. Immediately after it, add:

```tsx
{result?.type === "success" && result.warnings.length > 0 && (
    <div
        role="status"
        className="rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning-foreground"
    >
        <ul className="space-y-1">
            {result.warnings.map((warning, index) => (
                <li key={`${warning.code}-${warning.field}-${index}`}>
                    {warning.message}
                </li>
            ))}
        </ul>
    </div>
)}
```

- [ ] **Step 5: Run component, route, and service regressions**

Run from `src/`:

```bash
npx jest \
  src/__tests__/components/coach/circle-sync-button.test.tsx \
  src/__tests__/api/coaches-circle-import.test.ts \
  src/__tests__/unit/circle-sync.test.ts \
  --runInBand
npx eslint \
  src/components/coach/circle-sync-button.tsx \
  src/__tests__/components/coach/circle-sync-button.test.tsx
git diff --check
```

Expected: all three suites pass; ESLint exits `0`; diff check is silent.

- [ ] **Step 6: Commit the UI slice**

```bash
git add \
  src/src/components/coach/circle-sync-button.tsx \
  src/src/__tests__/components/coach/circle-sync-button.test.tsx
git commit -m "feat(coaches): display Circle sync warnings"
```

---

### Task 4: Record the implementation SoT and run local release gates

**Files:**
- Modify: `plans/CHANGELOG.md:8`
- Modify: `CLAUDE.md:21-34`
- Test: `src/src/__tests__/lint/changelog-freshness.test.ts`

**Interfaces:**
- Consumes the verified Task 1–3 commits and their exact command output.
- Produces top CHANGELOG slug `gh-256-circle-sync-image-validation-pr-ready`, a
  matching `CLAUDE.md` freshness anchor, and complete local gate evidence.

- [ ] **Step 1: Prepend the implementation receipt**

Add immediately after the CHANGELOG preamble:

```markdown
<a id="gh-256-circle-sync-image-validation-pr-ready"></a>
### 2026-08-03 — Circle-sync Coach image validation implemented (GH #256 slice) <!-- ENTRY_ISO:2026-08-03 ENTRY_SLUG:gh-256-circle-sync-image-validation-pr-ready -->

**Status: IMPLEMENTED + LOCALLY VERIFIED; not yet merged or launched.** Circle sync now applies the existing HTTPS-only `safeImageSrc` policy immediately before an eligible Circle avatar would be written to the stored Coach image. A rejected avatar preserves existing image state in both fill-empty and forced modes, does not block unrelated field updates, and still advances `syncedAt`.

**Operator and telemetry behavior.** Manual import remains successful and reports every nonfatal warning separately from truthful changed / warned-without-changes / already-current base copy. PII-safe field-skipped telemetry emits only after persistence and contains Coach ID, sync mode, field, and reason without the raw URL or email. Repeated eligible attempts emit repeated events; failed persistence emits no field-skipped event.

**Scope and tracking boundary.** This slice changes no host policy: arbitrary parseable HTTPS hosts remain accepted. There is no proxy, rehosting, migration, schema, feature flag, backfill, repair, or production-data write. GH #256 remains open for the allowlist/proxy/accept-arbitrary-HTTPS product decision; only its Circle-sync validation checkbox and the narrow issue #261 claim become eligible for closeout after merge and production verification. GH #257 remains separately owned.
```

Append a local-verification paragraph after running Steps 3–4. Record the exact
Jest suite/test totals and the exit-zero ESLint, migration-safety, diff-check,
and Turbopack receipts. Do not claim merge, deployment, issue completion, or
claim release.

- [ ] **Step 2: Update the concise project anchor and active item**

Set the Project Context anchor to:

```html
<!-- LAST_UPDATED_ISO:2026-08-03 LAST_UPDATED_SLUG:gh-256-circle-sync-image-validation-pr-ready -->
```

The adjacent prose must state that the narrow GH #256 Circle-sync validation
slice is implemented and locally verified but not merged, that host policy
remains open, and that GH #257 remains separately claimed.

Add this Current Status bullet without removing or weakening the GH #257 bullet:

```markdown
- **GH #256 narrow Circle-sync Coach image validation:** **IMPLEMENTED + LOCALLY VERIFIED; not yet merged.** Eligible Circle avatars now pass through the existing HTTPS-only image policy before persistence; rejected avatars preserve the stored image, continue unrelated sync work, and produce successful operator warnings plus PII-safe post-persistence telemetry. Arbitrary HTTPS hosts remain accepted, GH #256 stays open for host policy, and the narrow claim remains active until protected merge and production verification.
```

- [ ] **Step 3: Run the complete focused regression matrix**

Run from `src/`:

```bash
npx jest \
  src/__tests__/unit/circle-sync.test.ts \
  src/__tests__/api/coaches-circle-import.test.ts \
  src/__tests__/components/coach/circle-sync-button.test.tsx \
  src/__tests__/components/assessments/coach-logo.test.tsx \
  src/__tests__/unit/validations.test.ts \
  src/__tests__/lib/assessments/invitation-email.test.ts \
  src/__tests__/lint/changelog-freshness.test.ts \
  --runInBand
```

Expected: every listed suite and test passes. Record the printed totals in the
new CHANGELOG entry.

- [ ] **Step 4: Run changed-file and repository release gates**

Run from `src/`:

```bash
npx eslint \
  src/services/circle-sync.ts \
  'src/app/api/coaches/[id]/circle-import/route.ts' \
  src/components/coach/circle-sync-button.tsx \
  src/__tests__/unit/circle-sync.test.ts \
  src/__tests__/api/coaches-circle-import.test.ts \
  src/__tests__/components/coach/circle-sync-button.test.tsx
node scripts/check-migration-safety.mjs
git diff --check
CI=true npx next build --turbopack
```

Expected: ESLint exits `0`; migration safety reports no unapproved destructive
operation; diff check emits no output; the production build exits `0`.

- [ ] **Step 5: Commit the SoT receipt**

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(sot): record GH 256 Circle-sync validation"
```

---

### Task 5: Publish, verify, and close only the narrow slice

**Files:**
- No new product files.
- Verify the complete branch diff against `origin/main`.
- After protected merge, create a launch-receipt docs branch only if exact
  deployment evidence cannot be added before merge.

**Interfaces:**
- Consumes the clean, fully gated branch from Task 4.
- Produces a reviewed protected PR, exact production deployment evidence, a
  released narrow issue #261 claim, the validation checkbox marked complete,
  and GH #256 left open for host policy.

- [ ] **Step 1: Reconcile current main, claims, branches, and PRs again**

```bash
git fetch origin main --prune
gh issue view 256 --repo ChiefAI-Officer/Scaling-up-platform-v2 --comments
gh issue view 261 --repo ChiefAI-Officer/Scaling-up-platform-v2 --comments
gh pr list --repo ChiefAI-Officer/Scaling-up-platform-v2 --state all --limit 200 \
  --json number,title,state,headRefName,url \
  --jq '.[] | select((.headRefName | test("256|circle|avatar|profile.?image"; "i")) or (.title | test("256|circle|avatar|profile.?image"; "i")))'
git log --left-right --cherry-pick --oneline origin/main...HEAD
git diff --stat origin/main...HEAD
```

Expected: the claim still names this branch and no competing implementation has
landed. Reconcile any new `main` commits without force-pushing, then rerun Task 4
gates.

- [ ] **Step 2: Push and open a draft PR**

```bash
git push -u origin codex/256-circle-sync-image-validation
gh pr create \
  --repo ChiefAI-Officer/Scaling-up-platform-v2 \
  --base main \
  --head codex/256-circle-sync-image-validation \
  --draft \
  --title "fix(coaches): validate Circle-synced Coach images" \
  --body "Refs #256. Implements only the claimed Circle-sync HTTPS-validation slice. Host allowlisting, proxying, and rehosting remain unresolved on the open issue. Includes field-local rejection, successful operator warnings, PII-safe post-persistence telemetry, focused tests, and SoT updates."
```

Expected: one draft PR targeting `main`; its body does not contain
`Closes #256`.

- [ ] **Step 3: Complete review before merge**

Request the repository's normal approving review and run the existing review
loop. Do not merge while any review round is running. Confirm:

```bash
gh pr checks --repo ChiefAI-Officer/Scaling-up-platform-v2 --watch
gh pr view --repo ChiefAI-Officer/Scaling-up-platform-v2 \
  --json number,state,isDraft,mergeable,reviewDecision,statusCheckRollup
```

Expected before promotion: all required checks pass, `mergeable` is
`MERGEABLE`, review decision is approved, and every actionable review finding
has a verified resolution.

- [ ] **Step 4: Promote and merge through the protected path**

```bash
gh pr ready --repo ChiefAI-Officer/Scaling-up-platform-v2
gh pr merge --repo ChiefAI-Officer/Scaling-up-platform-v2 --squash --delete-branch
```

Expected: protected merge succeeds only after approval and required checks.

- [ ] **Step 5: Verify the exact production deployment without manufacturing invalid data**

Resolve the immutable merge evidence:

```bash
gh pr view --repo ChiefAI-Officer/Scaling-up-platform-v2 \
  --json number,mergedAt,mergeCommit,url
npx vercel ls scaling-up-platform-v2 --yes
curl -fsS https://scaling-up-platform-v2.vercel.app/api/health
curl -fsS https://platformtest.scalingup.com/api/health
```

Match the Ready production deployment to the PR merge SHA. Verify both required
production aliases return HTTP `200` with healthy database and safe auth
posture. Do not create an invalid Circle profile, mutate a Coach image, run a
backfill, or trigger a production manual sync merely to produce telemetry.

- [ ] **Step 6: Release only the narrow claim and preserve the host-policy residual**

Read the current issue bodies first. Edit claim-board comment `5162188735` from
`CLAIM` to `DONE`, naming the actual PR number, merge SHA, Ready deployment, and
read-only health receipt. On GH #256, check only:

```markdown
- [x] Validate in `circle-sync.ts` at minimum to the same scheme policy.
```

Leave the host-policy checkbox unchecked and leave GH #256 open. Add an issue
comment stating that the Circle-sync write-path slice shipped, arbitrary HTTPS
hosts remain accepted, and no proxy/rehosting decision was made.

- [ ] **Step 7: Record exact launch evidence**

If the implementation PR could not contain post-merge deployment evidence,
create a docs-only branch from current `origin/main`, prepend a launch receipt
to `plans/CHANGELOG.md`, and update the `CLAUDE.md` freshness anchor. The receipt
must name the PR, merge SHA, Ready deployment, alias health results, narrow
claim release, checked validation item, and still-open host-policy item.

Run from `src/`:

```bash
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
git diff --check
```

Expected: changelog freshness passes and diff check is silent. Publish the
docs-only closeout through the same protected review path.
