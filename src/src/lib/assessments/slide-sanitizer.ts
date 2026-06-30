/**
 * Coach-authored, PARTICIPANT-facing "custom slide" HTML sanitizer (Wave M/N
 * item 5). Server-only + pure.
 *
 * SECURITY CONTEXT (18m §5/§7, ADR-0016): custom slides are written by COACHES
 * and rendered to PARTICIPANTS. Coaches sit BELOW admins in the trust model, so
 * this deliberately does NOT reuse the ADMIN-trusted Wave-B sanitizer
 * (`lib/templates/sanitize-custom-html.ts`, which keeps <style>/<iframe> and
 * passes inline styles through un-scheme-validated — its own line-~38 comment
 * flags inline url()/@import as bypassable). It also goes stricter than the
 * email sanitizer (`email-html-sanitizer.ts`): v1 allows NO coach CSS at all
 * (all <style> blocks AND all inline `style` attributes are dropped), because
 * an inline-style url()/@import allowlist is bypassable via CSS escapes.
 *
 * v1 policy:
 *   - DROP entirely: <script>, <style>, <iframe>, every on* handler, and ALL
 *     `style` attributes. Records a warning when something material is removed.
 *   - ALLOW: text-formatting tags (h1-h4, p, br, ul/ol/li, strong/em/b/i, a,
 *     blockquote, hr, span, div) + <img>.
 *   - <a href>: https / mailto / tel only.
 *   - <img src>: https + data: only, but data:image/svg+xml is BLOCKED (an SVG
 *     data-image can carry script). srcset is dropped (avoids un-validated
 *     candidate URLs). referrerpolicy is NOT forced here — that is a render-time
 *     concern, not a sanitization one.
 *   - Protocol-relative ("//evil.com") in href/src is blocked.
 *
 * Uses sanitize-html (pure JS, no DOM dependency) — jsdom-backed sanitizers
 * (DOMPurify) break Vercel's CJS runtime; see the Wave-B note in
 * sanitize-custom-html.ts.
 */
import sanitizeHtml from "sanitize-html";

export type SanitizeSlideResult = {
  html: string;
  warnings: string[];
};

// Text-formatting tags + <img>. Everything else (script, style, iframe, form,
// input, button, object, embed, link, meta, base, svg, table, …) is dropped by
// omission.
const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "a",
  "blockquote",
  "hr",
  "span",
  "div",
  "img",
];

// NO `style` attribute anywhere (v1 allows no coach CSS) and NO on* handlers
// (dropped by omission). srcset is intentionally NOT listed for <img>.
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "title", "target", "rel"],
  // `referrerpolicy` is force-set to "no-referrer" in transformTags (R2-Low-1:
  // external images are a coach-controlled tracking-pixel vector — never leak
  // the survey URL / participant referer). Allowed here so the transform's value
  // survives sanitization.
  img: ["src", "alt", "title", "width", "height", "referrerpolicy"],
};

// data:image/* but NOT data:image/svg+xml (case-insensitive, tolerant of
// whitespace between "data:" and the media type).
const DATA_IMAGE_RE = /^data:\s*image\//i;
const DATA_SVG_RE = /^data:\s*image\/svg\+xml/i;

/**
 * Pre-scan the RAW input for material content sanitize-html silently drops by
 * omission, so the caller can surface a "we removed X" warning. This is a
 * coarse lexical scan (it is allowed to over-report, never to under-report a
 * real strip); the actual neutralization is done by sanitize-html below.
 */
function collectWarnings(raw: string): string[] {
  const warnings: string[] = [];
  if (/<\s*script\b/i.test(raw)) warnings.push("removed <script>");
  if (/<\s*style\b/i.test(raw)) warnings.push("removed <style>");
  if (/<\s*iframe\b/i.test(raw)) warnings.push("removed <iframe>");
  if (/\son[a-z]+\s*=/i.test(raw)) warnings.push("removed event handler attributes (on*)");
  if (/\sstyle\s*=/i.test(raw)) warnings.push("removed inline styles");
  return warnings;
}

export function sanitizeSlideHtml(raw: string): SanitizeSlideResult {
  if (!raw) {
    return { html: "", warnings: [] };
  }

  const warnings = collectWarnings(raw);

  const html = sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    // <a href>: https/mailto/tel only.
    allowedSchemes: ["https", "mailto", "tel"],
    // <img src>: https + data: (data:image/svg+xml rejected in transformTags).
    allowedSchemesByTag: {
      a: ["https", "mailto", "tel"],
      img: ["https", "data"],
    },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    // No protocol-relative ("//evil.com") — it would inherit the page scheme.
    allowProtocolRelative: false,
    // Drop ALL inline styles (no per-property allowlist — v1 allows no CSS).
    // With no `style` in allowedAttributes this is belt-and-suspenders.
    allowedStyles: {},
    parseStyleAttributes: true,
    // Default discard mode drops the disallowed TAG; dangerous containers
    // (script/style/iframe) have their CONTENT dropped wholesale, not surfaced
    // as text, via nonTextTags.
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "iframe", "noscript", "textarea"],
    transformTags: {
      img: (tagName, attribs) => {
        // srcset is never allowed (each candidate URL would need the same
        // scheme validation; simplest + safest is to drop it).
        delete attribs.srcset;
        const src = (attribs.src ?? "").trim();
        if (src && DATA_IMAGE_RE.test(src) && DATA_SVG_RE.test(src)) {
          // data:image/svg+xml can carry <script>/onload — block it. Other
          // data:image/* (png/jpeg/gif/webp) survive the scheme allowlist.
          delete attribs.src;
        }
        // R2-Low-1: force `referrerpolicy="no-referrer"` on every slide <img>
        // so an external (https) image can't observe the survey URL / referer
        // as a tracking pixel. Overrides any coach-supplied value.
        attribs.referrerpolicy = "no-referrer";
        return { tagName, attribs };
      },
    },
    // Comments are stripped by default (no allowedComments / passthrough).
  });

  return { html, warnings };
}
