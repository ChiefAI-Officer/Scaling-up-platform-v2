# Campaign-List Edition Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every resolvable campaign's pinned assessment edition in the shared admin and coach lists, with actionable `Not latest` or `Retired` markers and no per-row edition queries.

**Architecture:** Extend both campaign queries with the same minimal pinned-version projection, then pass their results through one server-only batched resolver. The resolver deduplicates `(templateId, language)` pairs, loads all active edition candidates in one query, delegates standing decisions to `resolveEditionStanding`, and supplies a minimal nullable edition DTO to the existing shared mapper and list component.

**Tech Stack:** TypeScript 5, React 19, Next.js 16 App Router, Prisma 5, Jest 30, React Testing Library, Tailwind semantic color tokens, Playwright/browser visual inspection, ESLint, Turbopack

## Global Constraints

- Treat `docs/superpowers/specs/2026-07-31-campaign-list-edition-visibility-design.md` as authoritative.
- GH #242 owns `PinnedVersion.archivedAt`, `EditionStanding.pinnedRetired`, retired-vs-stale precedence, and the destructive retired treatment. Rebase onto its merged work before production code.
- Every resolvable row shows `Template name · Edition N` in both admin and coach lists, including mobile widths.
- DRAFT and ACTIVE stale rows show exactly `Not latest`.
- DRAFT and ACTIVE retired rows show exactly `Retired`; retirement suppresses the stale marker.
- CLOSED rows keep factual edition identity but suppress both actionable markers.
- Current rows receive no positive badge.
- Unknown, unpublished, malformed, missing, incomplete, or failed standing data renders the existing template-only row; never manufacture currency.
- Load active editions in one additional query for all unique `(templateId, language)` pairs. Never query per campaign or compare across languages.
- Use `activePublishedWhere` and preserve the complete exact sibling projection required by `resolveEditionStanding`.
- Do not add an edition filter, sort, repinning action, migration, feature flag, date, question content, sibling history, or unrelated list redesign.
- Complete desktop and 390px mobile visual review before production feature code.
- Preserve campaign filtering, grouping, metrics, links, ordering, actions, and the existing public-Quick-link behavior.
- Update `CLAUDE.md` and prepend `plans/CHANGELOG.md` in the implementation PR before push.
- Run commands from `src/` unless a step explicitly names the worktree root.
- Before push, run focused Jest, changed-file ESLint, migration safety, changelog freshness, `git diff --check`, and `CI=true npx next build --turbopack`.

---

## File map

- Create `docs/specs/v7.6/mockups/243-campaign-list-edition-visibility.html`
  - Owns the pre-code visual treatment for current, stale, retired, closed, and unresolved rows.
- Create `docs/specs/v7.6/mockups/243-campaign-list-edition-visibility-desktop.png`
  - Retains the approved desktop visual receipt.
- Create `docs/specs/v7.6/mockups/243-campaign-list-edition-visibility-mobile.png`
  - Retains the approved 390px visual receipt.
- Create `src/src/lib/assessments/campaign-list-editions.ts`
  - Owns pair deduplication, the single active-edition query, fail-quiet resolution, and the narrow Prisma bridge.
- Create `src/src/__tests__/lib/assessments/campaign-list-editions.test.ts`
  - Pins query count, predicates, projection, pair isolation, standing states, partial degradation, and thrown-query behavior.
- Modify `src/src/lib/assessments/campaign-list-items.ts`
  - Adds the pinned-version row shape and maps server standing into a minimal client DTO.
- Modify `src/src/__tests__/lib/assessments/campaign-list-items.test.ts`
  - Pins resolved/null DTO projection and proves timestamps and rows do not leak.
- Modify `src/src/app/(dashboard)/admin/assessments/campaigns/page.tsx`
  - Loads the pinned version, invokes the shared resolver once, and maps list items.
- Modify `src/src/__tests__/app/admin-campaigns-page.test.tsx`
  - Pins the admin projection and resolver integration.
- Modify `src/src/app/(portal)/portal/assessments/page.tsx`
  - Loads the same pinned projection and invokes the same resolver.
- Create `src/src/__tests__/app/portal-assessments-page.test.tsx`
  - Pins the coach projection and identical edition DTO behavior.
- Modify `src/src/components/assessments/CampaignsListWithFilter.tsx`
  - Defines the minimal list edition DTO and renders identity plus lifecycle-aware marker precedence.
- Modify `src/src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx`
  - Pins current, stale, retired, precedence, closed suppression, fallback, mobile visibility, and existing row behavior.
- Modify `src/src/__tests__/components/portal-assessments-status-filter.test.tsx`
  - Repairs the pre-existing incomplete fixtures and keeps filter regressions green with the new required DTO field.
- Modify `CLAUDE.md`
  - Advances the freshness anchor and records the PR-ready state briefly.
- Modify `plans/CHANGELOG.md`
  - Prepends scope, behavior, validation, rollout, and rollback evidence.

No Prisma schema, migration, API route, campaign-detail component, report, scoring, submission, or write-path file should change.

---

### Task 0: Integrate the GH #242 contract and establish the fixed point

**Files:**

- Inspect: `src/src/lib/assessments/edition-standing.ts`
- Inspect: `src/src/components/assessments/CampaignDetail.tsx`
- Verify: existing edition and campaign-list suites

**Interfaces:**

- Consumes from GH #242:

```ts
export interface PinnedVersion {
  templateId: string;
  versionNumber: number;
  publishedAt: Date | null;
  archivedAt: Date | null;
  language: string;
}

export interface EditionStanding {
  versionNumber: number;
  publishedAt: Date;
  pinnedRetired: boolean;
  newerEditionAvailable: boolean;
}
```

- Produces: a clean #243 branch rebased on the merged GH #242 contract.

- [ ] **Step 1: Confirm the isolated worktree**

From the worktree root:

```bash
git status --short --branch
git branch --show-current
```

Expected: `codex/243-campaign-list-edition-visibility`, with only committed design and plan work.

- [ ] **Step 2: Check GH #242 delivery state**

```bash
gh issue view 242 \
  --repo ChiefAI-Officer/Scaling-up-platform-v2 \
  --json state,closedAt,closedByPullRequestsReferences,url
gh pr list \
  --repo ChiefAI-Officer/Scaling-up-platform-v2 \
  --state all \
  --search "242 in:title,body" \
  --json number,state,headRefName,mergedAt,mergeCommit,url
```

Expected before production code: a merged GH #242 PR containing the exact
`archivedAt` and `pinnedRetired` contract above. If it is not merged, stop after
the visual artifact in Task 1 and the test-only fixture repair in Task 2. Run
Task 0 Step 6 before that repair, then return to Task 0 Step 3 after #242
merges. Do not enter Task 3, copy commits from #242's active worktree, or
reimplement its contract on #243.

- [ ] **Step 3: Rebase after GH #242 merges**

