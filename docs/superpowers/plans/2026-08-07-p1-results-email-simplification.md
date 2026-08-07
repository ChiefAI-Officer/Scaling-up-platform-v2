# P1 Respondent Results Email Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing respondent-results email controls honest and reachable: one working first-name token, clear admin availability/default wording, and editable email choices on existing campaigns.

**Architecture:** Extend the existing Results email renderer, campaign PATCH route, campaign read model, and shared `CampaignDetail` component directly. Reuse current Prisma fields, flags, approval hash, immediate-save echo guard, outbox, and locked send-time authorization; add no schema, endpoint, feature flag, generic token engine, or settings framework.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Prisma, Jest, Testing Library, ESLint, Turbopack.

## Global Constraints

- Authoritative design: `docs/superpowers/specs/2026-08-07-p1-results-email-simplification-design.md`.
- Before Task 1, claim the P1 row in GitHub issue `#261`, rebase onto the latest `origin/main`, and complete the repository's required co-validation gate.
- Do not change the Prisma schema or add a migration, route, feature flag, email type, token framework, notification framework, settings framework, or unrelated refactor.
- The only Results email token is exactly `{{respondentFirstName}}`; do not add a spaced alias or fallback word.
- Exact admin copy:
  - **Allow coaches to enable results emails for respondents**
  - **Coaches decide separately for each campaign.**
  - **Pre-select for new campaigns**
  - **New campaigns start with respondent results emails enabled.**
- Saving edited Results email content must continue clearing approval.
- `sendResultsDefault` must remain independently editable while copy is unapproved and must never clear approval.
- Enabling `sendResultsToRespondent` requires `waveDResultsEmailEnabled()` and current `isResultsEmailApproved(template)` truth.
- `notifyCoachOnCompletion` remains independently gated by `waveDCoachNotifyEnabled()`.
- Do not relax or restructure submit-time locked authorization, outbox creation, delivery-intent reauthorization, or report rendering.
- Preserve the merged report-comparison MVP's CEO self-access CTA, URL validation, and locked authorization exactly; first-name personalization composes with that path and does not replace or bypass it.
- CLOSED campaigns remain read-only.
- Keep active Settings and ED10 flag-off Metadata behavior aligned.
- Before any push, update `CLAUDE.md` and `plans/CHANGELOG.md`, run targeted tests, changed-file ESLint, migration safety, and `CI=true npx next build --turbopack`.

## File Structure

No production file is created. Existing responsibilities remain in place:

- `src/src/lib/assessments/results-email.ts` — exact first-name substitution and Results email safety.
- `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts` — passes authoritative respondent data to the renderer.
- `src/src/components/admin/template-editor/SettingsTab.tsx` — active simple Results email composer and exact admin wording.
- `src/src/components/admin/template-editor/MetadataTab.tsx` — flag-off rollback copy and one-token promise.
- `src/src/lib/validations.ts` — existing campaign PATCH input contract.
- `src/src/app/api/assessment-campaigns/[id]/route.ts` — authorized writes to existing campaign fields.
- `src/src/lib/assessments/campaign-detail.ts` — stored campaign values in the shared read model.
- `src/src/app/(portal)/portal/assessments/[id]/page.tsx` — coach-host capability computation.
- `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx` — admin-host capability computation.
- `src/src/components/assessments/CampaignDetail.tsx` — shared existing-campaign controls and optimistic persistence.
- `src/src/__tests__/api/assessment-campaigns/patch-email-notifications.test.ts` — new PATCH contract coverage.
- `src/src/__tests__/components/assessments/campaign-detail-email-notifications.test.tsx` — new shared UI contract coverage.

---

### Task 1: Implement the one-token Results email contract

**Files:**
- Modify: `src/src/lib/assessments/results-email.ts:17-85`
- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts:224-322`
- Test: `src/src/__tests__/assessments/results-email.test.ts`
- Test: `src/src/__tests__/app/org-survey/submit.test.ts`

**Interfaces:**
- Produces: `renderResultsEmailSubject(subject: string, respondentFirstName: string): string`
- Changes: `renderResultsEmailBodyHtml(markdown: string, respondentFirstName: string): string`
- Changes: `BuildResultsEmailArgs` gains required `respondentFirstName: string`
- Consumes: the existing invited respondent `{ email, firstName, lastName }`
- Extends: the existing Phase-1/Phase-2 #15 render-input fingerprint with the respondent first name
- Preserves: `buildResultsEmailHtml(args): string` remains the body-plus-report-plus-optional-CEO-CTA builder
- Preserves: existing `ceoSelfAccessUrl?: string | null`, safe URL validation, CTA markup, and locked Phase-2 authorization from PR #314

- [ ] **Step 1: Add failing renderer tests for the exact token**

Update the existing imports and tests in `results-email.test.ts`:

```ts
import {
  renderResultsEmailSubject,
  renderResultsEmailBodyHtml,
  buildResultsEmailHtml,
  buildCoachNotifyEmail,
} from "@/lib/assessments/results-email";

