import createDOMPurify from "dompurify";

export const FRAME_SRC_ALLOWLIST: RegExp[] = [
  /^https:\/\/js\.stripe\.com\//i,
  /^https:\/\/hooks\.stripe\.com\//i,
  /^https:\/\/player\.vimeo\.com\//i,
  /^https:\/\/(www\.)?youtube(-nocookie)?\.com\//i,
];

export type SanitizeResult = {
  sanitized: string;
  didStripContent: boolean;
  strippedTags: string[];
  strippedAttrs: string[];
};

function getWindow(): Window {
  const existing = (globalThis as { window?: Window }).window;
  if (existing && typeof existing.document !== "undefined") {
    return existing;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JSDOM } = require("jsdom");
  return new JSDOM("").window as Window;
}

const PARSER_DROPPED_TAGS = ["script", "noscript", "noembed", "noframes"];

export function sanitizeCustomHtml(input: string): SanitizeResult {
  const strippedTags: string[] = [];
  const strippedAttrs: string[] = [];

  if (input === "") {
    return { sanitized: "", didStripContent: false, strippedTags, strippedAttrs };
  }

  // DOMParser drops <script>/<noscript> before DOMPurify hooks fire; pre-scan to surface them
  for (const tag of PARSER_DROPPED_TAGS) {
    const re = new RegExp(`<\\s*${tag}\\b`, "i");
    if (re.test(input)) {
      strippedTags.push(tag);
    }
  }

  // per-call instance — global hooks race under concurrent auto-build
  const win = getWindow();
  const DOMPurify = createDOMPurify(win as unknown as typeof globalThis & Window);

  DOMPurify.addHook("uponSanitizeElement", (_node, data) => {
    if (!data.allowedTags[data.tagName]) {
      strippedTags.push(data.tagName);
    }
  });

  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (!data.allowedAttributes[data.attrName]) {
      strippedAttrs.push(data.attrName);
    }
  });

  // CSP frame-src parity — iframes with disallowed hosts get src stripped
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    if (el.tagName === "IFRAME" && el.hasAttribute("src")) {
      const src = el.getAttribute("src") ?? "";
      const allowed = FRAME_SRC_ALLOWLIST.some((re) => re.test(src));
      if (!allowed) {
        el.removeAttribute("src");
        strippedAttrs.push("iframe-src(blocked-host)");
      }
    }
  });

  const sanitized = DOMPurify.sanitize(input, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "loading"],
    FORBID_ATTR: ["srcdoc"],
    ALLOWED_URI_REGEXP: /^(https:\/\/|mailto:|tel:|#|\/[^\/])/i,
    FORCE_BODY: true,
  }) as string;

  return {
    sanitized,
    didStripContent: strippedTags.length > 0 || strippedAttrs.length > 0,
    strippedTags,
    strippedAttrs,
  };
}
