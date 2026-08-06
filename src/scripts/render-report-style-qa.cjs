/* eslint-disable @typescript-eslint/no-require-imports */

const Module = require("node:module");
const { resolve } = require("node:path");
const {
  loadReportStyleFontSeam,
} = require("./report-style-font-seam.cjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const [style, anatomy, variant] = process.argv.slice(2);
if (!new Set(["CLASSIC", "EXECUTIVE_BOARDROOM", "MODERN_DASHBOARD"]).has(style)) {
  throw new Error("Unknown report style");
}

require.extensions[".css"] = function ignoreCss() {};
const fontSeam = loadReportStyleFontSeam(
  process.env.REPORT_STYLE_FONT_ASSET_ROOT || resolve(__dirname, ".."),
);
const originalLoad = Module._load;
Module._load = function loadWithFontStub(request, parent, isMain) {
  if (request === "next/font/google") {
    return {
      Inter: () => fontSeam.variables.Inter,
      Playfair_Display: () => fontSeam.variables.Playfair_Display,
      Roboto: () => fontSeam.variables.Roboto,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
require("tsx/cjs");

const {
  buildReportStylePreviewReport,
  isReportStylePreviewAnatomy,
  isReportStylePreviewVariant,
} = require("../src/lib/assessments/report-style-preview-fixture");
if (!isReportStylePreviewAnatomy(anatomy)) throw new Error("Unknown report-style preview anatomy");
if (!isReportStylePreviewVariant(variant)) throw new Error("Unknown report-style preview variant");
const { BrandedReport } = require("../src/components/assessments/BrandedReport");
const { ReportStyleScope } = require("../src/components/assessments/ReportStyleScope");
const report = {
  ...buildReportStylePreviewReport(anatomy, variant),
  reportStyle: style,
};
process.stdout.write(renderToStaticMarkup(
  React.createElement(
    ReportStyleScope,
    { report, reportStylesAvailable: true },
    React.createElement(
      "div",
      { style: { display: "contents" } },
      React.createElement(BrandedReport, {
        report,
        reportStylesAvailable: true,
        reportFindingsAvailable: true,
      }),
    ),
  ),
));
