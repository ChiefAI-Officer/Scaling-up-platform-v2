/**
 * Fix 5: Workshop Status Explanation Labels (RED phase)
 *
 * Tests the getWorkshopStatusExplanation utility function
 * that provides human-readable explanations for each workshop status.
 */

import { getWorkshopStatusExplanation } from "@/lib/utils";

describe("getWorkshopStatusExplanation", () => {
  it("returns correct label for each status", () => {
    expect(getWorkshopStatusExplanation("REQUESTED")).toBe(
      "Submitted — awaiting admin review"
    );
    expect(getWorkshopStatusExplanation("AWAITING_APPROVAL")).toBe(
      "Under review by admin team"
    );
    expect(getWorkshopStatusExplanation("INFO_REQUESTED")).toBe(
      "Admin requested changes — respond below"
    );
    expect(getWorkshopStatusExplanation("PRE_EVENT")).toBe(
      "Approved — workshop pages are live"
    );
    expect(getWorkshopStatusExplanation("POST_EVENT")).toBe(
      "Event concluded — collecting feedback"
    );
    expect(getWorkshopStatusExplanation("COMPLETED")).toBe(
      "All follow-up complete"
    );
    expect(getWorkshopStatusExplanation("CANCELED")).toBe(
      "Workshop canceled"
    );
    expect(getWorkshopStatusExplanation("DENIED")).toBe(
      "Your workshop was denied — edit and resubmit below"
    );
  });

  it("returns empty string for unknown status", () => {
    expect(getWorkshopStatusExplanation("UNKNOWN")).toBe("");
    expect(getWorkshopStatusExplanation("")).toBe("");
  });
});
