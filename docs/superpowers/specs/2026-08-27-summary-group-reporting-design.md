# Summary / Group Reporting — design

**Status:** APPROVED · GATED FOR IMPLEMENTATION PLAN · visual/design approval recorded 2026-08-27; no feature code yet

**Date:** 2026-08-27

**Scope:** coach/admin-generated Summary Reports composed from selected completed personal reports. Placeholder/editor work, generated-report import, global report management, sharing, deletion, tags, approval workflow, and report builders are excluded.

**Canonical discovery record:** [`../../research/esperto-summary-group-reporting-source-of-truth.md`](../../research/esperto-summary-group-reporting-source-of-truth.md)

## 1. Outcome

Replace the current calculated-on-view, whole-campaign group-report workflow with one campaign-scoped Summary Report routine:

1. Open the selected campaign.
2. Open **Reports → Summary Reports → Open Wizard**.
3. Choose one supported report type.
4. Select completed personal source reports and assign the report-specific roles.
5. For QSP only, include/exclude configured remark answers as whole immutable answers.
6. Review exact sources, roles, and exclusions.
7. Generate one immutable, automatically named, persisted PDF artifact.
8. Return to the same campaign's Summary Reports list to view in a modal, open in a new tab, or download.

The workflow is shared. The report bodies are deliberately family-specific. There is no generic report-template DSL.

## 2. Evidence precedence

When evidence conflicts, apply it in this order:

1. Direct product-owner acceptance.
2. Jeff's 25-Aug meeting direction.
3. Accepted visual/design decisions in this specification.
4. Supplied and freshly generated ESPERTO PDF/JSON/XLSX fixtures.
5. Current repository behavior.

Jeff's 27-Aug statement that the “scaling up group report look good” was made while he was independently reviewing the live platform. The strongest time-linked artifact is campaign `cmt3sxj95000g1bznjubxw4ms`, captured as [`../../research/evidence/platform-scaling-group-report-candidate-jeff-approved-2026-08-27.pdf`](../../research/evidence/platform-scaling-group-report-candidate-jeff-approved-2026-08-27.pdf). Therefore the current live Scaling Up Group Report body is the CEO Full visual/output baseline. It supersedes pixel-level parity with ESPERTO's unrelated 31-page CEO Full artifact for that one report type.

ESPERTO remains authoritative for the composition routine, persistence behavior, Condensed CEO, Self Comparison, LVA, both QSP versions, and Rockefeller—except proven legacy defects explicitly corrected below.

## 3. Product catalog

| Assessment family | Summary Report type | Composition |
| --- | --- | --- |
| Scaling Up | Condensed CEO | CEO exactly 1 |
| Scaling Up | CEO Full | CEO exactly 1; Team 0+ |
| Scaling Up | Self Comparison | Focus exactly 1; Earlier exactly 1 |
| Leadership Vision Alignment | CEO Full | CEO exactly 1; Team 0+ |
| Quarterly Session Preparation v1 | CEO Full | CEO exactly 1; Team 0+ |
| Quarterly Session Preparation v2 | CEO Full | CEO exactly 1; Team 0+ |
| Rockefeller Habits | Full Report | Team 1+; no CEO |

Scaling Anonymous Team is omitted. Enneagram and Five Dysfunctions are not inferred into scope.

## 4. Campaign placement and navigation

The Summary Report lifecycle belongs to the selected campaign because the campaign pins the organization, assessment family, template version, language, candidate submissions, and authorization boundary.

- Coach: **My Campaigns → selected campaign → Reports → Summary Reports**.
- Admin: **Assessments → Campaigns → selected campaign → Reports → Summary Reports**.
- Both roles use the same report list and wizard behavior, subject to their existing campaign authorization.
- Do not add a global Reports hub for this MVP.
- The existing direct **View group report** link is replaced by the campaign Summary Reports list. Existing generated links may remain compatible during rollout but are not the primary entry.

The campaign already pins variant/version/language, so the target wizard does not reproduce ESPERTO's redundant Variant/Language step.

## 5. Wizard

### 5.1 Shared steps

1. **Type**
2. **Composition**
3. **Remarks** — rendered only when the selected QSP report type has configured moderation fields
4. **Review & Create**

Close or Cancel exits without creation. Back preserves selections, assignments, and moderation state. Validation is visible before checkout; do not copy ESPERTO's missing-CEO silent no-op.

### 5.2 Type

Show only report types valid for the campaign's assessment family/version. Each card has its product name and one-sentence purpose. Scaling shows three cards; every other included family shows one.

### 5.3 Composition

