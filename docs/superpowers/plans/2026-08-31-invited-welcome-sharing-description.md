# Invited Welcome Sharing Explanation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable Sharing explanation to invited Welcome screens while preserving every existing campaign snapshot and diagnosing the separate customization report without changing ADR-0033 semantics.

**Architecture:** Persist new authoring as `InvitedWelcomeConfigV2`; retain an explicit v1 storage schema and normalize valid v1 JSON to v2 in memory with the exact legacy sentence. The shared Welcome editor and card carry the new value, while campaign creation snapshots normalized v2 and existing campaign JSON remains untouched.

**Tech Stack:** TypeScript, React, Next.js App Router, Zod, Prisma JSONB, Jest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-31-invited-welcome-sharing-description-design.md`

## Global Constraints

- Base and review fixed point is `c0c5b68e80128616c2fd7cce28912ef3a55eed1c`.
- Do not change ADR-0033 snapshot semantics or the database immutability trigger.
- Do not rewrite existing template or campaign JSON and do not add a migration.
- Do not change environment variables, feature flags, Production data, campaign state, invitations, responses, or email delivery.
- PUBLIC Welcome screens and invitation-email content remain out of scope.
- Production code follows witnessed RED → minimal GREEN → refactor cycles.

## Co-validation Decisions

The independent staff review produced four findings:

- **Accepted:** compatibility parsing, snapshot seams, `/me`, verifier behavior,
  and campaign-creation proof are one TDD slice so the cross-seam tests all
  witness RED before the shared parser turns green.
- **Accepted:** the dedicated
  `api/assessment-campaigns/invited-welcome-snapshot.test.ts` suite is the
  authoritative future-campaign-only and flag-off-persistence proof.
- **Accepted:** the feature-off literal-to-constant refactor includes the
  existing `welcome-lede.test.tsx` regression.
- **Overridden:** the exact `CI=true npm run build` command remains because the
  user explicitly required it. The plan adds a no-credential-import boundary
  and distinguishes a wrapper failure from the supplementary compile-only gate.
- **Overridden:** issue #261 remains the PR claim-update destination because
  that issue is the repository's shared claim tracker; #387 remains the product
  item/spec source.

---

### Task 1: Versioned config compatibility

**Files:**
- Modify: `src/src/lib/assessments/invited-welcome-config.ts`
- Modify: `src/src/lib/assessments/invited-welcome-snapshot.ts`
- Modify: `src/src/lib/assessments/invited-welcome-backfill-verifier.ts`
- Modify: `src/src/app/api/assessment-campaigns/route.ts`
- Test: `src/src/__tests__/lib/assessments/invited-welcome-config.test.ts`
- Test: `src/src/__tests__/lib/assessments/invited-welcome-snapshot.test.ts`
- Test: `src/src/__tests__/lib/assessments/invited-welcome-backfill-verifier.test.ts`
- Test: `src/src/__tests__/api/assessment-campaigns/me-invited-welcome.test.ts`
- Test: `src/src/__tests__/api/assessment-campaigns/invited-welcome-snapshot.test.ts`

**Interfaces:**
- Produces: `DEFAULT_INVITED_WELCOME_SHARING_DESCRIPTION: string`.
- Produces: `InvitedWelcomeConfigV1` as the historical stored shape.
- Produces: `InvitedWelcomeConfigV2` and `InvitedWelcomeConfig` as the normalized current runtime shape.
- Produces: unversioned `InvitedWelcomeAuthoringInput`, because the browser payload excludes server-owned `schemaVersion` and is not itself a persisted schema.
- Produces: `invitedWelcomeConfigSchema` parsing valid v1/v2 storage to `InvitedWelcomeConfigV2`.
- Produces: `buildInvitedWelcomeConfig(input, finePrint): InvitedWelcomeConfigV2`.
- Produces: normalized v2 at participant-read and campaign-creation snapshot seams without updating stored v1 JSON.

- [ ] **Step 1: Write failing config tests**

Add literal expectations across the config, snapshot loader, `/me`, verifier,
and coach campaign-creation suites proving: generic/legacy configs are schema
v2 and include the exact default; v1 storage upgrades in memory; authored v2
survives; missing or overlong Sharing descriptions fail authoring; schema 3
fails closed; build returns schema v2; existing v1 campaign reads are visually
unchanged; and a v1 template creates a v2 snapshot only for the new campaign.

```ts
expect(invitedWelcomeConfigSchema.parse(legacyV1)).toEqual({
  ...legacyV1,
  schemaVersion: 2,
  sharingDescription:
    "Your coach or facilitator and authorized Scaling Up staff can review your named individual answers.",
});
expect(buildInvitedWelcomeConfig(validAuthoring, null).schemaVersion).toBe(2);
```

- [ ] **Step 2: Run RED**

Run:

```bash
npx jest src/__tests__/lib/assessments/invited-welcome-config.test.ts src/__tests__/lib/assessments/invited-welcome-snapshot.test.ts src/__tests__/lib/assessments/invited-welcome-backfill-verifier.test.ts src/__tests__/api/assessment-campaigns/me-invited-welcome.test.ts src/__tests__/api/assessment-campaigns/invited-welcome-snapshot.test.ts --runInBand
```

Expected: failures because schema v2 and `sharingDescription` do not exist.

- [ ] **Step 3: Implement the v1/v2 parser and v2 builder**

Keep a strict v1 object, add a strict v2 object, and transform only valid v1 to
v2. Add `sharingDescription: normalizedText(400)` to authoring fields and
explicit transforms. Rename the current authoring type to
`InvitedWelcomeAuthoringInput`; do not retain a misleading v1 name for a
payload that has no schema version. Do not use `.default()` on malformed v2;
only v1 earns the compatibility default. Return normalized v2 from the existing
snapshot loader and `/me` parser. In the verifier, compare successful normalized
values to the canonical alias config; issue no database update. Update the
campaign-create type to the normalized current config.

- [ ] **Step 4: Run GREEN and mutation-check it**

Repeat the Step 2 command, then run both Esperto import snapshot insertion
suites:

```bash
npx jest src/__tests__/lib/assessments/esperto-import/results-commit.test.ts src/__tests__/lib/assessments/esperto-import/restricted-commit.test.ts --runInBand
```

Expected: all config tests pass; mentally removing the v1 transform, changing
the default sentence, accepting schema 3, or dropping v2 validation breaks at
least one test.

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/assessments/invited-welcome-config.ts src/src/lib/assessments/invited-welcome-snapshot.ts src/src/lib/assessments/invited-welcome-backfill-verifier.ts src/src/app/api/assessment-campaigns/route.ts src/src/__tests__/lib/assessments/invited-welcome-config.test.ts src/src/__tests__/lib/assessments/invited-welcome-snapshot.test.ts src/src/__tests__/lib/assessments/invited-welcome-backfill-verifier.test.ts src/src/__tests__/api/assessment-campaigns/me-invited-welcome.test.ts src/src/__tests__/api/assessment-campaigns/invited-welcome-snapshot.test.ts src/src/__tests__/lib/assessments/esperto-import/results-commit.test.ts src/src/__tests__/lib/assessments/esperto-import/restricted-commit.test.ts
git commit -m "feat(assessments): version invited Welcome sharing copy"
```

