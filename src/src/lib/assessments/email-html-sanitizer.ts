/**
 * Coach-safe email HTML sanitizer + invitationUrl token-placement validator.
 *
 * SECURITY CONTEXT (SEC-H1, R1-H4): this is the security gate for #20 — a
 * per-campaign FULL-HTML invitation email body that a COACH pastes. Coaches sit
 * BELOW admins in the trust model, so this deliberately does NOT reuse the more
 * permissive Wave-B admin sanitizer (`lib/templates/sanitize-custom-html.ts`,
 * which keeps <style>/<iframe> and passes inline styles through un-allowlisted).
 * Here we use a STRICT sanitize-html config with an inline-style property
 * allowlist (which drops url()/expression()/@import for free) and a tight
 * image-src policy.
 *
 * Uses sanitize-html (pure JS, no DOM dependency) + htmlparser2 (a sanitize-html
 * dependency) for the placement validator. jsdom-backed sanitizers (DOMPurify)
 * break Vercel's CJS runtime — see the Wave-B note in sanitize-custom-html.ts.
 */
import sanitizeHtml from "sanitize-html";
import { Parser } from "htmlparser2";

// ──────────────────────────────────────────────────────────────────────────
// Token names (Wave A invitation-email.ts). normKey() there lowercases +
// strips underscores, so all four of these resolve to the single-use survey
// URL `/org-survey/{alias}#t=<token>`. The validator must recognize every
// spelling a coach might paste.
// ──────────────────────────────────────────────────────────────────────────
/**
 * Max RAW invitation-HTML length accepted on save (#20). Reuses the Wave-B
 * "cap the stored bytes" concept (post-interpolation the body grows when the
 * URL token expands to a full https URL, but 50KB leaves ample headroom for a
 * rich email while bounding sanitize/DB cost). Save rejects over this.
 */
export const MAX_INVITATION_HTML_LENGTH = 50_000;

export const INVITATION_URL_TOKENS = [
  "invitationUrl",
  "invitation_url",
  "assessmentUrl",
  "assessment_url",
] as const;

// Normalized stems (lowercase, underscores stripped) — matches Wave A normKey().
const URL_TOKEN_STEMS = new Set(["invitationurl", "assessmenturl"]);

// Matches a single {{token}} occurrence (lax inner whitespace), capturing the
// inner name. Used PRE-interpolation to find every token in the coach's raw HTML.
const TOKEN_GLOBAL_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function isUrlTokenName(raw: string): boolean {
  return URL_TOKEN_STEMS.has(raw.toLowerCase().replace(/_/g, ""));
}

/** Count of URL-token occurrences anywhere in `s`. */
function countUrlTokens(s: string): number {
  let count = 0;
  for (const m of s.matchAll(TOKEN_GLOBAL_RE)) {
    if (isUrlTokenName(m[1])) count += 1;
  }
  return count;
}

/** True if `s` contains at least one URL token. */
function containsUrlToken(s: string): boolean {
  return countUrlTokens(s) > 0;
}

/** True if `s` is EXACTLY a single URL token (after trim), nothing around it. */
function isWholeUrlToken(s: string): boolean {
  const m = /^\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}$/.exec(s.trim());
  return m !== null && isUrlTokenName(m[1]);
}

// ──────────────────────────────────────────────────────────────────────────
// sanitizeEmailHtml — STRICT post-interpolation sanitizer.
//
// Runs AFTER token interpolation (tokens already replaced with the real https
// URL), so this is a plain strict sanitizer — no token-awareness needed.
// ──────────────────────────────────────────────────────────────────────────

const ALLOWED_TAGS = [
  "p", "br", "a", "strong", "em", "b", "i", "u", "span", "div",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "td", "th",
  "img", "hr", "blockquote",
];
// Everything else — script, iframe, style, form, input, button, object, embed,
// link, meta, base, svg, noscript — is dropped by omission (discard mode).

