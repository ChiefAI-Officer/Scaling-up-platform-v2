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
    tableColumns: 4,
    tableCells: 24,
    tableCaptions: 1,
    tableCaptionCharacters: 60,
    figureCaptions: 1,
    headings: 4,
    lineBreaks: 8,
    estimatedLines: 32,
  },
  conclusion: {
    rawCharacters: 12_000,
    textCharacters: 900,
    elements: 36,
    depth: 6,
    images: 1,
    tables: 1,
    tableRows: 6,
    tableColumns: 3,
    tableCells: 12,
    tableCaptions: 1,
    tableCaptionCharacters: 60,
    figureCaptions: 1,
    headings: 2,
    lineBreaks: 4,
    estimatedLines: 16,
  },
} as const;

export type SanitizeReportHtmlResult = {
  ok: boolean;
  html: string;
  didStripContent: boolean;
  issue?: string;
};

type ReportHtmlTagPolicy =
  | { classification: "safe-inline-zero-cost" }
  | { classification: "positive-weighted-or-limited"; weight: number }
  | { classification: "unwrapped-or-disallowed" };

export const REPORT_HTML_TAG_POLICY = {
  section: { classification: "positive-weighted-or-limited", weight: 1 },
  article: { classification: "positive-weighted-or-limited", weight: 1 },
  header: { classification: "positive-weighted-or-limited", weight: 1 },
  main: { classification: "positive-weighted-or-limited", weight: 1 },
  aside: { classification: "positive-weighted-or-limited", weight: 1 },
  div: { classification: "positive-weighted-or-limited", weight: 1 },
  p: { classification: "positive-weighted-or-limited", weight: 2 },
  br: { classification: "positive-weighted-or-limited", weight: 1 },
  hr: { classification: "positive-weighted-or-limited", weight: 2 },
  h1: { classification: "positive-weighted-or-limited", weight: 5 },
  h2: { classification: "positive-weighted-or-limited", weight: 4 },
  h3: { classification: "positive-weighted-or-limited", weight: 3 },
  h4: { classification: "positive-weighted-or-limited", weight: 3 },
  h5: { classification: "positive-weighted-or-limited", weight: 3 },
  h6: { classification: "positive-weighted-or-limited", weight: 3 },
  ul: { classification: "positive-weighted-or-limited", weight: 1 },
  ol: { classification: "positive-weighted-or-limited", weight: 1 },
  li: { classification: "positive-weighted-or-limited", weight: 1 },
  dl: { classification: "positive-weighted-or-limited", weight: 1 },
  dt: { classification: "positive-weighted-or-limited", weight: 1 },
  dd: { classification: "positive-weighted-or-limited", weight: 1 },
  blockquote: { classification: "positive-weighted-or-limited", weight: 3 },
  figure: { classification: "positive-weighted-or-limited", weight: 3 },
  figcaption: { classification: "positive-weighted-or-limited", weight: 2 },
  table: { classification: "positive-weighted-or-limited", weight: 1 },
  caption: { classification: "positive-weighted-or-limited", weight: 5 },
  thead: { classification: "positive-weighted-or-limited", weight: 0.25 },
  tbody: { classification: "positive-weighted-or-limited", weight: 0.25 },
  tfoot: { classification: "positive-weighted-or-limited", weight: 0.25 },
  tr: { classification: "positive-weighted-or-limited", weight: 1 },
  th: { classification: "positive-weighted-or-limited", weight: 0.1 },
  td: { classification: "positive-weighted-or-limited", weight: 0.1 },
  colgroup: { classification: "positive-weighted-or-limited", weight: 0.25 },
  col: { classification: "positive-weighted-or-limited", weight: 0.1 },
  img: { classification: "positive-weighted-or-limited", weight: 6 },
  span: { classification: "safe-inline-zero-cost" },
  code: { classification: "safe-inline-zero-cost" },
  strong: { classification: "safe-inline-zero-cost" },
  em: { classification: "safe-inline-zero-cost" },
  b: { classification: "safe-inline-zero-cost" },
  i: { classification: "safe-inline-zero-cost" },
  u: { classification: "safe-inline-zero-cost" },
  s: { classification: "safe-inline-zero-cost" },
  small: { classification: "safe-inline-zero-cost" },
  sup: { classification: "safe-inline-zero-cost" },
  sub: { classification: "safe-inline-zero-cost" },
  a: { classification: "safe-inline-zero-cost" },
  pre: { classification: "unwrapped-or-disallowed" },
  footer: { classification: "unwrapped-or-disallowed" },
} as const satisfies Record<string, ReportHtmlTagPolicy>;

