import {
  tiersToBoundaries,
  boundaryToTiers,
  clampBoundary,
} from "@/components/admin/template-editor/tier-band-math";

describe("tier-band-math (ED5 T16 / co-validate C2)", () => {
  describe("integer mode", () => {
    const tiers = [
      { minMetric: 0, maxMetric: 2, label: "Low", message: "" },
      { minMetric: 3, maxMetric: 5, label: "High", message: "" },
    ];
    it("tiersToBoundaries returns the lower tier's max", () => {
      expect(tiersToBoundaries(tiers)).toEqual([2]);
    });
    it("boundaryToTiers sets lower.max=v and upper.min=v+1 (no inclusive overlap)", () => {
      expect(boundaryToTiers(tiers, "integer", 0, 3)).toEqual([
        { minMetric: 0, maxMetric: 3, label: "Low", message: "" },
        { minMetric: 4, maxMetric: 5, label: "High", message: "" },
      ]);
    });
  });

  describe("fractional mode", () => {
    const tiers = [
      { minMetric: 0, maxMetric: 2.5 },
      { minMetric: 2.5, maxMetric: 5 },
    ];
    it("tiersToBoundaries returns the touching edge", () => {
      expect(tiersToBoundaries(tiers)).toEqual([2.5]);
    });
    it("boundaryToTiers sets lower.max=v and upper.min=v (touching)", () => {
      expect(boundaryToTiers(tiers, "fractional", 0, 3.5)).toEqual([
        { minMetric: 0, maxMetric: 3.5 },
        { minMetric: 3.5, maxMetric: 5 },
      ]);
    });
  });

  it("open-ended last tier (no maxMetric) yields one fewer boundary", () => {
    const tiers = [
      { minMetric: 0, maxMetric: 2 },
      { minMetric: 3 }, // open-ended top
    ];
    expect(tiersToBoundaries(tiers)).toEqual([2]);
  });

  it("three tiers → two interior boundaries, left-to-right", () => {
    const tiers = [
      { minMetric: 0, maxMetric: 1 },
      { minMetric: 2, maxMetric: 4 },
      { minMetric: 5, maxMetric: 7 },
    ];
    expect(tiersToBoundaries(tiers)).toEqual([1, 4]);
  });

  it("boundaryToTiers is immutable + preserves other fields; out-of-range index is a no-op copy", () => {
    const tiers = [
      { minMetric: 0, maxMetric: 2, label: "L", message: "m", action: "x" },
      { minMetric: 3, maxMetric: 5, label: "H", message: "n" },
    ];
    const out = boundaryToTiers(tiers, "integer", 0, 1);
    expect(out).not.toBe(tiers);
    expect(out[0]).toMatchObject({ action: "x", label: "L" });
    expect(boundaryToTiers(tiers, "integer", 9, 1)).toEqual(tiers); // no-op
  });

  describe("clampBoundary", () => {
    it("integer: clamps to range + rounds to whole numbers", () => {
      expect(clampBoundary(3.6, { min: 0, max: 10 }, "integer")).toBe(4);
      expect(clampBoundary(-5, { min: 1, max: 9 }, "integer")).toBe(1);
      expect(clampBoundary(99, { min: 1, max: 9 }, "integer")).toBe(9);
    });
    it("fractional: clamps to range + snaps to step", () => {
      expect(clampBoundary(2.7, { min: 0, max: 5 }, "fractional", 0.5)).toBe(2.5);
      expect(clampBoundary(4.9, { min: 0, max: 5 }, "fractional", 0.5)).toBe(5);
    });
  });
});
