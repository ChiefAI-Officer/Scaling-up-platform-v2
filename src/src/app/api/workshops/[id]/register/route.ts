import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createCheckoutSession, StripeDiscountCodeError } from "@/services/stripe";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import {
  createWorkshopRegistration,
  RegistrationServiceError,
} from "@/lib/registration-service";
import { inngest } from "@/inngest/client";
import { createOrUpdateContact } from "@/services/hubspot";
import { createPreWorkshopSurvey, sendSurveyEmail } from "@/lib/surveys/survey-automation";
import { z } from "zod";
import { parseStoredWorkshopCoupons } from "@/lib/workshops/workshop-coupons";
import { getAppUrl, resolveRegistrationSuccessUrl } from "@/lib/workshops/thank-you-redirect";

const workshopRegisterParamsSchema = z.object({
  id: z.string().min(1, "Workshop id is required"),
});

const registrationInputSchema = z.object({
  email: z.string().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  company: z.string().min(1, "Company is required"),
  jobTitle: z.string().optional(),
  phone: z.string().regex(/^[\d\s\-\+\(\)]+$/, "Invalid phone number").min(1, "Phone is required"),
  discountCode: z.string().optional(),
  marketingOptIn: z.boolean().optional().default(false),
});

interface RegistrationInput {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle?: string;
  phone?: string;
  discountCode?: string;
  marketingOptIn?: boolean;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const [firstName, ...rest] = trimmed.split(/\s+/);
  const lastName = rest.join(" ");

  return {
    firstName: firstName || "",
    lastName: lastName || "",
  };
}

async function parseRegistrationInput(request: NextRequest): Promise<RegistrationInput | null> {
  const contentType = request.headers.get("content-type") || "";
  let payload: Record<string, unknown>;

  if (contentType.includes("application/json")) {
    payload = (await request.json()) as Record<string, unknown>;
  } else {
    const formData = await request.formData();
    payload = Object.fromEntries(formData.entries());
  }

  const email = normalizeOptionalString(payload.email)?.toLowerCase() || "";
  let firstName = normalizeOptionalString(payload.firstName) || "";
  let lastName = normalizeOptionalString(payload.lastName) || "";

  const fullName = normalizeOptionalString(payload.fullName);
  if ((!firstName || !lastName) && fullName) {
    const parsed = splitFullName(fullName);
    if (!firstName) {
      firstName = parsed.firstName;
    }
    if (!lastName) {
      lastName = parsed.lastName;
    }
  }

  if (!email || !firstName || !lastName) {
    return null;
  }

  const validation = registrationInputSchema.safeParse({
    email,
    firstName,
    lastName,
    company: normalizeOptionalString(payload.company),
    jobTitle: normalizeOptionalString(payload.jobTitle),
    phone: normalizeOptionalString(payload.phone),
    discountCode: normalizeOptionalString(payload.discountCode),
    marketingOptIn: payload.marketingOptIn === true || payload.marketingOptIn === "true",
  });

  if (!validation.success) {
    return null;
  }

  return validation.data;
}

function wantsJsonResponse(request: NextRequest): boolean {
  const contentType = request.headers.get("content-type") || "";
  const accept = request.headers.get("accept") || "";
  return contentType.includes("application/json") || accept.includes("application/json");
}

function jsonError(
  message: string,
  status: number,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers }
  );
}

