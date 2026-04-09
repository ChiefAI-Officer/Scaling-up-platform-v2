import { resolveAuthPosture } from "@/lib/auth/auth-posture";

describe("resolveAuthPosture", () => {
  it("enables demo mode only in local development", () => {
    const posture = resolveAuthPosture({
      NODE_ENV: "development",
      DEMO_MODE: "true",
    });

    expect(posture.isLocalDevelopment).toBe(true);
    expect(posture.effectiveDemoMode).toBe(true);
    expect(posture.guardViolation).toBe(false);
    expect(posture.deploymentContext).toBe("local-development");
  });

  it("blocks demo mode in Vercel preview", () => {
    const posture = resolveAuthPosture({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      DEMO_MODE: "true",
    });

    expect(posture.isLocalDevelopment).toBe(false);
    expect(posture.effectiveDemoMode).toBe(false);
    expect(posture.guardViolation).toBe(true);
    expect(posture.deploymentContext).toBe("vercel-preview");
  });

  it("keeps production safe when demo mode is disabled", () => {
    const posture = resolveAuthPosture({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      DEMO_MODE: "false",
    });

    expect(posture.effectiveDemoMode).toBe(false);
    expect(posture.guardViolation).toBe(false);
    expect(posture.deploymentContext).toBe("vercel-production");
  });
});
