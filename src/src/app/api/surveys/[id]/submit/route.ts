/**
 * POST /api/surveys/[id]/submit — Submit survey responses (public)
 * Body: { answers: [{ questionId, value, numValue? }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { submitSurveyResponse } from "@/lib/surveys/survey-service";
import { withRateLimit, RateLimits } from "@/lib/rate-limit";
import { z } from "zod";

const submitSurveyParamsSchema = z.object({
  id: z.string().min(1, "Survey id is required"),
});

const submitSurveyAnswerSchema = z.object({
  questionId: z.string().min(1, "questionId is required"),
  value: z.string(),
  numValue: z.number().optional(),
});

const submitSurveyBodySchema = z.object({
  answers: z.array(submitSurveyAnswerSchema).min(1, "answers array is required and must not be empty"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit: 20 submissions per minute per IP
  const rateLimit = await withRateLimit(request, RateLimits.registration);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429, headers: rateLimit.headers }
    );
  }

  const paramsValidation = submitSurveyParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid survey id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = submitSurveyBodySchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { id: surveyId } = paramsValidation.data;
  const { answers } = bodyValidation.data;

  try {
    const result = await submitSurveyResponse(surveyId, answers);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Survey not found") {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      if (err.message === "Survey already completed") {
        return NextResponse.json({ error: err.message }, { status: 410 });
      }
      if (err.message.startsWith("Invalid question IDs")) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
    }
    console.error("Survey submit error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
