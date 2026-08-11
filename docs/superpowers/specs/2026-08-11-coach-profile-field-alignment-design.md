# Coach Profile Field Alignment Design

**Status:** Approved for planning

**Date:** 2026-08-11

**Branch:** `codex/coach-profile-field-alignment`

## Problem

The `Coach` model already has two distinct fields:

- `Coach.title`: the coach's professional title or credentials, such as “Master Coach”
- `Coach.company`: the coach's business or company name, such as “A Step Above”

Several screens and integrations predate `Coach.title`. They still interpret `Coach.company` as “Title / Credentials.” This causes the same value to appear as Company in the admin coach record and as Title / Credentials in Coach Settings. The stale interpretation also reaches BIO management, Circle synchronization, and landing-page defaults.

## Audit Findings

| Surface | Current mismatch | Required behavior |
| --- | --- | --- |
| Coach Settings | `company` is labeled “Title / Credentials” | Show Professional Title from `title` and Company Name from `company` |
| Admin Edit Coach | Shared form has the same stale label and saves through the logged-in coach endpoint | Show both canonical fields and update the selected coach |
| Add Coach / Coach Details | Company exists, but Professional Title is omitted | Accept and display both fields |
| Admin BIO directory/editor | Company is labeled and previewed as a title | Keep title and company distinct; preview title from `title` |
| Bio Profiles API | Returns `company` in a property named `title` | Return the semantic professional title, with a legacy display fallback only |
| Circle sync | Circle headline/title is written into `Coach.company` | Write it into `Coach.title`; never overwrite Company |
| BIO/Solo/Duo landing defaults | Some paths use Company or a generic string as the title | Prefer `Coach.title`, then a read-only legacy fallback |

The root cause is historical: the affected mappings were created before the `Coach.title` column was introduced and were not migrated afterward.

## Decision

Use one canonical two-field contract everywhere:

| UI label | Model field | Example |
| --- | --- | --- |
| Professional Title | `Coach.title` | Master Coach |
| Company Name | `Coach.company` | A Step Above |

“Title / Credentials” is removed as a separate profile label. Credentials remain part of the meaning of Professional Title; no third database field is introduced.

## UI Design

### Admin coach setup

Add Coach, Edit Coach, and Coach Details show both fields in this order:

1. Professional Title
2. Company Name

Professional Title remains nullable at account creation. The existing profile-completeness gate can still require it before a coach requests a workshop.

### Coach portal settings

The profile form shows:

1. **Professional Title** — sourced from and saved to `Coach.title`
2. **Company Name** — sourced from and saved to `Coach.company`

The values in the approved example are “Master Coach” and “A Step Above.”

### Admin BIO screens

The BIO directory shows Professional Title and Company Name as separate columns. The BIO editor uses separate state and labels for both values. Its public bio preview uses Professional Title for the title line; Company Name remains coach-record metadata unless a landing template explicitly supports a company line.

### Landing-page editors

The BIO, Solo, and Duo editors use Professional Title for coach-title defaults. They do not relabel Company Name as a title. Saved page content remains editable independently after it is created.

## Data Flow and API Contracts

### Self-service profile update

`PATCH /api/portal/profile` continues to update the authenticated coach. It accepts `title` and `company` as separate optional values, trims non-null strings, and converts empty values to `null`.

### Admin coach create/update

The admin coach schemas and routes accept and persist `title` separately from `company`.

The shared profile form must use an explicit save target. Coach Settings saves to `/api/portal/profile`; Admin Edit Coach saves to `/api/coaches/[id]`. The component must not infer its target from the logged-in user or integration-ID visibility. This also repairs the existing defect where Admin Edit Coach can submit profile fields to the logged-in coach endpoint instead of the selected coach.

### Bio profile response

The BIO profiles API returns a title derived by the display rule below. It must not map Company to title unconditionally.

The Circle-import response retains the compatibility alias `titleCredentials` for older clients, but the alias resolves from `Coach.title`. The response also exposes canonical `title` and `company` values so new consumers do not need semantic aliases.

## Legacy Compatibility

Some older coaches may have a null `title` because Company historically doubled as the title. Read-only presentation paths may use:

```text
Coach.title ?? Coach.company ?? "Scaling Up Certified Coach"
```

This fallback is allowed only when rendering or seeding new editable landing-page content. It must never copy Company into `Coach.title`, rename Company as Title, or write fallback data back to the coach record.

No automated data rewrite will run. Existing records cannot be classified reliably as genuine company names or historical titles. Admins and coaches can correct ambiguous records through the newly aligned fields.

## Circle Synchronization

Circle's `headline`, `title`, or job-title value maps to `Coach.title`.

- Default sync fills an empty Professional Title.
- Explicit force sync may overwrite Professional Title.
- Neither mode changes Company Name.
- Bio, profile image, Circle ID, and sync timestamp retain their existing behavior.

The sync result reports `title` in `fieldsUpdated`, not `company`.

## Published Landing Pages

Existing published landing pages contain frozen content snapshots. This repair does not rewrite those snapshots or silently change live marketing pages.

Newly generated pages and editor defaults use the canonical title rule. An existing saved page changes only when an authorized user edits or regenerates it through the existing workflow.

The current template interpolation path already prefers `Coach.title` before Company and remains the reference behavior.

## Validation and Error Handling

- Self-service and admin update routes accept optional nullable `title` and `company` values so either field can be cleared. Admin creation accepts optional strings and persists omitted fields as null.
- Values are trimmed before persistence; empty strings become `null` where the route already follows that convention.
- Existing URL and profile validation remains unchanged.
- Unauthorized admin/self-service requests keep their current 401/403/404 behavior.
- No database migration is required.
- No feature flag is required because this is a semantic bug fix, not a new feature wave.

## Testing Strategy

Regression coverage will prove:

1. Coach Settings renders Professional Title and Company Name and no stale “Title / Credentials” profile label.
2. Saving the shared form sends `title` and `company` as distinct payload properties.
3. Admin Edit Coach updates the selected coach through `/api/coaches/[id]`.
4. Admin create/update validation accepts and persists Professional Title.
5. Admin coach detail and BIO surfaces display the correct fields.
6. Circle title synchronization updates `Coach.title` and leaves `Coach.company` untouched in default and force modes.
7. The BIO profiles response prefers `title`, then uses Company only as the legacy display fallback.
8. BIO, Solo, and Duo landing defaults prefer Professional Title.
9. Existing template interpolation continues to prefer Professional Title before the legacy fallback.

Targeted Jest suites run before broader lint, migration-safety, and Turbopack build gates.

## Out of Scope

- Adding a third Credentials column
- Guessing or bulk-rewriting historical coach data
- Rewriting existing published landing-page snapshots
- Redesigning landing-page visual layouts
- Refactoring unused legacy template files unless implementation evidence shows they are active

## Acceptance Criteria

- “Master Coach” appears as Professional Title on both admin and coach-facing profile screens.
- “A Step Above” appears as Company Name on both admin and coach-facing profile screens.
- No active profile screen presents `Coach.company` as Title / Credentials.
- Circle synchronization cannot overwrite Company with a Circle title.
- New landing-page defaults use Professional Title consistently.
- Existing database rows and published landing-page snapshots are not migrated or rewritten.