**Local UI revision, 27 Aug 2026:** after reviewing the working composition screen
against live Esperto, the user requested the revision below for local preview,
then approved the local visual (“looks good”) and authorized release preparation
(“proceed”). This is not production deployment approval. Evidence and verification:
[`../../research/evidence/summary-composition-local-revision-2026-08-27/README.md`](../../research/evidence/summary-composition-local-revision-2026-08-27/README.md).

- Desktop uses compact available-source rows on the left and separate included
  CEO/Team panels on the right; narrow screens stack the panels.
- Search filters the loaded authorized sources by name, job title, organization,
  campaign, source ID, assessment alias, or language. All campaigns still observes
  authorization, organization, family, and version compatibility boundaries.
- Select all selects only currently visible eligible unassigned sources;
  Deselect all clears pending selections. Changing search/scope clears pending
  selections, not assigned roles, so invisible pending sources are not transferred.
- Add selected transfers the pending batch to Team; CEO accepts exactly one source
  into an empty slot. Assigned reports disappear from the available list. Clear
  and per-source Remove return reports to availability without deleting data.
- Replacing the CEO requires explicitly clearing/removing the existing CEO.
- Pending unassigned selections display a warning and block Review until assigned
  or deselected. This improves on Esperto's silent exclusion at checkout.
- An assigned source that becomes incompatible after a failed creation remains
  visible with an explanation and blocks Review until removed. Same-name source
  choices expose exact provenance through an accessible description.
- Creation payload, persisted source identity/order, validation, and report body
  remain unchanged. A three-step indicator reflects the implemented CEO Full flow.

Candidates are explicit completed personal reports, displayed as cards with respondent, organization, assessment/version, campaign, completion date, and source report/submission identity.

Default candidate scope is the current campaign. **All eligible reports** exposes authorized historical/cross-campaign candidates where the report contract permits it.

Selection and role assignment are separate actions:

- Select candidate cards.
- Assign selected cards to the report's named slots.
- CEO/Focus is shown first; Team/Earlier retain explicit assignment order.
- Clear removes assignments but does not delete source data.

Eligibility requires all of the following:

- frozen completed personal submission/report;
- correct assessment family;
- compatible pinned version under the selected type's rule;
- actor authorization to both the destination campaign and source report;
- source organization/subject rule satisfied;
- source is not itself a generated Summary Report.

Ended/inactive source campaigns are eligible. No arbitrary Team maximum is added. Duplicate selection is rejected.

Self Comparison additionally requires:

- same organization;
- same canonical respondent/subject;
- Earlier completion timestamp strictly before Focus;
- one Focus and one Earlier only;
- cross-version allowed only when all 61 stable question keys, answer types, 0–10 scale, and canonical section identity are compatible.

### 5.4 QSP Remarks

Moderation is configuration-driven, proven for `Remarks1`; it is not “all free text.”

- Display eligible answers grouped by configured field and attributed respondent.
- Every whole answer defaults included.
- Select all / Deselect all and per-answer inclusion are supported.
- Text is read-only; no inline edit.
- Exclusion changes only this Summary Report manifest and never the frozen source submission.
- Back/Next preserves state.
- A configured field with no eligible answers shows an explicit empty state.
- If every answer is excluded, retain the fixed remarks page/heading with no respondent rows.
- After creation the manifest is immutable; create a new report to change it.

### 5.5 Review & Create

Review shows:

- destination campaign and organization;
- report type and assessment/version;
- exact ordered source reports;
- role assignment;
- QSP included/excluded count and excluded respondent/field rows;
- automatic output name.

Create revalidates authorization, completion, compatibility, role counts, and source existence. A wizard-session request token makes double-click/retry idempotent. Validation or rendering errors preserve the wizard state and create no visible partial report.

## 6. Persistence

The generated report is an immutable snapshot, not a recalculated view.

### 6.1 SummaryReport

Minimum fields:

- `id`
- destination `campaignId`
- explicit `reportType`
- automatic `name`
- pinned assessment/template version and language
- creator actor and creation time
- `rendererVersion`
- canonical input snapshot JSON
- deterministic `inputHash`
- unique wizard `creationRequestId`
- private PDF object reference
- artifact SHA-256, byte size, and creation time

### 6.2 SummaryReportSource

- `summaryReportId`
- source submission/personal-report ID
- role (`CEO`, `TEAM`, `FOCUS`, `EARLIER`)
- ordered position
- immutable respondent display snapshot needed for the artifact

### 6.3 Moderation manifest

Store configured field key, source submission/report ID, answer identity/hash, respondent attribution snapshot, and included/excluded decision. Do not duplicate editable answer text as a second source of truth; the report input snapshot contains the exact rendered value.

### 6.4 Artifact creation

Build the deterministic PDF from the frozen snapshot, hash it, upload privately, then persist the report/source/manifest records. A failed render or upload creates no visible report. If database persistence fails after upload, remove the orphan object best-effort and log the failure. The unique creation request prevents duplicate rows/artifacts from retries.

