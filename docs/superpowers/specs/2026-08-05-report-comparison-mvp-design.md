# Report-Native Comparison MVP — Design

**Date:** 2026-08-05

**Status:** Product direction approved; CEO self-access amendment approved;
implementation plan prepared

**Scope:** Scaling Up Full respondent reports for coaches, admins, and the
designated CEO viewing only their own history

## 1. Outcome

Make a person's current Scaling Up Full report directly comparable with one
earlier report from the same person. The comparison lives inside the existing
branded report and exports through the existing Print / Download PDF path.

The intended task is concrete: a coach or admin opens the Q1 2026 report,
selects the Q1 2025 report, and sees current, previous, and change without
leaving the report or building a separate report artifact. A CEO who is
designated on the current campaign may receive the same comparison for their
own submissions through a secure, expiring self-access link. CEO access never
opens another participant, company, group report, or operator navigation.

This replaces the current discovery path for per-person comparison. It does
not replace cohort trends, compare respondents with each other, or merge peer
benchmarks into the historical comparison.

## 2. Evidence and design direction

### Esperto

Esperto does support this kind of comparison. Its Report Management area has a
four-step **Add Summary Report** wizard. Selecting **Self Comparison Report**
requires:

- exactly one **Focus Report**;
- one or more **Earlier Reports**; and
- a checkout step that creates a persistent report artifact.

The supplied 31-page Esperto self-comparison PDF shows:

- profile-level columns for CEO score, previous average, peers, deviation from
  previous, and deviation from peers;
- three bars per detailed question for current, previous, and peers; and
- separate current and previous appendices.

The live Esperto account confirms the workflow, but has only one eligible
Scaling Up report, so a new comparison could not be generated end to end. The
supplied PDF confirms the generated result.

Esperto proves the business use case, but its persistent report library and
four-step wizard are not the interaction to copy. They add composition and
checkout work to a two-report comparison.

### Other products

Culture Amp, Qualtrics, and Lattice put historical comparisons into existing
report or dashboard analytics. Lattice is the clearest interaction reference:
its Results page has a **Compare** dropdown for a previous survey or benchmark
and then adds a delta column. Qualtrics requires a historical source to be
mapped before widgets can use it, an important warning against silently
comparing incompatible fields.

SurveyMonkey's Data Trends instead follows one survey across collectors and
time. Ninety's Org Assessment guidance asks teams to transfer quarterly
component averages into a Scorecard to trend them. These are useful contrasts,
but neither is as direct as a report-level current-versus-prior control.

### Chosen direction

Use an **inline comparison control in the canonical branded report**. Suggest
the most recent eligible earlier report, allow another earlier report to be
selected, and compare exactly one current report with exactly one prior report.

## 3. Product decisions

| Decision | MVP behavior |
| --- | --- |
| Home | Existing branded respondent report |
| Operators | Coach and admin/staff roles already authorized to view the report |
| CEO self-access | A designated campaign CEO may view only their own focus report and eligible earlier submissions through an expiring, signed self-access session |
| Other participant access | None; non-CEO respondents receive no comparison controls or comparison data |
| Focus | The report currently open |
| Baseline | Exactly one earlier eligible report |
| Default | Most recent eligible earlier report is preselected, but comparison starts only after **Compare** is pressed |
| Alternative | Authorized viewer may select another eligible earlier report |
| Export | Existing browser Print / Save as PDF flow |
| Sharing | Operator may manually share the exported PDF; the CEO may print their own authorized comparison |
| Persistence | None; selection is encoded in the URL and rebuilt from frozen submissions |
| Cross-version | Exact stable-key question matching with compatibility checks; unmatched or incompatible items have no delta |
| Peer benchmarks | Remain separate and unchanged |
| Old longitudinal view | Retained temporarily for rollback; report and campaign entry points move to the report-native experience |

## 4. MVP boundary

### Included

- `templateAlias === "scaling-up-full"` only;
- invited, per-respondent reports on the canonical report route;
- coach and admin/staff operation through the same UI;
- designated-CEO self-access to that CEO's own comparison through an expiring
  signed session;
- historical Esperto-imported Scaling Up Full submissions;
- current versus one prior report;
- same-version aggregate and question deltas;
- compatible cross-version question deltas;
- comparison rendering in every launched Scaling Up Full report style:
  Classic, Executive Boardroom, and Modern Dashboard;
