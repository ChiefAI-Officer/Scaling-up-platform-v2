# Coach Profile Field Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Professional Title and Company Name distinct, consistently named coach-profile fields everywhere they are edited, displayed, imported, synchronized, or used to initialize landing-page content.

**Architecture:** Keep the existing two-column `Coach` data model and repair the semantic boundary at every consumer: `Coach.title` is the coach's professional title and `Coach.company` is the coach's company name. Route both self-service and admin edits through an explicit save target, centralize the legacy read fallback in one pure resolver, and retain compatibility only at read boundaries. No database rewrite is required; existing published landing-page snapshots remain immutable.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Prisma 6, Jest, Testing Library, Tailwind CSS.

## Global Constraints

- Work from `/Users/diushianstand/Scaling-up-platform-v2/.worktrees/coach-profile-field-alignment`; run app commands from its `src/` directory.
- Run the listed `git add`, `git commit`, `git status`, and `git diff` commands from the worktree root because their paths are repository-relative.
- Use test-driven development: add each regression first, observe the expected failure, then write the smallest implementation.
- `Coach.title` always means Professional Title. `Coach.company` always means Company Name.
- Do not add a third credentials field, rename a database column, add a Prisma migration, or rewrite existing coach records.
- Do not write a Circle title/headline into `Coach.company`.
- Legacy company-as-title behavior is read-only compatibility: title consumers may fall back from blank `title` to `company`, but no save path may copy `company` into `title` or `title` into `company`.
- Preserve existing published BIO, Solo, and Duo landing-page snapshots. Only defaults for newly configured or reconfigured pages change.
- Retain `titleCredentials` only in the Circle-import response as a temporary compatibility alias whose value comes from `Coach.title`.
- The Professional Title field remains optional at coach creation. The existing profile-completeness gate may still require it before a coach can use gated portal features.
- Admin edit must save the selected coach through `/api/coaches/[id]`; it must never send that coach's profile fields to `/api/portal/profile`.
- The Admin BIO “Delete Bio” action must preserve Company Name. It clears `title` and Circle linkage with `null`, and clears `bio` and `profileImage` with the empty-string representation already accepted by the update schema.
- Preserve unrelated photo-upload behavior, authentication, authorization, response envelopes, cache revalidation, email flows, and integration-ID validation.
- This is a semantic defect repair, not a feature wave; do not add a feature flag.

---

## File Map

### Canonical semantics and API contracts

- Create: `src/src/lib/coaches/coach-profile-fields.ts` — default title and the single legacy read-fallback function.
- Modify: `src/src/lib/validations.ts` — accept optional title at creation and nullable title/company on update.
- Modify: `src/src/app/api/coaches/route.ts` — persist Professional Title when an admin creates a coach.
- Modify: `src/src/app/api/coaches/[id]/route.ts` — update or clear title/company independently.
- Modify: `src/src/app/api/portal/profile/route.ts` — retain its existing independent persistence behavior and remove the stale company-as-credentials comment.

### Coach forms and displays

- Modify: `src/src/components/coach/coach-profile-form.tsx` — distinct title/company state and explicit self/admin save target.
- Modify: `src/src/app/(portal)/portal/settings/page.tsx` — pass canonical self-service values.
- Modify: `src/src/app/(dashboard)/coaches/[id]/edit/page.tsx` — select admin save target and pass canonical values.
- Modify: `src/src/app/(dashboard)/coaches/new/page.tsx` — collect and submit Professional Title plus Company Name.
- Modify: `src/src/app/(dashboard)/coaches/[id]/page.tsx` — display both labels and values.

### Admin BIO surfaces

- Modify: `src/src/app/(dashboard)/bio/page.tsx` — select and display separate Professional Title and Company Name columns.
- Modify: `src/src/app/(dashboard)/bio/[id]/page.tsx` — edit, preview, save, and clear bio-owned fields without erasing Company Name.

### Circle integration

- Modify: `src/src/services/circle-sync.ts` — import Circle title into `Coach.title`, never `Coach.company`.
- Modify: `src/src/app/api/coaches/[id]/circle-import/route.ts` — return canonical fields and compatibility alias from title.

### Landing-page defaults and BIO API

- Modify: `src/src/app/api/bio/profiles/route.ts` — expose the resolved professional title.
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/bio-page/page.tsx` — initialize from the resolver and label the field Professional Title.
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx` — initialize the coach title from the resolver.
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/duo-landing/page.tsx` — initialize both coach titles from the resolver.
- Existing: `src/src/lib/templates/template-interpolation.ts` — already follows title → company → default; production code remains unchanged.

### Tests and source-of-truth documentation

- Create: `src/src/__tests__/lib/coaches/coach-profile-fields.test.ts`
- Modify: `src/src/__tests__/unit/validations.test.ts`
- Modify: `src/src/__tests__/api/coaches-password-reset-url.test.ts`
- Modify: `src/src/__tests__/api/coach-integration-ids.test.ts`
- Modify: `src/src/__tests__/portal/coach-profile-form.test.tsx`
- Create: `src/src/__tests__/app/coach-bio-fields.test.tsx`
- Modify: `src/src/__tests__/unit/circle-sync.test.ts`
- Modify: `src/src/__tests__/api/coaches-circle-import.test.ts`
- Create: `src/src/__tests__/api/bio-profiles-fields.test.ts`
- Create: `src/src/__tests__/lint/coach-profile-field-semantics.test.ts`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

---

### Task 1: Define the canonical field contract and persistence behavior

**Files:**
- Create: `src/src/lib/coaches/coach-profile-fields.ts`
- Create: `src/src/__tests__/lib/coaches/coach-profile-fields.test.ts`
- Modify: `src/src/lib/validations.ts`
- Modify: `src/src/__tests__/unit/validations.test.ts`
- Modify: `src/src/app/api/coaches/route.ts`
- Modify: `src/src/__tests__/api/coaches-password-reset-url.test.ts`
- Modify: `src/src/app/api/coaches/[id]/route.ts`
- Modify: `src/src/__tests__/api/coach-integration-ids.test.ts`
- Modify: `src/src/app/api/portal/profile/route.ts`

**Interfaces:**
- Produces: `DEFAULT_COACH_PROFESSIONAL_TITLE` and `resolveCoachProfessionalTitle({ title, company })`.
- Produces: `createCoachSchema.title?: string`.
- Produces: nullable update values for `title`, `company`, `hubspotId`, and `circleId`; create semantics remain optional strings.
- Compatibility: the resolver performs title → company → default fallback only for reads.

- [ ] **Step 1: Write the failing resolver tests**

Create `src/src/__tests__/lib/coaches/coach-profile-fields.test.ts`:

```ts
import {
  DEFAULT_COACH_PROFESSIONAL_TITLE,
  resolveCoachProfessionalTitle,
} from "@/lib/coaches/coach-profile-fields";