describe("respondent first-name personalization", () => {
  it("replaces every exact subject token and strips subject control characters", () => {
    expect(
      renderResultsEmailSubject(
        "{{respondentFirstName}} — results for {{respondentFirstName}}",
        "Ja\r\nne",
      ),
    ).toBe("Jane — results for Jane");
  });

  it("replaces the body token after markdown parsing and HTML-escapes the name", () => {
    const html = renderResultsEmailBodyHtml(
      "Hi {{respondentFirstName}},\n\nYour results are ready.",
      "**<Jane>**",
    );
    expect(html).toContain("Hi **&lt;Jane&gt;**,");
    expect(html).not.toContain("<Jane>");
    expect(html).not.toContain("<strong>&lt;Jane&gt;</strong>");
  });

  it("leaves unsupported token-like text literal", () => {
    const html = renderResultsEmailBodyHtml(
      "{{templateName}} {{tierLabel}} {{tierMessage}} {{perSectionList}}",
      "Jane",
    );
    expect(html).toContain("{{templateName}}");
    expect(html).toContain("{{tierLabel}}");
    expect(html).toContain("{{tierMessage}}");
    expect(html).toContain("{{perSectionList}}");
  });
});
```

Add `respondentFirstName: "Jane"` to every existing `buildResultsEmailHtml` call and a second argument such as `"Jane"` to every existing `renderResultsEmailBodyHtml` call.

- [ ] **Step 2: Run the renderer suite and verify RED**

Run:

```bash
cd src
npx jest src/__tests__/assessments/results-email.test.ts --runInBand
```

Expected: FAIL because `renderResultsEmailSubject` does not exist and the body/builder signatures do not yet accept `respondentFirstName`.

- [ ] **Step 3: Implement exact, safe first-name substitution**

In `results-email.ts`, add:

```ts
const RESPONDENT_FIRST_NAME_TOKEN = "{{respondentFirstName}}";

function stripSubjectControlCharacters(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "");
}

export function renderResultsEmailSubject(
  subject: string,
  respondentFirstName: string,
): string {
  return subject
    .split(RESPONDENT_FIRST_NAME_TOKEN)
    .join(stripSubjectControlCharacters(respondentFirstName));
}
```

Change the body renderer so Markdown is processed before inserting the escaped name:

```ts
export function renderResultsEmailBodyHtml(
  markdown: string,
  respondentFirstName: string,
): string {
  const escapedFirstName = escapeHtml(respondentFirstName);
  return markdown
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0)
    .map((p) => {
      const withBreaks = escapeHtml(p).replace(/\n/g, "<br/>");
      const rendered = renderInline(withBreaks);
      const personalized = rendered
        .split(RESPONDENT_FIRST_NAME_TOKEN)
        .join(escapedFirstName);
      return `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">${personalized}</p>`;
    })
    .join("");
}
```

Make the builder argument required and thread it into the body renderer:

```ts
export interface BuildResultsEmailArgs {
  bodyMarkdown: string;
  reportHtml: string;
  respondentFirstName: string;
  ceoSelfAccessUrl?: string | null;
}

export function buildResultsEmailHtml({
  bodyMarkdown,
  reportHtml,
  respondentFirstName,
  ceoSelfAccessUrl,
}: BuildResultsEmailArgs): string {
  const intro = renderResultsEmailBodyHtml(
    bodyMarkdown,
    respondentFirstName,
  );
  // Preserve the existing introBlock, safeCeoSelfAccessHref call,
  // ceoSelfAccessCta construction, and return expression unchanged.
}
```

Add `respondentFirstName: "Jane"` to every existing builder test, including
the PR #314 CEO self-access CTA and URL-rejection cases. Those existing tests
must remain green and must continue proving the CTA appears after the report
only for a safe, authorized URL.

- [ ] **Step 4: Wire the authoritative invited respondent into submit rendering**

Import `renderResultsEmailSubject` beside `buildResultsEmailHtml`. Require `respondent !== null` in the existing respondent-results branch, then pass:

```ts
bodyHtml: buildResultsEmailHtml({
  bodyMarkdown: template.resultsEmailBodyMarkdown ?? "",
  reportHtml,
  respondentFirstName: respondent.firstName,
  ceoSelfAccessUrl,
}),
```

Render the outbox subject at row creation:

```ts
subject: renderResultsEmailSubject(
  template.resultsEmailSubject ?? "Your assessment results",
  respondent.firstName,
),
```

Do not change the branch's flags, approval check, report requirement, catch block, provenance, CEO capability metadata/authorization, or delivery-intent logic.

- [ ] **Step 5: Extend the existing locked stale-render check with first name**

Add one argument to the existing fingerprint helper rather than introducing a
new guard:

Keep the helper's existing inline `campaign` parameter type byte-for-byte and
add `respondentFirstName: string | null` as its second parameter. Insert that
value into only the existing `results` array, immediately after
`campaign.version.id` and before `chrome`; preserve the `coach` and `onScreen`
arrays unchanged.

Pass `invitation.respondent?.firstName ?? null` in Phase 1. Extend the existing
locked respondent projection from `{ email: true }` to
`{ email: true, firstName: true }`, then pass
`locked.respondent?.firstName ?? null` in Phase 2. Do not add another query,
lock, hash helper, or transaction.

In the existing C-M2 stale-input describe block, add a case where Phase 1 sees
`firstName: "Resp"` and the locked respondent sees `firstName: "Renamed"`.
Assert the submission still returns `200`, the respondent results row/intent is
dropped, and the coach row remains unaffected. Keep existing locked fixtures'
respondent first names aligned where their #15 row is expected to survive.

- [ ] **Step 6: Add one submit-route integration assertion**

In the existing `#15 RESPONDENT row` test, set the returned happy invitation's template copy before submitting:

