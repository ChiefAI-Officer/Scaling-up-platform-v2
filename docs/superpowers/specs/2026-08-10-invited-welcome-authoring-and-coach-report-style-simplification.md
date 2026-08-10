# Admin-Owned Invited Welcome Screens and Coach Report-Style Simplification

**Status:** Approved design

**Date:** 2026-08-10

**Scope:** Every assessment template's invited-participant Welcome screen, plus
removal of report-appearance selection from the coach campaign workflow

**Admin surface:** `Admin → Assessments → Templates → {assessment} → Build`

**Coach surfaces simplified:**

- `Coach portal → Assessments → New campaign`
- `Coach portal → Assessments → {campaign}`

## 1. Decision

Make the invited-participant Welcome screen admin-authored for every assessment
template. The editor is the first collapsible card in the Build tab, between
the existing assessment header and Section 1. It uses structured plain-text
fields and a live respondent preview.

The saved template content is a default for **future invited campaigns**. When
an invited campaign is created, the server copies the current default into an
immutable campaign snapshot. Existing draft, active, closed, and historical
campaigns never change when an admin later edits the template default.

At the same time, remove `Report appearance` / `Report style` controls from the
coach campaign wizard and coach campaign details. New coach-created campaigns
inherit the admin-set assessment report default. Existing campaign styles,
renderers, stored source metadata, and first-response locks remain intact.

This supersedes ADR-0026's authorship premise. That ADR deliberately kept
invited Welcome copy in code because nobody had requested an authoring path;
this design is that request and defines its ownership and lifecycle.

## 2. Why Admin Owns It

The Welcome screen is assessment content, not campaign logistics. It explains
the instrument before a respondent reaches Section 1 and should remain
consistent across coaches. ADMIN/STAFF already owns the assessment definition,
invitation defaults, result-email defaults, aggregation policy, and report
appearance default. Coaches own organizations, participants, scheduling, and
delivery.

The same boundary simplifies report appearance. A coach should not need to
choose a presentation design while creating or managing a campaign. The
assessment's admin-set default is the single source for future campaigns.

## 3. Goals and Non-Goals

### Goals

- Give ADMIN/STAFF a clear authoring surface for every assessment template's
  invited Welcome screen.
- Show the Welcome screen where it appears in the respondent journey: before
  Section 1 in Build.
- Let admins control the card's voice without allowing false calculated facts
  or false answer-sharing disclosures.
- Apply a saved default only to invited campaigns created after the save.
- Preserve the exact effective Welcome content of every existing invited
  campaign at launch.
- Remove report-style decisions from both coach campaign surfaces and enforce
  that ownership at the API boundary.
- Leave public-quiz Welcome screens unchanged.

### Non-goals

- No coach Welcome override.
- No per-campaign admin Welcome override.
- No retroactive update of an existing campaign, including an unsent DRAFT.
- No public-quiz Welcome authoring in this wave.
- No rich text, Markdown, HTML, custom CSS, color selection, icon selection,
  uploads, or page-builder behavior.
- No changes to report renderers, report facts, print/PDF behavior, report-style
  storage, or existing campaign report-style snapshots.
- No change to question, section, scoring, or Template Version publication
  semantics.

## 4. Admin Build Experience

The Build canvas order is:

1. Existing assessment title and description card.
2. New `Welcome screen` card.
3. Section 1 and its questions.
4. Remaining sections and questions.

### 4.1 Collapsed state

The Welcome card is collapsed by default so it does not push the question
builder down on every visit. Its summary shows:

- a `Welcome screen` title;
- `First screen respondents see` helper copy;
- a shortened preview of the authored lede; and
- a `Before Section 1` position badge.

The card is fixed in position. It cannot be reordered, duplicated, or deleted.

### 4.2 Expanded state

Expanding the card shows structured fields beside a live invited-respondent
preview. On narrow screens, the preview stacks below the fields. The preview
uses a non-production example campaign name and the real current question,
section, time, and scale derivation logic.

The fields are:

| UI label | Stored field | Rules |
| --- | --- | --- |
| Invitation label | `eyebrow` | Required plain text, maximum 60 characters |
| Heading | `headingTemplate` | Required plain text, maximum 160 characters, must contain `{{campaignName}}` |
| Welcome message | `ledeParagraphs` | 1–4 paragraphs, each maximum 1,000 characters, 2,500 total |
| Sharing heading | `sharingHeading` | Required plain text, maximum 120 characters |
| Scores heading | `scoresHeading` | Required plain text, maximum 120 characters |
| Scores explanation | `scoresDescription` | Required plain text, maximum 400 characters |
| Button label | `ctaLabel` | Required plain text, maximum 80 characters |

The Welcome message is one textarea. Blank-line separators map to the stored
paragraph array, preserving the current two-paragraph assessment copy without
introducing rich text.

The button's arrow remains system-owned and is appended by the renderer; the
admin edits only its label.

### 4.3 System-owned content

The following remain calculated or protected and have no editing fields:

- time estimate;
- question count;
- section count;
- scale and rating-description copy;
- who can review named individual answers;
- icons;
- layout and visual styling;
- Scaling Up shell/footer; and
- the existing system fine print used by assessment-specific legacy copy.

Calculated facts and the protected sharing disclosure appear normally in the
live preview. The editor does **not** show the large `Automatic` or `Protected`
explanatory boxes explored during visual design. At most, compact helper text
may identify the preview as calculated; the protected disclosure simply has no
corresponding field.

### 4.4 Save behavior

There is no card-level save action. Welcome edits participate in the existing
editor dirty state and the top-level `Save Draft` action, exactly like the
assessment header, sections, and questions.

The template-row Welcome default is not part of a Template Version and does not
wait for `Publish`. A successful `Save Draft` makes it the default for invited
campaigns created after that save. Compact helper copy under the Welcome card
title states:

> Used for invited campaigns created after you save. Existing campaigns do not
> change.

A published-version view remains read-only under the editor's existing rules;
an admin opens or creates a writable draft to change the default. Saving the
Welcome default does not alter the active question version.

## 5. Structured Data Contract

Use a versioned JSON object rather than seven independent database columns. The
object has one owner, is validated and copied as a unit, and can evolve without
another column for every future copy element.

```ts
interface InvitedWelcomeConfigV1 {
  schemaVersion: 1;
  eyebrow: string;
  headingTemplate: string;
  ledeParagraphs: string[];
  sharingHeading: string;
  scoresHeading: string;
  scoresDescription: string;
  ctaLabel: string;
  /** System-owned compatibility content; never exposed as an authoring field. */
  finePrint: string | null;
}

type InvitedWelcomeAuthoringInputV1 = Omit<
  InvitedWelcomeConfigV1,
  "schemaVersion" | "finePrint"
>;
```

Add:

```prisma
model AssessmentTemplate {
  invitedWelcomeDefault Json?
}

model AssessmentCampaign {
  invitedWelcomeSnapshot Json?
}
```

The nullable migration shape preserves safe dark deployment and kill-switch
fallback. Once backfill is complete and the feature is enabled, every invited
campaign is expected to have a valid snapshot. PUBLIC campaigns keep the
snapshot null because their Welcome behavior is outside this scope.

The config is template-row presentation content, not Template Version content:

- saving it does not change `AssessmentTemplateVersion.contentHash`;
- publishing is not required before future campaigns receive it; and
- a campaign-level copy is what provides historical stability.

All strings are trimmed, control characters are rejected, CRLF is normalized,
and React text rendering provides output escaping. `headingTemplate` permits
only the required `{{campaignName}}` token; other `{{...}}` tokens are rejected.
The token must occur at least once. Unknown JSON keys are stripped on accepted
admin writes and tolerated-but-ignored on defensive reads.

The browser submits only `InvitedWelcomeAuthoringInputV1`. It cannot submit
`schemaVersion` or `finePrint`. The server assigns the schema version and
preserves the template's existing system-owned fine print (or resolves the
legacy default when absent) before persisting the full config. A crafted request
that includes either server-owned key is rejected rather than allowed to alter
hidden content.

## 6. Lifecycle and Data Flow

