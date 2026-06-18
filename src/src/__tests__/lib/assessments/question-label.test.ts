/**
 * Unit tests for stripLegacyDecimalSuffix() (Spec 17 Wave E, #26 / R1-L2).
 *
 * Historical (already-pinned) QSPv2 template versions carry the literal
 * "(with 1 decimal)" suffix on the P1 overall-rating label. The seed is fixed
 * going forward; this pure util strips the suffix at render time so legacy
 * versions read correctly without a data migration.
 */

import { stripLegacyDecimalSuffix } from "@/lib/assessments/question-label";

describe("stripLegacyDecimalSuffix()", () => {
  it("strips a trailing '(with 1 decimal)' suffix", () => {
    expect(
      stripLegacyDecimalSuffix(
        "How would you rate the past Quarter? (1-10) (with 1 decimal)"
      )
    ).toBe("How would you rate the past Quarter? (1-10)");
  });

  it("leaves a normal label unchanged", () => {
    expect(stripLegacyDecimalSuffix("Please explain your rating.")).toBe(
      "Please explain your rating."
    );
  });

  it("handles trailing whitespace around the suffix", () => {
    expect(
      stripLegacyDecimalSuffix(
        "How would you rate the past Quarter? (1-10)   (with 1 decimal)   "
      )
    ).toBe("How would you rate the past Quarter? (1-10)");
  });

  it("is case-insensitive", () => {
    expect(
      stripLegacyDecimalSuffix(
        "How would you rate the past Quarter? (1-10) (With 1 Decimal)"
      )
    ).toBe("How would you rate the past Quarter? (1-10)");
  });
});
