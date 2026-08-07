# Universal Individual Report Appearances

**Status:** Approved design

**Date:** 2026-08-06

**Supersedes:** The eligibility, scope, dispatch, UX, and rollout limits in
`2026-08-05-report-style-selection-design.md` that restricted selectable report
appearances to Scaling Up Full individual reports. The deployed persistence,
inheritance, lock, fallback, and curated-catalog decisions remain in force.

## 1. Problem

The deployed report-appearance feature stores a template default and a
campaign-level snapshot, but the product exposes and honors non-Classic
appearances only when the template alias is exactly `scaling-up-full`.

That restriction conflicts with the intended product: every quiz and assessment
that produces an individual result must support the same curated appearance
catalog. This includes scored, qualitative, custom, invited, and public
campaigns.

Removing the alias check alone is unsafe. The two alternate renderers currently
consume a Scaling Up Full-specific scored model and assume concepts such as Five
Decisions, numeric scorecards, and scored priorities. Qualitative and sparse
custom reports do not necessarily contain those concepts. A universal solution
must preserve each assessment's actual semantics while adapting the visual
composition.

## 2. Approved Scope

### 2.1 Included

- Every currently renderable individual assessment report.
- Scored assessments.
- Qualitative assessments.
- Custom assessments, including sparse or narrative-only reports.
- Invited campaign respondent reports.
- Public quiz results shown immediately after submission.
- Authenticated public-submission and referral reports.
- Coach/Admin views of an individual respondent report.
- On-screen presentation.
- Browser print and Save-as-PDF presentation.
- The three closed-catalog appearances:
  - `CLASSIC`
  - `EXECUTIVE_BOARDROOM`
  - `MODERN_DASHBOARD`

### 2.2 Explicitly excluded

- Group or aggregate reports.
- Respondent longitudinal/trend reports.
- Results-email HTML.
- Short coach-notification emails.
- Assessment scoring, interpretation, recommendation generation, or frozen
  submission results.
- Arbitrary CSS, layouts, fonts, images, or user-authored appearance definitions.
- A server-side PDF service.
- Changing how a template is classified as scored or qualitative.

The excluded outputs are distinct report families with different models and
rendering constraints. They require separate future adaptations and must remain
unchanged in this release.

## 3. Product Ownership and Lifecycle

### 3.1 Template default

An Admin or Staff user sets the default report appearance for every assessment
template:

`Admin → Assessments → Templates → [Template] → Settings → Default report appearance`

The default affects future campaigns only. It never retroactively changes an
existing campaign.

### 3.2 Coach-owned campaign choice

The owning coach may choose a campaign-specific appearance during campaign
creation or before the campaign's first completed submission.

An Admin or Staff user may view the selected appearance for a coach-owned
campaign but may not change it. This intentionally replaces the current
report-style-only admin-intervention behavior and enforces the approved rule:
admins own global defaults; coaches own their specific campaigns.

### 3.3 Admin-owned public campaign choice

An Admin or Staff user may choose a campaign-specific appearance while creating
an admin-owned public campaign and may change it before the campaign's first
completed submission.

If no explicit choice is made, the public campaign snapshots the current
template default. Respondents never choose an appearance.

### 3.4 Inheritance

Campaign creation resolves:

```text
authorized explicit campaign choice
  ?? current template default
  ?? CLASSIC
```

The resolved appearance is copied into the campaign. The campaign stores
`CAMPAIGN_OVERRIDE` only for an explicit authorized choice; otherwise it stores
`TEMPLATE_DEFAULT`.

### 3.5 First-completion lock

The first successfully committed submission permanently locks the campaign
appearance. The lock applies to:

- invited campaigns;
- public campaigns;
- coach-owned campaigns;
- admin-owned campaigns;
- every assessment report type.

The selected appearance remains visible after locking, together with the lock
timestamp and an explanation. No actor may override the appearance after the
lock.

Concurrent save and completion retain the existing deterministic ordering:

- appearance save commits first: the submission freezes the saved appearance;
- completion freezes first: the save affects no row and returns `409`;
- submission rolls back: the lock rolls back with it.

