# Report Preview Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every existing assessment Report Appearance picker use compact style tiles and a hidden-by-default Show/Hide preview disclosure without changing report-selection or respondent-output behavior.

**Architecture:** Keep `ReportStylePicker` as the single owner of card layout, disclosure state, preview tabs, image loading, and retry state. Remove its caller-specific compact thumbnail branch, render one unified compact picker everywhere, and mount only the active preview image after explicit expansion. Callers retain their existing `value`/`onChange`, save, inheritance, ownership, and lock contracts.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind semantic tokens, Jest, React Testing Library.

## Global Constraints

- Preview visibility initializes hidden on every `ReportStylePicker` mount.
- All three style cards stay visible and retain style name, description, and paper format.
- Use Option A compact three-column tiles on desktop and the existing single-column mobile stack.
- Copy is exactly `Show preview` when closed and `Hide preview` when open.
- Visibility is component-local only; do not use persistence, APIs, URL state, local storage, cookies, or schema fields.
- Preserve the active Cover/Summary/Detail tab while the component remains mounted; a fresh mount starts on Cover.
- Changing report style while expanded keeps the preview open and shows the same active page for the new style.
- Do not mount preview images before expansion, and mount only the active page's image while expanded.
- Keep preview disclosure usable when rendered style radios are disabled or locked.
- Preserve style selection, inheritance, ownership, saving, atomic locking, renderer selection, and respondent-facing output.
- Do not add a picker to simplified public-campaign creation or summary-only Campaign Detail views that currently have no preview.
- Use existing report-style availability and kill gates; add no feature flag or migration.
- Use only existing semantic color/focus tokens and preserve non-color selected state.

---

## File Map

| File | Responsibility in this change |
| --- | --- |
| `src/src/components/assessments/ReportStylePicker.tsx` | Unified compact cards, disclosure state, accessible toolbar, active-only image mounting, existing failure/retry behavior |
| `src/src/__tests__/components/assessments/report-style-picker.test.tsx` | Primary behavior, accessibility, performance-contract, anatomy, disabled, failure, and retry coverage |
| `src/src/components/admin/PublicCampaignsManager.tsx` | Remove the retired `compact` prop from the retained legacy creation picker |
| `src/src/components/admin/template-editor/SettingsTab.tsx` | Disable only style radios during save so preview disclosure remains usable |
| `src/src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx` | Coach Report Setup collapsed-state and sparse-custom preview integration |
| `src/src/__tests__/components/assessments/campaign-detail-report-style.test.tsx` | Editable Campaign Detail collapsed-state and anatomy integration |
| `src/src/__tests__/components/admin/template-editor/report-style-default.test.tsx` | Admin Settings collapsed-state, anatomy, and save-pending integration |
| `src/src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx` | Intentional Settings DOM acceptance after explicit design approval |
| `src/src/__tests__/components/admin/template-editor/__snapshots__/ed10-golden-snapshots.test.tsx.snap` | Reviewed golden Settings snapshot for the compact collapsed picker |
| `src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx` | Legacy public-campaign management collapsed, expanded, locked, and save integration |
| `plans/CHANGELOG.md` | Local implementation and verification record after all gates pass |

No schema, migration, API route, report renderer, scoring, report loader, simplified public-campaign creation component, or respondent-report file changes.

---

### Task 1: Unify the shared picker around compact cards and a collapsed preview

**Files:**
- Modify: `src/src/components/assessments/ReportStylePicker.tsx`
- Test: `src/src/__tests__/components/assessments/report-style-picker.test.tsx`

**Interfaces:**
- Consumes: `REPORT_STYLE_KEYS`, `REPORT_STYLE_REGISTRY`, `getReportStylePreviewPath`, `ReportStylePreviewAnatomy`, and `ReportStyleKey` from `@/lib/assessments/report-style-registry`.
- Produces: `ReportStylePicker(props: ReportStylePickerProps)` with the existing selection and context props, minus the retired `compact` prop.
- Preserves: `value`, `onChange`, `disabled`, `sourceLabel`, `lockedAt`, `previewAnatomy`, `heading`, and `disabledExplanation` behavior.

- [ ] **Step 1: Replace always-visible and thumbnail expectations with failing disclosure tests**

