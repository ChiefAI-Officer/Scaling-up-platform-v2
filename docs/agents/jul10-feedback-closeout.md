# Jeff July 10 Assessment Feedback - Canonical Closeout Ledger

**Source:** Jeff Verdun's 14-page *Scaling Up Assessment Platform - Feedback Report for Gabriel*, prepared 2026-07-10. Section 2 is canonical: 53 rows numbered #30-#87. Rows #31, #34, #36, #38, and #82 are intentionally absent because completed items were excluded.

**Reconciled against:** `origin/main` at `45d99f3c` on 2026-08-12 plus the Production receipts linked below. Current tally: **49 DONE / 1 PARTIAL / 3 NEEDS DECISION**.

**Authority:** This tracked ledger is authoritative; generated PDFs and `tmp/` files are derivatives. Completion is judged against the exact Section 2 ask. Later-discovered scope remains visible as a separately named follow-on and does not silently widen a row.

## Status contract

- **DONE** - the exact ask is shipped or conclusively answered with tracked evidence.
- **PARTIAL** - meaningful implementation exists, but the exact ask is not currently available or acceptance evidence is incomplete.
- **NEEDS DECISION** - implementation would invent product intent, copy, source data, or acceptance criteria.
- A row closes only after the relevant PR is merged, production is verified when availability matters, `plans/CHANGELOG.md` is updated, this ledger is updated, and its claim on GH #261 is released.

## Ledger

