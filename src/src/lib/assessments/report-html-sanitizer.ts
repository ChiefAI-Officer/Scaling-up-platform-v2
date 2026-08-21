import sanitizeHtml from "sanitize-html";

export const MAX_REPORT_HTML_FRAGMENT_LENGTH = 100_000;

export type SanitizeReportHtmlResult = {
  ok: boolean;
  html: string;
  didStripContent: boolean;
  issue?: string;
};

const ALLOWED_TAGS = [
  "section",
  "article",
  "header",
  "main",
  "aside",
  "div",
  "span",
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "blockquote",
  "pre",
  "code",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "small",
  "sup",
  "sub",
  "figure",
  "figcaption",
  "table",
  "caption",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "colgroup",
  "col",
  "a",
  "img",
];

const COMMON_ATTRIBUTES = [
  "class",
  "id",
  "title",
  "lang",
  "dir",
  "role",
  "style",
  "aria-*",
  "data-*",
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  "*": COMMON_ATTRIBUTES,
  a: ["href", "name", "target", "rel", ...COMMON_ATTRIBUTES],
  img: [
    "src",
    "alt",
    "title",
    "width",
    "height",
    "loading",
    "referrerpolicy",
    ...COMMON_ATTRIBUTES,
  ],
  table: ["summary", ...COMMON_ATTRIBUTES],
  th: ["colspan", "rowspan", "scope", ...COMMON_ATTRIBUTES],
  td: ["colspan", "rowspan", "headers", ...COMMON_ATTRIBUTES],
  col: ["span", ...COMMON_ATTRIBUTES],
};

const LENGTH = "(?:0|-?\\d+(?:\\.\\d+)?(?:px|pt|em|rem|%|ex|ch|vw|vh))";
const HEX_COLOR = "#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})";
const RGB_COLOR = "rgba?\\(\\s*\\d+(?:\\.\\d+)?%?\\s*,\\s*\\d+(?:\\.\\d+)?%?\\s*,\\s*\\d+(?:\\.\\d+)?%?(?:\\s*,\\s*(?:0|1|0?\\.\\d+))?\\s*\\)";
const NAMED_COLOR = "[a-z]+";
const COLOR = `(?:${HEX_COLOR}|${RGB_COLOR}|${NAMED_COLOR})`;

const lengthValue = new RegExp(`^${LENGTH}$`, "i");
const colorValue = new RegExp(`^${COLOR}$`, "i");
const spacingValue = new RegExp(`^${LENGTH}(?:\\s+${LENGTH}){0,3}$`, "i");
const borderValue = new RegExp(
  `^(?:${LENGTH}|thin|medium|thick)\\s+(?:none|solid|dashed|dotted|double)\\s+${COLOR}$`,
  "i",
);
const fontFamilyValue = /^[a-z0-9 ,'"-]+$/i;

const ALLOWED_STYLES = {
  "*": {
    color: [colorValue],
    "background-color": [colorValue],
    "font-family": [fontFamilyValue],
    "font-size": [lengthValue],
    "font-weight": [/^(?:normal|bold|lighter|bolder|[1-9]00)$/i],
    "font-style": [/^(?:normal|italic|oblique)$/i],
    "line-height": [new RegExp(`^(?:normal|${LENGTH}|\\d+(?:\\.\\d+)?)$`, "i")],
    "letter-spacing": [new RegExp(`^(?:normal|${LENGTH})$`, "i")],
    "text-align": [/^(?:left|right|center|justify|start|end)$/i],
    "text-decoration": [/^(?:none|underline|line-through|overline)$/i],
    "text-transform": [/^(?:none|uppercase|lowercase|capitalize)$/i],
    "white-space": [/^(?:normal|nowrap|pre|pre-wrap|pre-line)$/i],
    display: [/^(?:block|inline|inline-block|flex|grid|none)$/i],
    "align-items": [/^(?:stretch|start|end|center|baseline)$/i],
    "justify-content": [
      /^(?:start|end|center|space-between|space-around|space-evenly)$/i,
    ],
    gap: [spacingValue],
    padding: [spacingValue],
    "padding-top": [lengthValue],
    "padding-right": [lengthValue],
    "padding-bottom": [lengthValue],
    "padding-left": [lengthValue],
    margin: [spacingValue],
    "margin-top": [lengthValue],
    "margin-right": [lengthValue],
    "margin-bottom": [lengthValue],
    "margin-left": [lengthValue],
    border: [borderValue],
    "border-top": [borderValue],
    "border-right": [borderValue],
    "border-bottom": [borderValue],
    "border-left": [borderValue],
    "border-color": [colorValue],
    "border-radius": [spacingValue],
    width: [lengthValue],
    height: [lengthValue],
    "min-width": [lengthValue],
    "max-width": [lengthValue],
    "min-height": [lengthValue],
    "max-height": [lengthValue],
    "object-fit": [/^(?:contain|cover|fill|none|scale-down)$/i],
  },
};

const DATA_IMAGE = /^data:\s*image\//i;
const DATA_SVG = /^data:\s*image\/svg\+xml/i;
const OBSCURED_OR_FETCH_CAPABLE_CSS =
  /\/\*|\*\/|\\|url\s*\(|expression\s*\(|@import|javascript\s*:/i;

function removeObscuredCss(attributes: Record<string, string>): void {
  const style = attributes.style;
  if (!style) return;

  const declarations = style
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(
      (declaration) =>
        declaration.length > 0 &&
        !OBSCURED_OR_FETCH_CAPABLE_CSS.test(declaration),
    );

  if (declarations.length === 0) delete attributes.style;
  else attributes.style = declarations.join(";");
}

export function sanitizeReportHtmlFragment(
  raw: string,
): SanitizeReportHtmlResult {
  if (raw.length > MAX_REPORT_HTML_FRAGMENT_LENGTH) {
    return {
      ok: false,
      html: "",
      didStripContent: false,
      issue: `Report HTML must be ${MAX_REPORT_HTML_FRAGMENT_LENGTH.toLocaleString()} characters or fewer.`,
    };
  }

  const html = sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["https", "mailto", "tel"],
    allowedSchemesByTag: {
      a: ["https", "mailto", "tel"],
      img: ["https", "data"],
    },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    allowedStyles: ALLOWED_STYLES,
    parseStyleAttributes: true,
    disallowedTagsMode: "discard",
    nonTextTags: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "svg",
      "math",
      "form",
      "button",
      "input",
      "select",
      "option",
      "textarea",
      "noscript",
    ],
    transformTags: {
      "*": (tagName, attributes) => {
        removeObscuredCss(attributes);
        return { tagName, attribs: attributes };
      },
      a: (tagName, attributes) => {
        removeObscuredCss(attributes);
        if (attributes.target === "_blank") {
          attributes.rel = "noopener noreferrer";
        }
        return { tagName, attribs: attributes };
      },
      img: (tagName, attributes) => {
        removeObscuredCss(attributes);
        const src = (attributes.src ?? "").trim();
        if (src && DATA_IMAGE.test(src) && DATA_SVG.test(src)) {
          delete attributes.src;
        }
        attributes.referrerpolicy = "no-referrer";
        return { tagName, attribs: attributes };
      },
    },
  });

  return {
    ok: true,
    html,
    didStripContent: html !== raw.trim(),
  };
}
