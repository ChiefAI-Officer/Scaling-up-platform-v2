/**
 * Shared enriched landing-page variable builder.
 *
 * Composes buildWorkshopVariables() with a REGISTRATION LandingPage slug lookup
 * to resolve {{registration_url}} and {{registrationUrl}} — the same enrichment
 * that auto-build-service.ts performs in its two-pass build.
 *
 * This function is read-only (no DB writes). It is consumed by:
 *   - The per-workshop customHtml PUT endpoint (Task 2)
 *   - The resolved-fallback endpoint (Task 3)
 *   - The clone re-interpolation path (Task 4)
 */

import { db } from "@/lib/db";
import { buildWorkshopVariables } from "@/lib/templates/template-interpolation";

/**
 * Returns the full variable map for a workshop's landing pages, including the
 * enriched `registration_url` and `registrationUrl` tokens resolved from the
 * workshop's REGISTRATION LandingPage slug.
 *
 * Mirrors the enrichment in auto-build-service.ts lines 244-252 exactly:
 *   - `registration_url`  = `${process.env.APP_URL}/workshop/<slug>`  (or "")
 *   - `registrationUrl`   = same value (camelCase alias)
 *
 * Returns `null` when the workshop does not exist (propagated from buildWorkshopVariables).
 */
export async function buildEnrichedLandingPageVariables(
  workshopId: string
): Promise<Record<string, string> | null> {
  // 1. Fetch the base variable map (covers all workshop fields).
  const variables = await buildWorkshopVariables(workshopId);
  if (variables === null) return null;

  // 2. Look up the existing REGISTRATION LandingPage slug.
  //    Uses the same composite key and select as auto-build-service.ts line 231-241.
  const existingReg = await db.landingPage.findUnique({
    where: {
      workshopId_template: {
        workshopId,
        template: "REGISTRATION",
      },
    },
    select: { slug: true },
  });

  const regPageSlug = existingReg?.slug ?? null;

  // 3. Build the absolute registration URL — or fall back to "".
  //    Matches auto-build-service.ts lines 245-247 exactly (process.env.APP_URL, no trim).
  const registrationUrl = regPageSlug
    ? `${process.env.APP_URL}/workshop/${regPageSlug}`
    : "";

  // 4. Return merged record with both snake_case and camelCase aliases.
  //    Matches auto-build-service.ts lines 248-252 exactly.
  return {
    ...variables,
    registration_url: registrationUrl,
    registrationUrl, // camelCase alias for templates that prefer that form
  };
}
