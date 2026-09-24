import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canAccessOrganization,
} from "@/lib/assessments/access-control";
import { isMemberLedTeamsEnabled } from "@/lib/members/flags";
import {
  readCoachMemberLedTeams,
  saveCoachMemberLedTeams,
} from "@/lib/members/coach-led-teams";
import { MemberLedTeamWriteError } from "@/lib/members/led-teams";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const replacementSchema = z
  .object({
    teamIds: z.array(z.string().min(1)).max(100),
    confirmTeamIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .superRefine((value, context) => {
    if (new Set(value.teamIds).size !== value.teamIds.length) {
      context.addIssue({ code: "custom", path: ["teamIds"], message: "teamIds must be unique" });
    }
    if (new Set(value.confirmTeamIds ?? []).size !== (value.confirmTeamIds ?? []).length) {
      context.addIssue({
        code: "custom",
        path: ["confirmTeamIds"],
        message: "confirmTeamIds must be unique",
      });
    }
    for (const teamId of value.confirmTeamIds ?? []) {
      if (!value.teamIds.includes(teamId)) {
        context.addIssue({
          code: "custom",
          path: ["confirmTeamIds"],
          message: "Only retained led teams can be confirmed",
        });
      }
    }
  });

type RouteContext = {
  params: Promise<{ id: string; respondentId: string }>;
};

async function authorize(context: RouteContext) {
  const actor = await getApiActor();
  if (!actor) return { response: NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 }) };
  const { id: organizationId, respondentId } = await context.params;
  const allowed = await canAccessOrganization(asAccessDb(db), actor, organizationId);
  if (!allowed) return { response: NextResponse.json({ success: false, error: "Organization not found" }, { status: 404 }) };
  if (!isMemberLedTeamsEnabled()) {
    return { response: NextResponse.json({ success: false, error: "Not found" }, { status: 404 }) };
  }
  return { actor, organizationId, respondentId };
}

function writeError(error: unknown) {
  if (error instanceof MemberLedTeamWriteError) {
    const status = error.code === "respondent-not-found" ? 404 : 400;
    return NextResponse.json({ success: false, error: error.code }, { status });
  }
  console.error("Error writing member led teams:", error);
  return NextResponse.json({ success: false, error: "Failed to update led teams" }, { status: 500 });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const authorization = await authorize(context);
  if ("response" in authorization) return authorization.response;
  try {
    const data = await readCoachMemberLedTeams(db, {
      organizationId: authorization.organizationId,
      respondentId: authorization.respondentId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return writeError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const authorization = await authorize(context);
  if ("response" in authorization) return authorization.response;

  const rateLimit = await withRateLimit(request, RateLimits.standard);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rateLimit.headers },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const validation = replacementSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ success: false, error: validation.error.issues }, { status: 400 });
  }

  try {
    const data = await saveCoachMemberLedTeams(db, {
      organizationId: authorization.organizationId,
      respondentId: authorization.respondentId,
      teamIds: validation.data.teamIds,
      confirmTeamIds: validation.data.confirmTeamIds,
      actorId: authorization.actor.userId,
      performedBy: authorization.actor.email,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return writeError(error);
  }
}
