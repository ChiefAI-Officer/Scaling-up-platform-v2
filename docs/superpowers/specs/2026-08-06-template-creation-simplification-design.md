# Template Creation Simplification and Scoring Language Cleanup

**Status:** Approved and implementation-planned
**Date:** 2026-08-06
**Scope:** Admin assessment-template creation and the existing Scoring & Tiers authoring tab
**Source:** August 5, 2026 Scaling Up touch point with Jeff Verdun

## 1. Problem

The admin has two separate template-authoring experiences:

- `/admin/assessments/templates/new` uses the original `AssessmentTemplateForm`.
- `/admin/assessments/templates/[id]/versions/[versionId]/edit` uses the current ED9/ED10 editor.

All recent editor improvements landed only on the second route. The creation form therefore hardcodes every question as `SLIDER_LIKERT`, exposes raw implementation terms, uses arrow-button reordering, has no real preview, and duplicates content-editing logic that the current editor already owns.

This prevents Jeff from creating new assessments even though editing an existing assessment is already simple and capable.

The Scoring & Tiers tab in the current editor also exposes terms such as `countAchieved`, `minMetric`, `maxMetric`, “unbounded,” “Zod refine,” and internal project labels. Jeff could not tell whether tiers belonged to an assessment or a section.

## 2. Outcome

Creating an assessment becomes a short handoff into the real editor:

1. Name the assessment.
2. Create one empty persisted v1 draft.
3. Open that draft's Build tab.
4. Author sections and questions with the existing FormsBuilder and four-type picker.

The same release changes the existing Scoring & Tiers presentation to plain language without changing its stored data or calculations.

## 3. Goals

1. Make the creation screen require only an assessment name.
2. Generate the required unique Internal ID from the name and expose it under Advanced.
3. Create the template and empty v1 draft atomically.
4. Redirect directly to the current Build tab.
5. Reuse the current section builder, question cards, drag-and-drop behavior, Preview, Settings, version lifecycle, publish readiness, and question-type picker.
6. Preserve the four live question types:
   - Slider
   - Short text
   - Number
   - Multiple choice
7. Explain assessment-wide scoring and tiers in ordinary language.
8. Preserve every existing scoring enum, payload, formula, range rule, and publication check.
9. Support a dark launch and immediate kill-switch rollback.

## 4. Non-goals

This release does not:

- add a question type;
- change question-type locking after publication;
- introduce an unsaved or embedded copy of FormsBuilder;
- change assessment scoring, tier resolution, reports, findings, or submissions;
- add per-section tiers;
- change the Prisma schema or run a data migration;
- pre-populate placeholder sections, questions, or tiers;
- change campaign creation or Esperto imports;
- redesign Preview, Settings, Versions, or Test Mode;
- remove the legacy creation form before the rollout fallback is retired separately; or
- perform unrelated editor refactoring.

## 5. Approaches Considered

### 5.1 Thin creation step, then the real editor — selected

Collect the minimum immutable identity, persist an empty v1 draft, and redirect to the existing Build tab.

This creates one authoring system. It is the smallest change that permanently prevents the creation and edit paths from drifting.

### 5.2 Pre-populated starter draft — rejected

Create a default section and blank question.

This saves one or two clicks but guesses at the assessment structure, creates placeholder content that must be corrected, and makes readiness state less obvious.

### 5.3 Embed the builder in the creation page — rejected

Render FormsBuilder before a version exists.

FormsBuilder consumes a `TemplateEditorModel` whose save path is bound to a persisted template-version ID. Supporting a versionless builder would require a second document model and save lifecycle. That is the duplication this change is intended to remove.

## 6. Approved User Experience

### 6.1 Creation screen

Location:

`Admin → Assessments → Templates → New assessment`

The page contains:

- heading: **Create assessment**;
- explanatory copy: **Give it a name. You'll add questions and settings in the editor next.**;
- one required field: **Assessment name**;
- collapsed **Advanced** disclosure containing **Internal ID**;
- secondary action: **Cancel**; and
- primary action: **Create and start building**.

There are no sections, questions, invitation-email fields, scoring controls, report JSON, language selector, or aggregation selector on this screen.

### 6.2 Internal ID behavior

The Internal ID is the existing template alias. The friendly label hides the implementation term “alias.”

