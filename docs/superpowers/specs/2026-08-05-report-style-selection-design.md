# Scaling Up Full Report Style Selection

**Status:** Approved design  
**Date:** 2026-08-05  
**Scope:** Scaling Up Full individual on-screen and printed/downloaded reports

## 1. Problem

Scaling Up Full currently has one report presentation. The requested capability is a curated choice of report presentations: the existing design, an Executive Boardroom design, and a Modern Dashboard design.

This is not a color-theme switch. The supplied concepts vary typography, page composition, chart form, density, and section order. They must nevertheless communicate one canonical assessment result. A presentation choice must never change scoring, report meaning, recommendations, titles, or metric definitions.

The product needs two levels of control:

- An admin sets the default used by future Scaling Up Full campaigns.
- A coach may override that default for a campaign they own, until the campaign receives its first completed response.

After the first completion, the campaign style is immutable so reports from the same campaign remain consistent over time.

## 2. Goals

1. Offer three audited report styles:
   - `CLASSIC`
   - `EXECUTIVE_BOARDROOM`
   - `MODERN_DASHBOARD`
2. Let an admin set the default on the Scaling Up Full template.
3. Copy that default into each new campaign.
4. Let the owning coach override the copied value before the first completed response.
5. Freeze the campaign value atomically with its first successful completion.
6. Apply the selected style to both the on-screen individual report and browser-print PDF.
7. Preserve one canonical report title, data model, metric definition, recommendation set, and meaning across all styles.
8. Preserve existing campaigns and the current Classic renderer by default.
9. Provide safe, representative previews without loading respondent data.

## 3. Non-goals

The first release does not change or theme:

- Qualitative individual reports.
- Scored or qualitative group reports.
- Results-email HTML.
- Assessment scoring, frozen submission results, findings resolution, or recommendations.
- Coach branding or report-content authoring.
- Paper size as a separate user setting.
- Arbitrary admin-authored CSS, HTML, fonts, colors, or layouts.
- A style marketplace or user-created report styles.
- A server-side PDF generation service.

## 4. Approved Product Decisions

| Decision | Approved behavior |
| --- | --- |
| Catalog | Fixed catalog: Classic, Executive Boardroom, Modern Dashboard |
| Admin ownership | Admin sets the default on Scaling Up Full template Settings |
| Coach ownership | Coach may override for a campaign they own |
| Inheritance | New campaign copies the admin default at creation |
| Admin changes | Affect future campaigns only |
| Freeze point | First successfully completed response |
| Locked presentation | Picker remains visible and read-only with an explanation |
| Existing design | Retained as Classic and used as the migration/default value |
| Preview | Three safe sample pages: cover, executive summary, detailed recommendation |
| Content semantics | Canonical across all styles; presentation only may vary |
| First-release report | Scaling Up Full individual report only |
| Output surfaces | On-screen report and browser-print/download PDF |
| Page size | Classic stays A4; two new styles use US Letter |
| Extensibility | Curated registry only; no user-authored styling |

## 5. End-user Experience

### 5.1 Admin default

Location:

`Admin → Assessments → Templates → Scaling Up Full → Settings → Default report appearance`

The control lives inside the existing ED10 Settings tab and current admin shell. It contains:

- Three selectable style cards.
- Style name, short positioning description, and paper format.
- A representative sample preview with Cover, Summary, and Detail tabs.
- Copy explaining that the default is copied only into future campaigns.
- A `Save default` action.

Changing the default does not modify existing campaigns or reports.

### 5.2 Coach selection during campaign creation

For Scaling Up Full, the campaign wizard shows a `Report appearance` panel near the existing results-delivery controls. It initializes from the template default returned by the server.

The coach may accept the inherited value or choose another catalog style. Creation persists the final selected style on the campaign. The UI identifies whether the selection is inherited or coach-selected.

The panel does not appear for other assessment templates in the first release.

### 5.3 Coach selection after creation

Location:

`Coach portal → Assessments → Campaign details → Settings → Report appearance`

Before the first completed response, the owning coach sees the same three cards and sample previews and may save a different style.

After the first completion:

- The selected card remains visible.
- All cards are read-only.
- The UI explains that report appearance was fixed when the first response completed.
- The recorded lock time is displayed.
- No control is hidden merely because it is immutable.

### 5.4 Preview behavior

Preview data is a committed, synthetic ABC Corp fixture. It contains no production, organization, coach, or respondent data.

Each style has three representative preview pages:

1. Cover.
2. Executive summary.
3. Detailed recommendation.

The preview is non-authoritative. If a preview asset cannot load, the chosen card remains selectable and saveable; the preview panel shows `Preview unavailable` with a retry affordance.

Preview artifacts must be generated from the approved fixed fixture and reviewed whenever their renderer changes. The preview path never invokes the respondent-report loader.

## 6. Data Model

Introduce a closed Prisma enum:

```prisma
enum AssessmentReportStyle {
  CLASSIC
  EXECUTIVE_BOARDROOM
  MODERN_DASHBOARD
}
```

Add template-level default presentation policy:

```prisma
model AssessmentTemplate {
  defaultReportStyle AssessmentReportStyle @default(CLASSIC)
}
```

Add campaign-level snapshot and lifecycle fields:

```prisma
enum AssessmentReportStyleSource {
  TEMPLATE_DEFAULT
  CAMPAIGN_OVERRIDE
}

model AssessmentCampaign {
  reportStyle          AssessmentReportStyle       @default(CLASSIC)
  reportStyleSource    AssessmentReportStyleSource @default(TEMPLATE_DEFAULT)
  reportStyleLockedAt  DateTime?
}
```

These are presentation fields. They do not belong in `AssessmentTemplateVersion.reportConfig` because:

- The admin default is intended to affect future campaigns without creating a new assessment version.
- A campaign must retain a stable copied value even if the template default changes later.
- The existing version `reportConfig` is content-hashed and is not the live presentation-policy source.

### 6.1 Migration treatment

- Every existing template receives `CLASSIC`.
- Every existing campaign receives `CLASSIC` and `TEMPLATE_DEFAULT`.
- Existing campaigns with completed submissions receive `reportStyleLockedAt` equal to their earliest submission time.
- Existing campaigns with no completed submissions remain unlocked and may be changed by an authorized owner after launch.
- No existing rendered report changes as a consequence of the migration.

## 7. Creation and Update Flow

### 7.1 Admin default update

The existing privileged template-update boundary accepts a validated `defaultReportStyle` only when the template alias is exactly `scaling-up-full` and the feature is available.

For other aliases:

- `CLASSIC` remains the effective style.
- The control is absent.
- A crafted request for a non-Classic value returns `400`.

### 7.2 Campaign creation

The server loads the selected template and its current default. It resolves:

```text
explicit eligible coach choice ?? template.defaultReportStyle ?? CLASSIC
```

The server, not the browser, validates eligibility. When the explicit value differs from the copied default, `reportStyleSource` is `CAMPAIGN_OVERRIDE`; otherwise it is `TEMPLATE_DEFAULT`.

### 7.3 Campaign update before first completion

The update boundary validates:

- The feature is available.
- The template alias is `scaling-up-full`.
- The actor owns the campaign or has the existing admin intervention authority.
- The requested key exists in the closed catalog.
- `reportStyleLockedAt` is null.

The write uses a conditional update on the campaign row. It never performs an unchecked read-then-write sequence.

Every successful post-creation campaign style update sets `reportStyleSource` to `CAMPAIGN_OVERRIDE`, regardless of whether the authorized actor is the owning coach or an intervening admin. The source records the policy level, not the actor identity.

### 7.4 Atomic first-completion freeze

The first operation inside the successful submission transaction conditionally sets `reportStyleLockedAt` on the campaign row before persisting the completed submission. This obtains the campaign-row lock that orders a concurrent coach update against the completion.

The outcomes are deterministic:

- Coach update commits first: the submission then freezes the newly selected style.
- Submission freeze commits first: the coach update affects zero rows and returns `409`.
- Submission transaction rolls back: the style lock rolls back with it.

The `409` response states:

> Report appearance was locked when the first response completed. Refresh to see the final style.

No last-write-wins override is allowed after a report exists.

