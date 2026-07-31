# GH #242 Retired Pinned-Edition Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a destructive “This edition has been retired” warning on the shared campaign-detail screen whenever its pinned assessment-template edition has an `archivedAt` value, while preserving edition provenance and all existing fail-quiet behavior.

**Architecture:** Extend the existing Wave EV boundary instead of introducing a new lifecycle model. Project `archivedAt` with the pinned version, expose it as the required nullable input `PinnedVersion.archivedAt`, derive `EditionStanding.pinnedRetired` in the pure resolver, short-circuit the sibling query when retirement is already known, and give retirement precedence over the existing stale-edition badge in the shared `CampaignDetail` component.

**Tech Stack:** TypeScript, React, Next.js 16 App Router, Prisma-shaped service interfaces, Jest, Testing Library, Tailwind semantic color tokens, ESLint, Turbopack.

## Global Constraints

- Work only in `/Users/diushianstand/Scaling-up-platform-v2/.worktrees/jeff-public-survey-closure` on branch `codex/242-retired-edition-warning`.
- Treat the approved design at `docs/superpowers/specs/2026-07-31-gh-242-retired-edition-warning-design.md` as authoritative.
- Do not add a schema migration, feature flag, data repair, campaign-list indicator, edition-changing action, icon, tooltip, or production fixture.
- Preserve the edition provenance line and the existing amber stale warning.
- Retirement wins presentation precedence when both facts are present.
- Keep the change shared by admin and coach through `CampaignDetail`; do not fork role-specific markup.
- Follow strict red-green-refactor order. See each new assertion fail for the intended reason before changing its production code.
- Run commands from `src/` unless a step explicitly changes the working directory.
- Never claim merge, launch, deployment readiness, or production behavior without observing it.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/src/lib/assessments/edition-standing.ts` | Extend the pure Wave EV input/output contract and derive retirement. |
| `src/src/__tests__/lib/assessments/edition-standing.test.ts` | Pin ordinary, retired, and retired-plus-behind decisions. |
| `src/src/lib/assessments/campaign-detail.ts` | Project pinned `archivedAt`, pass it through, and skip sibling reads for retired pins. |
| `src/src/__tests__/lib/assessments/campaign-detail.test.ts` | Pin the Prisma projection, retired short-circuit, and existing degraded behavior. |
| `src/src/components/assessments/CampaignDetail.tsx` | Render the destructive retired badge with retirement-first precedence. |
| `src/src/__tests__/components/assessments/campaign-edition-tile.test.tsx` | Pin wording, semantic classes, provenance, precedence, and unchanged states. |
| `CLAUDE.md` | Update the project freshness anchor and concise current-state summary. |
| `plans/CHANGELOG.md` | Record implementation scope, validation evidence, rollout state, and rollback. |

---

### Task 0: Refresh the fixed point and prove the baseline

**Files:**

- Inspect: branch and worktree state
- Verify: the three existing Wave EV suites

- [ ] **Step 1: Confirm the isolated branch is clean**

From the worktree root:

```bash
git status --short --branch
git branch --show-current
```

Expected: branch `codex/242-retired-edition-warning` with no uncommitted files.

- [ ] **Step 2: Refresh from protected main**

```bash
git fetch origin
git rebase origin/main
git status --short --branch
```

Expected: a clean branch based on current `origin/main`. Resolve only conflicts in GH #242's approved files; stop and reassess if upstream changed the Wave EV behavior or closed #242.

- [ ] **Step 3: Reconfirm the issue is not already delivered**

```bash
gh issue view 242 --json state,closedAt,closedByPullRequestsReferences,url
gh pr list --state all --search "242 in:title,body" --json number,state,mergedAt,title,url
```

Expected: no merged replacement for the retired pinned-edition warning. If a newly merged PR now supplies the approved behavior, verify it in code and production, release the claim, and do not duplicate it.

- [ ] **Step 4: Run the unchanged focused baseline**

From `src/`:

```bash
npx jest \
  src/__tests__/lib/assessments/edition-standing.test.ts \
  src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/__tests__/components/assessments/campaign-edition-tile.test.tsx \
  --runInBand
