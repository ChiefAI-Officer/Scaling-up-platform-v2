# Remove Report Design from Public Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all report-design selection and management controls from the simplified Public Campaigns UI so public campaigns always inherit the assessment default.

**Architecture:** Narrow the two Public Campaigns client surfaces without changing the report-style API, database fields, shared assessment editor, or list response contract. Creation stops serializing campaign overrides; the list stops rendering and managing the Public Campaigns-only report-design disclosure. Existing records and API compatibility remain intact.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Jest, Testing Library, Tailwind CSS, Vercel feature flags.

## Global Constraints

- Scope is limited to `/admin/assessments/public-campaigns` and `/admin/assessments/public-campaigns/new`.
- New public campaigns inherit the selected assessment's default report design.
- Existing campaigns retain their stored report-style values; do not migrate or rewrite records.
- Do not change the shared report-style system, assessment editor, API/schema support, or public respondent screens.
- Keep Publish, Copy link, View responses, Hide responses, validation, Cancel, and Create draft behavior unchanged.
- Keep `PublicCampaignViewModel` report-style fields and payload decoding backward compatible while the API returns them.
- The existing `WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_KILL` remains the emergency rollback; add no new flag.
- Use TDD: every production behavior change must first be proven by a focused failing test.

---

## File Map

- `src/src/components/admin/public-campaigns/CreatePublicCampaignForm.tsx` — creation form and POST payload; remove picker state, rendering, and override serialization.
- `src/src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx` — prove the picker is absent and `reportStyle` is never posted.
- `src/src/components/admin/public-campaigns/PublicCampaignActions.tsx` — row actions; remove `More` and report-design callbacks.
- `src/src/components/admin/public-campaigns/PublicCampaignList.tsx` — list state and disclosures; remove report-design state and rendering.
- `src/src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx` — prove report styles do not add a secondary action.
- `src/src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx` — preserve response disclosure behavior after report-design removal.
- Delete `src/src/components/admin/public-campaigns/PublicCampaignReportDesign.tsx` — Public Campaigns-only dead component.
- Delete `src/src/__tests__/components/admin/public-campaigns/public-campaign-report-design.test.tsx` — tests for the removed component.
- `CLAUDE.md` and `plans/CHANGELOG.md` — same-PR release-ready source-of-truth receipt.

---

### Task 1: Make creation always inherit the assessment default

**Files:**
- Modify: `src/src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx`
- Modify: `src/src/components/admin/public-campaigns/CreatePublicCampaignForm.tsx`

**Interfaces:**
- Consumes: `PublicCampaignCreateOption[]` and `POST /api/admin/public-campaigns`.
- Produces: the existing create payload without a `reportStyle` property.

- [ ] **Step 1: Replace picker expectations with a failing absence and payload test**

Update the plain-language form test so selecting an assessment still leaves report design absent:

```tsx
chooseAssessment();
expect(
  screen.queryByRole("heading", { name: "Report design" }),
).not.toBeInTheDocument();
expect(
  screen.queryByRole("group", { name: "Report design" }),
).not.toBeInTheDocument();
```

Replace the tests named `serializes scheduled dates and only the explicitly
customized report style`, `resets customization to the next assessment default
and resolves its preview anatomy`, and `removes report design for unsupported
assessments and never serializes a style` with one request-contract test:

```tsx
it("always inherits the assessment report design and omits an override", async () => {
  render(<CreatePublicCampaignForm options={OPTIONS} />);
  chooseAssessment("template-leadership");
  enterName();

  submit();

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  expect(submittedBody()).toEqual(
    expect.not.objectContaining({ reportStyle: expect.anything() }),
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
NODE_PATH=/Users/diushianstand/Scaling-up-platform-v2/src/node_modules \
  /Users/diushianstand/Scaling-up-platform-v2/src/node_modules/.bin/jest \
  src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx \
  --runInBand
```

Expected: FAIL because `Report design` still renders for a supported assessment.

- [ ] **Step 3: Remove picker state, rendering, and serialization**

In `CreatePublicCampaignForm.tsx`:

```tsx
// Remove ReportStylePicker, resolveReportStylePreviewAnatomy, ReportStyleKey,
// ReportStyleIntent, reportStyle, reportStyleIntent, and selectedOption.

function changeAssessment(nextTemplateId: string) {
  setTemplateId(nextTemplateId);
  clearFieldError("templateId");
}

const body = {
  templateId,
  name: name.trim(),
  openAt,
  closeAt,
};
```

Delete the conditional `Report design` section in full. Do not replace it with explanatory copy.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS with no warnings.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/src/components/admin/public-campaigns/CreatePublicCampaignForm.tsx \
  src/src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx
git commit -m "refactor(assessments): inherit public campaign report design"
```

---

### Task 2: Remove report-design management from the campaign list

**Files:**
- Modify: `src/src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx`
- Modify: `src/src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx`
- Modify: `src/src/components/admin/public-campaigns/PublicCampaignActions.tsx`
- Modify: `src/src/components/admin/public-campaigns/PublicCampaignList.tsx`
- Delete: `src/src/components/admin/public-campaigns/PublicCampaignReportDesign.tsx`
- Delete: `src/src/__tests__/components/admin/public-campaigns/public-campaign-report-design.test.tsx`

**Interfaces:**
- Consumes: `PublicCampaignViewModel`, campaign lifecycle state, and response disclosure callbacks.
- Produces: row actions limited to Publish, Copy link, View responses, and Hide responses.

- [ ] **Step 1: Write the failing row-action test**

Remove `onToggleReportDesign` and `reportDesignExpanded` from the test helper
and from every direct `PublicCampaignActions` render in this file, then replace
the supported-secondary-action test with:

```tsx
it.each(["DRAFT", "ACTIVE", "CLOSED"] as const)(
  "does not expose report design for %s campaigns",
  (status) => {
    renderActions(campaign({ status, reportStylesAvailable: true }));

    expect(screen.queryByText("More")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Report design" }),
    ).not.toBeInTheDocument();
  },
);
```

In the list integration test, remove report-design requests and assertions while retaining the response-panel cache/exclusivity assertions. Delete the stale-overlap test whose only second mutation is report-style saving.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
NODE_PATH=/Users/diushianstand/Scaling-up-platform-v2/src/node_modules \
  /Users/diushianstand/Scaling-up-platform-v2/src/node_modules/.bin/jest \
  src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx \
  src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx \
  --runInBand
```

Expected: FAIL because `More` and `Report design` still render when report styles are available.

- [ ] **Step 3: Remove list report-design code**

Change `PublicCampaignActionsProps` to:

```tsx
interface PublicCampaignActionsProps {
  campaign: PublicCampaignViewModel;
  origin: string;
  onCampaignUpdated: (updates: Pick<PublicCampaignViewModel, "status">) => void;
  onToggleResponses: () => void;
  responsesExpanded: boolean;
}
```

Delete the `<details>` block from `PublicCampaignActions`. In `PublicCampaignList`, remove the `PublicCampaignReportDesign` import, `reportDesignExpandedId` state, report-design update union, callback props, and disclosure row. Keep status patching and response disclosure behavior unchanged. Delete the now-unreferenced component and its dedicated test file.

- [ ] **Step 4: Run Public Campaigns component tests and verify GREEN**

Run:

```bash
NODE_PATH=/Users/diushianstand/Scaling-up-platform-v2/src/node_modules \
  /Users/diushianstand/Scaling-up-platform-v2/src/node_modules/.bin/jest \
  src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx \
  src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx \
  src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx \
  src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx \
  --runInBand
```

Expected: all suites PASS; no `PublicCampaignReportDesign` import remains.

- [ ] **Step 5: Verify no Public Campaigns UI reference remains**

Run:

```bash
rg -n "Report design|PublicCampaignReportDesign|onToggleReportDesign|reportDesignExpanded" \
  src/src/components/admin/public-campaigns \
  src/src/__tests__/components/admin/public-campaigns
```

Expected: no matches.

- [ ] **Step 6: Commit Task 2**

```bash
git add -A src/src/components/admin/public-campaigns \
  src/src/__tests__/components/admin/public-campaigns
git commit -m "refactor(assessments): remove public campaign report controls"
```

---

### Task 3: Record and verify the release-ready change

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Test: `src/src/__tests__/lint/changelog-freshness.test.ts`

**Interfaces:**
- Consumes: completed Task 1 and Task 2 behavior.
- Produces: protected-PR-ready branch with same-PR source-of-truth hygiene.

- [ ] **Step 1: Update the source-of-truth receipt**

Prepend a `public-campaign-report-design-removed-release-ready` entry to `plans/CHANGELOG.md` and match the `CLAUDE.md` freshness anchor. Record that both Public Campaigns controls are removed, new campaigns inherit the assessment default, API/schema compatibility remains, and browser/Production enablement is still pending.

- [ ] **Step 2: Run the documentation freshness test**

```bash
NODE_PATH=/Users/diushianstand/Scaling-up-platform-v2/src/node_modules \
  /Users/diushianstand/Scaling-up-platform-v2/src/node_modules/.bin/jest \
  src/__tests__/lint/changelog-freshness.test.ts --runInBand
```

Expected: 1 suite and 4 tests PASS.

- [ ] **Step 3: Run the required code gates**

From `src/`:

```bash
npx eslint \
  src/components/admin/public-campaigns/CreatePublicCampaignForm.tsx \
  src/components/admin/public-campaigns/PublicCampaignActions.tsx \
  src/components/admin/public-campaigns/PublicCampaignList.tsx \
  src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx \
  src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx \
  src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx
npx jest --runInBand
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

Expected: ESLint clean, all Jest suites PASS, migration safety PASS, and Turbopack build PASS.

- [ ] **Step 4: Commit Task 3**

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(assessments): ready public campaign report cleanup"
```

- [ ] **Step 5: Review, Preview acceptance, and protected release**

Use `superpowers:requesting-code-review` for final review. Push the branch, open a PR to `main`, temporarily enable `WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_ENABLED=1` only for that Preview branch, and visually confirm at 1440×900 and 1024×800 that neither Public Campaigns route exposes `Report design` or `More`. Remove the temporary Preview flag after acceptance. Merge only after required checks pass, wait for Production Ready, and run read-only smoke checks plus both `/api/health` aliases.