- print and Save as PDF output;
- accessible screen and print presentation; and
- feature flags, audit, metrics, and bounded data access.

### Excluded

- LVA, QSP, public quiz reports, and group reports;
- comparing two people or teams;
- averaging multiple earlier reports;
- comparison access for non-CEO participants;
- CEO access to another respondent, organization, group report, cohort Trends,
  or operator navigation;
- permanent CEO accounts, a CEO dashboard, or a new `User.role`;
- a saved report library, report checkout, or database record for a comparison;
- manual question mapping;
- editing or overriding historical scores;
- server-side PDF generation;
- changes to cohort Trends; and
- removal of the existing Wave N longitudinal implementation.

The one-template boundary is deliberate. Jeff's request and the supplied
Esperto artifact are for the Scaling Up Assessment. Qualitative instruments
need an answer-level comparison design, not this numeric model.

## 5. User flow

### 5.1 Entry

The existing report route remains canonical:

```text
/assessments/[campaignId]/respondents/[respondentId]/report
```

When the feature is enabled and at least one eligible baseline exists, the
screen-only action bar adds:

- label: **Compare to previous assessment**;
- a baseline selector, preselected to the most recent eligible report;
- a primary **Compare** button; and
- candidate labels containing campaign name, submitted date, and an
  **Imported** marker when applicable.

When campaign name is blank, use **Scaling Up Assessment · [submitted date]**;
do not expose ids as the fallback label.

The report does not silently enter comparison mode. Pressing **Compare** makes
the choice explicit and navigates to:

```text
/assessments/[campaignId]/respondents/[respondentId]/report?compareTo=[submissionId]
```

An explicit submission id makes refreshes, browser history, printing, and
support reproduction deterministic. It is an opaque selector, never an
authorization grant.

### 5.2 Active comparison

In comparison mode, the action bar shows the selected baseline and provides:

- **Change comparison**, which exposes the selector; and
- **Remove comparison**, which returns to the canonical URL without
  `compareTo`.

The comparison controls use `no-print`; they never appear in the PDF.

### 5.3 No candidate

When no eligible prior report exists, do not render a dead selector. The
existing report and Print / Download PDF actions remain unchanged. Do not add
an empty state to the report itself.

### 5.4 Invalid selection

An absent, malformed, inaccessible, deleted, or incompatible `compareTo`
value must not make an otherwise authorized focus report unavailable. Render
the normal focus report and show one generic screen-only message:

> That earlier assessment cannot be compared with this report.

The message must not reveal whether the supplied submission exists. Direct
unauthorized access to the focus report continues to use the current
enumeration-safe 404 behavior.

### 5.5 CEO self-access entry

CEO self-access is not a new navbar destination. `CEO` remains the existing
per-campaign `AssessmentCampaignParticipant.isCEO` designation, not a platform
login role.

When the report-comparison feature is enabled, the focus campaign is
`INVITED`, the submitting participant is the campaign's designated CEO, and
the campaign already permits respondent results disclosure through
`showResultsOnScreen` or `sendResultsToRespondent`, the server may issue a
30-day, purpose-bound report-access token for that focus submission.

The token is delivered only through an already-authorized disclosure path:

- the post-submit response when `showResultsOnScreen` is enabled; and/or
- the CEO's own results email when `sendResultsToRespondent` is enabled and
  the existing results-email approval/send gates pass.

The email link first lands on a token-exchange page with the raw token in the
URL fragment (`#t=...`), matching the existing assessment-invitation exchange
pattern. The fragment is never sent in the HTTP request. A small client
exchange component reads it into a function-local variable, posts it once to
the exchange route, and strips the fragment on every outcome without writing
it to React state, web storage, or a report URL. The route verifies the
signature and expiry, stores the grant in a `Secure`, `HttpOnly`,
`SameSite=Strict` sealed cookie scoped to the exact assessment report path,
and returns the clean canonical report URL for navigation. The bearer token
must not remain in browser history, audit metadata, metrics, or application
logs.

The CEO sees the same current/previous/change presentation and may select among
their own eligible earlier submissions. The report shell contains no coach or
admin navbar. If no eligible baseline exists, the CEO sees only their current
report, matching the operator no-candidate behavior.

Possession of a valid self-access session never authorizes the existing group
report. The shipped group report remains a separate, single-campaign
CEO-versus-team artifact. Group comparison across time is not part of this
MVP.