```

Expected: all existing Wave EV tests pass before the first GH #242 assertion is added. Record the suite and test counts as the fixed point.

---

### Task 1: Extend the pure edition-standing decision

**Files:**

- Modify: `src/src/__tests__/lib/assessments/edition-standing.test.ts`
- Modify: `src/src/lib/assessments/edition-standing.ts`

- [ ] **Step 1: Make the existing pinned fixtures explicit about retirement**

Add `archivedAt: null` to the shared `pinned` fixture and to the local `unpublished` fixture:

```ts
const pinned = {
  templateId: TPL,
  versionNumber: 3,
  publishedAt: new Date("2026-07-02T09:00:00.000Z"),
  archivedAt: null,
  language: "enUS",
};
```

```ts
const unpublished = {
  templateId: TPL,
  versionNumber: 3,
  publishedAt: null,
  archivedAt: null,
  language: "enUS",
};
```

- [ ] **Step 2: Add the failing ordinary and retired-result assertions**

Extend the exact result in `on the newest edition`:

```ts
expect(resolveEditionStanding(pinned, [])).toEqual({
  versionNumber: 3,
  publishedAt: pinned.publishedAt,
  pinnedRetired: false,
  newerEditionAvailable: false,
});
```

Add this block after `behind a newer edition`:

```ts
describe("retired pinned edition", () => {
  const retiredPinned = {
    ...pinned,
    archivedAt: new Date("2026-07-30T12:00:00.000Z"),
  };

  it("reports that the pinned edition itself has been retired", () => {
    expect(resolveEditionStanding(retiredPinned, [])).toEqual({
      versionNumber: 3,
      publishedAt: pinned.publishedAt,
      pinnedRetired: true,
      newerEditionAvailable: false,
    });
  });

  it("can represent retirement and a newer active edition as separate facts", () => {
    expect(resolveEditionStanding(retiredPinned, [published(4)])).toMatchObject({
      pinnedRetired: true,
      newerEditionAvailable: true,
    });
  });
});
```

- [ ] **Step 3: Run the pure test and verify RED**

```bash
npx jest src/__tests__/lib/assessments/edition-standing.test.ts --runInBand
```

Expected: TypeScript reports that `pinnedRetired` does not exist on `EditionStanding`, or the exact assertions fail because the returned object lacks `pinnedRetired`.

- [ ] **Step 4: Extend the pure contract and result**

In `PinnedVersion`, add the required nullable field:

```ts
export interface PinnedVersion {
  templateId: string;
  versionNumber: number;
  /** Null ⇒ the campaign is pinned to a draft (an anomaly — see below). */
  publishedAt: Date | null;
  /** Non-null ⇒ an administrator retired the pinned published edition. */
  archivedAt: Date | null;
  language: string;
}
```

In `EditionStanding`, add the independent retirement fact:

```ts
export interface EditionStanding {
  /** The edition this campaign is ACTUALLY serving — never the newest one. */
  versionNumber: number;
  publishedAt: Date;
  /** True ⇒ the pinned edition itself has been retired. */
  pinnedRetired: boolean;
  /** True ⇒ show the "Not the latest edition" chip unless retirement wins. */
  newerEditionAvailable: boolean;
}
```

Return the new fact without changing the sibling predicate:

```ts
return {
  versionNumber: pinned.versionNumber,
  publishedAt: pinned.publishedAt,
  pinnedRetired: pinned.archivedAt != null,
  newerEditionAvailable,
};
```

Replace the obsolete `KNOWN ASYMMETRY` paragraph in the resolver docblock with:

```ts
 * The pinned edition's `archivedAt` is a separate fact from whether a newer
 * active sibling exists. The resolver preserves both; callers decide which
 * warning has presentation precedence.
