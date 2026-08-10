# Create Assessment Welcome Parity

**Status:** Built and locally verified
**Date:** 2026-08-10  
**Scope:** ADMIN/STAFF simplified assessment creation and the existing invited Welcome authoring contract

## 1. Problem

The shipped ADMIN/STAFF assessment editor exposes the invited respondent Welcome screen as a fixed card at the top of **Build**. The simplified **Create assessment** route still asks only for an assessment name and Internal ID, then silently creates the template with generic Welcome defaults.

That makes new-assessment creation and later assessment editing inconsistent. An administrator cannot see or customize the Welcome screen while creating an assessment, even though the created assessment already owns that content.

## 2. Outcome

The simplified **Create assessment** page includes the same `WelcomeScreenCard` used in Build, directly below **Assessment name**. The seven authored values are validated and persisted atomically with the template and its empty v1 draft. After creation, Build shows exactly the Welcome content entered on the creation page.

## 3. Goals

1. Give new-assessment creation 1:1 Welcome-card parity with Build.
2. Reuse the shipped card, labels, collapsed state, helper text, field constraints, and respondent preview.
3. Initialize the card with the generic invited Welcome defaults.
4. Persist the authored Welcome content in the same transaction as the new template and v1 draft.
5. Prevent creation when Welcome validation fails and show errors on the matching fields.
6. Keep the name-only journey simple: the Welcome card is collapsed until the administrator chooses to edit it.
7. Preserve the direct redirect to the new draft's Build tab.
8. Preserve default-off and kill-switch behavior.

## 4. Non-goals

This change does not:

- embed the complete sections-and-questions builder before a template version exists;
- create a hidden or provisional template when the page opens;
- add a second save request after template creation;
- change the seven Welcome fields or expose server-owned fine print, disclosure copy, calculated facts, icons, layout, or styles;
- change existing assessment templates or any DRAFT, ACTIVE, CLOSED, or historical campaign;
- change PUBLIC campaign or public-quiz Welcome behavior;
- change Coach campaign creation or report rendering;
- change the Prisma schema or run a data migration; or
- redesign the legacy creation fallback.

## 5. Approaches Considered

### 5.1 Reuse the controlled card and create atomically — selected

The creation form owns temporary Welcome authoring state, renders the existing card, validates with the shared authoring schema, and sends the values in the existing simplified creation request. The server constructs the full config with server-owned fields and creates the template and v1 draft in one transaction.

This gives visual and behavioral parity without duplicating the persisted template editor or leaving partial records.

### 5.2 Create the template, then PATCH the Welcome default — rejected

This avoids extending the creation payload, but it requires two writes. A failed PATCH would redirect to an assessment whose Welcome content does not match what the administrator entered.

### 5.3 Pre-create a hidden draft and mount the full editor — rejected

This would reuse the editor save model directly, but opening or abandoning the page would create orphaned assessment drafts. It also broadens the request from Welcome parity into a new provisional-document lifecycle.

## 6. Approved User Experience

Location:

`Admin → Assessments → Templates → Create assessment`

The simplified page order is:

1. **Assessment name**;
2. the existing nearly full-width **Welcome screen** card;
3. the collapsed **Advanced** disclosure containing **Internal ID**;
4. any form-level error; and
5. **Cancel** plus **Create and start building**.

The Welcome card is the same component as Build and remains collapsed by default. Its summary, expansion control, helper copy, labels, field order, live preview, and responsive stacking are unchanged. There is no card-level save action.

The seven editable fields remain:

- Invitation label;
- Heading, including the required `{{campaignName}}` token;
- Welcome message, supporting one to four paragraphs;
- Sharing heading;
- Scores heading;
- Scores explanation; and
- Button label.

The card starts with `GENERIC_INVITED_WELCOME_CONFIG` authoring values. The preview uses the existing `Example campaign` heading behavior and receives empty question and section collections, so it truthfully shows zero questions and zero sections until content is added in Build.

The primary action remains **Create and start building**. It is the only persistence action on this page.

## 7. Client State and Validation

`SimplifiedAssessmentTemplateForm` owns a controlled `InvitedWelcomeAuthoringInputV1` state initialized from a cloned generic default. It also owns `WelcomeFieldErrors` for the shared card.

On field change, the form updates only the changed Welcome key and clears the corresponding error. The existing card preserves sequential blank-line typing through its local message draft and `splitWelcomeMessage` mapping.

On submit, the form validates in this order:

1. assessment name;
2. Internal ID rules when relevant; and
3. `invitedWelcomeAuthoringInputSchema`.

If Welcome validation fails:

- no network request is sent;
- entered values remain in place;
- schema issues map to the corresponding card fields;
- the Welcome card expands so the errors are visible; and
- the first invalid Welcome control receives focus.

To support programmatic expansion and first-invalid focus without forking the UI, `WelcomeScreenCard` gains narrow optional control hooks. Build retains its current uncontrolled collapsed-by-default behavior when those props are omitted.

