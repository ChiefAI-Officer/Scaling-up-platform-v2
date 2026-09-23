-- ADR-0040: membership records where a person sits; this additive relation
-- records the zero-to-many teams for which that membership has report authority.
CREATE TABLE "org_respondent_led_teams" (
    "respondentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "org_respondent_led_teams_pkey" PRIMARY KEY ("respondentId", "teamId")
);

CREATE INDEX "org_respondent_led_teams_teamId_idx"
    ON "org_respondent_led_teams"("teamId");
CREATE INDEX "org_respondent_led_teams_organizationId_idx"
    ON "org_respondent_led_teams"("organizationId");

ALTER TABLE "org_respondent_led_teams"
    ADD CONSTRAINT "org_respondent_led_teams_respondentId_fkey"
    FOREIGN KEY ("respondentId") REFERENCES "org_respondents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_respondent_led_teams"
    ADD CONSTRAINT "org_respondent_led_teams_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "org_teams"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_respondent_led_teams"
    ADD CONSTRAINT "org_respondent_led_teams_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Abort rather than encode a cross-organization authority edge from legacy data.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "org_respondents" AS respondent
        JOIN "organizations" AS organization
          ON organization."id" = respondent."organizationId"
         AND organization."deletedAt" IS NULL
        JOIN "org_teams" AS team ON team."id" = respondent."teamId"
        WHERE respondent."deletedAt" IS NULL
          AND respondent."roleType" = 'teamleader'
          AND respondent."teamId" IS NOT NULL
          AND team."organizationId" <> respondent."organizationId"
    ) THEN
        RAISE EXCEPTION 'backfill-0040 found a teamleader whose team belongs to another organization';
    END IF;
END $$;

-- Decision 10: preserve every live teamleader's current effective scope at cutover.
INSERT INTO "org_respondent_led_teams" (
    "respondentId",
    "teamId",
    "organizationId",
    "createdBy",
    "source"
)
SELECT
    respondent."id",
    respondent."teamId",
    respondent."organizationId",
    'SYSTEM',
    'backfill-0040'
FROM "org_respondents" AS respondent
JOIN "organizations" AS organization
  ON organization."id" = respondent."organizationId"
 AND organization."deletedAt" IS NULL
WHERE respondent."deletedAt" IS NULL
  AND respondent."roleType" = 'teamleader'
  AND respondent."teamId" IS NOT NULL;

-- One durable, PII-free receipt per inferred authority edge.
INSERT INTO "audit_logs" (
    "id",
    "entityType",
    "entityId",
    "action",
    "performedBy",
    "changes",
    "timestamp"
)
SELECT
    'bf0040_' || md5(led."respondentId" || ':' || led."teamId"),
    'OrgRespondentLedTeam',
    led."respondentId" || ':' || led."teamId",
    'BACKFILL',
    'SYSTEM',
    json_build_object(
        'respondentId', led."respondentId",
        'teamId', led."teamId",
        'reason', 'Preserve teamId-derived report scope during ADR-0040 cutover'
    )::text,
    CURRENT_TIMESTAMP
FROM "org_respondent_led_teams" AS led
WHERE led."source" = 'backfill-0040';
