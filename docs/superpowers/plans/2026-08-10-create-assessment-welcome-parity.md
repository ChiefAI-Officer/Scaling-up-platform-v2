# Create Assessment Welcome Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the existing invited Welcome authoring card on the simplified Create Assessment page and persist its seven authored values atomically with the new template and empty v1 draft.

**Architecture:** Reuse `WelcomeScreenCard` as a controlled create-form child while preserving its existing uncontrolled Build behavior. The server-resolved presentation gate flows from the new-template page into the simplified form; the form validates the shared authoring schema and includes the values in the existing simplified POST. The API accepts that property only while the coordinated presentation capability is active, adds server-owned schema/fine-print fields, and writes the complete config inside the existing template/version transaction.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Prisma 6, Jest, Testing Library, Tailwind CSS, Vercel feature flags.

## Global Constraints

- Work from `/Users/diushianstand/Scaling-up-platform-v2/.worktrees/invited-welcome-authoring-design`; run app commands from its `src/` directory.
- Use test-driven development: add each regression first, observe the expected failure, then write the smallest implementation.
- Create and Build must import the same `WelcomeScreenCard`; do not duplicate markup.
- Preserve the seven authored fields. Keep `schemaVersion`, `finePrint`, disclosure copy, calculated facts, icons, layout, and styles server-owned.
- The card remains collapsed by default, appears after Assessment name and before Advanced, and has no card-level save action.
- Persist the Welcome default inside the existing template/version transaction. Do not issue a follow-up PATCH or pre-create a hidden draft.
- Existing templates and all existing DRAFT, ACTIVE, CLOSED, historical, and PUBLIC campaigns remain unchanged.
- `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL` must restore the prior name-only simplified form and strict payload contract.
- `WAVE_TEMPLATE_CREATION_SIMPLIFIED_*` continues to own whether the simplified route exists. Welcome activates only when both effective capabilities are active.
- Preserve legacy create behavior, generated/manual Internal ID behavior, audit behavior, response shapes, and off/kill contracts.
- No Prisma migration, new dependency, new endpoint, or public-quiz change.

---

## File Map

### Runtime

- `src/src/components/admin/template-editor/WelcomeScreenCard.tsx` — optional controlled expansion and invalid-field focus; unchanged default Build behavior.
- `src/src/components/admin/SimplifiedAssessmentTemplateForm.tsx` — temporary values/errors, shared card, local validation, and enabled payload.
- `src/src/app/(dashboard)/admin/assessments/templates/new/page.tsx` — server-resolved coordinated presentation gate.
- `src/src/app/api/admin/assessment-templates/route.ts` — conditional strict schema and atomic full-config persistence.

### Tests

- `src/src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx`
- `src/src/__tests__/components/admin/simplified-assessment-template-form.test.tsx`
- `src/src/__tests__/app/admin-new-assessment-template-page.test.tsx`
- `src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts`

### Documentation and visual contract

- `docs/superpowers/specs/2026-08-10-create-assessment-welcome-parity-design.md`
- `docs/wireframes-phase2/wave7/26-admin-template-editor-welcome.md`
- `src/public/wireframes-phase2/admin/26-admin-template-editor-welcome.html`
- `CONTEXT.md`, `plans/CHANGELOG.md`, and `CLAUDE.md`

---

### Task 1: Make the shared Welcome card controllable for create validation

**Files:**
- Modify: `src/src/components/admin/template-editor/WelcomeScreenCard.tsx`
- Test: `src/src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx`

**Interfaces:**
- Consumes: existing `InvitedWelcomeAuthoringInputV1` and `WelcomeFieldErrors`.
- Produces: optional props `expanded?: boolean`, `onExpandedChange?: (expanded: boolean) => void`, and `focusField?: keyof InvitedWelcomeAuthoringInputV1 | null`.
- Compatibility: omitting the props preserves the current local collapsed-by-default Build behavior.

- [ ] **Step 1: Write failing controlled-state and focus tests**

Add a test that renders `expanded={false}`, clicks the toggle, and expects `onExpandedChange(true)` without the parent-controlled panel opening. Rerender with `expanded`, `errors={{ headingTemplate: "Heading must contain {{campaignName}}" }}`, and `focusField="headingTemplate"`; expect the Heading input to be focused. Retain the original uncontrolled collapsed-default test.

