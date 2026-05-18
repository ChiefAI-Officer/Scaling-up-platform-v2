# Schema — Assessment Tool v7.6

**Spec ref**: v7.6, locked May 15-16 2026 (Jeff impromptu meeting + 3 rounds of Codex adversarial review)
**Status**: Locked. Future revisions land here, NOT in PLAN.md or another spec file.
**Cross-references**: [02-service-layer-rules](./02-service-layer-rules.md), [03-seed-rockefeller](./03-seed-rockefeller.md), [04-deploy-runbook](./04-deploy-runbook.md)

---

## Locked decisions implemented in this file

- **Decision 1** — Hierarchy flip: admins create coaches + assessments; coaches create orgs + participants. Implemented via `Organization.ownerCoachId` (single coach owner) and dropping `OrganizationMembership`.
- **Decision 2** — `AccessGroup` replaces `TemplateAccessGrant`. Groups grant template access; coaches are linked to groups; templates are linked to groups.
- **Decision 3** — `Organization.ownerCoachId` is NOT NULL; `OrganizationMembership` is dropped. `OrganizationOwnershipEvent` provides transfer/lifecycle audit history.

## Schema deltas to AMEND into v7.5 BEFORE push

**Drop:**
- `OrganizationMembership` model (and `OrgMembershipRole` enum) — entirely removed
- `TemplateAccessGrant` model — entirely removed
- `Organization.createdBy String` → replaced by `ownerCoachId` (see below)
- `User.organizationMemberships` back-relation — removed
- `User.assessmentTemplatesCreated` back-relation — kept (admins still create templates)
- `Coach.templateAccessGrants` back-relation — removed

**Add:**
- `Organization.ownerCoachId String` (NOT nullable) — FK → `Coach.id`. Every org has exactly one owning coach.
- `Coach.ownedOrganizations Organization[]` back-relation
- `AccessGroup` model:
  ```prisma
  model AccessGroup {
    id          String    @id @default(cuid())
    name        String    // PARTIAL unique on active rows — see raw SQL below
    description String?
    createdBy   String
    createdAt   DateTime  @default(now())
    updatedAt   DateTime  @updatedAt
    deletedAt   DateTime?

    creator         User                  @relation("AccessGroupCreatedBy", fields: [createdBy], references: [id])
    coachMembers    AccessGroupCoach[]
    templateAccess  AccessGroupTemplate[]

    @@index([deletedAt])
    @@map("access_groups")
  }
  ```
  **Raw SQL (added to migration.sql after CREATE TABLE):**
  ```sql
  -- Partial unique index: name unique among non-deleted groups only.
  -- Allows soft-deleted "Scaling Up Coaches" to coexist with a fresh active one of the same name.
  CREATE UNIQUE INDEX "access_groups_name_active_unique"
    ON "access_groups" ("name") WHERE "deletedAt" IS NULL;
  ```
- `AccessGroupCoach` join table:
  ```prisma
  model AccessGroupCoach {
    id            String    @id @default(cuid())
    accessGroupId String
    coachId       String
    addedAt       DateTime  @default(now())
    addedBy       String

    accessGroup AccessGroup @relation(fields: [accessGroupId], references: [id], onDelete: Cascade)
    coach       Coach       @relation(fields: [coachId], references: [id])
    adder       User        @relation("AccessGroupCoachAddedBy", fields: [addedBy], references: [id])

    @@unique([accessGroupId, coachId])
    @@index([coachId])              // fast lookup of all groups a coach belongs to (canAccessTemplate hot path)
    @@index([accessGroupId])        // fast lookup of all coaches in a group (admin detail page)
    @@map("access_group_coaches")
  }
  ```
- `AccessGroupTemplate` join table:
  ```prisma
  model AccessGroupTemplate {
    id            String    @id @default(cuid())
    accessGroupId String
    templateId    String
    addedAt       DateTime  @default(now())
    addedBy       String

    accessGroup AccessGroup        @relation(fields: [accessGroupId], references: [id], onDelete: Cascade)
    template    AssessmentTemplate @relation(fields: [templateId], references: [id])
    adder       User               @relation("AccessGroupTemplateAddedBy", fields: [addedBy], references: [id])

    @@unique([accessGroupId, templateId])
    @@index([templateId])           // fast lookup of which groups grant a template (admin template-access view)
    @@index([accessGroupId])        // fast lookup of all templates in a group (admin detail page)
    @@map("access_group_templates")
  }
  ```
- `Organization.ownerCoachId String` MUST also carry `@@index([ownerCoachId])` for fast "orgs this coach owns" queries (addresses Round 1 H-5 index requirement). Add explicitly:
  ```prisma
  // Inside Organization model (modify the existing v7.5 model):
  @@index([ownerCoachId])
  ```
- Back-relations: `User.accessGroupsCreated AccessGroup[]`, `User.accessGroupCoachLinks AccessGroupCoach[]`, `User.accessGroupTemplateLinks AccessGroupTemplate[]`, `Coach.accessGroupMemberships AccessGroupCoach[]`, `Coach.ownedOrganizations Organization[]`, `AssessmentTemplate.accessGroups AccessGroupTemplate[]`

## OrganizationOwnershipEvent model (NEW)

For transfer / lifecycle audit history (decision 3; see ownership transfer rule in [02-service-layer-rules](./02-service-layer-rules.md)):