describe("resolveCoachProfessionalTitle", () => {
  it("prefers the canonical professional title", () => {
    expect(resolveCoachProfessionalTitle({
      title: "  Master Coach  ",
      company: "A Step Above",
    })).toBe("Master Coach");
  });

  it("reads the legacy company value when title is blank", () => {
    expect(resolveCoachProfessionalTitle({ title: " ", company: " A Step Above " }))
      .toBe("A Step Above");
  });

  it("uses the product default when both values are blank", () => {
    expect(resolveCoachProfessionalTitle({ title: null, company: null }))
      .toBe(DEFAULT_COACH_PROFESSIONAL_TITLE);
  });
});
```

- [ ] **Step 2: Run the resolver test and verify it fails**

```bash
npx jest src/__tests__/lib/coaches/coach-profile-fields.test.ts --runInBand
```

Expected: Jest cannot resolve the new module.

- [ ] **Step 3: Implement the pure resolver**

Create `src/src/lib/coaches/coach-profile-fields.ts`:

```ts
export const DEFAULT_COACH_PROFESSIONAL_TITLE = "Scaling Up Certified Coach";

export interface CoachProfessionalTitleSource {
  title?: string | null;
  company?: string | null;
}

export function resolveCoachProfessionalTitle(
  coach: CoachProfessionalTitleSource,
): string {
  return coach.title?.trim()
    || coach.company?.trim()
    || DEFAULT_COACH_PROFESSIONAL_TITLE;
}
```

- [ ] **Step 4: Extend validation tests before schemas**

In `src/src/__tests__/unit/validations.test.ts`, add `updateCoachSchema` to the import from `@/lib/validations`, then add assertions inside `describe("Coach Validation Schema")` using its existing `validCoach` fixture:

```ts
expect(createCoachSchema.safeParse({
  ...validCoach,
  title: "Master Coach",
  company: "A Step Above",
}).success).toBe(true);

expect(updateCoachSchema.safeParse({ title: null, company: null }).success).toBe(true);
expect(updateCoachSchema.safeParse({ hubspotId: null, circleId: null }).success).toBe(true);
expect(updateCoachSchema.safeParse({ title: 42 }).success).toBe(false);
```

Run and confirm the nullable update case fails:

```bash
npx jest src/__tests__/unit/validations.test.ts --runInBand
```

- [ ] **Step 5: Add title and nullable update semantics to the schemas**

Add `title` beside `company` in `createCoachSchema`, then replace the plain partial update schema:

```ts
title: z.string().optional(),
company: z.string().optional(),
```

```ts
export const updateCoachSchema = createCoachSchema.partial().extend({
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  hubspotId: z.string().nullable().optional(),
  circleId: z.string().nullable().optional(),
});
```

- [ ] **Step 6: Write failing create and update route assertions**

In `src/src/__tests__/api/coaches-password-reset-url.test.ts`, extend the successful POST body with:

```ts
title: "Master Coach",
company: "A Step Above",
```

Assert `db.coach.create` receives:

```ts
expect.objectContaining({
  data: expect.objectContaining({
    title: "Master Coach",
    company: "A Step Above",
  }),
})
```

In `src/src/__tests__/api/coach-integration-ids.test.ts`, add:

```ts
it("updates professional title and company independently", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({
    userId: "admin-1",
    email: "admin@example.com",
    role: "ADMIN",
    coachId: null,
  });
  (db.coach.findUnique as jest.Mock).mockResolvedValue(mockCoach);
  (db.coach.update as jest.Mock).mockResolvedValue({
    ...mockCoach,
    title: "Master Coach",
    company: "A Step Above",
  });
  const request = new Request("http://localhost/api/coaches/coach-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "  Master Coach  ",
      company: "  A Step Above  ",
    }),
  });
  const response = await PATCH(
    request as Parameters<typeof PATCH>[0],
    routeParams(),
  );

  expect(response.status).toBe(200);
  expect(db.coach.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      title: "Master Coach",
      company: "A Step Above",
    }),
  }));
});