```bash
git fetch origin
git rebase origin/main
git status --short --branch
```

Expected: a clean branch above a main commit that contains GH #242.

- [ ] **Step 4: Verify the shared contract rather than assuming it**

```bash
rg -n "archivedAt|pinnedRetired|This edition has been retired" \
  src/src/lib/assessments/edition-standing.ts \
  src/src/components/assessments/CampaignDetail.tsx
```

Expected: `PinnedVersion.archivedAt` is required and nullable,
`EditionStanding.pinnedRetired` is required, and the detail marker uses the
destructive treatment. If the merged API differs, update this plan and obtain
review before feature code; do not add a compatibility alias.

- [ ] **Step 5: Run the fixed-point suites**

From `src/`:

```bash
npx jest \
  src/__tests__/lib/assessments/edition-standing.test.ts \
  src/__tests__/lib/assessments/campaign-list-items.test.ts \
  src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx \
  src/__tests__/app/admin-campaigns-page.test.tsx \
  --runInBand
```

Expected: all four suites pass.

- [ ] **Step 6: Reproduce the known adjacent fixture defect**

```bash
npx jest \
  src/__tests__/components/portal-assessments-status-filter.test.tsx \
  --runInBand
```

Expected before Task 2: six failures from missing `metrics`, plus React key
warnings from missing `organizationId`. Record the actual count; do not attribute
these fixed-point failures to #243.

---

### Task 1: Produce and approve the row-state visual before feature code

**Files:**

- Create: `docs/specs/v7.6/mockups/243-campaign-list-edition-visibility.html`
- Create: `docs/specs/v7.6/mockups/243-campaign-list-edition-visibility-desktop.png`
- Create: `docs/specs/v7.6/mockups/243-campaign-list-edition-visibility-mobile.png`

**Interfaces:**

- Consumes: the approved behavior matrix and GH #242 semantic colors.
- Produces: approved exact row composition and marker styling for Task 5.

- [ ] **Step 1: Create the focused visual fixture**

