/* eslint-disable @typescript-eslint/no-require-imports */

const Module = require("node:module");

require.extensions[".css"] = function ignoreCss() {};

const originalLoad = Module._load;
Module._load = function loadWithNextFontStub(request, parent, isMain) {
  if (request === "next/font/google") {
    return {
      Inter: () => ({ variable: "--font-assessment-inter" }),
      Playfair_Display: () => ({ variable: "--font-assessment-display" }),
      Roboto: () => ({ variable: "--font-assessment-body" }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require("tsx/cjs");
require("./capture-jeff-rockefeller-report-proof.tsx");
