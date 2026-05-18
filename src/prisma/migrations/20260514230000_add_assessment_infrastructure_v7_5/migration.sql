-- Assessment Tool — v7.6 schema (directory name retains v7.5 for history;
-- contents amended in place per docs/specs/v7.6/01-schema.md before deploy).
--
-- Adds the foundation slice for the Assessment Tool:
--   - Organization / OrgTeam / OrgRespondent
--   - AssessmentTemplate / AssessmentTemplateVersion
--   - AssessmentCampaign / AssessmentCampaignParticipant / AssessmentInvitation / AssessmentSubmission
--   - AccessGroup / AccessGroupCoach / AccessGroupTemplate           (v7.6 replaces v7.5 TemplateAccessGrant)
--   - OrganizationOwnershipEvent                                     (v7.6 audit-of-record)
--
-- v7.5 → v7.6 deltas (amended in place; never deployed v7.5):
--   - Dropped: OrganizationMembership table + OrgMembershipRole enum
--   - Dropped: TemplateAccessGrant table
--   - Dropped: Organization.createdBy column
--   - Added:   Organization.ownerCoachId (NOT NULL, FK → coaches.id)
--   - Added:   AssessmentCampaign.createdByCoachId (nullable, FK → coaches.id)
--   - Added:   @@index([versionId]) on assessment_campaigns
--   - Added:   @@index([campaignId]) on assessment_submissions
--   - Added:   access_groups, access_group_coaches, access_group_templates
--   - Added:   organization_ownership_events
--   - Added:   Partial unique index access_groups_name_active_unique
--                (WHERE deletedAt IS NULL).

-- ============================================================
-- Enums (assessment domain)
-- ============================================================

-- CreateEnum
CREATE TYPE "AssessmentCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AssessmentCampaignEndMode" AS ENUM ('OPEN_END', 'ENDS_AFTER');

