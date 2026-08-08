# Organization-Free Public Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove organization selection from public-campaign creation while preserving organization ownership as a required invariant for invited campaigns.

**Architecture:** Keep the shared `AssessmentCampaign` aggregate, make its organization foreign key nullable, and enforce the access-mode distinction at application write boundaries. Existing public rows remain unchanged; new public rows store `organizationId = null`. Shared readers become deliberately null-safe without weakening invited campaign creation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Prisma 5/PostgreSQL, Jest/Testing Library.

At execution start, record the review fixed point before any implementation edit:

```bash
export IMPLEMENTATION_FIXED_POINT="$(git rev-parse HEAD)"
```

## Global Constraints

- Preserve all existing public campaign organization links; do not backfill or clear rows.
- `INVITED` campaign creation must continue requiring `organizationId`.
- New admin-created `PUBLIC` campaigns must store `organizationId = null`.
- Remove the Organization field and `/api/organizations` fetch from `PublicCampaignsManager`.
- Do not create or assign a synthetic organization.
- Do not deploy, run `prisma migrate deploy`, or mutate production data.
- Use red-green TDD for every behavior change.
- Preserve unrelated working-tree changes and loose artifacts.

---

### Task 1: Public-Campaign API Creates Organization-Free Rows

**Files:**
- Modify: `src/src/__tests__/api/admin-public-campaigns.test.ts`
- Modify: `src/src/app/api/admin/public-campaigns/route.ts`

**Interfaces:**
- Consumes: `POST /api/admin/public-campaigns` JSON `{ templateId, name, openAt, closeAt?, publicConfig? }`.
- Produces: a DRAFT `AssessmentCampaign` with `accessMode: "PUBLIC"`, `createdByCoachId: null`, and `organizationId: null`.

- [ ] **Step 1: Write failing API tests**

Remove `organizationId` from `validBody`. Replace the missing-organization rejection with:

```ts
it("creates a PUBLIC campaign without an organization", async () => {
  const res = await createPost(makeCreateRequest(validBody) as never);
  expect(res.status).toBe(201);
  expect(db.organization.findUnique).not.toHaveBeenCalled();
  expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ organizationId: null }),
    }),
  );
});

it("records the absent organization in the audit receipt", async () => {
  await createPost(makeCreateRequest(validBody) as never);
  expect(logAudit).toHaveBeenCalledWith(
    expect.objectContaining({
      changes: expect.objectContaining({ organizationId: null }),
    }),
  );
});
```

Extend the P2002 test:

```ts
expect(
  (db.assessmentCampaign.create as jest.Mock).mock.calls.map(
    ([args]) => args.data.organizationId,
  ),
).toEqual([null, null]);
```

- [ ] **Step 2: Run the test and verify RED**

From `src/`:

```bash
npx jest src/__tests__/api/admin-public-campaigns.test.ts --runInBand
```

Expected: FAIL because the route rejects the organization-free body and queries `db.organization`.

- [ ] **Step 3: Implement the minimal route change**

Remove `organizationId` from `createPublicCampaignSchema` and the parsed-data destructure. Delete the organization lookup. In both normal and collision-retry create data use:

```ts
organizationId: null,
```

Keep the audit field explicit:

```ts
changes: {
  accessMode: "PUBLIC",
  templateId,
  organizationId: null,
  versionId: version.id,
  alias: campaign.alias,
},
```

- [ ] **Step 4: Run the test and verify GREEN**

```bash
npx jest src/__tests__/api/admin-public-campaigns.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the API slice**

```bash
git add src/src/__tests__/api/admin-public-campaigns.test.ts src/src/app/api/admin/public-campaigns/route.ts
git commit -m "feat(assessments): create public campaigns without orgs"
```

---

### Task 2: Remove Organization From the Public-Campaign Form

**Files:**
- Modify: `src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx`
- Modify: `src/src/components/admin/PublicCampaignsManager.tsx`

**Interfaces:**
- Consumes: templates and campaign lists only.
- Produces: a public create request with no `organizationId` property.

- [ ] **Step 1: Write failing UI tests**

```tsx
it("does not load or display organization selection", async () => {
  render(<PublicCampaignsManager />);
  await screen.findByText("Create New PUBLIC Campaign");
  expect(screen.queryByLabelText(/organization/i)).not.toBeInTheDocument();
  expect(
    screen.queryByText(/organizationId is required by the schema/i),
  ).not.toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalledWith("/api/organizations");
});

