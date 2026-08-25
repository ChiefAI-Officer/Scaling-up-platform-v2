# Universal Individual-Report Placeholders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three existing report placeholders discoverable, validated, and functional across every individual assessment report.

**Architecture:** A client-safe registry owns the report token contract and validation. The editor and server storage path consume that registry, while every individual report renderer passes the existing `RespondentReport` through the already-safe personalization seam.

**Tech Stack:** TypeScript, React, Next.js, Tailwind CSS, Jest, React Testing Library

**Spec:** `docs/superpowers/specs/2026-08-26-universal-report-placeholders-design.md`

## Global Constraints

- Support exactly `{{respondentFirstName}}`, `{{respondentName}}`, and `{{companyName}}`; do not add fields.
- Apply placeholders to individual browser and browser-print/PDF reports only.
- Keep invitation email, results email, group reports, and assessment answers out of scope.
- Preserve HTML escaping and post-substitution sanitization.
- Reuse the Reports editor's existing card, typography, border, and muted-panel language.
- Make unknown-token validation authoritative on the server and immediate in the editor.
- Do not add a schema migration or change report metadata sources.

---

### Task 1: Establish the shared placeholder contract

**Files:**
- Create: `src/src/lib/assessments/report-placeholders.ts`
- Create: `src/src/__tests__/lib/assessments/report-placeholders.test.ts`
- Modify: `src/src/lib/assessments/report-html.ts`
- Modify: `src/src/__tests__/lib/assessments/report-html.test.ts`

**Interfaces:**
- Produces: `REPORT_PLACEHOLDERS`, `ReportPlaceholderToken`, `unsupportedReportPlaceholders(raw: string): string[]`, and `reportPlaceholderIssue(raw: string, fieldLabel: string): string | null`.
- Consumes: `prepareReportHtmlForStorage(reportConfig)` uses `reportPlaceholderIssue` before sanitizing either fragment.

- [ ] **Step 1: Write failing registry and storage-validation tests**

```ts
expect(REPORT_PLACEHOLDERS.map((field) => field.token)).toEqual([
  "{{respondentFirstName}}",
  "{{respondentName}}",
  "{{companyName}}",
]);
expect(unsupportedReportPlaceholders("<p>{{first_name}} {{first_name}}</p>"))
  .toEqual(["{{first_name}}"]);
expect(prepareReportHtmlForStorage({
  reportHtml: {
    schemaVersion: 1,
    introductionHtml: "<p>{{unknownField}}</p>",
    conclusionHtml: null,
  },
})).toMatchObject({
  ok: false,
  issues: [{ path: "reportHtml.introductionHtml" }],
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx jest src/__tests__/lib/assessments/report-placeholders.test.ts src/__tests__/lib/assessments/report-html.test.ts --runInBand
```

Expected: FAIL because the registry module does not exist and storage accepts unknown tokens.

- [ ] **Step 3: Implement the client-safe registry and server validation**

Define the three frozen field descriptions, exact-token membership, unique unsupported-token extraction using a double-curly token pattern, and a field-specific error string. Validate both non-null report fragments before calling `sanitizeReportHtmlFragment`; return issues through the existing prepared-report union.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the command from Step 2. Expected: both suites pass.

### Task 2: Universalize individual-report personalization

**Files:**
- Modify: `src/src/components/assessments/BrandedReport.tsx`
- Modify: `src/src/components/assessments/QualitativeReport.tsx`
- Modify: `src/src/__tests__/components/assessments/branded-report.test.tsx`
- Modify: `src/src/__tests__/components/assessments/report-html-sections.test.tsx`
- Verify: `src/src/__tests__/components/assessments/report-style-renderers.test.tsx`
- Verify: `src/src/__tests__/components/assessments/su-full-landscape-report.test.tsx`

**Interfaces:**
- Consumes: `ReportHtmlSection` accepts `ReportHtmlPersonalization`; every production individual renderer supplies its `RespondentReport`.
- Produces: Alias-independent personalization across Classic scored, qualitative, Executive Boardroom, Modern Dashboard, and existing Scaling Up Full landscape paths.

- [ ] **Step 1: Change existing non-supported-alias assertions to require personalization**

```tsx
expect(screen.getByTestId("report-html-introduction")).toHaveTextContent(
  "Dear Sarah Chen from Northwind Logistics",
);
expect(screen.queryByText(/\{\{respondentName\}\}/)).not.toBeInTheDocument();
```

Add the equivalent LVA qualitative assertion for both first name and company name.

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```bash
npx jest src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/components/assessments/report-html-sections.test.tsx --runInBand
```

Expected: FAIL because non-Scaling-Up-Full and non-QSP-v2 paths leave tokens literal.

- [ ] **Step 3: Pass personalization without assessment-alias gates**

Replace each `templateAlias === ... ? report : undefined` report HTML personalization prop in `BrandedReport` and `QualitativeReport` with the report model itself. Pass the same report through alternate style dispatch; preserve the landscape path, which already personalizes with the report.

- [ ] **Step 4: Run the renderer matrix and verify GREEN**

```bash
npx jest src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/components/assessments/report-html-sections.test.tsx src/__tests__/components/assessments/report-style-renderers.test.tsx src/__tests__/components/assessments/su-full-landscape-report.test.tsx --runInBand
```

Expected: all suites pass with no unresolved supported tokens in production individual-report paths.

### Task 3: Add discoverable, caret-aware editor controls

**Files:**
- Modify: `src/src/components/admin/template-editor/ReportsTab.tsx`
- Modify: `src/src/__tests__/components/admin/template-editor/ReportsTab.test.tsx`

