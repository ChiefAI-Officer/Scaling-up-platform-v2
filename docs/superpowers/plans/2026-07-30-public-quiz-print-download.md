# Public Quiz Print and Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a public-quiz taker Print and Download PDF controls on the one-time in-place results report.

**Architecture:** Reuse the existing client-only `PrintReportButton` inside the public quiz's existing `.su-public-brand.su-report` results wrapper, immediately before `BrandedReport`. The public flow gets the same filename convention as the invited in-place results flow; no new report renderer, PDF route, persistence, flag, schema, scoring, or email behavior is introduced.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Jest, React Testing Library, existing `PrintReportButton`, existing `su-report.css`.

## Global Constraints

- GitHub issue #238 is the requirement source: the public quiz's one-time results report must expose the existing distinct `Print` and `Download PDF` controls.
- Render the existing `PrintReportButton`; do not create a second action component or a server-side PDF route.
- Place it inside the existing `.su-public-brand.su-report` wrapper and before `BrandedReport`.
- Use the filename `${templateName} — ${respondentName}`, matching the invited in-place results flow.
- The controls remain screen-only through the component's existing `no-print` and `.su-report-print-actions` behavior.
- Do not change submission, scoring, report dispatch, email, consent, referral, persistence, or routing behavior.
- No schema migration, feature flag, environment variable, or dependency.
- Follow strict TDD: add the integration assertion, run it and observe the expected failure, then add the production import/render and rerun.
- Before pushing: targeted Jest, ESLint on changed code/test files, migration-safety gate, and `CI=true npx next build --turbopack`.
- After production deployment: exercise the public flow without creating production test data; verify the deployed markup through a local deterministic render or existing non-mutating evidence, and verify both production aliases remain healthy.

---

### Task 1: Render the existing report actions in public quiz results

**Files:**
- Modify: `src/src/__tests__/components/public-quiz-results.test.tsx`
- Modify: `src/src/components/assessments/public-quiz-client.tsx`

**Interfaces:**
- Consumes: `PrintReportButton({ fileName?: string })` from `@/components/assessments/PrintReportButton`.
- Produces: one `PrintReportButton` render in the `step === "results" && results` branch, inside `.su-public-brand.su-report`, before `BrandedReport`.

- [ ] **Step 1: Add the failing public-results integration assertions**

In the existing test named `renders quiz-results region with BrandedReport content after successful submit`, retain its submit setup and add assertions after the `.su-public-brand.su-report` wrapper assertion:

```tsx
const reportWrapper = screen
  .getByTestId("quiz-results")
  .querySelector(".su-public-brand.su-report");
expect(reportWrapper).not.toBeNull();

const printButton = screen.getByRole("button", { name: "Print" });
const downloadButton = screen.getByRole("button", { name: "Download PDF" });
expect(reportWrapper).toContainElement(printButton);
expect(reportWrapper).toContainElement(downloadButton);
expect(screen.getAllByRole("button", { name: "Print" })).toHaveLength(1);
expect(screen.getAllByRole("button", { name: "Download PDF" })).toHaveLength(1);
```

Add one filename integration check by stubbing `window.print`, clicking Download PDF, and asserting the title used by the shared component:

```tsx
const originalTitle = document.title;
Object.defineProperty(window, "print", {
  value: jest.fn(),
  configurable: true,
});
fireEvent.click(downloadButton);
expect(document.title).toBe("Scaling Up Full — Jane Doe");
window.dispatchEvent(new Event("afterprint"));
expect(document.title).toBe(originalTitle);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/components/public-quiz-results.test.tsx --runInBand
```

Expected: FAIL because no button named `Print` or `Download PDF` exists in the public results branch.

- [ ] **Step 3: Add the minimal production wiring**

In `public-quiz-client.tsx`, import the existing component:

```tsx
import { PrintReportButton } from "@/components/assessments/PrintReportButton";
```

In the `step === "results" && results` branch, inside `.su-public-brand.su-report` and immediately before `BrandedReport`, render:

```tsx
<PrintReportButton
  fileName={`${templateName} — ${report.respondentName}`}
/>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run from `src/`:

```bash
npx jest src/__tests__/components/public-quiz-results.test.tsx --runInBand
```

Expected: the suite passes with the new buttons, placement, singleton, filename, and title-restoration assertions green.

- [ ] **Step 5: Run adjacent component coverage**

Run from `src/`:

```bash
npx jest \
  src/__tests__/components/public-quiz-results.test.tsx \
  src/__tests__/components/assessments/print-report-button.test.tsx \
  --runInBand
```

Expected: both suites pass.

- [ ] **Step 6: Run static and migration checks**

Run from `src/`:

```bash
npx eslint \
  src/components/assessments/public-quiz-client.tsx \
  src/__tests__/components/public-quiz-results.test.tsx
node scripts/check-migration-safety.mjs
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit the reviewed implementation**

```bash
git add \
  src/src/components/assessments/public-quiz-client.tsx \
  src/src/__tests__/components/public-quiz-results.test.tsx
git commit -m "feat(assessments): let public quiz takers keep reports"
```

The plan document is committed separately by the controller before dispatch so the fresh implementer receives stable requirements.