```tsx
const onExpandedChange = jest.fn();
const view = renderCard({ expanded: false, onExpandedChange });
fireEvent.click(screen.getByRole("button", { name: "Expand Welcome screen" }));
expect(onExpandedChange).toHaveBeenCalledWith(true);
expect(screen.queryByLabelText("Invitation label")).not.toBeInTheDocument();

view.rerender(
  <WelcomeScreenCard
    values={values}
    finePrint={null}
    questions={questions}
    sections={[]}
    isReadOnly={false}
    errors={{ headingTemplate: "Heading must contain {{campaignName}}" }}
    expanded
    onExpandedChange={onExpandedChange}
    focusField="headingTemplate"
    onChange={jest.fn()}
  />,
);
await waitFor(() => expect(screen.getByLabelText("Heading")).toHaveFocus());
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npx jest src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx --runInBand
```

Expected: the new props and parent-controlled behavior are absent.

- [ ] **Step 3: Implement optional controlled expansion and focus**

Add the optional props and derive an effective state:

```tsx
const [localExpanded, setLocalExpanded] = useState(false);
const expanded = controlledExpanded ?? localExpanded;

function setExpanded(next: boolean) {
  if (controlledExpanded === undefined) setLocalExpanded(next);
  onExpandedChange?.(next);
}
```

Use `onClick={() => setExpanded(!expanded)}`. Focus the stable input ID after expansion:

```tsx
React.useEffect(() => {
  if (!expanded || !focusField) return;
  const id = focusField === "ledeParagraphs"
    ? "welcome-ledeParagraphs"
    : `welcome-${focusField}`;
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}, [expanded, focusField]);
```

Do not change the existing markup, labels, helper copy, preview, class names, or message-draft behavior.

- [ ] **Step 4: Run the card suite to green**

```bash
npx jest src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx --runInBand
```

Expected: all original and new card tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/src/components/admin/template-editor/WelcomeScreenCard.tsx src/src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx
git commit -m "feat(admin): make welcome card creation-controllable"
```

---

### Task 2: Render and validate the identical card on Create Assessment

**Files:**
- Modify: `src/src/app/(dashboard)/admin/assessments/templates/new/page.tsx`
- Modify: `src/src/components/admin/SimplifiedAssessmentTemplateForm.tsx`
- Test: `src/src/__tests__/app/admin-new-assessment-template-page.test.tsx`
- Test: `src/src/__tests__/components/admin/simplified-assessment-template-form.test.tsx`

**Interfaces:**
- Consumes: Task 1 card props, `GENERIC_INVITED_WELCOME_CONFIG`, `invitedWelcomeAuthoringInputSchema`, `InvitedWelcomeAuthoringInputV1`, `WelcomeFieldErrors`, and `isAdminOwnedAssessmentPresentationEnabled()`.
- Produces: `SimplifiedAssessmentTemplateForm({ welcomeAuthoringEnabled?: boolean })` and enabled POST field `invitedWelcomeDefault: InvitedWelcomeAuthoringInputV1`.
- Compatibility: the prop defaults to `false`, preserving direct callers and flag-off tests.

- [ ] **Step 1: Write failing page-gate tests**

Mock `isAdminOwnedAssessmentPresentationEnabled()` and have the simplified-form mock expose `data-welcome-enabled`. Assert the prop is `true` only when simplified creation and the coordinated presentation gate are both active, and `false` when presentation is off or killed. Legacy creation must remain unchanged.

```tsx
const mockIsPresentationEnabled = jest.fn();
jest.mock("@/lib/assessments/wave-admin-owned-assessment-presentation-flags", () => ({
  isAdminOwnedAssessmentPresentationEnabled: () => mockIsPresentationEnabled(),
}));
```

- [ ] **Step 2: Write failing form parity and payload tests**

Render `<SimplifiedAssessmentTemplateForm welcomeAuthoringEnabled />`. Assert DOM order is Assessment name → Welcome toggle → Advanced, the card starts collapsed, and expansion exposes all seven labels, `Example campaign`, `0 QUESTIONS`, `0 SECTIONS`, and no card-level Save action.

Edit Invitation label and Welcome message, submit, and expect:

```ts
invitedWelcomeDefault: {
  eyebrow: "Please begin",
  headingTemplate: "{{campaignName}}",
  ledeParagraphs: ["First paragraph.", "Second paragraph."],
  sharingHeading: "How your answers are shared",
  scoresHeading: "Your category scores",
  scoresDescription: "See where the team stands across each category.",
  ctaLabel: "Start the assessment",
}
```

Add a default-prop test proving the card and property are absent and the old payload stays exact.

- [ ] **Step 3: Write failing local-validation tests**

Cover heading without `{{campaignName}}`, unsupported heading token, empty Invitation label, five Welcome paragraphs, CTA longer than 80 characters, and a control character. Each must prevent `fetch`, preserve values, expand the card, expose the shared schema message, and focus the first invalid field.

Use this test shape for each field-specific case:

```tsx
render(<SimplifiedAssessmentTemplateForm welcomeAuthoringEnabled />);
enterName();
fireEvent.click(screen.getByRole("button", { name: "Expand Welcome screen" }));
fireEvent.change(screen.getByLabelText("Heading"), {
  target: { value: "A heading without the required token" },
});
fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

