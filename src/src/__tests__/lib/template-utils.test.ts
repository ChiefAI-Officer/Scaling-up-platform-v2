import { stripPlaceholders } from "@/lib/template-utils";

describe("stripPlaceholders", () => {
  it("returns empty string for undefined", () => {
    expect(stripPlaceholders(undefined)).toBe("");
  });

  it("returns text unchanged when no placeholders", () => {
    expect(stripPlaceholders("Hello world")).toBe("Hello world");
  });

  it("strips a single placeholder", () => {
    expect(stripPlaceholders("Register for {{workshop_title}}")).toBe("Register for");
  });

  it("strips multiple placeholders", () => {
    expect(stripPlaceholders("{{a}} and {{b}}")).toBe("and");
  });

  it("collapses extra spaces after stripping", () => {
    expect(stripPlaceholders("Hello  {{name}}  World")).toBe("Hello World");
  });

  it("trims leading and trailing whitespace", () => {
    expect(stripPlaceholders("  {{name}}  ")).toBe("");
  });
});