```ts
const invitation = mockHappyInvitation();
invitation.campaign.template.resultsEmailSubject =
  "{{respondentFirstName}} — your results";
invitation.campaign.template.resultsEmailBodyMarkdown =
  "Hi {{respondentFirstName}}, your results are ready.";
await submit();

expect(row!.subject).toBe("Resp — your results");
expect(row!.bodyHtml).toContain("Hi Resp, your results are ready.");
```

Keep the approval helper mocked true in this route suite; hash correctness remains covered by `results-email-approval.test.ts`.

- [ ] **Step 7: Run the focused email suites**

Run:

```bash
cd src
npx jest \
  src/__tests__/assessments/results-email.test.ts \
  src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/lib/results-email-approval.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit the renderer slice**

```bash
git add \
  src/src/lib/assessments/results-email.ts \
  'src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  src/src/__tests__/assessments/results-email.test.ts \
  src/src/__tests__/app/org-survey/submit.test.ts
git commit -m "feat: personalize respondent results emails"
```

---

### Task 2: Simplify the admin Results email card without changing plumbing

**Files:**
- Modify: `src/src/components/admin/template-editor/SettingsTab.tsx:121-127,565-631`
- Modify: `src/src/components/admin/template-editor/MetadataTab.tsx:535-543,570-715`
- Test: `src/src/__tests__/components/admin/template-editor/settings-tab.test.tsx`
- Test: `src/src/__tests__/components/admin/template-editor/metadata-tab.wave-ed8.test.tsx`

**Interfaces:**
- Consumes: existing `handleTemplateRowSave`, `onSendResultsDefaultChange`, dirty state, approval state
- Produces: one UI token list containing only `{{respondentFirstName}}`
- Preserves: all PATCH payloads and approval/default save behavior

- [ ] **Step 1: Change the component tests to the approved copy and token contract**

In `settings-tab.test.tsx`, replace old copy assertions and add:

```ts
const card = screen.getByTestId("settings-results-card");
expect(
  within(card).getByText("The email respondents receive with their results."),
).toBeInTheDocument();
expect(
  within(card).getByRole("switch", {
    name: "Allow coaches to enable results emails for respondents",
  }),
).toBeInTheDocument();
expect(
  within(card).getByText("Coaches decide separately for each campaign."),
).toBeInTheDocument();
expect(
  within(card).getByRole("switch", { name: "Pre-select for new campaigns" }),
).toBeInTheDocument();
expect(
  within(card).getByText(
    "New campaigns start with respondent results emails enabled.",
  ),
).toBeInTheDocument();
expect(
  within(card).getByRole("button", { name: "{{respondentFirstName}}" }),
).toBeInTheDocument();
expect(within(card).queryByText("{{templateName}}")).not.toBeInTheDocument();
expect(within(card).queryByText("{{tierLabel}}")).not.toBeInTheDocument();
expect(within(card).queryByText("{{tierMessage}}")).not.toBeInTheDocument();
expect(within(card).queryByText("{{perSectionList}}")).not.toBeInTheDocument();
```

Update every approval/default switch lookup in the suite to the two approved labels. Keep the existing assertions that content Save sends `resultsEmailContentApproved: false`, approval sends saved content atomically, and the default invokes only `onSendResultsDefaultChange`.

In `metadata-tab.wave-ed8.test.tsx`, assert the same two labels/helpers and exactly one visible Results email variable:

```ts
expect(screen.getByText("{{respondentFirstName}}")).toBeInTheDocument();
expect(screen.queryByText("{{templateName}}")).not.toBeInTheDocument();
expect(screen.queryByText("{{tierLabel}}")).not.toBeInTheDocument();
expect(screen.queryByText("{{tierMessage}}")).not.toBeInTheDocument();
expect(screen.queryByText("{{perSectionList}}")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the two admin suites and verify RED**

Run:

```bash
cd src
npx jest \
  src/__tests__/components/admin/template-editor/settings-tab.test.tsx \
  src/__tests__/components/admin/template-editor/metadata-tab.wave-ed8.test.tsx \
  --runInBand
```

Expected: FAIL on old wording and the four unsupported variables.

- [ ] **Step 3: Apply the approved active Settings presentation**

In `SettingsTab.tsx`, reduce:

```ts
const RESULTS_VARS = ["{{respondentFirstName}}"];
```

Use the approved plain-email presentation:

```tsx
<p className="text-[0.6875rem] text-muted-foreground">
  The email respondents receive with their results.
</p>

<input
  // preserve id, value, onChange, and className
  placeholder="Your results are ready"
/>

<textarea
  // preserve id, rows, value, and onChange
  placeholder={"Hi {{respondentFirstName}},\n\nYour results are ready to view."}
  className={textareaCls}
/>
```

Keep `InsertChips` and its existing append-to-Message behavior. Replace only the toggle presentation:

```tsx
<ToggleRow
  label="Allow coaches to enable results emails for respondents"
  helper="Coaches decide separately for each campaign."
  checked={approved}
  disabled={cardDirty || templateRowSaving}
  onToggle={toggleApprove}
/>

{waveQEnabled && (
  <div className="ml-4">
    <ToggleRow
      label="Pre-select for new campaigns"
      helper="New campaigns start with respondent results emails enabled."
      checked={sendResultsDefault}
      disabled={savingSendResultsDefault}
      onToggle={() => onSendResultsDefaultChange(!sendResultsDefault)}
    />
  </div>
)}
```

Do not change `saveContent`, `toggleApprove`, or their payloads.

- [ ] **Step 4: Apply the same contract to rollback Metadata**

In `MetadataTab.tsx`:

- reduce `RESULTS_VARS` to the exact first-name token;
- use **The email respondents receive with their results.**;
- use the same plain placeholders and remove `font-mono text-xs` from the message field;
- replace the internal flag-label approval row with the approved availability label/helper;
- replace the default label/helper with the approved preset copy; and
- wrap the preset row in `ml-4` without disabling it while unapproved.

Keep Metadata's existing read-only variable-list behavior; do not make those code labels clickable.

- [ ] **Step 5: Run the admin UI suites**

Run:

```bash
cd src
npx jest \
  src/__tests__/components/admin/template-editor/settings-tab.test.tsx \
  src/__tests__/components/admin/template-editor/metadata-tab.wave-ed8.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit the admin UI slice**

```bash
git add \
  src/src/components/admin/template-editor/SettingsTab.tsx \
  src/src/components/admin/template-editor/MetadataTab.tsx \
  src/src/__tests__/components/admin/template-editor/settings-tab.test.tsx \
  src/src/__tests__/components/admin/template-editor/metadata-tab.wave-ed8.test.tsx
git commit -m "fix: simplify results email settings"
```

---

### Task 3: Add authorized campaign PATCH support for both existing email fields

**Files:**
- Modify: `src/src/lib/validations.ts:696-719`
- Modify: `src/src/app/api/assessment-campaigns/[id]/route.ts:17-36,372-480`
- Create: `src/src/__tests__/api/assessment-campaigns/patch-email-notifications.test.ts`

**Interfaces:**
- Produces PATCH input:

```ts
sendResultsToRespondent?: boolean;
notifyCoachOnCompletion?: boolean;
```

- Consumes: `waveDResultsEmailEnabled()`, `waveDCoachNotifyEnabled()`, `isResultsEmailApproved(template)`
- Produces: the existing full-row `{ success: true, data: updatedCampaign }` echo
- Preserves: ownership, DRAFT/ACTIVE, CLOSED `409`, audit, last-write-wins boolean behavior

- [ ] **Step 1: Create failing PATCH contract tests**

Create `patch-email-notifications.test.ts` with the same route-level mocks used by `patch-onscreen-results.test.ts`: `next/server`, `db`, actor authorization, rate limiting, and audit.

Define an actual approved template fixture:

```ts
import { resultsEmailContentHash } from "@/lib/assessments/results-email-approval";

const subject = "Your results";
const body = "Hi {{respondentFirstName}}";

function templateApproval(approved: boolean) {
  return {
    alias: "leadership-vision-alignment",
    resultsEmailSubject: subject,
    resultsEmailBodyMarkdown: body,
    resultsEmailContentApproved: approved,
    resultsEmailContentApprovedHash: approved
      ? resultsEmailContentHash(subject, body)
      : null,
  };
}
```

Make the campaign mock include both stored booleans and the template fixture. Make `assessmentCampaign.update` merge its `data` into the campaign row so the response is a real echo.

Pin the required cases:

```ts
it("persists respondent results true only with flag and live approval", async () => {
  process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "1";
  mockCampaign({ approved: true, sendResultsToRespondent: false });
  const res = await PATCH(
    patchReq({ sendResultsToRespondent: true }) as never,
    detailParams("c1"),
  );
  expect(res.status).toBe(200);
  expect(updateData()).toHaveProperty("sendResultsToRespondent", true);
  expect(await res.json()).toMatchObject({
    data: { sendResultsToRespondent: true },
  });
});

it("drops respondent results true when approval is invalid", async () => {
  process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "1";
  mockCampaign({ approved: false, sendResultsToRespondent: false });
  await PATCH(
    patchReq({ name: "Renamed", sendResultsToRespondent: true }) as never,
    detailParams("c1"),
  );
  expect(updateData()).not.toHaveProperty("sendResultsToRespondent");
  expect(updateData()).toHaveProperty("name", "Renamed");
});

it("allows respondent results false while the capability is active", async () => {
  process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "1";
  mockCampaign({ approved: false, sendResultsToRespondent: true });
  await PATCH(
    patchReq({ sendResultsToRespondent: false }) as never,
    detailParams("c1"),
  );
  expect(updateData()).toHaveProperty("sendResultsToRespondent", false);
});

it("persists coach notification only while its own flag is active", async () => {
  process.env.WAVE_D_COACH_NOTIFY_ENABLED = "1";
  mockCampaign({ notifyCoachOnCompletion: false });
  await PATCH(
    patchReq({ notifyCoachOnCompletion: true }) as never,
    detailParams("c1"),
  );
  expect(updateData()).toHaveProperty("notifyCoachOnCompletion", true);
});
```

Also pin: both flags off drop their fields with `name` as a positive control; DRAFT persists; CLOSED returns `409`; non-owner returns `404`; audit changes contain both booleans when both are authorized; non-boolean values return `400`.

- [ ] **Step 2: Run the PATCH suite and verify RED**

Run:

```bash
cd src
npx jest src/__tests__/api/assessment-campaigns/patch-email-notifications.test.ts --runInBand
```

Expected: FAIL because validation drops both fields and `updateData` has no matching properties.

- [ ] **Step 3: Extend update validation**

In `updateAssessmentCampaignSchema`, add beside `showResultsOnScreen`:

```ts
sendResultsToRespondent: z.boolean().optional(),
notifyCoachOnCompletion: z.boolean().optional(),
```

Do not flag-gate Zod validation; the route owns capability decisions, matching the existing on-screen pattern.

- [ ] **Step 4: Load live approval inputs and extend the route update type**

Import:

```ts
import {
  waveDCoachNotifyEnabled,
  waveDResultsEmailEnabled,
} from "@/lib/assessments/wave-d-feature-flags";
import { isResultsEmailApproved } from "@/lib/assessments/results-email-approval";
```

Extend the existing campaign select's template projection:

```ts
template: {
  select: {
    alias: true,
    resultsEmailSubject: true,
    resultsEmailBodyMarkdown: true,
    resultsEmailContentApproved: true,
    resultsEmailContentApprovedHash: true,
  },
},
```

Extend the local `updateData` type:

```ts
sendResultsToRespondent?: boolean;
notifyCoachOnCompletion?: boolean;
```

- [ ] **Step 5: Add the minimum route gates**

Immediately after the on-screen branch, add:

```ts
if (
  data.sendResultsToRespondent !== undefined &&
  waveDResultsEmailEnabled() &&
  (data.sendResultsToRespondent === false ||
    (campaign.template !== null &&
      isResultsEmailApproved(campaign.template)))
) {
  updateData.sendResultsToRespondent = data.sendResultsToRespondent;
}

if (
  data.notifyCoachOnCompletion !== undefined &&
  waveDCoachNotifyEnabled()
) {
  updateData.notifyCoachOnCompletion = data.notifyCoachOnCompletion;
}
```

Do not add CAS, transactions, a special response, or new audit code. The existing full-row update and `logAudit({ changes: updateData })` remain the contract.

- [ ] **Step 6: Run API and on-screen regression suites**

Run:

```bash
cd src
npx jest \
  src/__tests__/api/assessment-campaigns/patch-email-notifications.test.ts \
  src/__tests__/api/assessment-campaigns/patch-onscreen-results.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit the PATCH slice**

```bash
git add \
  src/src/lib/validations.ts \
  'src/src/app/api/assessment-campaigns/[id]/route.ts' \
  src/src/__tests__/api/assessment-campaigns/patch-email-notifications.test.ts
git commit -m "feat: update campaign email settings"
```

---

### Task 4: Project stored email state and compute server capabilities in both hosts

**Files:**
- Modify: `src/src/lib/assessments/campaign-detail.ts:67-106,236-260,470-494`
- Modify: `src/src/app/(portal)/portal/assessments/[id]/page.tsx:26-45,85-110,210-230`
- Modify: `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx:36-50,83-94,125-145`
- Test: `src/src/__tests__/lib/assessments/campaign-detail.test.ts`
- Test: `src/src/__tests__/app/admin-campaign-detail-page.test.tsx`
- Test: `src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx`

**Interfaces:**
- Produces runtime overview booleans:

```ts
sendResultsToRespondent: boolean;
notifyCoachOnCompletion: boolean;
```

- Produces `CampaignDetail` host props:

```ts
resultsEmailEnabled: boolean;
resultsEmailApproved: boolean;
coachNotifyEnabled: boolean;
```

- Consumes: server-only flags and approval hash inputs
- Security boundary: no approval hash is passed to the client

- [ ] **Step 1: Add failing read-model and host assertions**

In `campaign-detail.test.ts`, set source row values true and assert:

```ts
expect(result.campaign).toMatchObject({
  sendResultsToRespondent: true,
  notifyCoachOnCompletion: true,
});
```

Add a false/default case proving absent legacy fixture values normalize to false.

In each page test, mock the Wave D functions and `isResultsEmailApproved`, then assert captured `CampaignDetail` props:

```ts
expect(detailProps).toMatchObject({
  resultsEmailEnabled: true,
  resultsEmailApproved: true,
  coachNotifyEnabled: true,
});
```

Assert the page's `assessmentCampaign.findFirst` template select includes the four approval inputs, while the captured component props do not contain `resultsEmailContentApprovedHash`.

- [ ] **Step 2: Run the read-model and host suites and verify RED**

Run:

```bash
cd src
npx jest \
  src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/__tests__/app/admin-campaign-detail-page.test.tsx \
  src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx \
  --runInBand
```

Expected: FAIL because overview and host props do not exist.

- [ ] **Step 3: Extend the shared overview projection**

Add optional source fields to `CampaignWithRels`, matching the existing backward-compatible `showResultsOnScreen` fixture pattern:

```ts
sendResultsToRespondent?: boolean;
notifyCoachOnCompletion?: boolean;
```

Expose optional fields on `CampaignOverview.campaign` for fixture compatibility, while always emitting runtime booleans from `getCampaignOverview`:

```ts
sendResultsToRespondent?: boolean;
notifyCoachOnCompletion?: boolean;
```

```ts
sendResultsToRespondent: campaign.sendResultsToRespondent === true,
notifyCoachOnCompletion: campaign.notifyCoachOnCompletion === true,
```

No Prisma select change is needed in `getCampaignOverview`; its `include` already returns campaign scalar fields.

- [ ] **Step 4: Compute capabilities in the coach host**

Import:

```ts
import {
  assessmentInviteBrandedCustomHtmlEnabled,
  waveDCoachNotifyEnabled,
  waveDCustomHtmlEmailEnabled,
  waveDResultsEmailEnabled,
} from "@/lib/assessments/wave-d-feature-flags";
import { isResultsEmailApproved } from "@/lib/assessments/results-email-approval";
```

Extend only `campaignForFlag.template.select` with the four approval fields. Compute:

```ts
const resultsEmailEnabled = waveDResultsEmailEnabled();
const resultsEmailApproved =
  resultsEmailEnabled &&
  campaignForFlag?.template != null &&
  isResultsEmailApproved(campaignForFlag.template);
const coachNotifyEnabled = waveDCoachNotifyEnabled();
```

Pass:

```tsx
resultsEmailEnabled={resultsEmailEnabled}
resultsEmailApproved={resultsEmailApproved}
coachNotifyEnabled={coachNotifyEnabled}
```

- [ ] **Step 5: Apply the identical server decision in the admin host**

Add the same imports, template select, three computed booleans, and three `CampaignDetail` props to the admin page. Do not pass raw approval fields or hashes.

- [ ] **Step 6: Run the read-model and host suites**

Run:

```bash
cd src
npx jest \
  src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/__tests__/app/admin-campaign-detail-page.test.tsx \
  src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx \
  src/__tests__/components/assessments/campaign-detail-admin-host.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit the projection and host slice**

```bash
git add \
  src/src/lib/assessments/campaign-detail.ts \
  'src/src/app/(portal)/portal/assessments/[id]/page.tsx' \
  'src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx' \
  src/src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/src/__tests__/app/admin-campaign-detail-page.test.tsx \
  src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx
git commit -m "feat: expose campaign email capabilities"
```

---

### Task 5: Add the approved existing-campaign email controls

**Files:**
- Modify: `src/src/components/assessments/CampaignDetail.tsx:100-145,257-345,839-895,1615-1655`
- Create: `src/src/__tests__/components/assessments/campaign-detail-email-notifications.test.tsx`
- Test: `src/src/__tests__/components/assessments/campaign-detail-onscreen-results.test.tsx`
- Test: `src/src/__tests__/components/assessments/campaign-detail-admin-host.test.tsx`

**Interfaces:**
- Consumes optional host props with fail-closed defaults:

```ts
resultsEmailEnabled?: boolean;
resultsEmailApproved?: boolean;
coachNotifyEnabled?: boolean;
```

- Consumes stored overview fields:

```ts
initialOverview.campaign.sendResultsToRespondent
initialOverview.campaign.notifyCoachOnCompletion
```

- Produces independent immediate PATCHes to the existing campaign endpoint

- [ ] **Step 1: Create failing component tests for visibility and state**

Create `campaign-detail-email-notifications.test.tsx` with the same navigation, result-view, and toast mocks used by `campaign-detail-onscreen-results.test.tsx`.

Build a minimal ACTIVE overview with both stored booleans false. Pin:

```tsx
render(
  <CampaignDetail
    initialOverview={makeOverview()}
    initialRespondents={[]}
    resultsEmailEnabled
    resultsEmailApproved
    coachNotifyEnabled
  />,
);

expect(
  screen.getByRole("checkbox", {
    name: "Email each respondent their results",
  }),
).toBeEnabled();
expect(
  screen.getByRole("checkbox", {
    name: "Email me when someone completes the assessment",
  }),
).toBeEnabled();
```

Add cases for:

- both props false: no Email notifications card;
- Results email capability true but approval false: row visible, unchecked/checked from stored state, disabled, and explanation visible;
- coach capability true alone: only coach row visible;
- CLOSED: no editable Email notifications card;
- stored true values: both checkboxes initially checked.

- [ ] **Step 2: Add failing persistence and rollback tests**

For respondent results:

```ts
(global.fetch as jest.Mock).mockResolvedValue({
  ok: true,
  json: async () => ({
    success: true,
    data: { sendResultsToRespondent: true },
  }),
});
fireEvent.click(
  screen.getByRole("checkbox", {
    name: "Email each respondent their results",
  }),
);
await waitFor(() =>
  expect(global.fetch).toHaveBeenCalledWith(
    `/api/assessment-campaigns/${CAMPAIGN_ID}`,
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ sendResultsToRespondent: true }),
    }),
  ),
);
```

Add the same payload assertion for `notifyCoachOnCompletion`.

For each field, add an HTTP-failure case and a `200` mismatched/missing-echo case. Assert the checkbox reverts and the destructive toast is called. The echo check must fail when `body.data` is missing, not only when a present field disagrees.

- [ ] **Step 3: Run the new component suite and verify RED**

Run:

```bash
cd src
npx jest \
  src/__tests__/components/assessments/campaign-detail-email-notifications.test.tsx \
  --runInBand
