import {
  findUndersizedTouchTargets,
  formatTouchTargetFailures,
} from "../../../e2e/helpers/touch-targets";

describe("touch-target diagnostics", () => {
  it("reports only visible actual targets below 44px with selector and dimensions", () => {
    const failures = findUndersizedTouchTargets([
      { selector: "button#good", width: 44, height: 52, visible: true },
      { selector: "a#narrow", width: 31.25, height: 44, visible: true },
      { selector: "summary#short", width: 80, height: 28.5, visible: true },
      { selector: "button#hidden", width: 4, height: 4, visible: false },
    ]);

    expect(failures).toEqual([
      { selector: "a#narrow", width: 31.25, height: 44, visible: true },
      { selector: "summary#short", width: 80, height: 28.5, visible: true },
    ]);
    expect(formatTouchTargetFailures(failures)).toBe(
      "a#narrow (31.25×44); summary#short (80×28.5)",
    );
  });
});