In `report-style-picker.test.tsx`, remove the compact-thumbnail test and rewrite the preview-focused tests around these exact behaviors:

```tsx
it("starts with compact cards and no mounted preview assets", () => {
  render(<PickerHarness initialValue="EXECUTIVE_BOARDROOM" />);

  expect(screen.getAllByRole("radio")).toHaveLength(3);
  expect(screen.getByRole("radio", { name: /executive boardroom/i })).toBeChecked();
  expect(screen.getByText("Editorial, restrained, and board-ready.")).toBeInTheDocument();
  expect(screen.getAllByText(/Paper format:/)).toHaveLength(3);

  const selectedCard = screen
    .getByRole("radio", { name: /executive boardroom/i })
    .closest("label");
  expect(selectedCard).toHaveClass("p-3");
  expect(selectedCard).toHaveTextContent("Selected");

  const disclosure = screen.getByRole("button", { name: "Show preview" });
  expect(disclosure).toHaveAttribute("aria-expanded", "false");
  expect(disclosure).toHaveAttribute("aria-controls");
  expect(screen.queryByRole("tablist", { name: "Report style preview pages" })).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("shows only the active preview image and hides it again", () => {
  render(<PickerHarness initialValue="MODERN_DASHBOARD" />);

  const show = screen.getByRole("button", { name: "Show preview" });
  const regionId = show.getAttribute("aria-controls");
  fireEvent.click(show);

  expect(screen.getByRole("button", { name: "Hide preview" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(document.getElementById(regionId!)).toHaveAttribute("role", "region");
  expect(screen.getByRole("img", { name: "Modern Dashboard Cover preview" })).toBeInTheDocument();
  expect(screen.getAllByRole("img")).toHaveLength(1);

  fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
  expect(screen.getByRole("img", { name: "Modern Dashboard Summary preview" })).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Modern Dashboard Cover preview" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("img")).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
  expect(screen.queryByRole("tablist", { name: "Report style preview pages" })).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("preserves the active page and disclosure while changing styles", () => {
  render(<PickerHarness />);
  fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
  fireEvent.click(screen.getByRole("tab", { name: "Detail" }));
  fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
  fireEvent.click(screen.getByRole("button", { name: "Show preview" }));

  expect(screen.getByRole("tab", { name: "Detail" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  fireEvent.click(screen.getByRole("radio", { name: /executive boardroom/i }));
  expect(screen.getByRole("button", { name: "Hide preview" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(
    screen.getByRole("img", { name: "Executive Boardroom Detail preview" }),
  ).toBeInTheDocument();
});
```

Update the existing keyboard-tab, anatomy, semantic-token, disabled, failure,
retry, and tabpanel relationship tests so each explicitly clicks `Show preview`
before querying preview UI. For the tabpanel relationship test, assert all three
tabpanels exist while expanded but only the active tabpanel contains an image.
For disabled pickers, assert all radios are disabled and the Show/Hide button is
enabled.

- [ ] **Step 2: Run the component suite and verify the new contract fails**

Run:

```bash
npx jest src/src/__tests__/components/assessments/report-style-picker.test.tsx --runInBand
```

Expected: FAIL because a non-compact picker currently mounts Cover immediately,
uses `p-4`, and has no Show/Hide button; the compact branch also mounts a
thumbnail.

- [ ] **Step 3: Remove the compact variant from the public component contract**

In `ReportStylePicker.tsx`, make the props interface exactly:

```tsx
export interface ReportStylePickerProps {
  value: ReportStyleKey;
  onChange: (value: ReportStyleKey) => void;
  disabled?: boolean;
  sourceLabel?: string;
  lockedAt?: Date | string | null;
  previewAnatomy?: ReportStylePreviewAnatomy;
  heading?: string;
  disabledExplanation?: string | null;
}
```

Remove `compact` from the function parameters. Delete
`selectedThumbnailId`, `selectedThumbnailFailed`, the selected-thumbnail image,
the thumbnail failure block, the `Preview selected appearance` button, and every
compact-dependent spacing or padding branch.

- [ ] **Step 4: Implement compact cards with a non-color selected indicator**

Use one layout for every card:

