# 25 — Admin Public Campaigns: plain-language management

## List state
- Heading: Public campaigns
- Guidance: Share an assessment with anyone using a public link.
- Primary action: Create campaign
- Columns: Campaign, Assessment, Status, Availability, Responses, Actions
- Draft actions: Publish, More
- Live actions: Copy link, View responses, More
- Closed actions: View responses, More

## Create state
- Heading: Create a public campaign
- Guidance: Create a link anyone can use to take an assessment.
- Fields: Assessment, Report design (conditional), Campaign name, Starts, Ends
- Primary action: Create draft
- Secondary action: Cancel

## Forbidden visible copy
`accessMode`, `organizationId`, `createdByCoachId`, `NOT NULL FK`, `422`,
`OPEN_END`, `ENDS_AFTER`, raw campaign IDs, and standalone aliases.

## Visual contract

The management route is list-first. Creation is a dedicated, focused page rather
than a panel, wizard, or permanently visible form. Both states retain the existing
Scaling Up admin shell, shared navy-and-blue palette, Plus Jakarta Sans type, and
quiet card/table conventions. A small four-bar assessment marker is the sole
signature detail; it echoes an assessment profile without competing with the work.

The sample list contains one Draft, one Live, and one Closed campaign. Dates use
natural language, response totals stay visible, and each row exposes only actions
that are useful in that state. `More` is present only when it contains an available
report-design action; an unavailable report design must not produce an empty menu.

The creation page keeps the report-design choices at full content width. It reuses
the existing three report-design cards and selected-preview pattern; it does not
compress creation into a side panel or repeat the three brainstorming concept
cards.

## Acceptance notes

- **Created-row highlight:** after a successful create, return to the list, show
  `Campaign created as a draft.`, and highlight only the newly created Draft row
  for that navigation. The highlight is presentation state, not stored lifecycle
  state.
- **No eligible assessment:** when no enabled assessment has a published version,
  replace the form with `No published assessments are available.` and `Publish an
  assessment before creating a public campaign.` Link the action to the assessment
  management surface.
- **Publish dialog:** `Publish {campaign name}?` is followed by `Anyone with the
  link will be able to take it once the campaign opens.` Confirmation publishes;
  Cancel closes the dialog and returns focus to the row's Publish button.
- **Inline responses:** `View responses` expands the selected campaign in place and
  lazy-loads its response rows. Each response retains its existing details and
  `View report` action; no separate response-management page is introduced.
- **Report-design disclosure:** when report design is supported, `More` exposes
  `Report design` and opens the existing picker in a full-width disclosure row.
  Use `Uses the assessment's default design` or `Customized for this campaign`.
  After the first response, show `This report design cannot be changed after the
  first response.` When report design is unavailable, omit `More` entirely.
- **Narrow-laptop reflow:** at 1024 px, each campaign row reflows into a labelled
  grid with actions on their own line. Controls may wrap but must not overlap or
  clip; the creation form and report-design cards remain legible without horizontal
  scrolling.

## Source-of-truth status

This Wave 6 artifact supersedes the May 2026 Public Quiz wizard in wireframe 20.
Wireframe 20 remains linked for historical provenance only.
