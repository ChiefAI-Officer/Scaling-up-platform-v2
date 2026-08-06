import { execFileSync } from "node:child_process";

const sentinelId = "report-comparison-e2e-sentinel-0123456789abcdefghijkl";

function plan() {
  const source = [
    "import { buildReportComparisonFixturePlan } from './scripts/provision-report-comparison-e2e.mjs';",
    "console.log(JSON.stringify(buildReportComparisonFixturePlan(process.env)));",
  ].join(" ");
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: process.cwd(),
    env: { ...process.env, E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_ID: sentinelId },
    encoding: "utf8",
  })) as {
    key: string;
    organizationExternalId: string;
    otherOrganizationExternalId: string;
    adminEmail: string;
    coachEmail: string;
    ceoEmail: string;
    templateAlias: string;
    styles: Array<[string, string]>;
    roles: string[];
  };
}

describe("report-comparison fixture provisioner contract", () => {
  it("derives a namespaced, disposable topology instead of accepting caller-provided report facts", () => {
    const fixture = plan();

    expect(fixture.key).toMatch(/^e2e-report-comparison:[a-f0-9]{16}$/);
    expect(fixture.organizationExternalId).toBe(`${fixture.key}:organization`);
    expect(fixture.otherOrganizationExternalId).toBe(`${fixture.key}:other-organization`);
    expect(fixture.templateAlias).toBe("scaling-up-full");
    expect(fixture.adminEmail).toMatch(/@fixture\.invalid$/);
    expect(fixture.coachEmail).toMatch(/@fixture\.invalid$/);
    expect(fixture.ceoEmail).toMatch(/@fixture\.invalid$/);
    expect(fixture.styles).toEqual([
      ["CLASSIC", "Classic"],
      ["EXECUTIVE_BOARDROOM", "Executive Boardroom"],
      ["MODERN_DASHBOARD", "Modern Dashboard"],
    ]);
    expect(fixture.roles).toEqual(expect.arrayContaining([
      "current-ceo", "prior-native-ceo", "prior-imported-ceo", "non-ceo", "other-org-same-email",
    ]));
  });
});