-- CreateEnum
CREATE TYPE "AssessmentInvitationStatus" AS ENUM ('PENDING', 'SENT', 'VIEWED', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "AssessmentQuestionType" AS ENUM ('SLIDER_LIKERT', 'NUMBER', 'MULTI_CHOICE');

-- CreateEnum
CREATE TYPE "AssessmentCampaignAccessMode" AS ENUM ('INVITED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "AssessmentTemplateAggregationMode" AS ENUM ('FULL_VISIBILITY', 'CEO_ONLY');

-- ============================================================
-- Tables
-- ============================================================

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "ownerCoachId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_teams" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentTeamId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "org_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_respondents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "externalId" TEXT,
    "dedupeSource" TEXT NOT NULL,
    "dedupeValue" TEXT NOT NULL,
    "roleType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "org_respondents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "description" TEXT,
    "invitationSubject" TEXT NOT NULL,
    "invitationBodyMarkdown" TEXT NOT NULL,
    "aggregationMode" "AssessmentTemplateAggregationMode" NOT NULL DEFAULT 'FULL_VISIBILITY',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assessment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "scoringConfig" JSONB NOT NULL,
    "reportConfig" JSONB,
    "contentHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_campaigns" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AssessmentCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "accessMode" "AssessmentCampaignAccessMode" NOT NULL DEFAULT 'INVITED',
    "publicConfig" JSONB,
    "openAt" TIMESTAMP(3) NOT NULL,
    "endMode" "AssessmentCampaignEndMode" NOT NULL,
    "closeAt" TIMESTAMP(3),
    "notifyAdminOnSubmit" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdByCoachId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_campaign_participants" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "respondentId" TEXT NOT NULL,
    "isCEO" BOOLEAN NOT NULL DEFAULT false,
    "teamPathAtAdd" TEXT[],
    "teamLabelsAtAdd" TEXT[],
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_campaign_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_invitations" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "respondentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "AssessmentInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "resentCount" INTEGER NOT NULL DEFAULT 0,
    "lastResentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_submissions" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "respondentId" TEXT,
    "invitationId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answers" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "publicTaker" JSONB,
    "referringCoachEmail" TEXT,
    "resultsTokenHash" TEXT,
    "resultsTokenIssuedAt" TIMESTAMP(3),
    "resultsTokenExpiresAt" TIMESTAMP(3),
    "resultsTokenRevokedAt" TIMESTAMP(3),
    "resultsTokenViewedAt" TIMESTAMP(3),

    CONSTRAINT "assessment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "accessPolicyVersion" TEXT NOT NULL DEFAULT 'v1.intersection',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "access_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_group_coaches" (
    "id" TEXT NOT NULL,
    "accessGroupId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT NOT NULL,

    CONSTRAINT "access_group_coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_group_templates" (
    "id" TEXT NOT NULL,
    "accessGroupId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT NOT NULL,

    CONSTRAINT "access_group_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_ownership_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "oldOwnerCoachId" TEXT,
    "newOwnerCoachId" TEXT,
    "campaignId" TEXT,
    "performedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_ownership_events_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- Indexes
-- ============================================================

-- CreateIndex
CREATE UNIQUE INDEX "organizations_externalId_key" ON "organizations"("externalId");

-- CreateIndex
CREATE INDEX "organizations_ownerCoachId_idx" ON "organizations"("ownerCoachId");

-- CreateIndex
CREATE INDEX "org_teams_organizationId_parentTeamId_idx" ON "org_teams"("organizationId", "parentTeamId");

-- CreateIndex
CREATE INDEX "org_respondents_organizationId_email_idx" ON "org_respondents"("organizationId", "email");

-- CreateIndex
CREATE INDEX "org_respondents_organizationId_normalizedEmail_idx" ON "org_respondents"("organizationId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "org_respondents_externalId_idx" ON "org_respondents"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "org_respondents_organizationId_dedupeSource_dedupeValue_key" ON "org_respondents"("organizationId", "dedupeSource", "dedupeValue");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_templates_alias_key" ON "assessment_templates"("alias");

-- CreateIndex
CREATE INDEX "assessment_template_versions_templateId_language_idx" ON "assessment_template_versions"("templateId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_template_versions_templateId_versionNumber_langu_key" ON "assessment_template_versions"("templateId", "versionNumber", "language");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_campaigns_alias_key" ON "assessment_campaigns"("alias");

-- CreateIndex
CREATE INDEX "assessment_campaigns_organizationId_idx" ON "assessment_campaigns"("organizationId");

-- CreateIndex
CREATE INDEX "assessment_campaigns_templateId_organizationId_idx" ON "assessment_campaigns"("templateId", "organizationId");

-- CreateIndex
CREATE INDEX "assessment_campaigns_versionId_idx" ON "assessment_campaigns"("versionId");

-- CreateIndex
CREATE INDEX "assessment_campaigns_createdByCoachId_idx" ON "assessment_campaigns"("createdByCoachId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_campaign_participants_campaignId_respondentId_key" ON "assessment_campaign_participants"("campaignId", "respondentId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_invitations_tokenHash_key" ON "assessment_invitations"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_invitations_campaignId_respondentId_key" ON "assessment_invitations"("campaignId", "respondentId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_submissions_invitationId_key" ON "assessment_submissions"("invitationId");

-- CreateIndex
CREATE INDEX "assessment_submissions_campaignId_idx" ON "assessment_submissions"("campaignId");

-- CreateIndex
CREATE INDEX "assessment_submissions_respondentId_submittedAt_idx" ON "assessment_submissions"("respondentId", "submittedAt");

-- CreateIndex
CREATE INDEX "assessment_submissions_referringCoachEmail_idx" ON "assessment_submissions"("referringCoachEmail");

-- CreateIndex
CREATE INDEX "access_groups_deletedAt_idx" ON "access_groups"("deletedAt");

-- CreateIndex
CREATE INDEX "access_group_coaches_coachId_idx" ON "access_group_coaches"("coachId");

-- CreateIndex
CREATE INDEX "access_group_coaches_accessGroupId_idx" ON "access_group_coaches"("accessGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "access_group_coaches_accessGroupId_coachId_key" ON "access_group_coaches"("accessGroupId", "coachId");

-- CreateIndex
CREATE INDEX "access_group_templates_templateId_idx" ON "access_group_templates"("templateId");

-- CreateIndex
CREATE INDEX "access_group_templates_accessGroupId_idx" ON "access_group_templates"("accessGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "access_group_templates_accessGroupId_templateId_key" ON "access_group_templates"("accessGroupId", "templateId");

-- CreateIndex
CREATE INDEX "organization_ownership_events_organizationId_createdAt_idx" ON "organization_ownership_events"("organizationId", "createdAt");

-- ============================================================
-- Foreign Keys
-- ============================================================

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_ownerCoachId_fkey" FOREIGN KEY ("ownerCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_teams" ADD CONSTRAINT "org_teams_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_teams" ADD CONSTRAINT "org_teams_parentTeamId_fkey" FOREIGN KEY ("parentTeamId") REFERENCES "org_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_respondents" ADD CONSTRAINT "org_respondents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_respondents" ADD CONSTRAINT "org_respondents_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "org_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_template_versions" ADD CONSTRAINT "assessment_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_campaigns" ADD CONSTRAINT "assessment_campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_campaigns" ADD CONSTRAINT "assessment_campaigns_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "assessment_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_campaigns" ADD CONSTRAINT "assessment_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_campaigns" ADD CONSTRAINT "assessment_campaigns_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_campaigns" ADD CONSTRAINT "assessment_campaigns_createdByCoachId_fkey" FOREIGN KEY ("createdByCoachId") REFERENCES "coaches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_campaign_participants" ADD CONSTRAINT "assessment_campaign_participants_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "assessment_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_campaign_participants" ADD CONSTRAINT "assessment_campaign_participants_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "org_respondents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_invitations" ADD CONSTRAINT "assessment_invitations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "assessment_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_invitations" ADD CONSTRAINT "assessment_invitations_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "org_respondents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_submissions" ADD CONSTRAINT "assessment_submissions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "assessment_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_submissions" ADD CONSTRAINT "assessment_submissions_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "org_respondents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_submissions" ADD CONSTRAINT "assessment_submissions_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "assessment_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_groups" ADD CONSTRAINT "access_groups_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_group_coaches" ADD CONSTRAINT "access_group_coaches_accessGroupId_fkey" FOREIGN KEY ("accessGroupId") REFERENCES "access_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_group_coaches" ADD CONSTRAINT "access_group_coaches_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_group_coaches" ADD CONSTRAINT "access_group_coaches_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_group_templates" ADD CONSTRAINT "access_group_templates_accessGroupId_fkey" FOREIGN KEY ("accessGroupId") REFERENCES "access_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_group_templates" ADD CONSTRAINT "access_group_templates_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_group_templates" ADD CONSTRAINT "access_group_templates_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_ownership_events" ADD CONSTRAINT "organization_ownership_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_ownership_events" ADD CONSTRAINT "organization_ownership_events_oldOwnerCoachId_fkey" FOREIGN KEY ("oldOwnerCoachId") REFERENCES "coaches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_ownership_events" ADD CONSTRAINT "organization_ownership_events_newOwnerCoachId_fkey" FOREIGN KEY ("newOwnerCoachId") REFERENCES "coaches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_ownership_events" ADD CONSTRAINT "organization_ownership_events_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "assessment_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_ownership_events" ADD CONSTRAINT "organization_ownership_events_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================
-- v7.6: Hand-edited raw SQL (partial indexes, GIN index, immutability trigger)
-- ============================================

-- Partial unique index for Organization.externalId WHERE NOT NULL.
-- Replaces the Prisma-generated full unique index so that multiple rows can
-- have NULL externalId (admin-created orgs without an external ID).
DROP INDEX IF EXISTS "organizations_externalId_key";
CREATE UNIQUE INDEX "organizations_externalId_unique"
  ON "organizations" ("externalId") WHERE "externalId" IS NOT NULL;

-- Partial unique index: at most one submission per (campaign, respondent) for
-- non-PUBLIC submissions. PUBLIC submissions have respondentId NULL and are
-- not subject to this constraint.
CREATE UNIQUE INDEX "assessment_submissions_campaign_respondent_unique"
  ON "assessment_submissions" ("campaignId", "respondentId")
  WHERE "respondentId" IS NOT NULL;

-- Partial unique index: resultsTokenHash is unique when present. Most
-- submissions will have NULL token hash; only the ones with a results-share
-- link issued will have a hash.
CREATE UNIQUE INDEX "assessment_submissions_results_token_hash_unique"
  ON "assessment_submissions" ("resultsTokenHash")
  WHERE "resultsTokenHash" IS NOT NULL;

-- Partial unique index: at most one CEO per campaign.
-- (Multiple non-CEO participants are obviously allowed.)
CREATE UNIQUE INDEX "assessment_campaign_participants_ceo_unique"
  ON "assessment_campaign_participants" ("campaignId")
  WHERE "isCEO" = true;

-- GIN index on teamPathAtAdd for fast :scopeTeamId = ANY(teamPathAtAdd)
-- lookups in dashboard scope-team filtering.
CREATE INDEX "assessment_campaign_participants_team_path_gin"
  ON "assessment_campaign_participants" USING GIN ("teamPathAtAdd");

-- v7.6: Partial unique index on access_groups.name WHERE deletedAt IS NULL.
-- A name is unique only among active (non-archived) groups, so a
-- soft-deleted "Scaling Up Coaches" can coexist with a fresh active one of
-- the same name (admin re-creates after archive).
CREATE UNIQUE INDEX "access_groups_name_active_unique"
  ON "access_groups" ("name") WHERE "deletedAt" IS NULL;

-- Immutability trigger for AssessmentTemplateVersion published rows.
-- Once publishedAt is set on a version row, UPDATE and DELETE are blocked.
-- Editors must create a new versionNumber instead.
-- Function name is table-specific (not generic) to prevent collisions with
-- future immutability triggers on other tables.
CREATE OR REPLACE FUNCTION assessment_template_version_block_published_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD."publishedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'AssessmentTemplateVersion row % is published (publishedAt=%) and is immutable. Create a new versionNumber instead.',
      OLD.id, OLD."publishedAt";
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assessment_template_version_immutability_trigger ON "assessment_template_versions";
CREATE TRIGGER assessment_template_version_immutability_trigger
  BEFORE UPDATE OR DELETE ON "assessment_template_versions"
  FOR EACH ROW
  EXECUTE FUNCTION assessment_template_version_block_published_mutation();