No rename, edit, delete, tags, share, approval, recalculation, or historical generated-report import is added in MVP.

## 7. Output contracts

### 7.1 Scaling — CEO Full

Preserve the Jeff-approved current platform Group Report body and cosmetics rather than replacing it with the 31-page ESPERTO CEO Full.

- Existing alignment profile, CEO vs Team-average-excluding-CEO sections, peer comparison, ScaleUp score, question detail, and anonymized team appendix remain the visible baseline.
- Replace only the data lifecycle: use the exact selected CEO/Team sources and creation-time provenance instead of all completed campaign submissions and current view time.
- Team 0 renders the current clean `—`/not-available treatment; never fabricate a Team average.
- Team means exclude CEO. CEO remains named. The team appendix preserves the approved anonymized disclosure posture.
- Pagination is content-driven under the current print system; the captured one-source baseline is eight A4 pages.

### 7.2 Scaling — Condensed CEO

Exact two-page source contract:

1. Condensed CEO cover.
2. Appendix A with all 61 CEO current scores and peers.

No Team, narrative, profile, chapters, conclusion, Appendix B/C, or Remarks step in the target MVP. ESPERTO's dead/empty Condensed Verbatims step is omitted.

### 7.3 Scaling — Self Comparison

One Focus plus one Earlier source. Focus supplies current wording, recommendations, open response, current score, and peers; Earlier supplies the previous score.

- Main body covers all 61 questions.
- Profile compares Focus, Earlier, and peers.
- Appendix A: Focus plus peers.
- Appendix B: named Focus/Earlier four-decision comparison.
- Appendix C: Focus/Earlier/average for the 51 comparable Team-answerable rows (`Q1–Q45`, `Q56–Q61`).
- Target the intended 31-page Letter-landscape source layout and prevent the observed two-word orphan spill page.

### 7.4 Leadership Vision Alignment — CEO Full

Letter landscape, ESPERTO editorial chrome, named CEO first and Team attribution, with content-driven 13+ pages.

- Numeric means include CEO and every selected source with an answer; zero is valid, blank omitted.
- S3 contributions: Strong 10, Average 5, Weak 0; stacked widths reflect counts; sort score descending with canonical order inside ties.
- Legacy import polarity is normalized once at the import/compatibility boundary: ESPERTO `1→3`, `2→2`, `3→1` into the platform's native scale. No renderer source branch.
- Obstacles show all 16 factors including 0%, use answered-only denominators, and render explanations only when nonblank.
- Rehire renders named participant bars plus inclusive arithmetic mean.
- Preserve explicit source display labels/order, including department KPIs before quarter priority.

### 7.5 QSP v1 — CEO Full

Fixed 12-page source body:

1–2 cover/preface; 3–4 rating/explanation and six-row matrix; 5–6 rocks/stories; 7–8 company and department Start/Stop/Keep; 9 challenge/why/opportunity/constraint; 10 priorities/completion; 11 Rockefeller narrative; 12 moderated `Remarks1`.

CEO renders first, Team follows assignment order, every narrative is named, and arithmetic means include CEO and present Team answers. Overall ratings use one decimal; matrices use two. The numeric Q12 absent from the source output remains absent.

### 7.6 QSP v2 — CEO Full

Fixed 11-page source body:

1–2 cover/preface; 3–4 Retrospective paired rating/explanation and five-row matrix; 5–7 rocks/stories/company Start-Stop-Keep; 8 Personal Check-in paired score/explanation; 9 Growth Challenge/why/solution; 10 Critical Number/Top Priorities; 11 moderated `Remarks1`.

Use the same named ordering and CEO-inclusive mean rules as v1. Keep v1/v2 field mappings and view models separate. Correct the legacy intro's “five”/six mismatch, drop dead `Q3_5`, and never drop one half of a paired numeric/narrative answer.

### 7.7 Rockefeller — Full Report

One Team-only report, fixed five US-Letter landscape pages:

1. Rockefeller cover.
2. Fixed preface.
3. Ten color-coded habit cards × four items with green check/gray dash and achieved count.
4. Participant habit-subtotal matrix plus all-person Average and Total-Average.
5. Count/tier conclusion and support/book CTA.

Calculations:

- participant habit subtotal = sum of four 0–3 answers, range 0–12;
- habit Average = arithmetic mean of all selected participant subtotals;
- participant Total-Average = mean of that participant's ten habit subtotals;
- report Total-Average = mean of all participant × habit subtotal cells;
- item passes when all-participant item mean is `>= 1.5`;
- achieved count is passing items out of 40.

Use selected-source order and deterministic unique compact participant labels. No CEO column, CEO exclusion, deviation, peer comparison, or verbatim section.

