# Summary Reports Coach Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Summary Reports coach-only and replace the eligible Coach group-report action with a dropdown whose first item opens the canonical Group report.

**Architecture:** The Admin server host stops resolving the Summary Reporting capability. The Coach host keeps the existing server authorization and passes the capability to `CampaignDetail`, which uses it only to select an accessible Radix dropdown instead of the byte-identical legacy anchor. The obsolete saved-history panel render is removed while its component, APIs, registry, and database tables remain intact.

**Tech Stack:** Next.js 15, React 19, TypeScript, Radix Dropdown Menu, Tailwind CSS, Jest, Testing Library

**Spec:** `docs/superpowers/specs/2026-08-30-summary-reports-coach-dropdown-design.md`

## Global Constraints

- Do not change any environment variable, feature flag, schema, migration, or Production data.
- Preserve `/assessments/<campaignId>/report` as the canonical Group report destination.
- The Group report destination must remain a plain `<a target="_blank" rel="noopener noreferrer">`; never use Next `<Link>`.
- With Summary Reporting absent or null, preserve the current single anchor byte-for-byte.
- Remove only the `SummaryReportsPanel` render; retain its component, API routes, registry, resolver, `SummaryReport`, and `SummaryReportSource` tables.
- Record `SUMMARY_REPORTING_CANARY` removal as a merge precondition owned outside this PR.

---

### Task 1: Lock the client dropdown contract with a failing test

**Files:**
- Modify: `src/src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx`
- Modify: `src/src/components/assessments/CampaignDetail.tsx`

**Interfaces:**
- Consumes: existing `CampaignDetailProps.summaryReporting`, `canViewGroupReport`, and `groupReportHref`
- Produces: `campaign-detail-view-group-report` button trigger and `campaign-detail-group-report-option` plain anchor when Summary Reporting is authorized

- [ ] **Step 1: Write the failing authorized-capability test**

Replace the old panel-replacement expectation with behavior assertions:

```tsx
render(
  <CampaignDetail
    initialOverview={makeOverview()}
    initialRespondents={[]}
    canViewGroupReport
    groupReportHref={GROUP_REPORT_HREF}
    summaryReporting={summaryReporting}
  />,
);

const trigger = screen.getByTestId("campaign-detail-view-group-report");
expect(trigger.tagName).toBe("BUTTON");
expect(trigger).toHaveTextContent("View reports");
expect(screen.queryByText("Summary Reports")).toBeNull();
expect(global.fetch).not.toHaveBeenCalled();

fireEvent.click(trigger);
const groupReport = await screen.findByTestId("campaign-detail-group-report-option");
expect(groupReport.tagName).toBe("A");
expect(groupReport).toHaveAttribute("href", GROUP_REPORT_HREF);
expect(groupReport).toHaveAttribute("target", "_blank");
expect(groupReport).toHaveAttribute("rel", "noopener noreferrer");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx jest src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx --runInBand`

Expected: FAIL because the authorized capability still removes `campaign-detail-view-group-report` and renders `SummaryReportsPanel`.

- [ ] **Step 3: Implement the minimal dropdown and remove the panel render**

In `CampaignDetail.tsx`:

```tsx
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, FileText } from "lucide-react";
```

Keep the exact existing anchor JSX in the `!summaryReporting` branch. In the authorized branch render:

```tsx
<DropdownMenu.Root>
  <DropdownMenu.Trigger asChild>
    <button type="button" data-testid="campaign-detail-view-group-report">
      <FileText aria-hidden className="h-4 w-4" />
      View reports
      <ChevronDown aria-hidden className="h-4 w-4" />
    </button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content align="end" sideOffset={6}>
      <DropdownMenu.Item asChild>
        <a
          href={groupReportHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="campaign-detail-group-report-option"
        >
          <FileText aria-hidden className="h-4 w-4" /> Group report
        </a>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
```

Apply the existing trigger classes and responsive touch-target contract, use semantic token classes for the menu, delete the `SummaryReportsPanel` import, and delete its render below the metrics strip.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npx jest \
  src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx \
  src/__tests__/components/assessments/campaign-detail-group-link.test.tsx \
  --runInBand
```

Expected: both suites pass; the legacy group-link suite still sees the exact plain anchor when Summary Reporting is absent.

- [ ] **Step 5: Commit the client behavior**

```bash
git add src/src/components/assessments/CampaignDetail.tsx src/src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx
git commit -m "feat(assessments): add coach report dropdown"
```

### Task 2: Remove Summary Reporting from the Admin host

**Files:**
- Modify: `src/src/__tests__/app/admin-campaign-detail-page.test.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx`

**Interfaces:**
- Consumes: existing Admin `groupReportGate` and `canViewGroupReport` authorization
- Produces: Admin `CampaignDetail` props with no `summaryReporting` property and unchanged group-report href/capability

- [ ] **Step 1: Invert the Admin capability test**

Replace the Admin Summary Reporting suite with an enabled-environment case that asserts:

```tsx
await renderPage();