<!-- JUL10_LEDGER_START -->
| Row | Area | Exact acceptance criterion | Status | Evidence | PR / commit | Residual or resume gate | Decision owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #30 | Comparison reporting | Show same-assessment answers across iterations to reveal growth or decline. | DONE | [Waves M and N](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1717) | Wave N | None | Gabriel |
| #32 | Scaling Up Full industry benchmarking | Restore Esperto-style answer comparison for Scaling Up Full and decide whether the scope is universal or report-specific. | DONE | [Source, implementation, and Production acceptance](jul10-feedback-decision-packets.md#32-scaling-up-full-industry-benchmarking) | PR #343 / `45d99f3c`; Production accepted 2026-08-12 | None | Gabriel |
| #33 | All-report fidelity | Compare each current report with its original and provide specific discrepancies for correction. | NEEDS DECISION | [Fidelity matrix](jul10-report-fidelity-matrix.md) | PR #268 disposition | Jeff supplies one sanitized annotated source/current pair at a time, beginning with LVA group rehire presentation. | Jeff with Gabriel disposition |
| #35 | Admin navigation | Group the crowded admin top bar into logical dropdowns. | DONE | [Wave H grouped nav](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1824) | Wave H | None | Gabriel |
| #37 | Results email | Allow editing and approval of results email settings on already-published assessments. | DONE | [ED10 Settings](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1149) | ED10 | None | Gabriel |
| #39 | Per-respondent rate limit | Make the individual respondent report rate limit fail closed. | DONE | [Wave I hardening](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1897) | PR #71 / `858d432` | None | Gabriel |
| #40 | LVA Leadership Team capitalization | Use sentence-case wording consistently. | DONE | [Wave P quick fixes](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1641) | Wave P | None | Gabriel |
| #41 | LVA The leadership wording | Establish what the factor measures before rewording it. | NEEDS DECISION | [Decision packet](jul10-feedback-decision-packets.md#41-lva-the-leadership-wording) | None | Confirm whether the factor means leadership function, senior-leader behavior, or another construct. | Gabriel |
| #42 | LVA Growth Financing wording | Clarify that the factor means access or ability to obtain financing for growth. | DONE | [Production closeout](jul10-feedback-decision-packets.md#42-lva-growth-financing-wording) | PR #304 / `f02d85f2`; Production LVA v4 | None | Gabriel |
| #43 | LVA core-values wording | Ask for existing values first and alternatives only when values are unset. | DONE | [Wave P quick fixes](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1641) | Wave P | None | Gabriel |
| #44 | LVA possible duplicate | Determine whether the middle annual-outcome prompt duplicates the preceding organization-priority prompt. | DONE | [Source and platform verification](jul10-feedback-decision-packets.md#44-lva-priority-triplet) | PR #342 / `265ec669` | None | Gabriel |
| #45 | LVA media wording | Identify Suzanne's specific concern before changing the question. | NEEDS DECISION | [Decision packet](jul10-feedback-decision-packets.md#45-lva-media-wording) | None | Confirm whether the concern is grammar, scope, relevance, or expected answer form. | Suzanne with Gabriel approval |
| #46 | Template results default | Set the end-user results default at template level with campaign override. | DONE | [Wave Q controls](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1623) | Wave Q | None | Gabriel |
| #47 | QSP v2 invitation email | Show coach logo, mention coach by name, use approved copy, and enlarge the CTA. | PARTIAL | [Production receipt](../../plans/CHANGELOG.md#qsp-coach-forward-invitation-copy-production); [universal banner launch](../../plans/CHANGELOG.md#universal-invitation-banner-launched) | PR #337 / `c088ded4`; Production QSP v1 v4 + QSP v2 v3 | Receive one authorized QSP v2 invitation proving the active coach-forward body and universal banner/CTA together. | Gabriel |
| #48 | QSP v2 core-values stories | Present one prompt with capacity for three people and stories without breaking the three historical stable keys. | DONE | [Jeff #48 launch](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L559) | PR #248 family | None | Gabriel |
| #49 | Printable free-form answers | Give each question its own row and render the answer full width below it. | DONE | [Wave R reports](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1604) | PR #129 | None | Gabriel |
| #50 | Coach notification email | Identify the actual respondent rather than saying a generic respondent. | DONE | [July 10 batch](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1132) | PR #199 | None | Gabriel |
| #51 | Disable templates | Disable and re-enable retired templates so they do not appear in new campaign setup. | DONE | [Wave Q controls](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1623) | Wave Q | None | Gabriel |
| #52 | Remove an admin | Safely remove an administrator who has left the company. | DONE | [Wave Q controls](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1623) | Wave Q / ADR-0018 | None | Gabriel |
| #53 | Slider interaction | Thicken the slider track and allow direct number selection. | DONE | [Wave R survey controls](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1604) | PR #129 | None | Gabriel |
| #54 | Print LVA group report | Provide printing and PDF saving for the LVA group report. | DONE | [Wave R report actions](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1604) | PR #129 | None | Gabriel |
| #55 | Question editor | Add and edit assessment questions directly in the platform. | DONE | [Wave T authoring](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1566) | Wave T | None | Gabriel |
| #56 | Findings logic | Author answer-driven findings and recommendations for report output. | DONE | [Wave U findings](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1546) | PR #139 / `d50b576f` | None | Gabriel |
| #57 | LVA peer averages | Make peer averages available for LVA questions and extensible to future templates. | DONE | [Production acceptance](../../plans/CHANGELOG.md#jul10-57-lva-peer-averages-production-accepted) | PR #339 / `013f00bb`; `dpl_85ZoYwgbKEi5ffTVjt7czywFYbgX` | None | Gabriel |
| #58 | LVA peer comparison | Show peer comparison in both individual and group LVA reports. | DONE | [Production acceptance](../../plans/CHANGELOG.md#jul10-58-lva-peer-comparisons-production-accepted) | PR #132 / `9220503f`; `dpl_85ZoYwgbKEi5ffTVjt7czywFYbgX` | None | Gabriel |
| #59 | False removal error | Remove a respondent without showing failure after the delete succeeds. | DONE | [Session closeout](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L669) | PR #198 | None | Gabriel |
| #60 | Edit member email | Change a member email safely and reject organization-local collisions. | DONE | [July 10 batch](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1132) | PR #202 | None | Gabriel |
| #61 | LVA invitation email | Remove redundant company line and raw URL and use coach-forward body copy. | DONE | [LVA invitation closeout](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1091) | Dedicated invite PR | None | Gabriel |
| #62 | LVA Welcome wording | Replace the generic Welcome description with LVA-specific purpose copy. | DONE | [Welcome copy family](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1011) | PR #225 | None | Gabriel |
| #63 | LVA report header | Put the coach byline below the Scaling Up mark on individual and group reports. | DONE | [Report byline closeout](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L967) | PR #230 / `febbdcc1` | None | Gabriel |
| #64 | Print and Download actions | Replace the ambiguous combined action with separate Print and Download PDF buttons. | DONE | [Print and Download fork](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1123) | PR #208 | None | Gabriel |
| #65 | Stable reminder links | Keep the original invite and successfully delivered reminder links valid for the same invitation lifecycle. | DONE | [Jeff #65 launch](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L170) | PR #282 / `050573fa` | None | Gabriel |
| #66 | QSP v2 Welcome wording | Replace generic Welcome text with QSP-specific purpose copy. | DONE | [Welcome copy family](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1011) | PR #225 | None | Gabriel |
| #67 | QSP v2 report header | Show coach name and place the coach byline below the Scaling Up mark. | DONE | [Session and byline closeouts](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L669) | PR #230 | None | Gabriel |
| #68 | Historical import discoverability | Make Esperto historical import findable from the Coach-side Members area. | DONE | [Wave X import](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1483) | Wave X | None | Gabriel |
| #69 | Rockefeller invitation email | Remove duplicate URL, fix coach branding, and use coach-forward copy. | DONE | [Rockefeller invitation closeout](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1073) | Dedicated invite PR | None | Gabriel |
| #70 | Rockefeller Welcome wording | Use Rockefeller-specific accurate purpose and scale copy. | DONE | [Session closeout](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L669) | PR #225 | None | Gabriel |
| #71 | Show results on screen | Let campaign setup show a respondent's report immediately after submission. | DONE | [Wave OSR](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L825) | PR #249 / `36131fe4` | None | Gabriel |
| #72 | Four group-report families | Provide group reports for QSP v2, LVA, Rockefeller, and Scaling Up Full. | DONE | [Group-report fork](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1123) | PR #207 | None | Gabriel |
| #73 | Rockefeller report header | Show coach name and place the byline below the Scaling Up mark. | DONE | [Report byline closeout](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L967) | PR #230 | None | Gabriel |
| #74 | View Trends value | Compare the same assessment across time rather than blending unrelated assessment types. | DONE | [Waves M and N](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1717) | Wave N | None | Gabriel |
| #75 | Five Dysfunctions answer-driven output | Confirm whether Five Dysfunctions generates findings/results from submitted answers. | DONE | [Five Dysfunctions verification](jul10-feedback-decision-packets.md#75-five-dysfunctions-answer-driven-output) | PR #48 / launched 2026-06-10 | None | Gabriel |
| #76 | Scaling Up Full and QSP invitations | Use coach-forward copy and correctly positioned coach branding. | DONE | [Invitation family closeout](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1051) | Invite family PR | None | Gabriel |
| #77 | Scaling Up Full Welcome wording | Replace generic Welcome text with accurate Scaling Up Full purpose copy. | DONE | [Welcome copy family](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1011) | PR #225 | None | Gabriel |
| #78 | Scaling Up Full report header | Verify and correct the same coach-byline layout as the other report families. | DONE | [Report byline closeout](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L967) | PR #230 | None | Gabriel |
| #79 | Scaling Up Full submit error | Allow second and later non-CEO respondents to submit without missing-key failure. | DONE | [July 10 batch](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1132) | PR #198 | None | Gabriel |
| #80 | Five Dysfunctions invitation | Correct coach branding and copy and remove redundant link treatment. | DONE | [Invitation family closeout](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1051) | Invite family PR | None | Gabriel |
| #81 | Five Dysfunctions report | Correct coach byline layout and remove the coach CTA. | DONE | [Report byline closeout](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L967) | PR #230 | None | Gabriel |
| #83 | Public quiz coach results | Let the referring coach find, inspect, and export their referred public results. | DONE | [Coach Referred Results](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L731) | Referred Results PR | None | Gabriel |
| #84 | SunHub eight-question quiz | Determine and build the distinct eight-question SunHub quiz without replacing the 32-question public assessment. | DONE | [Production acceptance](../../plans/CHANGELOG.md#jul10-84-production-accepted) | PR #320 / `e6ab1539`; Production accepted 2026-08-10 | None | Gabriel |
| #85 | Import observability navigation | Link the existing import-health page from admin assessment navigation. | DONE | [July 10 batch](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1132) | PR #200 | None | Gabriel |
| #86 | Organizations by coach | Add a coach-grouped view alongside the company view. | DONE | [July 10 batch](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1132) | PR #204 | None | Gabriel |
| #87 | Wrong import file guidance | Explain which import option accepts the uploaded export kind. | DONE | [July 10 batch](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/blob/15ee442b124f43155ffd3dfdc1dc08fbfa37cd5e/plans/CHANGELOG.md#L1132) | PR #201 | None | Gabriel |
<!-- JUL10_LEDGER_END -->