```

Expected: FAIL because the props, card, and handlers do not exist.

- [ ] **Step 4: Add fail-closed props and local stored-state mirrors**

Extend `CampaignDetailProps` and destructuring:

```ts
resultsEmailEnabled?: boolean;
resultsEmailApproved?: boolean;
coachNotifyEnabled?: boolean;
```

```ts
resultsEmailEnabled = false,
resultsEmailApproved = false,
coachNotifyEnabled = false,
```

Add local state:

```ts
const [sendResultsToRespondent, setSendResultsToRespondent] = useState(
  initialOverview.campaign.sendResultsToRespondent === true,
);
const [sendResultsSaving, setSendResultsSaving] = useState(false);
const [notifyCoachOnCompletion, setNotifyCoachOnCompletion] = useState(
  initialOverview.campaign.notifyCoachOnCompletion === true,
);
const [notifyCoachSaving, setNotifyCoachSaving] = useState(false);
```

- [ ] **Step 5: Implement two explicit optimistic handlers**

Implement one handler per existing field. The respondent handler's success guard is:

```ts
const echoed = body?.data?.sendResultsToRespondent;
if (echoed !== next) {
  throw new Error("This setting is not currently available.");
}
```

The coach handler uses:

```ts
const echoed = body?.data?.notifyCoachOnCompletion;
if (echoed !== next) {
  throw new Error("This setting is not currently available.");
}
```

Each handler must:

1. return while its own saving state is true;
2. capture the previous value;
3. set the optimistic value and saving state;
4. PATCH only its own field;
5. require `res.ok`, `body.success !== false`, and exact echo;
6. show a success toast and call `router.refresh()`;
7. restore the previous value and show a destructive toast on failure; and
8. clear saving state in `finally`.

Do not extract a generic settings framework or change the existing on-screen handler.

- [ ] **Step 6: Render the approved Email notifications card**

Place it after Results on screen and before Invitation email:

```tsx
{(resultsEmailEnabled || coachNotifyEnabled) && !isClosed && (
  <div
    className="bg-card border border-border rounded-xl p-4"
    data-testid="campaign-email-notifications-card"
  >
    <h2 className="text-sm font-semibold text-foreground">
      Email notifications
    </h2>

    {resultsEmailEnabled && (
      <label className="mt-3 flex items-start gap-3">
        <input
          type="checkbox"
          checked={sendResultsToRespondent}
          disabled={sendResultsSaving || !resultsEmailApproved}
          onChange={(event) =>
            handleToggleSendResults(event.target.checked)
          }
          aria-label="Email each respondent their results"
        />
        <span className="text-sm text-foreground">
          Email each respondent their results
          <span className="block text-xs text-muted-foreground mt-1">
            {resultsEmailApproved
              ? "Applies to future submissions."
              : "Not available for this assessment. Ask an admin to enable respondent results email."}
          </span>
        </span>
      </label>
    )}

    {coachNotifyEnabled && (
      <label className="mt-3 flex items-start gap-3">
        <input
          type="checkbox"
          checked={notifyCoachOnCompletion}
          disabled={notifyCoachSaving}
          onChange={(event) =>
            handleToggleNotifyCoach(event.target.checked)
          }
          aria-label="Email me when someone completes the assessment"
        />
        <span className="text-sm text-foreground">
          Email me when someone completes the assessment
        </span>
      </label>
    )}
  </div>
)}
```

Use the repository's existing checkbox classes (`accent-primary w-4 h-4 mt-0.5`) and muted disabled text treatment. Do not add a Save button, dialog, or third choice.

- [ ] **Step 7: Run CampaignDetail coverage**

Run:

```bash
cd src
npx jest \
  src/__tests__/components/assessments/campaign-detail-email-notifications.test.tsx \
  src/__tests__/components/assessments/campaign-detail-onscreen-results.test.tsx \
  src/__tests__/components/assessments/campaign-detail-admin-host.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit the shared UI slice**

