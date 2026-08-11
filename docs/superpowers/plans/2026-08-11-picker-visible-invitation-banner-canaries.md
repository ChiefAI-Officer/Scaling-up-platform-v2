# Picker-Visible Invitation Banner Canaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent invitation-banner canary snapshots from exposing Template IDs that the authenticated actor cannot select in the live campaign picker, then merge and globally activate the completed universal invitation banner safely.

**Architecture:** Extract one server-only helper that produces the Prisma `AssessmentTemplateWhereInput` used by the campaign picker for privileged and Coach actors. Reuse that exact scope in both `GET /api/assessment-templates` and the new-campaign server page; batch-filter raw canary IDs server-side before serializing an IDs-only snapshot. Deploy dark only long enough to verify the exact Production build, then enable the globally authorized banner flag with the dedicated KILL switch ready.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Jest, React Testing Library, GitHub Actions, Vercel CLI.

## Global Constraints

- The universal invitation banner applies to `INVITED` assessment invitation emails only; PUBLIC and results/report flows remain unchanged.
- Raw `WAVE_INVITATION_BANNER_CANARY` values never cross the server/client boundary.
- Picker visibility always excludes `AssessmentTemplate.deletedAt != null` and `AssessmentTemplate.disabledAt != null`.
- Privileged ADMIN/STAFF Coach profiles see only live picker templates; ordinary Coaches additionally follow the picker's active-group intersection policy.
- Global enable and KILL snapshots serialize `canaryIds: []` and skip picker-visibility database work.
- Organization canaries remain limited to live Organizations authorized by `canAccessOrganization`.
- The filter fails closed; database or authorization errors never fall back to raw IDs.
- No schema migration, customer-data mutation, or customer email is introduced by this fix.
- Preserve default-off legacy/Wave-P bytes and the INVITED universal shell contract.
- Production activation sequence is protected-main merge → transient dark health/audit verification → global enable → enabled verification; `WAVE_INVITATION_BANNER_KILL` remains the immediate rollback.

---

### Task 1: Share the campaign-picker Template query scope

**Files:**
- Create: `src/src/lib/assessments/campaign-picker-template-scope.ts`
- Create: `src/src/__tests__/lib/assessments/campaign-picker-template-scope.test.ts`
- Modify: `src/src/app/api/assessment-templates/route.ts`
- Modify: `src/src/__tests__/api/assessment-templates/templates-route.test.ts`

**Interfaces:**
- Consumes: `ApiActor`, `isPrivilegedRole`, active access-group membership, and `AccessGroupTemplate` grants.
- Produces:

```ts
export type CampaignPickerTemplateScopeDb = Pick<
  Prisma.TransactionClient,
  "accessGroupCoach" | "accessGroupTemplate"
>;

export async function campaignPickerTemplateWhere(
  db: CampaignPickerTemplateScopeDb,
  actor: ApiActor,
): Promise<Prisma.AssessmentTemplateWhereInput>;
```

- The returned `where` always includes `deletedAt: null` and `disabledAt: null`.
- Privileged actors receive the live predicate only.
- Actors without `coachId`, without active groups, or without intersection grants receive `id: { in: [] }`.
- Ordinary Coach access uses the same active-group intersection calculation currently embedded in the picker route.

- [ ] **Step 1: Write failing scope tests**

Add behavior tests that assert:

```ts
await expect(campaignPickerTemplateWhere(db, adminActor)).resolves.toEqual({
  deletedAt: null,
  disabledAt: null,
});

await expect(campaignPickerTemplateWhere(db, coachActor)).resolves.toEqual({
  id: { in: ["tpl-shared"] },
  deletedAt: null,
  disabledAt: null,
});
```

The Coach fixture must include two active groups, one template granted by both,
one granted by only one, and one grant belonging to a deleted group. Add
no-Coach and no-active-group cases returning an empty ID list.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
npx jest src/__tests__/lib/assessments/campaign-picker-template-scope.test.ts --runInBand
```

Expected: FAIL because the module/export does not exist.

- [ ] **Step 3: Implement the minimal shared scope helper**

Move only the existing active-group/intersection calculation from the route.
Keep it server-only and return a Prisma `where` object; do not return Template
names or serialize actor/canary data.

- [ ] **Step 4: Refactor the picker route to consume the helper**

Compute the shared scope once after authentication:

```ts
const templateWhere = await campaignPickerTemplateWhere(db, actor);
```

In both existing `assessmentTemplate.findMany` calls, replace only the `where`
property with `where: templateWhere`. Retain each branch's current `select`,
ordering, response fields, report-style capability queries, conditional
`defaultReportStyle` omission, and `sendResultsDefault`/approval behavior
byte-for-byte.

- [ ] **Step 5: Update route fixtures and prove byte-compatible behavior**

Cover privileged live-template filtering and ordinary Coach intersection using
the existing route assertions. Disabled/deleted templates must remain absent.

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/campaign-picker-template-scope.test.ts \
  src/__tests__/api/assessment-templates/templates-route.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 6: Lint and commit Task 1**

```bash
npx eslint \
  src/lib/assessments/campaign-picker-template-scope.ts \
  src/app/api/assessment-templates/route.ts \
  src/__tests__/lib/assessments/campaign-picker-template-scope.test.ts \
  src/__tests__/api/assessment-templates/templates-route.test.ts
