import {
  generateTemplateInternalId,
  templateInternalIdForAttempt,
} from "@/lib/assessments/template-internal-id";

describe("generateTemplateInternalId", () => {
  it.each([
    ["  Team Health & Growth  ", "team-health-growth"],
    ["People___Strategy", "people-strategy"],
    ["--Cash / You--", "cash-you"],
    ["🎯🚀", ""],
  ])("normalizes %j to %j", (input, expected) => {
    expect(generateTemplateInternalId(input)).toBe(expected);
  });

  it("honors the 80-character API limit without a trailing dash", () => {
    expect(generateTemplateInternalId(`${"a".repeat(79)}-b`)).toHaveLength(80);
    expect(generateTemplateInternalId(`${"a".repeat(79)}-b`)).not.toMatch(/-$/);
  });
});

describe("templateInternalIdForAttempt", () => {
  it("uses the base for attempt 1 and numeric suffixes thereafter", () => {
    expect(templateInternalIdForAttempt("team-health", 1)).toBe("team-health");
    expect(templateInternalIdForAttempt("team-health", 2)).toBe("team-health-2");
    expect(templateInternalIdForAttempt("team-health", 3)).toBe("team-health-3");
  });

  it("trims a long base before appending the suffix", () => {
    const value = templateInternalIdForAttempt("a".repeat(80), 12);
    expect(value).toHaveLength(80);
    expect(value).toMatch(/-12$/);
  });

  it("rejects an attempt below 1", () => {
    expect(() => templateInternalIdForAttempt("team-health", 0)).toThrow(
      "attempt must be at least 1",
    );
  });
});