```bash
git add \
  src/src/components/assessments/CampaignDetail.tsx \
  src/src/__tests__/components/assessments/campaign-detail-email-notifications.test.tsx
git commit -m "feat: edit existing campaign email choices"
```

---

### Task 6: Record source-of-truth status and run the complete gate

**Files:**
- Modify: `CLAUDE.md:21`
- Modify: `plans/CHANGELOG.md:9`
- Test: `src/src/__tests__/lint/changelog-freshness.test.ts`
- Verify: every production and test file from Tasks 1-5

**Interfaces:**
- Consumes: the finished implementation and actual verification output
- Produces: newest-first repository status entry with slug `p1-results-email-simplification-implemented`
- Preserves: no pushed, merged, deployed, launched, or Production claim without its real receipt

- [ ] **Step 1: Add the implementation changelog entry**

Prepend below the changelog preamble:

```md
<a id="p1-results-email-simplification-implemented"></a>
### 2026-08-07 — P1 respondent results email simplification implemented <!-- ENTRY_ISO:2026-08-07 ENTRY_SLUG:p1-results-email-simplification-implemented -->

**Status: LOCALLY IMPLEMENTED; final verification in progress; not pushed, merged, deployed, activated, or written to Production.** The existing Results email editor now presents one working respondent-first-name token and clear availability/default wording. Existing DRAFT and ACTIVE campaigns can change the stored respondent-results and coach-completion email choices through the shared Coach/Admin campaign detail component, while CLOSED campaigns remain read-only.

**Security and scope.** No schema, migration, endpoint, feature flag, email type, delivery workflow, report behavior, or public-quiz behavior changed. Respondent-results enablement still requires the Wave D flag plus current hash-valid admin approval, and locked submit-time/outbox/delivery-intent authorization remains unchanged.
```

