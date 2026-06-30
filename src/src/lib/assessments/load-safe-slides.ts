// src/src/lib/assessments/load-safe-slides.ts
//
// Wave M — SERVER-ONLY helper that turns a campaign's persisted `customSlides`
// JSON (a `CustomSlide[]` with RAW html) into the typed `SafeSlide[]` payload
// the client pager consumes (`safeHtml`, already sanitized).
//
// The render path is: server load → parse + sanitize HERE → serialize
// `SafeSlide[]` on the response → client `mergeCustomSlides(...)`. The client
// NEVER imports the sanitizer (R1-Med-2: the client renderer stays dumb; the
// sanitizer is server-only). This module is the single place both survey
// loaders call so the trust boundary is consistent.
//
// Authoritative spec: docs/specs/v7.6/18m-wave-m-custom-slides-design.md §4/§6/§7
// + docs/specs/v7.6/18mn-wave-mn-implementation-plan.md items 5, 6, 8.

import {
  CustomSlidesArraySchema,
  type SafeSlide,
} from "@/lib/assessments/custom-slides";
import { sanitizeSlideHtml } from "@/lib/assessments/slide-sanitizer";

/**
 * Parse + sanitize a campaign's persisted `customSlides` JSON into `SafeSlide[]`.
 *
 * - `raw` is the Prisma `Json?` value (null / array of `CustomSlide`).
 * - null / non-array / invalid-shape ⇒ `[]` (fail-safe: never throws, never
 *   leaks unsanitized html; a corrupt blob simply yields no slides).
 * - Each slide's `html` is sanitized SERVER-SIDE here → `safeHtml`.
 * - `position` + `sortOrder` pass through so the pure client `mergeCustomSlides`
 *   can weave + order them; `title` passes through (already length-capped on save).
 *
 * NOTE: this does NOT itself check the feature flag — the caller gates on
 * `isCustomSlidesEnabled(campaignId)` and only invokes this when on, so a
 * flag-off load omits `customSlides` from the payload entirely.
 */
export function loadSafeSlides(raw: unknown): SafeSlide[] {
  if (raw == null) return [];

  const parsed = CustomSlidesArraySchema.safeParse(raw);
  if (!parsed.success) {
    // Corrupt/legacy-shaped blob — fail safe to no slides rather than throwing
    // and dead-ending the survey load.
    return [];
  }

  return parsed.data.map((slide) => {
    const { html } = sanitizeSlideHtml(slide.html);
    return {
      id: slide.id,
      title: slide.title,
      safeHtml: html,
      position: slide.position,
      sortOrder: slide.sortOrder,
    } satisfies SafeSlide;
  });
}
