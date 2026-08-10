import { PrismaClient } from "@prisma/client";
import { verifyInvitedWelcomeBackfill } from "../src/lib/assessments/invited-welcome-backfill-verifier";

const db = new PrismaClient();

async function main() {
  const [templates, campaigns] = await Promise.all([
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
  ]);

  const result = verifyInvitedWelcomeBackfill({
    templates,
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      accessMode: campaign.accessMode,
      templateAlias: campaign.template.alias,
      invitedWelcomeSnapshot: campaign.invitedWelcomeSnapshot,
    })),
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
