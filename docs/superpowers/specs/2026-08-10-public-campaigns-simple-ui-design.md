# Public Campaigns Plain-Language UI

**Status:** Approved design

**Date:** 2026-08-10

**Scope:** ADMIN/STAFF Public Campaigns screen only

**Production route:** `/admin/assessments/public-campaigns`

**Related release:** PR #318, organization-free public campaigns

**Queued cleanup:** [Remove stale organization-required messaging](https://app.notion.com/p/3b78c45dd829815898b0c59aed250abf)

## Problem

The Public Campaigns screen exposes storage, API, and enum terminology to
administrators. Examples include `accessMode="PUBLIC"`, `organizationId`,
`NOT NULL FK`, `createdByCoachId`, HTTP `422`, `OPEN_END`, `ENDS_AFTER`, raw
aliases, and all-uppercase status values. The screen also still says that an
organization is required even though PR #318 deliberately removed that
requirement.

This makes a narrow administrative task feel like an engineering console. It
also creates a direct contradiction: the form correctly has no Organization
field, while the surrounding copy says every public campaign must have one.

The current page combines two different jobs in one long component:

1. returning to manage, publish, share, and inspect existing campaigns; and
2. creating a new campaign through an always-visible form.

Creation is occasional. Managing an existing campaign is the recurring job.
The interface should reflect that frequency.

## Decision

Use a list-first management screen with a dedicated creation screen.

- `/admin/assessments/public-campaigns` is the everyday destination for
  existing campaigns.
- `/admin/assessments/public-campaigns/new` is a focused creation page.
- The list has one primary `Create campaign` action that opens the creation
  page.
- After successful creation, return to the list and highlight the new draft.
- Rename domain concepts that administrators need and remove implementation
  details they do not need.

This combines the strengths of the approved visual options rather than forcing
a false choice between them: the list-first screen optimizes repeat visits, and
the dedicated page gives report-design choices enough space during creation.
A side panel is rejected because the existing report-design picker makes it too
cramped.

## Goals

- Make the screen understandable without knowledge of the database, API, or
  internal enums.
- Keep the most common management actions visible.
- Give campaign creation a calm, focused surface.
- Prevent administrators from selecting an assessment that cannot be used.
- Preserve the organization-free PUBLIC campaign invariant.
- Preserve all current public-campaign capabilities: creation, publishing,
  report-design selection, response inspection, and report access.

## Non-Goals

- No redesign of invited campaigns.
- No change to campaign, submission, organization, or report data models.
- No change to public respondent screens.
- No change to lead routing, coach attribution, or results-email behavior.
- No generalized campaign-management refactor.
- No new analytics dashboard, bulk actions, delete workflow, or CRM behavior.
- No reintroduction of the older four-step Public Quiz configuration wizard.

## Information Architecture

### Campaign list

The default page header is:

> **Public campaigns**
>
> Share an assessment with anyone using a public link.

The header has one primary action: `Create campaign`.

Each campaign row presents only operationally useful information:

- campaign name;
- assessment name;
- friendly status;
- opening and closing information in natural language;
- response count; and
- actions appropriate to the current status.

The default row actions are:

| State | Primary actions | Secondary actions |
| --- | --- | --- |
| Draft | Publish | More |
| Live | Copy link; View responses | More |
| Closed | View responses | More |

`More` contains report-design management when that capability is available. It
does not become a dumping ground for database identifiers or raw enum values.

`View responses` keeps the current lazy-loading behavior and opens an inline
disclosure for the selected campaign. A new response-management route is not
required. Existing detail and `View report` behavior remains available inside
that disclosure.

`Copy link` copies the canonical `/quiz/{alias}` URL. The raw alias is no longer
its own column because the useful user action is copying the complete public
link. Copying is offered only when the campaign is Live.

### Creation page

The creation page header is:

> **Create a public campaign**
>
> Create a link anyone can use to take an assessment.

The form order is:

1. Assessment
2. Report design, when supported by the selected assessment
3. Campaign name
4. Starts
5. Ends
6. Create draft

`Cancel` returns to the campaign list without writing data.

The assessment selector contains only enabled assessments with a published
version in the supported language. An invalid choice should be prevented rather
than explained through an HTTP error after submission.

When there are no eligible assessments, replace the form with:

> **No published assessments are available.**
>
> Publish an assessment before creating a public campaign.

The empty state links to `/admin/assessments/templates`, the existing
assessment-template management surface.

`Starts` offers `Open immediately` by default and a scheduled date/time choice.
`Ends` offers `No end date` by default and an end-date choice. These controls
still serialize to the existing `openAt`, `closeAt`, and `endMode` API fields;
the internal names never appear in the interface.

The submit action is `Create draft`. Successful creation redirects to:

```text
/admin/assessments/public-campaigns?created={campaignId}
```

The list shows `Campaign created as a draft.` and visually highlights that row
for the current navigation only. The query parameter is presentation state, not
persistent domain state.

### Publishing

Publishing requires confirmation:

> **Publish {campaign name}?**
>
> Anyone with the link will be able to take it once the campaign opens.

Confirming calls the existing publish operation. A successful row changes from
Draft to Live and exposes `Copy link`. The confirmation is keyboard accessible,
focus-contained while open, and returns focus to the originating Publish action
when cancelled.

## Plain-Language Contract

### Rename

| Current UI | Approved UI |
| --- | --- |
| Existing PUBLIC Campaigns | Public campaigns |
| Create New PUBLIC Campaign | Create a public campaign |
| Template | Assessment |
| Campaign Name | Campaign name |
| Open At | Starts |
| Close At | Ends |
| DRAFT | Draft |
| ACTIVE | Live |
| CLOSED | Closed |
| View submissions | View responses |
| Report appearance | Report design |
| Alias | Public link / Copy link |
| Template default | Uses the assessment's default design |
| Campaign choice | Customized for this campaign |

`Public campaign` remains the product term because it is the current glossary
term and distinguishes this flow from invited campaigns. The all-uppercase enum
form `PUBLIC` is never rendered.

### Remove

The following must not appear anywhere on the list or creation screen:

- `accessMode="PUBLIC"`;
- `organizationId`;
- `createdByCoachId`;
- `NOT NULL FK`;
- schema or database explanations;
- HTTP status numbers such as `422`;
- `OPEN_END` or `ENDS_AFTER`;
- raw campaign IDs; and
- raw aliases presented as standalone identifiers.

The stale organization-required banner is removed, not rewritten. Organization
ownership is not part of the public-campaign task, so replacement copy would add
noise.

### Report design

The existing report-style cards and preview are reused. Surrounding labels use
`Report design`. When a design is inherited, say `Uses the assessment's default
design`. When explicitly selected, say `Customized for this campaign`.

After the first completed response, replace lock-oriented implementation copy
with:

> This report design cannot be changed after the first response.

## Error and Empty States

Errors preserve all entered form values.

- Put field-specific validation beside the affected field.
- Focus the first invalid field after validation.
- Use one page-level message for network or unexpected server failures.
- Never include raw status codes, enum values, stack details, or database terms.

Approved messages include:

| Condition | Message |
| --- | --- |
| Missing required values | Complete the highlighted fields. |
| No published assessment | Publish this assessment before creating a campaign. |
| Network/server failure | We couldn't create this campaign. Check the details and try again. |
| Successful creation | Campaign created as a draft. |
| Successful publish | Campaign published. Its public link is ready to share. |
| Copy success | Public link copied. |
| Copy failure | We couldn't copy the link. Select and copy it manually. |

If an eligibility race occurs after options load—for example, the chosen
assessment is disabled or its published version becomes unavailable—the server
remains authoritative. Map its known error to the friendly published-assessment
message and preserve the form.

## Components and Boundaries

The current `PublicCampaignsManager` is responsible for list loading, form
state, creation, publishing, report-design editing, response expansion, and
response-result rendering. The redesign splits only along approved screen
responsibilities:

- `PublicCampaignList` owns list presentation and the created-row highlight.
- `PublicCampaignActions` owns status-dependent row actions and publish
  confirmation.
- `PublicCampaignResponses` owns the existing lazy-loaded response disclosure.
- `CreatePublicCampaignForm` owns creation state and submission.
- `SubmissionResult` remains a focused result-summary renderer.
- `ReportStylePicker` remains the shared report-design selector.

Data access, authorization, eligibility, and mutations remain in server routes
or focused assessment services. Presentation components receive explicit view
models and do not inspect Prisma records directly.

No unrelated component-library or assessment architecture refactor is included.

## Data Flow

### List

1. The server route enforces ADMIN/STAFF access as it does today.
2. `GET /api/admin/public-campaigns` returns PUBLIC, non-deleted campaigns.
3. The read adds a submission count and maps it to `responseCount`; it does not
   return all response records eagerly.
4. The client maps stored statuses and dates to the approved display language.
5. Selecting `View responses` calls the existing per-campaign submissions
   endpoint only for that campaign.

### Creation options

A focused server-side query/service supplies creation options to the new page.
It returns only templates that are:

- enabled;
- backed by a currently published version in the supported language; and
- usable by the existing public-campaign creation policy.

The view model includes only what the form needs: template ID, display name,
default report design, report-design availability, and preview capabilities.
The creation form does not independently infer publication eligibility.

### Create

1. The form submits the existing organization-free body to
   `POST /api/admin/public-campaigns`.
2. The body contains `templateId`, `name`, `openAt`, nullable `closeAt`, and an
   explicit report style only when the administrator customized it.
3. It never contains `organizationId`.
4. The server repeats all authorization, publication, disabled-template, date,
   and alias-collision checks.
5. On HTTP `201`, the client redirects to the list with the created campaign ID
   as transient presentation state.

The backend remains authoritative even though the UI prevents known-invalid
choices.

## Accessibility and Responsive Behavior

- Use semantic headings, form labels, buttons, and a real table or accessible
  list structure.
- Status is conveyed by text, not color alone.
- Every menu, disclosure, and publish confirmation works by keyboard.
- Error summaries use `role="alert"`; success messages use `role="status"`.
- Focus moves to the creation-page heading after navigation and to the success
  message after redirect.
- The admin surface is desktop-first, matching the existing operating model,
  but rows must reflow without overlap at narrower laptop widths.
- No horizontal clipping or three-column compression is acceptable.

## Wireframe Source of Truth

`src/public/wireframes-phase2/admin/20-admin-public-wizard-flow.html` is a May
2026 v1.5 artifact. It calls the feature `Public Quizzes`, exposes technical
terms, describes a four-step configuration wizard, and says generalized public
campaign creation had not yet shipped. Production and later domain decisions
have superseded it.

Implementation must:

1. add
   `src/public/wireframes-phase2/admin/25-admin-public-campaigns-simple-ui.html`
   showing the approved list and dedicated-create states;
2. add the paired contract at
   `docs/wireframes-phase2/wave6/25-admin-public-campaigns-simple-ui.md`;
3. mark wireframe 20 as superseded without erasing its historical provenance;
4. update the wireframe index to point reviewers to the current design; and
5. update the `Public Campaign` glossary entry so it no longer says an
   organization is required.

The new wireframe is the visual specification for implementation. The browser
companion mockup established the approved direction but remains an ignored
brainstorm artifact rather than a committed production contract.

## Feature Flag and Rollout

Ship behind:

- `WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_ENABLED`; and
- `WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_KILL`.

With the feature flag off or kill switch on, the existing list-and-form screen
must remain behaviorally and visually unchanged. The `/new` route should return
to the existing screen when the new UI is unavailable.

Rollout sequence:

1. ship code with the feature disabled;
2. verify the legacy screen is unchanged;
3. enable in preview and complete visual plus functional acceptance;
4. enable in production;
5. verify list, create, publish, copy-link, report-design, and response flows;
6. retain the kill switch for immediate UI rollback.

No schema migration or production data mutation is required.

## Testing

### Copy and presentation

- Assert the approved headings, labels, statuses, actions, and messages.
- Assert every forbidden technical string is absent from rendered list and
  creation surfaces.
- Assert aliases are represented through the complete public-link action rather
  than a standalone column.
- Assert friendly schedule text for immediate, scheduled, open-ended, and closed
  campaigns.

### Creation

- Only enabled templates with a published version are offered.
- Empty eligibility renders the approved empty state.
- Report design is omitted when unsupported and shown when supported.
- Inherited versus customized report-design copy is correct.
- Submission omits `organizationId` and preserves the existing API contract.
- Known server races map to friendly errors without clearing the form.
- Successful creation redirects and highlights the new draft.

### Management

- Each status exposes the correct primary actions.
- Publish requires confirmation and updates the row after success.
- Copy link generates the canonical `/quiz/{alias}` URL.
- Responses remain lazy-loaded and campaign-scoped.
- Report-detail links and report-design locking continue working.

### Safety and regression

- ADMIN and STAFF can access both routes; other roles cannot.
- Existing organization-free PUBLIC campaign tests remain green.
- Existing INVITED organization requirements remain green.
- Flag-off output remains unchanged.
- Changed files pass ESLint and targeted Jest suites.
- Migration safety and the Turbopack production build pass even though no
  migration is expected.

## Acceptance Criteria

The design is complete when:

- an administrator can understand the screen without knowing API, schema, or
  enum terminology;
- the default page prioritizes existing campaign management;
- campaign creation occurs on a focused route;
- invalid unpublished assessments are prevented rather than explained through
  an HTTP error;
- the stale organization-required message is gone;
- public links replace raw aliases;
- all current management capabilities remain available; and
- the current wireframe and glossary agree with production behavior.

## Alternatives Considered

### Always-visible create form

Rejected because it dominates every repeat visit and recreates the long,
mixed-purpose page being simplified.

### Creation side panel

Rejected because report-design cards and previews need more width than a calm
side panel can provide.

### Campaigns/Create tabs

Rejected because tabs introduce another page mode while still placing two
different jobs inside one route.

### Rename technical terms but keep the current layout

Rejected because copy changes alone do not fix the mixed management/creation
hierarchy.

### Hide every detail under More

Rejected because friendly status, schedule, response count, and public-link
actions are operationally useful and should remain visible.

## Rollback

Use the kill switch to restore the existing Public Campaigns screen. Because
the redesign uses the current APIs and makes no schema or data changes,
rollback does not require a database operation. Campaigns created through the
new screen remain valid and manageable through the legacy screen.
