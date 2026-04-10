import {
  calculateWorkshopRevenueSplit,
  formatUsdFromCents,
} from "@/lib/workshops/workshop-financials";

describe("workshop financial helpers", () => {
  it("returns a 25/75 split that sums back to gross revenue", () => {
    const result = calculateWorkshopRevenueSplit(60000);

    expect(result).toEqual({
      grossRevenueCents: 60000,
      scalingUpShareCents: 15000,
      coachShareCents: 45000,
    });
  });

  it("handles zero safely", () => {
    expect(calculateWorkshopRevenueSplit(0)).toEqual({
      grossRevenueCents: 0,
      scalingUpShareCents: 0,
      coachShareCents: 0,
    });
  });

  it("rounds uneven cent totals deterministically while preserving the total", () => {
    const result = calculateWorkshopRevenueSplit(101);

    expect(result.grossRevenueCents).toBe(101);
    expect(result.scalingUpShareCents + result.coachShareCents).toBe(101);
    expect(result.scalingUpShareCents).toBe(25);
    expect(result.coachShareCents).toBe(76);
  });

  it("formats cents as USD strings", () => {
    expect(formatUsdFromCents(12345)).toBe("$123.45");
  });
});