it("clears professional title and company independently", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({
    userId: "admin-1",
    email: "admin@example.com",
    role: "ADMIN",
    coachId: null,
  });
  (db.coach.findUnique as jest.Mock).mockResolvedValue(mockCoach);
  (db.coach.update as jest.Mock).mockResolvedValue(mockCoach);
  const request = new Request("http://localhost/api/coaches/coach-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: null, company: null }),
  });
  await PATCH(request as Parameters<typeof PATCH>[0], routeParams());
  expect(db.coach.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ title: null, company: null }),
  }));
});
```

Add `title: null` to that test file's `mockCoach` object so the fixture matches the Prisma shape exercised by the route.

- [ ] **Step 7: Run the API tests and verify the missing persistence**

```bash
npx jest src/__tests__/api/coaches-password-reset-url.test.ts src/__tests__/api/coach-integration-ids.test.ts --runInBand
```

Expected: POST omits title and PATCH omits title or does not normalize nullable values.

- [ ] **Step 8: Persist the two values independently**

In `src/src/app/api/coaches/route.ts`, add to the coach create data:

```ts
title: data.title?.trim() || null,
company: data.company?.trim() || null,
```

In `src/src/app/api/coaches/[id]/route.ts`, use conditional spreads so omission means “unchanged” while blank/null means “clear”:

```ts
...(data.title !== undefined && {
  title: data.title?.trim() || null,
}),
...(data.company !== undefined && {
  company: data.company?.trim() || null,
}),
```

Keep the existing integration-ID normalization and every unrelated update field unchanged.

In `src/src/app/api/portal/profile/route.ts`, change only the stale inline field comment to:

```ts
company: z.string().nullable().optional(), // Company name / business entity
```

Its existing `title?.trim() || null` and `company?.trim() || null` update branches already implement the approved self-service contract; do not refactor them.

- [ ] **Step 9: Run all Task 1 tests to green**

```bash
npx jest src/__tests__/lib/coaches/coach-profile-fields.test.ts src/__tests__/unit/validations.test.ts src/__tests__/api/coaches-password-reset-url.test.ts src/__tests__/api/coach-integration-ids.test.ts --runInBand
```

- [ ] **Step 10: Commit**

```bash
git add src/src/lib/coaches/coach-profile-fields.ts src/src/__tests__/lib/coaches/coach-profile-fields.test.ts src/src/lib/validations.ts src/src/__tests__/unit/validations.test.ts src/src/app/api/coaches/route.ts src/src/__tests__/api/coaches-password-reset-url.test.ts 'src/src/app/api/coaches/[id]/route.ts' src/src/__tests__/api/coach-integration-ids.test.ts src/src/app/api/portal/profile/route.ts
git commit -m "fix(coaches): define canonical title and company fields"
```

---

### Task 2: Align the shared profile form and coach admin screens

**Files:**
- Modify: `src/src/components/coach/coach-profile-form.tsx`
- Modify: `src/src/__tests__/portal/coach-profile-form.test.tsx`
- Modify: `src/src/app/(portal)/portal/settings/page.tsx`
- Modify: `src/src/app/(dashboard)/coaches/[id]/edit/page.tsx`
- Modify: `src/src/app/(dashboard)/coaches/new/page.tsx`
- Modify: `src/src/app/(dashboard)/coaches/[id]/page.tsx`
- Create: `src/src/__tests__/lint/coach-profile-field-semantics.test.ts`

**Interfaces:**
- Changes `initialData.titleCredentials` to `initialData.company`.
- Adds `saveTarget?: "self" | "admin"`, defaulting to `"self"`.
- Self target: one PATCH to `/api/portal/profile` with profile fields.
- Admin target: one PATCH to `/api/coaches/${coachId}` with profile fields plus integration IDs.

- [ ] **Step 1: Write failing form label and routing tests**

In `src/src/__tests__/portal/coach-profile-form.test.tsx`, change the fixture to:

```ts
initialData: {
  firstName: "Lynne",
  lastName: "Verdun",
  email: "lynne@example.com",
  title: "Master Coach",
  company: "A Step Above",
  linkedinUrl: "",
  bio: "Everything all in one package",
  showBookCallCta: false,
  bookCallUrl: "",
  profileImage: null,
  hubspotId: "hubspot-1",
  circleId: "circle-1",
},
```

Add label assertions:

```tsx
expect(screen.getByLabelText("Professional Title")).toHaveValue("Master Coach");
expect(screen.getByLabelText("Company Name")).toHaveValue("A Step Above");
expect(screen.queryByText("Title / Credentials")).not.toBeInTheDocument();
```

Add self-save coverage:

```tsx
fireEvent.change(screen.getByLabelText("Professional Title"), {
  target: { value: "Certified Scaling Up Coach" },
});
fireEvent.change(screen.getByLabelText("Company Name"), {
  target: { value: "Growth Partners" },
});
fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
  "/api/portal/profile",
  expect.objectContaining({
    method: "PATCH",
    body: expect.stringContaining('"title":"Certified Scaling Up Coach"'),
  }),
));
expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual(
  expect.objectContaining({
    title: "Certified Scaling Up Coach",
    company: "Growth Partners",
  }),
);
```

Add admin-save coverage by rendering with `saveTarget="admin"`, `coachId="coach-1"`, and `allowEditIntegrationIds`. Assert there is exactly one request:

```tsx
render(
  <CoachProfileForm
    {...defaultProps}
    saveTarget="admin"
    allowEditIntegrationIds
  />,
);
fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

expect(global.fetch).toHaveBeenCalledWith(
  "/api/coaches/coach-1",
  expect.objectContaining({ method: "PATCH" }),
);
expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual(
  expect.objectContaining({
    title: "Master Coach",
    company: "A Step Above",
    hubspotId: "hubspot-1",
    circleId: "circle-1",
  }),
);
expect(global.fetch).not.toHaveBeenCalledWith(
  "/api/portal/profile",
  expect.anything(),
);
```

- [ ] **Step 2: Run the form suite and verify failure**

```bash
npx jest src/__tests__/portal/coach-profile-form.test.tsx --runInBand
```

Expected: Company Name and `saveTarget` do not exist and admin save calls the self endpoint.

- [ ] **Step 3: Refactor the form to canonical state and one save request**

Update the prop and state definitions:

```ts
type CoachProfileSaveTarget = "self" | "admin";