## 6. Comparison presentation

The approved visual direction is an extension of the existing branded report,
not a separate blue dashboard or Esperto-style report wizard.

The comparison content is part of the canonical report model and must render
in all three launched Scaling Up Full styles. Classic, Executive Boardroom,
and Modern Dashboard may use their own spacing, typography, and visual
emphasis, but they display the same current/previous/change facts, compatibility
states, coverage counts, and focus-only content rules.

### 6.1 Cover

In comparison mode, add a restrained subtitle:

```text
Compared with Q1 2025 · submitted Mar 31, 2025
```

Imported provenance is preserved for the baseline. The current report remains
the subject of the cover; it is not relabeled as a new saved report.

### 6.2 Overall result

Show **Current** and **Previous** ScaleUp scores side by side.

- When the reports use the same template version, also show a signed delta.
- Across versions, show both frozen values for context but render aggregate
  change as **Not comparable across versions**.
- Never recompute an overall score.

### 6.3 Decision and section summaries

Comparison mode adds **Current**, **Previous**, and **Change** to decision and
section summaries.

- Same-version rows use frozen `perDomain` / `perSection` values and show a
  signed delta.
- Cross-version rows show the two frozen values when the same stable key is
  present, but the Change cell is `—` with an accessible **Different version**
  explanation.
- Missing values are `—`; missing never means zero.

### 6.4 Question rows

Each current scored question row shows:

- current rating;
- previous rating; and
- signed change with an up arrow, down arrow, or neutral marker.

A question is comparable when all of these are true:

1. the exact `stableKey` exists in both frozen results;
2. both entries have finite numeric values;
3. both version definitions identify the item as `SLIDER_LIKERT`; and
4. both definitions have the same finite `min` and `max` scale bounds.

If any condition fails, previous/change is `—` and the row is marked
**New or changed question** for assistive technology. A question removed from
the current version is not inserted into the current detailed report; the
coverage note reports how many baseline-only questions were omitted.

Exact stable keys are the only automatic mapping. Labels are display copy and
must not be used to infer continuity.

### 6.5 Coverage note

Cross-version comparison adds a compact note above the detailed breakdown:

```text
18 of 20 current questions matched the earlier version. 2 new or changed
questions have no comparison.
```

If baseline-only questions exist, append their count. This makes partial
comparability visible without turning the report into a mapping tool.

### 6.6 Focus-only content

Recommendations, findings, additional/free-text responses, contact details,
and existing peer-benchmark sections remain based on the focus report only.
Historical free text is not repeated in the comparison. Peer benchmarks keep
their existing labels and data source; **Previous** never means **Peers**.

### 6.7 Export name

Comparison mode passes a descriptive filename to `PrintReportButton`, for
example:

```text
John CEOExec - Scaling Up Assessment - Q1 2026 vs Q1 2025
```

The implementation continues to use `window.print()` and the browser's Save as
PDF destination. No second PDF renderer is introduced.

## 7. Data model and services

### 7.1 No schema change

The comparison is a read model. Do not add `ComparisonReport`, checkout,
composition, or saved-filter tables. The focus and baseline remain ordinary
frozen `AssessmentSubmission` records pinned to their published versions.

### 7.2 New report-comparison module

Add this bounded assessment-domain module:

```text
src/src/lib/assessments/report-comparison.ts
```

It owns two operations:

1. list eligible baseline candidates for an authorized focus report; and
2. load and build the comparison model for one selected baseline.

The render component receives a presentation-ready model and performs no data
access, identity matching, or authorization.

### 7.3 Public model

Use these presentation-model contracts:

```ts
interface ReportComparisonCandidate {
  submissionId: string;
  campaignId: string;
  campaignLabel: string | null;
  submittedAt: Date;
  versionId: string;
  versionNumber: number;
  isImported: boolean;
}

interface ComparableValue {
  current: number | null;
  previous: number | null;
  delta: number | null;
  status: "comparable" | "different-version" | "unmatched";
}

interface ReportComparisonModel {
  baseline: ReportComparisonCandidate;
  sameVersion: boolean;
  overall: ComparableValue;
  domains: Record<string, ComparableValue>;
  sections: Record<string, ComparableValue>;
  questions: Record<string, ComparableValue>;
  coverage: {
    currentQuestionCount: number;
    matchedQuestionCount: number;
    unmatchedCurrentCount: number;
    baselineOnlyCount: number;
  };
}
```