### Task 2: Shared editor and renderer

**Files:**
- Modify: `src/src/components/assessments/InvitedWelcomeCard.tsx`
- Modify: `src/src/components/assessments/org-survey-client.tsx`
- Modify: `src/src/components/admin/template-editor/WelcomeScreenCard.tsx`
- Modify: `src/src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts`
- Modify: `src/src/components/admin/SimplifiedAssessmentTemplateForm.tsx`
- Test: `src/src/__tests__/assessments/invited-welcome-snapshot-render.test.tsx`
- Test: `src/src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx`
- Test: `src/src/__tests__/components/admin/simplified-assessment-template-form.test.tsx`
- Test: `src/src/__tests__/components/admin/template-editor/welcome-screen-save.test.tsx`
- Test: `src/src/__tests__/components/admin/template-editor/FormsBuilder.test.tsx`
- Test: `src/src/__tests__/assessments/welcome-lede.test.tsx`

**Interfaces:**
- Consumes: normalized `InvitedWelcomeConfig` and unversioned `InvitedWelcomeAuthoringInput`.
- Produces: one `Sharing explanation` input and `config.sharingDescription` in preview/live rendering.

- [ ] **Step 1: Write failing rendering and field tests**

Use an authored literal such as `"Only the facilitation team can review these answers."` and assert it appears inside `welcome-expectations`. Assert the editor has an enabled `Sharing explanation` input between Sharing heading and Scores heading, and that changing it updates the preview/state payload.