/**
 * POST /api/workshops/[id]/register
 * Compatibility endpoint for form-based registration pages.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimit = await withRateLimit(request, RateLimits.registration);
  if (!rateLimit.allowed) {
    return jsonError(
      "Too many requests. Please try again shortly.",
      429,
      rateLimit.headers
    );
  }

  const paramsValidation = workshopRegisterParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return jsonError("Invalid workshop id", 400, rateLimit.headers);
  }

  const { id: workshopId } = paramsValidation.data;
  const isJsonResponse = wantsJsonResponse(request);

  try {
    const input = await parseRegistrationInput(request);
    if (!input) {
      return jsonError("Missing required registration fields", 400, rateLimit.headers);
    }

    const { discountCode, ...registrationInput } = input;

    const { registration, workshop } = await createWorkshopRegistration({
      ...registrationInput,
      workshopId,
    });

    // JV-26 + JV-18: Send registration notification + ICS calendar attachment (fire-and-forget)
    db.coach.findFirst({ where: { id: workshop.coachId }, select: { email: true, firstName: true, lastName: true } })
      .then((coach) => {
        if (coach) {
          if (workshop.isFree) {
            if (!process.env.HUBSPOT_ACCESS_TOKEN) {
              console.warn("HUBSPOT_ACCESS_TOKEN is not set; skipping HubSpot sync for free registration");
            } else {
              createOrUpdateContact({
                email: registration.email,
                firstname: registration.firstName,
                lastname: registration.lastName,
                company: registration.company || undefined,
                jobtitle: registration.jobTitle || undefined,
                phone: registration.phone || undefined,
                workshop_name: workshop.title,
                workshop_date: workshop.eventDate.toISOString(),
                coach_name: `${coach.firstName} ${coach.lastName}`,
              })
                .then((hubspotContactId) =>
                  db.registration.update({
                    where: { id: registration.id },
                    data: { hubspotContactId },
                  })
                )
                .catch((err) =>
                  console.error("Failed to sync free registration to HubSpot:", err)
                );
            }
          }

          // Wave 13-A: Registration confirmation is now handled by Inngest.
          // FREE → handleRegistrationCreatedFree (with ICS + atomic claim)
          // PAID → processPaymentCompleted chain (triggered by Stripe webhook)
          // Publish only for free registrations; PAID gets the event from the
          // Stripe webhook after payment.session.completed fires.
          if (workshop.isFree) {
            inngest
              .send({
                name: "registration/created",
                data: {
                  registrationId: registration.id,
                  workshopId,
                  email: registrationInput.email,
                  firstName: registrationInput.firstName,
                },
              })
              .catch((err) =>
                console.error("Failed to publish registration/created:", err)
              );
          }
        }
      })
      .catch((err) => console.error("Coach lookup for notification failed:", err));

    // JV-13: Auto-create pre-workshop survey for this registration (fire-and-forget)
    // Only for free workshops — paid workshops get surveys after payment via webhook
    if (workshop.isFree) {
      createPreWorkshopSurvey({ workshopId, registrationId: registration.id })
        .then((result) => {
          if (result) {
            sendSurveyEmail({
              to: registrationInput.email,
              registrantName: `${registrationInput.firstName} ${registrationInput.lastName}`,
              workshopTitle: workshop.title,
              surveyUrl: result.surveyUrl,
              surveyType: "PRE_WORKSHOP",
            }).catch((err) => console.error("Pre-workshop survey email failed:", err));
          }
        })
        .catch((err) => console.error("Pre-workshop survey creation failed:", err));
    }

    const appUrl = getAppUrl();

    if (workshop.isFree) {
      const redirectUrl = await resolveRegistrationSuccessUrl({
        appUrl,
        workshopId: workshop.id,
        key: { kind: "free", registrationId: registration.id },
      });

      if (!isJsonResponse) {
        return NextResponse.redirect(redirectUrl, { status: 303, headers: rateLimit.headers });
      }

      return NextResponse.json(
        { success: true, data: registration, redirectUrl },
        { status: 201, headers: rateLimit.headers }
      );
    }

    const priceCents = workshop.priceCents || 0;
    if (priceCents <= 0) {
      return jsonError("Workshop pricing is not configured", 400, rateLimit.headers);
    }

    const successUrl = await resolveRegistrationSuccessUrl({
      appUrl,
      workshopId: workshop.id,
      key: { kind: "paid", stripeSessionToken: "{CHECKOUT_SESSION_ID}" },
    });

    const session = await createCheckoutSession({
      workshopId: workshop.id,
      workshopTitle: workshop.title,
      priceCents,
      registrationId: registration.id,
      customerEmail: registration.email,
      discountCode,
      allowedPromotionCodeIds: parseStoredWorkshopCoupons(workshop.coupons)
        .map((coupon) => coupon.stripePromotionCodeId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
      successUrl,
      cancelUrl: workshop.landingPageSlug
        ? `${appUrl}/workshop/${workshop.landingPageSlug}?cancelled=true`
        : `${appUrl}/`,
    });

    // Persist checkout session after registration creation.
    await db.registration.update({ where: { id: registration.id }, data: { stripeSessionId: session.id } });

    if (!session.url) {
      return jsonError("Failed to initialize payment session", 500, rateLimit.headers);
    }

    if (!isJsonResponse) {
      return NextResponse.redirect(session.url, { status: 303, headers: rateLimit.headers });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          registrationId: registration.id,
          checkoutUrl: session.url,
          sessionId: session.id,
        },
      },
      { status: 201, headers: rateLimit.headers }
    );
  } catch (error) {
    if (error instanceof StripeDiscountCodeError) {
      return jsonError(error.message, 400, rateLimit.headers);
    }

    if (error instanceof RegistrationServiceError) {
      return jsonError(error.message, error.status, rateLimit.headers);
    }

    console.error("Error registering attendee:", error);
    return jsonError("Failed to register attendee", 500, rateLimit.headers);
  }
}
