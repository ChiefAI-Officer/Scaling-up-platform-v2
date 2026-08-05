/* eslint-disable @typescript-eslint/no-require-imports */

const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const [style, variant] = process.argv.slice(2);
if (!new Set(["EXECUTIVE_BOARDROOM", "MODERN_DASHBOARD"]).has(style)) throw new Error("Unknown report style");

require.extensions[".css"] = function ignoreCss() {};
const originalLoad = Module._load;
Module._load = function loadWithFontStub(request, parent, isMain) {
  if (request === "next/font/google") {
    const font = () => ({ variable: "" });
    return { Inter: font, Playfair_Display: font, Roboto: font };
  }
  return originalLoad.call(this, request, parent, isMain);
};
require("tsx/cjs");

const { buildReportStylePreviewFixture, isReportStylePreviewVariant } = require("../src/lib/assessments/report-style-preview-fixture");
if (!isReportStylePreviewVariant(variant)) throw new Error("Unknown report-style preview variant");
const Component = style === "EXECUTIVE_BOARDROOM"
  ? require("../src/components/assessments/report-styles/ExecutiveBoardroomReport").ExecutiveBoardroomReport
  : require("../src/components/assessments/report-styles/ModernDashboardReport").ModernDashboardReport;
process.stdout.write(renderToStaticMarkup(React.createElement(Component, { view: buildReportStylePreviewFixture(variant) })));