git diff --check
git add \
  src/src/lib/assessments/campaign-picker-template-scope.ts \
  src/src/app/api/assessment-templates/route.ts \
  src/src/__tests__/lib/assessments/campaign-picker-template-scope.test.ts \
  src/src/__tests__/api/assessment-templates/templates-route.test.ts
git commit -m "refactor(assessments): share campaign picker scope"
```

---

### Task 2: Batch-filter banner canaries through picker visibility

**Files:**
- Modify: `src/src/lib/assessments/wave-invitation-banner-flags.ts`
- Modify: `src/src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts`
- Modify: `src/src/app/(portal)/portal/assessments/new/page.tsx`
- Modify: `src/src/__tests__/app/portal-new-campaign-page.test.tsx`

**Interfaces:**
- Consumes: `campaignPickerTemplateWhere(db, actor)` from Task 1 and `canAccessOrganization`.
- Changes the authoring-gate filter from per-ID probing to one batch callback:

```ts
export type FilterInvitationBannerCanaryIds = (
  configuredIds: readonly string[],
) => Promise<readonly string[]>;

export async function getInvitationBannerAuthoringGate(
  filterVisibleIds?: FilterInvitationBannerCanaryIds,
): Promise<InvitationBannerAuthoringGate>;
```

- The helper intersects the callback result with the original configured-ID set,
  preserving configured order and deduplication; a callback cannot inject IDs.

- [ ] **Step 1: Write failing flag-helper tests**

Add tests proving:

```ts
await getInvitationBannerAuthoringGate(async (configuredIds) => {
  expect(configuredIds).toEqual(["org-1", "tpl-live", "tpl-hidden"]);
  return ["tpl-live", "not-configured", "org-1"];
});
// => { globallyEnabled: false, canaryIds: ["org-1", "tpl-live"] }
```

Also prove global enable and KILL both return `canaryIds: []` without invoking
the callback, and KILL overrides a matching canary.

- [ ] **Step 2: Write failing new-page security regressions**

Update the page test harness to model actual Prisma queries and assert:

- hybrid ADMIN and STAFF actors retain only live Template canaries;
- deleted, disabled, invalid, and stale-grant Template IDs are absent;
- a normal Coach receives exactly the shared-scope Template rows;
- a live owned Organization canary remains;
- inaccessible Organization IDs remain absent; and
- global/KILL render IDs-empty snapshots without Template/Organization access
  queries.

Assert on the `CampaignWizard` prop, not internal mocks:

```ts
expect(mockCampaignWizard).toHaveBeenCalledWith(
  expect.objectContaining({
    invitationBannerGate: {
      globallyEnabled: false,
      canaryIds: ["org-owned", "tpl-live"],
    },
  }),
  undefined,
);
```

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
npx jest \
  src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts \
  src/__tests__/app/portal-new-campaign-page.test.tsx \
  --runInBand
```

Expected: FAIL because the current helper probes one ID and the page uses
`canAccessTemplate` instead of the live picker scope.

- [ ] **Step 4: Implement server-only batch filtering**

In the new page callback:

```ts
const templateWhere = await campaignPickerTemplateWhere(db, actor);
const [templateRows, organizationVisibility] = await Promise.all([
  db.assessmentTemplate.findMany({
    where: { AND: [templateWhere, { id: { in: [...configuredIds] } }] },
    select: { id: true },
  }),
  Promise.all(
    configuredIds.map(async (id) => ({
      id,
      visible: await canAccessOrganization(accessDb, actor, id),
    })),
  ),
]);
```

Return the configured-order union of live Template IDs and visible Organization
IDs. Remove `canAccessTemplate` from the page. Do not catch database errors or
fall back to configured IDs.

- [ ] **Step 5: Run GREEN and compatibility suites**

```bash
npx jest \
  src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts \
  src/__tests__/app/portal-new-campaign-page.test.tsx \
  src/__tests__/api/assessment-templates/templates-route.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 6: Lint and commit Task 2**

```bash
npx eslint \
  src/lib/assessments/wave-invitation-banner-flags.ts \
  'src/app/(portal)/portal/assessments/new/page.tsx' \
  src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts \
  src/__tests__/app/portal-new-campaign-page.test.tsx
git diff --check
git add \
  src/src/lib/assessments/wave-invitation-banner-flags.ts \
  'src/src/app/(portal)/portal/assessments/new/page.tsx' \
  src/src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts \
  src/src/__tests__/app/portal-new-campaign-page.test.tsx