```prisma
model OrganizationOwnershipEvent {
  id              String   @id @default(cuid())
  organizationId  String
  fromCoachId     String?  // null for initial creation
  toCoachId       String
  performedBy     String   // admin User.id
  reason          String?
  createdAt       DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  fromCoach    Coach?       @relation("OrgOwnershipFromCoach", fields: [fromCoachId], references: [id])
  toCoach      Coach        @relation("OrgOwnershipToCoach", fields: [toCoachId], references: [id])
  performer    User         @relation("OrgOwnershipPerformedBy", fields: [performedBy], references: [id])

  @@index([organizationId, createdAt])
  @@map("organization_ownership_events")
}
```

This separates the create-time audit (`Organization.createdBy` is REMOVED; ownership = current owner) from the lifecycle audit (ownership events). On Org create, the seed/service ALSO writes an initial event with `fromCoachId=null, toCoachId=owner`.

**Departure scenarios (deferred to v1.5 service slice; not in the foundation slice):**
- Coach soft-delete with orphaned orgs → admin sees a "Coach has N orphaned organizations" banner on the coach detail page, must transfer or hard-delete each org before the soft-delete completes (UI checklist; service enforces).
- Coach hard-delete → blocked by FK constraint if `Organization.ownerCoachId` references them; admin must transfer first. (No cascade — preserve audit safety.)
- Coach account merge → out of scope until v2.

## AssessmentCampaign — `createdByCoachId` addition

`AssessmentCampaign` gains an explicit `createdByCoachId String?` column (FK → `Coach.id`, nullable so admin-created PUBLIC campaigns can leave it null). Existing v7.5 schema has `createdBy String` referencing `User.id`; we ADD `createdByCoachId` alongside it (User.id is for the actor; CoachId is the role-specific ownership pointer).

Index alignment for the admin aggregate dashboard (decision 8, Round 1 M-4 + Round 2 M-5):
- `@@index([versionId])` on `AssessmentCampaign` — supports the aggregate query JOIN.
- `@@index([campaignId])` on `AssessmentSubmission` — supports the aggregate query JOIN.

Aggregate query shape (kept slim, no denormalized `submission.templateVersionId` at v1):
```sql
SELECT s.* FROM assessment_submissions s
JOIN assessment_campaigns c ON c.id = s."campaignId"
WHERE c."versionId" = :vid
```

## Cascade behavior on AccessGroup hard-delete (Round 2 L-2)

Prisma relations on the join models MUST declare cascade:

```prisma
// In AccessGroupCoach:
accessGroup AccessGroup @relation(fields: [accessGroupId], references: [id], onDelete: Cascade)
// In AccessGroupTemplate:
accessGroup AccessGroup @relation(fields: [accessGroupId], references: [id], onDelete: Cascade)
```

Hard-deleting a group automatically removes its join rows. No service-layer cascade code needed. Soft-delete (archive) does NOT cascade — join rows are preserved for undelete.

## AccessGroup soft-delete semantics (Round 1 M-1)

`AccessGroup.deletedAt IS NOT NULL` means the group is dormant. Dormant groups are excluded from `canAccessTemplate` evaluation, are hidden from the admin Access Groups list (filter toggle to "Show archived" available), and do NOT count toward intersection. `AccessGroupCoach` and `AccessGroupTemplate` join rows pointing at a soft-deleted group are LEFT IN PLACE (so undelete is trivial). Permanent delete (hard delete) is a separate admin action requiring confirmation and cascades the join rows via FK constraint.

Note (Round 2 L-1): join rows themselves are hard-deleted on remove — they don't carry `deletedAt`. Activeness is binary on join existence; soft-delete only applies at the AccessGroup level.

## Schema-presence test amendment (Round 3 M-5)

The May 14 v7.5 schema-presence test at `src/__tests__/lib/assessments/schema-presence.test.ts` asserts delegates for the v7.5 model set, which v7.6 changes. The test file MUST be updated as part of the v7.6 implementation:
- **Remove from required-delegate list**: `organizationMembership`, `templateAccessGrant` (both models dropped).
- **Add to required-delegate list**: `accessGroup`, `accessGroupCoach`, `accessGroupTemplate`, `organizationOwnershipEvent`.
- **Add column-presence assertions** (via `Prisma.dmmf.datamodel` or `tsc --noEmit` after `prisma generate`): `Organization.ownerCoachId`, `AssessmentCampaign.createdByCoachId`.

Updated required-delegate list (replaces the May 14 list):
```ts
const requiredDelegates = [
  "organization",
  "orgTeam",
  "orgRespondent",
  "assessmentTemplate",
  "assessmentTemplateVersion",
  "assessmentCampaign",
  "assessmentCampaignParticipant",
  "assessmentInvitation",
  "assessmentSubmission",
  "accessGroup",                      // v7.6 NEW
  "accessGroupCoach",                 // v7.6 NEW
  "accessGroupTemplate",              // v7.6 NEW
  "organizationOwnershipEvent",       // v7.6 NEW
];
// Removed v7.5 delegates: organizationMembership, templateAccessGrant
```

CI runs this test post-`prisma generate`; failure indicates the schema was implemented in a state that doesn't match the v7.6 plan.

---

**Decision provenance**: see `plans/history/v6-v7.5-archive.md` for the full Codex Round changelogs that produced this spec.
