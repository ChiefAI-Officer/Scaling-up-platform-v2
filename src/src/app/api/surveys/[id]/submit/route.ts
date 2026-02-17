/**
 * POST /api/surveys/[id]/submit — Submit survey responses (public)
 * Body: { answers: [{ questionId, value, numValue? }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { submitSurveyResponse } from "@/lib/survey-service";
import { withRateLimit, RateLimits } from "@/lib/rate-limit";

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

  const { id: surveyId } = await params;
  const body = await request.json();
  const { answers } = body;

  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json(
      { error: "answers array is required and must not be empty" },
      { status: 400 }
    );
  }

  // Validate answer shape
  for (const answer of answers) {
    if (!answer.questionId || typeof answer.value !== "string") {
      return NextResponse.json(
        { error: "Each answer must have questionId (string) and value (string)" },
        { status: 400 }
      );
    }
  }

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
    }
    throw err;
  }
}