## 8. Canonical Report Presentation Architecture

The current `RespondentReport` remains the frozen source of report facts. Add the campaign `reportStyle` to that model at every construction site.

For scored reports, introduce a pure canonical presentation model:

```text
RespondentReport
  → buildScoredReportViewModel(report)
  → Classic | Executive Boardroom | Modern Dashboard renderer
```

The view model owns canonical, renderer-independent values:

- Report and campaign names.
- Respondent, company, coach, date, and provenance.
- Overall score, points, item count, and section count.
- Five Decisions values.
- Strengths and priorities.
- Section scorecard rows.
- Question scores and recommendations.
- Additional responses and closing content.
- Degraded-state information.

Every feature-enabled renderer consumes the same view model. A renderer may change only:

- Typography.
- Color and status presentation.
- Chart form.
- Density and whitespace.
- Page composition and section order.
- One- or two-column layout.

A renderer may not change:

- Assessment or report title.
- Wording and recommendations.
- Metric formula or precision.
- Included data.
- Strength/priority selection rules.
- CTA eligibility.

### 8.1 Metric clarity

Five Decisions values are means of section means, while the overall average is weighted across answered items. The two new styles must label the decision measure `Average across sections` or provide an equally explicit methodology note. This clarifies existing semantics without changing any value.

Classic remains byte-compatible in the first release; any Classic wording correction is a separate change.

### 8.2 Dispatch rules

Renderer selection occurs only after the existing qualitative/scored dispatch:

1. Qualitative report: existing qualitative renderer, unchanged.
2. Scored report with alias other than `scaling-up-full`: existing Classic path.
3. Scaling Up Full with feature unavailable, killed, missing style, or unknown style: Classic.
4. Eligible Scaling Up Full: resolve the closed style registry.

The registry stores metadata such as label, description, page format, preview references, and renderer key. It contains no user-supplied styling code.

### 8.3 Classic compatibility

Classic remains the migration default, flag-off behavior, kill-switch behavior, and unknown-style fallback.

The existing Classic DOM and print CSS must remain unchanged when the feature is off. While the feature is enabled, a Classic adapter may consume the shared view model only after snapshot and DOM-parity tests prove that it emits the same Classic artifact. Flag-off, kill, and defensive fallback retain an unmodified legacy Classic branch until that proof exists; new-style rendering can never make emergency Classic output unavailable.

## 9. Print and Font Behavior

The first release retains the current browser-print/download pipeline.

- Classic continues using its existing A4 rules.
- Executive Boardroom uses named US Letter page rules and its approved margins.
- Modern Dashboard uses named US Letter page rules and its approved margins.
- Full-bleed and inner-page rules are style-specific and must not alter Classic.
- Print and on-screen output consume the same renderer and canonical view model.

Playfair Display and Inter must be self-hosted or bundled through the application. Report fidelity must not depend on a remote font request succeeding during printing.

The print contract includes:

- No clipped or overlapping content.
- No broken glyphs.
- No blank trailing pages.
- Stable page breaks for representative and maximum-length fixtures.
- Page numbering and recurring confidentiality/provenance on inner pages for the two new styles.
- Status meaning conveyed by labels and numbers, not color alone.

## 10. Failure and Fallback Behavior

| Situation | Behavior |
| --- | --- |
| Coach save races first completion | Conditional write loses after lock and returns `409` |
| Missing or unknown stored style | Render Classic and emit a privacy-safe diagnostic |
| Non-Classic style on ineligible template | Reject write with `400`; render Classic defensively |
| Feature flag off | Hide new controls and render Classic |
| Kill switch active | Hide or disable new controls and render Classic without erasing stored choices |
| Preview unavailable | Show explicit preview error; selection remains usable |
| Existing campaign with submissions | Classic and locked at earliest submission |
| Existing campaign without submissions | Classic and editable until first completion |

Diagnostics may include the campaign ID, template alias, and invalid style key. They must not include respondent answers, names, email addresses, recommendations, or report content.

## 11. Authorization and Privacy