### 3.6 Existing campaigns

- Existing campaigns retain their stored appearance snapshot. Pre-feature
  campaigns remain `CLASSIC`; any deliberately selected non-Classic value is
  never reset by this expansion.
- Existing campaigns with one or more submissions remain locked.
- Existing campaigns without submissions remain editable by the authorized
  campaign owner.
- A new template default never re-inherits into either group.

## 4. Appearance Eligibility

Every assessment template is eligible for the complete closed catalog.
Eligibility must not depend on a template alias.

The server is authoritative for:

- feature availability;
- kill-switch state;
- template and campaign canaries;
- actor authorization;
- campaign ownership;
- lock state;
- valid catalog keys.

Client code must not reproduce alias checks or decide availability from template
names.

Operational gates remain independent of product eligibility. Flag-off, kill, or
an unavailable canary hides write controls and renders Classic without erasing
stored choices.

## 5. Adaptive Presentation Architecture

### 5.1 Canonical flow

```text
Frozen RespondentReport
        ↓
Existing scored or qualitative fact builder
        ↓
Instrument-neutral IndividualReportPresentation
        ↓
Classic | Executive Boardroom | Modern Dashboard
```

The style layer does not classify assessments or calculate report facts.
Existing scored/qualitative routing remains authoritative. The universal
presentation builder consumes the canonical output of that routing.

### 5.2 Instrument-neutral contract

The presentation model is a discriminated collection of semantic report blocks.
The exact TypeScript names may be refined in the implementation plan, but the
contract must represent at least:

```ts
type IndividualReportPresentation = Readonly<{
  identity: ReportIdentity;
  blocks: readonly IndividualReportBlock[];
  provenance: ReportProvenance;
}>;

type IndividualReportBlock =
  | ScoreSummaryBlock
  | MetricGroupBlock
  | QualitativeScaleBlock
  | ThemeBlock
  | FindingBlock
  | RecommendationBlock
  | NarrativeResponseBlock
  | AdditionalResponseBlock
  | CoachCtaBlock
  | ClosingBlock;
```

All blocks are optional except report identity and provenance. Builders emit only
facts present in the canonical report.

### 5.3 Semantic invariants

An appearance renderer may change:

- typography;
- color and non-color status treatment;
- spacing and density;
- chart form;
- one- or two-column composition;
- page composition and section order;
- print page-break treatment.

An appearance renderer may not:

- calculate or modify scores;
- change metric precision;
- infer missing metrics;
- invent a tier, scorecard, category, finding, or recommendation;
- omit an emitted canonical fact because it is inconvenient to render;
- rewrite assessment-authored labels, findings, or recommendations;
- change CTA eligibility;
- alter report ownership, access, or provenance.

When an assessment lacks a block, the renderer omits it cleanly. It must not
leave an empty card, blank column, placeholder heading, or unexplained gap.

### 5.4 Scored reports

Scored builders may emit score summaries, category/domain metrics, section
metrics, tier/status information, findings, recommendations, additional
responses, and the eligible CTA.

No renderer may assume that a scored report has:

- domains;
- a Five Decisions structure;
- a 0–10 scale;
- a score table;
- a tier;
- a coach CTA.

The existing report configuration continues to decide which scored facts exist.

### 5.5 Qualitative reports

Qualitative builders reuse the canonical qualitative report model and may emit
scales, selected labels, themes, findings, narrative answers, recommendations,
and additional responses.

Score-only blocks are absent. Alternate appearances must remain visibly
Executive Boardroom or Modern Dashboard without introducing numeric summary
cards or score terminology.

### 5.6 Sparse custom reports

A custom report with only authored prompts and narrative responses still
supports all three appearances. It receives the selected typography,
composition, hierarchy, provenance, and print treatment without artificial
metrics or filler sections.

This feature does not change the existing scored/qualitative classification of a
custom template. It adapts whatever canonical report that template already
produces.

### 5.7 Classic compatibility

Classic remains:

- the persistence default;
- the migration value;
- the flag-off output;
- the kill-switch output;
- the invalid-value fallback;
- the emergency renderer.

Existing Classic scored and qualitative renderers remain the authoritative
Classic paths until parity evidence supports any later consolidation. Universal
eligibility must not require rewriting Classic output.

### 5.8 Explicit dispatch

Renderer dispatch must use an exhaustive registry or switch over the closed
catalog. It must not treat any unrecognized non-Classic key as Modern Dashboard.
Unknown, malformed, or unavailable keys resolve to Classic and emit only a
privacy-safe diagnostic.

## 6. End-User Experience

### 6.1 Navigation

No new top-level Admin or Coach navigation item is added. Report appearance
lives within existing Template Settings, campaign creation, Campaign Detail, and
Public Campaigns surfaces.

Use one customer-facing term everywhere:

- section: `Report appearance`;
- template section: `Default report appearance`;
- provenance: `Template default` or `Campaign choice`;
- actions: `Save default` and `Save report appearance`.

Reserve `reportStyle` for code.

### 6.2 Template Settings

Every template shows the full appearance picker:

- three selectable appearance cards;
- style name and instrument-neutral description;
- paper format;
- Cover, Summary, and Detail sample previews;
- copy explaining that the default affects future campaigns only;
- `Save default`.

### 6.3 Coach campaign creation

Campaign creation shows compact appearance cards near the existing
results-delivery settings. It includes:

- the inherited template default;
- a selected thumbnail;
- an expandable Cover/Summary/Detail preview;
- provenance copy;
- the final selected appearance in Review.

Review copy uses the appearance name, for example:

`Executive Boardroom · Campaign choice`

### 6.4 Coach Campaign Detail

Before completion, the owning coach sees the full picker and may save a new
appearance.

After completion, the selected card remains visible and read-only with:

> Report appearance was fixed when the first response was completed.

The lock timestamp is displayed.

### 6.5 Admin view of a coach-owned campaign

The Admin campaign page shows the selected appearance and provenance as
read-only. It exposes no save action.

### 6.6 Public Campaigns

The existing public-campaign creation surface shows the compact picker and
template-default inheritance. The existing management surface exposes the full
picker for the selected admin-owned public campaign until first completion,
after which it becomes read-only.

### 6.7 Respondent result surfaces

Respondents do not see an appearance picker. The frozen campaign appearance is
used consistently for:

- immediate public quiz results;
- immediate invited results-on-screen;
- later authenticated individual report views;
- browser print and Save-as-PDF.

## 7. Preview System

Preview content is committed and synthetic. It contains no production
organization, coach, respondent, submission, or referral data.

The preview system provides three representative anatomies:

1. scored;
2. qualitative;
3. sparse custom.

Each anatomy is available in each appearance with:

1. Cover;
2. Summary;
3. Detail.

The picker selects the representative anatomy matching the template's existing
canonical report family and capabilities. Sparse content must demonstrate that
layouts collapse cleanly when metrics or recommendations are absent.

Previews are illustrative, not authoritative. If an asset fails:

- the selected appearance remains selectable;
- save remains available;
- the preview displays `Preview unavailable`;
- retry remains possible.

Preview generation must use the same approved renderer paths and synthetic
fixtures that visual QA exercises.

## 8. Print and Responsive Behavior

- Classic retains its current A4 rules.
- Executive Boardroom retains US Letter rules.
- Modern Dashboard retains US Letter rules.
- On-screen and print output consume the same appearance renderer.
- Mobile layouts collapse multi-column compositions without horizontal scroll.
- Missing blocks collapse without blank cards or columns.
- Status meaning uses text and numbers, not color alone.
- Fonts required for print are bundled or self-hosted.
- Maximum-length labels, findings, recommendations, and narrative answers must
  not clip, overlap, or create blank trailing pages.
- Page provenance and confidentiality treatment remain present wherever the
  appearance requires them.

## 9. Data and API Changes

The deployed fields remain the persistence source:

```prisma
AssessmentTemplate.defaultReportStyle
AssessmentCampaign.reportStyle
AssessmentCampaign.reportStyleSource
AssessmentCampaign.reportStyleLockedAt
```

No replacement schema is required for universal eligibility.

Required server changes include:

- remove the Scaling Up Full alias restriction from template and campaign style
  policy;
- centralize availability in a server-owned resolver;
- return availability for every eligible template through template-list APIs;
- permit a non-Classic default on every template when the feature is available;
- apply inheritance and explicit choices to every invited campaign;
- add inheritance and explicit choices to public-campaign creation;
- expose authorized pre-lock updates for admin-owned public campaigns;
- reject Admin/Staff style writes to coach-owned campaigns;
- preserve the isolated style-only conditional update and `409` behavior;
- pass availability through every individual-report entry point.

### 9.1 Public submission race correction

The public quiz path currently prepares report/email data from a campaign object
loaded before the submission transaction locks the appearance. A concurrent
authorized style save can therefore commit after the pre-read but before the
lock.

The completion transaction must acquire the campaign row ordering and resolve
the final stored appearance before building or committing any immediate
appearance-dependent result artifact. The stored campaign, immediate result,
and later report must agree.

Email HTML remains visually unchanged even though its canonical report input
may carry the final appearance value.

### 9.2 Historical import consistency

Any import path that creates a campaign together with completed submissions must
also:

- resolve and snapshot its report appearance;
- set `reportStyleLockedAt` to the earliest imported submission time;
- do so in the same transaction as campaign/submission creation.

Existing post-migration rows with submissions and a null lock must be audited
before correction. No customer data is modified without an explicit reviewed
repair step.

## 10. Authorization and Privacy

- Template default writes require existing Admin/Staff template authority.
- Coach campaign writes require exact campaign ownership plus existing
  organization/template access.
- Admin-owned public campaign writes require existing privileged public-campaign
  authority and ownership.
- Admin/Staff cannot use the report-style endpoint to override a coach-owned
  campaign.
- All actors are rejected after the first-completion lock.
- Client state is not authoritative for roles, ownership, lock state,
  availability, or catalog values.
- React continues escaping authored content.
- No arbitrary CSS, HTML, script, font URL, or image URL is stored through the
  appearance fields.
- Diagnostics may include campaign ID, template ID/alias, report archetype, and
  appearance key. They must not include names, emails, answers, findings,
  recommendations, or report text.

## 11. Failure and Fallback Behavior

| Situation | Required behavior |
| --- | --- |
| Feature flag off | Hide write controls and render Classic |
| Kill switch active | Hide or disable write controls and render Classic without erasing stored choices |
| Missing or invalid stored key | Render Classic and emit a privacy-safe diagnostic |
| Unknown renderer key | Render Classic; never implicitly choose Dashboard |
| Missing optional report block | Omit it and collapse layout cleanly |
| Preview unavailable | Keep selection/save usable and show an explicit preview error |
| Save loses to first completion | Return `409` and show the locked final appearance |
| Submission transaction rolls back | Roll back the appearance lock |
| Unauthorized admin override of coach campaign | Return `403` |
| Public pre-read differs from locked appearance | Rebuild/resolve from the final transactional value |
| Renderer fails before response commit | Fail closed to Classic where safely possible and emit a privacy-safe diagnostic |

## 12. Feature Flags and Rollout

Retain:

- global enablement;
- exact template and campaign canaries;
- kill precedence;
- Classic fallback without data erasure.

Roll out:

1. Deploy code with global enablement off.
2. Confirm existing individual, group, trend, and email artifacts are unchanged.
3. Canary one scored invited campaign.
4. Canary one qualitative invited campaign.
5. Canary one public quiz.
6. Canary one sparse custom assessment.
7. For each canary, exercise all three appearances on-screen and in print/PDF.
8. Verify inheritance, authorized override, first-completion lock, and read-only
   post-lock UI.
9. Visually accept normal, partial, degraded, and maximum-length fixtures.
10. Enable globally while leaving template defaults as Classic.
11. Change any production template default only through an intentional Admin
    action.
