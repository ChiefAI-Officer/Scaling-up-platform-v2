# Visual Template Editor

**Date**: 2026-03-27
**Figma Reference**: Node 2055-13
**Revision**: "1.3 Further revisions needed for all 3 templates: when you go into >Edit it all shows in code."

## Problem

When admins clicked "Edit" on a PageTemplate at `/templates/[id]/edit`, they saw a raw JSON textarea and raw JSON preview. Non-technical users (Jeff, Suzanne) could not edit template content without understanding JSON syntax.

## Solution

Replaced the raw JSON editor with a form-based UI featuring labeled inputs, card sections, and a live preview panel — matching the existing workshop-specific editors already in the codebase.

**Scope**: 3 template types — SOLO_LANDING, REGISTRATION, THANK_YOU.

**Layout**: 5-column grid (2 cols form, 3 cols sticky preview), consistent with existing workshop editors.

### Form Fields by Type

| Type | Cards | Fields |
|------|-------|--------|
| SOLO_LANDING | 4 (Hero, Coach, Event & Content, Video & CTA) | 15 fields incl. dynamic benefits list |
| REGISTRATION | 2 (Hero, Form Configuration) | 9 fields |
| THANK_YOU | 3 (Content, Video, Additional) | 5 fields |

### Preview Panels

Each type has a dedicated live preview panel with `{{variable}}` placeholders replaced by sample data via `interpolateContent()` + `TEMPLATE_PREVIEW_DATA`.

## Files Created/Modified

| File | Action | Lines |
|------|--------|-------|
| `src/components/templates/template-content-editor.tsx` | Rewritten — form-based editor with live preview | ~1094 |
| `src/app/(dashboard)/templates/[id]/edit/page.tsx` | Simplified — passes templateType + content to client | ~42 |
| `src/lib/template-editor-utils.ts` | **NEW** — extracted testable utilities (types, defaults, helpers) | ~141 |
| `src/__tests__/lib/template-editor-utils.test.ts` | **NEW** — TDD test suite | ~150 |
| `src/lib/template-preview.ts` | Updated — added missing preview data keys | minor |

## Code Review Summary

| Severity | Count | Details |
|----------|-------|---------|
| Critical | 0 | — |
| Important | 4 | All fixed (see below) |
| Minor | 6 | Noted for future work |

### Important Issues Fixed

| # | Issue | Fix |
|---|-------|-----|
| I-1 | All 3 form states initialized regardless of active type | `getInitialData()` with type switch + lazy `useState` |
| I-2 | No unsaved changes warning | `isDirtyCheck()` + `beforeunload` event listener |
| I-3 | No `res.ok` guard before `res.json()` in save handlers | Added guard in both `handleSave` functions |
| I-4 | No unit tests for editor utilities | 16 tests across 4 describe blocks |

### Minor Issues (Remaining)

- M-1: `previewValue` helper could be extracted to utils
- M-2: Benefits list could use drag-to-reorder
- M-3: Preview panel could show mobile/desktop toggle
- M-4: Form validation (e.g., URL format for videoUrl)
- M-5: Accessibility — form labels could use `htmlFor`
- M-6: Large component (~1094 lines) could be split further

## TDD Summary

4 Red-Green-Refactor cycles, 16 tests total:

| Cycle | Function | Tests | Result |
|-------|----------|-------|--------|
| 1 | `safeJsonParse` | 4 | RED→GREEN |
| 2 | `getInitialData` | 5 | RED→GREEN |
| 3 | `isDirtyCheck` | 4 | RED→GREEN |
| 4 | `TEMPLATE_PREVIEW_DATA` completeness | 3 | RED→GREEN |

## Test Impact

- Before: 534 tests
- After: 550 tests (+16)
- All passing (1 pre-existing timezone test excluded)

## Build Status

`CI=true npm run build` — passing (0 type errors, 0 ESLint errors)

## Data Flow

```
Load:  DB content (JSON string) → JSON.parse → form state
Edit:  User types → setState → preview re-renders live
Save:  form state → JSON.stringify → PATCH /api/page-templates/[id]
```

No API or schema changes required.

---

## Revision 1.4: "Global" → "All Categories"

**Date**: 2026-03-27
**Figma Reference**: Node 2082-71

### Problem

Template headers and cards displayed "Global" for templates with no category — internal database jargon that means nothing to non-technical admins.

### Fix

Replaced "Global" with "All Categories" in 4 locations across 3 files:

| File | Change |
|------|--------|
| `src/app/(dashboard)/templates/[id]/edit/page.tsx` | `categoryName` fallback: `"Global"` → `"All Categories"` |
| `src/app/(dashboard)/templates/page.tsx` | Card badge text + summary stats |
| `src/components/templates/activate-template-modal.tsx` | Badge text in modal |

No API, schema, or logic changes. Build passes.

### Follow-up: Strip "Global " prefix from template display names

Template names stored in the database (e.g., "Global SOLO LANDING") still showed "Global" in the breadcrumb and h1 header on the edit page. Added `displayName = template.name.replace(/^Global\s+/i, "")` in the edit page server component so both breadcrumb and header render the clean name.

| File | Change |
|------|--------|
| `src/app/(dashboard)/templates/[id]/edit/page.tsx` | Compute `displayName` stripping "Global " prefix; use in breadcrumb + templateName prop |
