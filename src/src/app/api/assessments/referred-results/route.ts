import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listPublicReferrals } from "@/lib/assessments/public-referrals";
import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";
import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

const querySchema = z
  .object({
    query: z.string().trim().min(1).max(200).optional(),
    templateId: z.string().trim().min(1).max(191).optional(),
    cursor: z.string().trim().min(1).max(191).optional(),
    take: z.coerce.number().int().min(1).max(25).default(25),
  })
  .strict();

const privateHeaders = {
  "Cache-Control": "no-store, private",
};

export async function GET(request: NextRequest) {
  if (!isReferredResultsEnabled()) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404, headers: privateHeaders },
    );
  }

  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401, headers: privateHeaders },
      );
    }
    if (actor.role !== "COACH" || !actor.coachId) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403, headers: privateHeaders },
      );
    }
    const validation = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
          details: validation.error.issues,
        },
        { status: 400, headers: privateHeaders },
      );
    }

    // The domain loader intentionally accepts the narrow Prisma methods it
    // needs; the generated client satisfies that runtime contract.
    const outcome = await listPublicReferrals(
      db as never,
      actor,
      validation.data,
    );
    if (outcome.status === "forbidden") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403, headers: privateHeaders },
      );
    }

    const assessmentOptions = await db.assessmentTemplate.findMany({
      where: {
        deletedAt: null,
        campaigns: {
          some: {
            accessMode: "PUBLIC",
            deletedAt: null,
            submissions: {
              some: { referringCoachId: actor.coachId },
            },
          },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(
      {
        success: true,
        items: outcome.items,
        nextCursor: outcome.nextCursor,
        assessmentOptions,
        totalCount: outcome.totalCount,
        ownedTotalCount: outcome.ownedTotalCount,
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("Failed to load referred results:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load referred results" },
      { status: 500, headers: privateHeaders },
    );
  }
}