interface CoachProfileFormProps {
  coachId: string;
  initialData: {
    firstName: string;
    lastName: string;
    email: string;
    bio: string;
    title: string | null;
    company: string | null;
    profileImage?: string | null;
    linkedinUrl?: string | null;
    showBookCallCta?: boolean;
    bookCallUrl?: string | null;
    hubspotId?: string | null;
    circleId?: string | null;
  };
  saveTarget?: CoachProfileSaveTarget;
  allowEditIntegrationIds?: boolean;
}
```

```ts
const [title, setTitle] = useState(initialData.title ?? "");
const [company, setCompany] = useState(initialData.company ?? "");
const endpoint = saveTarget === "admin"
  ? `/api/coaches/${coachId}`
  : "/api/portal/profile";

const payload = {
  firstName,
  lastName,
  title: title || null,
  company: company || null,
  linkedinUrl: linkedinUrl || null,
  bio,
  showBookCallCta,
  bookCallUrl: bookCallUrl || null,
  ...(saveTarget === "admin" && allowEditIntegrationIds
    ? {
        hubspotId: hubspotId || null,
        circleId: circleId || null,
      }
    : {}),
};
```

Issue exactly one PATCH to `endpoint`. Keep `coachId` required, preserve the existing visible request-error handling, and keep photo upload on its existing endpoint outside this save-target change.

Render these exact labels in order:

```tsx
<label htmlFor="title">Professional Title</label>
<input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />

<label htmlFor="company">Company Name</label>
<input id="company" value={company} onChange={(event) => setCompany(event.target.value)} />
```

Preserve the existing Professional Title helper copy. Give Company Name neutral organization copy; do not describe it as a landing-page title.

- [ ] **Step 4: Pass canonical values and the explicit admin target**

In portal settings:

```tsx
title: coach.title || null,
company: coach.company || null,
```

In admin edit:

```tsx
<CoachProfileForm
  initialData={{
    firstName: coach.firstName,
    lastName: coach.lastName,
    email: coach.user?.email ?? "",
    bio: coach.bio ?? "",
    title: coach.title,
    company: coach.company,
    profileImage: coach.profileImage,
    linkedinUrl: coach.linkedinUrl,
    showBookCallCta: coach.showBookCallCta,
    bookCallUrl: coach.bookCallUrl,
    hubspotId: coach.hubspotId,
    circleId: coach.circleId,
  }}
  saveTarget="admin"
  coachId={coach.id}
  allowEditIntegrationIds
/>
```

- [ ] **Step 5: Add Professional Title to coach creation and details**

In the Add Coach page, add `title` beside `company` in the existing `formData` object:

```ts
const [formData, setFormData] = useState({
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  title: "",
  company: "",
  bio: "",
  hubspotId: "",
  circleId: "",
  territory: "",
});
```

```ts
body: JSON.stringify({
  email: formData.email.toLowerCase(),
  firstName: formData.firstName,
  lastName: formData.lastName,
  phone: formData.phone || undefined,
  title: formData.title || undefined,
  company: formData.company || undefined,
  bio: formData.bio || undefined,
  hubspotId: formData.hubspotId || undefined,
  circleId: formData.circleId || undefined,
  territory: formData.territory || undefined,
}),
```

Render optional `Professional Title` before `Company Name`, using `name="title"` and `name="company"` so the existing `handleChange` updates the correct properties:

```tsx
<div>
  <Label htmlFor="title">Professional Title</Label>
  <Input
    id="title"
    name="title"
    value={formData.title}
    onChange={handleChange}
    placeholder="e.g., Master Coach"
    className="mt-1"
  />
</div>
<div>
  <Label htmlFor="company">Company Name</Label>
  <Input
    id="company"
    name="company"
    value={formData.company}
    onChange={handleChange}
    placeholder="Coach's company or business name"
    className="mt-1"
  />
</div>
```

On the details page render two entries matching the existing card markup:

```tsx
<div>
  <p className="text-sm font-medium text-muted-foreground">Professional Title</p>
  <p className="text-foreground">{coach.title || "Not provided"}</p>
</div>
<div>
  <p className="text-sm font-medium text-muted-foreground">Company Name</p>
  <p className="text-foreground">{coach.company || "Not provided"}</p>
</div>
```

Do not substitute company for a missing title on this factual admin details screen.

- [ ] **Step 6: Add a focused source-contract test for the affected UI**

Create `src/src/__tests__/lint/coach-profile-field-semantics.test.ts`. Jest runs from the app root, so resolve each runtime path from `process.cwd()`:

```ts
import fs from "node:fs";
import path from "node:path";

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("coach profile field semantics", () => {
  it("does not expose the ambiguous Title / Credentials profile label", () => {
    const files = [
      "src/components/coach/coach-profile-form.tsx",
    ];
    for (const file of files) {
      expect(source(file)).not.toContain("Title / Credentials");
      expect(source(file)).not.toContain("Title/Credentials");
    }
  });

  it("routes admin profile saves through the selected coach endpoint", () => {
    const form = source("src/components/coach/coach-profile-form.tsx");
    expect(form).toContain('saveTarget === "admin"');
    expect(form).toContain("`/api/coaches/${coachId}`");
  });

  it("shows both fields on coach creation and details", () => {
    const createPage = source("src/app/(dashboard)/coaches/new/page.tsx");
    const detailsPage = source("src/app/(dashboard)/coaches/[id]/page.tsx");
    for (const page of [createPage, detailsPage]) {
      expect(page).toContain("Professional Title");
      expect(page).toContain("Company Name");
    }
  });
});
```

- [ ] **Step 7: Run Task 2 tests to green**

```bash
npx jest src/__tests__/portal/coach-profile-form.test.tsx src/__tests__/lint/coach-profile-field-semantics.test.ts --runInBand
```

- [ ] **Step 8: Commit**

```bash
git add src/src/components/coach/coach-profile-form.tsx src/src/__tests__/portal/coach-profile-form.test.tsx 'src/src/app/(portal)/portal/settings/page.tsx' 'src/src/app/(dashboard)/coaches/[id]/edit/page.tsx' 'src/src/app/(dashboard)/coaches/new/page.tsx' 'src/src/app/(dashboard)/coaches/[id]/page.tsx' src/src/__tests__/lint/coach-profile-field-semantics.test.ts
git commit -m "fix(coaches): align profile forms and details"
```

---

### Task 3: Separate the fields throughout Admin BIO

**Files:**
- Modify: `src/src/app/(dashboard)/bio/page.tsx`
- Modify: `src/src/app/(dashboard)/bio/[id]/page.tsx`
- Create: `src/src/__tests__/app/coach-bio-fields.test.tsx`
- Modify: `src/src/__tests__/lint/coach-profile-field-semantics.test.ts`

**Interfaces:**
- BIO directory receives and displays `coach.title` and `coach.company` independently.
- BIO editor owns `professionalTitle` and `companyName` form state.
- Delete Bio sends `{ title: null, bio: "", profileImage: "", circleId: null }`; it does not send `company`.

- [ ] **Step 1: Write failing Admin BIO tests**

Create `src/src/__tests__/app/coach-bio-fields.test.tsx` with these mocks and imports before the assertions:

```ts
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/lib/db", () => ({
  db: { coach: { findMany: jest.fn() } },
}));
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "coach-1" }),
}));

