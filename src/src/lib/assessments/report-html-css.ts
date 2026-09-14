import { generate, parse, walk, type CssNode } from "css-tree";

export type ReportHtmlPosition = "introduction" | "conclusion";

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const BLOCKED_AT_RULES = new Map([
  ["import", "@import. Write the CSS directly in this editor"],
  ["font-face", "@font-face. Use a font already available in the report"],
  ["page", "@page because it would change the entire printed report"],
  ["keyframes", "@keyframes because animation names are document-wide"],
  ["-webkit-keyframes", "@-webkit-keyframes because animation names are document-wide"],
  ["property", "@property because custom-property registrations are document-wide"],
  ["counter-style", "@counter-style because counter names are document-wide"],
  ["font-palette-values", "@font-palette-values because palette names are document-wide"],
  ["view-transition", "@view-transition because it changes document-wide transitions"],
]);
const SCOPED_AT_RULES = new Set(["media", "supports", "container", "scope"]);
const IMAGE_SET_FUNCTIONS = new Set(["image-set", "-webkit-image-set"]);
const SAFE_POSITION_VALUES = new Set(["static", "relative", "absolute"]);

function fieldLabel(position: ReportHtmlPosition): string {
  return position === "introduction" ? "Welcome section" : "Closing message";
}

function parseCss(css: string): CssNode {
  let parseError = false;
  const ast = parse(css, {
    context: "stylesheet",
    onParseError: () => {
      parseError = true;
    },
  });
  if (parseError) throw new Error("Invalid CSS");
  return ast;
}

export function reportHtmlCssCharacterCount(html: string): number {
  STYLE_BLOCK.lastIndex = 0;
  return [...html.matchAll(STYLE_BLOCK)]
    .reduce((total, match) => total + match[1].length, 0);
}

export function reportHtmlCssIssue(
  html: string,
  position: ReportHtmlPosition,
): string | null {
  STYLE_BLOCK.lastIndex = 0;
  for (const match of html.matchAll(STYLE_BLOCK)) {
    if (match[1].includes("\\")) {
      return `${fieldLabel(position)} CSS cannot use escaped identifiers or values.`;
    }
    if (/(?:^|[^a-z-])attr\s*\(/i.test(match[1])) {
      return `${fieldLabel(position)} CSS cannot use attr().`;
    }
    let ast: CssNode;
    try {
      ast = parseCss(match[1]);
    } catch {
      return `${fieldLabel(position)} contains CSS that could not be parsed.`;
    }

    let issue: string | null = null;
    const functionStack: string[] = [];
    walk(ast, {
      enter(node: CssNode) {
        if (node.type === "Function") {
          functionStack.push(node.name.toLowerCase());
        }
        if (issue) return;

        if (node.type === "Atrule") {
          const name = node.name.toLowerCase();
          const reason = BLOCKED_AT_RULES.get(name);
          if (reason) {
            issue = `${fieldLabel(position)} CSS cannot use ${reason}.`;
          } else if (!SCOPED_AT_RULES.has(name)) {
            issue = `${fieldLabel(position)} CSS cannot use @${name}. Only @media, @supports, @container, and nested @scope rules are supported.`;
          }
          return;
        }

        if (node.type === "Url") {
          try {
            if (new URL(node.value).protocol !== "https:") {
              issue = `${fieldLabel(position)} CSS can only load images over HTTPS.`;
            }
          } catch {
            issue = `${fieldLabel(position)} CSS can only load images over HTTPS.`;
          }
          return;
        }

        if (
          node.type === "String" &&
          IMAGE_SET_FUNCTIONS.has(functionStack.at(-1) ?? "")
        ) {
          try {
            if (new URL(node.value).protocol !== "https:") {
              issue = `${fieldLabel(position)} CSS can only load images over HTTPS.`;
            }
          } catch {
            issue = `${fieldLabel(position)} CSS can only load images over HTTPS.`;
          }
          return;
        }

        if (node.type === "Function") {
          const name = node.name.toLowerCase();
          if (
            name === "url" ||
            name === "expression" ||
            name === "var" ||
            name === "attr" ||
            name === "env"
          ) {
            issue = `${fieldLabel(position)} CSS cannot use ${name}().`;
          }
          return;
        }

        if (node.type === "Declaration") {
          const property = node.property.toLowerCase();
          if (property.startsWith("--")) {
            issue = `${fieldLabel(position)} CSS cannot declare custom properties.`;
            return;
          }
          if (property === "position") {
            const value = generate(node.value).trim().toLowerCase();
            if (!SAFE_POSITION_VALUES.has(value)) {
              issue = `${fieldLabel(position)} CSS position can only be static, relative, or absolute.`;
            }
          }
        }
      },
      leave(node: CssNode) {
        if (node.type === "Function") functionStack.pop();
      },
    });
    if (issue) return issue;
  }
  return null;
}

export function scopeReportHtmlCss(
  html: string,
  position: ReportHtmlPosition,
): string {
  const scope = `.su-report-custom-html--${position}`;
  STYLE_BLOCK.lastIndex = 0;
  return html.replace(STYLE_BLOCK, (_style, css: string) => {
    const canonicalCss = generate(parseCss(css));
    return `<style>@scope (${scope}) {${canonicalCss}}</style>`;
  });
}
