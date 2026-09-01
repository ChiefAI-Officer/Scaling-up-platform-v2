# ADR-0033 — Admin-owned invited Welcome defaults are frozen per campaign

**Status:** Accepted (2026-08-10); PUBLIC read lifecycle amended (2026-09-01)

**Supersedes:** [ADR-0026](0026-welcome-screen-copy-is-code-owned.md)

## Context

The invited participant journey begins with a Welcome screen before Section 1.
ADR-0026 made its lede code-owned by template alias because no authoring path
had been requested. ADMIN/STAFF now needs to edit the nearly whole card for
every assessment, while coaches should no longer choose report appearance when
creating or managing campaigns.

A live template read would make a later admin edit change drafts, active links,
closed campaigns, and imported history. Putting Welcome copy in a Template
Version would avoid that problem but would incorrectly couple presentation copy
to scoring content and require publishing an edition for a copy correction.

## Decision

`AssessmentTemplate.invitedWelcomeDefault` is the ADMIN/STAFF-authored default.
It is template-row presentation metadata, outside Template Version content and
its hash. The Build tab edits a versioned structured plain-text contract; the
server owns the schema version and protected fine print.

The storage contract is forward-versioned. Schema v2 adds the required
`sharingDescription` authoring field. Readers continue to accept valid v1
objects and normalize them in memory with the exact former disclosure sentence;
explicit template saves and newly created invited campaigns write v2. Existing
template or campaign JSON is not rewritten, and the immutable campaign trigger
continues to prohibit snapshot updates. Malformed and unknown future versions
remain invalid and use the existing safe fallback behavior.

Every new `INVITED` campaign copies the resolved template default into
`AssessmentCampaign.invitedWelcomeSnapshot` in the same transaction that
creates the campaign. That snapshot is the participant read source and is
immutable after insertion. Template changes therefore affect only invited
campaigns created after the save. The non-retroactivity boundary includes
existing `DRAFT`, `ACTIVE`, `CLOSED`, and imported campaigns.

Invited snapshot persistence is unconditional and remains active while the invited
presentation feature flag is off or killed. That coordinated flag controls only
the invited/admin authoring and rendering presentation plus coach UI/API ownership.
This avoids a data gap during dark deployment and makes invited rollback
presentation-only. The PUBLIC live-template read has no feature flag; operational
rollback of that behavior is a code revert.

Migration `20260810160000_add_invited_welcome_snapshots` adds nullable JSONB
columns, backfills template defaults and all existing invited campaigns with the
exact legacy alias-resolved content, and installs a trigger that rejects updates
to a non-null campaign snapshot. Invalid or absent template defaults resolve to
the exact legacy alias copy when a campaign is created.

`PUBLIC` campaigns remain a separate lifecycle. They do not write or read
`invitedWelcomeSnapshot`; instead, the public route strictly parses and reads the
current template-row Welcome default at request time. A template edit therefore
updates existing public campaign links immediately. Missing or malformed JSON
retains the standing public fallback. Question-bank facts (count, time, format,
scale, and sections) remain derived from the campaign's pinned Template Version.

Report appearance is also assessment-owned in the coach workflow. With the
coordinated flag active, coach creation and detail surfaces expose no report
style picker, preview, provenance, review row, or save action. Coach create
requests containing `reportStyle` fail with `REPORT_STYLE_ADMIN_OWNED`; coach
campaign PATCH requests containing it fail with the same stable ownership code.
ADMIN/STAFF retain the isolated compatibility write lane, including current
availability checks and the first-response lock. Existing campaign report-style
snapshots and renderers are not rewritten.

## Consequences

- Admins can update one assessment's future invited Welcome without a deploy or
  Template Version publication.
- Two campaigns created around an admin save may intentionally display different
  invited Welcome copy; each invited snapshot remains stable for its lifetime.
- Existing public campaigns intentionally reflect the current template Welcome
  copy without repinning or recreating the campaign.
- Campaign create and historical-import paths must all resolve and persist the
  snapshot transactionally. Reuse paths must never mutate it.
- Invited presentation rollback or kill restores its legacy presentation and coach
  controls but does not stop snapshot writes or erase either JSON column. PUBLIC
  live-template rendering is flagless and rolls back by reverting its code path.
- Removing the immutable trigger or adding a per-campaign override requires a
  new ADR because it changes the participant-history guarantee.

## Rejected alternatives

- **Live template reads for invited campaigns:** retroactive and capable of changing
  an already-issued invited participant link. PUBLIC links intentionally use live
  reads under the separately approved 2026-09-01 lifecycle.
- **Template Version storage:** couples presentation copy to scored content and
  publication lifecycle.
- **Coach or per-campaign Welcome overrides:** create drift in assessment content
  and conflict with admin ownership.
- **Reusing Custom slides or section descriptions:** both render after the
  Welcome screen and have different scope and semantics.

## Related

- [Approved design](../superpowers/specs/2026-08-10-invited-welcome-authoring-and-coach-report-style-simplification.md)
- [Rollout runbook](../runbooks/admin-owned-assessment-presentation-rollout.md)
- [ADR-0025](0025-invitation-copy-corrected-by-template-row-cas-patch.md)
- [ADR-0010](0010-assessment-reports-have-two-types-scored-and-qualitative.md)
