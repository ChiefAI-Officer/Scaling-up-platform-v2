// src/src/lib/assessments/custom-slides.ts
//
// Wave M — Custom Slides (#19) core data model + pure page-merge logic.
//
// A coach authors branded interstitial slides on a campaign. Participants see
// them as non-question pages woven into the existing Section pager. Slides are
// campaign-scoped, sanitized-HTML, static (no per-recipient interpolation), and
// never counted in "Section N of M".
//
// Authoritative spec: docs/specs/v7.6/18m-wave-m-custom-slides-design.md (§3, §4,
// "grill-me hardening" §10.5) + docs/specs/v7.6/18mn-wave-mn-implementation-plan.md
// (items 4, 5, 6).
//
// This module is PURE and SERVER/CLIENT-agnostic:
//   - `CustomSlideSchema` / `CustomSlidesArraySchema` validate the persisted shape
//     (raw `html`, write-time caps) — sanitization happens server-side elsewhere.
//   - `mergeCustomSlides()` weaves ALREADY-sanitized slides (`safeHtml`) into the
//     section-page array. It trusts that its input was sanitized server-side; it
//     does no sanitization itself (R1-Med-2: the client renderer stays dumb).
//
// IMPORTANT: this file imports `SectionPage` from `./section-pages` but does NOT
// modify that module (the pager-union extension is a separate task).

import { z } from "zod";
import type { SectionPage } from "./section-pages";

// ─────────────────────────────────────────────────────────────────────────────
// Caps (spec §3 / §7 / plan item 4)
// ─────────────────────────────────────────────────────────────────────────────

/** Max number of slides allowed on a single campaign. */
export const MAX_SLIDES_PER_CAMPAIGN = 10;
/** Max title length (plain text). */
export const MAX_SLIDE_TITLE_LENGTH = 200;
/**
 * Per-slide HTML byte cap. The authoritative cap (20480 bytes / 20 KB) is applied
 * POST-sanitization server-side. We validate the RAW html here as an upper bound
 * too, so an oversized body can never even be persisted.
 */
export const MAX_SLIDE_HTML_BYTES = 20480;

/**
 * A "cuid-ish" id: collision-resistant id as produced by cuid/cuid2/createId.
 * We do not hard-pin to a single library's exact format (Zod 4's `z.cuid()` is
 * cuid-v1-only); instead we accept the common shape — a lowercase
 * alphanumeric token of reasonable length. This keeps the schema self-contained
 * and version-stable while still rejecting empty / garbage / oversized ids.
 */
const CUID_ISH = /^[a-z0-9][a-z0-9_-]{7,63}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Position model (spec §3, anchored by stableKey — ADR-0001, never index)
// ─────────────────────────────────────────────────────────────────────────────

export const SlidePositionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("start") }),
  z.object({
    kind: z.literal("before-section"),
    sectionStableKey: z.string().min(1, "sectionStableKey is required"),
  }),
  z.object({ kind: z.literal("end") }),
]);

export type SlidePosition = z.infer<typeof SlidePositionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// CustomSlide (persisted shape — raw, pre-sanitization html)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UTF-8 byte length of a string (a `<` char is 1 byte; multibyte chars cost more).
 *
 * Implemented directly over code points rather than via `TextEncoder`/`Buffer` so
 * the module is dependency-free and works identically in Node, the browser, and the
 * jsdom test sandbox (which does not expose a global `TextEncoder`).
 */
function byteLength(s: string): number {
  let bytes = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x7f) bytes += 1;
    else if (cp <= 0x7ff) bytes += 2;
    else if (cp <= 0xffff) bytes += 3;
    else bytes += 4; // astral (surrogate pair) — counted once by for…of
  }
  return bytes;
}

export const CustomSlideSchema = z.object({
  id: z.string().regex(CUID_ISH, "id must be a cuid-like token"),
  title: z.string().max(MAX_SLIDE_TITLE_LENGTH, "title too long").optional(),
  html: z
    .string()
    .refine(
      (h) => byteLength(h) <= MAX_SLIDE_HTML_BYTES,
      `html exceeds ${MAX_SLIDE_HTML_BYTES} bytes`,
    ),
  position: SlidePositionSchema,
  sortOrder: z.number().int("sortOrder must be an integer"),
});

export type CustomSlide = z.infer<typeof CustomSlideSchema>;

/** The full persisted array: caps at MAX_SLIDES_PER_CAMPAIGN. */
export const CustomSlidesArraySchema = z
  .array(CustomSlideSchema)
  .max(MAX_SLIDES_PER_CAMPAIGN, `at most ${MAX_SLIDES_PER_CAMPAIGN} slides`);

