import { buildWorkshopPromotionName } from "@/services/stripe";

describe("buildWorkshopPromotionName", () => {
  it("keeps short workshop names unchanged", () => {
    expect(buildWorkshopPromotionName("Growth Workshop", "SAVE25")).toBe(
      "Growth Workshop (SAVE25)"
    );
  });

  it("truncates long workshop names to Stripe's 40-character limit", () => {
    const result = buildWorkshopPromotionName(
      "Scaling Up to Finish Strong Virtual Workshop",
      "MR217534"
    );

    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith("(MR217534)")).toBe(true);
  });

  it("falls back to a truncated code when the suffix alone is too long", () => {
    const result = buildWorkshopPromotionName(
      "Workshop",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890LONGCODE"
    );

    expect(result.length).toBe(40);
  });
});