The page's existing collision, rate-limit, network, response-shape, submit-latching, Cancel, and redirect behavior remain unchanged.

## 8. API and Atomic Persistence

When the coordinated ADMIN-owned presentation feature is active, the strict simplified creation schema accepts one additional optional property:

```ts
invitedWelcomeDefault?: InvitedWelcomeAuthoringInputV1
```

The property name matches the template field, but the request accepts authoring fields only. `schemaVersion` and `finePrint` remain forbidden and server-owned.

The server validates the property with `invitedWelcomeAuthoringInputSchema` and builds the stored `InvitedWelcomeConfigV1` with:

- `schemaVersion: 1`; and
- `finePrint: null`, matching the generic new-template default.

The existing template-and-version transaction writes that full config directly to `AssessmentTemplate.invitedWelcomeDefault`. If an enabled simplified caller omits the property, the server keeps the current generic default for compatibility.

No post-create PATCH is used. If template creation, Welcome persistence, or v1 creation fails, the transaction rolls back the whole assessment.

Requests using the legacy creation body remain unchanged and continue to receive the server's generic Welcome default. When the presentation flag is off or killed, the simplified UI omits the card and payload property, and the endpoint retains the prior strict request contract and generic persistence behavior.

## 9. Data and Lifecycle Boundaries

The new value is a template default only. It is not a campaign snapshot until a future INVITED campaign is created through the already-shipped snapshot path.

Therefore:

- creating the assessment changes no existing campaign;
- later template edits affect only future campaign snapshots;
- every already-created campaign remains immutable;
- PUBLIC campaigns remain null for invited Welcome snapshots; and
- no backfill or migration is required.

## 10. Accessibility and Responsive Behavior

The reused card retains its existing semantic section, labelled inputs, error descriptions, expansion button, focus rings, and desktop-to-1024px stacking behavior.

The create-flow addition must also ensure:

- validation-driven expansion updates `aria-expanded` and exposes the error controls;
- the first invalid field is focused after expansion;
- errors use the existing field-level accessible descriptions;
- the submit button remains latched during the request; and
- keyboard order follows name → Welcome card → Advanced → actions.

## 11. Testing

### Component coverage

- The simplified creation form renders the identical Welcome card when the coordinated feature is enabled.
- The card is below Assessment name and before Advanced/actions.
- It starts collapsed with cloned generic defaults.
- Expanding shows all seven fields and the respondent preview.
- The preview receives zero questions and zero sections.
- Editing fields changes the submitted authoring payload.
- Invalid heading tokens, empty fields, paragraph limits, length limits, and control characters prevent the POST, expand the card, show field errors, and focus the first invalid field.
- A valid request includes the Welcome authoring object and still redirects to Build.
- Collision, rate-limit, request failure, malformed success, duplicate-submit, Cancel, and Internal ID behavior remain covered.

### Route coverage

- Enabled simplified create accepts valid Welcome authoring fields and persists the full config atomically.
- Omitted Welcome fields still persist the generic config.
- Client attempts to supply `schemaVersion` or `finePrint` fail validation.
- Invalid Welcome input creates neither template nor version.
- Generated and manual Internal ID collision behavior remains unchanged.
- Flag-off and killed requests retain the old strict request contract and generic persistence.
- Legacy create behavior and response shape remain unchanged.

### Parity and regression coverage

- The Create and Build surfaces import the same `WelcomeScreenCard` rather than separate markup.
- Existing Build authoring, Save Draft, campaign snapshot, participant Welcome, PUBLIC isolation, Coach report-style ownership, and flag-off/kill suites remain green.
- Changed-file ESLint, migration safety, complete Jest, changelog freshness, diff hygiene, and both enabled and enabled-plus-kill Turbopack builds remain required before release.

## 12. Rollout and Rollback

This is an extension of the launched `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED` capability, not a new subsystem. The existing kill switch remains the containment control.

With the enable flag active and kill absent, Create shows and persists the Welcome card. Setting the kill restores the prior name-only simplified form and server-owned generic default without removing stored Welcome content.

Production acceptance should be write-free unless an explicitly authorized disposable assessment is available. Safe acceptance can confirm page composition on Preview or a seeded environment; Production health and unauthenticated safety checks remain separate from authenticated visual acceptance.

## 13. Acceptance Criteria

1. A new assessment creator can inspect and edit the same Welcome card available in Build.
2. The card is collapsed by default and does not compromise the simple name-first journey.
3. The seven fields, preview, validation, responsive behavior, and accessibility are 1:1 with Build.
4. **Create and start building** atomically persists the assessment, Welcome default, and v1 draft.
5. Build opens with exactly the Welcome content entered during creation.
6. Invalid Welcome content creates no database record.
7. Existing templates, existing campaigns, PUBLIC campaigns, and legacy creation remain unchanged.
8. The existing presentation kill switch restores the prior creation behavior.