```tsx
<section aria-label={`${heading} selection`} className="space-y-3">
  <fieldset className="space-y-2">
    <legend className="text-sm font-semibold text-foreground">{heading}</legend>
    <div className="grid gap-2 md:grid-cols-3">
      {REPORT_STYLE_KEYS.map((style) => {
        const metadata = REPORT_STYLE_REGISTRY[style];
        const isSelected = style === value;

        return (
          <label
            key={style}
            className="block cursor-pointer rounded-lg border border-border bg-background p-3 text-foreground shadow-sm transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring has-[:checked]:border-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-75"
          >
            <input
              type="radio"
              name={radioName}
              value={style}
              checked={isSelected}
              disabled={disabled}
              aria-checked={isSelected}
              className="sr-only"
              onChange={() => selectStyle(style)}
              onKeyDown={(event) => handleRadioKeyDown(event, style)}
            />
            <span className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold leading-tight">{metadata.label}</span>
              {isSelected && (
                <span className="shrink-0 text-sm font-semibold text-primary">
                  <span aria-hidden="true">✓</span>
                  <span className="sr-only">Selected</span>
                </span>
              )}
            </span>
            <span className="mt-1.5 block text-xs leading-snug text-muted-foreground">
              {metadata.description}
            </span>
            <span className="mt-1.5 block text-xs text-muted-foreground">
              Paper format: {metadata.paperFormat}
            </span>
          </label>
        );
      })}
    </div>
  </fieldset>
</section>
```

Retain the existing native radio element, `selectStyle`, and arrow-key handler
inside the label. Do not introduce fixed heights, truncation, hard-coded colors,
or a new icon dependency.

- [ ] **Step 5: Implement the accessible Show/Hide toolbar and active-only image mounting**

Add a stable region ID beside `radioName` and retain the existing state defaults:

```tsx
const previewRegionId = `${radioName}-preview`;
const [previewPage, setPreviewPage] = useState<PreviewPage>("cover");
const [previewExpanded, setPreviewExpanded] = useState(false);
```

Replace the existing compact/full conditional preview block with this structure:

```tsx
<div
  className={`mt-3 flex flex-wrap gap-3 ${
    previewExpanded ? "items-start justify-between" : "justify-end"
  }`}
>
  {previewExpanded && (
    <div
      role="tablist"
      aria-label={`${heading} preview pages`}
      className="flex flex-wrap gap-2"
    >
      {PREVIEW_TABS.map((tab) => {
        const isActive = tab.key === previewPage;

        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${radioName}-${tab.key}-tab`}
            aria-selected={isActive}
            aria-controls={`${radioName}-${tab.key}-panel`}
            tabIndex={isActive ? 0 : -1}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ring"
            onClick={() => setPreviewPage(tab.key)}
            onKeyDown={(event) => handlePreviewTabKeyDown(event, tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  )}
  <button
    type="button"
    aria-expanded={previewExpanded}
    aria-controls={previewRegionId}
    className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ring"
    onClick={() => setPreviewExpanded((expanded) => !expanded)}
  >
    {previewExpanded ? "Hide preview" : "Show preview"}
  </button>
</div>

