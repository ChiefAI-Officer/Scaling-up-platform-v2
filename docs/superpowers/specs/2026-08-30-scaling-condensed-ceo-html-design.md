# Scaling Up Condensed CEO HTML Design

**Status:** Approved for implementation by the 2026-08-30 Handoff B2 request.

**Fixed point:** `origin/main` at `cdafe24603c7c92648befc4a5f13d7ccbf01fc6d`.

**Source contract:** `tmp/handoffs/HANDOFF-B2-condensed.md`, the supplied `ScalingUp_condensed_report_John Adams_2026-07-14T08_22_02-04_00.pdf`, decisions #391 and #392, and section 7.2 of `2026-08-27-summary-group-reporting-design.md`.

## Goal

Add a Coach-only, one-click Condensed entry to B1's Scaling Up Full report dropdown. The destination is a server-rendered HTML report with exactly two print pages: a Condensed CEO cover and Appendix A containing all 61 current CEO scores with their frozen peer comparisons.

## Locked product contract

- The report applies only to eligible, published, invited `scaling-up-full` campaigns under the existing Summary Reporting capability gate.
- `AssessmentCampaignParticipant.isCEO` resolves the sole CEO. There is no picker, wizard, source-selection request, or Team slot.
- A missing CEO designation or a designated CEO without a submitted report renders a clean, non-fabricated unavailable state.
- The report contains no Team values, narrative, profile, chapters, conclusion, Appendix B/C, remarks, or Verbatims.
- The Coach dropdown's second entry is a plain `<a target="_blank">`; it must not use Next `<Link>` because prefetch would load bulk PII and emit a view audit before a click.
- The report reuses the approved HTML report route family, print actions, brand chrome, Coach byline, landscape page primitive, and five-decision peer charts. It does not add or invoke an `@react-pdf` renderer.
- No environment variable, feature flag, schema, migration, or Production data changes are part of this slice.
- When the existing Summary Reporting capability is absent, the current campaign-detail output is unchanged.

## Harvest-and-discard record

The local-only branch `codex/summary-reporting-next-slices` was compared with `origin/main`; it is not rebased or merged.

| Prior seam | Decision | Reason |
| --- | --- | --- |
| `scaling-condensed-ceo-model.ts` | Harvest and adapt | It is a pure 61-score projection over the canonical frozen peer presentation, preserves zero, and rejects incomplete or mismatched inputs. |
| `scaling-condensed-ceo-snapshot.ts` | Harvest the layer boundary; adapt source resolution | The frozen, renderer-independent view model remains useful, but the prior explicit `sources` command is replaced by automatic current-campaign CEO resolution. |
| `scaling-source-snapshot.ts` | Harvest only reusable validation/normalization ideas | Its historical multi-campaign picker contract conflicts with one-click current-CEO behavior. No picker-facing API is retained. |
| Condensed model/snapshot tests | Harvest expectations, then rewrite RED against the approved path | The score, peer, completeness, and privacy expectations remain correct. |
| `scaling-condensed-ceo-document.tsx` and PDF tests | Discard | Decision #392 makes the approved server-rendered HTML report canonical. |
| Wizard, candidates, create, artifact, and delivery integration | Discard | Decision #391 makes Condensed one click; saved-history UI remains deferred. |
| Registry label/role contract | Keep and correct output metadata | CEO exactly one remains correct; the Condensed renderer version becomes an HTML version rather than a PDF version. |

## Architecture

### Model

`buildScalingCondensedCeoModel(report)` remains a pure function. It accepts one stored `RespondentReport`, validates the canonical ten-section/Q01-Q61 structure and governed peer provenance, and projects five ordered groups with only `{stableKey, label, you, peers}` rows. It fails closed on missing, non-finite, out-of-range, reordered, or peer-invalid input.

### Snapshot loader

`getScalingCondensedCeoSnapshot(db, actor, campaignId, generatedAt, env)` runs in one repeatable-read transaction. It:

1. evaluates the existing Summary Reporting state;
2. authorizes the campaign with `canViewGroupReport`;
3. validates invited/published Scaling Up Full destination metadata;
4. resolves at most one participant with `isCEO: true`;
5. loads only that respondent's submitted row, never Team submissions;
6. builds the stored personal report from pinned version/result bytes without rescoring;
7. builds an immutable Condensed snapshot carrying display provenance and the 61-row model.

Outcomes distinguish dark/not-found states from clean `no-ceo`, `ceo-not-submitted`, and `source-incomplete` states. The latter render helpful panels rather than fabricated values.

### Access and audit

A Condensed adapter uses the existing report gate protocol: rate limiting precedes loading; forbidden and disabled states are enumeration-safe; the successful view audit is fail-closed. The existing `GROUP_REPORT_VIEW` action is reused with `changes.kind = "condensed-ceo"`, the CEO submission identifier, pinned version/content provenance, peer provenance, and no Team identifiers.

### HTML report

`ScalingCondensedCeoReport` is a composition in the existing `.su-public-brand.su-report.su-full-landscape` system. Page 1 reuses `SuFullLandscapePage` cover chrome and identifies the output as `Condensed version`. Page 2 reuses `SuFullVerticalPeerChart` for People, Strategy, Execution, Cash, and You in the existing Appendix A five-column layout. `PrintReportButton` supplies `Print` and `Download PDF` through browser print, matching the approved Group report path.

### Dropdown

The registry marks `SCALING_CONDENSED_CEO` available with `scaling-condensed-ceo-html-v1`. B1's server-computed capability therefore includes it. `CampaignDetail` renders a second plain-anchor dropdown item at `/assessments/<campaignId>/report/condensed` only when that capability entry is present. No Summary Report wizard component is changed.

## Golden-fixture contract

The committed test fixture transcribes the supplied artifact's current CEO score sequence into platform Q01-Q61 order:

`6,7,7,7,8,8,8,8,7,8,8,8,8,8,8,8,8,8,8,8,8,8,8,9,7,8,10,8,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,5,7,7,9,9,8,9,8,9,9,9,9,9,9`.

Peer values use the existing source-backed Q01-Q61 benchmark snapshot. Tests must prove two page elements, group sizes `13/7/20/5/16`, every score/peer row, and absence of the excluded content vocabulary and Team data.

## Verification

- Watch each focused test fail before adding its production seam.
- Run focused model, snapshot, access/page, component, registry, and campaign-detail suites after every cycle.
- Run the complete Jest suite once at the end.
- Run changed-file ESLint, `node scripts/check-migration-safety.mjs`, and `CI=true npm run build` under Node 20.
- Render the final HTML route to browser PDF in an isolated local fixture, confirm exactly two landscape pages, render both pages to PNG, and visually compare them with the supplied source PDF.
- Review the fixed-point diff along separate Standards and Spec axes; fix actionable findings and repeat until clear before opening the PR.
