# Public Campaigns Without Organization Ownership

**Status:** Approved design

**Date:** 2026-08-08

**Scope:** New admin-created `PUBLIC` assessment campaigns only

## Problem

The public-campaign form asks an administrator to choose an organization even
though a public campaign has no organization roster and the public quiz does
not use an organization to authorize, identify, or group its takers.

The field exists because `AssessmentCampaign` is shared by invited and public
campaigns and its `organizationId` foreign key is currently non-null. The first
public-campaign implementation preserved that database constraint to avoid a
wide nullable-relation change. This leaked a storage compromise into the UI and
made an arbitrary organization selection look like a business decision.

## Decision

`AssessmentCampaign.organizationId` becomes nullable. The domain invariant is:

- `INVITED` campaigns require a real organization.
- `PUBLIC` campaigns may have no organization.

The admin public-campaign create flow will not accept or select an organization.
New public campaigns will store `organizationId = null`.

Existing public campaigns retain their current organization links. The
migration drops the database `NOT NULL` constraint but does not update existing
rows.

## Alternatives Rejected

### Automatically assign a central organization

This would be smaller technically but would preserve false ownership and could
pollute organization-scoped reporting or history. It would also require a
special organization with a real coach owner because `Organization.ownerCoachId`
is non-null.

### Create a separate public-campaign table

This would model the distinction explicitly, but it would duplicate campaign
lifecycle, template-version, submission, audit, and reporting relationships.
The current difference does not justify a parallel aggregate.

## Data Model and Migration

Change the Prisma fields to:

```prisma
organizationId String?
organization   Organization? @relation(fields: [organizationId], references: [id])
```

Add an additive migration containing only:

```sql
ALTER TABLE "assessment_campaigns"
  ALTER COLUMN "organizationId" DROP NOT NULL;
```

Do not backfill, clear, or otherwise mutate existing campaign rows. Existing
indexes remain valid for nullable values.

## Write Invariants

The existing invited-campaign validation and creation path continues requiring
`organizationId`. This requirement remains in `createAssessmentCampaignSchema`
and in invited-campaign authorization checks.

The admin public-campaign route changes independently:

- remove `organizationId` from its request schema;
- remove its organization existence query;
- create the campaign with `organizationId: null`;
- record `organizationId: null` in the create audit receipt so the absence is
  explicit rather than omitted accidentally.

No other creation path gains permission to create an organization-free invited
campaign.

## Admin UI

Remove the entire Organization field from `PublicCampaignsManager`, including:

- organization list fetch;
- organization state;
- required-field validation;
- organization selector;
- the schema-oriented explanatory hint;
- `organizationId` in the POST body.

The form order becomes Template → Report appearance → Campaign name → Open At →
Close At → Create. There is no replacement copy because organization ownership
is not part of the public-campaign concept.

The existing-campaign list may continue accepting an optional organization in
its row type for compatibility with old public campaigns, but no public UI may
assume it is present.

## Read Compatibility

Making the Prisma relation optional affects shared readers at compile time even
when those readers are invited-only. Consumers must follow one of two rules:

1. Public-capable readers use a null-safe fallback. Public respondent reports
   use an empty company name when the campaign has no organization.
2. Invited-only readers enforce their existing domain precondition and return
   their established not-found/not-applicable outcome if organization data is
   unexpectedly absent. They must not crash through an unchecked
   `campaign.organization.name` access.

Organization-scoped features such as rosters, group reports, trends, ownership
checks, invitations, and reminders remain invited-only. The implementation must
not silently coerce `null` to an empty organization identifier in queries or
URLs.

## API and Error Behavior

Authentication, template publication, disabled-template, date validation,
alias-collision retry, audit, and draft/publish behavior remain unchanged.

Sending a legacy `organizationId` property to the public endpoint is ignored by
Zod's default object parsing behavior; it does not restore organization
attachment. The canonical UI no longer sends it.

## Tests

Use red-green TDD at these seams:

- API create succeeds when `organizationId` is absent.
- API does not query `db.organization`.
- Both the normal create and alias-collision retry write
  `organizationId: null`.
- Audit changes record `organizationId: null`.
- Public-campaign UI does not fetch `/api/organizations`.
- Public-campaign UI has no Organization selector or schema hint.
- Public-campaign UI POST body omits `organizationId`.
- Existing invited-campaign validation still rejects a missing
  `organizationId`.
- A public report backed by an organization-free campaign renders with no
  company name.

After targeted tests, run Prisma validation/generation as required, migration
safety, ESLint on changed files, and the Turbopack production build.

## Non-Goals

- No existing-row backfill.
- No production migration or deployment.
- No public-campaign organization picker elsewhere.
- No change to coach attribution; public lead ownership continues using its
  dedicated referring-coach fields.
- No redesign of invited campaign setup or organization management.
- No unrelated report or campaign refactor.

## Rollback

The code can be reverted without changing existing rows created before this
feature. Reinstating the database `NOT NULL` constraint is safe only after
either deleting organization-free public campaigns or assigning them a real
organization; therefore database rollback requires an explicit data check and
is not performed automatically.
