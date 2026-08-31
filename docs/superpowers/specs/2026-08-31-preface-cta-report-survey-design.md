# Preface and CTA report completion design

## Source request

Jeff Verdun's 28 August consolidated Phase 1 list asks for two outcomes:

1. Make the authored preface and CTA appear on the eight-question mini-quiz report, and "test across all reports."
2. Permit "a lot more customization" than the Closing editor's 16-estimated-line limit.

Two clauses in the printed email are clipped and cannot be recovered. They remain open questions rather than inferred requirements. Jeff did not ask for a new editor, mutable campaign versions, email/group authoring, a replacement public URL, or a particular new line count.

## Confirmed root cause

The public and invited individual report renderers already honor safe `reportHtml` from the campaign-pinned Template Version. The live `sunhub-quick-quiz` campaign instead points at published v1, whose `reportConfig` has neither an introduction nor a conclusion. Published v5 and v6 add a conclusion; published active v7 adds both introduction and conclusion.

Production read-only evidence on 31 August 2026 established:

- the live campaign id is `cmsm0jlxo0002lvi3lvb8u2gy`;
- its pinned version id is v1 `cmsm0efu30005dlwfucrosxdm`;
- it has 12 completed submissions at the time of investigation;
- target v7 is `cmtd124fz000413xies2p6bh8`;
- v1 and v7 have byte-equivalent questions, sections, and scoring configuration;
- v7 additionally owns the intended report HTML and public marketing configuration.

Changing the existing campaign's `versionId` would make its 12 historical submissions appear to belong to v7, because submissions intentionally derive version provenance through their immutable Campaign. Loading report HTML from the latest version at render time would likewise retroactively restyle issued reports and violate the pinned-version contract. Neither is acceptable.

## Completion approach

Preserve the old campaign and create a successor behind the same public alias with a drained, two-phase cutover:

1. Verify the exact source campaign, source v1, target v7, current source timestamp, and operator-confirmed submission count.
2. Verify source and target belong to the same enabled Public-marketing Template and language, target v7 is the latest published version, their questions/sections/scoring are canonically identical, and the real report-HTML safe loader accepts both v7 regions.
3. Quiesce: compare-and-swap the v1 campaign from ACTIVE to CLOSED while it still owns `sunhub-quick-quiz`, and write a durable quiescence receipt.
4. Wait at least 15 minutes. This exceeds the request execution window and drains submissions that resolved v1 before quiescence. During this maintenance window, the public link truthfully reports that the campaign is closed.
5. Re-run dry-run after the drain window. Capture the post-drain submission count and quiesced `updatedAt` used by apply.
6. Apply: in one serializable transaction, re-read and revalidate every source/target/alias/count invariant, rename v1 to `sunhub-quick-quiz-retired-v1`, create the deterministic v7 successor as ACTIVE under `sunhub-quick-quiz`, and write the promotion receipt.

The public URL therefore stays unchanged. Existing v1 submissions remain attached to the retired v1 campaign and keep truthful v1 provenance. New submissions use v7 and receive its authored Preface and Closing/CTA.

The operation is a one-off guarded script, dry-run by default. Quiesce and apply both require all of:

- exactly one of `--quiesce` or `--apply`;
- `--i-know-this-is-prod` on every write, regardless of database provider;
- `--expect-database-host <host>` matching the connected database exactly;
- `--expect-source-updated-at <ISO>` from the immediately preceding dry-run;
- `--expect-submissions <N>` from the immediately preceding dry-run;
- the compiled exact source campaign id, v1 id, v7 id, live alias, and retired alias.

Apply additionally requires the source to have remained CLOSED for at least 15 minutes. Any drift aborts without writes. The successor uses deterministic id `item7-sunhub-quick-quiz-v7-successor`; that primary key plus the unique aliases and a schema-versioned audit manifest make retries database-enforced and verifiable. A completed source/successor pair is recognized as idempotent success only when its complete manifest matches. There is no automatic rollback after the successor accepts submissions; correction remains forward-only.

An old idempotency key retried against the successor alias continues to return the existing explicit campaign-conflict response and cannot create a duplicate submission. The drain window makes this an exceptional lost-response recovery case rather than an in-flight cutover race; the original v1 submission remains available to ADMIN/STAFF.

## Campaign fields

The successor copies the source's Template id, language, name, description, public configuration, open/close policy, notification/result toggles, report appearance snapshot, custom slides, creator, and creator-coach identity. It does not copy the source id, timestamps, deleted state, invitation-send lease/completion state, participants, invitations, submissions, summary reports, or import provenance.

The successor starts with no submissions and receives fresh timestamps. The source becomes CLOSED but is not deleted.

## Report-surface survey

| Surface | Authored Preface/Closing contract | Result |
| --- | --- | --- |
| Invited individual browser/print | Supported from pinned Template Version | Working |
| Public quiz browser/print | Supported from pinned Template Version | Working; Jeff's campaign/version pairing is wrong |
| Group/aggregate | Never supported by this authoring model | Report as out of scope, not a defect |
| Results-report email | Deliberately unsupported; custom HTML is browser/print only | Report as out of scope, not a defect |

## Closing budget

Raise only `REPORT_HTML_LIMITS.conclusion.estimatedLines` from 16 to 24. The fixed Scaling Up Full conclusion region is 165 mm tall; 24 estimated lines consume about 120 mm at the authored region's approximate 5 mm body line box and retain about 45 mm for structural spacing. The 900-visible-character cap and every element, depth, image, table, heading, break, CSS, and sanitization safeguard remain unchanged.

Acceptance requires exact-boundary browser/PDF proof across Scaling Up Full, Classic scored, Classic qualitative, Executive Boardroom, and Modern Dashboard. Twenty-five estimated lines remain rejected; no accepted tail content may clip or disappear.

## Safety and non-goals

- Do not execute the successor operation without separate explicit Production authorization.
- Do not change an environment variable or feature flag.
- Do not mutate the existing campaign's version id or any existing submission.
- Do not add latest-version fallback behavior to report loaders.
- Do not add a new authoring surface or expose report HTML to group reports or email.
- Do not merge or deploy as part of implementing the guarded operation.

## Acceptance

1. The 24-line Closing boundary is implemented and physically verified across all supported report styles; 25 is rejected.
2. The all-report survey clearly separates working supported surfaces from never-supported surfaces.
3. A dry-run-default, explicitly credentialed, CAS-protected, audited two-phase successor operation is implemented test-first.
4. Read-only dry-run against current state is an explicit operator step outside CI; it proves source/target invariants and prints the exact quiesce or apply command without writing.
5. After separately authorized execution, `/quiz/sunhub-quick-quiz` serves v7 and a new test submission visibly contains Jeff's authored Preface and Closing/CTA, while the 12 historical submissions remain on the retired v1 campaign.