While the operator has not edited the Internal ID manually:

- it regenerates from the assessment name;
- letters are lowercased;
- whitespace and separator runs become one dash;
- characters outside the existing alias contract are removed;
- leading and trailing dashes are removed; and
- the existing 80-character API limit is honored.

Once the operator edits the Internal ID, later name changes do not overwrite it.

When an automatically generated ID is already used, the server retries with the
next numeric suffix: `team-health`, `team-health-2`, `team-health-3`, and so
on. The retry is bounded; exhausting the bound expands Advanced and asks the
operator to enter an Internal ID. This keeps the normal journey name-only
without an unbounded client request loop.

The simplified request is a narrow, discriminated branch of the existing
creation endpoint. The legacy request and `409` collision contract remain
unchanged.

Once the operator has manually edited the Internal ID, the application never changes
it silently. A `409` collision then:

1. keeps the entered assessment name;
2. expands Advanced;
3. focuses the Internal ID field; and
4. shows **That Internal ID is already in use. Choose another one.**

If the assessment name cannot produce a valid Internal ID, Advanced expands and asks the operator to enter one.

### 6.3 Successful creation

The primary action:

1. disables while the request is in flight;
2. posts the name and, only when manually edited, the Internal ID;
3. receives both the template ID and v1 version ID; and
4. navigates to:

```text
/admin/assessments/templates/{templateId}/versions/{versionId}/edit?tab=questions
```

The explicit `?tab=questions` is required because ED10 makes Preview the parameterless default. A newly created empty assessment must land in Build, not on an empty Preview.

### 6.4 Initial Build state

The existing FormsBuilder renders:

- the new assessment name;
- zero questions;
- zero sections;
- the existing optional description editor; and
- the existing empty-state message and **+ Add section** action.

No placeholder content is stored.

After the operator adds a section and question, the question card uses the existing `QuestionTypePicker`. It exposes Slider, Short text, Number, and Multiple choice under the same Wave T gate and the same published-question locking rules as existing templates.

## 7. Persistence and Data Flow

### 7.1 Creation payload

The simplified form sends only:

| Field | Value |
| --- | --- |
| `creationMode` | `"simplified"` |
| `name` | Trimmed operator input |
| `internalId` | Omitted while generated; included only after manual editing |

The server owns the persisted defaults:

| Persisted field | Initial value |
| --- | --- |
| `alias` | Generated from `name`, or the manually supplied `internalId` |
| `description` | `null` |
| `invitationSubject` | Existing starter subject |
| `invitationBodyMarkdown` | Existing starter message |
| `aggregationMode` | `FULL_VISIBILITY` |
| `language` | `enUS` |
| `questions` | `[]` |
| `sections` | `[]` |
| `scoringConfig` | `{ tierMetric: "countAchieved", passThreshold: 0, tiers: [] }` |
| `reportConfig` | `null` |

`enUS` is deliberate. It matches `DEFAULT_TEMPLATE_LANGUAGE`, the seeded version convention, and campaign Active-version resolution. The legacy creation form's `en` value must not be carried forward.

The invitation subject and message are copied byte-for-byte from the current
`AssessmentTemplateForm` starter values into server constants. Changing
invitation copy is outside this release; the operator may edit it later in
Settings.

### 7.2 Atomic create

The existing `POST /api/admin/assessment-templates` remains the owner of:

1. the `AssessmentTemplate` row; and
2. its unpublished `AssessmentTemplateVersion` v1 row.

When `creationMode` is `"simplified"` and the effective release gate is active,
the route validates the narrow request, applies the server defaults, and retries
generated-alias collisions inside the single rate-limited request. Each failed
unique attempt rolls back before the next suffix is tried.

The simplified response includes the created version's ID:

```json
{
  "success": true,
  "data": {
    "id": "template-id",
    "alias": "internal-id",
    "versionId": "version-id"
  }
}
```

Requests without `creationMode: "simplified"` retain the exact legacy schema,
transaction behavior, collision response, and response shape in every flag
state. This keeps the project's flag-off byte-identity contract while giving
the new form the ID it needs for the direct Build redirect.

### 7.3 Draft and publish boundaries

Empty sections, questions, and tiers are legal draft state.

