/**
 * Wave W launch walk — server-prune tamper spot-check (spec 19w §5.3).
 *
 * Creates a SECOND throwaway campaign + invitation on the walk template,
 * then POSTs a crafted submit whose answers include a HIDDEN question
 * (S1_Q1 requires gate option "people"; the payload selects only "cash").
 * Expected: the stored submission contains the gate + cash answers ONLY —
 * pruneHiddenAnswers drops the smuggled S1_Q1 before every side effect.
 *
 * Quarantined with the rest of the walk artifacts (§5.5).
 * Usage: npx tsx scripts/wave-w-walk-tamper.ts  (dev server must be running)
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const db = new PrismaClient();
const TEMPLATE_ID = "cmr961srn0002gpfzhhmw44bm";
const VERSION_ID = "cmr961t4v0004gpfz3tbqen57";
const ORG_ID = "cmpb9nqj30001a07xey1bwwmy";
const MEMBER_ID = "cmppay4z40004v97xl8tdh0xs";
const ADMIN_USER_ID = "cmpapnpel0000o0xzqq049auq";

async function main() {
  const campaign = await db.assessmentCampaign.create({
    data: {
      template: { connect: { id: TEMPLATE_ID } },
      version: { connect: { id: VERSION_ID } },
      organization: { connect: { id: ORG_ID } },
      creator: { connect: { id: ADMIN_USER_ID } },
      language: "en",
      alias: "walk-w-tamper",
      name: "WALK W TAMPER (throwaway)",
      description: "Wave W launch-walk tamper check — quarantined after the walk",
      status: "ACTIVE",
      accessMode: "INVITED",
      openAt: new Date(),
      endMode: "OPEN_END",
      notifyAdminOnSubmit: false,
    },
  });
  await db.assessmentCampaignParticipant.create({
    data: { campaign: { connect: { id: campaign.id } }, respondent: { connect: { id: MEMBER_ID } } },
  });
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await db.assessmentInvitation.create({
    data: {
      campaign: { connect: { id: campaign.id } },
      respondent: { connect: { id: MEMBER_ID } },
      tokenHash,
      status: "SENT",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  console.log("tamper campaign:", campaign.id);

  // Exchange the token for the session cookie, then submit the crafted payload.
  const base = "http://localhost:3000";
  const ex = await fetch(`${base}/org-survey/walk-w-tamper/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: rawToken }),
  });
  const cookie = ex.headers.getSetCookie()[0]?.split(";")[0];
  console.log("exchange:", ex.status, cookie ? "cookie ok" : "NO COOKIE");
  if (!ex.ok || !cookie) {
    console.error("exchange failed — proof invalid");
    process.exit(1);
  }

  const submit = await fetch(`${base}/org-survey/walk-w-tamper/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      answers: [
        { stableKey: "S1_what_is_your_biggest_obstacle", value: ["cash"] },
        { stableKey: "S1_Q1", value: "SMUGGLED — hidden (people not selected), must be pruned" },
        { stableKey: "S1_why_is_cash_your_obstacle", value: "legit cash answer" },
      ],
    }),
  });
  console.log("submit:", submit.status, (await submit.text()).slice(0, 120));
  if (!submit.ok) {
    console.error("submit failed — proof invalid");
    process.exit(1);
  }

  const sub = await db.assessmentSubmission.findFirst({
    where: { campaignId: campaign.id },
    select: { id: true, answers: true },
  });
  if (!sub) {
    console.error("NO SUBMISSION STORED — proof invalid");
    process.exit(1);
  }
  console.log("stored answers:", JSON.stringify(sub.answers));
  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
