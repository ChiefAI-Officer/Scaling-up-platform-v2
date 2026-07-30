import {
  MAX_PUBLIC_REFERRAL_CURSOR_TRAIL,
  normalizePublicReferralCursorTrail,
} from "@/lib/assessments/referred-results-page-state";

describe("normalizePublicReferralCursorTrail", () => {
  it("preserves a valid ordered cursor trail", () => {
    expect(
      normalizePublicReferralCursorTrail([" sub-25 ", "sub_50"]),
    ).toEqual(["sub-25", "sub_50"]);
  });

  it.each([
    ["duplicates", ["sub-25", "sub-25"]],
    ["invalid characters", ["sub-25", "sub/50"]],
    ["blank values", ["sub-25", "  "]],
    [
      "an excessive trail",
      Array.from(
        { length: MAX_PUBLIC_REFERRAL_CURSOR_TRAIL + 1 },
        (_, index) => `sub-${index}`,
      ),
    ],
  ])("rejects %s instead of trusting a forged page number", (_case, value) => {
    expect(normalizePublicReferralCursorTrail(value)).toEqual([]);
  });
});