### 6.1 Admin save

1. Build holds the structured Welcome fields in the editor model.
2. A field change marks the top-level editor dirty.
3. `Save Draft` validates the full config client-side for immediate feedback.
4. The existing template-row save lane sends the config to
   `PATCH /api/admin/assessment-templates/{id}`.
5. The route independently validates the config and requires ADMIN/STAFF.
6. Only a confirmed persisted response clears the Welcome dirty state.

Welcome saving reuses the existing split-save architecture. If version content
saves but the template-row Welcome write fails, the UI must name the failed
surface, retain Welcome as dirty, and never report the whole save as successful.

### 6.2 Invited campaign creation

1. The coach submits the normal campaign fields; no Welcome payload is present.
2. The server reloads the selected assessment template and active Template
   Version inside the existing creation boundary.
3. The server validates and resolves `invitedWelcomeDefault`.
4. The same campaign-creation transaction writes the resolved object into
   `AssessmentCampaign.invitedWelcomeSnapshot`.
5. The campaign snapshot never follows later template changes.

The browser is not trusted to provide, cache, or choose the Welcome content.
One shared server resolver owns this copy operation, and every path that inserts
an INVITED campaign must call it, including the coach wizard's legacy and
Wave-D lanes, privileged/internal creation, and historical-import creation.
PUBLIC creation paths do not call it and keep the snapshot null.

### 6.3 Participant rendering

The invited `/me` response emits the validated campaign snapshot. The
`OrgSurveyClient` Welcome phase renders that snapshot while continuing to
derive measured facts from the actual visible question bank. It never loads the
live template default.

Resolution order is:

1. valid `campaign.invitedWelcomeSnapshot`;
2. frozen legacy per-alias fallback during migration/rollback; then
3. the current generic invited default.

The normal feature-enabled path is always step 1 after backfill. The old
per-alias map becomes a defensive compatibility fallback, not an authoring
source.

### 6.4 Snapshot immutability

The generic campaign PATCH schema does not accept `invitedWelcomeSnapshot`.
There is no coach or admin update route for it. After the data backfill, a small
database trigger rejects any update that changes a non-null campaign Welcome
snapshot. The migration performs its backfill before enabling the trigger.

This makes “existing campaigns do not change” a durable invariant rather than
only a missing button.

## 7. Migration and Exact Preservation

The migration is additive and performs no public-campaign writes.

### 7.1 Template defaults

Backfill every non-deleted assessment template with its exact effective invited
Welcome content at deployment time:

- the assessment-specific paragraphs currently selected by alias;
- the current generic copy for aliases without bespoke copy;
- current headings and CTA copy; and
- the existing fine-print/resume-note behavior.

Newly created assessment templates receive the current generic invited config.

### 7.2 Existing invited campaigns

Backfill every INVITED campaign, including DRAFT, ACTIVE, CLOSED, imported, and
soft-deleted rows, from the effective template-alias content it displays before
this change. This freezes current output before admin authoring is exposed.

The backfill must be deterministic and idempotent. Verification reports counts
for templates, invited campaigns, public campaigns left untouched, nulls,
invalid configs, and each template alias. Launch is blocked if any non-exempt
invited campaign remains without a valid snapshot.

### 7.3 No visual migration delta

Exact-string tests compare every known alias's legacy resolver output with its
backfilled V1 config. Participant rendering tests prove the migrated snapshot
emits the same visible copy before an admin edits anything.

## 8. Coach Report-Style Simplification

### 8.1 Coach campaign wizard

Remove:

- the `Report appearance` panel and `ReportStylePicker`;
- inherited-versus-explicit explanatory copy;
- report-style fields and intent from wizard state and draft persistence;
- report-style preview metadata from the coach template-list payload where no
  other coach consumer requires it;
- report-style serialization in the create request; and
- the Report appearance row on Review.

The create route reloads `AssessmentTemplate.defaultReportStyle` and copies it
to the new campaign with `reportStyleSource = TEMPLATE_DEFAULT`.