git commit -m "fix(assessments): filter banner canaries by picker visibility"
```

---

### Task 3: Record readiness and run the full local verification gate

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Modify: `docs/specs/v7.6/17d-ops-runbook.md`

**Interfaces:**
- Consumes: reviewed commits from Tasks 1-2 and the locked production sequence.
- Produces: a clean, locally verified branch and a truthful default-off receipt
  ready for independent whole-branch review.

- [ ] **Step 1: Update source-of-truth receipts**

Record the picker-visible authorization fix without claiming merge or launch.
Replace the runbook's per-ID `canAccessTemplate` wording with the shared live
picker-scope contract, and state that deleted, disabled, invalid, and stale-grant
Template IDs never enter the browser snapshot. Keep the banner default-off
wording until the Production activation is observed.

- [ ] **Step 2: Run the full pre-push verification gate**

From `src/`:

```bash
npx jest \
  src/__tests__/lib/assessments/campaign-picker-template-scope.test.ts \
  src/__tests__/api/assessment-templates/templates-route.test.ts \
  src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts \
  src/__tests__/app/portal-new-campaign-page.test.tsx \
  --runInBand
npx eslint \
  src/lib/assessments/campaign-picker-template-scope.ts \
  src/app/api/assessment-templates/route.ts \
  src/lib/assessments/wave-invitation-banner-flags.ts \
  'src/app/(portal)/portal/assessments/new/page.tsx'
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
npx jest --runInBand --silent
git diff --check
```

Expected: all authoritative gates pass. If standalone `npx tsc --noEmit`
remains nonzero only on the documented repository baseline, record it separately
and never label it green.

- [ ] **Step 3: Commit the local readiness receipt**

```bash
git add CLAUDE.md plans/CHANGELOG.md docs/specs/v7.6/17d-ops-runbook.md
git commit -m "docs(assessments): record picker-visible banner canaries"
```

No push, PR readiness transition, merge, Production flag mutation, redeploy, or
customer email occurs inside this implementation task.

---

## Post-SDD release procedure

These controller-owned steps run only after per-task reviews and the final
whole-branch review are clean. They are not delegated to a task implementer.

- [ ] **Release Step 1: Push and close independent review**

Review must explicitly verify hybrid ADMIN/STAFF, deleted/disabled/stale grant
exclusion, ordinary Coach picker parity, Organization canaries, global/KILL
query skipping, and no raw allowlist serialization. Any Critical/Important
finding blocks readiness and merge.

After a clean verdict:

```bash
git push origin codex/invitation-email-banner-design
gh pr ready 331 --repo ChiefAI-Officer/Scaling-up-platform-v2
gh pr checks 331 --repo ChiefAI-Officer/Scaling-up-platform-v2 --watch
```

Do not merge until Build and Migration Safety Gate are successful and branch
protection permits it.

- [ ] **Release Step 2: Merge through protected `main`**

Use the repository's allowed merge method without bypassing protection:

```bash
gh pr merge 331 --repo ChiefAI-Officer/Scaling-up-platform-v2 --squash --delete-branch
```

If approval or a required check blocks merge, stop and report the exact GitHub
state; do not use admin bypass.

- [ ] **Release Step 3: Verify the transient dark Production deployment**

Wait for the `main` Vercel deployment to become Ready, then verify:

```bash
curl -sS https://scaling-up-platform-v2.vercel.app/api/health
npx vercel ls 2>&1 | head -5
```

Read current Production banner/custom-HTML variables through the approved
operator path and run the runbook's read-only custom-HTML audit. Stop on any
unreviewed live override or failed health/deployment check.

Run the audit from `src/` with operator-supplied values kept out of receipts:

```bash
WAVE_D_CUSTOM_HTML_EMAIL_ENABLED="$CURRENT_WAVE_D_CUSTOM_HTML_EMAIL_ENABLED" \
ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED="$CURRENT_ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED" \
AUDIT_READONLY_URL="$GH220_READONLY_DATABASE_URL" \
npm run audit:invitation-html-overrides
```

- [ ] **Release Step 4: Globally enable and verify**

Using the authenticated Vercel REST API, target project
`prj_xcAWuAmGZAU3DCHgAauRv2WPKneo` under team
`team_ek3PMuEYCgI0DKZ2EFexMgya`. Upsert
`WAVE_INVITATION_BANNER_ENABLED` with value `1`, `type:"encrypted"`, and
`target:["production"]`; ensure `WAVE_INVITATION_BANNER_KILL` is absent/off.
Do not use piped `vercel env add` and do not print tokens or decrypted values.
Redeploy the exact merged Production deployment with:

```bash
npx vercel redeploy "$DARK_READY_HOST" \
  --target production \
  --scope scaling-up \
  --non-interactive \
  --no-color
```

Wait for Ready, re-run both canonical health checks, verify the Production
aliases point to the enabled deployment, and inspect only PII-free organic-send
telemetry. Do not manufacture a customer invitation.

- [ ] **Release Step 5: Record launch and update tracking**

Add the exact PR, merge commit, deployment, health, flag, and telemetry receipt
to `CLAUDE.md`, `plans/CHANGELOG.md`, and the matching Notion task. If launch is
successful, set the task to `Done`; otherwise keep it `In progress` with the
blocking state. Any post-merge receipt change returns through a protected PR.