The existing editor remains responsible for subsequent PATCHes. The existing publish-readiness and publish validation paths prevent the draft from being published until its content and tier configuration are valid.

Creation does not add a second validation engine or special publish bypass.

## 8. Scoring & Tiers Plain-Language Contract

This work changes author-visible copy only. Raw values remain the serialization contract and never appear as option labels.

### 8.1 Primary labels

| Current visible text | Approved text |
| --- | --- |
| Scoring Configuration | How results are calculated |
| Tier Metric | Overall result is based on |
| `countAchieved` | Questions passed |
| `overallTotal` | Sum of all answers |
| `overallAvg` | Average across all questions |
| Pass Threshold | A question passes at |
| Tiers | Overall result tiers |
| `minMetric` | Starts at |
| `maxMetric` | Ends at |
| Label | Result name |
| Message | Message shown |
| `(unbounded)` | No maximum |
| Add Tier | Add tier |

The helper below **A question passes at** states that it is used only when **Questions passed** is selected.

### 8.2 Explanation

The overall tiers section leads with:

> Tiers apply to the whole assessment—not to individual sections. Together, the ranges must cover every possible overall result without gaps.

The tab must not expose implementation or project-history language such as:

- `countAchieved`;
- `overallTotal`;
- `overallAvg`;
- `minMetric`;
- `maxMetric`;
- “Zod refine”;
- “Gap D”;
- “D2 extension”; or
- “tier resolution.”

### 8.3 Remaining author-visible cleanup

Other visible strings on this tab follow the same rule:

- **Global tiers** becomes **Overall result tiers**.
- **Per-domain tiers** becomes **Results by area**.
- **Preview — Tier Resolution** becomes **Example result**.
- The midpoint simulation is described as an example using middle answers.
- The validation card is headed **Before you can publish**.
- Gap and overlap errors use “starts,” “ends,” “score,” and “range,” not stored field names.
- The unavailable-band message says the visual range editor is unavailable for the selected method and directs the operator to the table.

The existing slider wording **Label for the lowest point** and **Label for the highest point** is already plain language and remains unchanged.

Domain keys, domain membership, calculations, and saved payloads remain unchanged.

## 9. Failure Behavior

| Failure | Behavior |
| --- | --- |
| Blank name | Inline required-field error; no request |
| Invalid generated ID | Expand Advanced and request a valid Internal ID |
| Duplicate generated Internal ID | Server retries with the next numeric suffix inside the same request |
| Generated-ID retry bound exhausted | Preserve the name, expand Advanced, focus Internal ID, ask the operator to enter one |
| Duplicate manually edited Internal ID | Preserve input, expand Advanced, focus the field, show collision copy |
| Rate limit | Preserve input and show a retry-later message |
| Authentication/authorization loss | Follow the existing admin error/session behavior; create nothing |
| Network or server error | Preserve input and show **We couldn't create this assessment. Try again.** |
| Repeated click | Ignore while the first request is in flight |
| Transaction failure | Roll back both rows; no orphan template or version |

No optimistic navigation occurs before the server returns both IDs.

## 10. Feature Gate and Rollback

Use:

```text
WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED
WAVE_TEMPLATE_CREATION_SIMPLIFIED_KILL
```

The kill switch overrides enablement.

The effective gate is true only when the new release flag and the already-live
editor prerequisites are all active:

- `WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED`;
- ED6 single-column editor;
- ED9 Forms Build; and
- Wave T question-type unlock.

The new kill switch still overrides the complete result. This prevents the
creation screen from promising the current Build/type-picker experience when a
prerequisite has been killed.

The effective gate controls the complete approved package:

- simplified creation screen;
- direct Build redirect; and
- Scoring & Tiers plain-language presentation.

Flag off or killed:

- the existing creation form remains available;
- the existing Scoring & Tiers copy remains unchanged; and
- simplified-mode requests are unavailable while the legacy API preserves its
  exact request and response contract.

The simplified server branch persists `enUS` explicitly. This release does not
alter the legacy form's request or globally change unrelated API callers.

Launch dark, verify both flag states, enable in production, and visually smoke the creation-to-Build journey. Rollback is the kill switch plus redeploy; no data cleanup is required because both paths create the same two persisted models.

## 11. Component Boundaries

Planning should preserve these responsibilities:

1. **Creation presentation**
   - Owns name, a preview of the derived Internal ID, Advanced disclosure, validation presentation, and submitting state.
   - Knows nothing about section, question, scoring, or report editing.
2. **Creation API**
   - Owns authorization, rate limiting, narrow-mode validation, generated-ID
     collision retries, persisted defaults, the atomic transaction, content
     hash, audit log, and created IDs.
3. **Existing template editor**
   - Owns all post-create authoring and persistence.
   - Receives no special “new template” mode.
4. **Scoring presentation adapter**
   - Maps raw metric values and stable validation issue codes to approved labels.
   - Selects legacy or friendly copy only at the rendering boundary.
   - Does not fork validation rules or translate or reshape stored payloads.
5. **Feature resolver**
   - Owns enable/kill precedence.
   - Supplies one resolved boolean to the affected admin surfaces.

FormsBuilder, FormQuestionCard, QuestionTypePicker, scoring functions, schemas, and publish rules must not be forked.

## 12. Accessibility

- Assessment name and Internal ID use persistent visible labels.
- Advanced is a real button with `aria-expanded` and a controlled region.
- Collision handling moves focus only after the failed response and announces the error.
- Inline errors are associated with their fields.
- The submit button exposes its busy/disabled state without changing its accessible name unexpectedly.
- Existing FormsBuilder and QuestionTypePicker keyboard, focus, screen-reader announcement, and lock behavior remain unchanged.
- Plain-language scoring changes preserve table semantics and programmatic input labels.
- No meaning relies only on color.

## 13. Verification and Acceptance

Implementation follows test-driven development.

### 13.1 Creation component

Tests prove:

- name input generates the expected Internal ID;
- generation continues until manual ID editing;
- manual ID survives later name edits;
- invalid or empty IDs expand Advanced;
- `409` preserves the name, expands Advanced, focuses the ID, and shows the approved message;
- submit disables during the request;
- the payload contains only simplified mode, name, and an optional manually edited Internal ID;
- a successful response redirects to the exact Build URL; and
- flag off renders the legacy creation surface.

### 13.2 Creation API

Tests prove:

- empty questions, sections, and tiers are accepted as draft content;
- the transaction creates exactly one template and one unpublished v1;
- simplified mode accepts only name plus an optional manually edited Internal ID;
- simplified mode owns the exact empty-draft defaults;
- generated collisions retry through numeric suffixes within a fixed bound;
- manual collisions remain `409`;
- the simplified response includes `versionId`;
- flag off preserves the exact legacy response body;
- the content hash and audit entry still occur;
- legacy and manually entered collisions remain `409`; and
- authorization, validation, rate limiting, and transaction failure behavior remain intact.

### 13.3 Existing editor

Tests prove:

- the empty FormsBuilder state still offers only its existing **+ Add section** action;
- empty Preview remains graceful and non-submittable;
- adding a question mounts the existing four-type picker;
- question types retain the same Wave T and inheritance locks; and
- incomplete drafts remain unpublishable through the canonical readiness path.

### 13.4 Scoring copy

Tests prove:

- each approved friendly label appears for its raw value;
- raw enums and forbidden engineering terms do not render while the feature is active;
- flag off preserves the previous text;
- tier edits emit the same raw values and payload shape; and
- tier validation behavior is unchanged while stable issue codes select the
  appropriate legacy or friendly rendering copy.

### 13.5 Required gates

Before a code push, run from `src/`:

```bash
npx eslint <changed files>
npx jest <targeted test files> --runInBand
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

After deployment, visually verify:

1. New assessment asks only for a name.
2. Advanced exposes the generated Internal ID.
3. Creation opens the new draft's Build tab.
4. Add section → add question exposes all four question types.
5. Preview, Settings, Scoring & Tiers, and Versions load for the empty/new draft.
6. Scoring & Tiers contains no raw enum or schema terminology.
7. The kill switch restores the legacy surfaces after redeploy.

## 14. Approved Acceptance Summary

The release is complete when an admin can name an assessment, enter the existing editor, add any supported question type, save incomplete draft work, understand assessment-wide tiers without implementation jargon, and remain unable to publish invalid content.

There is one persisted template/version model, one Build editor, one question-type picker, and one scoring engine.