## Remaining decision queue

The four non-DONE rows reduce to three unresolved decisions and one acceptance resume:

1. **Report fidelity:** #33 needs sanitized, report-specific annotations rather than an umbrella preference.
2. **LVA content:** #41 and #45 still require content intent before editing. #42 is closed on the active Production v4 wording and compatibility receipt. #44 is closed as an intentional organization/annual/quarterly cascade; optional clarity wording is a separate follow-on.
3. **Invitation acceptance:** #47's code and both canonical Production rows are live. Close after one authorized received QSP v2 invitation proves the active body and universal shell together; full-HTML overrides remain separate.

#32's product decision is resolved and its source-backed answer-level comparison
is implemented and Production-accepted with a tracked live question-bar visual.
Cohort-matched norms or wider benchmark coverage remain a separately named data
enhancement. #57/#58 are closed; persistent real LVA peer values remain a
separate provenance follow-on.

## Update protocol

For each row cycle: refresh `origin/main` -> state-check code, issue, and CHANGELOG -> claim on GH #261 -> execute the smallest change -> verify -> merge -> production-check when applicable -> update CHANGELOG, CLAUDE anchor, and this ledger -> release the claim. Generated status artifacts are rebuilt only after the tracked ledger changes.

## Rebuild the derivative evidence

From the app root:

```bash
python3 -m pip install -r scripts/requirements-jul10-closeout.txt
python3 scripts/build-jul10-closeout-artifacts.py
```

The supplied July 10 source has 83 status occurrences: 30 in Section 1 and all
53 canonical rows in Section 2. The generator validates that count, the exact
row set, the 49/1/3 tally, and the twelve-outcome delta before writing
deterministic PDFs under `output/pdf/`.