12. Retain the kill switch and production smoke checks.

The original Scaling Up Full-only campaign canary is insufficient evidence for
global enablement.

## 13. Verification

### 13.1 Policy and model tests

- Every template is appearance-eligible without alias matching.
- Closed registry validates all three keys.
- Unknown keys resolve Classic.
- Scored presentation blocks preserve canonical values and labels.
- Qualitative presentation blocks preserve canonical labels, answers, and
  findings without emitting scored blocks.
- Sparse custom reports emit no artificial metric, tier, or scorecard.
- Optional blocks collapse without placeholders.
- Every appearance receives identical semantic blocks for the same report.

### 13.2 API and authorization tests

- Admin/Staff may update every template default.
- Coach cannot update a template default.
- Coach may select an appearance while creating an owned campaign.
- Coach may update an owned campaign before lock.
- Cross-coach update is rejected.
- Admin/Staff update to a coach-owned campaign is rejected.
- Admin/Staff may choose and update an admin-owned public campaign before lock.
- Public campaign creation inherits the template default when no choice is
  supplied.
- Every actor is rejected after lock.
- Crafted invalid catalog keys are rejected.
- Flag-off and kill behavior retain stored choices and render Classic.

### 13.3 Concurrency and import tests

- Coach save then completion freezes the saved value.
- Completion then coach save returns `409`.
- Submission rollback leaves no lock.
- Public submit uses the final locked appearance, not a stale pre-read.
- Imported completed campaigns are locked to the earliest imported submission.
- Import retries preserve appearance and lock idempotently.

### 13.4 Entry-point tests

Exercise:

- invited authenticated individual report;
- invited results-on-screen;
- public quiz immediate result;
- authenticated public-submission/referral result;
- coach and Admin individual respondent views;
- browser print for every report anatomy and appearance.

### 13.5 Visual, print, responsive, and accessibility tests

For scored, qualitative, and sparse custom fixtures, test all three appearances
with:

- normal content;
- partial content;
- degraded/missing optional data;
- maximum-length content;
- desktop;
- mobile;
- A4 where Classic applies;
- US Letter where Executive or Dashboard applies.

Reject output with clipping, overlap, horizontal scroll, broken glyphs, blank
trailing pages, missing provenance, unreadable type, color-only meaning, empty
cards, or empty columns.

Verify keyboard selection, visible focus, programmatic selected/read-only state,
semantic headings, accessible tables/lists, and understandable lock copy.

### 13.6 Regression tests

Prove that this release does not alter:

- group report models or renderers;
- longitudinal/trend models or renderers;
- results-email HTML;
- short notification emails;
- assessment scoring;
- frozen submission results;
- Classic flag-off output.

### 13.7 Repository gates

Run from `src/`:

```bash
npx eslint <changed files>
npx jest <targeted suites> --runInBand
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

No verification result may be reported as passing unless it was run and observed
passing.

## 14. Acceptance Criteria

The release is accepted only when:

1. Every assessment template offers Classic, Executive Boardroom, and Modern
   Dashboard.
2. Admin controls the template default for future campaigns.
3. The owning coach controls an owned campaign before first completion.
4. Admin controls an admin-owned public campaign before first completion.
5. Admin cannot override a coach-owned campaign appearance.
6. The first successful completion atomically freezes the appearance.
7. Every individual report entry point uses the campaign snapshot.
8. Scored, qualitative, and sparse custom reports preserve the same canonical
   facts across all appearances.
9. Missing concepts are omitted without invented data or broken composition.
10. Immediate public results and later authenticated results agree.
11. Existing campaigns retain their stored appearance; completed campaigns
    remain locked.
12. Classic remains the flag-off, kill, invalid-value, and emergency fallback.
13. Group reports, trends, and email HTML remain unchanged.
14. The scored, qualitative, public, and sparse-custom canaries pass visual and
    print acceptance.
15. Required authorization, concurrency, model, renderer, accessibility,
    regression, migration-safety, lint, test, and Turbopack gates pass.