A forged coach create request containing `reportStyle` is rejected with a
stable `400 REPORT_STYLE_ADMIN_OWNED` response rather than silently stripped.
Old saved wizard drafts may contain report-style keys; hydration ignores those
keys and uses the current admin default at eventual campaign creation.

### 8.2 Coach campaign details

Remove the full Report appearance section from `CampaignDetail`, including
picker state, previews, source copy, save behavior, lock-time display, and
toasts. Existing report links and report rendering remain unchanged.

When the admin-owned-presentation feature is active, a coach attempting to
PATCH `reportStyle` receives `403 REPORT_STYLE_ADMIN_OWNED`. The privileged API
path remains available to ADMIN/STAFF for controlled intervention and backward
compatibility, but no new campaign-level admin UI is introduced.

### 8.3 Preserved report behavior

Do not change:

- `AssessmentTemplate.defaultReportStyle` or its admin Settings card;
- `AssessmentCampaign.reportStyle`, `reportStyleSource`, or
  `reportStyleLockedAt`;
- Classic, Executive Boardroom, or Modern Dashboard renderers;
- canonical report facts or style dispatch;
- the first-successful-completion style lock; or
- any existing campaign's stored style.

The already-shipped simplified Public Campaigns UI remains unchanged. This wave
applies the same “inherit the assessment default” policy to coaches.

## 9. Authorization and Safety

| Action | ADMIN/STAFF | Coach | Respondent/public |
| --- | --- | --- | --- |
| Read template Welcome default in Build | Yes | No | No |
| Edit template Welcome default | Yes | No | No |
| Supply campaign Welcome snapshot | Server only | No | No |
| Update an existing campaign Welcome snapshot | No route | No route | No route |
| Set assessment report default | Yes | No | No |
| Override campaign report style | Privileged compatibility API | Rejected | No |
| Read invited Welcome snapshot | Through authenticated invitation `/me` | Existing campaign management only | Invitation holder only |

The Welcome config is text-only and carries no arbitrary URLs or markup.
Participant responses continue to receive only the campaign snapshot needed to
render the page.

## 10. Error and Degraded Behavior

- **Admin validation error:** show field-level errors; keep all edits and dirty
  state.
- **Template-row save failure:** use the existing Save Draft error treatment,
  identify Welcome as the failed surface, and do not show success.
- **Campaign create snapshot failure:** roll back campaign creation; never create
  a partial campaign.
- **Missing template default during create:** resolve the frozen legacy alias
  fallback, validate it, and snapshot that safe value.
- **Invalid campaign snapshot during render:** log only campaign/template IDs and
  validation codes, never authored text; render the frozen legacy alias fallback.
- **Unknown future schema version:** fail closed to the legacy/default renderer,
  not to a blank or partially trusted object.
- **Coach forged report-style write:** return the stable ownership error without
  changing or auditing a successful mutation.

## 11. Rollout and Flags

Use one coordinated ownership gate:

- `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED`
- `WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL`

The kill switch wins.

### Flag off / killed

- Admin Build has no Welcome authoring card.
- Invited rendering follows the current code-owned resolver.
- Coach report-style controls and authorization behave exactly as before.
- New columns and backfilled JSON are inert and absent from client contracts.

### Flag on

- Admin Welcome authoring is available for every assessment template.
- New invited campaigns receive immutable Welcome snapshots.
- Invited rendering uses campaign snapshots.
- Coach report-style controls disappear and coach override requests are
  rejected.

The database migration and backfill deploy dark before the flag is enabled.
Backfilled data remains if the feature is killed; rollback changes behavior, not
historical preservation data.

Snapshot persistence itself starts as soon as the additive migration is
deployed, even while the presentation flag is off or killed. This closes the
dark-launch gap: an invited campaign created between backfill and flag enablement
still receives its immutable snapshot. The flag gates UI, API exposure,
participant rendering, and coach report-style authorization; the inert internal
snapshot write does not alter flag-off responses or visible behavior.

## 12. Testing and Acceptance

### 12.1 Welcome authoring

- ADMIN and STAFF can load and edit the Welcome card; coach and unauthenticated
  access is rejected.