- [ ] **Step 2: Update the CLAUDE.md freshness anchor**

Set the Project Context row to:

```md
<!-- LAST_UPDATED_ISO:2026-08-07 LAST_UPDATED_SLUG:p1-results-email-simplification-implemented -->
```

Use brief prose stating the feature is locally implemented and final
verification is in progress. Do not claim push, PR, merge, deployment,
activation, production email, or customer-data mutation.

- [ ] **Step 3: Run the complete targeted regression matrix**

Run:

```bash
cd src
npx jest \
  src/__tests__/assessments/results-email.test.ts \
  src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/lib/results-email-approval.test.ts \
  src/__tests__/lib/assessments/assessment-email-intent-reauthorization.test.ts \
  src/__tests__/api/assessment-campaigns/patch-email-notifications.test.ts \
  src/__tests__/api/assessment-campaigns/patch-onscreen-results.test.ts \
  src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/__tests__/app/admin-campaign-detail-page.test.tsx \
  src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx \
  src/__tests__/components/admin/template-editor/settings-tab.test.tsx \
  src/__tests__/components/admin/template-editor/metadata-tab.wave-ed8.test.tsx \
  src/__tests__/components/assessments/campaign-detail-email-notifications.test.tsx \
  src/__tests__/components/assessments/campaign-detail-onscreen-results.test.tsx \
  src/__tests__/components/assessments/campaign-detail-admin-host.test.tsx \
  src/__tests__/lint/changelog-freshness.test.ts \
  --runInBand
```

