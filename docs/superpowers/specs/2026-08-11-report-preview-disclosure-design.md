# Report Preview Disclosure and Compact Style Cards — Design

**Date:** 2026-08-11

**Status:** Approved in brainstorming

**Scope:** Every assessment Report Appearance configuration surface

## 1. Context

The shared `ReportStylePicker` currently presents Classic, Executive Boardroom,
and Modern Dashboard as large cards. Full-picker surfaces immediately render a
Cover, Summary, or Detail image below those cards. The resulting section is much
taller than the surrounding report-setup controls, especially when an operator
only needs to confirm or change the selected appearance.

Compact creation surfaces use a different presentation: a selected thumbnail is
always loaded, followed by an expandable full preview. That split makes the same
report-appearance decision look and behave differently across Admin and Coach
workflows.

The approved change makes the shared picker compact and consistent. Style cards
remain visible, while all preview imagery starts hidden and is available through
an explicit Show/Hide disclosure.

## 2. Goals

1. Reduce the vertical footprint of Report Appearance configuration.
2. Start every report preview hidden.
3. Preserve enough information in each style card to make a choice without
   opening the preview.
4. Apply one interaction consistently to every assessment and every current
   Admin or Coach configuration surface.
5. Avoid loading preview assets until an operator requests them.
6. Preserve report-style selection, inheritance, locking, saving, rendering,
   and respondent-output semantics.

## 3. Non-goals

- Changing any respondent-facing report.
- Changing report content, scoring, findings, comparison, or print/PDF output.
- Changing the three-style catalog or its metadata.
- Persisting preview visibility in the database, campaign, template, URL, local
  storage, or cookies.
- Adding a new navigation destination, API, schema field, migration, or feature
  flag.
- Adapting group reports, trends, CSV exports, or report-email HTML.

## 4. Locked Decisions

| Decision | Approved behavior |
| --- | --- |
| Coverage | Every assessment Report Appearance configuration surface |
| Initial state | Preview hidden on every component mount |
| Cards while hidden | All three style cards remain visible |
| Card direction | Option A: compact three-column tiles |
| Supporting information | Keep each style's description and paper format |
| Disclosure copy | `Show preview` when closed; `Hide preview` when open |
| Visibility persistence | Component-local only; reset to hidden on remount |
| Style changes while open | Preview stays open and updates to the selected style |
| Tab state | Preserve the active tab while mounted; a fresh mount starts on Cover |
| Locked appearance | Radios remain read-only, but preview disclosure stays usable |
| Asset loading | Do not mount or request preview images while closed |

## 5. Surface Coverage

The shared behavior applies wherever `ReportStylePicker` is rendered:

1. Admin template Settings — default report appearance.
2. Coach campaign creation — report setup.
3. Shared Campaign Detail — editable for the owning Coach before first
   completion, read-only after the appearance lock, and read-only in the Admin
   view of a coach-owned campaign.
4. Admin public-campaign creation.
5. Admin public-campaign management — editable or read-only according to the
   existing ownership and lock rules.

No caller may retain a permanently visible full preview or an always-loaded
selected thumbnail. Future Report Appearance configuration surfaces inherit the
same behavior by using the shared picker.

## 6. User Experience

### 6.1 Compact style cards

Desktop retains the current three-column grid. Narrow screens retain the current
single-column stack. Each tile uses compact spacing equivalent to approximately
`0.75rem` padding, a small gap between text rows, and smaller supporting text.
The design must not impose a fixed height or truncate translated or long labels.

Each tile contains:

- style name in compact semibold text;
- the existing short description;
- the existing paper format;
- a visible non-color selection indicator.

The selected indicator becomes a compact check treatment instead of consuming a
full text row. It is paired with screen-reader text identifying the option as
selected. Native radio checked state remains authoritative.

The implementation should reduce the ordinary desktop tile height by roughly
one-third to one-half compared with the existing non-compact card, while
preserving legibility and a sufficiently large clickable target.

### 6.2 Collapsed preview

Immediately below the cards and any existing lock/provenance explanation, the
picker renders a disclosure toolbar. In the initial state:

- preview tabs are absent;
- preview panels and images are absent;
- `Show preview` is aligned to the right;
- the button reports `aria-expanded="false"` and references the preview region
  through `aria-controls`.

The report-style cards remain selectable while the preview is closed.

### 6.3 Expanded preview

Activating `Show preview`:

1. changes the action to `Hide preview`;
2. sets `aria-expanded="true"`;
3. mounts the controlled preview region;
4. shows the existing Cover, Summary, and Detail tab list on the left side of
   the toolbar;
5. loads only the active preview image.

The first expansion starts on Cover. Selecting another tab changes the active
preview using the existing keyboard and click behavior. Closing and reopening
the preview during the same component mount preserves the active tab. Navigating
away or remounting the picker resets visibility to hidden and the active page to
Cover.

Changing the selected report style while expanded keeps the disclosure open and
updates the preview to the same active anatomy page for the new style.

## 7. Component Architecture

`ReportStylePicker` remains the single owner of style-card layout, preview
disclosure, preview tabs, image loading, and preview retry state.

Its externally meaningful contract remains:

- `value` identifies the selected report style;
- `onChange` emits a style selection;
- `disabled` controls style mutability;
- `sourceLabel`, `lockedAt`, and `disabledExplanation` explain immutable state;
- `previewAnatomy` selects scored, qualitative, or sparse-custom preview assets;
- `heading` supplies the caller-specific accessible heading.

