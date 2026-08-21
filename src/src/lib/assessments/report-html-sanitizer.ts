import sanitizeHtml from "sanitize-html";

export const REPORT_HTML_LIMITS = {
  introduction: {
    rawCharacters: 12_000,
    textCharacters: 2_200,
    elements: 64,
    depth: 8,
    images: 1,
    tables: 1,
    tableRows: 8,
  },
  conclusion: {
    rawCharacters: 12_000,
    textCharacters: 900,
    elements: 36,
    depth: 6,
    images: 1,
    tables: 1,
    tableRows: 6,
  },
} as const;

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
    "loading",
    "referrerpolicy",
    ...COMMON_ATTRIBUTES,
  ],
  table: ["summary", ...COMMON_ATTRIBUTES],
  th: ["colspan", "rowspan", "scope", ...COMMON_ATTRIBUTES],
  td: ["colspan", "rowspan", "headers", ...COMMON_ATTRIBUTES],
  col: ["span", ...COMMON_ATTRIBUTES],
};

const LENGTH = "(?:0|\\d+(?:\\.\\d+)?(?:px|pt|em|rem|%|ex|ch))";
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
    display: [/^(?:block|inline|inline-block|none)$/i],
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

type ReportHtmlPosition = keyof typeof REPORT_HTML_LIMITS;

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const TAG_TOKEN = /<\/?([a-z][a-z0-9:-]*)(?:\s[^<>]*?)?\s*\/?>/gi;

function measureStructure(html: string) {
  let elements = 0;
  let depth = 0;
  let maximumDepth = 0;
  let images = 0;
  let tables = 0;
  let tableRows = 0;
  const stack: string[] = [];

  for (const token of html.matchAll(TAG_TOKEN)) {
    const tag = token[1].toLowerCase();
    const isClosing = token[0].startsWith("</");
    if (isClosing) {
      const index = stack.lastIndexOf(tag);
      if (index !== -1) {
        stack.length = index;
        depth = stack.length;
      }
      continue;
    }

    elements += 1;
    if (tag === "img") images += 1;
    if (tag === "table") tables += 1;
    if (tag === "tr") tableRows += 1;
    if (!VOID_TAGS.has(tag) && !token[0].endsWith("/>")) {
      stack.push(tag);
      depth = stack.length;
      maximumDepth = Math.max(maximumDepth, depth);
    }
  }

  const text = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  }).replace(/\s+/g, " ").trim();

  return { elements, depth: maximumDepth, images, tables, tableRows, text };
}

function issueForLimit(
  position: ReportHtmlPosition,
  kind: "rawCharacters" | "textCharacters" | "elements" | "depth" | "images" | "tables" | "tableRows",
): string {
  const field = position === "introduction" ? "Welcome section" : "Closing message";
  const limit = REPORT_HTML_LIMITS[position][kind];
  const messages = {
    rawCharacters: `must be ${limit.toLocaleString()} characters or fewer.`,
    textCharacters: `must contain ${limit.toLocaleString()} visible text characters or fewer.`,
    elements: `must contain ${limit} HTML elements or fewer.`,
    depth: `cannot be nested more than ${limit} levels deep.`,
    images: `can contain ${limit} image or fewer.`,
    tables: `can contain ${limit} table or fewer.`,
    tableRows: `can contain ${limit} table rows or fewer.`,
  } as const;
  return `${field} ${messages[kind]}`;
}

export function sanitizeReportHtmlFragment(
  raw: string,
  position: ReportHtmlPosition,
): SanitizeReportHtmlResult {
  const limits = REPORT_HTML_LIMITS[position];
  if (raw.length > limits.rawCharacters) {
    return {
      ok: false,
      html: "",
      didStripContent: false,
      issue: issueForLimit(position, "rawCharacters"),
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

  const structure = measureStructure(html);
  for (const [kind, value] of [
    ["textCharacters", structure.text.length],
    ["elements", structure.elements],
    ["depth", structure.depth],
    ["images", structure.images],
    ["tables", structure.tables],
    ["tableRows", structure.tableRows],
  ] as const) {
    if (value > limits[kind]) {
      return {
        ok: false,
        html: "",
        didStripContent: html !== raw.trim(),
        issue: issueForLimit(position, kind),
      };
    }
  }

  return {
    ok: true,
    html,
    didStripContent: html !== raw.trim(),
  };
}
