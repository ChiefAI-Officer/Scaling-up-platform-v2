// src/src/lib/assessments/custom-slides-write.ts
//
// Wave M — Custom Slides (#19) WRITE-PATH server helper.
//
// Shared validation + sanitization logic for the campaign create (POST) and
// edit (PATCH) routes. Keeps the two route handlers thin and identical in
// their slide-handling semantics.
//
// Pipeline (claudex-hardened, plan items 8/9):
//   1. shape-validate the raw array with `CustomSlidesArraySchema`
//      (custom-slides.ts caps: ≤10 slides, ≤20 KB RAW html/slide, title cap)
//   2. anchor-validate (R2-High-1): every `before-section` slide's
//      `sectionStableKey` MUST match a section in the campaign's resolved
//      pinned version — an unknown anchor is a 400 on save (render-time drop is
//      reserved for legacy corruption only)
//   3. reject empty slides (no title AND empty sanitized html) — GM-5
//   4. sanitize EACH `html` server-side with `sanitizeSlideHtml`
//      (slide-sanitizer.ts) and enforce the POST-sanitization 20 KB cap
//
// The persisted shape stores the SANITIZED html (sanitize-on-save), so the
// bytes at rest are already safe; the survey loaders re-sanitize on render as
// defense-in-depth (out of scope for this module).
//
// SERVER-only (imports the server-only sanitizer). Pure + never touches the DB.

import {
  CustomSlidesArraySchema,
  MAX_SLIDE_HTML_BYTES,
  type CustomSlide,
} from "./custom-slides";
import { sanitizeSlideHtml } from "./slide-sanitizer";

/** UTF-8 byte length (a `<` is 1 byte; multibyte chars cost more). */
function byteLength(s: string): number {
  let bytes = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x7f) bytes += 1;
    else if (cp <= 0x7ff) bytes += 2;
    else if (cp <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * Defensively extract the set of section `stableKey`s from a version's
 * `sections` JSON (Prisma `Json` ⇒ `unknown`). Over-permissive parse (drops
 * malformed rows) is acceptable here — an authored anchor that matches no
 * surviving key is rejected, which is the safe direction.
 */
export function sectionStableKeysOf(sectionsJson: unknown): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(sectionsJson)) return keys;
  for (const s of sectionsJson) {
    if (
      s &&
      typeof s === "object" &&
      typeof (s as { stableKey?: unknown }).stableKey === "string"
    ) {
      const k = (s as { stableKey: string }).stableKey.trim();
      if (k.length > 0) keys.add(k);
    }
  }
  return keys;
}

/** The persisted slide shape — html is the SANITIZED body (sanitize-on-save). */
export interface PersistedSlide {
  id: string;
  title?: string;
  html: string;
  position: CustomSlide["position"];
  sortOrder: number;
}

export type PrepareSlidesResult =
  | { ok: true; slides: PersistedSlide[]; strippedAny: boolean }
  | { ok: false; status: 400; error: string };

/**
 * Validate + anchor-check + sanitize a raw `customSlides` payload for persistence.
 *
 * @param rawValue   the untrusted `customSlides` field straight off the request body
 * @param knownSectionKeys  section stableKeys of the campaign's resolved pinned version
 *
 * On success returns the slides with each `html` already sanitized and capped.
 * On any failure returns `{ ok:false, status:400, error }`.
 */
export function prepareCustomSlidesForSave(
  rawValue: unknown,
  knownSectionKeys: Set<string>,
): PrepareSlidesResult {
  // 1. shape + caps (≤10 slides, ≤20 KB RAW html, title cap, cuid-ish id).
  const parsed = CustomSlidesArraySchema.safeParse(rawValue);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      status: 400,
      error: `Invalid customSlides: ${first?.message ?? "validation failed"}`,
    };
  }
  const slides = parsed.data;

  const out: PersistedSlide[] = [];
  let strippedAny = false;

  for (const slide of slides) {
    // 2. anchor-validate (R2-High-1): unknown before-section anchor ⇒ 400.
    if (
      slide.position.kind === "before-section" &&
      !knownSectionKeys.has(slide.position.sectionStableKey)
    ) {
      return {
        ok: false,
        status: 400,
        error: `Unknown section anchor "${slide.position.sectionStableKey}" — the slide points at a section that is not in this campaign's assessment version.`,
      };
    }

    // 4. sanitize-on-save.
    const { html: safeHtml, warnings } = sanitizeSlideHtml(slide.html ?? "");
    if (warnings.length > 0) strippedAny = true;

    // 3. reject empty slide (no title AND empty sanitized html) — GM-5.
    const hasTitle =
      typeof slide.title === "string" && slide.title.trim().length > 0;
    const hasHtml = safeHtml.trim().length > 0;
    if (!hasTitle && !hasHtml) {
      return {
        ok: false,
        status: 400,
        error: "A custom slide must have a title or non-empty content.",
      };
    }

    // post-sanitization byte cap (20 KB).
    if (byteLength(safeHtml) > MAX_SLIDE_HTML_BYTES) {
      return {
        ok: false,
        status: 400,
        error: `A custom slide's content exceeds the ${MAX_SLIDE_HTML_BYTES}-byte limit after sanitization.`,
      };
    }

    out.push({
      id: slide.id,
      title: slide.title,
      html: safeHtml,
      position: slide.position,
      sortOrder: slide.sortOrder,
    });
  }

  return { ok: true, slides: out, strippedAny };
}

/** sha256 hex of a string (for PII-free audit metadata — never the body). */
export function slideHtmlHash(html: string): string {
  // Lazy require keeps this module importable in the browser bundle (it is
  // server-only in practice, but avoids a hard top-level node:crypto import).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256").update(html, "utf8").digest("hex");
}

/**
 * PII-free audit metadata for a persisted slide set: slide count + per-slide
 * html hash/length + position kind (never the slide bodies).
 */
export function slidesAuditMeta(slides: PersistedSlide[]): {
  slideCount: number;
  slides: Array<{
    id: string;
    htmlSha: string;
    htmlLength: number;
    positionKind: CustomSlide["position"]["kind"];
  }>;
} {
  return {
    slideCount: slides.length,
    slides: slides.map((s) => ({
      id: s.id,
      htmlSha: slideHtmlHash(s.html),
      htmlLength: s.html.length,
      positionKind: s.position.kind,
    })),
  };
}