The current `compact` visual branch is retired after all callers use the unified
compact-card disclosure. It must not leave a second thumbnail-only interaction
or cause different behavior between creation and management surfaces.

Internal state is limited to:

- `previewExpanded`, initialized to `false`;
- `previewPage`, initialized to `cover`;
- existing preview-failure and retry-version state.

Style persistence continues to flow only through the caller's existing
`value`/`onChange` and save APIs. Preview state never enters request bodies or
stored models.

## 8. Accessibility

- Style choices remain native radios with keyboard arrow navigation.
- Selection remains perceivable without color through a visible check indicator,
  native checked state, and screen-reader selected text.
- The Show/Hide control is a native button with visible focus styling,
  `aria-expanded`, and `aria-controls`.
- The expanded region has a stable generated ID and an appropriate region or
  grouping label.
- The existing tab semantics, roving focus, `aria-selected`, `aria-controls`,
  and tabpanel relationships remain intact while expanded.
- The disclosure remains enabled when style radios are disabled because viewing
  a preview does not mutate the report appearance.
- Compact sizing must preserve readable text, wrapping, and usable pointer
  targets at desktop and mobile widths.

## 9. Failure and Boundary Behavior

| Situation | Required behavior |
| --- | --- |
| Preview is closed | No preview image request; style selection remains usable |
| Preview image fails | Show existing `Preview unavailable` state and `Retry` action |
| Retry succeeds | Remount only the failed active image |
| Style changes after an image failure | Resolve failure state by anatomy, style, and page as today |
| Appearance is locked | Cards remain read-only; Show/Hide and preview tabs remain usable |
| Save is in progress | Style mutation follows existing disabled behavior; preview inspection remains usable |
| Component remounts | Return to hidden Cover state |
| Unknown or unavailable report style | Existing server and registry fallback behavior is unchanged |

Collapsing the preview does not change the selected style, active page, failed
asset registry, retry counter, lock state, or unsaved caller state during the
same mount.

## 10. Rollout and Compatibility

This is a presentation refinement inside the existing report-style capability.
The picker is already omitted when `WAVE_REPORT_STYLES_ENABLED`/canary policy is
unavailable or when `WAVE_REPORT_STYLES_KILL` wins. Therefore no separate flag is
introduced.

The change has no data migration and no server-write effect. Deployment can be
rolled back at the application level without reconciling stored state. Existing
report-style rollout and kill behavior remain authoritative.

## 11. Test Strategy

### 11.1 Shared component tests

Add or update `ReportStylePicker` tests to prove:

1. compact cards render all catalog metadata and a non-color selected state;
2. no preview tabs, panels, thumbnails, or full images exist initially;
3. `Show preview` has the collapsed ARIA contract;
4. activating it mounts Cover, changes the action to `Hide preview`, and exposes
   the expanded ARIA contract;
5. hiding removes the tab list and preview images;
6. reopening within the same mount preserves the selected Summary or Detail tab;
7. style selection works both closed and open;
8. an open preview updates to the selected style and retains its active page;
9. locked radios do not prevent opening, tabbing through, closing, or retrying a
   preview;
10. failure and retry behavior remains scoped to the correct anatomy, style, and
    page;
11. scored, qualitative, and sparse-custom preview paths remain correct.

### 11.2 Surface integration tests

Update focused tests for Admin template Settings, Coach campaign creation,
Coach/Admin Campaign Detail, and public-campaign creation/management. Each
surface must establish that the shared picker starts collapsed and does not
regress its existing selection, inheritance, ownership, lock, or save behavior.

### 11.3 Visual and responsive review

Inspect representative Admin and Coach surfaces at desktop and mobile widths:

- three compact tiles align on desktop;
- tiles stack without horizontal overflow on narrow screens;
- long names, descriptions, and paper formats wrap without collision;
- the right-aligned disclosure remains discoverable;
- the expanded toolbar places tabs and Hide preview without overlap;
- error, saving, and locked states remain legible.

### 11.4 Repository gates

Run from `src/`:

```bash
npx eslint <changed files>
npx jest <targeted test files> --runInBand
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

No gate is reported as passing unless it is run and observed passing.

## 12. Acceptance Criteria

The work is accepted only when:

1. Every current assessment Report Appearance configuration surface uses the
   shared compact Option A tiles.
2. Every picker starts with preview tabs and images hidden.
3. No preview asset is requested before Show preview is activated.
4. Show/Hide works with correct accessible state and keyboard focus.
5. Cover, Summary, and Detail retain their current navigation, anatomy mapping,
   failure, and retry behavior after expansion.
6. Changing styles while expanded updates the preview without closing it.
7. Read-only and locked appearances remain previewable.
8. Preview visibility is never persisted.
9. Report-style selection, inheritance, ownership, saving, atomic locking,
   renderer selection, and respondent-facing output remain unchanged.
10. Desktop and mobile visual review passes without truncation, collision, or
    horizontal overflow.
11. Targeted tests, changed-file ESLint, migration safety, and the
    Production-matching Turbopack build pass.

## 13. Expected Implementation Surface

Primary files:

- `src/src/components/assessments/ReportStylePicker.tsx`
- `src/src/__tests__/components/assessments/report-style-picker.test.tsx`

Focused caller tests may change under:

- `src/src/__tests__/components/admin/template-editor/`
- `src/src/__tests__/components/assessments/`
- `src/src/__tests__/components/admin/public-campaigns/`

No schema, migration, report renderer, scoring, report loader, or report-output
file is expected to change.
