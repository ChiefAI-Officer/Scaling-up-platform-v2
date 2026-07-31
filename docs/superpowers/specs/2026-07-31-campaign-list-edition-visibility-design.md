# Campaign-list edition visibility (GH #243)

**Date:** 2026-07-31

**Issue:** [#243](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/243)

**Branch:** `codex/243-campaign-list-edition-visibility`

**Base:** `origin/main` at `b350ff22`

**Status:** Conversation-approved design; implementation has not started

## Goal

Make a campaign's pinned assessment edition visible directly in the shared
admin and coach campaign lists. Operators should be able to distinguish current,
outdated, and retired pinned editions without opening campaigns one at a time.

The first release is deliberately narrow:

- show an edition identity on every resolvable campaign row;
- warn on actionable stale or retired pins;
- keep admin and coach behavior identical through one shared resolver and list
  presentation;
- avoid filter, sort, repinning, migration, and unrelated list redesign work.

## Current behavior

The admin and coach pages load campaigns independently, then both use
`CampaignsListWithFilter` and the `campaign-list-items` mapper. Their list rows
show the assessment template name but do not load or display the campaign's
pinned `AssessmentTemplateVersion`.

The detail view introduced by Wave EV can reveal edition standing, but only
after an operator opens one campaign. Reviewing many campaigns therefore
requires an N-row, N-navigation inspection loop.

Relevant boundaries:

- `src/src/app/(dashboard)/admin/assessments/campaigns/page.tsx` owns the admin
  campaign query;
- `src/src/app/(portal)/portal/assessments/page.tsx` owns the coach campaign
  query;
- `src/src/lib/assessments/campaign-list-items.ts` creates the shared list DTO;
- `src/src/components/assessments/CampaignsListWithFilter.tsx` renders both
  lists;
- `src/src/lib/assessments/edition-standing.ts` defines the existing
  edition-standing contract;
- `src/src/lib/assessments/active-version.ts` defines the canonical active
  published-version predicate.

## Approved behavior

### Edition identity

Every campaign with a valid pinned edition renders a compact, persistent
identity beside its assessment name:

`Quarterly Session Prep v2 · Edition 3`

The template name and edition identity remain visible at mobile widths. The
edition number is factual historical identity, not an assertion that the pin is
current.

If the pinned edition cannot be resolved or its version number is malformed,
the existing template-name presentation remains unchanged. The UI must not
guess an edition or imply that an unresolved pin is current.

### Actionable standing

For `DRAFT` and `ACTIVE` campaigns:

- a pin with a newer active edition renders a compact `Not latest` marker;
- a retired pin renders a compact `Retired` marker;
- `Retired` takes precedence when both conditions are true;
- a current, nonretired pin renders no status marker.

For `CLOSED` campaigns, including imported historical campaigns:

- preserve the edition identity;
- suppress `Not latest` and `Retired` markers.

This suppression is presentation-only. The resolver still reports the edition's
actual standing, while the row decides whether that standing is actionable for
the campaign's lifecycle state.

### Marker semantics

The stale marker uses the existing Wave EV warning treatment. The retired marker
uses the higher-severity treatment approved and exported by GH #242. Both
markers use visible text rather than color alone.

The release does not add a positive `Current` badge. The absence of a warning
marker, alongside the explicit edition identity, is the intentionally quiet
current state.

## Architecture and data flow

### Campaign query projection

Each campaign page extends its existing query with the pinned `version`
projection needed by the edition-standing contract:

- `templateId`;
- `versionNumber`;
- `language`;
- `publishedAt`;
- `archivedAt`, as supplied by the GH #242 contract.

The projection remains server-side and minimal. No full version record or
question content is sent to the client.

### Shared batched resolver

A shared async resolver in the campaign-list domain accepts the campaigns with
their pinned-version projections and returns edition standing keyed to each
campaign.

It performs the following steps:

1. collect and deduplicate exact `(templateId, language)` pairs from valid
   pinned versions;
2. issue one `AssessmentTemplateVersion.findMany` query for those pairs;
3. apply `activePublishedWhere` so candidates use the canonical definition of
   active published editions;
4. select the complete candidate fields required by
   `resolveEditionStanding`;
5. group candidates in memory by exact template and language;
6. call the existing `resolveEditionStanding` contract for each valid campaign
   pin;
7. return `null` for campaign pins that cannot be classified safely.

The candidate query uses the deduplicated pair list as an `OR` of exact
template-language predicates. It does not issue one query per campaign and does
not compare editions across languages. If there are no valid pairs, the resolver
returns null edition metadata without issuing the candidate query.

The normal page cost is therefore two database reads:

1. the page's existing campaign query; and
2. one shared active-edition lookup for all unique pairs on that page.

### Shared list DTO

`campaign-list-items` receives the resolver output and adds a minimal nullable
edition field to each shared list item:

```ts
interface CampaignListEdition {
  versionNumber: number;
  newerEditionAvailable: boolean;
  pinnedRetired: boolean;
}

interface CampaignListItem {
  // Existing fields remain unchanged.
  edition: CampaignListEdition | null;
}
```

In this specification, `pinnedRetired` names the retired-state boolean supplied
by the final GH #242 edition-standing contract. Implementation should use that
contract's exported name directly rather than adding a parallel retired-state
definition.

The client DTO contains no database row, timestamp, language, or sibling-version
collection. Admin and coach pages both call the same resolver and mapper before
rendering the same shared list component.

## Behavior matrix

| Campaign state | Pinned-edition state | Row presentation |
| --- | --- | --- |
| DRAFT or ACTIVE | Current, nonretired | Template · Edition N |
| DRAFT or ACTIVE | Newer active edition exists | Template · Edition N + `Not latest` |
| DRAFT or ACTIVE | Retired | Template · Edition N + `Retired` |
| DRAFT or ACTIVE | Retired and newer exists | Template · Edition N + `Retired` only |
| CLOSED | Any resolved standing | Template · Edition N; no warning marker |
| Any | Missing, invalid, or unresolved pin | Existing template presentation only |
| Any | Batch lookup failed | Existing template presentation only |

## Failure and degradation behavior

Edition visibility is supplementary list metadata and must not make the campaign
list unavailable.

If the batched lookup throws:

- emit one server-side diagnostic for the page load;
- do not log campaign names, participant data, or other personally identifiable
  information;
- return `edition: null` for all affected campaign rows;
- continue rendering the existing campaign list.

If one template-language group is absent or malformed, only campaigns in that
group lose edition metadata. Other groups from the same successful batch remain
classifiable.

No failure path may manufacture `current`, `Not latest`, or `Retired` state.
Unknown remains unknown and degrades to the existing row.

## GH #242 coordination boundary

GH #242 owns the detail-view retired warning, its presentation tone, and the
shared edition-standing contract for retired pins. GH #243 consumes that
contract.

Before implementation changes the shared contract or marker styling, the #243
branch must inspect and rebase onto the final #242 work. It must not introduce a
competing retired-state calculation. If #242 is not yet available, #243 can
implement and test the batch/list scaffolding that does not duplicate #242, but
the integrated behavior must wait for the shared contract.

GH #243 owns:

- the campaign-list query projections;
- pair deduplication and the batched active-edition lookup;
- shared campaign-list DTO mapping;
- shared admin/coach list-row presentation;
- focused list and resolver tests.

## Visual review gate

Before feature code is written, render and review the shared campaign row in
both desktop and mobile layouts for:

- current;
- not latest;
- retired;
- closed historical;
- unresolved fallback.

The review must confirm that:

- the template and edition identity remain legible at mobile widths;
- markers do not create horizontal overflow or obscure row actions;
- retired is visually stronger than not latest without relying on color alone;
- closed rows retain factual identity without presenting an action warning.

The user declined the optional browser-based visual companion during
brainstorming. That does not waive the project's standing visual-review gate;
the implementation session must produce and review the focused row states
before feature code.

## Testing

### Batched resolver

Add focused coverage proving:

- duplicate template-language pairs produce one pair predicate;
- all campaign pairs are loaded by exactly one additional database query;
- an empty valid-pair set issues no candidate query;
- the query applies `activePublishedWhere`;
- the query selects the full projection required by
  `resolveEditionStanding`;
- candidates never cross template or language boundaries;
- current, newer, retired, missing, malformed, and unpublished pins are handled
  safely;
- a thrown lookup returns null edition metadata without throwing the page;
- a missing or malformed group does not erase successful groups.

### Mapper and shared presentation

Add focused coverage proving:

- admin and coach inputs produce the same edition DTO and row output;
- every resolved row displays `Edition N`;
- current rows have no positive badge;
- actionable stale rows display `Not latest`;
- retired takes precedence over not latest;
- closed rows display edition identity but suppress both warning markers;
- unresolved rows preserve the existing template-only presentation;
- the identity remains visible at the current mobile breakpoint;
- existing status filtering, metrics, links, ordering, and row actions remain
  unchanged.

### Baseline test defect

The pre-implementation baseline on `b350ff22` has a known unrelated fixture
failure:

- `edition-standing.test.ts`, `admin-campaigns-page.test.tsx`, and
  `campaign-list-items.test.ts` pass;
- `portal-assessments-status-filter.test.tsx` has six failures because its
  campaign fixtures omit the required `metrics` object, while
  `CampaignsListWithFilter` dereferences `c.metrics.total`;
- the same fixtures also omit `organizationId`, producing a React key warning.

The implementation plan should repair those adjacent fixtures before relying on
that suite as #243 regression evidence. The repair must remain test-only and
must not be reported as feature behavior.

## Rollout and rollback

This is a read-only, flagless presentation enhancement:

- no schema or data migration;
- no campaign repinning or write path;
- no background job;
- no new filter or sort state;
- no API contract expansion beyond the server-to-component list DTO.

Rollback is a normal revert. After merge and production deployment, smoke-test
both admin and coach campaign lists with read-only navigation. Confirm current,
stale, retired, and closed examples when representative data is available, and
confirm that list filtering, links, metrics, and row actions still work.

## Scope boundaries

Included:

- pinned-edition identity on shared campaign rows;
- actionable stale and retired markers;
- closed-row marker suppression;
- shared batched standing resolution;
- identical admin and coach behavior;
- focused automated and visual regression coverage.

Excluded:

- edition filter or sort controls;
- repinning or upgrade actions;
- campaign detail redesign;
- defining retired semantics already owned by GH #242;
- database migrations;
- unrelated campaign-list layout changes;
- new positive current-state badges;
- dates, sibling-edition histories, or question content in the list DTO.

## Acceptance criteria

1. Every campaign with a valid pinned version shows `Edition N` in both admin
   and coach lists, including at mobile widths.
2. DRAFT and ACTIVE campaigns with a newer active edition show `Not latest`.
3. DRAFT and ACTIVE campaigns pinned to a retired edition show `Retired`, which
   takes precedence over `Not latest`.
4. CLOSED campaigns show their edition identity but no actionable standing
   marker.
5. The two pages use one shared batched resolver and issue no per-campaign
   edition queries.
6. Standing comparisons are isolated by exact template and language and use the
   canonical active-edition predicate.
7. Lookup and malformed-data failures preserve the existing campaign list and
   never manufacture standing.
8. Existing list filtering, metrics, links, ordering, and row actions are
   unchanged.
9. No migration, write path, repinning action, filter, sort control, or broader
   redesign is introduced.
10. Desktop and mobile row states receive visual approval before feature code.
11. Focused tests cover batching, isolation, standing states, precedence,
    closed suppression, fallback behavior, and shared admin/coach rendering.
