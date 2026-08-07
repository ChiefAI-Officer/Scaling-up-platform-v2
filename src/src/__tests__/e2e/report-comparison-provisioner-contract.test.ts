import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    styleCeoEmails: Record<string, string>;
    submissionCampaignExternalId: string;
    templateAlias: string;
    styles: Array<[string, string]>;
    roles: string[];
    invitationRoles: string[];
    relationshipContract: Record<string, boolean>;
  };
}

function fixtureVersionIdentity(key: string) {
  const source = [
    "import { REPORT_COMPARISON_FIXTURE_SCHEMA_VERSION, reportComparisonFixtureVersionHash } from './scripts/provision-report-comparison-e2e.mjs';",
    `console.log(JSON.stringify({ schemaVersion: REPORT_COMPARISON_FIXTURE_SCHEMA_VERSION, hash: reportComparisonFixtureVersionHash(${JSON.stringify(key)}) }));`,
  ].join(" ");
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: process.cwd(),
    env: { ...process.env },
    encoding: "utf8",
  })) as { schemaVersion: number; hash: string };
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
    expect(new Set(Object.values(fixture.styleCeoEmails))).toHaveProperty("size", 3);
    expect(Object.values(fixture.styleCeoEmails)).not.toContain(fixture.ceoEmail);
    expect(fixture.submissionCampaignExternalId).toBe(
      `${fixture.key}:CLASSIC:live-submit`,
    );
    expect(fixture.styles).toEqual([
      ["CLASSIC", "Classic"],
      ["EXECUTIVE_BOARDROOM", "Executive Boardroom"],
      ["MODERN_DASHBOARD", "Modern Dashboard"],
    ]);
    expect(fixture.roles).toEqual(expect.arrayContaining([
      "current-ceo", "prior-native-ceo", "prior-imported-ceo", "non-ceo",
      "pending-submit-ceo", "pending-submit-non-ceo", "other-org-same-email",
    ]));
    expect(fixture.invitationRoles).toEqual(expect.arrayContaining([
      "current-ceo", "non-ceo", "native-prior", "imported-prior",
      "pending-submit-ceo", "pending-submit-non-ceo", "other-org",
    ]));
    expect(fixture.relationshipContract).toEqual({
      everySubmissionHasInvitation: true,
      otherOrganizationHasEligibleHistory: true,
      currentCeoDisclosureEnabled: true,
      actualSubmissionInvitationsStartPending: true,
      actualSubmissionUsesSeparateFocusCampaign: true,
      actualSubmissionDisablesOutboundEmail: true,
      stylesUseDistinctSamePersonIdentities: true,
      reusesNamespacedTemplateVersion: true,
    });
  });

  it("launches the isolated production server with comparison, report-style, and on-screen-result gates enabled", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/start-report-style-e2e.mjs"),
      "utf8",
    );

    expect(source).toContain('process.env.WAVE_RC_REPORT_COMPARISON_ENABLED = "1"');
    expect(source).toContain('process.env.WAVE_REPORT_STYLES_ENABLED = "1"');
    expect(source).toContain('process.env.WAVE_OSR_RESPONDENT_RESULTS_ENABLED = "1"');
    expect(source).toContain('process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "0"');
    expect(source).toContain('process.env.ASSESSMENT_EMAIL_DELIVERY_INTENTS_ENABLED = "0"');
    expect(source).toContain('process.env.APP_URL = "http://localhost:3000"');
  });

  it("keeps the guarded browser contract explicit and derived from provisioned rows", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e/report-comparison.spec.ts"),
      "utf8",
    );

    expect(source).toContain("/portal/assessments/");
    expect(source).toContain("/admin/assessments/campaigns/");
    expect(source).toContain("reportComparisonInvitationToken");
    expect(source).toContain("completeInvitedSurvey");
    expect(source).toContain("pending and unsubmitted");
    expect(source).toContain("Compare with a previous assessment");
    expect(source).toContain("otherOrganizationSubmissionId");
    expect(source).toContain('setViewportSize({ width: 1440');
    expect(source).toContain('setViewportSize({ width: 390');
    expect(source).toContain(".pdf({");
    expect(source).toContain('showResultsOnScreen: false');
    expect(source).toContain('data: { isCEO: false }');
    expect(source).toContain('status: "SENT"');
    expect(source).toContain("otherOrganizationCampaignId");
    expect(source).toContain("reportStyleLockedAt");
    expect(source).toContain("submissionCampaignExternalId");
    expect(source).toContain("excludedDifferentIdentitySubmissionId");
    expect(source).toContain("exerciseOperatorComparison");
    expect(source).not.toContain("captureArtifacts: false");
    expect(source.match(/captureReportArtifacts\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain('viewer: "coach" | "admin";');
    expect(source).toContain('viewer: "coach" | "admin" | "ceo"');
    expect(source).toContain('style.style === "CLASSIC" ? "A4" : "Letter"');
    expect(source).toContain("submittedCampaign.reportStyleLockedAt");
    expect(source).toContain("assessmentEmailOutbox.count");
    expect(source).toContain("assessmentEmailDeliveryIntent.count");
    expect(source).toContain("nonCeoProtectedReportPath");
  });

  it("reuses a deterministic published fixture version without colliding with the pre-fix payload hash", () => {
    const fixture = plan();
    const first = fixtureVersionIdentity(fixture.key);
    const second = fixtureVersionIdentity(fixture.key);
    const legacyHash = createHash("sha256").update(fixture.key).digest("hex");

    expect(first.schemaVersion).toBeGreaterThan(1);
    expect(first.hash).not.toBe(legacyHash);
    expect(second).toEqual(first);

    const source = readFileSync(
      join(process.cwd(), "scripts/provision-report-comparison-e2e.mjs"),
      "utf8",
    );

    expect(source).toContain("existingFixtureVersion");
    expect(source).toContain("fixtureContentHash");
  });
});