Expected: PASS. Record exact suites/tests/time in `plans/CHANGELOG.md`.

- [ ] **Step 4: Run changed-file ESLint**

Run:

```bash
cd src
npx eslint \
  src/lib/assessments/results-email.ts \
  'src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  components/admin/template-editor/SettingsTab.tsx \
  components/admin/template-editor/MetadataTab.tsx \
  lib/validations.ts \
  'src/app/api/assessment-campaigns/[id]/route.ts' \
  lib/assessments/campaign-detail.ts \
  'src/app/(portal)/portal/assessments/[id]/page.tsx' \
  'src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx' \
  components/assessments/CampaignDetail.tsx \
  src/__tests__/assessments/results-email.test.ts \
  src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/components/admin/template-editor/settings-tab.test.tsx \
  src/__tests__/components/admin/template-editor/metadata-tab.wave-ed8.test.tsx \
  src/__tests__/api/assessment-campaigns/patch-email-notifications.test.ts \
  src/__tests__/lib/assessments/campaign-detail.test.ts \
  src/__tests__/app/admin-campaign-detail-page.test.tsx \
  src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx \
  src/__tests__/components/assessments/campaign-detail-email-notifications.test.tsx
```

Expected: exit `0`. Record the result in the changelog.

- [ ] **Step 5: Run migration safety**