import BioPageIndex from "@/app/(dashboard)/bio/page";
import CoachBioEditorPage from "@/app/(dashboard)/bio/[id]/page";
import { db } from "@/lib/db";

const coach = {
  id: "coach-1",
  firstName: "Lynne",
  lastName: "Verdun",
  email: "lynne@example.com",
  title: "Master Coach",
  company: "A Step Above",
  bio: "Everything all in one package",
  profileImage: null,
  circleId: "circle-1",
  updatedAt: new Date("2026-08-11T00:00:00.000Z"),
};
```

Add the directory test:

```tsx
it("shows professional title and company in separate columns", async () => {
  (db.coach.findMany as jest.Mock).mockResolvedValue([coach]);
  render(await BioPageIndex());

expect(screen.getByRole("columnheader", { name: "Professional Title" }))
  .toBeInTheDocument();
expect(screen.getByRole("columnheader", { name: "Company Name" }))
  .toBeInTheDocument();
expect(screen.getByText("Master Coach")).toBeInTheDocument();
expect(screen.getByText("A Step Above")).toBeInTheDocument();
});
```

Add an editor test whose fetch mock records both PATCH bodies:

```tsx
it("edits both fields and preserves company when deleting the bio", async () => {
  const patchBodies: Array<Record<string, unknown>> = [];
  global.fetch = jest.fn(async (_input, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      patchBodies.push(JSON.parse(String(init.body)));
    }
    return new Response(JSON.stringify({ success: true, data: coach }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  jest.spyOn(window, "confirm").mockReturnValue(true);

  render(<CoachBioEditorPage />);
  expect(await screen.findByLabelText("Professional Title"))
    .toHaveValue("Master Coach");
  expect(screen.getByLabelText("Company Name")).toHaveValue("A Step Above");

  fireEvent.change(screen.getByLabelText("Professional Title"), {
    target: { value: "Certified Coach" },
  });
  fireEvent.change(screen.getByLabelText("Company Name"), {
    target: { value: "Growth Partners" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Bio" }));
  await waitFor(() => expect(patchBodies).toHaveLength(1));
  expect(patchBodies[0]).toEqual(expect.objectContaining({
    title: "Certified Coach",
    company: "Growth Partners",
  }));

  fireEvent.click(screen.getByRole("button", { name: "Delete Bio" }));
  await waitFor(() => expect(patchBodies).toHaveLength(2));

  expect(patchBodies[1]).toEqual({
    title: null,
    bio: "",
    profileImage: "",
    circleId: null,
  });
  expect(patchBodies[1]).not.toHaveProperty("company");
});
```

- [ ] **Step 2: Run the BIO test and verify failure**

```bash
npx jest src/__tests__/app/coach-bio-fields.test.tsx --runInBand
```

Expected: directory/editor use company as Title / Credentials and editor has no independent states.

- [ ] **Step 3: Split directory columns**

Add `title: true` to the Prisma select and replace the ambiguous header/cell with:

```tsx
<th>Professional Title</th>
<th>Company Name</th>
```

```tsx
<td>{coach.title || "—"}</td>
<td>{coach.company || "—"}</td>
```

Keep sorting, actions, bio-status, image, name, email, and Circle-status behavior unchanged.

- [ ] **Step 4: Split editor payload, state, fields, and preview**

Extend the GET payload interface:

```ts
interface CoachPayload {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string | null;
  company: string | null;
  bio: string | null;
  profileImage: string | null;
  circleId: string | null;
}
```

Replace `titleCredentials` with:

```ts
const [professionalTitle, setProfessionalTitle] = useState("");
const [companyName, setCompanyName] = useState("");
```

After loading `coach`, call:

```ts
setProfessionalTitle(coach.title ?? "");
setCompanyName(coach.company ?? "");
```

Save with:

```ts
body: JSON.stringify({
  firstName: formData.firstName.trim(),
  lastName: formData.lastName.trim(),
  title: professionalTitle.trim(),
  company: companyName.trim(),
  bio: formData.biography.trim(),
  profileImage: formData.profileImageUrl.trim(),
  circleId: formData.circleId.trim() || null,
}),
```

Render the two inputs independently:

```tsx
<Label htmlFor="professionalTitle">Professional Title</Label>
<Input
  id="professionalTitle"
  value={professionalTitle}
  onChange={(event) => setProfessionalTitle(event.target.value)}
/>

<Label htmlFor="companyName">Company Name</Label>
<Input
  id="companyName"
  value={companyName}
  onChange={(event) => setCompanyName(event.target.value)}
/>
```

In the preview, show Professional Title as the title line. Keep Company Name as editable coach-record metadata; do not add it to the public preview because the current BIO template has no explicit company line:

```tsx
<p className="text-muted-foreground mt-1">
  {professionalTitle || "Scaling Up Certified Coach"}
</p>
```

Implement Delete Bio with:

```ts
body: JSON.stringify({
  title: null,
  bio: "",
  profileImage: "",
  circleId: null,
}),
```

After a successful delete, call `setProfessionalTitle("")` and clear only `biography`, `profileImageUrl`, and `circleId` in `formData`; leave `companyName` unchanged.

- [ ] **Step 5: Extend the source-contract test**

Add the two Admin BIO paths to the `files` array in the stale-label test:

```ts
const files = [
  "src/components/coach/coach-profile-form.tsx",
  "src/app/(dashboard)/bio/page.tsx",
  "src/app/(dashboard)/bio/[id]/page.tsx",
];
```

Add the delete safety assertion:

```ts
it("does not clear company as part of deleting a bio", () => {
  const editor = source("src/app/(dashboard)/bio/[id]/page.tsx");
  const deleteStart = editor.indexOf("const handleDeleteBio");
  const saveStart = editor.indexOf("const handleSave");
  expect(deleteStart).toBeGreaterThan(-1);
  expect(saveStart).toBeGreaterThan(deleteStart);
  const deleteHandler = editor.slice(deleteStart, saveStart);
  expect(deleteHandler).not.toMatch(/company\s*:/);
});
```

- [ ] **Step 6: Run Task 3 tests to green**

```bash
npx jest src/__tests__/app/coach-bio-fields.test.tsx src/__tests__/lint/coach-profile-field-semantics.test.ts --runInBand
```

- [ ] **Step 7: Commit**

```bash
git add 'src/src/app/(dashboard)/bio/page.tsx' 'src/src/app/(dashboard)/bio/[id]/page.tsx' src/src/__tests__/app/coach-bio-fields.test.tsx src/src/__tests__/lint/coach-profile-field-semantics.test.ts
git commit -m "fix(bio): separate coach title and company"
```

---

### Task 4: Repair Circle synchronization and import compatibility

**Files:**
- Modify: `src/src/services/circle-sync.ts`
- Modify: `src/src/__tests__/unit/circle-sync.test.ts`
- Modify: `src/src/app/api/coaches/[id]/circle-import/route.ts`
- Modify: `src/src/__tests__/api/coaches-circle-import.test.ts`
- Modify: `src/src/__tests__/lint/coach-profile-field-semantics.test.ts`

**Interfaces:**
- Circle profile title/headline maps to `Coach.title`.
- Circle import response returns canonical `title`, canonical `company`, and `titleCredentials` as `title ?? ""`.
- Company is never present in Circle-derived Prisma update data.

- [ ] **Step 1: Change Circle-sync tests first**

In `src/src/__tests__/unit/circle-sync.test.ts`, give coach fixtures both fields:

```ts
title: null,
company: "A Step Above",
```

For default and force modes, replace company-update expectations with:

```ts
expect(db.coach.update).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ title: "Master Coach" }),
}));
const updateData = (db.coach.update as jest.Mock).mock.calls[0][0].data;
expect(updateData).not.toHaveProperty("company");
expect(result.fieldsUpdated).toContain("title");
expect(result.fieldsUpdated).not.toContain("company");
```

Add a non-force preservation test where `title: "Existing Title"`; Circle must not overwrite it. Keep all current avatar and warning assertions.

- [ ] **Step 2: Change Circle-import response tests first**

In `src/src/__tests__/api/coaches-circle-import.test.ts`, make the updated coach fixture explicit:

```ts
title: "Master Coach",
company: "A Step Above",
```

Change the successful sync result to:

```ts
(syncCoachFromCircle as jest.Mock).mockResolvedValue({
  success: true,
  updated: true,
  fieldsUpdated: ["bio", "title"],
  warnings: [warning],
});
```

Assert:

```ts
expect(body.data).toEqual(expect.objectContaining({
  title: "Master Coach",
  company: "A Step Above",
  titleCredentials: "Master Coach",
}));
expect(body.fieldsUpdated).toContain("title");
expect(body.fieldsUpdated).not.toContain("company");
```

- [ ] **Step 3: Run Circle tests and verify failure**

```bash
npx jest src/__tests__/unit/circle-sync.test.ts src/__tests__/api/coaches-circle-import.test.ts --runInBand
```

Expected: Circle title still updates company and the compatibility alias still comes from company.

- [ ] **Step 4: Map Circle title to the canonical field**

In `src/src/services/circle-sync.ts`, select `title` and replace the company branch:

```ts
if (profile.title && (force || !coach.title)) {
  updateData.title = profile.title.trim();
  fieldsUpdated.push("title");
}
```

Remove any documentation stating that Circle title maps to company. Do not include `company` in `updateData` anywhere in this service.

- [ ] **Step 5: Return canonical fields plus the compatibility alias**

In the Circle-import route, select `title` and `company`, then construct the successful response with:

```ts
title: updatedCoach.title,
company: updatedCoach.company,
titleCredentials: updatedCoach.title ?? "",
```

Do not mutate either field while constructing the response.

- [ ] **Step 6: Add Circle rules to the source guard**

```ts
it("never maps Circle title into company", () => {
  const sync = source("src/services/circle-sync.ts");
  expect(sync).toContain("updateData.title = profile.title.trim()");
  expect(sync).not.toContain("updateData.company = profile.title");
  expect(sync).not.toContain('fieldsUpdated.push("company")');
});
```

- [ ] **Step 7: Run Task 4 tests to green**

```bash
npx jest src/__tests__/unit/circle-sync.test.ts src/__tests__/api/coaches-circle-import.test.ts src/__tests__/lint/coach-profile-field-semantics.test.ts --runInBand
```

- [ ] **Step 8: Commit**

```bash
git add src/src/services/circle-sync.ts src/src/__tests__/unit/circle-sync.test.ts 'src/src/app/api/coaches/[id]/circle-import/route.ts' src/src/__tests__/api/coaches-circle-import.test.ts src/src/__tests__/lint/coach-profile-field-semantics.test.ts
git commit -m "fix(circle): sync professional title canonically"
```

---

### Task 5: Align BIO API and new landing-page defaults

**Files:**
- Modify: `src/src/app/api/bio/profiles/route.ts`
- Create: `src/src/__tests__/api/bio-profiles-fields.test.ts`
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/bio-page/page.tsx`
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx`
- Modify: `src/src/app/(dashboard)/workshops/[id]/landing-pages/duo-landing/page.tsx`
- Modify: `src/src/__tests__/lint/coach-profile-field-semantics.test.ts`
- Modify: `src/src/__tests__/lib/template-interpolation.test.ts`

**Interfaces:**
- BIO profiles API returns `title` resolved as canonical title → legacy company → default.
- BIO, Solo, and Duo editors use the same resolver only while initializing new editable page state.
- Saving and loading existing landing-page config stays unchanged.

- [ ] **Step 1: Write failing BIO API priority and fallback tests**

Create `src/src/__tests__/api/bio-profiles-fields.test.ts` with the complete route harness:

```ts
jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest extends Request {
    nextUrl: URL;

    constructor(input: string | URL | Request, init?: RequestInit) {
      super(input, init);
      this.nextUrl = new URL(typeof input === "string" ? input : input.toString());
    }
  },
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));
jest.mock("@/lib/db", () => ({
  db: { coach: { findMany: jest.fn() } },
}));
jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

