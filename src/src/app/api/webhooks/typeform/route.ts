import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getSurveyTypeFromFormId } from "@/lib/typeform";
import type {
  TypeformWebhookPayload,
  TypeformAnswer,
} from "@/types/typeform";

/**
 * Verify Typeform webhook signature using HMAC SHA-256.
 * Typeform sends the signature in the `typeform-signature` header
 * as `sha256=<base64-digest>`.
 *
 * Known quirk: Typeform may append a trailing newline to the body
 * when computing the signature. We check both with and without.
 */
function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.TYPEFORM_WEBHOOK_SECRET;

  // Skip verification if no secret configured (dev only)
  if (!secret) {
    console.warn("TYPEFORM_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }

  if (!signature) {
    return false;
  }

  // Try exact body first, then body + trailing newline (Typeform quirk)
  for (const payload of [body, body + "\n"]) {
    const hash = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("base64");

    const expected = `sha256=${hash}`;

    // Use timing-safe comparison to prevent timing attacks
    try {
      if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
        return true;
      }
    } catch {
      // Length mismatch — continue to next attempt
    }
  }

  return false;
}

/**
 * Extract NPS score from answers.
 * Looks for opinion_scale or rating type answers (score 0-10).
 */
function extractNpsScore(answers: TypeformAnswer[]): number | null {
  for (const answer of answers) {
    if (
      (answer.field.type === "opinion_scale" || answer.field.type === "rating") &&
      answer.number !== undefined
    ) {
      return answer.number;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("typeform-signature");

    if (!verifySignature(body, signature)) {
      console.error("Typeform webhook signature verification failed");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    const payload: TypeformWebhookPayload = JSON.parse(body);
    const { form_response } = payload;

    console.log(
      `Typeform webhook received: form=${form_response.form_id} token=${form_response.token}`
    );

    // Determine survey type from form ID
    const surveyType = getSurveyTypeFromFormId(form_response.form_id);
    if (!surveyType) {
      console.warn(`Unknown Typeform form ID: ${form_response.form_id}`);
      // Still return 200 so Typeform doesn't retry
      return NextResponse.json({ received: true, matched: false });
    }

    // Extract hidden fields
    const hidden = form_response.hidden || {};
    const workshopId = hidden.workshop_id;
    const registrationId = hidden.registration_id;

    if (!workshopId) {
      console.error("Typeform webhook missing workshop_id hidden field");
      return NextResponse.json({ received: true, error: "missing workshop_id" });
    }

    // Verify workshop exists
    const workshop = await db.workshop.findUnique({
      where: { id: workshopId },
      select: { id: true },
    });

    if (!workshop) {
      console.error(`Workshop not found: ${workshopId}`);
      return NextResponse.json({ received: true, error: "workshop not found" });
    }

    // Check for duplicate submission (idempotency via Typeform response token)
    const existingSurvey = await db.survey.findFirst({
      where: {
        workshopId,
        registrationId: registrationId || undefined,
        surveyType,
        completedAt: { not: null },
      },
    });

    if (existingSurvey) {
      console.log(
        `Duplicate Typeform response ignored: survey=${existingSurvey.id} workshop=${workshopId}`
      );
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Extract NPS score if present
    const npsScore = extractNpsScore(form_response.answers);

    // Look for an existing survey record (created when the email was sent)
    const pendingSurvey = await db.survey.findFirst({
      where: {
        workshopId,
        registrationId: registrationId || undefined,
        surveyType,
        completedAt: null,
      },
    });

    if (pendingSurvey) {
      // Update existing survey with response data
      await db.survey.update({
        where: { id: pendingSurvey.id },
        data: {
          responses: JSON.stringify(form_response.answers),
          npsScore,
          completedAt: new Date(form_response.submitted_at),
        },
      });

      console.log(`Survey updated: ${pendingSurvey.id} (${surveyType})`);
    } else {
      // Create new survey record (response arrived without a pre-created record)
      const newSurvey = await db.survey.create({
        data: {
          workshopId,
          registrationId: registrationId || null,
          surveyType,
          responses: JSON.stringify(form_response.answers),
          npsScore,
          completedAt: new Date(form_response.submitted_at),
        },
      });

      console.log(`Survey created: ${newSurvey.id} (${surveyType})`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Typeform webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