- Admin default changes use the existing privileged template permission.
- Campaign changes require the owning coach or existing admin intervention authority.
- The lock applies equally to coaches and admins once a completed response exists.
- Client state is never authoritative for template eligibility, ownership, lock state, or available style keys.
- Preview data is synthetic and committed.
- React continues auto-escaping report text.
- No arbitrary CSS, HTML, scripts, font URLs, or image URLs are persisted through the style selection fields.

## 12. Feature Flags and Rollback

The capability ships dark behind a new report-style feature flag with:

- Global enablement.
- Controlled template/campaign canary support.
- Kill precedence.

Flag-off and kill behavior must use the current Classic renderer. Stored selections are retained so disabling and re-enabling the capability is reversible.

The additive schema migration is not rolled back during an emergency presentation rollback; the kill switch is the operational rollback path.

## 13. Verification

### 13.1 Unit and model tests

- Closed registry resolution and Classic fallback.
- Scaling Up Full eligibility.
- Canonical view-model calculations and labels.
- Identical canonical values consumed by every style.
- Admin default and campaign source resolution.
- Preview fixture contains no production identifiers.

### 13.2 API, authorization, and transaction tests

- Privileged admin default update.
- Unauthorized template update rejection.
- Coach-owned campaign update.
- Cross-coach update rejection.
- Admin intervention before lock.
- All actors rejected after lock.
- Conditional update returns `409` after first completion.
- Concurrent coach-save/first-submit ordering.
- Submission rollback does not leave a lock.
- Other templates reject non-Classic values.
- Flag-off and kill behavior.

### 13.3 Renderer and accessibility tests

- Classic flag-off DOM/output parity.
- Every feature-enabled selected renderer receives one canonical view model; the legacy Classic fallback is covered by separate parity assertions.
- Canonical title, values, recommendation text, and CTA behavior agree across styles.
- Semantic headings, tables, labels, and keyboard-operable cards.
- Visible focus state and programmatic selected/read-only state.
- Status labels remain understandable without color.

### 13.4 Visual and print QA

Test both new styles with normal, partial, degraded, and maximum-length fixtures at desktop, mobile, and US Letter print sizes.

Inspect:

- Cover.
- Executive summary.
- Strengths and priorities.
- Section scorecard.
- Decision and section transitions.
- Detailed recommendation pages.
- Additional responses and closing page.
- Long names, labels, recommendations, and coach branding.
- Missing optional values.
- Font loading and page-break boundaries.

No PDF is accepted with clipping, overlap, blank pages, broken glyphs, missing provenance, or unreadable body text.

### 13.5 Repository gates

Run from `src/`:

```bash
npx eslint <changed files>
npx jest <targeted suites> --runInBand
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

No gate may be reported as passing unless it was run and observed passing.

## 14. Rollout

1. Deploy the additive migration and feature code with the flag off.
2. Verify existing campaigns and reports remain Classic.
3. Enable only for controlled Scaling Up Full test campaigns.
4. Exercise admin default, campaign inheritance, coach override, concurrent first completion, locked UI, on-screen output, and PDF output.
5. Visually accept Executive Boardroom and Modern Dashboard using real application output.
6. Enable the picker generally while leaving Classic as the admin default.
7. Change the production admin default only through an intentional admin action after visual acceptance.
8. Retain kill-switch coverage and run production smoke checks after deploy and general enablement.

## 15. Acceptance Criteria

The feature is accepted only when all of the following are true:

1. Existing campaigns and Classic reports remain unchanged by default.
2. Admin can select a Scaling Up Full default and sees that it affects future campaigns only.
3. A new campaign copies the current default.
4. Its owning coach can override the style before the first completion.
5. The first successful completion atomically freezes the campaign style.
6. A concurrent or later coach update cannot overwrite the frozen style.
7. The selected on-screen and printed/downloaded report use the same renderer and canonical values.
8. All styles share titles, metric definitions, values, recommendations, and report meaning.
9. Qualitative, group, email, and other scored-report surfaces remain unchanged.
10. Invalid, disabled, killed, or unavailable style resolution fails closed to Classic.
11. Preview surfaces contain no production PII.
12. The two new US Letter outputs pass the complete visual and print QA matrix.
13. Required tests, migration safety, lint, and Turbopack build gates pass.