import { GET } from "@/app/api/bio/profiles/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

it("prefers title and retains a read-only company fallback", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({
    userId: "admin-1",
    role: "ADMIN",
    email: "admin@example.com",
  });
  (db.coach.findMany as jest.Mock).mockResolvedValue([
  {
    id: "coach-1",
    firstName: "Lynne",
    lastName: "Verdun",
    title: "Master Coach",
    company: "A Step Above",
    profileImage: null,
    createdAt: new Date("2026-08-11T00:00:00.000Z"),
  },
  {
    id: "coach-2",
    firstName: "Legacy",
    lastName: "Coach",
    title: null,
    company: "Legacy Company Value",
    profileImage: null,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
  },
  ]);

  const request = new Request("http://localhost/api/bio/profiles") as Request & {
    nextUrl: URL;
  };
  request.nextUrl = new URL(request.url);
  const response = await GET(request as Parameters<typeof GET>[0]);
  const body = await response.json();

  expect(body.data[0]).toEqual(expect.objectContaining({
    title: "Master Coach",
    company: "A Step Above",
  }));
  expect(body.data[1]).toEqual(expect.objectContaining({
    title: "Legacy Company Value",
    company: "Legacy Company Value",
  }));
});
```

The second record demonstrates a read-only legacy fallback; it does not authorize a write.

- [ ] **Step 2: Run the BIO API test and verify failure**

```bash
npx jest src/__tests__/api/bio-profiles-fields.test.ts --runInBand
```

Expected: the API uses company directly as title and/or does not expose canonical company separately.

- [ ] **Step 3: Use the resolver in the BIO profiles API**

Select both `title` and `company`, import `resolveCoachProfessionalTitle`, and map:

```ts
return {
  id: coach.id,
  name: `${coach.firstName} ${coach.lastName}`.trim(),
  title: resolveCoachProfessionalTitle(coach),
  company: coach.company,
  photoUrl: coach.profileImage || "",
  createdAt: coach.createdAt.toISOString(),
  editUrl: `/bio/${coach.id}`,
};
```

- [ ] **Step 4: Wire the resolver into all three editor defaults**

In the BIO page editor, add `title: string | null` and `company: string | null` to `Workshop["coach"]`, then initialize inside the existing `coach` prefill:

```ts
coachTitle: resolveCoachProfessionalTitle(coach),
```

Change the editable label from `Title / Credentials` to `Professional Title`.

In Solo editor initialization:

```ts
coachTitle: resolveCoachProfessionalTitle(w.coach),
```

In Duo editor initialization, replace the primary coach's direct company fallback:

```ts
nextData.coach1 = {
  name: `${w.coach.firstName} ${w.coach.lastName}`.trim(),
  photo: w.coach.profileImage || "",
  title: resolveCoachProfessionalTitle(w.coach),
};
```

Add `company: string | null` to `CoachBioProfile`, and use the resolver in the existing mapper:

```ts
function mapProfileToCoach(profile: CoachBioProfile): Coach {
  return {
    name: profile.name,
    title: resolveCoachProfessionalTitle(profile),
    photo: profile.photoUrl || "",
  };
}
```

Do not modify the later `Object.assign(nextData, content)` calls: saved `landingPageConfig` values must continue to override defaults, preserving existing drafts and published snapshots.

- [ ] **Step 5: Add landing-default rules to the source guard**

Add `"src/app/(dashboard)/workshops/[id]/landing-pages/bio-page/page.tsx"` to the stale-label test's `files` array, then extend `coach-profile-field-semantics.test.ts` with:

```ts
it("uses the canonical resolver for landing-page title defaults", () => {
  const files = [
    "src/app/(dashboard)/workshops/[id]/landing-pages/bio-page/page.tsx",
    "src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx",
    "src/app/(dashboard)/workshops/[id]/landing-pages/duo-landing/page.tsx",
  ];
  for (const file of files) {
    expect(source(file)).toContain("resolveCoachProfessionalTitle");
  }
  expect(source(files[2])).not.toMatch(/title:\s*w\.coach\.company/);
});
```

- [ ] **Step 6: Lock template interpolation's existing fallback order**

Add this test inside `describe("buildWorkshopVariables — event_time / timezone wiring")`; it reuses that suite's `findUnique` mock and `mockWorkshop` helper:

```ts
it("prefers professional title over company for coach title variables", async () => {
  findUnique.mockResolvedValue(mockWorkshop({
    coach: {
      firstName: "Lynne",
      lastName: "Verdun",
      bio: null,
      profileImage: null,
      title: "Master Coach",
      company: "A Step Above",
    },
  }));

  const variables = await buildWorkshopVariables("ws-1");
  expect(variables?.coachTitle).toBe("Master Coach");
  expect(variables?.coach_title).toBe("Master Coach");
  expect(variables?.coach_company).toBe("A Step Above");
});
```

Do not change production interpolation: it already implements title → company → default.

- [ ] **Step 7: Run Task 5 tests to green**

```bash
npx jest src/__tests__/api/bio-profiles-fields.test.ts src/__tests__/lint/coach-profile-field-semantics.test.ts src/__tests__/lib/template-interpolation.test.ts --runInBand
```

- [ ] **Step 8: Commit**

```bash
git add src/src/app/api/bio/profiles/route.ts src/src/__tests__/api/bio-profiles-fields.test.ts 'src/src/app/(dashboard)/workshops/[id]/landing-pages/bio-page/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx' 'src/src/app/(dashboard)/workshops/[id]/landing-pages/duo-landing/page.tsx' src/src/__tests__/lint/coach-profile-field-semantics.test.ts src/src/__tests__/lib/template-interpolation.test.ts
git commit -m "fix(landing): resolve coach professional titles consistently"
```

---

### Task 6: Complete documentation, regression sweep, and release verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Verify: every file changed in Tasks 1–5

**Interfaces:**
- Documents the canonical field contract and the read-only fallback.
- Does not claim production launch or deployment.

- [ ] **Step 1: Search for remaining mismatches**

From the app root:

```bash
rg -n -i 'title\s*/\s*credentials|titleCredentials|company.*title|title.*company' src prisma
rg -n 'coach\.company|company:\s*(coach|w\.coach|profile)\.' src/src/app src/src/components src/src/services src/src/lib
```

Classify every match:

- Canonical field declarations and independent payloads are valid.
- The Circle-import `titleCredentials` compatibility alias is valid only when sourced from `title`.
- Read fallback inside `resolveCoachProfessionalTitle` and the existing template interpolation is valid.
- Any UI label `Title / Credentials`, Circle-title write to company, or company-only landing headline is a failure and must be repaired with a test before continuing.

- [ ] **Step 2: Update project source-of-truth documents**

Prepend a `2026-08-11` entry to `plans/CHANGELOG.md` with slug `coach-profile-fields-aligned-release-ready`. Record:

- Professional Title maps to `Coach.title` and Company Name maps to `Coach.company`.
- Admin/self profile routing, Admin BIO, coach create/details, Circle import, BIO API, and new landing defaults were aligned.
- Legacy read fallback remains; no migration or data rewrite occurred.
- Existing published landing-page snapshots remain unchanged.
- List the actual verification commands and results from Steps 3–7.
- Status is `release-ready` or `local verification complete`; do not call it launched or production-deployed.

Update `CLAUDE.md` `LAST_UPDATED_ISO`, `LAST_UPDATED_SLUG`, and the nearby current-state prose to reference the same release-ready entry without overwriting unrelated active-track information.

- [ ] **Step 3: Run targeted regression suites**

```bash
npx jest \
  src/__tests__/lib/coaches/coach-profile-fields.test.ts \
  src/__tests__/unit/validations.test.ts \
  src/__tests__/api/coaches-password-reset-url.test.ts \
  src/__tests__/api/coach-integration-ids.test.ts \
  src/__tests__/portal/coach-profile-form.test.tsx \
  src/__tests__/app/coach-bio-fields.test.tsx \
  src/__tests__/unit/circle-sync.test.ts \
  src/__tests__/api/coaches-circle-import.test.ts \
  src/__tests__/api/bio-profiles-fields.test.ts \
  src/__tests__/lint/coach-profile-field-semantics.test.ts \
  src/__tests__/lib/template-interpolation.test.ts \
  src/__tests__/lint/changelog-freshness.test.ts \
  --runInBand
