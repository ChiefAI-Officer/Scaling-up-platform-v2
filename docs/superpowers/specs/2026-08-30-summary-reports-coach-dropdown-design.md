# Summary Reports Coach Dropdown Design

**Date:** 2026-08-30  
**Tracker:** [GH #387](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/387), item 3 / Handoff B1  
**Fixed point:** `f84ad2ed7ce070a314d8bd75ad19254dc36a1544` (`origin/main` after PR #396)

## Goal

Move the Summary Reports launch surface out of the Admin campaign host and turn the eligible Coach campaign's existing group-report action into a report dropdown. This slice exposes only the canonical Group report destination; Condensed and Comparison are separate B2/B3 slices.

## Product Contract

- Admin never resolves or receives the Summary Reporting capability and never renders the Summary Reports panel.
- Admin retains its existing `View group report` entry and canonical `/assessments/<campaignId>/report` destination.
- Coach campaigns with an authorized Summary Reporting capability render a `View reports` dropdown trigger in the existing header action position.
- The dropdown's first and only B1 item is `Group report`. It opens the existing canonical HTML report in a new tab.
- The Group report menu item remains a plain `<a target="_blank" rel="noopener noreferrer">`. A Next `<Link>` is forbidden because prefetching the bulk-PII route can emit `GROUP_REPORT_VIEW` before an explicit click.
- Coach campaigns without the Summary Reporting capability, including every other assessment family and flag-off Scaling Up Full campaigns, retain the existing single `View group report` anchor byte-for-byte.
- The dropdown appears only when the server has already authorized both `canViewGroupReport` and the narrower Summary Reporting capability.

## Panel Decision

Remove `SummaryReportsPanel` from `CampaignDetail`'s render tree and keep the existing component, routes, lifecycle API, capability resolver, registry, `SummaryReport` table, and `SummaryReportSource` table intact.

The saved-history list has no product purpose in B1 after history was deferred. Keeping the underlying implementation avoids destructive schema/API churn and leaves B2/B3 free to reuse the lifecycle. The Coach host continues resolving the capability because that server-authorized value selects the dropdown without exposing flag or authorization logic to the client.

## UI and Accessibility

Use the project's existing Radix dropdown dependency, matching `ResponsiveActionsMenu`'s portal/content treatment:

- a real `<button type="button">` trigger with `data-testid="campaign-detail-view-group-report"`;
- visible `View reports` text, report icon, and chevron;
- a portalled menu aligned to the end of the trigger;
- a Radix item using `asChild` around the real plain anchor;
- semantic token classes (`bg-primary`, `bg-card`, `border-border`, `text-foreground`) and the existing responsive touch-target behavior.

The flag-off branch reuses the current anchor JSX without class, attribute, text, or icon changes.

## Server Composition

### Admin host

Remove `resolveSummaryReportingCapability` and the `summaryReporting` prop from `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx`. Group-report authorization runs only when `groupReportGate` is true.

### Coach host

Keep the current resolver and access check in `src/src/app/(portal)/portal/assessments/[id]/page.tsx`. The resulting non-null capability switches the client action to the dropdown.

### Shared client

In `CampaignDetail`, render the existing anchor whenever the group-report capability is present and Summary Reporting is absent. Render the dropdown at the same position when both capabilities are present. Do not render the old panel.

## Test Contract

1. Red first: invert the authorized Summary Reporting component test so the trigger exists, the panel/list does not, and opening the menu reveals the canonical Group report plain anchor.
2. Preserve an exact DOM-equivalence assertion for absent versus explicit-null Summary Reporting capability.
3. Prove the dropdown render makes no report-route fetch.
4. Update the Admin page test so enabled Summary Reporting environment state still produces no `summaryReporting` prop and no extra authorization lookup beyond the existing group-report gate.
5. Keep focused Summary Reporting component/API suites green, then run the full suite, migration safety, changed-file ESLint, and `CI=true npm run build`.

## Rollout and Safety

- No environment variable, feature flag, or Production data changes are part of this PR.
- `SUMMARY_REPORTING_CANARY` must be cleared separately before merge per GH #393; the PR must state this as a merge precondition.
- Rollback is a code revert. Existing flags, report artifacts, APIs, and tables remain available and unchanged.

## Acceptance

1. Admin campaign detail has no Summary Reports panel and retains the current group-report entry.
2. Authorized Coach Scaling Up Full campaign detail has a report dropdown whose first item opens the canonical Group report in a new tab.
3. Other families and flag-off campaigns retain the current single button exactly.
4. No group-report prefetch occurs.
5. No environment, flag, schema, migration, or Production-data mutation occurs.
