# Jeff's Revisions Iteration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple templates from workshops, enforce coach bio completeness before submission, auto-publish pages on approval, lock coaches out of editing after approval, and add price display to the coach portal.

**Architecture:** New `PageTemplate` model replaces the dual-purpose `LandingPage` for templates. Auto-build queries `PageTemplate` instead of `LandingPage.isActiveTemplate`. Coach bio validation gates workshop requests at both UI and API layers. Post-approval lockdown adds status checks to PATCH/DELETE handlers.

**Tech Stack:** Next.js 16 App Router, Prisma 6 (PostgreSQL/Neon), Zod, Jest, Inngest

**Spec:** `docs/superpowers/specs/2026-03-26-jeff-revisions-iteration-design.md`

**Base path:** All file paths are relative to `/Users/diushianstand/Scaling-up-platform-v2/src/`

---

## Phase 1: Quick Wins (Fix #3 + Fix #4)

### Task 1: Add price display to coach workshop detail

**Files:**
- Modify: `src/app/(portal)/portal/workshops/[id]/page.tsx:42-66` (workshop query select)
- Modify: `src/app/(portal)/portal/workshops/[id]/page.tsx:167-188` (Event Details card)

- [ ] **Step 1: Add `pricingTier` to workshop query**

In `src/app/(portal)/portal/workshops/[id]/page.tsx`, find the workshop query select clause (line ~63, after `pricingTierId: true,`) and add:

```typescript
pricingTier: { select: { name: true, amountCents: true } },
```

- [ ] **Step 2: Add price row in Event Details card**

After the Format `<p>` block (line ~168, after `<p><span className="font-medium">Format:</span> {workshop.format}</p>`), add:

```tsx
            <p>
              <span className="font-medium">Price:</span>{" "}
              {workshop.isFree
                ? "Free"
                : workshop.pricingTier
                  ? `${formatUsdFromCents(workshop.pricingTier.amountCents)} \u2014 ${workshop.pricingTier.name}`
                  : workshop.priceCents
                    ? formatUsdFromCents(workshop.priceCents)
                    : "TBD"}
            </p>
```

`formatUsdFromCents` is already imported at line 13 from `@/lib/workshop-financials`.

- [ ] **Step 3: Verify no type errors**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "portal/workshops"
```
Expected: No errors related to this file.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(portal\)/portal/workshops/\[id\]/page.tsx
git commit -m "feat: add price display to coach workshop detail page (Fix #3)"
```

---

### Task 2: Add title/description to R4B landing page sync

**Files:**
- Modify: `src/app/api/workshops/[id]/route.ts:325` (syncFields array)
- Modify: `src/lib/template-interpolation.ts:79-86` (buildWorkshopVariables return)

- [ ] **Step 1: Expand syncFields in PATCH route**

In `src/app/api/workshops/[id]/route.ts`, line 325, replace:

```typescript
const syncFields = ["eventDate", "eventTime", "timezone", "virtualLink", "venueName", "venueAddress"] as const;
```

with:

```typescript
const syncFields = ["title", "description", "eventDate", "eventTime", "timezone", "virtualLink", "venueName", "venueAddress"] as const;
```

- [ ] **Step 2: Add heroTitle/heroSubtitle to buildWorkshopVariables**

In `src/lib/template-interpolation.ts`, inside the return object of `buildWorkshopVariables` (after line 85, `eventTime: workshop.eventTime || "",`), add:

```typescript
        // Structured JSON field mappings for solo-landing editor content
        heroTitle: workshop.title,
        heroSubtitle: workshop.description || "",
        aboutDescription: workshop.description || "",
```

- [ ] **Step 3: Verify no type errors**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "template-interpolation\|workshops/\[id\]/route"
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/workshops/\[id\]/route.ts src/lib/template-interpolation.ts
git commit -m "feat: sync title/description changes to landing pages via R4B (Fix #4)"
```

---

## Phase 2: Coach Bio Validation + Auto-Publish + Lockdown (Fix #2)

### Task 3: Schema — add `Coach.title` field

**Files:**
- Modify: `prisma/schema.prisma:77` (Coach model)

- [ ] **Step 1: Add title field to Coach model**

In `prisma/schema.prisma`, in the Coach model (after line 77, `company String?`), add:

```prisma
  title             String?   // Professional title/credentials, e.g., "Scaling Up Certified Coach"
```

- [ ] **Step 2: Create migration**

Run:
```bash
cd src && npx prisma migrate dev --name add_coach_title_field
```
Expected: Migration created and applied successfully.

- [ ] **Step 3: Regenerate Prisma client**

Run:
```bash
cd src && npx prisma generate
```
Expected: "Generated Prisma Client"

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "schema: add Coach.title field for professional title/credentials"
```

---

### Task 3b: Add `Coach.title` to profile form + API

**Files:**
- Modify: `src/components/coach/coach-profile-form.tsx` (add title field to form)
- Modify: `src/app/api/portal/profile/route.ts` (accept title in PATCH)

> **Context:** The existing form has a "Title / Credentials" field that maps to `coach.company`. The new `Coach.title` field (added in Task 3) is separate — it represents the coach's professional title/credentials (e.g., "Scaling Up Certified Coach"), while `company` is their business entity (e.g., "Smith Consulting LLC"). Without this task, the bio validation schema in Task 4 would check `coach.title` but coaches would have no way to set it.

- [ ] **Step 1: Add `title` to the profile API Zod schema**

In `src/app/api/portal/profile/route.ts`, find the Zod schema for the PATCH body. Add `title` to the accepted fields:

```typescript
    title: z.string().nullable().optional(),
```

And in the Prisma update `data` object, include:

```typescript
    ...(body.title !== undefined ? { title: body.title } : {}),
```

- [ ] **Step 2: Add `title` field to CoachProfileForm**

In `src/components/coach/coach-profile-form.tsx`:

1. Update the `initialData` prop type to include `title?: string | null`
2. Add a `title` state field initialized from `initialData.title || ""`
3. Add a form input for "Professional Title" (between Email and Title/Credentials):

```tsx
<div>
    <label className="block text-sm font-medium text-foreground mb-1">
        Professional Title <span className="text-destructive">*</span>
    </label>
    <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g., Scaling Up Certified Coach"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
    />
    <p className="text-xs text-muted-foreground mt-1">
        Your professional title — shown on landing pages
    </p>
</div>
```

4. In the save handler, include `title` in the PATCH body (alongside `company`)

- [ ] **Step 3: Pass `title` from settings page to form**

In `src/app/(portal)/portal/settings/page.tsx`, update the `initialData` prop passed to `CoachProfileForm`:

```typescript
initialData={{
    ...existing props...,
    title: coach.title || null,
}}
```

Ensure the coach query fetches the `title` field (if using `requireCoach()` which returns the full model, it's already included after Task 3's migration).