- [ ] **Step 2: Run RED**

Run:

```bash
npx jest src/__tests__/assessments/invited-welcome-snapshot-render.test.tsx src/__tests__/assessments/welcome-lede.test.tsx src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx src/__tests__/components/admin/simplified-assessment-template-form.test.tsx src/__tests__/components/admin/template-editor/welcome-screen-save.test.tsx src/__tests__/components/admin/template-editor/FormsBuilder.test.tsx --runInBand
```

Expected: authored Sharing explanation is absent and editor/state assertions fail.

- [ ] **Step 3: Implement minimal UI/state wiring**

Pass `config.sharingDescription` to `WelcomeExpectations`, add the field in the
fixed order, and hydrate it in both editor state owners. Replace the legacy
feature-off string literal with the shared default constant without changing
its markup or feature-gate branch; the `welcome-lede` regression must witness
the exact feature-off sentence before and after that refactor.

- [ ] **Step 4: Run GREEN**

Repeat the Step 2 command. Expected: all five suites pass.

- [ ] **Step 5: Commit**

```bash
git add src/src/components/assessments/InvitedWelcomeCard.tsx src/src/components/assessments/org-survey-client.tsx src/src/components/admin/template-editor/WelcomeScreenCard.tsx src/src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts src/src/components/admin/SimplifiedAssessmentTemplateForm.tsx src/src/__tests__/assessments/invited-welcome-snapshot-render.test.tsx src/src/__tests__/assessments/welcome-lede.test.tsx src/src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx src/src/__tests__/components/admin/simplified-assessment-template-form.test.tsx src/src/__tests__/components/admin/template-editor/welcome-screen-save.test.tsx src/src/__tests__/components/admin/template-editor/FormsBuilder.test.tsx
git commit -m "feat(assessments): author Welcome sharing explanation"
```

### Task 3: API persistence and exact validation

**Files:**
- Modify: `src/src/app/api/admin/assessment-templates/route.ts`
- Modify only if types require it: `src/src/app/api/admin/assessment-templates/[id]/route.ts`
- Test: `src/src/__tests__/api/admin/assessment-templates/invited-welcome-default.test.ts`
- Test: `src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts`

**Interfaces:**
- Consumes: `sharingDescription` in the strict simplified-create body and PATCH authoring schema.
- Produces: schema-v2 `invitedWelcomeDefault` JSON with protected `finePrint` preserved.

- [ ] **Step 1: Write failing API tests**

Assert simplified creation and PATCH persist:

```ts
expect.objectContaining({
  schemaVersion: 2,
  sharingDescription: "Only named facilitators can review answers.",
  finePrint: expectedFinePrint,
})
```

Also assert omission, arbitrary unknown keys on the strict simplified-create
body, overlength, and forged `schemaVersion` remain `400` failures before a
transaction/write. Preserve the PATCH path's existing select-known/drop-unknown
compatibility behavior.

- [ ] **Step 2: Run RED**

Run:

```bash
npx jest src/__tests__/api/admin/assessment-templates/invited-welcome-default.test.ts src/__tests__/api/admin/assessment-templates/templates-crud.test.ts --runInBand
```

Expected: exact create input rejects the new field and persistence remains v1.

- [ ] **Step 3: Add the exact create field and v2 expectations**

Add `sharingDescription: z.unknown()` to the exact simplified-create object.
Let the shared authoring schema validate it. Preserve the existing PATCH
server-owned-field guard and fine-print resolution.

- [ ] **Step 4: Run GREEN**

Repeat the Step 2 command. Expected: both suites pass.

- [ ] **Step 5: Commit**

```bash
git add src/src/app/api/admin/assessment-templates/route.ts src/src/app/api/admin/assessment-templates/[id]/route.ts src/src/__tests__/api/admin/assessment-templates/invited-welcome-default.test.ts src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts
git commit -m "feat(api): persist invited Welcome schema v2"
```

### Task 4: Documentation and final verification

**Files:**
- Modify: `docs/adr/0033-admin-owned-invited-welcome-snapshots.md`
- Modify: `CONTEXT.md`
- Modify: `docs/wireframes-phase2/wave7/26-admin-template-editor-welcome.md`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**
- Produces: durable schema-v2/non-retroactivity record and accurate eight-field wireframe.