export type CustomSlides = z.infer<typeof CustomSlidesArraySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Merged pager page union (spec §4 / plan item 6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A slide as it reaches the pure merge fn: html is ALREADY sanitized
 * server-side (`safeHtml`). The merge fn trusts this; it does NOT sanitize.
 */
export interface SafeSlide {
  id: string;
  title?: string;
  safeHtml: string;
  position: SlidePosition;
  sortOrder: number;
}

export type PagerPage =
  | ({ kind: "section" } & SectionPage)
  | { kind: "slide"; id: string; title?: string; safeHtml: string };

/** Result of mergeCustomSlides — `droppedSlideIds` surfaces slides whose anchor matched no section. */
export interface MergeResult {
  pages: PagerPage[];
  /** ids of slides dropped because their `before-section` anchor matched no section page (fail-safe). */
  droppedSlideIds: string[];
}

/** A slide carries no real content if it has neither a title nor non-empty safe HTML. */
function isEmptySlide(s: SafeSlide): boolean {
  const hasTitle = typeof s.title === "string" && s.title.trim().length > 0;
  const hasHtml = s.safeHtml.trim().length > 0;
  return !hasTitle && !hasHtml;
}

function toSlidePage(s: SafeSlide): PagerPage {
  return { kind: "slide", id: s.id, title: s.title, safeHtml: s.safeHtml };
}

/**
 * PURE. Weave already-sanitized custom slides into the section-page array.
 *
 * Rules (spec §4 + GM-5):
 *  - Each SectionPage is wrapped as `{ kind: "section", ...page }`, order preserved.
 *  - `start` slides are inserted before the first section page.
 *  - `before-section:<stableKey>` slides are inserted immediately before the
 *    matching section page (matched by SectionPage.stableKey).
 *  - `end` slides are appended at the very tail — AFTER the auto-appended
 *    orphan "Other" page (`isOther`), so the "Other" page stays the last
 *    QUESTION page and the trailing `end` slide is the final page before submit.
 *  - Within the same anchor, slides are ordered by `sortOrder` (stable; ties keep
 *    input order).
 *  - A `before-section` slide whose `sectionStableKey` matches no section page is
 *    DROPPED (not thrown) and its id is returned in `droppedSlideIds`.
 *  - A slide with no title AND empty safeHtml is SKIPPED (not counted as dropped).
 *  - Empty slides array ⇒ section pages wrapped, unchanged order, no drops.
 *
 * This fn does not mutate its inputs.
 */
export function mergeCustomSlides(
  sectionPages: SectionPage[],
  slides: SafeSlide[],
): MergeResult {
  const droppedSlideIds: string[] = [];

  // Wrap section pages first; this is the no-slides result.
  const wrapped: PagerPage[] = sectionPages.map((page) => ({ kind: "section", ...page }));

  if (slides.length === 0) {
    return { pages: wrapped, droppedSlideIds };
  }

  // Stable sort by sortOrder (Array.prototype.sort is stable in modern engines,
  // but make ties deterministic on input order via index decoration to be safe).
  const ordered = slides
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.sortOrder - b.s.sortOrder || a.i - b.i)
    .map(({ s }) => s);

  // Known section stableKeys (excludes the "Other" orphan, which has no
  // user-authored stableKey a coach can anchor to).
  const knownSectionKeys = new Set(
    sectionPages.filter((p) => !p.isOther).map((p) => p.stableKey),
  );

  const startSlides: SafeSlide[] = [];
  const endSlides: SafeSlide[] = [];
  const beforeBySection = new Map<string, SafeSlide[]>();

  for (const slide of ordered) {
    if (isEmptySlide(slide)) continue; // skip empties (not a "drop")

    const pos = slide.position;
    if (pos.kind === "start") {
      startSlides.push(slide);
    } else if (pos.kind === "end") {
      endSlides.push(slide);
    } else {
      // before-section
      if (!knownSectionKeys.has(pos.sectionStableKey)) {
        droppedSlideIds.push(slide.id); // fail-safe: unknown anchor ⇒ drop + surface
        continue;
      }
      const arr = beforeBySection.get(pos.sectionStableKey) ?? [];
      arr.push(slide);
      beforeBySection.set(pos.sectionStableKey, arr);
    }
  }

  const pages: PagerPage[] = [];

  // `start` slides lead the pager (before any section page).
  for (const s of startSlides) pages.push(toSlidePage(s));

  // Section pages, each optionally preceded by its `before-section` slides.
  // The "Other" orphan page is a section-shaped page (kind:"section") but has no
  // anchorable stableKey, so it never gets `before-section` slides.
  for (const page of sectionPages) {
    if (!page.isOther) {
      const before = beforeBySection.get(page.stableKey);
      if (before) for (const s of before) pages.push(toSlidePage(s));
    }
    pages.push({ kind: "section", ...page });
  }

  // `end` slides at the very tail — AFTER the "Other" orphan page (GM-5).
  for (const s of endSlides) pages.push(toSlidePage(s));

  return { pages, droppedSlideIds };
}