Correct ESPERTO's proven fixed conclusion defect: 20/40 still says “great.” Render an honest sentence from the existing count bands: Low `0–16`, OK `17–32`, Great `33–40`.

## 8. Access, privacy, and delivery

- Generated Summary Reports are coach/admin artifacts behind the existing strict report-access gate.
- The actor must be authorized for the destination campaign and every selected source at creation time.
- View/download rechecks destination-report authorization.
- Direct respondent/CEO access is not added.
- Responses use private/no-store delivery; PDF objects are private and served through an authorized route, never a public permanent URL.
- Audit creation, view, new-tab view, and download with report ID/type/campaign and actor; do not log answer text.
- Scaling CEO Full preserves Jeff-approved anonymized Team appendix behavior. LVA/QSP/ Rockefeller remain attributed as specified.

## 9. Failure behavior

| Condition | Target response |
| --- | --- |
| Missing required role/minimum | Inline composition error; Review/Create unavailable. |
| Duplicate source | Reject duplicate assignment and identify the source. |
| Wrong family/version/subject | Candidate disabled with reason; server revalidation rejects stale bypass. |
| Source removed or no longer complete | Create fails with source-specific message; wizard state retained. |
| Source authorization lost | Generic unavailable/unauthorized message without leaking source PII. |
| QSP configuration has no eligible remarks | Explicit empty Remarks state; creation allowed. |
| Render/upload fails | No visible report; retry from retained Review state. |
| Double-click/network retry | Same `creationRequestId` returns the one created report. |
| Artifact later unavailable/checksum mismatch | Fail closed, log operational error, do not recalculate silently. |

## 10. Code disposition

### Keep/adapt

- frozen submissions and scored results;
- template-version pinning and stable keys;
- respondent/campaign identity and authorization;
- report access gate, no-store behavior, rate limiting, audit primitives;
- current Scaling `GroupReport` body for CEO Full;
- LVA answered-only means/frequencies/named-answer primitives after import polarity normalization;
- QSP v2 mappings and family calculation helpers where fixture-proven;
- Rockefeller 40-key import, section totals, achieved count, and tier resolution;
- report-native one-focus/one-baseline comparison as a Self Comparison foundation.

### Replace/add

- current all-completed-campaign input selection;
- direct calculated-on-view report identity;
- generic LVA/QSP/Rockefeller covers and bodies;
- generic CEO-vs-rest Rockefeller model;
- raw-all-free-text QSP output;
- explicit report-type registry, immutable report/source/manifest persistence, family view models, and private artifacts.

## 11. Rollout

- Ship behind one umbrella Summary Reporting flag plus kill switch; family availability is controlled by a small typed registry, not seven unrelated UX paths.
- Flag off preserves the current production byte path.
- Migrations are additive. Do not destructively remove existing report routes/data during initial rollout.
- First tracer slice: campaign list/wizard/persistence plus Jeff-approved Scaling CEO Full, end to end.
- Then add Condensed CEO, Self Comparison, LVA, QSP v1, QSP v2, and Rockefeller using the shared lifecycle and family-specific view models.

## 12. Acceptance strategy

### Shared lifecycle

- coach/admin placement and authorization;
- current-campaign and authorized historical candidate search;
- role cardinality, ordering, compatibility, and stale-source revalidation;
- Back/Cancel state, conditional Remarks step, immutable snapshot;
- idempotent create, automatic naming, same-campaign persistence;
- modal/new-tab/download and audit behavior;
- no-store/private artifact and fail-closed checksum behavior.

### Golden report fixtures

- Scaling CEO Full: current live preservation PDF/screenshot and DOM/calculation assertions.
- Scaling Condensed/Self, LVA, QSP v1/v2: supplied source PDFs/JSON plus page/text/calculation matrix.
- Rockefeller: supplied two-person artifact plus fresh Team=1 `AM8wrdHklr` artifact.

For each family test:

- exact source IDs/roles and view-model values;
- page count where fixed, page sequence where content-driven;
- required headings, attribution, column order, rounding, denominator, zero/blank behavior;
- representative visual page snapshots at production fonts;
- no clipped/orphaned content;
- known Esperto defects remain corrected.

## 13. Explicit non-goals

- global report-management hub;
- participant-facing group reports;
- anonymous Scaling report;
- report rename/edit/delete/tags/share/approval;
- generated-report import or recalculation;
- arbitrary composition roles or report builder;
- generic cross-assessment renderer/DSL;
- placeholder/editor changes;
- destructive replacement of historical routes/data in the first release.

## 14. Design gate

The user approved the visual/design gate on 2026-08-27. This document now authorizes an implementation plan. It does not by itself authorize schema, production code, migration, flag, deployment, or external-message changes; those proceed through the implementation-plan execution gate.
