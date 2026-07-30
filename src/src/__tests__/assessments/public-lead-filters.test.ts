import {
  buildPublicLeadSubmissionWhere,
  PublicLeadFilterSchema,
} from "@/lib/assessments/public-lead-filters";

describe("Public lead shared filters", () => {
  it("rejects malformed dates for both list and export callers", () => {
    expect(PublicLeadFilterSchema.safeParse({ from: "07/30/2026" }).success).toBe(
      false,
    );
  });

  it("clamps an older requested start to the retention cutoff", () => {
    const cutoff = new Date("2026-07-01T00:00:00.000Z");
    const where = buildPublicLeadSubmissionWhere({
      coachId: "coach-1",
      retentionCutoff: cutoff,
      filter: {
        search: "Jane@Example.com",
        assessment: "",
        from: "2020-01-01",
      },
    });

    expect(where).toMatchObject({
      referringCoachId: "coach-1",
      submittedAt: { gte: cutoff },
      OR: [
        { publicTakerNameNormalized: { startsWith: "jane@example.com" } },
        { publicTakerEmailNormalized: { startsWith: "jane@example.com" } },
      ],
    });
  });
});