```

- [ ] **Step 4: Lint every changed TypeScript/TSX file**

Build the exact list from Git instead of maintaining a stale hand-written list:

```bash
git diff --name-only origin/main -- 'src/**/*.ts' 'src/**/*.tsx' \
  | xargs npx eslint
```

- [ ] **Step 5: Run repository safety checks**

```bash
node scripts/check-migration-safety.mjs
git diff --check
```

Expected: migration safety passes with no new migration and Git reports no whitespace errors.

- [ ] **Step 6: Run the full Jest suite**

```bash
npx jest --runInBand
```

Expected: all suites pass. Existing known warnings may remain only if they match the baseline and are unrelated to these files.

- [ ] **Step 7: Run the production-equivalent Turbopack build**

```bash
CI=true npx next build --turbopack
```

Expected: successful build with no TypeScript, route, or prerender failure.

- [ ] **Step 8: Perform the approved visual acceptance check**

Start the app with the repository's existing local environment and inspect the coach Settings and Admin Edit screens side-by-side. Confirm:

- Professional Title contains `Master Coach`.
- Company Name contains `A Step Above`.
- The two fields remain independent after save and reload.
- Coach Details shows both labels.
- Admin BIO directory/editor shows both labels.
- No affected screen shows `Title / Credentials`.

Save screenshots only as temporary verification artifacts; do not commit them unless the user asks.

- [ ] **Step 9: Review the final diff and commit documentation**

```bash
git status --short
git diff --stat origin/main
git diff origin/main -- CLAUDE.md plans/CHANGELOG.md
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs: record coach profile field alignment"
```

- [ ] **Step 10: Confirm the branch is ready for review**

```bash
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: clean worktree, the approved design and implementation-plan commits followed by the task commits, and no unrelated files.
