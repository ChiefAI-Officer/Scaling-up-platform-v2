# Mobile Responsive Foundation — Design Specification

**Date:** 2026-08-12

**Status:** Approved

**Target:** `platformtest.scalingup.com` authenticated coach and admin experiences

**First implementation wave:** Eliminate every full-page horizontal overflow across both roles

## Summary

Build one responsive product—not a separate mobile application—using shared compact, medium, and wide layout states. Wave 1 fixes page-level horizontal overflow throughout the authenticated coach and admin experiences while preserving every permission, action, URL, mutation, and desktop workflow.

The responsive system must cover phones, iPads, iPad Split View and Stage Manager, device rotation, browser Page Zoom, larger text, touch input, and keyboard input. Deliberately wide data may scroll only inside an obvious, bounded, labeled region; the document itself must always fit its viewport.

## Context and Evidence

A read-only production audit covered more than 50 coach and admin route states at an iPhone-sized viewport, supplemented by narrower and report-specific checks. The original iPhone 11 screenshot was reproduced at an effective width near 300 CSS pixels, consistent with Safari Page Zoom. Safari was not being programmatically zoomed by the site, but the layout failed to reflow at the narrower effective viewport.

Representative measured failures at a 390-pixel viewport included:

| Role | Surface | Approximate document width |
| --- | --- | ---: |
| Coach | Workshops | 1,035 px |
| Coach | Campaign detail | 813 px |
| Coach | Members | 555 px |
| Coach | Assessments | 541 px |
| Coach | Settings | 489 px |
| Coach | Campaign wizard | 449 px |
| Admin | Files | 482 px |
| Admin | Workshop detail | 484 px |

Additional systemic findings:

- The admin assessment secondary navigation can consume roughly 440 vertical pixels before the page content begins on a phone.
- Common tables have intrinsic widths around 800–1,180 pixels.
- Organization/member master-detail screens can leave a detail pane only about 100 pixels wide.
- Several interactive controls are below the intended touch-target size.
- Individual reports are generally responsive already. Wide group-report data is appropriately closer to a contained-scroll pattern and should be preserved rather than redesigned.

These failures share layout causes: non-wrapping page headers and action rows, fixed/minimum widths that escape the viewport, desktop-only table and master-detail presentations, and navigation structures that do not adapt to available content width.

## Goals

1. Remove all full-document horizontal overflow from authenticated coach and admin routes.
2. Make all existing functions reachable and understandable on phones and tablets.
3. Preserve existing business logic, permissions, URL contracts, and desktop behavior.
4. Establish reusable responsive primitives so fixes are systemic rather than route-specific patches.
5. Add automated and physical-device regression gates that catch overflow, inaccessible actions, and state loss.

## Non-Goals

- A separate mobile application or mobile-only navigation/product model.
- Authorization, backend, API, schema, or workflow-semantic changes.
- A general brand redesign.
- New assessment-editor functionality.
- Redesigning report content that is already responsive.
- Solving every visual-polish issue in Wave 1 when it does not contribute to overflow or action reachability.

## Chosen Direction

Use a responsive foundation shared by coach and admin.

This was selected over two alternatives:

- **Overflow containment only:** faster locally, but leaves hidden actions, small targets, excess cognitive load, and recurring page-by-page defects.
- **Dedicated mobile product:** can be highly phone-specific, but duplicates navigation and interaction models and creates the largest scope and regression surface.

The shared foundation preserves one product and one set of workflows while allowing the presentation to adapt intentionally to the available content width.

## Responsive Layout Contract

Breakpoints are layout states determined by available content width, not device names.

### Compact: 320–639 px

Expected contexts: phones, browser zoom, larger text, and narrow iPad Split View.

- Drawer navigation.
- Single-column page headers, actions, forms, and primary content.
- Tables become prioritized record cards or bounded data regions.
- Master-detail screens become drill-in flows with a visible back path.
- Assessment secondary navigation becomes the current section plus one disclosure control.
- Multi-step workflows show `Step N of M` and the current step.

### Medium: 640–1023 px

Expected contexts: iPad portrait and wider Split View/Stage Manager windows.

- Optional navigation rail where it leaves enough usable content width.
- Two-column summary layouts where content fits.
- Master-detail is allowed only when both panes meet explicit minimum usable widths.
- Tables remain tables only when their selected columns fit; otherwise use record cards or a hybrid presentation.
- Wizards may use a horizontal stepper or section rail.