Run:

```bash
cd src
node scripts/check-migration-safety.mjs
```

Expected: PASS with no new migration. Record the exact migration count printed by the command.

- [ ] **Step 6: Run the production-matching Turbopack build**

Run:

```bash
cd src
CI=true npx next build --turbopack
```

Expected: exit `0`, TypeScript completion, and all static pages generated. Record the exact build facts in the changelog.

- [ ] **Step 7: Add the observed verification receipts**

Add a final **Verification** paragraph to the new changelog entry. Copy the
actual targeted Jest suite/test/time totals, the changed-file ESLint exit
result, the migration-safety migration count, and the Turbopack compile,
TypeScript, and static-page results from Steps 3-6. State any failed or
unavailable gate as failed or unavailable; never convert an attempt into a
pass.

If and only if every required gate passed, change the changelog status and
CLAUDE.md prose from **final verification in progress** to **locally implemented
and verified**. Otherwise leave the exact non-green gate visible in both
sources of truth.

- [ ] **Step 8: Re-run changelog freshness after inserting real receipts**

Run:

```bash
cd src
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Inspect final scope and commit documentation**

Run:

```bash
git status --short
git diff --check
git diff --stat origin/main...HEAD
```

Confirm there is no Prisma migration, generated artifact, visual-companion file, unrelated refactor, or unapproved source file.

Commit:

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs: record P1 results email simplification"
```

Do not push until the required review/co-validation and user authorization gates are satisfied.
