# Five Dysfunctions Domain Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the existing Five Dysfunctions domain-results heading and render each frozen domain-tier interpretation without duplicating the section or changing other reports.

**Architecture:** Add an optional per-template domain-results presentation policy to `report-config.ts`, consume the frozen `perDomain[].tier.message` in the existing Classic `BrandedReport` section, and add message-aware CSS that activates only for Five Dysfunctions. Correct ambiguous fractional touching-tier resolution at the scorer so exact seed boundaries select the higher band.

**Tech Stack:** Next.js 15, React 19, TypeScript, Jest, Testing Library, scoped CSS.

**Spec:** `docs/superpowers/specs/2026-08-30-five-dysfunctions-domain-results-design.md`

## Global Constraints

- Do not add a second results-by-area/domain-results section.
- Do not re-score in the renderer; consume the frozen `ScoreResult.perDomain[].tier.message`.
- Preserve Scaling Up Full and every other domain template's current heading, card markup, and message visibility.
- Do not change environment variables, feature flags, schema, migrations, or Production data.
- Keep source-of-truth documentation in the same PR as the code.

---

### Task 1: Lock per-template heading and rendering policy

**Files:**
- Modify: `src/src/lib/assessments/report-config.ts`
- Test: `src/src/__tests__/lib/assessments/report-config.test.ts`

**Interfaces:**
- Consumes: stable `AssessmentTemplate.alias` passed to `reportConfigFor()`.
- Produces: optional `domainResults` with `eyebrow`, `title`, and `showTierMessage`.

- [ ] **Step 1: Write the failing config test**

Assert `reportConfigFor("five-dysfunctions").domainResults` equals `{ eyebrow: "How you scored, by area", title: "The Five Categories", showTierMessage: true }`, while `scaling-up-full` and the default config have no override.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx jest src/__tests__/lib/assessments/report-config.test.ts --runInBand`
Expected: FAIL because `domainResults` is absent.

- [ ] **Step 3: Add the minimal typed config override**

Add an optional readonly domain-results presentation type to `ReportConfig` and configure it only on `five-dysfunctions`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx jest src/__tests__/lib/assessments/report-config.test.ts --runInBand`
Expected: PASS.

### Task 2: Prove and correct exact fractional tier boundaries

**Files:**
- Modify: `src/src/lib/assessments/scoring.ts`
- Test: `src/src/__tests__/assessments/five-dysfunctions-seed-content.test.ts`

**Interfaces:**
- Consumes: validated touching domain tiers and a computed domain average.
- Produces: the frozen `PerDomainResult.tier` whose message the report renders.

- [ ] **Step 1: Write the failing scoring boundary test**

Build the real Five Dysfunctions version from `buildFiveDysfunctionsContent()`. Supply complete valid answers whose Trust values average exactly `3.25`, assert the Trust tier label/message are the literal seeded Medium values, then repeat with an exact `3.75` Trust average and the literal seeded High values.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx jest src/__tests__/assessments/five-dysfunctions-seed-content.test.ts --runInBand`
Expected: FAIL because the lower band currently wins each shared endpoint.

- [ ] **Step 3: Implement the minimal boundary rule**

Within `resolveTier`, select the matching tier with the greatest `minMetric`. Do not change tier validation, integer ranges, or scoring output fields.

- [ ] **Step 4: Run scoring tests and verify GREEN**

Run: `npx jest src/__tests__/assessments/five-dysfunctions-seed-content.test.ts src/__tests__/lib/assessments/scoring.test.ts --runInBand`
Expected: PASS.

### Task 3: Render the existing section with Five Dysfunctions messages

**Files:**
- Modify: `src/src/components/assessments/BrandedReport.tsx`
- Modify: `src/src/styles/su-report.css`
- Test: `src/src/__tests__/components/assessments/branded-report.test.tsx`

**Interfaces:**
- Consumes: `reportConfigFor(report.templateAlias).domainResults` and frozen `PerDomainResult.tier?.message`.
- Produces: one `report-decisions` section with template-owned labels and optional per-card message markup.

- [ ] **Step 1: Write the failing renderer tests**

Add a Five Dysfunctions fixture with five domains and literal frozen messages. Assert one `report-decisions` section, the area/category labels, five message-bearing cards, and no Four Decisions heading. Add an empty-tier case that omits the message. Keep the existing Scaling Up Full snapshot assertion unchanged and explicitly assert its old labels and absence of message elements.

- [ ] **Step 2: Run the renderer test and verify RED**

Run: `npx jest src/__tests__/components/assessments/branded-report.test.tsx --runInBand`
Expected: FAIL on the Five Dysfunctions labels/messages.

- [ ] **Step 3: Implement the minimal renderer and CSS changes**

Read config once, carry the frozen message into Five Dysfunctions domain-card view data, render it with a dedicated class/test id, and activate a one-row/two-column score-plus-message layout only when at least one configured message exists. Stack the columns below 720px. Leave the no-message JSX class strings and Scaling Up Full snapshot unchanged.

- [ ] **Step 4: Run renderer/config tests and verify GREEN**

Run: `npx jest src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/lib/assessments/report-config.test.ts --runInBand`
Expected: PASS with the existing snapshot unchanged.

### Task 4: Source-of-truth and release verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Verify: every file changed since fixed point `cdafe24603c7c92648befc4a5f13d7ccbf01fc6d`

**Interfaces:**
- Consumes: final tested behavior and verification evidence.
- Produces: same-PR implementation record and PR-ready branch.

- [ ] **Step 1: Update source-of-truth documentation**

Prepend a dated CHANGELOG entry with the no-duplicate scope, boundary semantics, TDD receipts, visual comparison, and explicit no-environment/no-data boundary. Update only the `CLAUDE.md` `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor and its brief prose.

- [ ] **Step 2: Run focused and full tests**

Run focused affected suites, then `npm run test -- --runInBand`.
Expected: all suites pass; investigate any failure before proceeding.

- [ ] **Step 3: Run static and migration gates**

Run changed-file `npx eslint ...` and `node scripts/check-migration-safety.mjs`.
Expected: exit 0 with no ESLint warnings/errors and no unsafe migration.

- [ ] **Step 4: Run the exact build gate**

Run: `CI=true npm run build`
Expected: exit 0 after Prisma, TypeScript, Turbopack, and page generation.

- [ ] **Step 5: Complete visual comparison**

Render the Five Dysfunctions component at desktop and mobile widths. Compare with Jeff's three rendered source pages: exactly one area section, exact two labels, five ordered score/message rows, readable wrapping, no clipping/overflow, and the existing detailed breakdown retained.

- [ ] **Step 6: Commit, review, and create PR**

Commit the complete implementation, run independent Standards and Spec reviews against fixed point `cdafe24603c7c92648befc4a5f13d7ccbf01fc6d`, fix every actionable finding with fresh affected checks, and repeat until clear. Push `codex/387-item-6-five-dysfunctions-report` and open a PR against `main`; do not merge it.