expect(global.fetch).not.toHaveBeenCalled();
expect(screen.getByRole("button", { name: "Collapse Welcome screen" })).toHaveAttribute("aria-expanded", "true");
expect(screen.getByText("Heading must contain {{campaignName}}")).toBeInTheDocument();
await waitFor(() => expect(screen.getByLabelText("Heading")).toHaveFocus());
```

- [ ] **Step 4: Run the page/form tests and verify failure**

```bash
npx jest src/__tests__/app/admin-new-assessment-template-page.test.tsx src/__tests__/components/admin/simplified-assessment-template-form.test.tsx --runInBand
```

Expected: no presentation prop, card, Welcome state, validation, or payload exists.

- [ ] **Step 5: Pass the server gate to the form**

```tsx
const simplified = isTemplateCreationSimplifiedEnabled();
const welcomeAuthoringEnabled = simplified && isAdminOwnedAssessmentPresentationEnabled();
```

```tsx
<SimplifiedAssessmentTemplateForm welcomeAuthoringEnabled={welcomeAuthoringEnabled} />
```

Do not alter auth redirects, headings, guidance, or the legacy form.

- [ ] **Step 6: Add cloned generic state and render the shared card**

```tsx
function initialWelcomeValues(): InvitedWelcomeAuthoringInputV1 {
  return {
    eyebrow: GENERIC_INVITED_WELCOME_CONFIG.eyebrow,
    headingTemplate: GENERIC_INVITED_WELCOME_CONFIG.headingTemplate,
    ledeParagraphs: [...GENERIC_INVITED_WELCOME_CONFIG.ledeParagraphs],
    sharingHeading: GENERIC_INVITED_WELCOME_CONFIG.sharingHeading,
    scoresHeading: GENERIC_INVITED_WELCOME_CONFIG.scoresHeading,
    scoresDescription: GENERIC_INVITED_WELCOME_CONFIG.scoresDescription,
    ctaLabel: GENERIC_INVITED_WELCOME_CONFIG.ctaLabel,
  };
}
```

Render after Assessment name with `finePrint={null}`, `questions={[]}`, `sections={[]}`, controlled expansion, field errors, and `focusField`. On change, merge the patch, clear that field's error, and clear the focus request.

- [ ] **Step 7: Validate before POST and construct one explicit payload**

Parse `welcomeValues` only when enabled. Map the first issue per authoring key into `WelcomeFieldErrors`; on failure, set errors, expand, set the first focus key, and return before `setSubmitting` or `fetch`.

```tsx
const payload: {
  creationMode: "simplified";
  name: string;
  internalId?: string;
  invitedWelcomeDefault?: InvitedWelcomeAuthoringInputV1;
} = {
  creationMode: "simplified",
  name: trimmedName,
  ...(internalIdEdited ? { internalId } : {}),
  ...(invitedWelcomeDefault ? { invitedWelcomeDefault } : {}),
};
```

- [ ] **Step 8: Run the combined UI suites to green**

```bash
npx jest src/__tests__/app/admin-new-assessment-template-page.test.tsx src/__tests__/components/admin/simplified-assessment-template-form.test.tsx src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx --runInBand
```

Expected: new parity tests and all existing identity, collision, latching, error, Cancel, and redirect tests pass.

- [ ] **Step 9: Commit**

```bash
git add 'src/src/app/(dashboard)/admin/assessments/templates/new/page.tsx' src/src/components/admin/SimplifiedAssessmentTemplateForm.tsx src/src/__tests__/app/admin-new-assessment-template-page.test.tsx src/src/__tests__/components/admin/simplified-assessment-template-form.test.tsx
git commit -m "feat(admin): add welcome authoring to assessment creation"
```

---

### Task 3: Validate and persist the Welcome default atomically

**Files:**
- Modify: `src/src/app/api/admin/assessment-templates/route.ts`
- Test: `src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts`

**Interfaces:**
- Consumes: Task 2 `invitedWelcomeDefault?: InvitedWelcomeAuthoringInputV1`, `isAdminOwnedAssessmentPresentationEnabled()`, `invitedWelcomeAuthoringInputSchema`, and `buildInvitedWelcomeConfig(input, finePrint)`.
- Produces: enabled simplified POST persistence of a complete `InvitedWelcomeConfigV1` with `schemaVersion: 1` and `finePrint: null`.
- Compatibility: omission persists `GENERIC_INVITED_WELCOME_CONFIG`; off/kill schemas reject the new property before a transaction; legacy create remains unchanged.

- [ ] **Step 1: Extend the test environment harness**

Add these keys to `simplifiedCreationEnvironment` so every test restores them exactly:

```ts
"WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED",
"WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL",
```

Add:

```ts
function enableWelcomeAuthoring(): void {
  process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
  delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
}
```

- [ ] **Step 2: Write failing enabled persistence tests**

Use this authoring-only fixture:

```ts
const authoredWelcome = {
  eyebrow: "Please begin",
  headingTemplate: "Complete {{campaignName}}",
  ledeParagraphs: ["Paragraph one.", "Paragraph two."],
  sharingHeading: "Who reviews this",
  scoresHeading: "Your scores",
  scoresDescription: "Review your categories.",
  ctaLabel: "Begin",
};
```

Enable both capabilities, POST the fixture, and assert the template transaction receives:

```ts
invitedWelcomeDefault: {
  schemaVersion: 1,
  ...authoredWelcome,
  finePrint: null,
}
```

Assert the version row omits the property, response remains `{ id, alias, versionId }`, and audit remains one post-transaction write.

- [ ] **Step 3: Write failing validation, omission, and rollback tests**

Add exact assertions for enabled omission fallback; rejection of `schemaVersion`, `finePrint`, unsupported heading tokens, five paragraphs, over-limit text, and control characters; off/kill rejection before `$transaction`; old simplified body compatibility; transaction rollback without audit; and unchanged legacy request/response while all flags are enabled.

Use a table for malformed enabled authoring and assert every case stops before persistence:

```ts
it.each([
  { ...authoredWelcome, schemaVersion: 1 },
  { ...authoredWelcome, finePrint: "Mine" },
  { ...authoredWelcome, headingTemplate: "{{respondentName}}" },
  { ...authoredWelcome, ledeParagraphs: ["1", "2", "3", "4", "5"] },
  { ...authoredWelcome, ctaLabel: "x".repeat(81) },
  { ...authoredWelcome, eyebrow: "Bad\u0007copy" },
])("rejects invalid enabled Welcome authoring before a transaction", async (invitedWelcomeDefault) => {
  enableSimplifiedCreation();
  enableWelcomeAuthoring();
  (getApiActor as jest.Mock).mockResolvedValue(adminActor);

  const response = await listPOST(jsonReq(
    "http://localhost/api/admin/assessment-templates",
    { creationMode: "simplified", name: "Test Template", invitedWelcomeDefault },
  ) as never);

  expect(response.status).toBe(400);
  expect(db.$transaction).not.toHaveBeenCalled();
});
```

For flag posture, send the same valid authored body first with the enable variable absent and then with enable plus kill; expect `400` and zero transactions. Separately send `{ creationMode: "simplified", name: "Test Template" }` in both postures; expect `201` and `GENERIC_INVITED_WELCOME_CONFIG` in `assessmentTemplate.create`.

- [ ] **Step 4: Run the CRUD suite and verify failure**

```bash
npx jest src/__tests__/api/admin/assessment-templates/templates-crud.test.ts --runInBand
```

Expected: authored enabled payload is rejected by the current strict schema and the conditional contract is absent.

- [ ] **Step 5: Add one enabled strict schema**

```ts
const SimplifiedCreateWithWelcomeBodySchema =
  SimplifiedCreateBodySchema.extend({
    invitedWelcomeDefault: invitedWelcomeAuthoringInputSchema.optional(),
  }).strict();