The model contains no raw email, raw answers, or baseline recommendations.

The service accepts an explicit viewer context:

```ts
type ReportComparisonViewer =
  | { kind: "operator"; actor: ApiActor }
  | {
      kind: "ceo-self";
      focusCampaignId: string;
      focusSubmissionId: string;
      respondentId: string;
    };
```

The CEO context is constructed only after server-side self-access token
verification. Browser input must never be cast directly into this type.

### 7.4 Frozen inputs only

Build both sides from persisted `submission.result`, the submission's pinned
`version.questions`, `version.sections`, and `version.scoringConfig`. Reuse the
shared `buildQuestionMetaByKey()` metadata path so screen, email-era stored
reports, and comparison compatibility do not invent different scale rules.

Never call `scoreSubmission`, apply the current template version, or mutate a
stored result.

### 7.5 Candidate eligibility

A candidate must satisfy every rule:

- same organization as the focus report;
- same template id and `scaling-up-full` alias;
- same person identity using the existing Wave N rule: union live
  `OrgRespondent` rows by `normalizedEmail` within the organization, falling
  back to the focus `respondentId` when normalized email is absent;
- live, non-deleted campaign and respondent records;
- invited submission with a non-null frozen result and a valid submitted date;
- submitted strictly before the focus submission;
- not in the focus campaign;
- valid scored result, not a degraded result; and
- readable under the active viewer policy.

For an operator viewer, each baseline remains independently readable through
`canManageCampaign(..., "read")`. For a CEO self-viewer, a baseline is readable
only when it passes the same organization/template/person/chronology rules and
belongs to the token-bound CEO identity. A CEO grant never supplies general
campaign read authority.

Esperto-imported campaigns are eligible. Within one campaign, duplicate rows
from the identity union collapse to one candidate using the existing Wave N
deterministic ordering:

```text
submittedAt, campaign.openAt, campaignId, submissionId
```

The later row wins for a candidate campaign. Candidates sort newest first.

Reuse Wave N's capacity boundaries:

- at most 50 identity-matched respondent rows;
- at most 200 submissions inspected; and
- at most 12 baseline candidates returned.

If more history exists, label the selector **Showing 12 most recent**. Do not
silently lift these bounds in the report page.

## 8. Authorization and privacy

### 8.1 Focus report

Keep `viewRespondentReport` and ADR-0012 as the operator focus-report gate.
Add a separate CEO self gate that admits only a validated token-bound focus
submission. The report route remains dynamic, private, no-store, and
enumeration-safe in both modes.

### 8.2 Baseline

Resolve the current viewer server-side. For an operator-selected baseline:

- independently apply `canManageCampaign(..., "read")` to its campaign;
- verify organization, template, identity, chronology, and live-record scope;
- never trust candidate ids supplied by the browser; and
- use one generic fail-soft outcome for missing, forbidden, or incompatible
  baselines.

Perform the baseline authorization check and submission/version read inside one
Prisma transaction, mirroring the focus report's time-of-check/time-of-use
protection. Candidate listing may fail-soft, but selected-baseline disclosure
must not race a campaign access change.

Privileged admin/staff behavior comes from the same access-control primitive as
the current report. Coaches and admins receive the same report component; only
authorization scope differs.

### 8.3 CEO self-access authorization

Add a purpose-specific HMAC token helper for CEO self-access. The signed claims
contain only:

```ts
interface CeoReportAccessClaims {
  version: 1;
  purpose: "assessment-report-comparison-self";
  focusCampaignId: string;
  invitationId: string;
  respondentId: string;
  expiresAt: number;
}
```

The signed link binds to `invitationId` because the existing delivery pipeline
renders results email content before the submission transaction assigns a
submission id. The exchange route resolves that invitation's unique completed
submission and stores the resolved `focusSubmissionId` only in the sealed
cookie. This preserves the current render-before-transaction invariant and
does not loosen the focus binding.

Use a dedicated `ASSESSMENT_REPORT_ACCESS_SECRET`; do not reuse invitation raw
tokens or expose `NEXTAUTH_SECRET`. Missing/invalid secret, signature, purpose,
version, claim shape, or expiry fails closed. Token verification uses
constant-time signature comparison.

Every CEO report request revalidates server-side that:

- the grant is bound to the requested focus campaign, invitation, resolved
  submission, and respondent;
- the focus campaign, submission, respondent, and participant are live;
- the focus campaign uses `INVITED` access;
- the participant row still has `isCEO === true`;
- the focus submission belongs to that campaign and respondent;
- the campaign still permits respondent disclosure through
  `showResultsOnScreen || sendResultsToRespondent`; and
- the feature flag is enabled and not killed.

Turning both disclosure toggles off, removing the CEO designation, deleting
the live records, token expiry, or the comparison kill switch therefore
revokes access without storing a grant row. This preserves the MVP's no-schema
boundary.

The token grants only the focus report and that person's eligible comparison
history. It does not grant group-report, campaign-detail, exports containing
other participants, Trends, admin, coach, API, or arbitrary report-route
access. All self-access responses remain `Cache-Control: private, no-store`
with `Referrer-Policy: no-referrer`.

### 8.4 Other participants and public reports

The comparison loader and controls are not called from public reports or
non-CEO participant paths. Possessing a copied operator report URL does not
grant access. Manual PDF sharing is outside the authenticated product surface
and contains only what is rendered in the comparison report.

### 8.5 Audit and metrics

Before returning a valid comparison for rendering, write one
`VIEW_REPORT_COMPARISON` audit event with `logAuditStrict` and add that literal
to the `AuditAction` union. Record actor, focus campaign/submission, and
baseline campaign/submission identifiers; do not copy email or answer content
into metadata. If the audit write fails, omit the comparison and use the same
generic screen-only error while retaining the focus report. This is a
type/helper change, not a schema migration.

For CEO self-access, record viewer kind `CEO_SELF` instead of inventing a user
id. Audit the token exchange, focus-report view, and comparison view without
recording the raw token, cookie, respondent email, or token signature.

Add PII-free structured markers under `assessment.report_comparison.*` for:

- candidate load outcome, count, bounded state, and latency;
- comparison render outcome;
- same-version versus cross-version;
- matched/unmatched question counts; and
- invalid-selection reason as a coarse enum.

Do not log respondent name, email, campaign label, question labels, raw ids in
metrics, or answer values. Audit identifiers stay in audit storage, not metric
payloads.

## 9. Version policy and ADR impact

ADR-0016 currently permits longitudinal deltas only between identical
`versionId` values. This feature intentionally introduces a narrower exception:

- aggregate deltas remain same-version only;
- cross-version question deltas are allowed only for exact stable-key,
  same-type, same-scale matches; and
- unmatched or incompatible questions never receive a delta.

Before implementation, add a new ADR that supersedes ADR-0016 only for this
report-native question-level comparison. The existing Wave N computation and
its same-version deltas remain unchanged.

## 10. Feature flag and rollout

Add a dedicated call-time flag helper with these levers:

```text
WAVE_RC_REPORT_COMPARISON_ENABLED
WAVE_RC_REPORT_COMPARISON_CANARY
WAVE_RC_REPORT_COMPARISON_KILL
```

- `_KILL` overrides global and canary enablement.
- `_CANARY` is an exact comma/space-separated organization-id or template-id
  allowlist, matching the Wave N/O organizational rollout pattern.
- All values default off.
- Flag off must render the existing report byte-identically and perform zero
  candidate or baseline reads.

Ship dark, canary one organization with known imported and native history,
visually review screen and saved PDF, then enable globally. Rollback is the
kill switch plus redeploy; no data cleanup is required because the feature has
no writes.

## 11. Existing surfaces

### Canonical report

The report page becomes the only promoted entry for per-person comparison. It
owns candidate resolution, selected-baseline resolution, action controls,
export filename, and the comparison model passed into `BrandedReport`.

The page resolves exactly one of two authorization modes:

- signed-in operator through the existing `viewRespondentReport` gate; or
- valid CEO self-access cookie through the new narrowly scoped self gate.

The presentation component is shared; authorization is not.

`BrandedReport` passes the comparison model through its existing style
dispatcher. The legacy Classic branch and both view-model-backed renderers
must consume the same immutable comparison model; no style may recompute
deltas or silently omit comparison data.

### Campaign detail

For eligible Scaling Up Full respondents, the current branded report is the
report-native destination. The report itself exposes **Compare to previous
assessment**. Admin and coach campaign surfaces use the same destination once
the report-native rollout is active. While that rollout is dark, the existing
coach-only **Over time** entry remains as the non-regressing rollback path;
Admin never receives that legacy entry.

