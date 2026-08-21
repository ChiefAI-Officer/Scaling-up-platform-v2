/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock("@/components/assessments/BrandedReport", () => {
  const React = require("react") as typeof import("react");
  return {
    BrandedReport: () => React.createElement("div", { "data-testid": "capture-branded-report" }),
  };
});

jest.mock("@/components/assessments/ReportStyleScope", () => {
  const React = require("react") as typeof import("react");
  return {
    ReportStyleScope: ({ children }: { children: React.ReactElement }) => React.cloneElement(children, {
      "data-enabled-report-style": "CLASSIC",
    }),
  };
});

import {
  artifactPathsFor,
  LONG_CLOSING_VISIBLE_CHARACTERS,
  LONG_WELCOME_VISIBLE_CHARACTERS,
  REPORT_HTML_PEER_FIXTURES,
  renderCaptureMarkup,
} from "../../../scripts/capture-report-html-peers-previews";

describe("report HTML peers visual capture fixture contract", () => {
  it("keeps the deterministic ten-case matrix and its complete artifact set", () => {
    expect(REPORT_HTML_PEER_FIXTURES).toHaveLength(10);
    expect(REPORT_HTML_PEER_FIXTURES.map((fixture) => fixture.id)).toEqual([
      "default-current",
      "default-historical",
      "welcome-only-current",
      "welcome-only-historical",
      "closing-only-current",
      "closing-only-historical",
      "both-current",
      "both-historical",
      "long-current",
      "long-historical",
    ]);

    const long = REPORT_HTML_PEER_FIXTURES.filter((fixture) => fixture.authoringCase === "long");
    expect(long.map((fixture) => fixture.welcomeVisibleCharacters)).toEqual([LONG_WELCOME_VISIBLE_CHARACTERS, LONG_WELCOME_VISIBLE_CHARACTERS]);
    expect(long.map((fixture) => fixture.closingVisibleCharacters)).toEqual([LONG_CLOSING_VISIBLE_CHARACTERS, LONG_CLOSING_VISIBLE_CHARACTERS]);

    for (const fixture of REPORT_HTML_PEER_FIXTURES) {
      expect(artifactPathsFor(fixture)).toEqual({
        desktopPage2: expect.stringMatching(new RegExp(`${fixture.id}/desktop-page-2\\.png$`)),
        desktopPage25: expect.stringMatching(new RegExp(`${fixture.id}/desktop-page-25\\.png$`)),
        mobilePage2: expect.stringMatching(new RegExp(`${fixture.id}/mobile-page-2\\.png$`)),
        mobilePage25: expect.stringMatching(new RegExp(`${fixture.id}/mobile-page-25\\.png$`)),
        pdf: expect.stringMatching(new RegExp(`${fixture.id}/full-report\\.pdf$`)),
      });
    }
  });

  it("captures each fixture through the production report style scope and branded report host", () => {
    const markup = renderCaptureMarkup(REPORT_HTML_PEER_FIXTURES[0]);

    expect(markup).toContain('data-enabled-report-style="CLASSIC"');
    expect(markup).toContain('data-testid="capture-branded-report"');
  });
});