const LAYOUT_ATTRS = ["style", "width", "height", "align", "valign", "bgcolor"];
const CELL_ATTRS = [...LAYOUT_ATTRS, "colspan", "rowspan"];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  // href whole-value only; NO token-awareness (interpolation already happened).
  a: ["href", "title", "target", "rel", "style"],
  // image-src policy enforced via allowedSchemesByTag below.
  img: ["src", "alt", "width", "height", "style"],
  table: [...LAYOUT_ATTRS, "cellpadding", "cellspacing", "border"],
  thead: LAYOUT_ATTRS,
  tbody: LAYOUT_ATTRS,
  tr: LAYOUT_ATTRS,
  td: CELL_ATTRS,
  th: [...CELL_ATTRS, "scope"],
  div: LAYOUT_ATTRS,
  span: LAYOUT_ATTRS,
  p: LAYOUT_ATTRS,
  h1: LAYOUT_ATTRS,
  h2: LAYOUT_ATTRS,
  h3: LAYOUT_ATTRS,
  h4: LAYOUT_ATTRS,
  ul: LAYOUT_ATTRS,
  ol: LAYOUT_ATTRS,
  li: LAYOUT_ATTRS,
  blockquote: LAYOUT_ATTRS,
  hr: ["style", "width", "align"],
  // NO `on*` handlers anywhere — dropped by omission.
};

// Inline-style property allowlist. sanitize-html validates each value against
// its regex and DROPS the declaration on a miss — which removes url(),
// expression(), @import, and behavior: for free (none match these regexes).
const HEX = "#(?:[0-9a-f]{3}|[0-9a-f]{6})";
const RGB = "rgba?\\([\\d.,\\s%]+\\)";
const NAMED = "[a-z\\- ]+"; // named colors / keywords like 'center', 'solid'
const LEN = "-?\\d+(?:\\.\\d+)?(?:px|pt|em|rem|%|ex|ch|vw|vh)?";
const colorVal = new RegExp(`^(?:${HEX}|${RGB}|${NAMED})$`, "i");
const lenVal = new RegExp(`^${LEN}$`, "i");
// Compound shorthands (margin/padding: "10px 5px", border: "1px solid #000").
const compoundVal = new RegExp(
  `^(?:${LEN}|${HEX}|${RGB}|solid|dashed|dotted|double|none|[a-z]+)(?:\\s+(?:${LEN}|${HEX}|${RGB}|solid|dashed|dotted|double|none|[a-z]+))*$`,
  "i",
);
const alignVal = /^(?:left|right|center|justify)$/i;
const fontFamilyVal = /^[a-z0-9\-,'"\s]+$/i;
const fontWeightVal = /^(?:normal|bold|lighter|bolder|[1-9]00)$/i;
const fontStyleVal = /^(?:normal|italic|oblique)$/i;

const ALLOWED_STYLES = {
  "*": {
    color: [colorVal],
    "background-color": [colorVal],
    "font-family": [fontFamilyVal],
    "font-size": [lenVal],
    "font-weight": [fontWeightVal],
    "font-style": [fontStyleVal],
    "text-align": [alignVal],
    "text-decoration": [/^(?:none|underline|line-through|overline)$/i],
    "line-height": [/^(?:normal|[\d.]+(?:px|pt|em|rem|%)?)$/i],
    padding: [compoundVal],
    "padding-top": [lenVal],
    "padding-right": [lenVal],
    "padding-bottom": [lenVal],
    "padding-left": [lenVal],
    margin: [compoundVal],
    "margin-top": [lenVal],
    "margin-right": [lenVal],
    "margin-bottom": [lenVal],
    "margin-left": [lenVal],
    border: [compoundVal],
    "border-top": [compoundVal],
    "border-right": [compoundVal],
    "border-bottom": [compoundVal],
    "border-left": [compoundVal],
    "border-radius": [lenVal],
    "border-color": [colorVal],
    width: [lenVal],
    height: [lenVal],
    "max-width": [lenVal],
  },
};

export function sanitizeEmailHtml(raw: string): string {
  if (!raw) return "";
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    // href/link policy: http(s) + mailto only. (javascript:/data: dropped.)
    allowedSchemes: ["http", "https", "mailto"],
    // IMAGE-SRC POLICY: inline logo (cid:) + remote https only.
    //  - cid:   inline CID logo attachment (our branded shell).
    //  - https: remote images are a NORMAL, expected email feature for a
    //           semi-trusted coach. The tradeoff is a remote-image load is a
    //           tracking-pixel vector — accepted for a coach (vs. admin) here;
    //           data:/http:/javascript: are stripped (XSS + downgrade vectors).
    allowedSchemesByTag: { img: ["cid", "https"], a: ["http", "https", "mailto"] },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    // No protocol-relative ("//evil.com") — would inherit page scheme.
    allowProtocolRelative: false,
    // Inline-style property allowlist (drops url()/expression()/@import).
    allowedStyles: ALLOWED_STYLES,
    parseStyleAttributes: true,
    // Default discard mode drops the disallowed TAG; dangerous-container
    // content (script/style/...) is dropped wholesale via nonTextTags below.
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "noscript"],
    // Comments are stripped by default (no allowedComments / no passthrough).
  });
}