### Wave N longitudinal

Keep the current coach-only route, API/service, flag helper, component, and
tests during the MVP rollback window. Suppress its promoted entry point only
while report-native comparison is active, and restore it automatically while
report-native comparison is dark or killed. Do not delete the implementation
in this change. Retiring it is a separate follow-up after the report-native
path is stable.

### CEO participant surface

The post-submit results surface and approved results email may link the
designated CEO into the canonical branded report through the token exchange.
No CEO navigation item, dashboard, account role, or group-report entry is
added.

### Cohort trends

No change. Cohort Trends answers how an organization changed across campaigns;
this feature answers how one respondent changed between two reports.

## 12. Failure behavior

| Condition | Behavior |
| --- | --- |
| Feature off or killed | Existing report byte-identical; zero comparison reads |
| No prior candidate | Normal report; no selector |
| Focus report degraded | Preserve current degraded report; comparison disabled |
| Candidate result degraded | Exclude from selector; direct id fails generically |
| Invalid/forbidden baseline id | Normal focus report plus generic screen-only message |
| Candidate deleted after selector load | Same generic fail-soft behavior |
| Different version | Side-by-side aggregates, no aggregate delta; compatible question deltas only |
| Question added/removed/scale-changed | `—`, never zero; included in coverage note |
| Candidate query throws | Normal focus report and PII-free failure metric |
| More than bounds | Newest 12 candidates and explicit bounded note |
| Invalid/expired CEO token | Generic unavailable response; no existence detail and no cookie |
| CEO designation or disclosure revoked | Existing self-access cookie stops authorizing immediately |
| CEO requests another respondent/focus submission | Enumeration-safe denial |

Comparison failure must never break Print / Download PDF for the focus report.

## 13. Accessibility and print requirements

- Selector has a visible label and keyboard-operable native semantics.
- Change indicators do not rely on color; include signed text and accessible
  up/down/no-change wording.
- Table headers identify Current, Previous, and Change.
- `—` cells have meaningful assistive text such as **Not comparable**.
- Comparison controls, errors, and bounded notes that are operational rather
  than report content use `no-print`.
- The coverage note and different-version explanation are report content and
  remain in the PDF.
- Print CSS prevents a question comparison row or section header from being
  orphaned across pages where feasible.
- The final implementation receives a visual review at desktop, narrow screen,
  print preview, and saved-PDF output before launch.

## 14. Verification contract

### Unit and service tests

- CEO access tokens round-trip only with the dedicated secret and exact
  version/purpose/claim shape;
- malformed, tampered, expired, wrong-purpose, and wrong-secret tokens fail
  closed;
- CEO self gate binds the requested campaign/submission/respondent, requires
  `INVITED` + live `isCEO`, and rechecks the disclosure toggles;
- CEO viewer policy reads only same-person history and never grants general
  campaign access;
- normalized-email identity union stays within one organization;
- respondent-id fallback works without normalized email;
- different org/template/person submissions are excluded;
- imported historical submissions are eligible;
- focus campaign and later submissions are excluded;
- duplicate identity rows collapse deterministically;
- newest-first sorting and 50/200/12 bounds are enforced;
- each candidate and selected baseline is independently authorized;
- degraded/malformed results are excluded;
- frozen results are never rescored;
- same-version overall/domain/section/question deltas are correct;
- cross-version exact-key, slider-type, same-min/max question deltas work;
- renamed labels do not break a stable-key match;
- new, removed, type-changed, scale-changed, missing, and non-finite values
  produce no delta;
- missing values are never coerced to zero; and
- coverage counts are correct.

### Page and component tests

- coach and admin render the same comparison controls and report output;
- a designated CEO with a valid self-access session renders only their own
  comparison;
- non-CEO participants and public routes expose neither controls nor baseline
  data;
- CEO self-access cannot open another respondent, company, group report,
  Trends, campaign detail, or operator navigation;
- token exchange removes the bearer token from the visible URL and sets only a
  secure, HttpOnly, scoped cookie;
- expired, malformed, wrong-purpose, wrong-focus, and tampered tokens fail
  closed without revealing record existence;
- disabling both disclosure toggles or removing `isCEO` revokes an existing
  self-access session;
