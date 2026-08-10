import { isAdminOwnedAssessmentPresentationEnabled } from "@/lib/assessments/wave-admin-owned-assessment-presentation-flags";

const ENABLED = "WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED";
const KILL = "WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL";

afterEach(() => {
  delete process.env[ENABLED];
  delete process.env[KILL];
});

describe("admin-owned assessment presentation flag", () => {
  it("is off by default", () => {
    expect(isAdminOwnedAssessmentPresentationEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("accepts %s as enabled", (value) => {
    process.env[ENABLED] = value;
    expect(isAdminOwnedAssessmentPresentationEnabled()).toBe(true);
  });

  it("reads environment state at call time", () => {
    expect(isAdminOwnedAssessmentPresentationEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isAdminOwnedAssessmentPresentationEnabled()).toBe(true);
  });

  it("lets the kill switch override enablement", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "yes";
    expect(isAdminOwnedAssessmentPresentationEnabled()).toBe(false);
  });
});
