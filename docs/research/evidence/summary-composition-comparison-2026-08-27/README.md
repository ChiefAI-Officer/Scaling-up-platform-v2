# CEO/Team composition parity audit — 27 August 2026

Scope: compare the current local Scaling CEO Full composition screen with live
Esperto; investigation only. Product code at `dad03dd4`. No product code edits,
report generation, invitations, campaign edits, or deployment performed.

## Evidence and method

Authenticated with the supplied Esperto test account. Opened existing campaign
`oGH8JyOp74`, Peer Cohort Pilot — Very Small Company, via Campaigns → Reports →
Summary Reports → Open Wizard → CEO Full Report → Composition. Exercised only
unsaved wizard state, then Cancel. Local comparison used the synthetic campaign
`proof-scaling` at `http://127.0.0.1:53953`. Discarded the local exercise and left a
fresh Composition screen available. Screenshots use the same 1280×720 browser
viewport; the local assigned screenshot includes the scroll position reached by
the assignment actions, demonstrating loss of the top summary from view.

- `esperto-assigned.png`: CEO 1 and Team 2 in separate right-hand components.
- `esperto-search.png`: cross-campaign search and role components together.
- `local-empty.png`: initial composition screen.
- `local-assigned.png`: cards after assigning CEO and two Team sources.
- `esperto-unassigned-checkout.txt`, `local-unassigned-review.txt`: DOM snapshots
  demonstrating that selection without assignment is not inclusion, on both apps.

These are separate synthetic/evidence cohorts, not identical respondents. This
audit does not compare PDF calculations or claim tenant-wide eligibility parity.

## Observed comparison

| Area | Esperto, exercised live | Current local implementation |
| --- | --- | --- |
| Mental model | Select completed personal-report cards, then add selected reports to a component | Select a completed submission, then assign it a role |
| Layout | Compact candidate list left; CEO/Team component boxes right; numbered progress across top | Tall full-width cards; plain CEO/Team text above; no step indicator |
| Bulk selection | `all` and `none` work; selected count shown | No bulk controls or pending-selection count |
| Assignment | One component Add action transfers a selected batch; assigned reports disappear from candidates | Per-card CEO/Team buttons appear after Select; assigned cards stay in the same list |
| Clearing | Team `clear` returned both cards to candidates while preserving CEO | Individual Remove clears selection and assigned role; no slot-level clear |
| Finding reports | Search by campaign/group/member and a current-campaign tab; `Peer Experiment` returned 18 candidates across campaigns | Current/All campaigns toggle; no search field |
| Role limits | CEO min1/max1 displayed; CEO Add disabled when occupied; Team accepted 2 with no displayed maximum | One CEO ID, Team array; assigning another CEO replaces the former without confirmation; no Team maximum |
| Pending selection | Selected Three but did not Add: checkout showed Team 0 | Selected Dee but did not Assign: review included only already-assigned Ed |
| Navigation | Empty composition initially allowed Next | Review disabled until CEO assigned; Back retains local roles |

Local source eligibility is intentionally narrower than a literal “all campaigns”
label suggests: authorized completed submissions in the same organization and
Scaling family, compatible template/version/language, active or closed campaigns.
This is visible in `src/src/lib/assessments/summary-reports/candidates.ts:325`.
Esperto search visibly spans campaigns/groups; exact organization-equivalence and
every acceptance constraint were not re-tested here. Do not remove local access
or compatibility checks merely for visual parity.

## Reproduced local usability risk

Selected Ed → assigned Team; selected Alex → assigned CEO; selected Dee only;
clicked Review. CEO Alex and Team Ed appeared, Dee did not, with no unassigned
selection warning. The same selected-versus-assigned distinction exists in
Esperto; its explicit transfer into component boxes makes inclusion easier to
see. This is a UX risk, not evidence of incorrect PDF arithmetic.

Source: `SummaryReportWizard.tsx:276` allows review based on assigned CEO;
`:302` toggles selection; `:316` replaces CEO; `:360` constructs sources only from
assigned roles; `:476` renders composition; `:584` reveals individual role buttons.

## Verdict and recommendation — not implementation approval

Core composition concept is aligned. Interaction parity has material gaps.
Cosmetic/structural parity is low: this is not merely different branding.

Use Esperto's two-column transfer layout on desktop, with compact selectable
source rows, search, all/none, selection count, and explicit CEO/Team boxes with
Add selected, counts, and Clear. Keep platform colours/fonts, existing provenance,
authorization, compatibility, missing-CEO validation, and Back-state preservation.
Make pending-but-unassigned selections explicit before review. Consider blocking
CEO replacement until cleared, matching the observed occupied-slot behaviour.
Keep detailed source identity available without making every card tall.

Review a revised visual before changing product code. No reporting-engine rewrite
is indicated by this composition audit.

## Additional correction to earlier description

On this campaign entry, Esperto initially rendered Variant/Language, then advanced
automatically to Type with ScaleUp2/enUS. Therefore “Esperto always requires a
manual variant/language step” is too broad; observed entry behaviour is contextual.
