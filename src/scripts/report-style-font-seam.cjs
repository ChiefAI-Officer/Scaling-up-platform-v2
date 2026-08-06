"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */

const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { dirname, extname, join, resolve } = require("node:path");

const FONT_VARIABLES = Object.freeze({
  Inter: "--font-assessment-inter",
  Playfair_Display: "--font-assessment-display",
  Roboto: "--font-assessment-body",
});

function cssFilesBelow(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (extname(entry.name) === ".css") files.push(path);
    }
  }
  return files;
}

function findGeneratedFontStylesheet(appRoot) {
  const roots = [
    resolve(appRoot, ".next/static/chunks"),
    resolve(appRoot, ".next/dev/static/chunks"),
  ];
  const requiredVariables = Object.values(FONT_VARIABLES);

  for (const root of roots) {
    const candidates = cssFilesBelow(root)
      .map((path) => ({ path, css: readFileSync(path, "utf8") }))
      .filter(({ css }) =>
        requiredVariables.every((variable) => css.includes(variable)) &&
        css.includes("@font-face"),
      )
      .sort((left, right) => left.css.length - right.css.length);
    if (candidates.length > 0) return candidates[0];
  }

  throw new Error(
    "Report-style QA requires generated Next font assets. Run the Turbopack build first.",
  );
}

function variableClass(css, variable) {
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(
    new RegExp("\\.([A-Za-z0-9_-]+)\\s*\\{\\s*" + escaped + "\\s*:"),
  );
  if (!match) {
    throw new Error(`Generated Next font CSS is missing ${variable}.`);
  }
  return match[1];
}

function inlineFontUrls(css, cssPath) {
  return css.replace(
    /url\((["']?)([^"'()]+\.(?:woff2?|ttf|otf))\1\)/g,
    (_match, _quote, rawUrl) => {
      const fontPath = resolve(dirname(cssPath), rawUrl);
      const extension = extname(fontPath).slice(1);
      const mime =
        extension === "ttf"
          ? "font/ttf"
          : extension === "otf"
            ? "font/otf"
            : extension === "woff"
              ? "font/woff"
              : "font/woff2";
      return `url("data:${mime};base64,${readFileSync(fontPath).toString("base64")}")`;
    },
  );
}

function loadReportStyleFontSeam(appRoot) {
  const generated = findGeneratedFontStylesheet(appRoot);
  const variables = Object.fromEntries(
    Object.entries(FONT_VARIABLES).map(([font, variable]) => [
      font,
      Object.freeze({ variable: variableClass(generated.css, variable) }),
    ]),
  );

  return Object.freeze({
    css: inlineFontUrls(generated.css, generated.path),
    sourcePath: generated.path,
    variables: Object.freeze(variables),
  });
}

module.exports = {
  FONT_VARIABLES,
  loadReportStyleFontSeam,
};
