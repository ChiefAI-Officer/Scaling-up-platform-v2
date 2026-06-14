// Using sanitize-html (pure JS, no DOM dependency). jsdom-backed sanitizers
// (DOMPurify + jsdom / isomorphic-dompurify) require @exodus/bytes via the
// jsdom transitive chain, which is ESM-only and breaks Vercel's CJS runtime
// at the route handler.
import sanitizeHtml from "sanitize-html";

export const FRAME_SRC_ALLOWLIST: RegExp[] = [
  /^https:\/\/js\.stripe\.com\//i,
  /^https:\/\/hooks\.stripe\.com\//i,
  /^https:\/\/player\.vimeo\.com\//i,
  /^https:\/\/(www\.)?youtube(-nocookie)?\.com\//i,
];

export type SanitizeOptions = {
  allowTokenUris?: boolean;
};

export type SanitizeResult = {
  sanitized: string;
  didStripContent: boolean;
  strippedTags: string[];
  strippedAttrs: string[];
};

const PARSER_DROPPED_TAGS = ["script", "noscript", "noembed", "noframes"];

// A complete {{token}} value (lax matches in href/src checks).
const TOKEN_RE = /^\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}$/;

const ALLOWED_TAGS_BASE = [
  ...sanitizeHtml.defaults.allowedTags,
  "img",
  "style",
  "iframe",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "nav",
  "aside",
  "figure",
  "figcaption",
];

const COMMON_ATTRS = ["style", "class", "id", "title", "lang", "dir", "data-*", "aria-*", "role"];

const ALLOWED_ATTRS: Record<string, string[]> = {
  ...sanitizeHtml.defaults.allowedAttributes,
  a: ["href", "name", "target", "rel", "title", "style", "class", "id"],
  img: ["src", "srcset", "alt", "title", "width", "height", "loading", "style", "class", "id"],
  iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "loading", "style", "class", "id", "title"],
  div: COMMON_ATTRS,
  span: COMMON_ATTRS,
  section: COMMON_ATTRS,
  article: COMMON_ATTRS,
  header: COMMON_ATTRS,
  footer: COMMON_ATTRS,
  main: COMMON_ATTRS,
  nav: COMMON_ATTRS,
  aside: COMMON_ATTRS,
  figure: COMMON_ATTRS,
  figcaption: COMMON_ATTRS,
  h1: COMMON_ATTRS,
  h2: COMMON_ATTRS,
  h3: COMMON_ATTRS,
  h4: COMMON_ATTRS,
  h5: COMMON_ATTRS,
  h6: COMMON_ATTRS,
  p: COMMON_ATTRS,
  ul: COMMON_ATTRS,
  ol: COMMON_ATTRS,
  li: COMMON_ATTRS,
  strong: COMMON_ATTRS,
  em: COMMON_ATTRS,
  b: COMMON_ATTRS,
  i: COMMON_ATTRS,
  u: COMMON_ATTRS,
  blockquote: COMMON_ATTRS,
  table: COMMON_ATTRS,
  thead: COMMON_ATTRS,
  tbody: COMMON_ATTRS,
  tr: COMMON_ATTRS,
  td: ["colspan", "rowspan", ...COMMON_ATTRS],
  th: ["colspan", "rowspan", "scope", ...COMMON_ATTRS],
  button: ["type", ...COMMON_ATTRS],
  // <style> tag content is preserved by sanitize-html via allowedTags + allowVulnerableTags
  style: [],
  "*": ["style", "class", "id"],
};

export function sanitizeCustomHtml(input: string, options: SanitizeOptions = {}): SanitizeResult {
  const { allowTokenUris = true } = options;
  const strippedTags: string[] = [];
  const strippedAttrs: string[] = [];

  if (input === "") {
    return { sanitized: "", didStripContent: false, strippedTags, strippedAttrs };
  }

  // Pre-scan for parser-dropped tags + stripped attrs to populate the audit
  // trail (sanitize-html silently drops these without a callback).
  for (const tag of PARSER_DROPPED_TAGS) {
    if (new RegExp(`<\\s*${tag}\\b`, "i").test(input)) {
      strippedTags.push(tag);
    }
  }
  const onAttrMatches = input.match(/\s+on[a-z]+\s*=/gi);
  if (onAttrMatches) {
    for (const match of onAttrMatches) {
      const name = match.match(/on[a-z]+/i)?.[0]?.toLowerCase();
      if (name && !strippedAttrs.includes(name)) {
        strippedAttrs.push(name);
      }
    }
  }
  if (/<iframe\b[^>]*\bsrcdoc\s*=/i.test(input)) {
    strippedAttrs.push("srcdoc");
  }

  const sanitized = sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS_BASE,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ["https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https", "data"] },
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    allowProtocolRelative: false,
    // Pass inline styles through without normalization (matches the prior
    // DOMPurify behavior; loses sanitize-html's per-property style allowlist).
    // Safe because save-time is admin-only and we don't allow url() or
    // expression() via the JS-injection vectors that DOMPurify guarded.
    // Q3 (Wave B): admin-trusted surface — inline-style/<style> CSS url()/@import are NOT scheme-validated. customHtml is admin/staff-only; revisit if it ever becomes coach-writable.
    parseStyleAttributes: false,
    // Suppress the <style>/<noscript>/<svg> XSS warning — we render only on
    // trusted admin templates after explicit save-time sanitization.
    allowVulnerableTags: true,
    transformTags: {
      iframe: (tagName: string, attribs: Record<string, string>) => {
        // srcdoc never allowed (covers FORBID_ATTR behavior); already in
        // pre-scan strippedAttrs if it was present in input.
        delete attribs.srcdoc;
        if (attribs.src) {
          const src = attribs.src.trim();
          const isToken = TOKEN_RE.test(src);
          if (isToken && allowTokenUris) {
            // lax mode: token URI survives the iframe-src host check
          } else {
            const allowed = FRAME_SRC_ALLOWLIST.some((re) => re.test(src));
            if (!allowed) {
              delete attribs.src;
              strippedAttrs.push("iframe-src(blocked-host)");
            }
          }
        }
        return { tagName, attribs };
      },
      a: (tagName: string, attribs: Record<string, string>) => {
        if (attribs.href !== undefined) {
          const href = attribs.href.trim();
          if (TOKEN_RE.test(href) && !allowTokenUris) {
            delete attribs.href;
            strippedAttrs.push("href");
          }
        }
        return { tagName, attribs };
      },
      img: (tagName: string, attribs: Record<string, string>) => {
        if (attribs.src !== undefined) {
          const src = attribs.src.trim();
          if (TOKEN_RE.test(src) && !allowTokenUris) {
            delete attribs.src;
            strippedAttrs.push("src");
          }
        }
        return { tagName, attribs };
      },
    },
  });

  return {
    sanitized,
    didStripContent: strippedTags.length > 0 || strippedAttrs.length > 0,
    strippedTags,
    strippedAttrs,
  };
}