{previewExpanded && (
  <div
    id={previewRegionId}
    role="region"
    aria-label={`${heading} preview`}
    className="mt-3"
  >
    {PREVIEW_TABS.map((tab) => {
      const currentPreviewId = previewId(previewAnatomy, value, tab.key);
      const isActive = tab.key === previewPage;
      const failedPreview = failedPreviews.has(currentPreviewId);

      return (
        <div
          key={tab.key}
          id={`${radioName}-${tab.key}-panel`}
          role="tabpanel"
          aria-labelledby={`${radioName}-${tab.key}-tab`}
          aria-label={`${selectedMetadata.label} ${tab.key} preview`}
          hidden={!isActive}
        >
          {isActive &&
            (failedPreview ? (
              <div
                className="space-y-2 rounded-lg border border-border bg-muted/20 p-4 text-foreground"
                role="status"
              >
                <p>Preview unavailable</p>
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ring"
                  onClick={() => retryPreview(tab.key)}
                >
                  Retry
                </button>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${currentPreviewId}-${retryVersions[currentPreviewId] ?? 0}`}
                src={getReportStylePreviewPath(value, previewAnatomy, tab.key)}
                alt={`${selectedMetadata.label} ${tab.label} preview`}
                className="w-full rounded-lg border border-border"
                onError={() =>
                  setFailedPreviews((current) =>
                    new Set(current).add(currentPreviewId),
                  )
                }
              />
            ))}
        </div>
      );
    })}
  </div>
)}
```

The `isActive` guard is the only new loading boundary: all tabpanels exist while
expanded for their ARIA relationships, but only the active panel mounts
failure/image content.

- [ ] **Step 6: Run the component suite and verify it passes**

Run:

```bash
npx jest src/src/__tests__/components/assessments/report-style-picker.test.tsx --runInBand
```

Expected: PASS with the initial-hidden, single-image, tab persistence, style
change, disabled disclosure, anatomy, semantic-token, failure, and retry cases.

- [ ] **Step 7: Lint the shared component and test**

Run:

```bash
npx eslint src/src/components/assessments/ReportStylePicker.tsx src/src/__tests__/components/assessments/report-style-picker.test.tsx
```

Expected: exit `0` with no lint errors.

- [ ] **Step 8: Commit the shared behavior**

```bash
git add src/src/components/assessments/ReportStylePicker.tsx src/src/__tests__/components/assessments/report-style-picker.test.tsx
git commit -m "feat(assessments): collapse report style previews"
```

---

### Task 2: Migrate every existing picker caller and its integration contract

**Files:**
- Modify: `src/src/components/admin/PublicCampaignsManager.tsx`
- Modify: `src/src/components/admin/template-editor/SettingsTab.tsx`
- Test: `src/src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx`
- Test: `src/src/__tests__/components/assessments/campaign-detail-report-style.test.tsx`
- Test: `src/src/__tests__/components/admin/template-editor/report-style-default.test.tsx`
- Test: `src/src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx`
- Test snapshot: `src/src/__tests__/components/admin/template-editor/__snapshots__/ed10-golden-snapshots.test.tsx.snap`
- Test: `src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx`

**Interfaces:**
- Consumes: the unified `ReportStylePickerProps` from Task 1.
- Produces: no new runtime API; all existing callers compile without `compact` and prove hidden-by-default integration.
- Preserves: simplified public-campaign creation remains inheritance-only and is not modified.

- [ ] **Step 1: Run all impacted caller suites and capture the intentional failures**

Run:

```bash
npx jest \
  src/src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx \
  src/src/__tests__/components/assessments/campaign-detail-report-style.test.tsx \
  src/src/__tests__/components/admin/template-editor/report-style-default.test.tsx \
  src/src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx \
  src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx \
  --runInBand
```

Expected: FAIL where suites query Cover images before expansion; TypeScript or
lint also identifies the legacy `compact` prop until it is removed.

- [ ] **Step 2: Remove the retired compact prop from the legacy public-campaign caller**

In `PublicCampaignsManager.tsx`, change the retained creation picker from:

```tsx
<ReportStylePicker
  value={reportStyle}
  compact
  previewAnatomy={resolveReportStylePreviewAnatomy({
    templateAlias: selectedTemplate.alias,
    capabilities: selectedTemplate.reportStylePreviewCapabilities,
  })}
  onChange={(value) => {
    setReportStyle(value);
    setReportStyleIntent("EXPLICIT");
  }}
/>
```

to the same call without `compact`, retaining its current inline handler:

```tsx
<ReportStylePicker
  value={reportStyle}
  previewAnatomy={resolveReportStylePreviewAnatomy({
    templateAlias: selectedTemplate.alias,
    capabilities: selectedTemplate.reportStylePreviewCapabilities,
  })}
  onChange={(value) => {
    setReportStyle(value);
    setReportStyleIntent("EXPLICIT");
  }}
/>
```

- [ ] **Step 3: Update Coach Report Setup integration coverage**

In `campaign-wizard-report-style.test.tsx`, add collapsed-state assertions to
the inherited-default test:

```tsx
expect(screen.getByRole("button", { name: "Show preview" })).toHaveAttribute(
  "aria-expanded",
  "false",
);
expect(screen.queryByRole("img", { name: /preview/i })).not.toBeInTheDocument();
```

In the sparse-custom anatomy test, click the disclosure before checking `src`:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
expect(
  screen.getByRole("img", { name: "Modern Dashboard Cover preview" }),
).toHaveAttribute(
  "src",
  "/report-style-previews/sparse-custom/modern-dashboard/cover.webp",
);
```

Do not change draft reconciliation, explicit intent, campaign-create request,
or rollout-availability assertions.

- [ ] **Step 4: Update editable Campaign Detail integration coverage**

In `campaign-detail-report-style.test.tsx`, assert the editable picker starts
collapsed in the save test, then leave save behavior unchanged:

```tsx
expect(screen.getByRole("button", { name: "Show preview" })).toHaveAttribute(
  "aria-expanded",
  "false",
);
expect(screen.queryByRole("img", { name: /preview/i })).not.toBeInTheDocument();
```

In the sparse-custom preview test, click `Show preview` before asserting the
Cover `src`. Do not convert the existing summary-only read-only branch into a
picker and do not change authorization or save controls.

- [ ] **Step 5: Update Admin template Settings integration coverage**

In `report-style-default.test.tsx`:

1. Add a hidden-default assertion to the first availability test.
2. Click `Show preview` before both qualitative and sparse-custom `src` checks.
3. In the pending-save test, open the preview after selecting Executive
   Boardroom and before clicking Save, then assert the image remains visible
   while radios are disabled.

Use this exact hidden-default assertion within the settings card:

```tsx
expect(within(defaultAppearance).getByRole("button", { name: "Show preview" })).toHaveAttribute(
  "aria-expanded",
  "false",
);
expect(within(defaultAppearance).queryByRole("img", { name: /preview/i })).not.toBeInTheDocument();
```

Keep the immediate PATCH, server-truth, API-error, keyboard-selection, ED10,
and report-style availability tests unchanged.

In `SettingsTab.tsx`, replace the disabled outer fieldset with a neutral wrapper
and pass save state directly to the picker. This keeps the preview button usable
while preventing a style change during the PATCH:

```tsx
<div aria-busy={templateRowSaving} className="min-w-0">
  <ReportStylePicker
    value={selectedStyle}
    onChange={templateRowSaving ? () => {} : setSelectedStyle}
    disabled={templateRowSaving}
    previewAnatomy={resolveReportStylePreviewAnatomy({
      templateAlias,
      capabilities: previewCapabilities,
    })}
  />
</div>
```

Delete the wrapper-only screen-reader legend because `ReportStylePicker` keeps
its own accessible legend. Extend the pending-save test to assert `Hide preview`
or `Show preview` remains enabled while all radios are disabled.

Run the ED10 golden snapshot suite without update mode and observe the approved
Settings DOM change:

```bash
npx jest src/src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx --runInBand
```

Expected: FAIL only for the report-appearance Settings snapshot. Then regenerate
that approved snapshot and inspect it:

```bash
npx jest src/src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx --runInBand -u
git diff -- src/src/__tests__/components/admin/template-editor/__snapshots__/ed10-golden-snapshots.test.tsx.snap
```

Accept only the intended wrapper, compact-card, selected-check, and Show preview
DOM changes plus removal of initially mounted tabs/images. Any unrelated editor
or respondent-pager snapshot change must be reverted and diagnosed.

- [ ] **Step 6: Update legacy public-campaign management integration coverage**

In `public-campaigns-manager-smoke.test.tsx`, replace the legacy creation test's
selected-thumbnail and `Preview selected appearance` assertions with:

```tsx
expect(
  within(createSection).queryByRole("img", { name: /preview/i }),
).not.toBeInTheDocument();
const showCreatePreview = within(createSection).getByRole("button", {
  name: "Show preview",
});
expect(showCreatePreview).toHaveAttribute("aria-expanded", "false");
fireEvent.click(showCreatePreview);
expect(
  within(createSection).getByRole("img", {
    name: "Modern Dashboard Cover preview",
  }),
).toHaveAttribute(
  "src",
  "/report-style-previews/sparse-custom/modern-dashboard/cover.webp",
);
```

After activating the management table's outer `Manage report appearance`
disclosure, prove the nested picker is initially closed before opening it:

```tsx
const editor = screen.getByRole("region", {
  name: "Quick Scaling Up Check report appearance",
});
expect(within(editor).getByRole("button", { name: "Show preview" })).toHaveAttribute(
  "aria-expanded",
  "false",
);
expect(within(editor).queryByRole("img", { name: /preview/i })).not.toBeInTheDocument();

fireEvent.click(within(editor).getByRole("button", { name: "Show preview" }));
expect(
  within(editor).getByRole("img", {
    name: "Executive Boardroom Cover preview",
  }),
).toHaveAttribute(
  "src",
  "/report-style-previews/sparse-custom/executive-boardroom/cover.webp",
);
```

For the existing locked-campaign case, additionally assert all style radios are
disabled while `Show preview` remains enabled. Add this focused case using the
existing `PUBLIC_CAMPAIGN` fixture:

```tsx
it("keeps a locked public appearance previewable without exposing a save", async () => {
  const lockedCampaign = {
    ...PUBLIC_CAMPAIGN,
    reportStyleLockedAt: "2026-08-06T04:00:00.000Z",
  };
  (global.fetch as jest.Mock).mockImplementation(
    async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(input).endsWith("/api/admin/public-campaigns")
          ? { success: true, data: [lockedCampaign] }
          : { success: true, data: [] },
    }),
  );

  render(<PublicCampaignsManager />);
  await screen.findByText("Quick Scaling Up Check");
  fireEvent.click(screen.getByRole("button", { name: "View report appearance" }));

  const editor = screen.getByRole("region", {
    name: "Quick Scaling Up Check report appearance",
  });
  within(editor).getAllByRole("radio").forEach((radio) =>
    expect(radio).toBeDisabled(),
  );
  const show = within(editor).getByRole("button", { name: "Show preview" });
  expect(show).toBeEnabled();
  fireEvent.click(show);
  expect(within(editor).getByRole("img", { name: /Cover preview/ })).toBeInTheDocument();
  expect(within(editor).queryByRole("button", { name: "Save report appearance" })).not.toBeInTheDocument();
});
```

Do not change the outer campaign row disclosure, PATCH request, 409
reconciliation, or kill-path behavior.

- [ ] **Step 7: Run the complete caller integration set**

Run:

```bash
npx jest \
  src/src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx \
  src/src/__tests__/components/assessments/campaign-detail-report-style.test.tsx \
  src/src/__tests__/components/admin/template-editor/report-style-default.test.tsx \
  src/src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx \
  src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx \
  src/src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx \
  --runInBand
```

Expected: PASS. The last suite proves simplified public-campaign creation still
inherits report design and exposes no picker or override.

- [ ] **Step 8: Lint every Task 2 file**

Run:

```bash
npx eslint \
  src/src/components/admin/PublicCampaignsManager.tsx \
  src/src/components/admin/template-editor/SettingsTab.tsx \
  src/src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx \
  src/src/__tests__/components/assessments/campaign-detail-report-style.test.tsx \
  src/src/__tests__/components/admin/template-editor/report-style-default.test.tsx \
  src/src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx \
  src/src/__tests__/components/admin/template-editor/__snapshots__/ed10-golden-snapshots.test.tsx.snap \
  src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx
```

Expected: exit `0` with no lint errors.

- [ ] **Step 9: Commit the caller migration**

```bash
git add \
  src/src/components/admin/PublicCampaignsManager.tsx \
  src/src/components/admin/template-editor/SettingsTab.tsx \
  src/src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx \
  src/src/__tests__/components/assessments/campaign-detail-report-style.test.tsx \
  src/src/__tests__/components/admin/template-editor/report-style-default.test.tsx \
  src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx
git commit -m "test(assessments): cover collapsed previews across report setup"
```

---

### Task 3: Visually accept the UI and run repository gates

**Files:**
- Modify after all checks pass: `plans/CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1–2 completed on the same branch.
- Produces: visual acceptance evidence, complete verification evidence, and a local-status SoT entry.

- [ ] **Step 1: Run the combined focused regression set**

Run:

```bash
npx jest \
  src/src/__tests__/components/assessments/report-style-picker.test.tsx \
  src/src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx \
  src/src/__tests__/components/assessments/campaign-detail-report-style.test.tsx \
  src/src/__tests__/components/admin/template-editor/report-style-default.test.tsx \
  src/src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx \
  src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx \
  src/src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx \
  --runInBand
```

Expected: all seven suites PASS.

- [ ] **Step 2: Run changed-file ESLint**

Run:

```bash
npx eslint \
  src/src/components/assessments/ReportStylePicker.tsx \
  src/src/components/admin/PublicCampaignsManager.tsx \
  src/src/components/admin/template-editor/SettingsTab.tsx \
  src/src/__tests__/components/assessments/report-style-picker.test.tsx \
  src/src/__tests__/components/assessments/campaign-wizard-report-style.test.tsx \
  src/src/__tests__/components/assessments/campaign-detail-report-style.test.tsx \
  src/src/__tests__/components/admin/template-editor/report-style-default.test.tsx \
  src/src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx \
  src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx
```

Expected: exit `0` with no lint errors.

- [ ] **Step 3: Run migration safety**

Run:

```bash
node scripts/check-migration-safety.mjs
```

Expected: PASS with no unsafe migration finding. No migration should appear in
the branch diff.

- [ ] **Step 4: Run the Production-matching Turbopack build**

Run:

```bash
CI=true npx next build --turbopack
```

Expected: exit `0`, successful TypeScript compilation, and successful static
page generation.

- [ ] **Step 5: Perform authenticated desktop visual review**

Start the app using the repository's normal local environment, then inspect at
`1280px` width:

1. Admin → Assessments → Templates → open any published template → Settings →
   Default report appearance.
2. Coach → My Campaigns → create an assessment campaign → Report Setup.
3. Coach → My Campaigns → open an editable campaign → Report appearance.
4. If the legacy public-campaign fallback is active locally, open its Report
   Appearance editor.

On each rendered picker confirm:

- three compact tiles align without equal-height clipping;
- descriptions and paper formats wrap completely;
- no preview or tabs appear initially;
- Show preview is right-aligned;
- expanded tabs remain left while Hide preview remains right;
- changing style while on Detail updates the image and stays expanded;
- closing and reopening preserves Detail during the same visit.

- [ ] **Step 6: Perform authenticated narrow-width visual review**

Repeat one Admin and one Coach picker at `393px` width. Confirm:

- tiles stack to one column;
- no horizontal overflow appears;
- the selected check does not collide with a wrapped title;
- the expanded toolbar wraps without overlapping tabs or Hide preview;
- preview images remain contained by the card width;
- keyboard focus remains visible for radios, disclosure, and tabs.

If either visual review fails, return to Task 1, add a focused failing component
test for the defective class/behavior, make the smallest correction, rerun Tasks
1–3, and do not record acceptance until the rerun passes.

- [ ] **Step 7: Record locally verified status in the changelog**

Prepend an entry to `plans/CHANGELOG.md` with slug
`report-preview-disclosure-locally-verified` and this status statement:

```markdown
**Status and scope.** **LOCALLY IMPLEMENTED AND VERIFIED; not pushed, merged,
deployed, or enabled on Production.** Every existing Report Appearance picker
now uses compact three-column style tiles and starts with preview assets hidden.
Show preview mounts the accessible Cover/Summary/Detail experience on demand;
Hide preview unloads it without changing selection or same-visit tab state.
Simplified public-campaign creation and summary-only Campaign Detail views remain
unchanged because they intentionally expose no picker.
```

Add this second paragraph only after all listed checks have actually passed:

```markdown
**Verification evidence.** The shared picker plus Coach wizard/detail, Admin
template Settings, legacy public-campaign manager, and simplified public-create
focused suites passed. Changed-file ESLint, migration safety, and the
Production-matching Turbopack build passed. Authenticated visual review covered
Admin template Settings, Coach Report Setup, and editable Campaign Detail at
1280px and 393px. No Production or customer data was changed.
```

Do not claim Production deployment, live acceptance, full-suite coverage, or a
gate that was not run.

- [ ] **Step 8: Commit local verification evidence**

```bash
git add plans/CHANGELOG.md
git commit -m "docs(assessments): record report preview verification"
```

- [ ] **Step 9: Confirm the implementation branch is clean and scoped**

Run:

```bash
git status --short --branch
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected: clean worktree; only the design, plan, shared picker, Settings wrapper,
one legacy caller, focused tests, and changelog are changed. There must be no
schema, migration, API, renderer, scoring, loader, or respondent-output file.