- [ ] **Step 4: Verify no type errors**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "coach-profile-form\|portal/profile\|portal/settings"
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/coach/coach-profile-form.tsx src/app/api/portal/profile/route.ts src/app/\(portal\)/portal/settings/page.tsx
git commit -m "feat: add Coach.title field to profile form and API"
```

---

### Task 4: Bio completeness validation — schema + helper

**Files:**
- Modify: `src/lib/validations.ts` (add coachBioCompleteSchema)
- Create: `src/__tests__/lib/coach-bio-validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/coach-bio-validation.test.ts`:

```typescript
import { getCoachBioMissingFields } from "@/lib/validations";

describe("getCoachBioMissingFields", () => {
  const completeCoach = {
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    title: "Scaling Up Certified Coach",
    linkedinUrl: "https://linkedin.com/in/jane-smith",
    bio: "Jane has 15 years of experience coaching executives.",
    profileImage: "https://example.com/photo.jpg",
  };

  it("returns empty array for complete profile", () => {
    expect(getCoachBioMissingFields(completeCoach)).toEqual([]);
  });

  it("returns missing fields for null values", () => {
    const incomplete = { ...completeCoach, title: null, bio: null, profileImage: null };
    const missing = getCoachBioMissingFields(incomplete);
    expect(missing.length).toBe(3);
    expect(missing).toContain("Professional title is required");
    expect(missing).toContain("Bio must be at least 10 characters");
    expect(missing).toContain("Profile photo is required");
  });

  it("returns missing fields for empty strings", () => {
    const incomplete = { ...completeCoach, firstName: "", linkedinUrl: "" };
    const missing = getCoachBioMissingFields(incomplete);
    expect(missing.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects bio shorter than 10 characters", () => {
    const shortBio = { ...completeCoach, bio: "Short" };
    const missing = getCoachBioMissingFields(shortBio);
    expect(missing).toContain("Bio must be at least 10 characters");
  });

  it("rejects invalid LinkedIn URL", () => {
    const badUrl = { ...completeCoach, linkedinUrl: "not-a-url" };
    const missing = getCoachBioMissingFields(badUrl);
    expect(missing).toContain("LinkedIn URL is required");
  });

  it("rejects invalid profileImage URL", () => {
    const badImg = { ...completeCoach, profileImage: "not-a-url" };
    const missing = getCoachBioMissingFields(badImg);
    expect(missing).toContain("Profile photo is required");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd src && npx jest src/__tests__/lib/coach-bio-validation.test.ts --no-coverage 2>&1 | tail -5
```
Expected: FAIL — `getCoachBioMissingFields` is not exported from `@/lib/validations`.

- [ ] **Step 3: Implement bio validation schema and helper**

In `src/lib/validations.ts`, add at the end of the file (after the last export):

```typescript
// ============================================================
// Coach Bio Completeness (Fix #2 — Jeff's Revisions)
// ============================================================

// Coerce null → undefined so Zod emits custom messages instead of generic "Expected string, received null"
const nullToUndefined = (v: unknown) => (v === null || v === "" ? undefined : v);

export const coachBioCompleteSchema = z.object({
    firstName: z.preprocess(nullToUndefined, z.string().min(1, "First name is required")),
    lastName: z.preprocess(nullToUndefined, z.string().min(1, "Last name is required")),
    email: z.preprocess(nullToUndefined, z.string().email("Valid email is required")),
    title: z.preprocess(nullToUndefined, z.string().min(1, "Professional title is required")),
    linkedinUrl: z.preprocess(nullToUndefined, z.string().url("LinkedIn URL is required")),
    bio: z.preprocess(nullToUndefined, z.string().min(10, "Bio must be at least 10 characters")),
    profileImage: z.preprocess(nullToUndefined, z.string().url("Profile photo is required")),
});

export function getCoachBioMissingFields(coach: {
    firstName: string;
    lastName: string;
    email: string;
    title: string | null;
    linkedinUrl: string | null;
    bio: string | null;
    profileImage: string | null;
}): string[] {
    const result = coachBioCompleteSchema.safeParse(coach);
    if (result.success) return [];
    return result.error.issues.map((i) => i.message);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd src && npx jest src/__tests__/lib/coach-bio-validation.test.ts --no-coverage 2>&1 | tail -5
```
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations.ts src/__tests__/lib/coach-bio-validation.test.ts
git commit -m "feat: add coach bio completeness validation schema and helper"
```

---

### Task 5: Gate workshop request on bio completeness

**Files:**
- Modify: `src/app/(portal)/portal/request/page.tsx` (entire file — small, 35 lines)

- [ ] **Step 1: Rewrite request page with bio gate**

Replace the full content of `src/app/(portal)/portal/request/page.tsx`:

```tsx
import Link from "next/link";
import { requireCoach } from "@/lib/authorization";
import { db } from "@/lib/db";
import { getCoachBioMissingFields } from "@/lib/validations";
import { NewWorkshopForm } from "@/app/(dashboard)/workshops/new/page";

export default async function RequestWorkshopPage() {
    const { coach } = await requireCoach();

    const coachWithCerts = await db.coach.findUnique({
        where: { id: coach.id },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            title: true,
            linkedinUrl: true,
            bio: true,
            profileImage: true,
            certifications: {
                select: { workshopTypeId: true, status: true },
            },
        },
    });

    if (!coachWithCerts) {
        return (
            <div className="max-w-3xl mx-auto p-6">
                <p className="text-destructive">No coach profile found for your account. Please contact admin.</p>
            </div>
        );
    }

    const missingFields = getCoachBioMissingFields(coachWithCerts);

    if (missingFields.length > 0) {
        return (
            <div className="max-w-3xl mx-auto p-6 space-y-4">
                <h1 className="text-2xl font-bold text-foreground">Complete Your Profile First</h1>
                <p className="text-muted-foreground">
                    You must complete your coach profile before requesting a workshop.
                </p>
                <ul className="list-disc pl-5 text-sm text-destructive space-y-1">
                    {missingFields.map((msg, i) => (
                        <li key={i}>{msg}</li>
                    ))}
                </ul>
                <Link
                    href="/portal/settings"
                    className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                    Go to Settings
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto">
            <NewWorkshopForm isCoachPortal={true} prefilledCoach={coachWithCerts} />
        </div>
    );
}
```

- [ ] **Step 2: Verify no type errors**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "portal/request"
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(portal\)/portal/request/page.tsx
git commit -m "feat: gate workshop request on coach bio completeness"
```

---

### Task 6: Server-side bio guard on approvals POST

**Files:**
- Modify: `src/app/api/approvals/route.ts:264-266` (after coachId resolution)

- [ ] **Step 1: Add bio validation import**

At the top of `src/app/api/approvals/route.ts`, add to the imports:

```typescript
import { getCoachBioMissingFields } from "@/lib/validations";
```

- [ ] **Step 2: Add bio check after coachId resolution**

After line 263 (`requestedBy = input.requestedBy || actor.email;`), before line 266 (`let workshopId: string | undefined = input.workshopId;`), add:

```typescript
        // Fix #2: Validate coach bio completeness before allowing workshop request
        const coachBio = await db.coach.findUnique({
            where: { id: coachId },
            select: {
                firstName: true, lastName: true, email: true,
                title: true, linkedinUrl: true, bio: true, profileImage: true,
            },
        });
        if (!coachBio) {
            return NextResponse.json({ error: "Coach not found" }, { status: 404 });
        }
        const bioMissing = getCoachBioMissingFields(coachBio);
        if (bioMissing.length > 0) {
            return NextResponse.json({
                success: false,
                error: `Coach profile is incomplete. Missing: ${bioMissing.join(", ")}`,
                missingFields: bioMissing,
            }, { status: 400 });
        }
```

- [ ] **Step 3: Verify no type errors**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "approvals/route"
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/approvals/route.ts
git commit -m "feat: server-side bio completeness check on approval creation"
```

---

### Task 7: Auto-publish pages on approval

**Files:**
- Modify: `src/inngest/functions/auto-build-workshop.ts:244` (status in create)
- Modify: `src/__tests__/inngest/auto-build-workshop.test.ts` (verify PUBLISHED)

- [ ] **Step 1: Update existing DRAFT test to expect PUBLISHED**

In `src/__tests__/inngest/auto-build-workshop.test.ts`, find test 14 (line ~600, titled `"creates landing pages with DRAFT status and correct workshopId"`). Change the test title and assertion:

Replace:
```typescript
  it("creates landing pages with DRAFT status and correct workshopId", async () => {
```
with:
```typescript
  it("creates landing pages with PUBLISHED status and correct workshopId", async () => {
```

And replace:
```typescript
    expect(call[0].data.status).toBe("DRAFT");
```
with:
```typescript
    expect(call[0].data.status).toBe("PUBLISHED");
    expect(call[0].data.publishedAt).toBeInstanceOf(Date);
```

- [ ] **Step 2: Write additional test for PUBLISHED status with publishedAt**

In `src/__tests__/inngest/auto-build-workshop.test.ts`, find the existing test block. Add a new test:

```typescript
  it("creates landing pages with PUBLISHED status and publishedAt", async () => {
    setupHappyPath();

    const createCalls: any[] = [];
    (db.landingPage.create as jest.Mock).mockImplementation((args) => {
      createCalls.push(args);
      return Promise.resolve({});
    });

    await capturedHandler({ event: makeEvent(), step: mockStep });

    expect(createCalls.length).toBeGreaterThan(0);
    for (const call of createCalls) {
      expect(call.data.status).toBe("PUBLISHED");
      expect(call.data.publishedAt).toBeInstanceOf(Date);
    }
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
cd src && npx jest src/__tests__/inngest/auto-build-workshop.test.ts -t "PUBLISHED" --no-coverage 2>&1 | tail -10
```
Expected: FAIL — `status` is `"DRAFT"`, not `"PUBLISHED"`.

- [ ] **Step 4: Change DRAFT to PUBLISHED in auto-build**

In `src/inngest/functions/auto-build-workshop.ts`, line 244, replace:

```typescript
                    status: "DRAFT",
```

with:

```typescript
                    status: "PUBLISHED",
                    publishedAt: new Date(),
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
cd src && npx jest src/__tests__/inngest/auto-build-workshop.test.ts -t "PUBLISHED" --no-coverage 2>&1 | tail -10
```
Expected: PASS.

- [ ] **Step 6: Run full auto-build test suite**

Run:
```bash
cd src && npx jest src/__tests__/inngest/auto-build-workshop.test.ts --no-coverage 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/inngest/functions/auto-build-workshop.ts src/__tests__/inngest/auto-build-workshop.test.ts
git commit -m "feat: auto-publish pages on approval (PUBLISHED instead of DRAFT)"
```

---

### Task 8: Coach post-approval lockdown — PATCH + DELETE

**Files:**
- Modify: `src/app/api/workshops/[id]/route.ts:169-170` (after coach ownership check in PATCH)
- Modify: `src/app/api/workshops/[id]/route.ts:384-392` (DELETE handler status check)

> **Design decision (pricing):** The lockdown is placed BEFORE the pricing interception code (COACH_PRICING_FIELDS). This means coaches cannot request custom pricing changes on approved workshops either. Per Jeff's intent: "Once Suzanne approves, everything is locked for coaches." Any pricing changes on approved workshops must go through Suzanne directly.

- [ ] **Step 1: Add PATCH lockdown for coaches**

In `src/app/api/workshops/[id]/route.ts`, after line 169 (`return NextResponse.json({ success: false, error: "Workshop not found" }, { status: 404 });`), after the closing `}` of the coach ownership check, add:

```typescript
    // Fix #2: Post-approval lockdown — coaches cannot edit approved workshops
    if (isCoach) {
      const LOCKED_STATUSES = new Set(["PRE_EVENT", "POST_EVENT", "COMPLETED"]);
      if (LOCKED_STATUSES.has(existing.status)) {
        return NextResponse.json({
          success: false,
          error: "This workshop is approved and locked. Contact admin for changes.",
        }, { status: 403 });
      }
    }
```

- [ ] **Step 2: Add DELETE lockdown for coaches**

In the DELETE handler, after line 384 (`return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });`), after the closing `}` of the role check, BEFORE the existing "Prevent cancellation of already canceled or completed" check (line 386), add:

```typescript
    // Fix #2: Post-approval lockdown — coaches cannot cancel approved workshops
    if (!isPrivilegedRole(actor.role)) {
      const COACH_LOCKED_STATUSES = new Set(["PRE_EVENT", "POST_EVENT", "COMPLETED"]);
      if (COACH_LOCKED_STATUSES.has(existing.status)) {
        return NextResponse.json({
          success: false,
          error: "Approved workshops cannot be cancelled by coaches. Contact admin.",
        }, { status: 403 });
      }
    }
```

- [ ] **Step 3: Verify no type errors**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "workshops/\[id\]/route"
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/workshops/\[id\]/route.ts
git commit -m "feat: post-approval lockdown — coaches cannot edit/cancel approved workshops"
```

---

### Task 9: Coach portal UI — disabled controls + lockdown banner

**Files:**
- Modify: `src/app/(portal)/portal/workshops/[id]/page.tsx:143-151` (banner area)
- Modify: `src/app/(portal)/portal/workshops/[id]/page.tsx:416-421` (CancelWorkshopDialog)

- [ ] **Step 1: Add lockdown banner after status pill**

In `src/app/(portal)/portal/workshops/[id]/page.tsx`, after the status pill section (line ~151, after `<StatusPill status={workshop.status} />`), before the grid cards start (line ~153), add:

```tsx
      {/* Fix #2: Post-approval lockdown banner */}
      {["PRE_EVENT", "POST_EVENT", "COMPLETED"].includes(workshop.status) && (
        <div className="rounded-xl border border-border bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">
            This workshop is approved. Only attendee management is available.
            For other changes, contact your admin.
          </p>
        </div>
      )}
```

- [ ] **Step 2: Lock cancel dialog to pre-approval statuses only**

On line 416, change:

```tsx
        {["INFO_REQUESTED", "AWAITING_APPROVAL", "PRE_EVENT"].includes(workshop.status) && (
```

to:

```tsx
        {["INFO_REQUESTED", "AWAITING_APPROVAL"].includes(workshop.status) && (
```

This removes `PRE_EVENT` from the cancel dialog visibility — coaches can no longer cancel approved workshops. Note: `REQUESTED` is not a valid workshop status (the schema default is `INFO_REQUESTED`), so it is not included.

- [ ] **Step 3: Verify no type errors**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "portal/workshops"
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(portal\)/portal/workshops/\[id\]/page.tsx
git commit -m "feat: coach portal lockdown banner + restrict cancel to pre-approval statuses"
```

---

### Task 9b: Settings page — bio completion checklist

**Files:**
- Modify: `src/app/(portal)/portal/settings/page.tsx` (add profile completeness section)

- [ ] **Step 1: Add bio completeness check to settings page**

In `src/app/(portal)/portal/settings/page.tsx`, at the top of the server component, after fetching the coach data, add:

```typescript
import { getCoachBioMissingFields } from "@/lib/validations";
```

After the coach query, add the missing fields check:

```typescript
const missingFields = getCoachBioMissingFields(coach);
const bioFields = [
    { label: "First Name", complete: !!coach.firstName },
    { label: "Last Name", complete: !!coach.lastName },
    { label: "Email", complete: !!coach.email },
    { label: "Professional Title", complete: !!coach.title },
    { label: "LinkedIn URL", complete: !!coach.linkedinUrl },
    { label: "Bio (10+ chars)", complete: !!coach.bio && coach.bio.length >= 10 },
    { label: "Profile Photo", complete: !!coach.profileImage },
];
```

Before the existing form, render the completeness section:

```tsx
      {/* Bio Completeness Checklist */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Profile Completeness
        </h2>
        <div className="space-y-1.5">
          {bioFields.map((field) => (
            <div key={field.label} className="flex items-center gap-2 text-sm">
              <span className={field.complete ? "text-success" : "text-destructive"}>
                {field.complete ? "\u2713" : "\u2717"}
              </span>
              <span className={field.complete ? "text-foreground" : "text-muted-foreground"}>
                {field.label}
              </span>
            </div>
          ))}
        </div>
        {missingFields.length > 0 && (
          <p className="mt-3 text-sm text-destructive">
            Complete all required fields to request workshops
          </p>
        )}
      </div>
```

Ensure the coach query `select` includes `title` (add it if missing).

- [ ] **Step 2: Verify no type errors**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "portal/settings"
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(portal\)/portal/settings/page.tsx
git commit -m "feat: add bio completeness checklist to coach settings page"
```

---

## Phase 3: Decouple Templates — Schema + API + Auto-Build (Fix #1)

### Task 10: Schema — add PageTemplate model + LandingPage.sourceTemplateId

**Files:**
- Modify: `prisma/schema.prisma` (add PageTemplate model, add sourceTemplateId to LandingPage, add relation to Category)

- [ ] **Step 1: Add sourceTemplateId to LandingPage model**

In `prisma/schema.prisma`, in the LandingPage model (after line 542, `categoryId String?`), add:

```prisma
  sourceTemplateId String?             // Tracks which PageTemplate this page was cloned from (informational, no FK)
```

- [ ] **Step 2: Add PageTemplate model**

After the LandingPage model closing brace (after line 553), add:

```prisma
// ============================================
// V2: Page Templates (independent of workshops)
// ============================================

model PageTemplate {
  id           String              @id @default(cuid())
  name         String              // e.g., "AI Workshop Solo Landing"
  templateType LandingPageTemplate // BIO_PAGE, SOLO_LANDING, DUO_LANDING, REGISTRATION, THANK_YOU
  categoryId   String?             // null = global template (applies to all categories)
  content      String              // JSON string with {{variable}} placeholders (TEXT column)
  isActive     Boolean             @default(false)
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  category Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  @@index([isActive])
  @@index([templateType, categoryId])
  @@map("page_templates")
}
```

- [ ] **Step 3: Add pageTemplates relation to Category model**

In the Category model (after line 615, `landingPages LandingPage[]`), add:

```prisma
  pageTemplates   PageTemplate[]
```

- [ ] **Step 4: Create migration (without applying)**

Run with `--create-only` to generate the migration file without applying it — we need to add custom SQL before applying:
```bash
cd src && npx prisma migrate dev --name add_page_template_model --create-only
```
Expected: Migration file created at `prisma/migrations/YYYYMMDDHHMMSS_add_page_template_model/migration.sql`.

- [ ] **Step 5: Add partial unique index to the migration SQL**

Open the migration file from the previous step. Append this SQL to the end of the file:

```sql
-- Partial unique index: one active template per (templateType, categoryId) slot
CREATE UNIQUE INDEX "page_templates_active_slot"
ON "page_templates"("templateType", COALESCE("categoryId", '__GLOBAL__'))
WHERE "isActive" = true;
```

- [ ] **Step 6: Apply the migration**

Run:
```bash
cd src && npx prisma migrate dev
```
Expected: Migration applied. This applies the full migration including the partial unique index.

- [ ] **Step 7: Regenerate Prisma client**

Run:
```bash
cd src && npx prisma generate
```

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "schema: add PageTemplate model + LandingPage.sourceTemplateId"
```

---

### Task 11: Template preview data constant

**Files:**
- Create: `src/lib/template-preview.ts`

- [ ] **Step 1: Create template preview data file**

Create `src/lib/template-preview.ts`:

```typescript
/**
 * Sample data for template preview rendering.
 * Used when editing PageTemplate content — replaces {{variable}} placeholders
 * with realistic sample values so editors can preview the result.
 */
export const TEMPLATE_PREVIEW_DATA: Record<string, string> = {
    // snake_case — matches {{placeholder}} format
    coach_name: "Jane Smith",
    coach_first_name: "Jane",
    coach_last_name: "Smith",
    coach_bio: "Jane is a certified Scaling Up coach with 15 years of experience helping businesses scale from startup to enterprise.",
    coach_email: "jane@example.com",
    coach_linkedin: "https://linkedin.com/in/jane-smith",
    coach_photo: "/placeholder-coach.jpg",
    coach_company: "Smith Consulting LLC",
    coach_title: "Scaling Up Certified Coach",
    workshop_title: "Sample: Scaling Up Masterclass",
    workshop_description: "An intensive workshop on the Rockefeller Habits methodology for scaling businesses.",
    workshop_date: "January 15, 2027",
    event_time: "9:00 AM - 12:00 PM",
    workshop_time: "9:00 AM - 12:00 PM",
    workshop_format: "IN_PERSON",
    workshop_code: "WS-2027-DEMO",
    venue_name: "Grand Conference Center",
    venue_address: "123 Business Blvd, Suite 500, New York, NY 10001",
    venue_instructions: "Enter through the main lobby. Parking in Lot B.",
    virtual_link: "https://zoom.us/j/example",
    category_name: "AI Workshop",
    price: "$349",
    pricing_tier_name: "Half-Day Workshop",
    registration_url: "https://example.com/register",
    // camelCase — matches JSON field names in editor content
    coachName: "Jane Smith",
    coachPhoto: "/placeholder-coach.jpg",
    coachTitle: "Scaling Up Certified Coach",
    workshopTitle: "Sample: Scaling Up Masterclass",
    eventDate: "January 15, 2027",
    eventTime: "9:00 AM - 12:00 PM",
    venueName: "Grand Conference Center",
    venueAddress: "123 Business Blvd, Suite 500, New York, NY 10001",
    // Structured JSON field mappings
    heroTitle: "Sample: Scaling Up Masterclass",
    heroSubtitle: "An intensive workshop on the Rockefeller Habits methodology for scaling businesses.",
    aboutDescription: "An intensive workshop on the Rockefeller Habits methodology for scaling businesses.",
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/template-preview.ts
git commit -m "feat: add TEMPLATE_PREVIEW_DATA for template editor previews"
```

---

### Task 12: PageTemplate API routes

**Files:**
- Create: `src/app/api/page-templates/route.ts`
- Create: `src/app/api/page-templates/[id]/route.ts`

- [ ] **Step 1: Create list/create route**

Create `src/app/api/page-templates/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
    const actor = await getApiActor();
    if (!actor || !isPrivilegedRole(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const templateType = searchParams.get("templateType");

    const where: Record<string, unknown> = {};
    if (categoryId) where.categoryId = categoryId === "global" ? null : categoryId;
    if (templateType) where.templateType = templateType;

    const templates = await db.pageTemplate.findMany({
        where,
        include: { category: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ isActive: "desc" }, { templateType: "asc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: templates });
}

export async function POST(request: NextRequest) {
    const actor = await getApiActor();
    if (!actor || !isPrivilegedRole(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, templateType, categoryId, content } = body as {
        name: string;
        templateType: string;
        categoryId?: string | null;
        content?: string;
    };

    if (!name || !templateType) {
        return NextResponse.json(
            { error: "name and templateType are required" },
            { status: 400 }
        );
    }

    const validTypes = ["BIO_PAGE", "SOLO_LANDING", "DUO_LANDING", "REGISTRATION", "THANK_YOU"];
    if (!validTypes.includes(templateType)) {
        return NextResponse.json(
            { error: `templateType must be one of: ${validTypes.join(", ")}` },
            { status: 400 }
        );
    }

    const template = await db.pageTemplate.create({
        data: {
            name,
            templateType: templateType as "BIO_PAGE" | "SOLO_LANDING" | "DUO_LANDING" | "REGISTRATION" | "THANK_YOU",
            categoryId: categoryId || null,
            content: content || "{}",
            isActive: false,
        },
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
}
```

- [ ] **Step 2: Create detail/update/delete route**

Create `src/app/api/page-templates/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { db } from "@/lib/db";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const actor = await getApiActor();
    if (!actor || !isPrivilegedRole(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const template = await db.pageTemplate.findUnique({
        where: { id },
        include: { category: { select: { id: true, name: true, slug: true } } },
    });

    if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: template });
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const actor = await getApiActor();
    if (!actor || !isPrivilegedRole(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, content, categoryId, isActive } = body as {
        name?: string;
        content?: string;
        categoryId?: string | null;
        isActive?: boolean;
    };

    const existing = await db.pageTemplate.findUnique({ where: { id } });
    if (!existing) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Activation flow: deactivate competitors in the same slot
    if (isActive === true) {
        const slotType = existing.templateType;
        const slotCategory = categoryId !== undefined ? categoryId : existing.categoryId;

        await db.$transaction(async (tx) => {
            // Deactivate any currently active template in the same (templateType, categoryId) slot
            await tx.pageTemplate.updateMany({
                where: {
                    templateType: slotType,
                    categoryId: slotCategory,
                    isActive: true,
                    id: { not: id },
                },
                data: { isActive: false },
            });

            // Activate this template + update other fields
            await tx.pageTemplate.update({
                where: { id },
                data: {
                    isActive: true,
                    ...(name !== undefined ? { name } : {}),
                    ...(content !== undefined ? { content } : {}),
                    ...(categoryId !== undefined ? { categoryId } : {}),
                },
            });
        });
    } else {
        // Non-activation update
        await db.pageTemplate.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(content !== undefined ? { content } : {}),
                ...(categoryId !== undefined ? { categoryId } : {}),
                ...(isActive !== undefined ? { isActive } : {}),
            },
        });
    }

    const updated = await db.pageTemplate.findUnique({
        where: { id },
        include: { category: { select: { id: true, name: true, slug: true } } },
    });

    return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const actor = await getApiActor();
    if (!actor || !isPrivilegedRole(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.pageTemplate.findUnique({ where: { id } });

    if (!existing) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (existing.isActive) {
        return NextResponse.json(
            { error: "Cannot delete an active template. Deactivate it first." },
            { status: 400 }
        );
    }

    // Informational: count pages generated from this template
    const usageCount = await db.landingPage.count({
        where: { sourceTemplateId: id },
    });

    await db.pageTemplate.delete({ where: { id } });

    return NextResponse.json({
        success: true,
        message: usageCount > 0
            ? `Template deleted. It was previously used to generate ${usageCount} workshop page(s). Those pages are not affected.`
            : "Template deleted.",
    });
}
```

- [ ] **Step 3: Verify no type errors**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "page-templates"
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/page-templates/
git commit -m "feat: PageTemplate CRUD API routes (GET, POST, PATCH, DELETE)"
```

---

### Task 13: Update auto-build to use PageTemplate

**Files:**
- Modify: `src/inngest/functions/auto-build-workshop.ts:162-253` (create-landing-pages step)
- Modify: `src/__tests__/inngest/auto-build-workshop.test.ts` (add pageTemplate mock)

- [ ] **Step 1: Update auto-build mock for pageTemplate**

In `src/__tests__/inngest/auto-build-workshop.test.ts`, update the db mock (line ~20-40). Add `pageTemplate` to the mock:

```typescript
jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    landingPage: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    pageTemplate: {
      findMany: jest.fn(),
    },
    workflow: {
      findFirst: jest.fn(),
    },
    workflowAssignment: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));
```

- [ ] **Step 2: Update mockTemplates to use templateType**

Replace `mockTemplates` (line ~119):

```typescript
const mockTemplates = [
  {
    id: "tpl-1",
    templateType: "REGISTRATION",
    content: '{"heading":"Register for {{workshop_title}}","coach":"{{coach_name}}"}',
    categoryId: null,
  },
  {
    id: "tpl-2",
    templateType: "THANK_YOU",
    content: '{"heading":"Thanks for attending {{workshop_title}}"}',
    categoryId: null,
  },
];
```

- [ ] **Step 3: Update setupHappyPath to use pageTemplate**

In `setupHappyPath` (line ~140), change the template query mock from `db.landingPage.findMany` to `db.pageTemplate.findMany`:

Replace:
```typescript
  (db.landingPage.findMany as jest.Mock)
    .mockResolvedValueOnce([])           // idempotency check: no existing pages
    .mockResolvedValueOnce(mockTemplates); // find active templates
```

with:
```typescript
  (db.landingPage.findMany as jest.Mock)
    .mockResolvedValueOnce([]);           // idempotency check: no existing pages
  (db.pageTemplate.findMany as jest.Mock)
    .mockResolvedValueOnce(mockTemplates); // find active page templates
```

- [ ] **Step 4: Update ALL inline template fixtures in manually-mocked tests**

**IMPORTANT:** Multiple tests set up their own template mocks WITHOUT calling `setupHappyPath()`. Each must be updated to:
1. Use `templateType` instead of `template` in fixture objects
2. Remove `slug` field (PageTemplate doesn't have `slug`)
3. Split `db.landingPage.findMany` calls — idempotency check stays on `landingPage`, template query moves to `db.pageTemplate.findMany`

**Test 10 (variable interpolation, line ~488):** Update `templateWithVars`:
```typescript
// Before:
const templateWithVars = { id: "tpl-vars", template: "REGISTRATION", content: '...', slug: "tpl-vars", categoryId: null };
// After:
const templateWithVars = { id: "tpl-vars", templateType: "REGISTRATION", content: '...', categoryId: null };
```
And split the mock chain:
```typescript
// Before:
(db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([templateWithVars]);
// After:
(db.landingPage.findMany as jest.Mock).mockResolvedValueOnce([]);  // idempotency
(db.pageTemplate.findMany as jest.Mock).mockResolvedValueOnce([templateWithVars]);  // template query
```

**Test 16 (free workshop price, line ~634):** Same pattern — update `templateWithPrice`:
```typescript
const templateWithPrice = { id: "tpl-price", templateType: "REGISTRATION", content: '{"price":"{{price}}"}', categoryId: null };
```
Split the mock chain as above.

**Tests 19-22 (category dedup, lines ~741-862):** Update ALL inline fixtures:
```typescript
// globalSolo:
{ id: "tpl-global-solo", templateType: "SOLO_LANDING", content: '{"title":"Global Solo"}', categoryId: null }

// catSolo:
{ id: "tpl-cat-solo", templateType: "SOLO_LANDING", content: '{"title":"Cat Solo"}', categoryId: "cat-1" }

// globalReg:
{ id: "tpl-global-reg", templateType: "REGISTRATION", content: '{"form":"global"}', categoryId: null }

// catSolo (test 22 variant):
{ id: "tpl-cat-solo-rev", templateType: "SOLO_LANDING", content: '{"title":"Cat Solo Rev"}', categoryId: "cat-1" }

// globalSolo (test 22 variant):
{ id: "tpl-global-solo-rev", templateType: "SOLO_LANDING", content: '{"title":"Global Solo Rev"}', categoryId: null }
```

For each of tests 19-22, split the mock chain:
```typescript
// Before:
(db.landingPage.findMany as jest.Mock)
  .mockResolvedValueOnce([])               // idempotency
  .mockResolvedValueOnce([fixture1, ...]);  // template query
// After:
(db.landingPage.findMany as jest.Mock)
  .mockResolvedValueOnce([]);              // idempotency (still landingPage)
(db.pageTemplate.findMany as jest.Mock)
  .mockResolvedValueOnce([fixture1, ...]);  // template query (now pageTemplate)
```

**Tests 17 and 18** (null category and null workflows): These don't use template fixtures directly but may mock `db.landingPage.findMany` for the template query. Check and split if needed.

- [ ] **Step 5: Run tests to verify they fail**

Run:
```bash
cd src && npx jest src/__tests__/inngest/auto-build-workshop.test.ts --no-coverage 2>&1 | tail -15
```
Expected: FAIL — auto-build still queries `db.landingPage` for templates.

- [ ] **Step 6: Rewrite the create-landing-pages step in auto-build**

In `src/inngest/functions/auto-build-workshop.ts`, replace the entire `create-landing-pages` step (lines 162-253) with:

```typescript
        // Step 2: Find and copy active PageTemplates (category match > global fallback)
        const pagesCreated = await step.run("create-landing-pages", async () => {
            const categoryFilter: { OR?: Array<{ categoryId: string | null }> } = workshop.categoryId
                ? {
                      OR: [
                          { categoryId: workshop.categoryId },
                          { categoryId: null },
                      ],
                  }
                : {};

            let activeTemplates = await db.pageTemplate.findMany({
                where: { isActive: true, ...categoryFilter },
                select: { id: true, templateType: true, content: true, categoryId: true },
            });

            // Deduplicate — prefer category-scoped over global for same template type
            const deduped = new Map<string, typeof activeTemplates[number]>();
            for (const tpl of activeTemplates) {
                const existing = deduped.get(tpl.templateType);
                if (!existing || (tpl.categoryId !== null && existing.categoryId === null)) {
                    deduped.set(tpl.templateType, tpl);
                }
            }
            activeTemplates = Array.from(deduped.values());

            // Fallback: if category-filtered query returns nothing, try ALL active templates
            if (activeTemplates.length === 0 && workshop.categoryId) {
                console.warn(
                    `[auto-build] WARNING: No category-matched templates for categoryId=${workshop.categoryId}. ` +
                    `Falling back to all active templates (global fallback).`
                );
                activeTemplates = await db.pageTemplate.findMany({
                    where: { isActive: true },
                    select: { id: true, templateType: true, content: true, categoryId: true },
                });
            }

            if (activeTemplates.length === 0) {
                console.warn(
                    `[auto-build] WARNING: No active PageTemplates found for workshopId=${workshop.id}. ` +
                    `Workshop will proceed without landing pages. Create and activate PageTemplates in admin.`
                );
                return { count: 0, templates: [] as string[], primarySlug: null as string | null, noTemplatesAvailable: true };
            }

            const created: string[] = [];
            let primarySlug: string | null = null;

            for (const tpl of activeTemplates) {
                // Check if this workshop already has a page for this template type
                const existingPage = await db.landingPage.findUnique({
                    where: {
                        workshopId_template: {
                            workshopId: workshop.id,
                            template: tpl.templateType,
                        },
                    },
                });

                if (existingPage) continue; // Don't overwrite manually created pages

                // Interpolate variables in content
                const interpolatedContent = interpolateContent(tpl.content, variables);

                // Generate unique slug
                const base = workshop.title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/(^-|-$)/g, "");
                const templateSuffix = tpl.templateType.toLowerCase().replace(/_/g, "-");
                const slug = `${base}-${templateSuffix}-${Date.now().toString(36)}`;

                await db.landingPage.create({
                    data: {
                        workshopId: workshop.id,
                        template: tpl.templateType,
                        slug,
                        content: interpolatedContent,
                        status: "PUBLISHED",
                        publishedAt: new Date(),
                        sourceTemplateId: tpl.id,
                    },
                });

                created.push(tpl.templateType);
                if (!primarySlug) primarySlug = slug;
            }

            return { count: created.length, templates: created, primarySlug };
        });
```

- [ ] **Step 7: Run tests to verify they pass**

Run:
```bash
cd src && npx jest src/__tests__/inngest/auto-build-workshop.test.ts --no-coverage 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/inngest/functions/auto-build-workshop.ts src/__tests__/inngest/auto-build-workshop.test.ts
git commit -m "feat: auto-build uses PageTemplate instead of LandingPage.isActiveTemplate"
```

---

### Task 14: Data migration script

**Files:**
- Create: `prisma/migrate-templates-to-page-template.ts`

- [ ] **Step 1: Create migration script**

Create `prisma/migrate-templates-to-page-template.ts`:

```typescript
/**
 * One-time data migration: Copy active LandingPage templates to PageTemplate model.
 *
 * Usage: cd src && npx tsx prisma/migrate-templates-to-page-template.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Starting template migration...\n");

    const activeTemplates = await prisma.landingPage.findMany({
        where: { isActiveTemplate: true },
        include: {
            category: { select: { name: true } },
        },
    });

    console.log(`Found ${activeTemplates.length} active LandingPage templates.\n`);

    let migrated = 0;
    let flagged = 0;

    for (const tpl of activeTemplates) {
        const categoryLabel = tpl.category?.name || "Global";
        const name = `${categoryLabel} ${tpl.template.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`;

        // Check if content contains placeholders
        const hasPlaceholders = tpl.content.includes("{{");
        if (!hasPlaceholders) {
            console.warn(`  FLAGGED: "${name}" — content has no {{}} placeholders. May contain hardcoded workshop data.`);
            flagged++;
        }

        // Check if PageTemplate already exists for this slot
        const existing = await prisma.pageTemplate.findFirst({
            where: {
                templateType: tpl.template,
                categoryId: tpl.categoryId,
            },
        });

        if (existing) {
            console.log(`  SKIP: "${name}" — PageTemplate already exists (id=${existing.id})`);
            continue;
        }

        await prisma.pageTemplate.create({
            data: {
                name,
                templateType: tpl.template,
                categoryId: tpl.categoryId,
                content: tpl.content,
                isActive: true,
            },
        });

        // Mark old LandingPage as no longer the active template
        await prisma.landingPage.update({
            where: { id: tpl.id },
            data: { isActiveTemplate: false },
        });

        console.log(`  MIGRATED: "${name}" (${tpl.template}, category=${categoryLabel})`);
        migrated++;
    }

    console.log(`\nDone. Migrated: ${migrated}, Flagged: ${flagged}, Total: ${activeTemplates.length}`);
}

main()
    .catch((e) => {
        console.error("Migration failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the migration**

Run:
```bash
cd src && npx tsx prisma/migrate-templates-to-page-template.ts
```
Expected: "Migrated: N" for each active template. No errors.

- [ ] **Step 3: Verify migration**

Run:
```bash
cd src && npx tsx -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.pageTemplate.findMany().then(t => { console.log(t.length + ' PageTemplates'); t.forEach(x => console.log('  ' + x.name + ' active=' + x.isActive)); p.\$disconnect(); })"
```
Expected: List of migrated templates.

- [ ] **Step 4: Commit**

```bash
git add prisma/migrate-templates-to-page-template.ts
git commit -m "chore: data migration script — copy LandingPage templates to PageTemplate"
```

---

## Phase 4: Template Editor UI (Fix #1 continued)

### Task 15: Rewrite admin templates page for PageTemplate

**Files:**
- Modify: `src/app/(dashboard)/templates/page.tsx` (rewrite to query PageTemplate)

- [ ] **Step 1: Rewrite templates page**

Replace the full content of `src/app/(dashboard)/templates/page.tsx` with a page that:
1. Queries `db.pageTemplate.findMany()` grouped by category
2. Queries `db.category.findMany()` for tab labels
3. Renders category tabs (Global + each category)
4. For each template: shows name, type badge, active toggle, Edit link, Delete button
5. "Create New Template" button linking to `/templates/new`

This is a large UI rewrite — the exact implementation depends on the existing page layout patterns. The engineer should follow the existing admin page patterns (Card component, semantic tokens, PageHeader, etc.) and adapt.

Key changes from current implementation:
- Data source: `db.pageTemplate` instead of `db.landingPage`
- No more "promote workshop page" flow
- Edit links: `/templates/{id}/edit` instead of workshop-scoped editor
- Active toggle: calls `PATCH /api/page-templates/{id}` with `{ isActive: true/false }`

- [ ] **Step 2: Verify the page renders**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "templates/page"
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/templates/page.tsx
git commit -m "feat: rewrite admin templates page to use PageTemplate model"
```

---

### Task 16: Create template editor page

**Files:**
- Create: `src/app/(dashboard)/templates/[id]/edit/page.tsx` (server component)
- Create: `src/components/templates/template-content-editor.tsx` (client component)

- [ ] **Step 1: Create the client editor component**

Create `src/components/templates/template-content-editor.tsx`:

```tsx
"use client";

import { useState } from "react";

export function TemplateContentEditor({
    templateId,
    initialContent,
}: {
    templateId: string;
    initialContent: string;
}) {
    const [content, setContent] = useState(initialContent);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    const handleSave = async () => {
        setSaving(true);
        setMessage("");
        try {
            JSON.parse(content);

            const res = await fetch(`/api/page-templates/${templateId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
            const data = await res.json();
            if (data.success) {
                setMessage("Saved successfully");
            } else {
                setMessage(`Error: ${data.error}`);
            }
        } catch {
            setMessage("Invalid JSON — please fix syntax errors before saving");
        }
        setSaving(false);
    };

    return (
        <div className="space-y-3">
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-[500px] font-mono text-xs bg-background border border-border rounded-lg p-3 resize-y"
                spellCheck={false}
            />
            <div className="flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {saving ? "Saving..." : "Save Template"}
                </button>
                {message && (
                    <p className={`text-sm ${message.startsWith("Error") ? "text-destructive" : "text-success"}`}>
                        {message}
                    </p>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Create the server page component**

Create `src/app/(dashboard)/templates/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { TEMPLATE_PREVIEW_DATA } from "@/lib/template-preview";
import { interpolateContent } from "@/lib/template-interpolation";
import { TemplateContentEditor } from "@/components/templates/template-content-editor";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function TemplateEditorPage({ params }: PageProps) {
    const { id } = await params;

    const template = await db.pageTemplate.findUnique({
        where: { id },
        include: { category: { select: { id: true, name: true } } },
    });

    if (!template) {
        notFound();
    }

    // Safely preview — malformed JSON in content won't crash the page
    let previewFormatted: string;
    try {
        const previewContent = interpolateContent(template.content, TEMPLATE_PREVIEW_DATA);
        previewFormatted = JSON.stringify(JSON.parse(previewContent), null, 2);
    } catch {
        previewFormatted = template.content; // Show raw content if JSON is malformed
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{template.name}</h1>
                    <p className="text-sm text-muted-foreground">
                        {template.templateType.replace(/_/g, " ")} &middot;{" "}
                        {template.category?.name || "Global"}
                        {template.isActive && (
                            <span className="ml-2 text-success font-medium">Active</span>
                        )}
                    </p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-5">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Template Content (JSON)
                    </h2>
                    <TemplateContentEditor
                        templateId={template.id}
                        initialContent={template.content}
                    />
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Preview (Sample Data)
                    </h2>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-[600px]">
                        {previewFormatted}
                    </pre>
                </div>
            </div>
        </div>
    );
}
```

**Note:** This is a V1 JSON editor. Visual editor integration (reusing solo-landing-page, registration-page components with PageTemplate context) is a follow-up refinement.

- [ ] **Step 3: Verify no type errors**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "templates/\[id\]\|template-content-editor"
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/templates/\[id\]/edit/ src/components/templates/template-content-editor.tsx
git commit -m "feat: template editor page with JSON editor and preview"
```

---

### Task 17: Create template creation page

**Files:**
- Create: `src/app/(dashboard)/templates/new/page.tsx`

- [ ] **Step 1: Create the new template page**

Create `src/app/(dashboard)/templates/new/page.tsx`:

```tsx
import { db } from "@/lib/db";
import { CreateTemplateForm } from "./create-template-form";

export default async function NewTemplatePage() {
    const categories = await db.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-foreground">Create New Template</h1>
            <CreateTemplateForm categories={categories} />
        </div>
    );
}
```

- [ ] **Step 2: Create the client form component**

Create `src/app/(dashboard)/templates/new/create-template-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TEMPLATE_TYPES = [
    { value: "BIO_PAGE", label: "Bio Page" },
    { value: "SOLO_LANDING", label: "Solo Landing" },
    { value: "DUO_LANDING", label: "Duo Landing" },
    { value: "REGISTRATION", label: "Registration" },
    { value: "THANK_YOU", label: "Thank You" },
];

export function CreateTemplateForm({
    categories,
}: {
    categories: { id: string; name: string }[];
}) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [templateType, setTemplateType] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !templateType) {
            setError("Name and template type are required");
            return;
        }

        setSaving(true);
        setError("");

        const res = await fetch("/api/page-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                templateType,
                categoryId: categoryId || null,
            }),
        });

        const data = await res.json();
        if (data.success) {
            router.push(`/templates/${data.data.id}/edit`);
        } else {
            setError(data.error || "Failed to create template");
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                    Template Name *
                </label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., AI Workshop Solo Landing"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    required
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                    Template Type *
                </label>
                <select
                    value={templateType}
                    onChange={(e) => setTemplateType(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    required
                >
                    <option value="">Select type...</option>
                    {TEMPLATE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                            {t.label}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                    Category (optional — blank = global)
                </label>
                <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                    <option value="">Global (all categories)</option>
                    {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                        </option>
                    ))}
                </select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
                {saving ? "Creating..." : "Create Template"}
            </button>
        </form>
    );
}
```

- [ ] **Step 3: Verify no type errors**

Run:
```bash
cd src && npx tsc --noEmit --pretty 2>&1 | grep -i "templates/new"
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/templates/new/
git commit -m "feat: create new template page with form"
```

---

### Task 18: Update seed scripts for PageTemplate

**Files:**
- Modify: `prisma/seed-templates.ts` (create PageTemplate records directly)
- Modify: `prisma/seed-ev-templates.ts` (create PageTemplate records directly)

- [ ] **Step 1: Read the existing seed scripts**

Read both files to understand the current structure. They currently create fake workshops (WS-TMPL-0001, WS-TMPL-EV01) as template hosts, then create LandingPage records on those workshops with `isActiveTemplate: true`.

- [ ] **Step 2: Refactor seed-templates.ts**

Update `prisma/seed-templates.ts` to create `PageTemplate` records directly using `db.pageTemplate.upsert()` instead of creating fake workshops + LandingPage records. Keep the same content JSON but use `templateType` instead of `template`. Remove the WS-TMPL-0001 workshop creation. Use `upsert` keyed on `{ templateType, categoryId }` (via a where clause on a combination of fields, or use findFirst + create/update).

- [ ] **Step 3: Refactor seed-ev-templates.ts**

Same approach as step 2 but for the E&V category templates. Remove the WS-TMPL-EV01 workshop creation. Create `PageTemplate` records scoped to the E&V category.

- [ ] **Step 4: Test seed scripts**

Run:
```bash
cd src && npx tsx prisma/seed-templates.ts
cd src && npx tsx prisma/seed-ev-templates.ts
```
Expected: Templates created/updated without errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-templates.ts prisma/seed-ev-templates.ts
git commit -m "chore: update seed scripts to create PageTemplate records directly"
```

---

### Task 19: Final verification — full test suite + build

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run:
```bash
cd src && npm run test -- --passWithNoTests 2>&1 | tail -20
```
Expected: All test suites pass. If any fail, fix before proceeding.

- [ ] **Step 2: Run production build**

Run:
```bash
cd src && CI=true npm run build 2>&1 | tail -20
```
Expected: Build succeeds with no errors.

- [ ] **Step 3: Run ESLint on changed files**

Run:
```bash
cd src && npx eslint src/lib/validations.ts src/lib/template-interpolation.ts src/lib/template-preview.ts src/app/api/page-templates/ src/app/api/workshops/\[id\]/route.ts src/inngest/functions/auto-build-workshop.ts src/app/\(portal\)/portal/request/page.tsx src/app/\(portal\)/portal/workshops/\[id\]/page.tsx src/components/templates/template-content-editor.tsx 2>&1 | tail -10
```
Expected: No errors. Warnings are acceptable.

- [ ] **Step 4: Commit any final fixes if needed**

---

## Acceptance Criteria Checklist

**Fix #1 (Templates):**
- [ ] Admin can create a template without creating a workshop
- [ ] Admin can delete a template without affecting existing workshops
- [ ] Two different workshops approved using the same template get correct pages
- [ ] Template admin UI shows templates organized by category and type
- [ ] Global fallback works when no category-specific template exists
- [ ] Missing template type silently skipped (logged, not errored)
- [ ] Partial unique index prevents two active templates in same slot

**Fix #2 (Bio + Lockdown):**
- [ ] Coach with incomplete bio cannot submit workshop request (client + server blocked)
- [ ] Coach with complete bio can submit workshop request
- [ ] On approval, all pages publish automatically (status = PUBLISHED)
- [ ] Coach cannot edit workshop details after approval (403)
- [ ] Coach cannot cancel workshop after approval (403)
- [ ] Coach CAN unregister attendees after approval
- [ ] Admin CAN still edit all fields after approval

**Fix #3 (Price):**
- [ ] Coach views workshop and sees price displayed
- [ ] Price shows tier name + amount, or "Free", or "TBD"

**Fix #4 (Admin sync):**
- [ ] Admin changes title → landing page updates
- [ ] Admin changes description → landing page updates
- [ ] Existing logistics sync (date, time, venue) still works