export const REPORT_HTML_ALLOWED_TAGS = Object.entries(REPORT_HTML_TAG_POLICY)
  .filter(([, policy]) => policy.classification !== "unwrapped-or-disallowed")
  .map(([tag]) => tag);

const COMMON_ATTRIBUTES = [
  "title",
  "lang",
  "dir",
  "style",
  "aria-label",
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  "*": COMMON_ATTRIBUTES,
  a: ["href", "target", "rel", ...COMMON_ATTRIBUTES],
  img: [
    "src",
    "alt",
    "title",
    "loading",
    "referrerpolicy",
    ...COMMON_ATTRIBUTES,
  ],
  table: ["summary", ...COMMON_ATTRIBUTES],
  th: ["scope", ...COMMON_ATTRIBUTES],
  td: ["headers", ...COMMON_ATTRIBUTES],
  col: COMMON_ATTRIBUTES,
};

const HEX_COLOR = "#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})";
const RGB_COLOR = "rgba?\\(\\s*\\d+(?:\\.\\d+)?%?\\s*,\\s*\\d+(?:\\.\\d+)?%?\\s*,\\s*\\d+(?:\\.\\d+)?%?(?:\\s*,\\s*(?:0|1|0?\\.\\d+))?\\s*\\)";
const NAMED_COLOR = "[a-z]+";
const COLOR = `(?:${HEX_COLOR}|${RGB_COLOR}|${NAMED_COLOR})`;