**Interfaces:**
- Consumes: `REPORT_PLACEHOLDERS` and `reportPlaceholderIssue` from the shared registry.
- Produces: Available Fields controls under both textareas, exact caret insertion, descriptions, disabled read-only state, inline unknown-token errors, and representative-preview copy.

- [ ] **Step 1: Write failing interaction and validation tests**

```tsx
expect(screen.getAllByText("Available fields")).toHaveLength(2);
expect(screen.getAllByText("{{respondentFirstName}}")).toHaveLength(2);

const welcome = screen.getByLabelText("Introduction / preface HTML");
welcome.setSelectionRange(3, 8);
fireEvent.click(screen.getAllByRole("button", {
  name: "Insert First name placeholder",
})[0]);
expect(welcome).toHaveValue("<p>{{respondentFirstName}}</p>");

fireEvent.change(welcome, {
  target: { value: "<p>{{unknownField}}</p>" },
});
expect(welcome).toHaveAttribute("aria-invalid", "true");
expect(screen.getByRole("alert")).toHaveTextContent("{{unknownField}}");
```

Also assert that all insertion controls are disabled in read-only mode and preview copy mentions representative details.

- [ ] **Step 2: Run the Reports tab suite and verify RED**

```bash
npx jest src/__tests__/components/admin/template-editor/ReportsTab.test.tsx --runInBand
```

Expected: FAIL because no report field panel, insertion behavior, or unknown-token feedback exists.

- [ ] **Step 3: Implement the Available fields panel**

Add a textarea ref per `HtmlRegion`. Insert the selected exact token over the current selection, call `onChange`, then restore focus and place the caret immediately after the token in `requestAnimationFrame`. Render compact token buttons with their descriptions beneath each textarea and disable them with the textarea.

- [ ] **Step 4: Integrate inline validation and preview truthfulness**

Combine the existing character-limit issue with `reportPlaceholderIssue`, wire the result to `aria-invalid`/`aria-describedby`, and update preview helper text to state that it uses saved content, exact styling, and representative respondent/company details.

- [ ] **Step 5: Run the Reports tab suite and verify GREEN**

Run the command from Step 2. Expected: the suite passes.

### Task 4: Block invalid saves before any save lane starts

**Files:**
- Modify: `src/src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts`
- Modify: `src/src/__tests__/components/admin/template-editor/useTemplateEditorDraft.ed10-split-save.test.ts`
- Verify: `src/src/__tests__/api/admin/assessment-templates/template-version-patch.wave-t.test.ts`
- Verify: `src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts`

**Interfaces:**
- Consumes: `reportPlaceholderIssue` from the shared registry and the existing dirty report HTML extraction.
- Produces: Save Draft aborts before any metadata/version/invitation request when either report fragment contains an unsupported token; the API remains the authoritative fallback.

- [ ] **Step 1: Add a failing split-save preflight test**

Set dirty Welcome HTML to `<p>{{unknownField}}</p>`, trigger Save Draft, assert the destructive toast names the unknown token, and assert `fetch` was not called for any save lane.

- [ ] **Step 2: Run the split-save test and verify RED**

```bash
npx jest src/__tests__/components/admin/template-editor/useTemplateEditorDraft.ed10-split-save.test.ts --runInBand
```

Expected: FAIL because unknown tokens currently proceed to the API.

- [ ] **Step 3: Add placeholder validation to the existing report preflight**

Check character limits first, then unsupported tokens for Welcome and Closing. Reuse the existing destructive toast title and return before setting the in-flight guard.

- [ ] **Step 4: Run save and API suites and verify GREEN**

```bash
npx jest src/__tests__/components/admin/template-editor/useTemplateEditorDraft.ed10-split-save.test.ts src/__tests__/api/admin/assessment-templates/template-version-patch.wave-t.test.ts src/__tests__/api/admin/assessment-templates/templates-crud.test.ts --runInBand
```

Expected: all suites pass, including existing `INVALID_REPORT_HTML` mapping.

### Task 5: Documentation and release verification

**Files:**
- Modify only if required by project source-of-truth policy: `CLAUDE.md`, `plans/CHANGELOG.md`

**Interfaces:**
- Consumes: Completed implementation and test evidence.
- Produces: Reviewable branch with verification evidence; no deployment or production mutation.

- [ ] **Step 1: Run the combined targeted matrix**

```bash
npx jest \
  src/__tests__/lib/assessments/report-placeholders.test.ts \
  src/__tests__/lib/assessments/report-html.test.ts \
  src/__tests__/components/admin/template-editor/ReportsTab.test.tsx \
  src/__tests__/components/admin/template-editor/useTemplateEditorDraft.ed10-split-save.test.ts \
  src/__tests__/components/assessments/branded-report.test.tsx \
  src/__tests__/components/assessments/report-html-sections.test.tsx \
  src/__tests__/components/assessments/report-style-renderers.test.tsx \
  src/__tests__/components/assessments/su-full-landscape-report.test.tsx \
  src/__tests__/api/admin/assessment-templates/template-version-patch.wave-t.test.ts \
  src/__tests__/api/admin/assessment-templates/templates-crud.test.ts \
  --runInBand
```

- [ ] **Step 2: Run changed-file lint and whitespace checks**

```bash
npx eslint <each changed TypeScript/TSX file>
git diff --check
```

- [ ] **Step 3: Run repository safety gates**

```bash
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

- [ ] **Step 4: Review the final diff against the spec**

Confirm the branch adds only the three agreed tokens, every production individual-report path personalizes them, editor and server validation share one registry, group/email behavior remains unchanged, and no schema or migration changed.
