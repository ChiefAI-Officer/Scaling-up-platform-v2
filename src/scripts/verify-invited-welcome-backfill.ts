import { PrismaClient } from "@prisma/client";
import { verifyInvitedWelcomeBackfill } from "../src/lib/assessments/invited-welcome-backfill-verifier";

const db = new PrismaClient();

async function main() {
  const [templates, campaigns, triggerRows] = await Promise.all([
    db.assessmentTemplate.findMany({
      select: {
        id: true,
        alias: true,
        deletedAt: true,
        invitedWelcomeDefault: true,
      },
    }),
    db.assessmentCampaign.findMany({
      select: {
        id: true,
        accessMode: true,
        invitedWelcomeSnapshot: true,
        template: { select: { alias: true } },
      },
    }),
    db.$queryRaw<Array<{ present: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_trigger AS trigger
        JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
        WHERE trigger.tgname = 'assessment_campaign_invited_welcome_snapshot_immutability_trigger'
          AND relation.relname = 'assessment_campaigns'
          AND NOT trigger.tgisinternal
      ) AS present
    `,
  ]);

  const result = verifyInvitedWelcomeBackfill({
    templates,
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      accessMode: campaign.accessMode,
      templateAlias: campaign.template.alias,
      invitedWelcomeSnapshot: campaign.invitedWelcomeSnapshot,
    })),
    immutabilityTriggerPresent: triggerRows[0]?.present === true,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Invited Welcome backfill verification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
