import {
  findUndersizedTouchTargets,
  formatTouchTargetFailures,
  TOUCH_TARGET_SELECTOR,
} from "../../../e2e/helpers/touch-targets";

describe("touch-target diagnostics", () => {
  it("audits every actual interactive element without requiring a data marker", () => {
    expect(TOUCH_TARGET_SELECTOR).toBe('button, [role="button"], summary, a[href]');
    expect(TOUCH_TARGET_SELECTOR).not.toContain("data-touch-target");
  });

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

  it("deterministically reports zero-sized visible targets and accepts an empty scan", () => {
    expect(findUndersizedTouchTargets([])).toEqual([]);
    expect(findUndersizedTouchTargets([
      { selector: "button#zero", width: 0, height: 0, visible: true },
    ])).toEqual([
      { selector: "button#zero", width: 0, height: 0, visible: true },
    ]);
  });
});