const colorValue = new RegExp(`^${COLOR}$`, "i");
const fontFamilyValue = /^[a-z0-9 ,'"-]+$/i;

const ALLOWED_STYLES = {
  "*": {
    color: [colorValue],
    "background-color": [colorValue],
    "font-family": [fontFamilyValue],
    "font-weight": [/^(?:normal|bold|lighter|bolder|[1-9]00)$/i],
    "font-style": [/^(?:normal|italic|oblique)$/i],
    "text-align": [/^(?:left|right|center|justify|start|end)$/i],
    "text-decoration": [/^(?:none|underline|line-through|overline)$/i],
    "text-transform": [/^(?:none|uppercase|lowercase|capitalize)$/i],
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

function visibleText(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: [],
    allowedAttributes: {},
  }).replace(/\s+/g, " ").trim();
}

function visibleTextLengthWithinTags(html: string, tags: readonly string[]): number {
  return tags.reduce((total, tag) => {
    const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    return total + [...html.matchAll(pattern)]
      .reduce((tagTotal, match) => tagTotal + visibleText(match[1]).length, 0);
  }, 0);
}

type ReportHtmlPosition = keyof typeof REPORT_HTML_LIMITS;

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const TAG_TOKEN = /<\/?([a-z][a-z0-9:-]*)(?:\s[^<>]*?)?\s*\/?>/gi;
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const TABLE_ROW_GROUP_TAGS = new Set(["thead", "tbody", "tfoot"]);
const TABLE_RESTRICTED_PARENT_TAGS = new Set(["table", "colgroup", "thead", "tbody", "tfoot", "tr"]);
const TABLE_FAMILY_TAGS = new Set(["table", "caption", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "th", "td"]);

type TableGrammarState = {
  phase: 0 | 1 | 2 | 3 | 4;
  rowMode: null | "direct" | "grouped";
  seenHead: boolean;
  seenFoot: boolean;
};

function tableTagHasValidParent(
  tag: string,
  parent: string | undefined,
  tableState: TableGrammarState | undefined,
): boolean {
  if (tag === "table") return tableState === undefined;
  if (!TABLE_FAMILY_TAGS.has(tag)) {
    return parent === undefined || !TABLE_RESTRICTED_PARENT_TAGS.has(parent);
  }
  if (!tableState) return false;

  if (tag === "caption") {
    if (parent !== "table" || tableState.phase !== 0) return false;
    return true;
  }
  if (tag === "colgroup") {
    if (parent !== "table" || tableState.phase > 1) return false;
    tableState.phase = 1;
    return true;
  }
  if (tag === "col") return parent === "colgroup";
  if (tag === "thead") {
    if (parent !== "table" || tableState.seenHead || tableState.phase > 2) return false;
    tableState.seenHead = true;
    tableState.rowMode = "grouped";
    tableState.phase = 2;
    return true;
  }
  if (tag === "tbody") {
    if (parent !== "table" || tableState.seenFoot || tableState.rowMode === "direct" || tableState.phase > 3) return false;
    tableState.rowMode = "grouped";
    tableState.phase = 3;
    return true;
  }
  if (tag === "tfoot") {
    if (parent !== "table" || tableState.seenFoot || tableState.rowMode === "direct") return false;
    tableState.seenFoot = true;
    tableState.rowMode = "grouped";
    tableState.phase = 4;
    return true;
  }
  if (tag === "tr") {
    if (parent === "table") {
      if (tableState.rowMode === "grouped" || tableState.seenFoot || tableState.phase > 3) return false;
      tableState.rowMode = "direct";
      tableState.phase = 3;
      return true;
    }
    return parent !== undefined && TABLE_ROW_GROUP_TAGS.has(parent);
  }
  if (tag === "th" || tag === "td") return parent === "tr";
  return false;
}

function measureStructure(html: string) {
  let elements = 0;
  let depth = 0;
  let maximumDepth = 0;
  let images = 0;
  let tables = 0;
  let tableRows = 0;
  let tableColumns = 0;
  let tableCells = 0;
  let tableCaptions = 0;
  let figureCaptions = 0;
  let headings = 0;
  let lineBreaks = 0;
  let layoutWeight = 0;
  let cellsInCurrentRow = 0;
  let declaredColumns = 0;
  let hasValidTableStructure = true;
  const stack: string[] = [];
  const tableStates: TableGrammarState[] = [];
  let cursor = 0;

  for (const token of html.matchAll(TAG_TOKEN)) {
    const tag = token[1].toLowerCase();
    const isClosing = token[0].startsWith("</");
    const parent = stack.at(-1);
    const precedingText = html.slice(cursor, token.index);
    if (
      parent
      && TABLE_RESTRICTED_PARENT_TAGS.has(parent)
      && visibleText(precedingText).length > 0
    ) {
      hasValidTableStructure = false;
    }
    cursor = (token.index ?? 0) + token[0].length;
    if (isClosing) {
      if (tag === "tr") {
        tableColumns = Math.max(tableColumns, cellsInCurrentRow);
        cellsInCurrentRow = 0;
      }
      if (VOID_TAGS.has(tag)) continue;
      const expectedTag = stack.at(-1);
      if (expectedTag !== tag) {
        if (TABLE_FAMILY_TAGS.has(tag) || stack.some((openTag) => TABLE_FAMILY_TAGS.has(openTag))) {
          hasValidTableStructure = false;
        }
        const index = stack.lastIndexOf(tag);
        if (index !== -1) stack.length = index;
      } else {
        stack.pop();
      }
      if (tag === "table") tableStates.pop();
      depth = stack.length;
      continue;
    }

    const currentTable = tableStates.at(-1);
    if (!tableTagHasValidParent(tag, parent, currentTable)) {
      hasValidTableStructure = false;
    }
    if (tag === "table") {
      tableStates.push({
        phase: 0,
        rowMode: null,
        seenHead: false,
        seenFoot: false,
      });
      declaredColumns = 0;
    }
    elements += 1;
    if (tag === "img") images += 1;
    if (tag === "table") tables += 1;
    if (tag === "tr") tableRows += 1;
    if (tag === "tr") cellsInCurrentRow = 0;
    if (tag === "th" || tag === "td") {
      tableCells += 1;
      cellsInCurrentRow += 1;
    }
    if (tag === "col") {
      declaredColumns += 1;
      tableColumns = Math.max(tableColumns, declaredColumns);
    }
    if (tag === "caption") tableCaptions += 1;
    if (tag === "figcaption") figureCaptions += 1;
    if (HEADING_TAGS.has(tag)) headings += 1;
    if (tag === "br") lineBreaks += 1;
    const policy = REPORT_HTML_TAG_POLICY[tag as keyof typeof REPORT_HTML_TAG_POLICY];
    if (!policy || policy.classification === "unwrapped-or-disallowed") {
      throw new Error(`Sanitized report HTML tag ${tag} has no allowed layout policy.`);
    }
    if (policy.classification === "positive-weighted-or-limited") {
      layoutWeight += policy.weight;
    }
    if (!VOID_TAGS.has(tag) && !token[0].endsWith("/>")) {
      stack.push(tag);
      depth = stack.length;
      maximumDepth = Math.max(maximumDepth, depth);
    }
  }

  const finalParent = stack.at(-1);
  if (
    finalParent
    && TABLE_RESTRICTED_PARENT_TAGS.has(finalParent)
    && visibleText(html.slice(cursor)).length > 0
  ) {
    hasValidTableStructure = false;
  }
  if (tableStates.length > 0) hasValidTableStructure = false;

  const text = visibleText(html);
  const headingText = visibleTextLengthWithinTags(html, ["h1", "h2", "h3", "h4", "h5", "h6"]);
  const tableCellText = visibleTextLengthWithinTags(html, ["th", "td"]);
  const tableCaptionText = visibleTextLengthWithinTags(html, ["caption"]);
  const figureCaptionText = visibleTextLengthWithinTags(html, ["figcaption"]);

  return {
    elements,
    depth: maximumDepth,
    images,
    tables,
    tableRows,
    tableColumns,
    tableCells,
    tableCaptions,
    tableCaptionCharacters: tableCaptionText,
    figureCaptions,
    headings,
    lineBreaks,
    estimatedLines: Math.ceil(text.length / 100)
      + Math.ceil(headingText / 50)
      + Math.ceil(tableCellText / 50)
      + Math.ceil(tableCaptionText / 20)
      + Math.ceil(figureCaptionText / 60)
      + layoutWeight,
    hasValidTableStructure,
    text,
  };
}

function issueForTableStructure(position: ReportHtmlPosition): string {
  const field = position === "introduction" ? "Welcome section" : "Closing message";
  return `${field} must use valid table structure with captions, columns, row groups, rows, and cells inside their required table parents.`;
}

function issueForLimit(
  position: ReportHtmlPosition,
  kind: "rawCharacters" | "textCharacters" | "elements" | "depth" | "images" | "tables" | "tableRows" | "tableColumns" | "tableCells" | "tableCaptions" | "tableCaptionCharacters" | "figureCaptions" | "headings" | "lineBreaks" | "estimatedLines",
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
    tableColumns: `can contain ${limit} table columns or fewer.`,
    tableCells: `can contain ${limit} table cells or fewer.`,
    tableCaptions: `can contain ${limit} table caption or fewer.`,
    tableCaptionCharacters: `must contain ${limit} visible table-caption characters or fewer.`,
    figureCaptions: `can contain ${limit} figure caption or fewer.`,
    headings: `can contain ${limit} headings or fewer.`,
    lineBreaks: `can contain ${limit} line breaks or fewer.`,
    estimatedLines: `must use ${limit} estimated lines or fewer after headings, blocks, lists, breaks, table rows, figures, and images are counted.`,
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
    allowedTags: REPORT_HTML_ALLOWED_TAGS,
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
  if (!structure.hasValidTableStructure) {
    return {
      ok: false,
      html: "",
      didStripContent: html !== raw.trim(),
      issue: issueForTableStructure(position),
    };
  }
  for (const [kind, value] of [
    ["textCharacters", structure.text.length],
    ["elements", structure.elements],
    ["depth", structure.depth],
    ["images", structure.images],
    ["tables", structure.tables],
    ["tableRows", structure.tableRows],
    ["tableColumns", structure.tableColumns],
    ["tableCells", structure.tableCells],
    ["tableCaptions", structure.tableCaptions],
    ["tableCaptionCharacters", structure.tableCaptionCharacters],
    ["figureCaptions", structure.figureCaptions],
    ["headings", structure.headings],
    ["lineBreaks", structure.lineBreaks],
    ["estimatedLines", structure.estimatedLines],
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