```

Select it at request time:

```ts
const welcomeAuthoringEnabled = isAdminOwnedAssessmentPresentationEnabled();
const simplifiedSchema = welcomeAuthoringEnabled
  ? SimplifiedCreateWithWelcomeBodySchema
  : SimplifiedCreateBodySchema;
const parsed = simplifiedSchema.safeParse(body);
```

The base schema remains strict, so off/kill requests cannot supply the new field.

- [ ] **Step 6: Complete and persist the server-owned config**

Initialize a readonly complete config, allowing either the frozen generic constant or a newly built config:

```ts
let effectiveWelcomeDefault: Readonly<InvitedWelcomeConfigV1> =
  GENERIC_INVITED_WELCOME_CONFIG;
```

After an enabled successful parse:

```ts
if (
  welcomeAuthoringEnabled &&
  "invitedWelcomeDefault" in parsed.data &&
  parsed.data.invitedWelcomeDefault
) {
  effectiveWelcomeDefault = buildInvitedWelcomeConfig(
    parsed.data.invitedWelcomeDefault,
    null,
  );
}
```

Use it in the existing `assessmentTemplate.create` data:

```ts
invitedWelcomeDefault:
  effectiveWelcomeDefault as unknown as Prisma.InputJsonValue,
```

Keep the field out of Template Version, content hash, and audit changes. Do not add another database call.

- [ ] **Step 7: Run API and shared-schema suites to green**

```bash
npx jest src/__tests__/api/admin/assessment-templates/templates-crud.test.ts src/__tests__/api/admin/assessment-templates/invited-welcome-default.test.ts src/__tests__/lib/assessments/invited-welcome-config.test.ts --runInBand
```

Expected: all route and schema tests pass.

- [ ] **Step 8: Run the combined create/Build/snapshot matrix**

```bash
npx jest src/__tests__/app/admin-new-assessment-template-page.test.tsx src/__tests__/components/admin/simplified-assessment-template-form.test.tsx src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx src/__tests__/components/admin/template-editor/FormsBuilder.test.tsx src/__tests__/components/admin/template-editor/welcome-screen-save.test.tsx src/__tests__/api/admin/assessment-templates/templates-crud.test.ts src/__tests__/api/admin/assessment-templates/invited-welcome-default.test.ts src/__tests__/api/assessment-campaigns/invited-welcome-snapshot.test.ts src/__tests__/api/assessment-campaigns/me-invited-welcome.test.ts --runInBand
```

Expected: create, Build, snapshot, participant, and rollback contracts all pass.

- [ ] **Step 9: Commit**

```bash
git add src/src/app/api/admin/assessment-templates/route.ts src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts
git commit -m "feat(api): persist created assessment welcome defaults"
```

---

### Task 4: Update visual/domain contracts and produce release evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-08-10-create-assessment-welcome-parity-design.md`
- Modify: `docs/wireframes-phase2/wave7/26-admin-template-editor-welcome.md`
- Modify: `src/public/wireframes-phase2/admin/26-admin-template-editor-welcome.html`
- Modify: `CONTEXT.md`
- Modify: `plans/CHANGELOG.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: completed Tasks 1–3 and their exact verification output.
- Produces: current wireframe, domain language, design status, and release-ready source-of-truth receipt.

- [ ] **Step 1: Extend wireframe 26 before final visual review**

Add a **Create assessment · Welcome collapsed/expanded** state showing Assessment name, the same fixed Welcome card, Advanced/Internal ID after it, and Cancel plus Create and start building as the only page actions. The expanded state must show the seven fields, Example campaign, zero questions, zero sections, and no card-level Save. Update the Markdown acceptance notes to say Create and Build share one component and visual contract.

- [ ] **Step 2: Perform non-Production authenticated visual acceptance**

Using the in-app browser against an authenticated Preview or seeded local environment with both capabilities enabled, inspect desktop collapsed, desktop expanded, 1024px stacked fields-before-preview, and the redirected Build state after a disposable creation. Do not create a Production assessment solely for acceptance. If no safe authenticated environment is available, record that limitation without claiming acceptance.

- [ ] **Step 3: Update domain language and design status**

After Tasks 1–3 are green, change the design status to **Built and locally verified**. Add this sentence to the `CONTEXT.md` Welcome entry without changing campaign snapshot or PUBLIC definitions:

> ADMIN/STAFF can author the template default during simplified assessment creation and later in the draft Build tab; both surfaces use the same Welcome card and validation contract.

- [ ] **Step 4: Run focused tests with the feature enabled**

```bash
WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED=1 WAVE_ED6_SINGLE_COLUMN_ENABLED=1 WAVE_ED9_FORMS_BUILD_ENABLED=1 WAVE_T_QUESTION_EDITOR_ENABLED=1 WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED=1 npx jest src/__tests__/app/admin-new-assessment-template-page.test.tsx src/__tests__/components/admin/simplified-assessment-template-form.test.tsx src/__tests__/components/admin/template-editor/WelcomeScreenCard.test.tsx src/__tests__/components/admin/template-editor/FormsBuilder.test.tsx src/__tests__/components/admin/template-editor/welcome-screen-save.test.tsx src/__tests__/api/admin/assessment-templates/templates-crud.test.ts src/__tests__/api/admin/assessment-templates/invited-welcome-default.test.ts src/__tests__/api/assessment-campaigns/invited-welcome-snapshot.test.ts src/__tests__/api/assessment-campaigns/me-invited-welcome.test.ts --runInBand
```

Expected: zero failed tests.

- [ ] **Step 5: Run the coordinated kill matrix**

```bash
WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED=1 WAVE_ED6_SINGLE_COLUMN_ENABLED=1 WAVE_ED9_FORMS_BUILD_ENABLED=1 WAVE_T_QUESTION_EDITOR_ENABLED=1 WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED=1 WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL=1 npx jest src/__tests__/app/admin-new-assessment-template-page.test.tsx src/__tests__/components/admin/simplified-assessment-template-form.test.tsx src/__tests__/api/admin/assessment-templates/templates-crud.test.ts --runInBand
```

Expected: the name-only form, old strict payload, and generic server default pass.

- [ ] **Step 6: Run lint and repository gates**

```bash
git diff --name-only origin/main...HEAD -- '*.ts' '*.tsx' | sed 's#^src/##' | xargs npx eslint
npx prisma generate
node scripts/check-migration-safety.mjs
npx jest --runInBand
CI=true WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED=1 WAVE_ED6_SINGLE_COLUMN_ENABLED=1 WAVE_ED9_FORMS_BUILD_ENABLED=1 WAVE_T_QUESTION_EDITOR_ENABLED=1 WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED=1 npx next build --turbopack
CI=true WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED=1 WAVE_ED6_SINGLE_COLUMN_ENABLED=1 WAVE_ED9_FORMS_BUILD_ENABLED=1 WAVE_T_QUESTION_EDITOR_ENABLED=1 WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED=1 WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL=1 npx next build --turbopack
```

Expected: ESLint has no errors; Prisma generation, migration safety, complete Jest, and both Turbopack builds pass. Record exact suite/test/snapshot and static-page totals.

- [ ] **Step 7: Write the release-ready receipt**

Prepend `create-assessment-welcome-parity-release-ready` to `plans/CHANGELOG.md` with exact behavior, atomicity, off/kill behavior, existing-campaign/PUBLIC isolation, verification totals, visual evidence or limitation, and confirmation that implementation changed no Production template, campaign, response, email, flag, or database row. Update the one `CLAUDE.md` anchor and active-item summary to match.

- [ ] **Step 8: Verify documentation and diff hygiene**

```bash
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
git diff --check
git status --short --branch
git diff --stat origin/main...HEAD
```

Expected: changelog freshness passes 4/4 assertions, diff check is silent, and only the listed in-scope files changed.

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/specs/2026-08-10-create-assessment-welcome-parity-design.md docs/wireframes-phase2/wave7/26-admin-template-editor-welcome.md src/public/wireframes-phase2/admin/26-admin-template-editor-welcome.html CONTEXT.md CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(assessments): record create welcome parity readiness"
```

---

## Final Review Checklist

- [ ] Create and Build import the same `WelcomeScreenCard`.
- [ ] Create order is Assessment name → Welcome → Advanced → actions.
- [ ] The card is collapsed by default and expands to the same seven fields and preview.
- [ ] Generic defaults are cloned; no readonly array is mutated.
- [ ] Local errors prevent POST, expand the card, remain accessible, and focus the first invalid field.
- [ ] Enabled POST carries authoring fields only; the API supplies `schemaVersion: 1` and `finePrint: null`.
- [ ] Template, Welcome default, and v1 draft are one transaction.
- [ ] Omission remains compatible; off/kill rejects the property and keeps generic persistence.
- [ ] Legacy create, Internal ID retries/collisions, audit, response shape, and redirect remain unchanged.
- [ ] Existing invited campaign snapshots and PUBLIC campaigns are untouched.
- [ ] Focused, kill, complete, lint, migration, changelog, diff, and dual-build gates have fresh evidence.
- [ ] Visual acceptance is demonstrated safely or explicitly recorded as unavailable.
