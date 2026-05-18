/**
 * Assessment v7.6 — Task K: Campaign Wizard auto-save drafts.
 *
 * GET    — return the caller's draft (or null).
 * PUT    — upsert {step, data} by coachId.
 * DELETE — remove the caller's draft (no-op if none).
 *
 * Auth: caller MUST have a coachId. Mirrors the assessment-campaigns
 * pattern (getApiActor + actor.coachId gate) instead of requireCoach(),
 * which uses redirect() and is unsafe in API routes.
 *
 * Schema: one row per coach (coachId unique), cascade on coach delete.
 * Mirrors the WorkshopDraft precedent in src/src/app/api/workshop-drafts/route.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const draftSchema = z.object({
  step: z.number().int().min(0).max(20),
  data: z.unknown(),
});

async function authCoach() {
  const actor = await getApiActor();
  if (!actor) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      ),
    };
  }
  if (!actor.coachId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: "Only coaches can manage wizard drafts" },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, coachId: actor.coachId };
}

export async function GET() {
  try {
    const auth = await authCoach();
    if (!auth.ok) return auth.response;

    const draft = await db.campaignWizardDraft.findUnique({
      where: { coachId: auth.coachId },
    });

    return NextResponse.json({ success: true, data: draft ?? null });
  } catch (error) {
    console.error("Error fetching campaign wizard draft:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch draft" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers },
      );
    }

    const auth = await authCoach();
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const validation = draftSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 },
      );
    }

    const { step, data } = validation.data;
    const now = new Date();

    const draft = await db.campaignWizardDraft.upsert({
      where: { coachId: auth.coachId },
      create: {
        coachId: auth.coachId,
        currentStep: step,
        stepsData: JSON.stringify(data ?? {}),
        lastSavedAt: now,
      },
      update: {
        currentStep: step,
        stepsData: JSON.stringify(data ?? {}),
        lastSavedAt: now,
      },
    });

    return NextResponse.json({ success: true, draftId: draft.id });
  } catch (error) {
    console.error("Error saving campaign wizard draft:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save draft" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers },
      );
    }

    const auth = await authCoach();
    if (!auth.ok) return auth.response;

    await db.campaignWizardDraft.deleteMany({
      where: { coachId: auth.coachId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting campaign wizard draft:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete draft" },
      { status: 500 },
    );
  }
}