expect(detailProps).not.toHaveProperty("summaryReporting");
expect(detailProps).toHaveProperty("groupReportHref", "/assessments/camp-1/report");
expect(detailProps).toHaveProperty("canViewGroupReport", true);
expect(mockCanViewGroup).toHaveBeenCalledTimes(1);
```

Also retain a flag-on/group-gate-off case asserting no extra `canViewGroupReport` lookup occurs.

- [ ] **Step 2: Run the Admin test and verify RED**

Run: `npx jest src/__tests__/app/admin-campaign-detail-page.test.tsx --runInBand`

Expected: FAIL because the Admin page still passes a non-null or null `summaryReporting` prop and resolves the narrower capability.

- [ ] **Step 3: Remove the Admin resolver and prop**

Delete the `resolveSummaryReportingCapability` import and all `summaryReportingCandidate`, `needsGroupReportAccess`, and `summaryReporting` composition. Replace the access computation with:

```ts
const canShowGroupReport =
  groupReportGate &&
  (await canViewGroupReport(asAccessDb(db), actor, id));
```

Delete `summaryReporting={summaryReporting}` from the Admin `CampaignDetail` call. Do not alter the Coach page.

- [ ] **Step 4: Run Admin and Coach composition tests and verify GREEN**

Run:

```bash
npx jest \
  src/__tests__/app/admin-campaign-detail-page.test.tsx \
  src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx \
  --runInBand
```

Expected: both suites pass; Admin exposes no Summary Reporting prop and Coach composition remains intact.

- [ ] **Step 5: Commit the host change**

```bash
git add 'src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx' src/src/__tests__/app/admin-campaign-detail-page.test.tsx
git commit -m "fix(assessments): keep summary reports coach-only"
```

### Task 3: Verify scope, document the change, and prepare the PR

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Verify: all files changed since `f84ad2ed7ce070a314d8bd75ad19254dc36a1544`

**Interfaces:**
- Consumes: completed client and Admin behavior from Tasks 1-2
- Produces: same-PR source-of-truth receipt and a reviewed PR against `main`

- [ ] **Step 1: Run the focused Summary Reporting matrix**

Run:

```bash
npx jest \
  src/__tests__/components/assessments/ \
  src/__tests__/api/assessment-summary-reports.test.ts \
  --runInBand
```

Expected: all matching suites pass.

- [ ] **Step 2: Run the complete Jest suite**

Run: `npm test -- --runInBand`

Expected: all suites and snapshots pass. If the known 5-second landscape PDF capture times out under full-suite load, rerun that exact suite in isolation and disclose both results; do not modify the unrelated test in this PR.

- [ ] **Step 3: Run migration safety and changed-file ESLint**

Run:

```bash
node scripts/check-migration-safety.mjs
npx eslint \
  'src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx' \
  src/components/assessments/CampaignDetail.tsx \
  src/__tests__/app/admin-campaign-detail-page.test.tsx \
  src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx
```

Expected: both commands exit 0 with no ESLint warnings or errors.

- [ ] **Step 4: Run the Production-equivalent build**

Run: `CI=true npm run build`

Expected: Prisma migration deploy/generate, TypeScript, Turbopack compilation, and page generation all exit 0.

- [ ] **Step 5: Update the source of truth in the same PR**

Prepend a `2026-08-30` CHANGELOG entry describing the coach-only dropdown, flag-off parity, retained APIs/tables, exact verification, and the unfulfilled external merge precondition that `SUMMARY_REPORTING_CANARY` be cleared. Update only `CLAUDE.md`'s `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor and brief Current Status prose for this implementation state.

- [ ] **Step 6: Commit the verification receipt**

```bash
git add CLAUDE.md plans/CHANGELOG.md docs/superpowers/specs/2026-08-30-summary-reports-coach-dropdown-design.md docs/superpowers/plans/2026-08-30-summary-reports-coach-dropdown.md
git commit -m "docs: record coach report dropdown implementation"
```

- [ ] **Step 7: Run two-axis review from the fixed point**

Use the code-review workflow with:

```bash
git diff f84ad2ed7ce070a314d8bd75ad19254dc36a1544...HEAD
git log f84ad2ed7ce070a314d8bd75ad19254dc36a1544..HEAD --oneline
```

Standards sources: `CLAUDE.md`, `docs/agents/parallel-threads.md`. Spec source: `docs/superpowers/specs/2026-08-30-summary-reports-coach-dropdown-design.md`. Address all actionable findings, rerun affected checks, commit, and repeat review until clear.

- [ ] **Step 8: Push and open the PR**

Push `codex/b1-summary-report-dropdown`, create a PR against `main`, include the verification evidence, link GH #387 without auto-closing the umbrella issue, and state `SUMMARY_REPORTING_CANARY` clearance under merge preconditions. Do not merge the PR or change the environment.