- [ ] **Step 1: Update source-of-truth prose**

Record v1 read compatibility, v2 new writes, no migration, no snapshot rewrite,
the eighth field, ESPERTO cross-surface diagnosis, exact implementation status,
and the unchanged exclusions. Set `CLAUDE.md` freshness anchors to the new top
CHANGELOG entry.

- [ ] **Step 2: Run focused and broader assessment tests**

Run all tests changed by the branch and the assessment Welcome/API matrix. Then
run the complete serial repository suite:

```bash
npx jest --runInBand
```

Expected: zero failed suites/tests/snapshots. If an unrelated load-sensitive
failure appears, rerun that exact suite in isolation and report both receipts;
do not call the full run green.

- [ ] **Step 3: Run required static and build gates**

From `src/`, run:

```bash
git diff --name-only --diff-filter=ACMR c0c5b68e...HEAD -- '*.ts' '*.tsx' | xargs npx eslint
node scripts/check-migration-safety.mjs
CI=true npm run build
```

Expected: ESLint has no diagnostics, migration safety approves the unchanged
migration set, and the exact build exits 0 after TypeScript/Turbopack/static
generation. The required wrapper includes `prisma migrate deploy`: do not
symlink/import a `.env`, inject credentials, or alter any environment value to
make it run. If the unchanged ambient environment cannot safely reach the
compile step, report that exact failure and separately run
`CI=true npx next build --turbopack` as compilation evidence; never claim the
required wrapper passed unless it did.

- [ ] **Step 4: Run diff and requirement checks**

```bash
git diff --check
git status --short
git diff c0c5b68e...HEAD --stat
```

Re-read the spec acceptance list and map each requirement to a test or diff.
Verify no environment/flag/migration/Production-data file changed.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/adr/0033-admin-owned-invited-welcome-snapshots.md CONTEXT.md docs/wireframes-phase2/wave7/26-admin-template-editor-welcome.md CLAUDE.md plans/CHANGELOG.md docs/superpowers/specs/2026-08-31-invited-welcome-sharing-description-design.md docs/superpowers/plans/2026-08-31-invited-welcome-sharing-description.md
git commit -m "docs: record invited Welcome sharing contract"
```

### Task 5: Review loop and PR

**Files:** Review the complete `c0c5b68e...HEAD` diff; change only files needed to resolve actionable findings.

- [ ] **Step 1: Run two-axis independent review**

Use the repository `code-review` skill with fixed point `c0c5b68e`, this spec,
the handoff, ADR-0033, and documented standards. Run Standards and Spec reviewers
in parallel and keep their findings separate.

- [ ] **Step 2: Resolve findings test-first**

For every Critical or Important runtime finding, add or adjust the failing test,
witness RED, make the minimal correction, rerun affected gates, and commit. For
documentation-only findings, correct the source and run changelog/diff hygiene.

- [ ] **Step 3: Repeat review until clear**

Re-run both axes on the amended HEAD. Do not open the PR while a reviewer is
still running or while an actionable finding remains.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin codex/387-item-4-welcome-sharing-description
gh pr create --base main --head codex/387-item-4-welcome-sharing-description --title "Add invited Welcome sharing explanation" --body '## Summary

- add the missing invited Welcome Sharing explanation through schema v2
- preserve stored v1 campaign snapshots through read-time compatibility
- diagnose the separate customization report without changing ADR-0033 semantics

## Evidence

- ESPERTO read-only inspection confirmed invitation Mail and survey entry are separate surfaces
- focused and full Jest, changed-file ESLint, migration safety, and the required CI build receipts are recorded in the branch CHANGELOG entry

## Boundaries

No environment variable, feature flag, migration, Production data, campaign, invitation, response, or email was changed.'
```

The PR body must identify part (a) as fixed, part (b) as diagnosed/no semantic
change, the v1/v2 strategy, ESPERTO evidence, TDD receipts, full/build/lint
receipts, and explicit no-environment/no-Production-data boundaries.

- [ ] **Step 5: Review hosted feedback**

Wait for hosted checks, inspect unresolved threads and actionable comments,
apply the same test-first correction loop, and update the issue #261 claim with
the open PR. Do not merge unless separately authorized.