it("submits a public campaign without organizationId", async () => {
  render(<PublicCampaignsManager />);
  await screen.findByText("Create New PUBLIC Campaign");
  fireEvent.change(screen.getByLabelText(/template/i), {
    target: { value: "t1" },
  });
  fireEvent.change(screen.getByLabelText(/campaign name/i), {
    target: { value: "Public Quiz" },
  });
  fireEvent.change(screen.getByLabelText(/open at/i), {
    target: { value: "2026-08-08T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: /create public campaign/i }));

  await waitFor(() => {
    const call = (global.fetch as jest.Mock).mock.calls.find(
      ([url, init]) =>
        url === "/api/admin/public-campaigns" && init?.method === "POST",
    );
    expect(call).toBeDefined();
    expect(JSON.parse(call[1].body)).not.toHaveProperty("organizationId");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npx jest src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx --runInBand
```

Expected: FAIL on the selector, hint, organization fetch, and POST property.

- [ ] **Step 3: Implement the minimal UI change**

Remove `OrgSummary`, organization state, organization validation/reset, `organizationId` from the POST body, and the complete Organization field block. Load exactly two resources:

```ts
const [campsRes, tmplRes] = await Promise.all([
  fetch("/api/assessment-campaigns"),
  fetch("/api/admin/assessment-templates"),
]);
```

Use:

```ts
if (!templateId || !name || !openAt) {
  setFormError("Template, Name, and Open Date are required.");
  return;
}
```

- [ ] **Step 4: Run the test and verify GREEN**

```bash
npx jest src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the UI slice**

```bash
git add src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx src/src/components/admin/PublicCampaignsManager.tsx
git commit -m "feat(assessments): remove org picker from public campaigns"
```

---

### Task 3: Relax the Database Constraint Without Backfilling

**Files:**
- Create: `src/src/__tests__/prisma/public-campaign-optional-organization-migration.test.ts`
- Create: `src/prisma/migrations/20260808120000_public_campaign_optional_organization/migration.sql`
- Modify: `src/prisma/schema.prisma`
- Modify: `src/src/__tests__/lib/validations.test.ts`

**Interfaces:**
- Produces: Prisma `organizationId: string | null` and `organization: Organization | null`.
- Preserves: existing indexes and every existing row value.

- [ ] **Step 1: Write the failing schema/migration test**

```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const migrationPath = path.join(
  root,
  "prisma/migrations/20260808120000_public_campaign_optional_organization/migration.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

describe("public campaign optional organization migration", () => {
  it("makes the AssessmentCampaign scalar and relation optional", () => {
    const model = schema.match(/model AssessmentCampaign \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(model).toMatch(/organizationId\s+String\?/);
    expect(model).toMatch(/organization\s+Organization\?/);
  });

  it("drops only NOT NULL and performs no row backfill", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toMatch(
      /ALTER TABLE "assessment_campaigns" ALTER COLUMN "organizationId" DROP NOT NULL;/,
    );
    expect(migration).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bINSERT\b/i);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npx jest src/__tests__/prisma/public-campaign-optional-organization-migration.test.ts --runInBand
```

Expected: FAIL because the fields are required and the migration is absent.

- [ ] **Step 3: Add the schema and migration**

```prisma
organizationId String?
organization   Organization? @relation(fields: [organizationId], references: [id])
```

```sql
-- Spec 19ap: PUBLIC campaigns have no organization roster or ownership.
-- Existing rows are preserved; this changes only column nullability.
-- @approved: Drops a NOT NULL constraint without deleting or rewriting data; approved in Spec 19ap.
ALTER TABLE "assessment_campaigns" ALTER COLUMN "organizationId" DROP NOT NULL;
```

- [ ] **Step 4: Verify and regenerate Prisma types**

```bash
npx jest src/__tests__/prisma/public-campaign-optional-organization-migration.test.ts --runInBand
npx prisma format
npx prisma validate
npx prisma generate
node scripts/check-migration-safety.mjs --migration=20260808120000_public_campaign_optional_organization
```

Expected: test PASS and every command exits 0.

- [ ] **Step 5: Pin the invited write invariant**

Import `createAssessmentCampaignSchema` in `src/src/__tests__/lib/validations.test.ts` and add:

```ts
it("keeps organizationId required for invited campaign creation", () => {
  const result = createAssessmentCampaignSchema.safeParse({
    name: "Invited campaign",
    templateId: "tpl-1",
    openAt: "2026-08-08T12:00:00.000Z",
    endMode: "OPEN_END",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["organizationId"] }),
      ]),
    );
  }
});
```

Run:

```bash
npx jest src/__tests__/lib/validations.test.ts --runInBand
```

Expected: PASS without changing `createAssessmentCampaignSchema`.

- [ ] **Step 6: Commit the data-model slice**

```bash
git add src/prisma/schema.prisma src/prisma/migrations/20260808120000_public_campaign_optional_organization/migration.sql src/src/__tests__/prisma/public-campaign-optional-organization-migration.test.ts src/src/__tests__/lib/validations.test.ts
git commit -m "feat(assessments): allow org-free public campaign rows"
```

---

### Task 4: Make Shared Readers Null-Safe

**Files:**
- Modify: `src/src/__tests__/assessments/public-lead-report.test.ts`
- Modify: `src/src/lib/assessments/public-lead-report.ts`
- Modify: `src/src/__tests__/lib/assessments/aggregate-report.test.ts`
- Modify: `src/src/lib/assessments/aggregate-report.ts`
- Modify: `src/src/__tests__/lib/assessments/campaign-list-items.test.ts`
- Modify: `src/src/lib/assessments/campaign-list-items.ts`
- Modify: `src/src/__tests__/lib/assessments/respondent-report.test.ts`
- Modify: `src/src/lib/assessments/respondent-report.ts`
- Modify: `src/src/__tests__/lib/assessments/campaign-detail.test.ts`
- Modify: `src/src/lib/assessments/campaign-detail.ts`
- Modify: `src/src/__tests__/lib/assessments/group-report.loader.test.ts`
- Modify: `src/src/lib/assessments/group-report.ts`
- Modify: `src/src/lib/assessments/access-control.ts`
- Modify: `src/src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx`

**Interfaces:**
- Public readers use no company attribution when organization is absent.
- Invited-only readers fail closed before organization-scoped queries or URLs.
- Aggregate `distinctOrgs` excludes organization-free submissions.

- [ ] **Step 1: Write failing null-compatibility tests**

Add to `public-lead-report.test.ts`:

```ts
it("renders an organization-free public report without a company name", async () => {
  const outcome = await getPublicLeadReport(
    fakeDb(submission({
      campaign: { ...submission().campaign, organization: null },
    })) as never,
    ownerActor,
    "sub-1",
    enabledEnv,
  );
  expect(outcome.status).toBe("ok");
  if (outcome.status === "ok") expect(outcome.report.companyName).toBe("");
});
```

Change aggregate test fixtures to `organizationId: string | null` and add one null-org submission expecting `totalSubmissions === 1` and `distinctOrgs === 0`.

Change `CampaignListRow.organization` to accept null in its fixture and add:

```ts
it("omits a campaign whose list organization is absent", () => {
  expect(toCampaignListItems([row({ organization: null })])).toEqual([]);
});
```

Add focused tests proving `getRespondentReport` returns `not-found` for a null organization, `getCampaignOverview` uses its existing not-found error for a null organization, an organization-free PUBLIC group report remains `notApplicable/public`, and an invalid organization-free INVITED group report fails closed.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npx jest src/__tests__/assessments/public-lead-report.test.ts src/__tests__/lib/assessments/aggregate-report.test.ts src/__tests__/lib/assessments/campaign-list-items.test.ts src/__tests__/lib/assessments/respondent-report.test.ts src/__tests__/lib/assessments/campaign-detail.test.ts src/__tests__/lib/assessments/group-report.loader.test.ts --runInBand
```

Expected: FAIL on unchecked organization access, null counting, and list mapping.

- [ ] **Step 3: Implement public-reader fallbacks**

In `public-lead-report.ts`:

```ts
companyName: submission.campaign.organization?.name ?? "",
```

In `aggregate-report.ts`:

```ts
campaign: { organizationId: string | null };
```

```ts
if (row.campaign.organizationId !== null) {
  orgIds.add(row.campaign.organizationId);
}
```

In `campaign-list-items.ts`, make `organization` nullable and switch `map` to `flatMap`, returning `[]` before projection when `c.organization === null`.

- [ ] **Step 4: Implement invited-reader guards**

In `respondent-report.ts`:

```ts
if (!submission || !submission.campaign.organization) {
  return { status: "not-found" } as const;
}
```

In `campaign-detail.ts`:

```ts
if (!campaign || !campaign.organization) {
  throw new Error(`Campaign ${campaignId} not found`);
}
```

In `group-report.ts`, retain the PUBLIC `notApplicable` branch before:

```ts
if (campaign.organizationId === null || campaign.organization === null) {
  return { kind: "forbidden" } as const;
}
```

In both organization-dependent access-control branches:

```ts
if (campaign.organizationId === null) return false;
```

In `resolveLongitudinalEntry`, return `null` when `campaign.organizationId === null` before eligibility checks or URL construction.

- [ ] **Step 5: Verify focused tests GREEN**

```bash
npx jest src/__tests__/assessments/public-lead-report.test.ts src/__tests__/lib/assessments/aggregate-report.test.ts src/__tests__/lib/assessments/campaign-list-items.test.ts src/__tests__/lib/assessments/respondent-report.test.ts src/__tests__/lib/assessments/campaign-detail.test.ts src/__tests__/lib/assessments/group-report.loader.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Close nullable Prisma compile findings**

```bash
npx tsc --noEmit
```

For each invited-only participant, respondent, invitation, reminder, trend, longitudinal, import, or list caller reported by TypeScript, add an early `organizationId === null` fail-closed return before the organization-scoped call. Do not use `organizationId!`, `String(organizationId)`, or `""`. Re-run `npx tsc --noEmit` until exit 0.

- [ ] **Step 7: Commit the compatibility slice**

```bash
git add src/src/__tests__ src/src/lib/assessments src/src/app
git commit -m "fix(assessments): handle org-free public campaign reads"
```

---

### Task 5: Full Verification and Review

**Files:**
- Review every file changed since the implementation fixed point.
- Modify only files required by verification or actionable review findings.

- [ ] **Step 1: Run targeted regressions**

```bash
npx jest src/__tests__/api/admin-public-campaigns.test.ts src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx src/__tests__/prisma/public-campaign-optional-organization-migration.test.ts src/__tests__/lib/validations.test.ts src/__tests__/assessments/public-lead-report.test.ts src/__tests__/lib/assessments/aggregate-report.test.ts src/__tests__/lib/assessments/campaign-list-items.test.ts src/__tests__/lib/assessments/respondent-report.test.ts src/__tests__/lib/assessments/campaign-detail.test.ts src/__tests__/lib/assessments/group-report.loader.test.ts --runInBand
```

Expected: zero failing tests.

- [ ] **Step 2: Run database and type gates**

```bash
npx prisma validate
node scripts/check-migration-safety.mjs
npx tsc --noEmit
```

Expected: every command exits 0.

- [ ] **Step 3: Lint changed TypeScript files**

```bash
git diff --name-only "$IMPLEMENTATION_FIXED_POINT"..HEAD -- '*.ts' '*.tsx' | xargs npx eslint
```

Expected: zero ESLint errors.

- [ ] **Step 4: Run the production build gate**

```bash
CI=true npx next build --turbopack
```

Expected: exit 0.

- [ ] **Step 5: Inspect scope and migration honesty**

```bash
git diff --check "$IMPLEMENTATION_FIXED_POINT"..HEAD
git diff --stat "$IMPLEMENTATION_FIXED_POINT"..HEAD
git status --short
```

Confirm the migration has no row mutation, invited validation is unchanged, existing public rows are not backfilled, the UI has no organization selector/fetch, and unrelated user files remain untouched.

- [ ] **Step 6: Review and fix actionable findings**

Run the repository code-review workflow against `$IMPLEMENTATION_FIXED_POINT`. Address in-scope actionable findings, rerun affected verification, stage only the exact files changed for those findings, and commit fixes:

```bash
git commit -m "fix(assessments): address org-free campaign review"
```

- [ ] **Step 7: Report without deploying**

Report the migration, API/UI behavior, compatibility handling, exact verification results, commits, and the fact that no production migration or deployment occurred.
