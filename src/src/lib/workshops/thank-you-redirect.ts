/**
 * BUG-MAY13-3 / Wave A Task A1: Post-registration redirect URL resolver.
 *
 * Resolves the success/thank-you URL for both free + paid registration flows.
 * If a PUBLISHED THANK_YOU LandingPage exists for the workshop, the helper
 * returns the per-workshop slug URL; otherwise it falls back to the generic
 * /registration/success page.
 *
 * The discriminated union prevents callers from passing both a free
 * `registrationId` and a paid `stripeSessionToken` at the same time.
 */

import { db } from "@/lib/db";

export type RedirectKey =
  | { kind: "free"; registrationId: string }
  | { kind: "paid"; stripeSessionToken: string };

export async function resolveRegistrationSuccessUrl(params: {
  appUrl: string;
  workshopId: string;
  key: RedirectKey;
}): Promise<string> {
  const { appUrl, workshopId, key } = params;

  const thankYouPage = await db.landingPage.findFirst({
    where: { workshopId, template: "THANK_YOU", status: "PUBLISHED" },
    select: { slug: true },
  });

  if (thankYouPage?.slug) {
    if (key.kind === "paid") {
      return `${appUrl}/workshop/${thankYouPage.slug}?session_id=${key.stripeSessionToken}`;
    }
    // Free path intentionally omits a query string (Codex review: do not pass regId).
    return `${appUrl}/workshop/${thankYouPage.slug}`;
  }

  // Safety-net fallback when no published THANK_YOU page exists.
  if (key.kind === "paid") {
    return `${appUrl}/registration/success?session_id=${key.stripeSessionToken}`;
  }
  return `${appUrl}/registration/success?id=${key.registrationId}`;
}

/**
 * Returns the public application URL, with a localhost fallback for dev.
 * Matches the pattern used in sibling routes (workshops/[id]/register, checkout)
 * so all THANK_YOU redirect call sites resolve URLs consistently.
 */
export function getAppUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}
