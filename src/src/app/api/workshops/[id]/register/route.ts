import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createCheckoutSession, StripeDiscountCodeError } from "@/services/stripe";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import {
  createWorkshopRegistration,
  RegistrationServiceError,
} from "@/lib/registration-service";
import { sendRegistrationNotification } from "@/services/notifications";
import {
  generateIcsContent,
  parseDurationHours,
  buildLocationString,
} from "@/lib/ics-generator";
import { createPreWorkshopSurvey, sendSurveyEmail } from "@/lib/survey-automation";

interface RegistrationInput {
  email: string;
  firstName: string;
  lastName: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  discountCode?: string;
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

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!isValidEmail) {
    return null;
  }

  return {
    email,
    firstName,
    lastName,
    company: normalizeOptionalString(payload.company),
    jobTitle: normalizeOptionalString(payload.jobTitle),
    phone: normalizeOptionalString(payload.phone),
    discountCode: normalizeOptionalString(payload.discountCode),
  };
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

  const { id: workshopId } = await params;
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
          // JV-18: Generate ICS calendar file for the registrant
          const icsContent = generateIcsContent({
            uid: workshop.id,
            title: workshop.title,
            description: workshop.description,
            eventDate: workshop.eventDate,
            eventTime: workshop.eventTime,
            timezone: workshop.timezone,
            durationHours: parseDurationHours(workshop.duration),
            location: buildLocationString(workshop),
            url: workshop.landingPageSlug
              ? `${process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app"}/workshop/${workshop.landingPageSlug}`
              : undefined,
            organizer: { name: `${coach.firstName} ${coach.lastName}`, email: coach.email },
          });

          const safeTitle = workshop.title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").substring(0, 50);

          sendRegistrationNotification({
            workshopTitle: workshop.title,
            workshopCode: workshop.workshopCode,
            coachEmail: coach.email,
            coachName: `${coach.firstName} ${coach.lastName}`,
            registrantName: `${registrationInput.firstName} ${registrationInput.lastName}`,
            registrantEmail: registrationInput.email,
            registrantCompany: registrationInput.company,
            icsAttachment: { filename: `${safeTitle}.ics`, content: icsContent },
          }).catch((err) => console.error("Registration notification failed:", err));
        }
      })
      .catch((err) => console.error("Coach lookup for notification failed:", err));

    // JV-13: Auto-create pre-workshop survey for this registration (fire-and-forget)
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

    const appUrl = process.env.APP_URL || "http://localhost:3000";

    if (workshop.isFree) {
      const redirectUrl = `${appUrl}/registration/success?id=${registration.id}`;

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

    const session = await createCheckoutSession({
      workshopId: workshop.id,
      workshopTitle: workshop.title,
      priceCents,
      registrationId: registration.id,
      customerEmail: registration.email,
      discountCode,
      successUrl: `${appUrl}/registration/success?session_id={CHECKOUT_SESSION_ID}`,
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