- Every assessment template can store a distinct invited default.
- The card appears after the assessment header and before Section 1.
- Collapsed and expanded states preserve existing Build behavior.
- The only save action is the existing top-level Save Draft.
- Each field boundary and total paragraph limit is enforced on client and
  server.
- `{{campaignName}}` is required; unknown tokens, control characters, HTML, and
  malformed JSON are rejected or escaped as appropriate.
- Two-paragraph copy round-trips without loss.
- System-derived facts and protected disclosure have no authoring controls.

### 12.2 Snapshot lifecycle

- New invited campaign creation snapshots the freshly reloaded template default
  inside the transaction.
- A later template edit changes the next campaign but not any existing DRAFT,
  ACTIVE, CLOSED, imported, or deleted campaign.
- Generic campaign PATCH cannot mutate the snapshot.
- The database immutability trigger rejects direct snapshot updates.
- Campaign creation rolls back if snapshot validation or persistence fails.
- `/me` returns only the campaign snapshot and `OrgSurveyClient` renders it.

### 12.3 Migration

- Every known alias's backfilled config matches the current resolver exactly.
- Every existing invited campaign receives a valid snapshot.
- PUBLIC campaigns and their descriptions/configs remain unchanged.
- Backfill is idempotent and reports zero unexplained nulls.
- Migration Safety Gate passes.

### 12.4 Coach report-style removal

- Coach wizard shows no Report appearance heading, picker, preview, source text,
  or Review row.
- Coach wizard drafts ignore legacy report-style keys.
- Coach create payload omits `reportStyle`.
- Forged coach create and PATCH requests are rejected with the stable ownership
  error.
- New coach-created campaigns copy the current admin template default with
  `TEMPLATE_DEFAULT` source.
- Coach campaign details show no report-style section before or after lock.
- Admin default editing, privileged compatibility updates, existing style locks,
  and all three report renderers remain green.

### 12.5 Regression and visual acceptance

- Feature-off tests prove existing admin, coach, API, and invited-render output
  is unchanged.
- Public campaign creation, public quiz Welcome, public submission, and public
  results tests remain byte-compatible.
- Targeted Jest suites, changed-file ESLint, migration safety, and
  `CI=true npx next build --turbopack` pass before push.
- Visual review covers desktop and narrow-width Build with the card collapsed
  and expanded, plus the resulting invited Welcome screen on desktop and mobile.
- Production acceptance confirms an existing campaign is unchanged and a newly
  created safe test campaign receives the current template default.

## 13. Approaches Considered

### A. Template default copied into each campaign — selected

This matches the approved lifecycle: admin ownership, immediate default changes
for future campaign creation, and immutable historical output. It also matches
the report-style inheritance model without giving coaches another decision.

### B. Store Welcome content in Template Version — rejected

This would make changes wait for publication and tie copy updates to question
versioning. The approved behavior requires a saved admin default to affect new
campaigns moving forward without publication.

### C. Read the live template default on every participant visit — rejected

This is simpler storage but retroactively changes active campaigns, which the
approved design explicitly forbids.

### D. Admin default plus coach campaign override — rejected

This reintroduces inconsistent instrument wording and adds complexity to the
coach workflow. It conflicts with the same ownership simplification motivating
removal of coach report-style selection.

### E. Dedicated Welcome tab or Settings card — rejected

A dedicated tab adds permanent navigation for one structured card. Settings
disconnects participant content from its position in the journey and lengthens
an already substantial page. The first collapsible Build card is the approved
visual design.

## 14. Documentation and Source-of-Truth Updates

Implementation and launch must:

- supersede ADR-0026 with the new data ownership and snapshot rationale;
- update the `Welcome screen` glossary entry in `CONTEXT.md`;
- document the coach/admin report-style ownership boundary;
- update `CLAUDE.md` and prepend a full `plans/CHANGELOG.md` entry before every
  production push; and
- update affected admin/coach wireframes before implementation acceptance.

The durable domain statement becomes:

> The invited Welcome screen is an admin-authored assessment-template default
> copied into an immutable campaign snapshot at invited campaign creation.
> Template edits affect future campaigns only. Public Welcome screens remain a
> separate flow.