Create the HTML artifact with five rows and no application logic:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GH #243 campaign-list edition states</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --card: #fff;
      --text: #172033;
      --muted: #667085;
      --border: #e4e7ec;
      --primary: #3157a4;
      --warning: #a15c00;
      --warning-bg: #fff7e8;
      --warning-border: #f2c46d;
      --danger: #b42318;
      --danger-bg: #fff1f0;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.4 Inter, system-ui, sans-serif; }
    main { width: min(980px, calc(100% - 32px)); margin: 32px auto; }
    h1 { margin: 0 0 16px; font-size: 20px; }
    .list { overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--card); }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; padding: 12px 16px; border-top: 1px solid var(--border); }
    .row:first-child { border-top: 0; }
    .campaign { min-width: 170px; flex: 1 1 220px; }
    .name { display: block; color: var(--primary); font-weight: 600; }
    .alias, .identity, .opens, .view { color: var(--muted); font-size: 12px; }
    .identity { min-width: 0; overflow-wrap: anywhere; }
    .edition { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .badge { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; padding: 2px 6px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .stale { border-color: var(--warning-border); background: var(--warning-bg); color: var(--warning); }
    .retired { border-color: var(--danger); background: var(--danger-bg); color: var(--danger); }
    .status { background: #f2f4f7; color: #475467; }
    .view { margin-left: auto; color: var(--primary); }
    @media (max-width: 520px) {
      main { width: calc(100% - 20px); margin: 16px auto; }
      .row { align-items: flex-start; gap: 6px 10px; padding: 12px; }
      .campaign { flex-basis: 100%; }
      .identity { flex: 1 1 210px; }
      .view { margin-left: 0; }
    }
  </style>
</head>
<body>
<main>
  <h1>Campaign edition row states</h1>
  <div class="list">
    <div class="row"><div class="campaign"><span class="name">Q3 Planning</span><span class="alias">q3-planning</span></div><span class="identity">Quarterly Session Prep v2 · <span class="edition">Edition 3</span></span><span class="badge status">Active</span><span class="opens">Opens Jul 31, 2026</span><span class="view">View</span></div>
    <div class="row"><div class="campaign"><span class="name">Leadership Pulse</span><span class="alias">leadership-pulse</span></div><span class="identity">Leadership Vision Alignment · <span class="edition">Edition 2</span></span><span class="badge stale">Not latest</span><span class="badge status">Draft</span><span class="opens">Opens Aug 4, 2026</span><span class="view">View</span></div>
    <div class="row"><div class="campaign"><span class="name">Legacy Habits</span><span class="alias">legacy-habits</span></div><span class="identity">Rockefeller Habits · <span class="edition">Edition 1</span></span><span class="badge retired">Retired</span><span class="badge status">Active</span><span class="opens">Opens Jul 1, 2026</span><span class="view">View</span></div>
    <div class="row"><div class="campaign"><span class="name">2024 Imported Round</span><span class="alias">imported-2024</span></div><span class="identity">Scaling Up Full · <span class="edition">Edition 1</span></span><span class="badge status">Closed</span><span class="opens">Opened Dec 1, 2024</span><span class="view">View</span></div>
    <div class="row"><div class="campaign"><span class="name">Unresolved Fixture</span><span class="alias">unresolved</span></div><span class="identity">Five Dysfunctions</span><span class="badge status">Active</span><span class="opens">Opens Aug 8, 2026</span><span class="view">View</span></div>
  </div>
</main>
</body>
</html>
```

- [ ] **Step 2: Render desktop and mobile receipts**

Serve the mockup from the worktree root:

```bash
python3 -m http.server 4173 --directory docs/specs/v7.6/mockups
```

Open
`http://127.0.0.1:4173/243-campaign-list-edition-visibility.html` with the
browser-control skill. Capture:

- `243-campaign-list-edition-visibility-desktop.png` at 1440 × 900;
- `243-campaign-list-edition-visibility-mobile.png` at 390 × 844.

- [ ] **Step 3: Inspect the five exact states**

Confirm from both receipts:

- template and `Edition N` remain visible;
- no row creates horizontal overflow;
- `Edition N` does not split internally;
- retired is stronger than stale and both use visible text;
- closed retains identity and has no edition warning;
- unresolved retains template-only presentation;
- status, opening date, and View action remain scannable.

- [ ] **Step 4: Stop for explicit visual approval**

Present both receipts to the user. Do not edit production TypeScript until the
user approves the desktop and mobile treatment.

- [ ] **Step 5: Commit the approved visual artifact**

```bash
git add \
  docs/specs/v7.6/mockups/243-campaign-list-edition-visibility.html \
  docs/specs/v7.6/mockups/243-campaign-list-edition-visibility-desktop.png \
  docs/specs/v7.6/mockups/243-campaign-list-edition-visibility-mobile.png
git commit -m "docs(assessments): approve campaign edition row states (#243)"
```

---

### Task 2: Repair the existing campaign-filter fixtures

**Files:**

- Modify: `src/src/__tests__/components/portal-assessments-status-filter.test.tsx:13-50,107-117`

**Interfaces:**

- Consumes: required `CampaignListItem.organizationId` and `CampaignListItem.metrics`.
- Produces: a green pre-feature filter suite with complete fixtures.

- [ ] **Step 1: Re-run the suite and verify the fixed-point failure**

```bash
npx jest \
  src/__tests__/components/portal-assessments-status-filter.test.tsx \
  --runInBand
```

Expected: the recorded missing-`metrics` failures and missing-key warnings.

- [ ] **Step 2: Add one complete zero-metrics fixture**

After the imports, add:

```ts
const zeroMetrics = {
  total: 0,
  new: 0,
  invited: 0,
  started: 0,
  completed: 0,
  revoked: 0,
};
```

Add `organizationId` and `metrics` to each item:

```ts
organizationId: "org-acme",
organizationName: "Acme",
metrics: zeroMetrics,
```

Use `organizationId: "org-beta"` for the Beta rows. Add the same two required
fields to `onlyDrafts`, using `organizationId: "org-acme"`.

- [ ] **Step 3: Run the repaired suite**

```bash
npx jest \
  src/__tests__/components/portal-assessments-status-filter.test.tsx \
  --runInBand
```

Expected: all six tests pass and no missing-key warning is emitted.

- [ ] **Step 4: Commit the test-only repair**

```bash
git add src/src/__tests__/components/portal-assessments-status-filter.test.tsx
git commit -m "test(assessments): repair campaign list fixtures"
```

---

### Task 3: Resolve all campaign edition standings in one server query

**Files:**

- Create: `src/src/__tests__/lib/assessments/campaign-list-editions.test.ts`
- Create: `src/src/lib/assessments/campaign-list-editions.ts`

**Interfaces:**

- Consumes:

```ts
export interface CampaignListEditionSource {
  id: string;
  version: PinnedVersion | null;
}

export interface CampaignListEditionDb {
  assessmentTemplateVersion: {
    findMany(args: CampaignListEditionFindManyArgs): Promise<SiblingVersion[]>;
  };
}
```

- Produces:

```ts
export type CampaignEditionStandingMap =
  ReadonlyMap<string, EditionStanding | null>;

export async function resolveCampaignListEditions(
  db: CampaignListEditionDb,
  campaigns: readonly CampaignListEditionSource[],
): Promise<CampaignEditionStandingMap>;

export function asCampaignListEditionDb(
  prisma: PrismaClient,
): CampaignListEditionDb;
```

- [ ] **Step 1: Write the failing resolver tests**

Create a narrow mock DB and fixtures:

```ts
import { activePublishedWhere } from "@/lib/assessments/active-version";
import {
  resolveCampaignListEditions,
  type CampaignListEditionDb,
} from "@/lib/assessments/campaign-list-editions";
import type { PinnedVersion, SiblingVersion } from "@/lib/assessments/edition-standing";

function pinned(
  templateId: string,
  versionNumber: number,
  language = "enUS",
  archivedAt: Date | null = null,
): PinnedVersion {
  return {
    templateId,
    versionNumber,
    language,
    publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    archivedAt,
  };
}

function candidate(
  templateId: string,
  versionNumber: number,
  language = "enUS",
): SiblingVersion {
  return {
    templateId,
    versionNumber,
    language,
    publishedAt: new Date("2026-07-02T00:00:00.000Z"),
    archivedAt: null,
  };
}

function buildDb(rows: SiblingVersion[] = []): CampaignListEditionDb {
  return {
    assessmentTemplateVersion: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
}
```

Add assertions for:

```ts
it("deduplicates exact pairs and loads every pair once", async () => {
  const db = buildDb([
    candidate("tpl-a", 2),
    candidate("tpl-b", 4, "es"),
  ]);
  await resolveCampaignListEditions(db, [
    { id: "a1", version: pinned("tpl-a", 2) },
    { id: "a2", version: pinned("tpl-a", 2) },
    { id: "b1", version: pinned("tpl-b", 3, "es") },
  ]);

  expect(db.assessmentTemplateVersion.findMany).toHaveBeenCalledTimes(1);
  expect(
    (db.assessmentTemplateVersion.findMany as jest.Mock).mock.calls[0][0],
  ).toEqual({
    where: {
      ...activePublishedWhere,
      OR: [
        { templateId: "tpl-a", language: "enUS" },
        { templateId: "tpl-b", language: "es" },
      ],
    },
    select: {
      templateId: true,
      versionNumber: true,
      language: true,
      publishedAt: true,
      archivedAt: true,
    },
  });
});

it("reports current, stale, and retired pins through the shared contract", async () => {
  const retiredAt = new Date("2026-07-30T00:00:00.000Z");
  const db = buildDb([
    candidate("tpl-current", 3),
    candidate("tpl-stale", 2),
    candidate("tpl-stale", 4),
    candidate("tpl-retired", 5),
  ]);
  const result = await resolveCampaignListEditions(db, [
    { id: "current", version: pinned("tpl-current", 3) },
    { id: "stale", version: pinned("tpl-stale", 2) },
    { id: "retired", version: pinned("tpl-retired", 3, "enUS", retiredAt) },
  ]);

  expect(result.get("current")).toMatchObject({
    versionNumber: 3,
    pinnedRetired: false,
    newerEditionAvailable: false,
  });
  expect(result.get("stale")).toMatchObject({
    versionNumber: 2,
    pinnedRetired: false,
    newerEditionAvailable: true,
  });
  expect(result.get("retired")).toMatchObject({
    versionNumber: 3,
    pinnedRetired: true,
    newerEditionAvailable: true,
  });
});
```

Add the isolation, degradation, and thrown-query cases:

```ts
it("isolates candidates by exact template and language", async () => {
  const db = buildDb([
    candidate("tpl-a", 2, "enUS"),
    candidate("tpl-a", 5, "es"),
  ]);
  const result = await resolveCampaignListEditions(db, [
    { id: "english", version: pinned("tpl-a", 2, "enUS") },
    { id: "spanish", version: pinned("tpl-a", 3, "es") },
  ]);

  expect(result.get("english")?.newerEditionAvailable).toBe(false);
  expect(result.get("spanish")?.newerEditionAvailable).toBe(true);
});

it("does not query when every pinned version is invalid", async () => {
  const db = buildDb();
  const unpublished = {
    ...pinned("tpl-a", 1),
    publishedAt: null,
  };
  const nonFinite = {
    ...pinned("tpl-b", 1),
    versionNumber: Number.NaN,
  };
  const result = await resolveCampaignListEditions(db, [
    { id: "missing", version: null },
    { id: "unpublished", version: unpublished },
    { id: "non-finite", version: nonFinite },
  ]);

  expect(db.assessmentTemplateVersion.findMany).not.toHaveBeenCalled();
  expect([...result.entries()]).toEqual([
    ["missing", null],
    ["unpublished", null],
    ["non-finite", null],
  ]);
});

it("degrades only an incomplete nonretired group", async () => {
  const retiredAt = new Date("2026-07-30T00:00:00.000Z");
  const db = buildDb([candidate("tpl-good", 2)]);
  const result = await resolveCampaignListEditions(db, [
    { id: "good", version: pinned("tpl-good", 2) },
    { id: "missing-active-group", version: pinned("tpl-missing", 1) },
    {
      id: "retired-without-own-active-row",
      version: pinned("tpl-retired", 1, "enUS", retiredAt),
    },
  ]);

  expect(result.get("good")).toMatchObject({
    pinnedRetired: false,
    newerEditionAvailable: false,
  });
  expect(result.get("missing-active-group")).toBeNull();
  expect(result.get("retired-without-own-active-row")).toMatchObject({
    versionNumber: 1,
    pinnedRetired: true,
    newerEditionAvailable: false,
  });
});

it("logs once without identifiers and returns all-null on query failure", async () => {
  const error = new TypeError("connection detail must not be logged");
  const db = buildDb();
  (db.assessmentTemplateVersion.findMany as jest.Mock).mockRejectedValue(error);
  const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  const result = await resolveCampaignListEditions(db, [
    { id: "a", version: pinned("tpl-a", 1) },
    { id: "b", version: pinned("tpl-b", 2) },
  ]);

  expect([...result.entries()]).toEqual([
    ["a", null],
    ["b", null],
  ]);
  expect(consoleSpy).toHaveBeenCalledTimes(1);
  expect(consoleSpy).toHaveBeenCalledWith(
    "[campaign-list-editions] lookup failed",
    { pairCount: 2, errorName: "TypeError" },
  );
  expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("tpl-a");
  expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(
    "connection detail",
  );
  consoleSpy.mockRestore();
});
```

- [ ] **Step 2: Run the new suite and verify RED**

```bash
npx jest \
  src/__tests__/lib/assessments/campaign-list-editions.test.ts \
  --runInBand
```

Expected: FAIL because `campaign-list-editions.ts` does not exist.

- [ ] **Step 3: Implement the narrow resolver**

Create `campaign-list-editions.ts` with:

```ts
import type { PrismaClient } from "@prisma/client";
import { activePublishedWhere } from "./active-version";
import {
  resolveEditionStanding,
  type EditionStanding,
  type PinnedVersion,
  type SiblingVersion,
} from "./edition-standing";

export interface CampaignListEditionSource {
  id: string;
  version: PinnedVersion | null;
}

export interface CampaignListEditionFindManyArgs {
  where: {
    publishedAt: { not: null };
    archivedAt: null;
    OR: Array<{ templateId: string; language: string }>;
  };
  select: {
    templateId: true;
    versionNumber: true;
    language: true;
    publishedAt: true;
    archivedAt: true;
  };
}

export interface CampaignListEditionDb {
  assessmentTemplateVersion: {
    findMany(
      args: CampaignListEditionFindManyArgs,
    ): Promise<SiblingVersion[]>;
  };
}

export type CampaignEditionStandingMap =
  ReadonlyMap<string, EditionStanding | null>;

function pairKey(templateId: string, language: string): string {
  return JSON.stringify([templateId, language]);
}

function isResolvablePinned(
  version: PinnedVersion | null,
): version is PinnedVersion {
  return (
    version != null &&
    version.publishedAt != null &&
    Number.isFinite(version.versionNumber)
  );
}

export async function resolveCampaignListEditions(
  db: CampaignListEditionDb,
  campaigns: readonly CampaignListEditionSource[],
): Promise<CampaignEditionStandingMap> {
  const standings = new Map<string, EditionStanding | null>(
    campaigns.map((campaign) => [campaign.id, null]),
  );
  const pairs = new Map<
    string,
    { templateId: string; language: string }
  >();

  for (const campaign of campaigns) {
    if (!isResolvablePinned(campaign.version)) continue;
    const pair = {
      templateId: campaign.version.templateId,
      language: campaign.version.language,
    };
    pairs.set(pairKey(pair.templateId, pair.language), pair);
  }

  const pairList = [...pairs.values()];
  if (pairList.length === 0) return standings;

  let candidates: SiblingVersion[];
  try {
    candidates = await db.assessmentTemplateVersion.findMany({
      where: {
        ...activePublishedWhere,
        OR: pairList,
      },
      select: {
        templateId: true,
        versionNumber: true,
        language: true,
        publishedAt: true,
        archivedAt: true,
      },
    });
  } catch (error) {
    console.error("[campaign-list-editions] lookup failed", {
      pairCount: pairList.length,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return standings;
  }

  const candidatesByPair = new Map<string, SiblingVersion[]>();
  for (const candidate of candidates) {
    const key = pairKey(candidate.templateId, candidate.language);
    const group = candidatesByPair.get(key) ?? [];
    group.push(candidate);
    candidatesByPair.set(key, group);
  }

  for (const campaign of campaigns) {
    const pinned = campaign.version;
    if (!isResolvablePinned(pinned)) continue;
    const group =
      candidatesByPair.get(pairKey(pinned.templateId, pinned.language)) ?? [];
    const activeSetContainsPinned = group.some(
      (candidate) => candidate.versionNumber === pinned.versionNumber,
    );
    if (pinned.archivedAt == null && !activeSetContainsPinned) continue;
    standings.set(
      campaign.id,
      resolveEditionStanding(pinned, group),
    );
  }

  return standings;
}

export function asCampaignListEditionDb(
  prisma: PrismaClient,
): CampaignListEditionDb {
  void prisma.assessmentTemplateVersion;
  return prisma as unknown as CampaignListEditionDb;
}
```

The `activeSetContainsPinned` check is load-bearing: the batch query requests
the complete active set, so a nonretired published pin must appear in its group.
If it does not, the result is incomplete and must remain unknown rather than
becoming reassuring `newerEditionAvailable: false`. Retired pins are expected
to be absent because `activePublishedWhere` excludes them.

- [ ] **Step 4: Run the resolver suite**

```bash
npx jest \
  src/__tests__/lib/assessments/campaign-list-editions.test.ts \
  --runInBand
```

Expected: all resolver tests pass with one query for valid pairs, zero queries
for no pairs, and null-on-error behavior.

- [ ] **Step 5: Run scoped ESLint**

```bash
npx eslint \
  src/lib/assessments/campaign-list-editions.ts \
  src/__tests__/lib/assessments/campaign-list-editions.test.ts
```

Expected: exit 0.

- [ ] **Step 6: Commit the batch resolver**

```bash
git add \
  src/src/lib/assessments/campaign-list-editions.ts \
  src/src/__tests__/lib/assessments/campaign-list-editions.test.ts
git commit -m "feat(assessments): batch campaign edition standing (#243)"
```

---

### Task 4: Project and map the same edition data on both pages

**Files:**

- Modify: `src/src/lib/assessments/campaign-list-items.ts:17-37,61-71`
- Modify: `src/src/__tests__/lib/assessments/campaign-list-items.test.ts`
- Modify: `src/src/app/(dashboard)/admin/assessments/campaigns/page.tsx:19-56`
- Modify: `src/src/__tests__/app/admin-campaigns-page.test.tsx`
- Modify: `src/src/app/(portal)/portal/assessments/page.tsx:13-87`
- Create: `src/src/__tests__/app/portal-assessments-page.test.tsx`

**Interfaces:**

- Consumes: `CampaignEditionStandingMap` from Task 3.
- Produces:

```ts
export interface CampaignListEdition {
  versionNumber: number;
  newerEditionAvailable: boolean;
  pinnedRetired: boolean;
}

export function toCampaignListItems(
  campaigns: CampaignListRow[],
  editionsByCampaignId: CampaignEditionStandingMap,
): CampaignListItem[];
```

- [ ] **Step 1: Add failing mapper assertions**

Extend the `row()` fixture with:

```ts
version: {
  templateId: "tpl-1",
  versionNumber: 3,
  publishedAt: new Date("2026-07-01T00:00:00.000Z"),
  archivedAt: null,
  language: "enUS",
},
```

Pass a standing map to every existing `toCampaignListItems` call. Add:

```ts
it("projects only the client-safe edition facts", () => {
  const publishedAt = new Date("2026-07-01T00:00:00.000Z");
  const [item] = toCampaignListItems(
    [row()],
    new Map([
      [
        "c1",
        {
          versionNumber: 3,
          publishedAt,
          newerEditionAvailable: true,
          pinnedRetired: false,
        },
      ],
    ]),
  );

  expect(item.edition).toEqual({
    versionNumber: 3,
    newerEditionAvailable: true,
    pinnedRetired: false,
  });
  expect(item.edition).not.toHaveProperty("publishedAt");
  expect(item.edition).not.toHaveProperty("language");
});

it("maps unknown standing to an explicit null edition", () => {
  const [item] = toCampaignListItems([row()], new Map([["c1", null]]));
  expect(item.edition).toBeNull();
});
```

- [ ] **Step 2: Run the mapper suite and verify RED**

```bash
npx jest \
  src/__tests__/lib/assessments/campaign-list-items.test.ts \
  --runInBand
```

Expected: FAIL because the mapper has no standing-map argument or edition DTO.

- [ ] **Step 3: Add the mapper boundary**

In `CampaignsListWithFilter.tsx`, add:

```ts
export interface CampaignListEdition {
  versionNumber: number;
  newerEditionAvailable: boolean;
  pinnedRetired: boolean;
}
```

Add `edition: CampaignListEdition | null` to `CampaignListItem`.

In `campaign-list-items.ts`, import `PinnedVersion` and
`CampaignEditionStandingMap`, add `version: PinnedVersion` to
`CampaignListRow`, and change the mapper signature to accept the map.

Before returning each item:

```ts
const standing = editionsByCampaignId.get(c.id) ?? null;
const edition = standing
  ? {
      versionNumber: standing.versionNumber,
      newerEditionAvailable: standing.newerEditionAvailable,
      pinnedRetired: standing.pinnedRetired,
    }
  : null;
```

Add `edition` to the returned item.

- [ ] **Step 4: Run the mapper suite**

```bash
npx jest \
  src/__tests__/lib/assessments/campaign-list-items.test.ts \
  --runInBand
```

Expected: all mapper tests pass.

- [ ] **Step 5: Add failing admin-page integration coverage**

Split the DB mocks into `mockCampaignFindMany` and `mockVersionFindMany`, and
expose both delegates:

```ts
jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: {
      findMany: (...args: unknown[]) => mockCampaignFindMany(...args),
    },
    assessmentTemplateVersion: {
      findMany: (...args: unknown[]) => mockVersionFindMany(...args),
    },
  },
}));
```

For the data test, return one complete campaign row with a pinned version and
return that version from `mockVersionFindMany`. Assert:

```ts
expect(
  (mockCampaignFindMany.mock.calls[0][0] as {
    include: Record<string, unknown>;
  }).include,
).toMatchObject({
  version: {
    select: {
      templateId: true,
      versionNumber: true,
      language: true,
      publishedAt: true,
      archivedAt: true,
    },
  },
});
expect(mockVersionFindMany).toHaveBeenCalledTimes(1);
expect(listProps).toMatchObject({
  detailBasePath: "/admin/assessments/campaigns",
  campaigns: [
    expect.objectContaining({
      id: "c1",
      edition: {
        versionNumber: 3,
        newerEditionAvailable: false,
        pinnedRetired: false,
      },
    }),
  ],
});
```

- [ ] **Step 6: Create failing coach-page integration coverage**

Create `portal-assessments-page.test.tsx`:

```tsx
import React from "react";
import { render } from "@testing-library/react";

const mockRequireCoach = jest.fn();
jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: (...args: unknown[]) => mockRequireCoach(...args),
}));

const mockCampaignFindFirst = jest.fn();
const mockCampaignFindMany = jest.fn();
const mockVersionFindMany = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: {
      findFirst: (...args: unknown[]) => mockCampaignFindFirst(...args),
      findMany: (...args: unknown[]) => mockCampaignFindMany(...args),
    },
    assessmentTemplateVersion: {
      findMany: (...args: unknown[]) => mockVersionFindMany(...args),
    },
  },
}));

jest.mock("@/lib/assessments/wave-83-flags", () => ({
  isReferredResultsEnabled: jest.fn(() => true),
}));
jest.mock("@/components/ui/animated", () => ({
  FadeUp: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/ui/copy-url-button", () => ({
  CopyUrlButton: () => null,
}));

let listProps: Record<string, unknown> | null = null;
jest.mock("@/components/assessments/CampaignsListWithFilter", () => ({
  CampaignsListWithFilter: (props: Record<string, unknown>) => {
    listProps = props;
    return null;
  },
}));

import CoachAssessmentsPage from "@/app/(portal)/portal/assessments/page";

const pinned = {
  templateId: "tpl-1",
  versionNumber: 3,
  language: "enUS",
  publishedAt: new Date("2026-07-01T00:00:00.000Z"),
  archivedAt: null,
};

const campaign = {
  id: "c1",
  name: "Acme Q3",
  alias: "acme-q3",
  status: "ACTIVE",
  openAt: new Date("2026-07-31T00:00:00.000Z"),
  template: { id: "tpl-1", name: "QSP v2" },
  version: pinned,
  organization: { id: "org-1", name: "Acme" },
  participants: [],
  invitations: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  listProps = null;
  mockRequireCoach.mockResolvedValue({
    coach: { id: "coach-1", email: "coach@example.com" },
  });
  mockCampaignFindFirst.mockResolvedValue(null);
  mockCampaignFindMany.mockResolvedValue([campaign]);
  mockVersionFindMany.mockResolvedValue([pinned]);
});

it("projects and resolves the same edition DTO as the admin list", async () => {
  render(await CoachAssessmentsPage());

  expect(
    (mockCampaignFindMany.mock.calls[0][0] as {
      include: Record<string, unknown>;
    }).include,
  ).toMatchObject({
    version: {
      select: {
        templateId: true,
        versionNumber: true,
        language: true,
        publishedAt: true,
        archivedAt: true,
      },
    },
  });
  expect(mockVersionFindMany).toHaveBeenCalledTimes(1);
  expect(listProps).toMatchObject({
    campaigns: [
      expect.objectContaining({
        id: "c1",
        edition: {
          versionNumber: 3,
          newerEditionAvailable: false,
          pinnedRetired: false,
        },
      }),
    ],
  });
  expect(mockCampaignFindFirst).not.toHaveBeenCalled();
});
```

The final assertion preserves #83's Quick-link ownership behavior while its
flag is enabled.

- [ ] **Step 7: Run the two page suites and verify RED**

```bash
npx jest \
  src/__tests__/app/admin-campaigns-page.test.tsx \
  src/__tests__/app/portal-assessments-page.test.tsx \
  --runInBand
```

Expected: both fail because their page queries omit `version` and do not invoke
the resolver.

- [ ] **Step 8: Wire the admin page**

Import:

```ts
import {
  asCampaignListEditionDb,
  resolveCampaignListEditions,
} from "@/lib/assessments/campaign-list-editions";
```

Add this exact include beside `template`:

```ts
version: {
  select: {
    templateId: true,
    versionNumber: true,
    language: true,
    publishedAt: true,
    archivedAt: true,
  },
},
```

Replace the mapper call with:

```ts
const editionsByCampaignId = await resolveCampaignListEditions(
  asCampaignListEditionDb(db),
  campaigns,
);
const items: CampaignListItem[] = toCampaignListItems(
  campaigns,
  editionsByCampaignId,
);
```

- [ ] **Step 9: Wire the coach page identically**

Add the same import, exact `version` select, resolver call, and two-argument
mapper call to the coach page. Do not alter the public Quick-link query or
referred-results flag branch.

- [ ] **Step 10: Run mapper and page integration suites**

```bash
npx jest \
  src/__tests__/lib/assessments/campaign-list-items.test.ts \
  src/__tests__/app/admin-campaigns-page.test.tsx \
  src/__tests__/app/portal-assessments-page.test.tsx \
  src/__tests__/components/assessments/referred-results-list.test.tsx \
  --runInBand
```

Expected: all four suites pass. Admin and coach hand the same edition DTO to the
shared component, and the existing #83 ownership tests remain green.

- [ ] **Step 11: Commit the server-to-list integration**

```bash
git add \
  src/src/lib/assessments/campaign-list-items.ts \
  src/src/__tests__/lib/assessments/campaign-list-items.test.ts \
  'src/src/app/(dashboard)/admin/assessments/campaigns/page.tsx' \
  src/src/__tests__/app/admin-campaigns-page.test.tsx \
  'src/src/app/(portal)/portal/assessments/page.tsx' \
  src/src/__tests__/app/portal-assessments-page.test.tsx
git commit -m "feat(assessments): project campaign editions into lists (#243)"
```

---

### Task 5: Render edition identity and lifecycle-aware markers

**Files:**

- Modify: `src/src/components/assessments/CampaignsListWithFilter.tsx:23-33,86-124`
- Modify: `src/src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx`
- Modify: `src/src/__tests__/components/portal-assessments-status-filter.test.tsx`

**Interfaces:**

- Consumes: `CampaignListItem.edition: CampaignListEdition | null`.
- Produces: test IDs
  `campaign-edition-identity-{id}`, `campaign-edition-stale-{id}`, and
  `campaign-edition-retired-{id}`.

- [ ] **Step 1: Make every existing component fixture explicit**

In `makeCampaign`, add:

```ts
edition: null,
```

Add `edition: null` to every direct `CampaignListItem` literal in
`portal-assessments-status-filter.test.tsx`.

- [ ] **Step 2: Add failing identity and marker tests**

Append a `CampaignsListWithFilter — edition standing` block with:

```tsx
function editionCampaign(
  status: CampaignListItem["status"],
  edition: CampaignListItem["edition"],
): CampaignListItem {
  return makeCampaign({
    id: `${String(status).toLowerCase()}-edition`,
    organizationId: "org-edition",
    organizationName: "Edition Org",
    status,
    edition,
  });
}

const currentEdition = {
  versionNumber: 3,
  newerEditionAvailable: false,
  pinnedRetired: false,
};

it("shows persistent edition identity without a positive current badge", () => {
  render(
    <CampaignsListWithFilter
      campaigns={[editionCampaign("ACTIVE", currentEdition)]}
    />,
  );
  const identity = screen.getByTestId("campaign-edition-identity-active-edition");
  expect(identity).toHaveTextContent("QSP v2 · Edition 3");
  expect(identity).not.toHaveClass("hidden");
  expect(identity.className).not.toContain("sm:inline");
  expect(screen.queryByText("Current")).not.toBeInTheDocument();
});

it("shows Not latest for actionable stale pins", () => {
  render(
    <CampaignsListWithFilter
      campaigns={[
        editionCampaign("DRAFT", {
          ...currentEdition,
          newerEditionAvailable: true,
        }),
      ]}
    />,
  );
  expect(
    screen.getByTestId("campaign-edition-stale-draft-edition"),
  ).toHaveTextContent("Not latest");
});

it("gives Retired precedence over Not latest", () => {
  render(
    <CampaignsListWithFilter
      campaigns={[
        editionCampaign("ACTIVE", {
          versionNumber: 2,
          newerEditionAvailable: true,
          pinnedRetired: true,
        }),
      ]}
    />,
  );
  expect(
    screen.getByTestId("campaign-edition-retired-active-edition"),
  ).toHaveTextContent("Retired");
  expect(
    screen.queryByTestId("campaign-edition-stale-active-edition"),
  ).not.toBeInTheDocument();
});

it("keeps closed identity but suppresses both warnings", () => {
  render(
    <CampaignsListWithFilter
      campaigns={[
        editionCampaign("CLOSED", {
          versionNumber: 1,
          newerEditionAvailable: true,
          pinnedRetired: true,
        }),
      ]}
    />,
  );
  expect(
    screen.getByTestId("campaign-edition-identity-closed-edition"),
  ).toHaveTextContent("Edition 1");
  expect(screen.queryByText("Retired")).not.toBeInTheDocument();
  expect(screen.queryByText("Not latest")).not.toBeInTheDocument();
});

it("suppresses actionable warnings for an unrecognized lifecycle state", () => {
  render(
    <CampaignsListWithFilter
      campaigns={[
        editionCampaign("PAUSED", {
          versionNumber: 2,
          newerEditionAvailable: true,
          pinnedRetired: true,
        }),
      ]}
    />,
  );
  expect(screen.getByText("Edition 2")).toBeInTheDocument();
  expect(screen.queryByText("Retired")).not.toBeInTheDocument();
  expect(screen.queryByText("Not latest")).not.toBeInTheDocument();
});

it("preserves template-only presentation for unknown standing", () => {
  render(
    <CampaignsListWithFilter
      campaigns={[editionCampaign("ACTIVE", null)]}
    />,
  );
  expect(
    screen.getByTestId("campaign-edition-identity-active-edition"),
  ).toHaveTextContent("QSP v2");
  expect(
    screen.getByTestId("campaign-edition-identity-active-edition"),
  ).not.toHaveTextContent("Edition");
});
```

Also assert the stale marker contains
`border-warning/30 bg-warning/10 text-warning` and the retired marker contains
`border-destructive bg-destructive/10 text-destructive`, matching the approved
mockup and GH #242 semantics.

- [ ] **Step 3: Run the two component suites and verify RED**

```bash
npx jest \
  src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx \
  src/__tests__/components/portal-assessments-status-filter.test.tsx \
  --runInBand
```

Expected: the new identity and marker test IDs are absent.

- [ ] **Step 4: Replace the hidden template span with persistent identity**

Replace the current `hidden sm:inline` template span with:

```tsx
<span
  className="min-w-0 max-w-full text-xs text-muted-foreground break-words"
  data-testid={`campaign-edition-identity-${c.id}`}
>
  {c.templateName}
  {c.edition ? (
    <>
      <span aria-hidden="true"> &middot; </span>
      <span className="whitespace-nowrap tabular-nums">
        Edition {c.edition.versionNumber}
      </span>
    </>
  ) : null}
</span>
```

- [ ] **Step 5: Add actionable marker precedence**

Inside `campaigns.map`, add this beside `isDraftNoInvites`:

```ts
const canShowEditionWarning =
  c.status === "DRAFT" || c.status === "ACTIVE";
```

Immediately after the identity, add:

```tsx
{canShowEditionWarning && c.edition?.pinnedRetired ? (
  <span
    className="inline-flex items-center rounded-md border border-destructive bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive"
    data-testid={`campaign-edition-retired-${c.id}`}
  >
    Retired
  </span>
) : canShowEditionWarning && c.edition?.newerEditionAvailable ? (
  <span
    className="inline-flex items-center rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-xs font-semibold text-warning"
    data-testid={`campaign-edition-stale-${c.id}`}
  >
    Not latest
  </span>
) : null}
```

Do not add a `Current` branch, an icon, a tooltip, or an upgrade action.

- [ ] **Step 6: Run all shared-list component regressions**

```bash
npx jest \
  src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx \
  src/__tests__/components/portal-assessments-status-filter.test.tsx \
  --runInBand
```

Expected: all tests pass, including existing grouping, counts, filtering,
metrics, empty-state, and detail-link assertions.

- [ ] **Step 7: Compare implementation to the approved receipts**

Render the actual component with the five fixture states at desktop and 390px
mobile widths. Confirm it matches the approved hierarchy and has no overflow.
If production markup needs a layout adjustment, update the mockup receipts and
obtain renewed visual approval before committing.

- [ ] **Step 8: Run changed-file ESLint**

```bash
npx eslint \
  src/components/assessments/CampaignsListWithFilter.tsx \
  src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx \
  src/__tests__/components/portal-assessments-status-filter.test.tsx
```

Expected: exit 0.

- [ ] **Step 9: Commit the shared presentation**

```bash
git add \
  src/src/components/assessments/CampaignsListWithFilter.tsx \
  src/src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx \
  src/src/__tests__/components/portal-assessments-status-filter.test.tsx
git commit -m "feat(assessments): show edition standing in campaign lists (#243)"
```

---

### Task 6: Run release gates and record the implementation source of truth

**Files:**

- Modify: `CLAUDE.md:21`
- Modify: `plans/CHANGELOG.md:8`
- Test: `src/src/__tests__/lint/changelog-freshness.test.ts`

**Interfaces:**

- Consumes: Tasks 0-5 after approved visual review.
- Produces: aligned freshness slug
  `gh-243-campaign-list-edition-visibility-pr-ready`.

- [ ] **Step 1: Run the complete focused regression set**

From `src/`:

```bash
npx jest \
  src/__tests__/lib/assessments/edition-standing.test.ts \
  src/__tests__/lib/assessments/campaign-list-editions.test.ts \
  src/__tests__/lib/assessments/campaign-list-items.test.ts \
  src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx \
  src/__tests__/components/portal-assessments-status-filter.test.tsx \
  src/__tests__/app/admin-campaigns-page.test.tsx \
  src/__tests__/app/portal-assessments-page.test.tsx \
  src/__tests__/components/assessments/referred-results-list.test.tsx \
  --runInBand
```

Expected: all eight suites pass.

- [ ] **Step 2: Run changed-file ESLint**

```bash
npx eslint \
  src/lib/assessments/campaign-list-editions.ts \
  src/lib/assessments/campaign-list-items.ts \
  'src/app/(dashboard)/admin/assessments/campaigns/page.tsx' \
  'src/app/(portal)/portal/assessments/page.tsx' \
  src/components/assessments/CampaignsListWithFilter.tsx \
  src/__tests__/lib/assessments/campaign-list-editions.test.ts \
  src/__tests__/lib/assessments/campaign-list-items.test.ts \
  src/__tests__/app/admin-campaigns-page.test.tsx \
  src/__tests__/app/portal-assessments-page.test.tsx \
  src/__tests__/components/assessments/CampaignsListWithFilter.test.tsx \
  src/__tests__/components/portal-assessments-status-filter.test.tsx
```

Expected: exit 0.

- [ ] **Step 3: Run migration safety**

```bash
node scripts/check-migration-safety.mjs
```

Expected: exit 0 and no migration added by #243.

- [ ] **Step 4: Run the Turbopack production build**

```bash
CI=true npx next build --turbopack
```

Expected: exit 0 after compilation, type checking, and route generation.

- [ ] **Step 5: Advance the CLAUDE.md anchor**

Replace the `Last Updated` row with:

```md
| **Last Updated** | <!-- LAST_UPDATED_ISO:2026-07-31 LAST_UPDATED_SLUG:gh-243-campaign-list-edition-visibility-pr-ready --> July 31, 2026 — **GH #243 campaign-list edition visibility is IMPLEMENTED + LOCALLY VERIFIED, not yet merged or launched.** Shared admin and coach rows now carry factual `Edition N` identity plus lifecycle-aware `Not latest` or `Retired` markers from one batched standing resolver. Closed historical rows suppress actionable markers; failures remain template-only. No migration, write path, repinning, filter, sort, or feature flag was added. Full detail in CHANGELOG entry `gh-243-campaign-list-edition-visibility-pr-ready`. |
```

- [ ] **Step 6: Prepend the changelog entry**

Insert immediately after the top `---`:

```md
### 2026-07-31 — Campaign-list edition visibility implemented (GH #243) <!-- ENTRY_ISO:2026-07-31 ENTRY_SLUG:gh-243-campaign-list-edition-visibility-pr-ready -->

**Status: IMPLEMENTED + LOCALLY VERIFIED; not yet merged or launched.** The shared admin and coach campaign lists now show the pinned assessment identity as `Template · Edition N`. DRAFT and ACTIVE rows show a compact `Not latest` marker when a newer active edition exists and a stronger `Retired` marker when the pin itself is retired; retirement has precedence. CLOSED rows, including imported historical campaigns, keep factual edition identity but suppress both actionable markers. Current rows have no positive badge.

**Architecture and safety.** Both page queries project the same pinned-version fields. One server-only resolver deduplicates exact `(templateId, language)` pairs, performs one additional `findMany` using `activePublishedWhere`, groups the complete candidate set in memory, and delegates decisions to the GH #242 `resolveEditionStanding` contract. A failed query, invalid pin, or incomplete nonretired group yields null edition metadata and preserves the prior template-only row; it never asserts currency. The client DTO contains only edition number and the two standing booleans.

**Presentation and scope.** Desktop and 390px mobile receipts were approved before feature code and retained under `docs/specs/v7.6/mockups/`. Existing grouping, filtering, metrics, ordering, links, actions, and the Coach Quick-link path remain unchanged. There is no edition filter, sort, date, repinning action, migration, API route, feature flag, report change, scoring change, or write-path change.

**Verification.** The focused resolver, mapper, shared-list, filter, admin-page, coach-page, referred-results, and edition-standing suites passed. Changed-file ESLint, migration safety, changelog freshness, `git diff --check`, and `CI=true npx next build --turbopack` passed.

**Rollout and rollback.** This is a flagless read-only presentation change. It is not live until its PR merges and the exact merge deployment reaches Ready. Rollback is a normal revert with no data cleanup, flag operation, or environment change.

---
```

- [ ] **Step 7: Verify source-of-truth alignment**

```bash
npx jest \
  src/__tests__/lint/changelog-freshness.test.ts \
  --runInBand
git diff --check
```

Expected: the freshness test passes and no whitespace errors are reported.

- [ ] **Step 8: Review branch scope**

From the worktree root:

```bash
git status --short
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected: only the design, implementation plan, visual receipts, listed
campaign-list production/test files, `CLAUDE.md`, and `plans/CHANGELOG.md`.
There must be no schema, migration, API route, detail component, report,
submission, scoring, or write-path change.

- [ ] **Step 9: Commit the source-of-truth record**

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(sot): record campaign-list edition visibility (#243)"
```

---

### Task 7: Review, publish, and verify the protected release

**Files:**

- Review: all branch changes against `origin/main`
- Update after launch on a separate docs branch: `CLAUDE.md`
- Update after launch on a separate docs branch: `plans/CHANGELOG.md`

**Interfaces:**

- Consumes: a clean, locally verified #243 branch.
- Produces: merged implementation, Ready production deployment, launch SoT, closed issue, and released claim.

- [ ] **Step 1: Request code review**

Invoke `superpowers:requesting-code-review`. Resolve each substantive
correctness, security, performance, accessibility, or spec-compliance finding.
Re-run every test or gate affected by a correction.

- [ ] **Step 2: Verify before completion**

Invoke `superpowers:verification-before-completion`. Confirm fresh output for
focused Jest, changed-file ESLint, migration safety, changelog freshness,
Turbopack build, `git diff --check`, branch commits, and clean status.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin codex/243-campaign-list-edition-visibility
```

- [ ] **Step 4: Open the implementation PR**

```bash
gh pr create \
  --base main \
  --head codex/243-campaign-list-edition-visibility \
  --title "feat(assessments): show edition standing in campaign lists" \
  --body "Closes #243.

Shows each resolvable campaign's pinned Edition N in the shared admin and coach lists, with lifecycle-aware Not latest and Retired markers backed by one batched active-edition query.

Retirement semantics come from the merged #242 edition-standing contract. CLOSED historical rows keep factual identity without actionable warnings. Lookup failures degrade to the prior template-only row.

Validation and desktop/mobile visual evidence are recorded in plans/CHANGELOG.md under gh-243-campaign-list-edition-visibility-pr-ready.

No migration, flag, write path, repinning action, filter, sort, or unrelated redesign."
```

- [ ] **Step 5: Wait for protected checks**

```bash
gh pr checks --watch --fail-fast
gh pr view --json reviewDecision,mergeStateStatus,statusCheckRollup,url
```

Expected before merge: required Build, Migration Safety Gate, Assessment Email
Lease CI, and Vercel checks pass, and repository review rules are satisfied.
Diagnose failures from logs; do not bypass protection.

- [ ] **Step 6: Merge after protection is satisfied**

```bash
gh pr merge --squash --delete-branch
gh pr view --json mergedAt,mergeCommit,url
```

Record the implementation PR number, merge time, and merge SHA.

- [ ] **Step 7: Verify the production deployment**

From `src/`:

```bash
npx vercel ls
curl -sS https://scaling-up-platform-v2.vercel.app/api/health
curl -sS https://platformtest.scalingup.com/api/health
```

Wait for the production deployment of the exact merge SHA to reach Ready.
Confirm both aliases report a healthy database and safe auth posture. Perform
read-only admin and coach list smokes with existing data; do not create,
repin, archive, close, or submit a production campaign solely for smoke
coverage.

- [ ] **Step 8: Record launch truth in a separate SoT PR**

From deployed `origin/main`, create
`codex/243-campaign-list-edition-visibility-launch-sot`. Prepend a launch entry
with slug `gh-243-campaign-list-edition-visibility-launched` and update the
`CLAUDE.md` freshness anchor to match. Record the implementation PR, merge SHA,
Ready deployment, both health responses, read-only admin/coach smoke evidence,
and normal-revert rollback. Open the docs-only PR, satisfy protected checks,
merge it, and verify its deployment without re-reporting the implementation as
new feature work.

- [ ] **Step 9: Close and release**

Verify `Closes #243` closed the issue. Update issue #261 with the merged PR and
launch-SoT PR, then release the #243 claim. If automatic closure failed, close
#243 with a comment linking both merged PRs. Do not release the claim while the
implementation, deployment verification, or launch SoT remains incomplete.