```

- [ ] **Step 5: Run the pure test and verify GREEN**

```bash
npx jest src/__tests__/lib/assessments/edition-standing.test.ts --runInBand
```

Expected: the suite passes, including ordinary `false`, retired `true`, and both-facts coverage.

- [ ] **Step 6: Commit the pure decision**

```bash
git add src/src/lib/assessments/edition-standing.ts src/src/__tests__/lib/assessments/edition-standing.test.ts
git commit -m "feat(assessments): derive retired edition standing"
```

---

### Task 2: Carry retirement through the campaign-detail loader

**Files:**

- Modify: `src/src/__tests__/lib/assessments/campaign-detail.test.ts`
- Modify: `src/src/lib/assessments/campaign-detail.ts`

- [ ] **Step 1: Extend the campaign fixture without weakening its default**

Replace `campaignOnVersion` with:

```ts
function campaignOnVersion(
  versionNumber: number,
  publishedAt: Date | null,
  archivedAt: Date | null = null,
) {
  return {
    ...baseCampaign(),
    // templateId is sourced from the VERSION in prod (the two FKs are
    // independent), so the fixture must carry it here too.
    version: {
      templateId: "tpl-1",
      versionNumber,
      publishedAt,
      archivedAt,
      language: "enUS",
    },
  };
}
```

Add `pinnedRetired: false` to the existing exact overview result:

```ts
expect(campaign.edition).toEqual({
  versionNumber: 3,
  publishedAt: new Date("2026-07-02T09:00:00Z"),
  pinnedRetired: false,
  newerEditionAvailable: false,
});
```

- [ ] **Step 2: Add the failing pinned-projection test**

Place this test before the sibling-projection test:

```ts
it("projects archivedAt from the pinned version", async () => {
  const db = buildDb({
    campaign: campaignOnVersion(3, new Date("2026-07-02T09:00:00Z")),
  });
  await getCampaignOverview(db, "c1");
  const { select } = (
    db.assessmentCampaign.findUnique as jest.Mock
  ).mock.calls[0][0].include.version;
  expect(select).toEqual({
    templateId: true,
    versionNumber: true,
    publishedAt: true,
    language: true,
    archivedAt: true,
  });
});
```

- [ ] **Step 3: Add the failing retired short-circuit test**

Add:

```ts
it("reports a retired pin without querying sibling versions", async () => {
  const db = buildDb({
    campaign: campaignOnVersion(
      3,
      new Date("2026-07-02T09:00:00Z"),
      new Date("2026-07-30T12:00:00Z"),
    ),
    versionsThrow: true,
  });

  const { campaign } = await getCampaignOverview(db, "c1");

  expect(campaign.edition).toEqual({
    versionNumber: 3,
    publishedAt: new Date("2026-07-02T09:00:00Z"),
    pinnedRetired: true,
    newerEditionAvailable: false,
  });
  expect(db.assessmentTemplateVersion.findMany).not.toHaveBeenCalled();
});
```

Using `versionsThrow: true` makes the test prove the loader does not merely ignore a successful query; any accidental query would reject.

- [ ] **Step 4: Run the loader suite and verify RED**

```bash
npx jest src/__tests__/lib/assessments/campaign-detail.test.ts --runInBand
```

Expected: the pinned projection lacks `archivedAt`; the retired fixture either fails its type boundary or reaches the throwing sibling lookup; the exact ordinary result lacks `pinnedRetired`.

- [ ] **Step 5: Extend the narrow campaign-version shape and projection**

Change `CampaignWithRels.version` to:

```ts
version?: {
  templateId: string;
  versionNumber: number;
  publishedAt: Date | null;
  archivedAt: Date | null;
  language: string;
} | null;
```

Update the `CampaignOverview.campaign.edition` and `CampaignWithRels.version` comments so they describe both facts: whether the pinned edition is retired and whether a newer active sibling exists. Preserve the optional/null fail-quiet contract.

Change the pinned-version projection to:

```ts
select: {
  templateId: true,
  versionNumber: true,
  publishedAt: true,
  language: true,
  archivedAt: true,
},
```

Pass the projected field through:

```ts
const pinned = {
  templateId: campaign.version.templateId,
  versionNumber: campaign.version.versionNumber,
  publishedAt: campaign.version.publishedAt,
  archivedAt: campaign.version.archivedAt,
  language: campaign.version.language,
};
```

- [ ] **Step 6: Short-circuit only the known retired state**

Replace the current unconditional `try` block inside `if (campaign.version != null)` with:

```ts
if (pinned.archivedAt != null) {
  edition = resolveEditionStanding(pinned, []);
} else {
  try {
    const siblings: TemplateVersionRow[] =
      await db.assessmentTemplateVersion.findMany({
        where: {
          templateId: pinned.templateId,
          language: pinned.language,
          versionNumber: { gt: pinned.versionNumber },
          ...activePublishedWhere,
        },
        select: {
          templateId: true,
          versionNumber: true,
          language: true,
          publishedAt: true,
          archivedAt: true,
        },
      });
    edition = resolveEditionStanding(pinned, siblings);
  } catch (err) {
    // Leave `edition` NULL — never claim currency we did not verify.
    console.error("[campaign-detail] edition sibling lookup failed:", err);
  }
}
```

Retain the existing explanatory comments around `activePublishedWhere` and the failure mode. Update the block-level comment to state:

```ts
// Wave EV / GH #242 — resolve the pinned edition. Retirement is known from
// the pinned row and needs no sibling query. Non-retired currency remains
// fail-quiet: a missing version, unpublished pin, or sibling-query failure
// yields `null`, so a decorative badge never blocks the campaign screen.
```

- [ ] **Step 7: Run the loader suite and verify GREEN**

```bash
npx jest src/__tests__/lib/assessments/campaign-detail.test.ts --runInBand
```

Expected: all loader tests pass. The retired test makes no sibling call; the non-retired lookup-failure tests still return `edition: null`; the existing exact sibling projection remains unchanged.

- [ ] **Step 8: Commit the loader boundary**

```bash
git add src/src/lib/assessments/campaign-detail.ts src/src/__tests__/lib/assessments/campaign-detail.test.ts
git commit -m "feat(assessments): load retired pinned editions"
```

---

### Task 3: Render retirement with destructive precedence

**Files:**

- Modify: `src/src/__tests__/components/assessments/campaign-edition-tile.test.tsx`
- Modify: `src/src/components/assessments/CampaignDetail.tsx`

- [ ] **Step 1: Make existing component fixtures explicit**

Add `pinnedRetired: false` to the `current`, `behind`, and inline wording fixtures. For example:

```ts
const current = {
  versionNumber: 4,
  publishedAt: CURRENT_PUBLISHED,
  pinnedRetired: false,
  newerEditionAvailable: false,
};
```

```ts
const behind = {
  versionNumber: 3,
  publishedAt: BEHIND_PUBLISHED,
  pinnedRetired: false,
  newerEditionAvailable: true,
};
```

- [ ] **Step 2: Add failing wording, provenance, and semantic-style coverage**

Add this block before `unknowable / degraded`:

```tsx
describe("retired pinned edition", () => {
  const retired = {
    versionNumber: 3,
    publishedAt: BEHIND_PUBLISHED,
    pinnedRetired: true,
    newerEditionAvailable: false,
  };

  it("preserves provenance and names retirement explicitly", () => {
    renderDetail(retired);

    expect(screen.getByTestId("campaign-edition-line")).toHaveTextContent(
      "Edition 3",
    );
    expect(screen.getByTestId("campaign-edition-line")).toHaveTextContent(
      formatTimestamp(BEHIND_PUBLISHED),
    );
    expect(screen.getByTestId("campaign-edition-retired")).toHaveTextContent(
      "This edition has been retired",
    );
  });

  it("uses the semantic destructive treatment", () => {
    renderDetail(retired);

    expect(screen.getByTestId("campaign-edition-retired")).toHaveClass(
      "border-destructive/30",
      "bg-destructive/10",
      "text-destructive",
    );
  });

  it("shows retirement instead of the stale badge when both facts are true", () => {
    renderDetail({
      ...retired,
      newerEditionAvailable: true,
    });

    expect(
      screen.getByTestId("campaign-edition-retired"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("campaign-edition-stale"),
    ).not.toBeInTheDocument();
  });
});
```

Also add absence checks for the new badge to the current and degraded states:

```ts
expect(
  screen.queryByTestId("campaign-edition-retired"),
).not.toBeInTheDocument();
```

- [ ] **Step 3: Run the component suite and verify RED**

```bash
npx jest src/__tests__/components/assessments/campaign-edition-tile.test.tsx --runInBand
```

Expected: Testing Library cannot find `campaign-edition-retired`; the both-facts case still renders the amber stale badge.

- [ ] **Step 4: Implement the approved retirement-first rendering**

Replace the current stale-only conditional after the provenance line with:

```tsx
{campaign.edition.pinnedRetired ? (
  <span
    className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive"
    data-testid="campaign-edition-retired"
  >
    This edition has been retired
  </span>
) : campaign.edition.newerEditionAvailable ? (
  <span
    className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-xs font-semibold text-warning"
    data-testid="campaign-edition-stale"
  >
    Not the latest edition
  </span>
) : null}
```

Update the nearby explanatory comment so it covers both warnings and records that a campaign has no edition-changing write path. Do not add an icon, tooltip, button, or link.

- [ ] **Step 5: Run the component suite and verify GREEN**

```bash
npx jest src/__tests__/components/assessments/campaign-edition-tile.test.tsx --runInBand
```

Expected: the suite passes with the exact approved copy, destructive semantic classes, preserved provenance, retirement precedence, and unchanged current/degraded behavior.

- [ ] **Step 6: Run all three focused suites together**

```bash
npx jest \
  src/__tests__/lib/assessments/edition-standing.test.ts \
  src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/__tests__/components/assessments/campaign-edition-tile.test.tsx \
  --runInBand
```

Expected: all three suites pass in one process.

- [ ] **Step 7: Commit the presentation**

```bash
git add src/src/components/assessments/CampaignDetail.tsx src/src/__tests__/components/assessments/campaign-edition-tile.test.tsx
git commit -m "feat(assessments): warn on retired campaign editions"
```

---

### Task 4: Perform the approved local visual review

**Files:**

- Inspect: `src/src/components/assessments/CampaignDetail.tsx`
- Inspect: the locally running shared admin/coach campaign-detail screen

- [ ] **Step 1: Start the local application with an existing non-production fixture**

Use the repository's configured local environment and start the app from `src/`:

```bash
npm run dev
```

Do not create or modify production data. If the existing local data has no retired pin, use the component test fixture or a local-only reversible database fixture, and record exactly which local fixture was used in the changelog.

- [ ] **Step 2: Inspect the actual shared component at desktop width**

At 1440 × 900 CSS pixels, verify:

- the edition provenance remains above the warning;
- “This edition has been retired” fits without clipping or collision;
- the destructive border, background, and text are visibly distinct;
- no stale badge, icon, tooltip, action, or duplicate warning appears;
- surrounding Template and Organization content remains aligned.

- [ ] **Step 3: Inspect the actual shared component at mobile width**

At 390 × 844 CSS pixels, verify the same points and confirm the warning wraps cleanly if needed without horizontal overflow.

- [ ] **Step 4: Verify the shared role surface**

Run:

```bash
rg -n "CampaignDetail" src/app src/components
```

Confirm from route composition that both admin and coach entry points reach the same `CampaignDetail` component. Navigate both roles when the local fixture includes both sessions. Do not duplicate the markup to manufacture role-specific evidence.

- [ ] **Step 5: Stop the local server and record the visual receipt**

Record the inspected routes, both exact viewport sizes, fixture identity, and observations in the GH #242 changelog entry. Do not add a new visual-companion artifact; the user declined it during design approval.

---

### Task 5: Run pre-PR gates and update source-of-truth documents

**Files:**

- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Verify: all six code/test files from Tasks 1–3

- [ ] **Step 1: Run the focused regression suites**

```bash
npx jest \
  src/__tests__/lib/assessments/edition-standing.test.ts \
  src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/__tests__/components/assessments/campaign-edition-tile.test.tsx \
  --runInBand
```

Expected: all suites and tests pass. Record the exact counts.

- [ ] **Step 2: Run scoped ESLint**

```bash
npx eslint \
  src/lib/assessments/edition-standing.ts \
  src/lib/assessments/campaign-detail.ts \
  src/components/assessments/CampaignDetail.tsx \
  src/__tests__/lib/assessments/edition-standing.test.ts \
  src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/__tests__/components/assessments/campaign-edition-tile.test.tsx
```

Expected: exit code 0.

- [ ] **Step 3: Run migration safety**

```bash
node scripts/check-migration-safety.mjs
```

Expected: exit code 0 with no unapproved destructive migration.

- [ ] **Step 4: Run the production-equivalent build**

```bash
CI=true npx next build --turbopack
```

Expected: exit code 0. Record non-fatal environment warnings accurately rather than describing them as clean output.

- [ ] **Step 5: Prepend the implementation changelog entry using observed evidence**

At the top of the entries section in `plans/CHANGELOG.md`, add this fixed scope and status:

```md
### 2026-07-31 — GH #242 retired pinned-edition warning implemented <!-- ENTRY_ISO:2026-07-31 ENTRY_SLUG:gh-242-retired-edition-warning-pr-ready -->

**Status: IMPLEMENTED + LOCALLY VERIFIED; PR-ready, not merged or launched.** Campaign detail now preserves its pinned-edition provenance and shows the destructive **This edition has been retired** warning when that exact `AssessmentTemplateVersion` has a non-null `archivedAt`. Retirement has presentation precedence over the existing amber **Not the latest edition** warning.

**Boundary and behavior.** The existing Wave EV seam now projects pinned `archivedAt`, derives the independent `pinnedRetired` fact, and avoids the sibling-version lookup when retirement is already known. Non-retired sibling-query failure remains fail-quiet with `edition: null`. The change is shared by admin and coach through `CampaignDetail`, is read-only and flagless, and does not alter campaign lists, edition lifecycle writes, scoring, reports, submissions, schema, data, or environment configuration. GH #243 continues to own campaign-list indicators.
```

Then write an `**Evidence.**` paragraph containing only facts observed in Steps 1–4 and Task 4: exact Jest suite/test counts, scoped ESLint exit, migration-safety result, Turbopack exit and warnings, local fixture identity, inspected routes, and the 1440 × 900 and 390 × 844 observations. State that the 2026-07-31 read-only production audit found zero non-deleted campaigns pinned to archived editions, so post-merge smoke must not manufacture one.

End the entry with:

```md
**Rollout:** merge through the protected PR flow, wait for a Ready production deployment of the merge SHA, and smoke the unaffected campaign-detail route plus `/api/health`. Rollback is a code revert; no migration, backfill, flag, environment, scheduler, or data cleanup is involved.
```

Do not mark the entry merged or launched in this branch.

- [ ] **Step 6: Align the CLAUDE.md freshness anchor**

Change the `Last Updated` anchor to:

```md
<!-- LAST_UPDATED_ISO:2026-07-31 LAST_UPDATED_SLUG:gh-242-retired-edition-warning-pr-ready -->
```

Replace its prose with a concise statement that GH #242 is implemented and locally verified but not merged or launched, that it adds a destructive detail-screen warning for retired pinned editions, and that it is read-only, flagless, and currently preventive because the audit found zero natural production records in that state.

Add one concise GH #242 line under `Current Status` with the same status and link it to the new changelog slug. Do not remove or rewrite unrelated current-state entries.

- [ ] **Step 7: Verify changelog freshness and formatting**

```bash
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
git diff --check
```

Expected: the freshness suite passes and `git diff --check` prints no errors.

- [ ] **Step 8: Review the final diff against the approved scope**

From the worktree root:

```bash
git status --short
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- \
  src/src/lib/assessments/edition-standing.ts \
  src/src/lib/assessments/campaign-detail.ts \
  src/src/components/assessments/CampaignDetail.tsx \
  src/src/__tests__/lib/assessments/edition-standing.test.ts \
  src/src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/src/__tests__/components/assessments/campaign-edition-tile.test.tsx \
  CLAUDE.md \
  plans/CHANGELOG.md
```

Verify that the diff contains no migration, flag, list-screen, lifecycle-write, report, scoring, or submission change.

- [ ] **Step 9: Commit source-of-truth evidence**

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(sot): record retired edition warning"
```

---

### Task 6: Review, publish, and verify the protected release

**Files:**

- Review: all branch changes against `origin/main`
- Update after launch in a separate source-of-truth follow-up: `CLAUDE.md`
- Update after launch in a separate source-of-truth follow-up: `plans/CHANGELOG.md`

- [ ] **Step 1: Invoke the required completion-review skill**

Use `superpowers:requesting-code-review` and resolve every substantive correctness or spec-compliance finding. Re-run the focused suite and any gate affected by a correction.

- [ ] **Step 2: Invoke verification-before-completion**

Use `superpowers:verification-before-completion` and independently confirm the branch is clean, commits are present, and every claimed gate has fresh output.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin codex/242-retired-edition-warning
```

- [ ] **Step 4: Open the implementation PR**

```bash
gh pr create \
  --base main \
  --head codex/242-retired-edition-warning \
  --title "feat(assessments): warn when a campaign edition is retired" \
  --body "Closes #242.

Adds a destructive retired-edition warning to the shared campaign-detail screen while preserving edition provenance and Wave EV fail-quiet behavior.

Validation and local visual-review evidence are recorded in plans/CHANGELOG.md under gh-242-retired-edition-warning-pr-ready.

No migration, flag, environment change, campaign-list change, or production fixture."
```

- [ ] **Step 5: Wait for protected checks and review**

```bash
gh pr checks --watch --fail-fast
gh pr view --json reviewDecision,mergeStateStatus,statusCheckRollup,url
```

Expected before merge: required Build and Migration Safety checks pass and the PR satisfies the repository's review and merge rules. Diagnose failures from their logs; do not bypass protection.

- [ ] **Step 6: Merge only after protection is satisfied**

```bash
gh pr merge --squash --delete-branch
```

Record the merge SHA from:

```bash
gh pr view --json mergedAt,mergeCommit,url
```

- [ ] **Step 7: Verify the production deployment**

From `src/`:

```bash
npx vercel ls
curl -sS https://scaling-up-platform-v2.vercel.app/api/health
```

Wait until the production deployment for the merge SHA is Ready. Verify `/api/health` is healthy and perform a read-only smoke of an existing campaign-detail route. Do not create, archive, unarchive, submit, or mutate a production record solely to expose the warning.

- [ ] **Step 8: Record launch truth in a separate docs follow-up**

On a new `codex/242-retired-edition-warning-launch-sot` branch from the deployed `origin/main`, prepend a launch entry with slug `gh-242-retired-edition-warning-launched`. Record the implementation PR number, merge SHA, Ready deployment identity, health response, read-only route smoke, zero-natural-fixture limitation, and unchanged rollback. Update the `CLAUDE.md` freshness anchor to the same slug, create the docs-only PR, satisfy its checks, and merge it.

- [ ] **Step 9: Close the issue and release the claim only after launch is recorded**

Verify GH #242 closed through `Closes #242`, then update the issue #261 claim-board comment with the merged PR and launch source-of-truth link. If automatic closure failed, close #242 with a comment linking the merged PR and launch evidence. Do not release the claim while implementation or release follow-up work remains.
