# Five Dysfunctions Word Report Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Five Dysfunctions individual report reproduce Jeff's Word-document structure and two-column category presentation without changing other reports.

**Architecture:** Store report visibility and domain-layout policy in the existing alias-based `ReportConfig`. Keep `BrandedReport` generic by consuming those values, and express the visual difference through narrowly scoped CSS classes.

**Tech Stack:** Next.js, React, TypeScript, CSS, Jest, Testing Library

**Spec:** `docs/superpowers/specs/2026-08-31-five-dysfunctions-word-report-parity-design.md`

## Global Constraints

- Five Dysfunctions order is Cover → Five Categories → Detailed Breakdown → Closing/footer.
- Five Dysfunctions omits Overall Result and All sections.
- Other report aliases retain current behavior.
- No environment, flag, schema, migration, or production-data changes.
- Tests must follow red → green and exercise public rendering/configuration seams.

---

### Task 1: Encode the Five Dysfunctions presentation policy

**Files:**
- Modify: `src/src/lib/assessments/report-config.ts`
- Test: `src/src/__tests__/lib/assessments/report-config.test.ts`

**Interfaces:**
- Consumes: template alias passed to `reportConfigFor(alias)`
- Produces: optional `showOverall` and `domainResults.layout` presentation values

- [ ] **Step 1: Write a failing configuration test**

Assert that `reportConfigFor("five-dysfunctions")` returns `showOverall: false`, `showScoreTable: false`, and `domainResults.layout: "split"`, while `DEFAULT_REPORT_CONFIG.showOverall` remains omitted/backward-compatible.

- [ ] **Step 2: Run the focused configuration test and verify RED**

Run: `npx jest src/src/__tests__/lib/assessments/report-config.test.ts --runInBand`

Expected: FAIL because the new presentation policy does not exist.

- [ ] **Step 3: Add the minimal configuration fields**

Add optional `showOverall` to `ReportConfig`, optional `layout: "unified" | "split"` to `DomainResultsPresentation`, and configure Five Dysfunctions with `showOverall: false`, `showScoreTable: false`, and `layout: "split"`.

- [ ] **Step 4: Run the focused configuration test and verify GREEN**

Run: `npx jest src/src/__tests__/lib/assessments/report-config.test.ts --runInBand`

Expected: PASS.

### Task 2: Render the Word-document section structure

**Files:**
- Modify: `src/src/components/assessments/BrandedReport.tsx`
- Test: `src/src/__tests__/components/assessments/branded-report.test.tsx`

**Interfaces:**
- Consumes: `ReportConfig.showOverall`, `ReportConfig.showScoreTable`, and `DomainResultsPresentation.layout`
- Produces: Five Dysfunctions DOM without Overall/All sections and with a split-layout marker

- [ ] **Step 1: Write one failing renderer test for section visibility**

Render `fiveDysfunctionsReport()` and assert no `report-overall` or `report-scores-table`, while `report-decisions`, `report-sections`, `report-conclusion`, and five domain messages remain.

- [ ] **Step 2: Run the focused renderer test and verify RED**

Run: `npx jest src/src/__tests__/components/assessments/branded-report.test.tsx --runInBand`

Expected: FAIL because Overall Result and All sections still render.

- [ ] **Step 3: Implement minimal configuration-driven section guards**

Guard the overall section with `reportConfig.showOverall !== false`; retain the existing `showScoreTable` guard for the score table.

- [ ] **Step 4: Run the focused renderer test and verify GREEN**

Run the same Jest command. Expected: PASS.

- [ ] **Step 5: Write one failing renderer test for split category rows**

Assert the Five Categories grid has the split-layout class, five category rows, and five compact score-card children. Assert Scaling Up Full lacks the split-layout marker and retains Overall Result and All sections.

- [ ] **Step 6: Run the renderer test and verify RED**

Run the same Jest command. Expected: FAIL because split-layout markup is absent.

- [ ] **Step 7: Implement minimal generic split-layout markup**

Derive the layout from `domainResults.layout`, add the split grid/row/score-card classes, and preserve current unified/no-message markup for all other aliases.

- [ ] **Step 8: Run the renderer test and verify GREEN**

Run the same Jest command. Expected: PASS.

### Task 3: Match the Word two-column visual treatment

**Files:**
- Modify: the existing report stylesheet containing `.su-report-card-grid-with-messages`
- Test: `src/src/__tests__/components/assessments/branded-report.test.tsx`

**Interfaces:**
- Consumes: split-layout classes emitted by `BrandedReport`
- Produces: desktop two-column score/message rows and narrow-screen stacking

- [ ] **Step 1: Add a failing stylesheet/markup contract assertion**

Assert split rows expose separate score-card and interpretation elements with stable classes and no unified outer-card class.

- [ ] **Step 2: Run the focused renderer test and verify RED**

Run the renderer Jest file. Expected: FAIL because the split contract is incomplete.

- [ ] **Step 3: Implement the responsive split styles**

Use a two-column grid at report desktop widths; give only the score element the bordered rounded card; keep interpretation unboxed and vertically centered; stack at the existing mobile breakpoint.

- [ ] **Step 4: Run the focused renderer test and verify GREEN**

Run the renderer Jest file. Expected: PASS.

### Task 4: Verify, document, and review

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**
- Consumes: completed implementation
- Produces: source-of-truth receipt and review-ready branch

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npx jest src/src/__tests__/lib/assessments/report-config.test.ts src/src/__tests__/components/assessments/branded-report.test.tsx --runInBand
```

- [ ] **Step 2: Run ESLint on changed TypeScript files**

Run `npx eslint` with the exact changed `.ts` and `.tsx` paths.

- [ ] **Step 3: Run migration safety and production build gates**

Run:

```bash
node scripts/check-migration-safety.mjs
CI=true npm run build
```

- [ ] **Step 4: Update source-of-truth documentation**

Update the `CLAUDE.md` last-updated anchor/prose and prepend a concise implementation/verification receipt to `plans/CHANGELOG.md`.

- [ ] **Step 5: Commit and run two-axis review**

Review `origin/main...HEAD` against this spec and repository standards. Fix every actionable finding, rerun affected checks, and repeat until clear.

- [ ] **Step 6: Push and open a pull request**

Push `codex/five-dysfunctions-word-parity`, open a PR to `main`, and monitor required checks/review feedback.