- default candidate is most recent but does not auto-activate;
- Compare, Change comparison, and Remove comparison update the URL correctly;
- invalid/forbidden ids show one non-enumerating message and retain the focus
  report;
- no candidate leaves existing report actions unchanged;
- comparison controls are absent from print output;
- Classic, Executive Boardroom, and Modern Dashboard render the same
  comparison facts and compatibility states;
- PDF filename contains focus and baseline labels;
- recommendations, free text, and peers remain focus-only/separate; and
- old longitudinal entry links are replaced without deleting its route.

### Flag and regression tests

- kill overrides enabled and canary;
- flag off is byte-identical and performs zero comparison reads;
- organization/template canary matching is exact;
- existing report gate, branded report, print, peer, longitudinal, and trends
  tests remain green; and
- the full Turbopack build gate passes before any push.

The current isolated-worktree baseline for the targeted report, longitudinal,
eligibility, trend, route, and branded-report suites is **9 suites / 135 tests
passing**.

## 15. Acceptance criteria

The MVP is ready to launch when all of the following are true:

1. An authorized coach or admin can open a current Scaling Up Full report,
   select one eligible earlier report, and compare without leaving the report.
2. The most recent earlier report is suggested and alternatives are selectable.
3. Same-version current, previous, and delta values are correct at overall,
   decision/section, and question levels using frozen results.
4. Cross-version question deltas appear only for exact, compatible stable-key
   matches; aggregate and incompatible deltas are explicitly withheld.
5. The exported PDF contains the comparison and excludes operational controls.
6. Existing peer benchmarks remain clearly separate.
7. A designated CEO can securely open and export only their own comparison
   without receiving coach/admin navigation or broader campaign access.
8. Non-CEO participants and public takers receive no comparison access.
9. Invalid baseline ids reveal nothing and never break the authorized focus
   report.
10. Flag off produces the current report with no comparison reads or markup.
11. The old Wave N path remains available for rollback; its coach-only promoted
    entry is hidden while report-native comparison is active and remains
    available while the new capability is dark or killed.

## 16. Deferred follow-ups

- compare against an average of several earlier reports;
- durable CEO accounts, permanent report libraries, and non-CEO participant
  comparison delivery;
- CEO access to the single-round group report;
- group comparison across campaigns;
- saved comparison report library;
- qualitative/LVA answer comparison;
- manual mapping for renamed or structurally changed questions;
- server-generated PDF artifacts;
- baseline free-text appendix; and
- retirement of the old Wave N route after adoption and rollback review.

## 17. Research sources

### Direct product evidence

- Esperto live account, Report Management → Add Summary Report → Self
  Comparison Report, inspected 2026-08-05 at
  <https://www.scalinguptoolkit.com/admin2/reports>.
- Supplied Esperto output:
  `ScalingUp_selfcomparison_report_John CEOExec_2026-05-01T15_45_58-04_00.pdf`
  (31 pages), visually inspected and text-extracted locally.
- Claude handoff reviewed and independently checked:
  `handoff-report-comparison-2026-08-05.md`.

### Official competitor documentation

- [Culture Amp — Guide to using Comparisons](https://support.cultureamp.com/en/articles/7048705-guide-to-using-comparisons)
- [Culture Amp — Load Comparisons and Benchmarks](https://support.cultureamp.com/en/articles/7048584-load-comparisons-and-benchmarks-to-compare-your-survey-results)
- [Qualtrics — Comparisons (EX)](https://www.qualtrics.com/support/employee-experience/creating-ee-project/dashboards-tab/dashboard-management/dashboard-settings/comparisons-ee/)
- [Qualtrics — Dashboard Data and source mapping](https://www.qualtrics.com/support/employee-experience/creating-ee-project/dashboards-tab/dashboard-management/dashboard-settings/project-mapper-ee/)
- [Lattice — Understand Survey Analytics](https://help.lattice.com/hc/en-us/articles/360060174014-Understand-Survey-Analytics)
- [Lattice — Transitioning historical survey data](https://help.lattice.com/hc/en-us/articles/12398376637591-Transitioning-to-Lattice-Engagement-from-a-Different-Platform)
- [SurveyMonkey — Insights and Data Trends](https://help.surveymonkey.com/en/surveymonkey/analyze/data-trends/)
- [Ninety — Measuring with the Org Assessment](https://help.eos.ninety.io/en/articles/14062622-measuring-your-six-key-components-with-the-org-assessment)