### Wide: 1024 px and above

Expected contexts: iPad landscape, large tablets, laptops, and desktops.

- Persistent navigation and denser grids are allowed where measured content fits.
- Existing desktop workflows and information density remain intact.
- Wide layouts must still reflow correctly under Page Zoom and larger text.

### Invariants at Every Width

1. `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
2. Page headers stack before labels, controls, or actions become squeezed or clipped.
3. Interactive targets are at least 44 × 44 CSS pixels unless an equivalent accessible target surrounds the visible glyph.
4. No capability is removed by a breakpoint.
5. Only a deliberately wide data region may scroll horizontally, and that region must be bounded and labeled.
6. Text may wrap or truncate only when the full value remains available through the interaction design.

## Responsive Presentation Patterns

### Page Headers and Action Clusters

Page title, context/status, and actions follow a stable priority order:

1. identity/title;
2. current status or essential context;
3. primary action;
4. secondary actions.

On compact widths the header stacks. One primary action remains directly visible. Secondary actions move into a labeled `More` menu or bottom sheet. Destructive actions remain explicitly labeled and require confirmation.

### Tables and Record Collections

Compact tables become record cards when a row represents a domain object and horizontal comparison is not the primary task.

Each card keeps visible:

- record identity;
- status;
- the most decision-relevant metadata;
- one primary next action;
- a `More` action for the remaining commands.

Sorting, filtering, pagination, selection, and the full metadata remain available. Secondary fields may appear in expandable details; they are not deleted.

When cross-column comparison is essential, retain a table within a bounded region that owns its horizontal scroll. Freeze or repeat identity columns where appropriate and provide a clear affordance that more columns are available.

Medium layouts may use a reduced-column table, card/table hybrid, or the compact card presentation. The choice is based on measured content fit, not a blanket tablet assumption.

### Master-Detail Screens

On compact widths, organization, team, and member screens use a drill-in sequence:

`Organizations → Organization → Team or Members → Record detail`

A visible back/breadcrumb path preserves orientation. Selection, filters, and scroll position survive navigation back to the list.

On medium widths, split view is permitted only when both master and detail panes clear their minimum usable widths. Otherwise, the layout remains drill-in. Wide layouts retain the existing dense split view.

### Assessment Navigation

The compact assessment workspace shows the current section and a single disclosure/dropdown for the remaining sections instead of rendering the entire secondary-navigation wall above the content. Medium layouts use a section rail when space allows. Wide layouts keep the existing navigation model.

Deep links, route paths, query parameters, permission checks, and browser history remain unchanged.

### Wizards, Forms, Editors, and Dialogs

Compact multi-step flows show progress as `Step N of M` plus the current step name. Fields and primary controls use the full available width. Secondary actions move into an overflow treatment without changing their behavior.

Medium layouts may use a horizontal stepper or section rail. Dialogs must fit the visual viewport, keep their title and primary actions reachable, and scroll internally when their content is taller than the viewport.

Editor toolbars wrap or collapse by priority. Preview panes stack beneath editing controls on compact widths and may sit beside them only when each pane remains usable.

### Loading, Empty, Validation, and Error States

- Loading and empty states reserve the same responsive container geometry as populated content.
- Field errors appear inline and are paired with a navigable summary for multi-field failures.
- Retry does not discard filters, sort order, selected records, page position, or unsaved draft input.
- Permission-denied and not-found states fit every viewport and provide an obvious recovery path.

## Data Flow and State Preservation

The responsive layer changes presentation only.

Existing data fetching, mutations, validation, authorization, role checks, and URL contracts remain authoritative. Shared responsive presenters consume the same domain data and invoke the same actions as the current desktop components.

Across resize, rotation, breakpoint changes, or temporary drawer/menu use, preserve:

- filters and sorting;
- pagination;
- selected record or detail context;
- route and query state;
- unsaved form/editor drafts;
- validation errors;
- focus when practical and safe.

No state should reset merely because a device rotates or a browser crosses a layout threshold.

## Wave 1 Scope

Wave 1 begins with shared causes, then migrates every measured route.

### 1. Viewport and Shared Shell

- Verify viewport metadata.
- Constrain the document root and identify the actual overflowing descendants rather than masking them with global clipping.
- Make global headers and coach/admin navigation reflow across all layout states.
- Establish shared compact, medium, and wide tokens and container rules.

### 2. Shared Responsive Primitives

- Page header and action cluster.
- Record collection/table presentation.
- Tabs and secondary navigation.
- Dialog and bottom-sheet action presentation.
- Form, editor, and wizard containers.
- Master-detail container.
- Loading, empty, error, and permission-state containers.

### 3. Coach Route Migration

At minimum:

- portal dashboard and global navigation;
- workshops list and workshop detail;
- campaign detail and campaign-creation wizard;
- assessments;
- members;
- settings.

### 4. Admin Route Migration

At minimum:

- admin dashboard and global navigation;
- files;
- workshop list, approvals, and workshop detail;
- assessment templates and assessment workspace/editor surfaces;
- workflow and survey-template tables;
- organizations, teams, and members;
- template and campaign-management surfaces.

### 5. Reports Guard Pass

- Preserve responsive individual-report layouts.
- Keep wide group-report data inside bounded and labeled scrollers.
- Ensure charts, legends, filters, and export actions do not escape the document.
- Validate print/export separately from screen responsiveness.

## Implementation Sequence

1. **Viewport and shell:** remove systemic document-width failures and establish the shared responsive contract.
2. **Shared primitives:** implement responsive behavior once for headers, actions, collections, navigation, forms, dialogs, steppers, and master-detail.
3. **Route migration:** adopt the primitives in every coach and admin surface, starting with currently measured failures.
4. **Hardening:** exercise long labels, realistic dense data, large text, Page Zoom, rotation, Split View, loading/empty/error states, touch, keyboard, and desktop parity.

The implementation plan must identify the exact current components/files backing each primitive and route. It must prefer adapting shared components over adding route-local media-query patches.

## Testing and Acceptance

### Automated Viewport Matrix

Authenticated coach and admin coverage at:

- 320, 375, 390, and 430 px compact widths;
- representative 600–1023 px medium widths, including Split View-like dimensions;
- 1024–1366 px tablet landscape widths;
- at least one 1440 px desktop width for parity.

Each route asserts:

```text
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

