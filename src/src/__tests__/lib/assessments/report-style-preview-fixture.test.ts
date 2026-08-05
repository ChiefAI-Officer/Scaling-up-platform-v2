import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPORT_STYLE_PREVIEW_FIXTURE } from "@/lib/assessments/report-style-preview-fixture";

describe("REPORT_STYLE_PREVIEW_FIXTURE", () => {
  it("is a complete, serializable synthetic model with recommendations and long text", () => {
    const serialized = JSON.stringify(REPORT_STYLE_PREVIEW_FIXTURE);

    expect(REPORT_STYLE_PREVIEW_FIXTURE.identity.companyName).toBe("ABC Corp");
    expect(REPORT_STYLE_PREVIEW_FIXTURE.recommendations.length).toBeGreaterThan(0);
    expect(serialized.length).toBeGreaterThan(1_000);
    expect(serialized).not.toMatch(/@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(serialized).not.toMatch(/(production|respondent-|organization-|submission-|version-)[a-z0-9_-]+/i);
  });

  it("deep-freezes nested fixture content outside production", () => {
    expect(Object.isFrozen(REPORT_STYLE_PREVIEW_FIXTURE)).toBe(true);
    expect(Object.isFrozen(REPORT_STYLE_PREVIEW_FIXTURE.sections)).toBe(true);
    expect(Object.isFrozen(REPORT_STYLE_PREVIEW_FIXTURE.sections[0].questions)).toBe(true);
    expect(() => {
      REPORT_STYLE_PREVIEW_FIXTURE.sections[0].questions[0].label = "mutated";
    }).toThrow();
  });

  it("does not import a database client or respondent-report loader", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/assessments/report-style-preview-fixture.ts"), "utf8");

    expect(source).not.toMatch(/from\s+["']@\/lib\/db["']/);
    expect(source).not.toMatch(/from\s+["']@\/lib\/assessments\/respondent-report["']/);
  });
});
