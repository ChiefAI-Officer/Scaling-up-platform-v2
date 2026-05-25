/**
 * Assessment v7.6 — PUBLIC quiz submission.
 *
 * Anonymous public-mode submit. The campaign's accessMode MUST be PUBLIC.
 * No invitation token; the visitor provides their own name + email. We
 * create an AssessmentSubmission with respondentId=null + invitationId=null
 * and store {firstName, lastName, email} in the publicTaker JSON column.
 *
 * Body:
 *   {
 *     publicTaker: { firstName, lastName, email },
 *     answers: Array<{ stableKey, value }>,
 *     referringCoachEmail?: string
 *   }
 *
 * Status outcomes:
 *   - 404 CAMPAIGN_NOT_FOUND — alias unknown, or template/version missing
 *   - 403 NOT_PUBLIC — campaign is INVITED-only
 *   - 410 NOT_OPEN — campaign is DRAFT, CLOSED, before openAt, or past closeAt
 *   - 400 — invalid body or scoring validation failure
 *   - 200 { submissionId, redirectUrl }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import {
  scoreSubmission,
  ScoringValidationError,
  TemplateVersionForScoringSchema,
} from "@/lib/assessments/scoring";

const PublicSubmitBodySchema = z.object({
  publicTaker: z.object({
    firstName: z.string().min(1).max(100).trim(),
    lastName: z.string().min(1).max(100).trim(),
    email: z.string().email().max(320).trim().toLowerCase(),
  }),
  answers: z
    .array(
      z.object({
        stableKey: z.string().min(1),
        value: z.unknown(),
      }),
    )
    .min(1),
  referringCoachEmail: z.string().email().max(320).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignAlias: string }> },
) {
  try {
    // Public endpoint — same rate-limit class as other public submission endpoints.
    const rate = await withRateLimit(request, RateLimits.standard);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rate.headers },
      );
    }

    const { campaignAlias } = await params;
    const raw = await request.json().catch(() => ({}));
    const parsed = PublicSubmitBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;

    const campaign = await db.assessmentCampaign.findUnique({
      where: { alias: campaignAlias },
      select: {
        id: true,
        status: true,
        accessMode: true,
        openAt: true,
        closeAt: true,
        templateId: true,
        versionId: true,
      },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "CAMPAIGN_NOT_FOUND" },
        { status: 404 },
      );
    }
    if (campaign.accessMode !== "PUBLIC") {
      return NextResponse.json(
        { success: false, error: "NOT_PUBLIC" },
        { status: 403 },
      );
    }
    if (campaign.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "NOT_OPEN" },
        { status: 410 },
      );
    }
    const now = new Date();
    if (campaign.openAt > now) {
      return NextResponse.json(
        { success: false, error: "NOT_OPEN" },
        { status: 410 },
      );
    }
    if (campaign.closeAt && campaign.closeAt < now) {
      return NextResponse.json(
        { success: false, error: "NOT_OPEN" },
        { status: 410 },
      );
    }

    const version = await db.assessmentTemplateVersion.findUnique({
      where: { id: campaign.versionId },
      select: {
        id: true,
        questions: true,
        sections: true,
        scoringConfig: true,
        publishedAt: true,
      },
    });
    if (!version || version.publishedAt === null) {
      return NextResponse.json(
        { success: false, error: "CAMPAIGN_NOT_FOUND" },
        { status: 404 },
      );
    }

    const allQuestions = version.questions as Array<Record<string, unknown>>;
    const versionParsed = TemplateVersionForScoringSchema.safeParse({
      questions: allQuestions,
      sections: version.sections,
      scoringConfig: version.scoringConfig,
    });
    if (!versionParsed.success) {
      return NextResponse.json(
        { success: false, error: "Template version schema invalid" },
        { status: 500 },
      );
    }

    let result;
    try {
      result = scoreSubmission(versionParsed.data, data.answers);
    } catch (err) {
      if (err instanceof ScoringValidationError) {
        return NextResponse.json(
          {
            success: false,
            error: err.code,
            details: err.details,
          },
          { status: 400 },
        );
      }
      throw err;
    }

    const submission = await db.assessmentSubmission.create({
      data: {
        campaignId: campaign.id,
        respondentId: null,
        invitationId: null,
        answers: data.answers as Prisma.InputJsonValue,
        result: result as unknown as Prisma.InputJsonValue,
        publicTaker: {
          firstName: data.publicTaker.firstName,
          lastName: data.publicTaker.lastName,
          email: data.publicTaker.email,
        } as Prisma.InputJsonValue,
        referringCoachEmail: data.referringCoachEmail ?? null,
      },
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        submissionId: submission.id,
        redirectUrl: `/quiz/${campaignAlias}/thank-you`,
      },
    });
  } catch (error) {
    console.error("Error submitting public quiz:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit" },
      { status: 500 },
    );
  }
}