An overflow failure should report the route, viewport, role, document width, and widest offending elements so regressions are actionable.

### Automated Interaction Coverage

- Primary and overflow actions remain reachable.
- Menus, drawers, dialogs, and disclosures open, dismiss, and restore focus correctly.
- Resize/rotation does not lose filters, sorting, pagination, selection, route/query state, or drafts.
- Representative populated, empty, loading, validation-error, permission-denied, and failure/retry states fit the viewport.
- Visual-regression screenshots cover representative coach/admin pages in compact, medium, and wide layouts, with desktop baselines protecting existing behavior.

### Accessibility and Input Review

- Minimum 44 × 44 CSS-pixel touch targets.
- Visible focus styles and logical keyboard order.
- No hover-only action.
- Drawer, disclosure, menu, and dialog semantics work with assistive technology.
- Larger-text behavior is checked in addition to browser Page Zoom.

### Physical Browser Acceptance

- iPhone 11 Safari in portrait and landscape.
- iPad Safari in portrait, landscape, Split View, and—where available—Stage Manager widths.
- Safari Page Zoom at 100%, 125%, and 150%.
- Chrome smoke checks at matching representative widths.
- Touch and keyboard interaction on tablet-sized layouts.

## Definition of Done

A route is complete only when:

1. the document itself has no horizontal overflow at every required viewport;
2. all existing actions and data remain reachable;
3. layout changes do not reset user state;
4. loading, empty, error, and permission states also fit;
5. touch and keyboard interactions pass;
6. the existing desktop experience remains behaviorally equivalent;
7. automated checks and the physical iPhone/iPad acceptance pass.

Wave 1 is complete when those conditions hold across the authenticated coach and admin route inventory, not merely the initially measured pages.

## Approved Design Decisions

- One responsive coach/admin product; no dedicated mobile product.
- Available-width states cover phones, tablets, Split View, rotation, zoom, and larger text.
- Full-page overflow is prohibited; intentionally wide data owns its bounded scroll.
- Dense records adapt to cards or hybrids without losing information or actions.
- Master-detail drills in when panes cannot remain usable.
- Compact assessment navigation collapses to the current section plus disclosure.
- Existing data flow, permissions, routes, and business behavior remain unchanged.
- Wave 1 is limited to responsive foundation and overflow/action reachability, with explicit regression gates.
