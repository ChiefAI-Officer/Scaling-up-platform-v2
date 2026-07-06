/**
 * Wave W launch walk — §5.5 quarantine (campaigns FIRST, then template
 * soft-delete; published version rows are never hard-deleted).
 *
 * Targets (all throwaway walk artifacts, 2026-07-06):
 *  - campaign walk-w-campaign  cmr96ro310000phu07kuijj42
 *  - campaign walk-w-tamper    cmr96zger0000jebgkw6txyem
 *    (both campaigns: invitation/submission rows stay attached; campaign soft-deleted, invitations revoked)
 *  - template walk-qual-w      cmr961srn0002gpfzhhmw44bm (v1 published + v2 dup draft)
 *
 * Usage: npx tsx scripts/wave-w-walk-quarantine.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const CAMPAIGNS = ["cmr96ro310000phu07kuijj42", "cmr96zger0000jebgkw6txyem"];
const TEMPLATE_ID = "cmr961srn0002gpfzhhmw44bm";

async function main() {
  const now = new Date();
  for (const id of CAMPAIGNS) {
    await db.assessmentCampaign.update({
      where: { id },
      data: { deletedAt: now, status: "CLOSED" },
    });
    const revoked = await db.assessmentInvitation.updateMany({
      where: { campaignId: id, revokedAt: null },
      data: { revokedAt: now },
    });
    console.log(`campaign ${id}: soft-deleted + ${revoked.count} invitation(s) revoked`);
  }
  await db.assessmentTemplate.update({
    where: { id: TEMPLATE_ID },
    data: { deletedAt: now },
  });
  console.log(`template ${TEMPLATE_ID}: soft-deleted`);

  // Post-quarantine smoke: zero live walk artifacts.
  const liveCampaigns = await db.assessmentCampaign.count({
    where: { alias: { startsWith: "walk-w" }, deletedAt: null },
  });
  const liveTemplates = await db.assessmentTemplate.count({
    where: { alias: "walk-qual-w", deletedAt: null },
  });
  console.log(`smoke: live walk campaigns=${liveCampaigns} live walk templates=${liveTemplates}`);
  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