// ──────────────────────────────────────────────────────────────────────────
// validateInvitationHtml — token PLACEMENT validator on RAW (pre-interp) html.
//
// Walks the raw HTML with htmlparser2 (robust node context, not a fragile
// regex). A URL token is ONLY allowed as:
//   (a) a text node, or
//   (b) the ENTIRE value of an <a href> (e.g. href="{{invitationUrl}}").
// Anywhere else (other attrs, src/srcset, css/style, comments, query strings,
// concatenated with other chars) is rejected. Requires ≥1 URL token (R1-M8).
// ──────────────────────────────────────────────────────────────────────────

type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateInvitationHtml(raw: string): ValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "Invitation HTML must be a string." };
  }

  // Total URL-token occurrences in the raw source (ground truth).
  const totalUrlTokens = countUrlTokens(raw);
  if (totalUrlTokens === 0) {
    return {
      ok: false,
      reason:
        "The invitation HTML must include the survey link token (e.g. {{invitationUrl}}) — either as a link href or as plain text.",
    };
  }

  let validHrefTokens = 0;
  let textTokens = 0;
  let rejection: string | null = null;

  const fail = (reason: string) => {
    if (!rejection) rejection = reason;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        for (const [attrName, attrValue] of Object.entries(attribs)) {
          if (!containsUrlToken(attrValue)) continue;
          const lower = attrName.toLowerCase();
          if (name === "a" && lower === "href") {
            // Allowed ONLY if the whole attr value is exactly the token.
            if (isWholeUrlToken(attrValue)) {
              validHrefTokens += countUrlTokens(attrValue);
            } else {
              fail(
                `The survey link token must be the entire href value (href="{{invitationUrl}}"), not combined with other text in "${attrName}".`,
              );
            }
          } else {
            // Any other attribute (src, srcset, title, style, form action, …).
            fail(
              `The survey link token may not appear in the "${attrName}" attribute of <${name}>. Use it as a link href or as plain text.`,
            );
          }
        }
      },
      ontext(text) {
        if (containsUrlToken(text)) {
          textTokens += countUrlTokens(text);
        }
      },
      oncomment(data) {
        if (containsUrlToken(data)) {
          fail("The survey link token may not appear inside an HTML comment.");
        }
      },
    },
    { decodeEntities: true, recognizeCDATA: false },
  );

  parser.write(raw);
  parser.end();

  if (rejection) {
    return { ok: false, reason: rejection };
  }

  // Defensive catch-all: every raw URL-token occurrence must have been
  // accounted for as either a whole-href token or a text-node token. If the
  // parser surfaced fewer than the raw count, a token landed somewhere the
  // walk did not classify (malformed markup) — reject rather than pass.
  const accounted = validHrefTokens + textTokens;
  if (accounted < totalUrlTokens) {
    return {
      ok: false,
      reason:
        "The survey link token appears in an unexpected position. Use it as a link href or as plain text only.",
    };
  }

  return { ok: true };
}
