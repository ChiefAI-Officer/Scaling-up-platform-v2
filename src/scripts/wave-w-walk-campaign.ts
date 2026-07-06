/**
 * Wave W launch walk — create the throwaway walk campaign (INVITED, ACTIVE,
 * OPEN_END) on the walk template, add the safe test member as participant,
 * and mint an invitation token. NO email is sent (rows only).
 *
 * Quarantined after the walk (campaign delete first, then template
 * soft-delete — §5.5 order).
 *
 * Usage: npx tsx scripts/wave-w-walk-campaign.ts
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const db = new PrismaClient();

const TEMPLATE_ID = "cmr961srn0002gpfzhhmw44bm"; // WALK W COND TEST (throwaway)
const VERSION_ID = "cmr961t4v0004gpfz3tbqen57"; // v1 (published 2026-07-06)
const ORG_ID = "cmpb9nqj30001a07xey1bwwmy"; // "Test" org
const MEMBER_ID = "cmppay4z40004v97xl8tdh0xs"; // TestDelete MeSmoke (safe)
const ADMIN_USER_ID = "cmpapnpel0000o0xzqq049auq"; // prod admin

async function main() {
  const campaign = await db.assessmentCampaign.create({
    data: {
      template: { connect: { id: TEMPLATE_ID } },
      version: { connect: { id: VERSION_ID } },
      organization: { connect: { id: ORG_ID } },
      creator: { connect: { id: ADMIN_USER_ID } },
      language: "en",
      alias: "walk-w-campaign",
      name: "WALK W CAMPAIGN (throwaway)",
      description: "Wave W launch-walk throwaway — quarantined after the walk",
      status: "ACTIVE",
      accessMode: "INVITED",
      openAt: new Date(),
      endMode: "OPEN_END",
      notifyAdminOnSubmit: false,
    },
  });
  console.log("campaign:", campaign.id);

  const participant = await db.assessmentCampaignParticipant.create({
    data: {
      campaign: { connect: { id: campaign.id } },
      respondent: { connect: { id: MEMBER_ID } },
    },
  });
  console.log("participant:", participant.id);

  // Invitation token: mirror the send path's shape — raw token in the URL,
  // sha256 hash at rest. NO email is sent.
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const invitation = await db.assessmentInvitation.create({
    data: {
      campaign: { connect: { id: campaign.id } },
      respondent: { connect: { id: MEMBER_ID } },
      tokenHash,
      status: "SENT",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  console.log("invitation:", invitation.id);
  console.log(`survey URL: http://localhost:3000/org-survey/walk-w-campaign#t=${rawToken}`);

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
