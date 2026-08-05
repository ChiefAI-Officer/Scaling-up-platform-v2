# GH #242 — Retired Pinned-Edition Warning Design

**Status:** Approved in brainstorming on 2026-07-31<br />
**Issue:** [GH #242](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/242)<br />
**Branch:** `codex/242-retired-edition-warning`

## 1. Problem

Wave EV (PR #241) shows which assessment-template edition a campaign is
serving and adds an amber **Not the latest edition** badge when a newer active
edition exists. It deliberately did not inspect the pinned edition's own
`archivedAt`.

Consequently, a campaign pinned to an edition that an administrator later
retires still shows reassuring provenance such as:

> Edition 3 · published Jul 2, 2026

It shows no warning when no newer active sibling exists. The configured shared
database had zero non-deleted campaigns in this state during the 2026-07-31
audit, so this is preventive correctness work rather than repair of a current
production record.

## 2. Goals

- Tell administrators and coaches when a campaign is serving a retired
  edition.
- Preserve the existing edition number and publication-date provenance.
- Make retirement visually stronger than ordinary edition staleness.
- Preserve Wave EV's fail-quiet behavior for non-retired editions.
- Keep the change read-only, flagless, and limited to the shared campaign
  detail screen.

## 3. Non-goals

- Campaign-list edition indicators; GH #243 owns that work.
- Moving an existing campaign to another edition.
- Changing archive, unarchive, publish, rollback, or campaign-create behavior.
- Changing assessment content, scoring, submissions, reports, or historical
  data.
- Adding a migration, feature flag, production data repair, tooltip, action
  link, or new lifecycle state.

## 4. Decisions

1. Add an explicit `pinnedRetired` fact to the existing `EditionStanding`
   result rather than replacing its booleans with a new state machine.
2. When an edition is both retired and behind, retirement wins in the UI.
   Render only **This edition has been retired**.
3. Use semantic destructive styling for the retired badge. The text carries
   the meaning, so the state is not communicated by color alone.
4. Keep the existing provenance line above the badge.
5. Limit the change to the shared admin/coach campaign-detail component.
6. Ship flagless, matching Wave EV's existing read-only behavior. Rollback is a
   code revert.
7. The visual companion was offered and declined. The user approved the
   text-described treatment, which reuses the existing compact edition-badge
   pattern and semantic color tokens.

## 5. Architecture and Data Flow

The change extends the existing Wave EV seam:

```text
AssessmentTemplateVersion.archivedAt
  → getCampaignOverview pinned-version projection
  → PinnedVersion.archivedAt
  → resolveEditionStanding(...).pinnedRetired
  → CampaignDetail retired-warning precedence
```

### 5.1 Loader projection

`getCampaignOverview` adds `archivedAt: true` to the pinned `version` select and
passes the value through its narrow `CampaignWithRels["version"]` shape.
`PinnedVersion.archivedAt` is required and nullable. Making the field required,
plus pinning the exact projection in a test, prevents a future narrowed select
from silently treating an unknown value as not retired.

### 5.2 Pure standing decision

`resolveEditionStanding` retains its current inputs and output fields, then
adds:

```ts
pinnedRetired: pinned.archivedAt != null
```

The pure decision can represent both underlying facts when given siblings:
`pinnedRetired === true` and `newerEditionAvailable === true`. Presentation
precedence remains the component's concern.

### 5.3 Loader short-circuit

When the pinned edition is retired, the stronger state is already known and no
sibling lookup is needed. `getCampaignOverview` resolves the standing directly
with an empty sibling set, without calling
`assessmentTemplateVersion.findMany`. Consequently, the loader does not claim
whether a retired pin is also behind; that fact has no presentation consequence
under the approved retirement-wins rule. The pure resolver remains capable of
representing both facts for callers that supply siblings.

For a non-retired pin, the existing sibling lookup and canonical
`activePublishedWhere` filter remain unchanged.

### 5.4 Rendering

`CampaignDetail` keeps the existing edition line, then renders exactly one
badge:

1. `pinnedRetired` → destructive **This edition has been retired**
2. otherwise `newerEditionAvailable` → existing amber
   **Not the latest edition**
3. otherwise no badge

The retired badge uses `data-testid="campaign-edition-retired"`. The existing
stale badge and its test identifier remain unchanged. No icon, tooltip, or
action link is added because the campaign cannot change its pinned edition.

## 6. Failure and Edge-Case Behavior

- A retired pin renders its known warning without depending on a sibling query.
- A non-retired sibling-query failure continues returning `edition: null`,
  never a false claim that the campaign is current.
- An unpublished pinned version continues returning no edition information.
- An archived newer sibling remains excluded from the active/newer comparison.
- A missing pinned version continues skipping all edition work.
- Retirement suppresses the stale badge even if the pure decision contains
  both facts.
- The campaign detail page and its unrelated data remain available under every
  existing edition-lookup fail-quiet path.

## 7. Testing

### 7.1 Pure decision

Extend `edition-standing.test.ts` to prove:

- ordinary pins return `pinnedRetired: false`;
- archived pins return `pinnedRetired: true`;
- an archived pin with a newer active sibling can represent both facts;
- existing draft, language, template, and archived-sibling rules remain intact.

### 7.2 Loader and query boundary

Extend `campaign-detail.test.ts` to prove:

- the pinned-version projection includes `archivedAt: true`;
- a retired pin returns `pinnedRetired: true`;
- a retired pin does not perform the sibling lookup;
- a non-retired pin retains the existing lookup behavior;
- a non-retired lookup failure still returns `edition: null`.

The existing exact sibling projection assertion remains unchanged.

### 7.3 Component

Extend `campaign-edition-tile.test.tsx` to prove:

- the edition number and publication date remain visible;
- the retired badge has the approved wording and semantic destructive classes;
- retired-and-behind renders the retired badge but not the stale badge;
- current and merely-behind states retain their existing behavior and wording;
- null or omitted edition data still renders no edition UI.

### 7.4 Validation

Run from `src/`:

```bash
npx jest \
  src/__tests__/lib/assessments/edition-standing.test.ts \
  src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/__tests__/components/assessments/campaign-edition-tile.test.tsx \
  --runInBand
npx eslint \
  src/lib/assessments/edition-standing.ts \
  src/lib/assessments/campaign-detail.ts \
  src/components/assessments/CampaignDetail.tsx \
  src/__tests__/lib/assessments/edition-standing.test.ts \
  src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/__tests__/components/assessments/campaign-edition-tile.test.tsx
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

Use a local fixture to inspect the shared campaign-detail tile at desktop and
mobile widths. Confirm the provenance line and destructive badge do not
overflow and that the same component serves both admin and coach entry points.
Do not create production data solely to exercise the warning.

## 8. Rollout and Source-of-Truth Hygiene

The implementation is read-only and flagless. It requires no migration,
backfill, environment change, canary, or flag flip. Merge through the protected
PR flow, verify the production deployment is Ready, and smoke the unaffected
campaign-detail route. Because production currently has no natural retired-pin
fixture, do not manufacture one for the smoke.

The implementation PR must update the `CLAUDE.md` freshness anchor and prepend a
`plans/CHANGELOG.md` entry recording GH #242, validation, deployment status, and
the zero-current-record limitation.

## 9. Acceptance Criteria

- A campaign pinned to an archived edition shows its edition provenance plus
  **This edition has been retired**.
- The retired badge uses the destructive semantic treatment.
- A retired campaign never also shows **Not the latest edition**.
- Non-retired current, behind, degraded, and unpublished states behave as they
  did before.
- Both admin and coach campaign-detail views receive the behavior through their
  shared component.
- Campaign lists, lifecycle writes, and assessment/report behavior remain
  unchanged.
- Focused tests, scoped ESLint, migration safety, and the Turbopack build pass
  before merge.
