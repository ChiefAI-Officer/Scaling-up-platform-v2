import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { asAccessDb, canManageCampaign } from "@/lib/assessments/access-control";
import { isMemberPortalEnabled } from "@/lib/members/flags";
import { sendMemberSignInLink } from "@/lib/members/send-sign-in-link";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  respondentIds: z.array(z.string().min(1)).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isMemberPortalEnabled()) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const { id: campaignId } = await params;
  const allowed = await canManageCampaign(asAccessDb(db), actor, campaignId, "write");
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
  }

  const rateLimit = await withRateLimit(request, RateLimits.memberPortalCoachSend);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    // Empty body means every campaign respondent.
  }
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const campaign = await db.assessmentCampaign.findFirst({
    where: { id: campaignId, deletedAt: null, accessMode: "INVITED" },
    select: {
      id: true,
      participants: {
        select: {
          respondentId: true,
          respondent: { select: { id: true, email: true, deletedAt: true } },
        },
      },
    },
  });
  if (!campaign) {
    return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
  }

  const requestedIds = parsed.data.respondentIds;
  const wanted = requestedIds?.length ? new Set(requestedIds) : null;
  const targets = campaign.participants.filter(
    (participant) =>
      participant.respondent.deletedAt === null &&
      (wanted === null || wanted.has(participant.respondentId)),
  );
  if (targets.length === 0) {
    return NextResponse.json(
      { success: false, error: "No matching campaign respondents" },
      { status: 400 },
    );
  }

  let sent = 0;
  let skipped = 0;
  for (const target of targets) {
    const result = await sendMemberSignInLink(
      db as unknown as Parameters<typeof sendMemberSignInLink>[0],
      {
        email: target.respondent.email,
        via: "COACH",
        byUserId: actor.userId,
        campaignId,
      },
    );
    if (result.issued) sent += 1;
    else skipped += 1;
  }

  return NextResponse.json(
    { success: true, data: { sent, skipped } },
    { headers: rateLimit.headers },
  );
}
