import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertDesktopParityEnvironment,
  assertResponsiveNavigationContract,
} from "../../../e2e/helpers/responsive-route-contract";

const readE2e = (file: string) =>
  readFileSync(resolve(process.cwd(), "e2e", file), "utf8");

describe("responsive authenticated navigation contract", () => {
  const base = {
    requestedRoute: "/portal/home",
    finalUrl: "http://localhost:3000/portal/home",
    responsePresent: true,
    status: 200,
  } as const;

  it("fails closed when Playwright has no navigation response", () => {
    expect(() => assertResponsiveNavigationContract({
      ...base,
      responsePresent: false,
    })).toThrow("did not return a navigation response");
  });

  it.each(["/login", "/unauthorized"])(
    "rejects an authenticated route that lands on %s even with HTTP 200",
    (pathname) => {
      expect(() => assertResponsiveNavigationContract({
        ...base,
        finalUrl: `http://localhost:3000${pathname}`,
      })).toThrow(`landed on the authentication fallback ${pathname}`);
    },
  );

  it("rejects an arbitrary successful redirect", () => {
    expect(() => assertResponsiveNavigationContract({
      ...base,
      finalUrl: "http://localhost:3000/portal/workshops",
    })).toThrow("unexpected final pathname /portal/workshops");
  });

  it("allows the dashboard redirect only when the caller names it", () => {
    const redirected = {
      ...base,
      requestedRoute: "/dashboard",
      finalUrl: "http://localhost:3000/admin/dashboard",
    };

    expect(() => assertResponsiveNavigationContract(redirected)).toThrow(
      "unexpected final pathname /admin/dashboard",
    );
    expect(() => assertResponsiveNavigationContract({
      ...redirected,
      allowedFinalPathnames: ["/admin/dashboard"],
    })).not.toThrow();
  });

  it("allows a template detail redirect only through the caller's editor pattern", () => {
    const redirected = {
      ...base,
      requestedRoute: "/admin/assessments/templates/template-1",
      finalUrl: "http://localhost:3000/admin/assessments/templates/template-1/versions/version-2/edit?tab=preview",
    };

    expect(() => assertResponsiveNavigationContract(redirected)).toThrow(
      "unexpected final pathname",
    );
    expect(() => assertResponsiveNavigationContract({
      ...redirected,
      allowedFinalPathnames: [
        /^\/admin\/assessments\/templates\/[^/]+\/versions\/[^/]+\/edit$/,
      ],
    })).not.toThrow();
  });
});

describe("responsive OFF/KILL desktop parity lane", () => {
  it("accepts only a genuinely disabled OFF environment", () => {
    expect(() => assertDesktopParityEnvironment("off", {})).not.toThrow();
    expect(() => assertDesktopParityEnvironment("off", {
      WAVE_MOBILE_RESPONSIVE_ENABLED: "1",
    })).toThrow("OFF parity mode requires the responsive wave to be disabled");
  });

  it("accepts only ENABLED=1 plus KILL=1 for the KILL environment", () => {
    expect(() => assertDesktopParityEnvironment("kill", {
      WAVE_MOBILE_RESPONSIVE_ENABLED: "1",
      WAVE_MOBILE_RESPONSIVE_KILL: "1",
    })).not.toThrow();
    expect(() => assertDesktopParityEnvironment("kill", {
      WAVE_MOBILE_RESPONSIVE_KILL: "1",
    })).toThrow("KILL parity mode requires both responsive flags");
  });
});

describe("browser-blocked responsive harness source contract", () => {
  it("routes Axe and visual navigation through the authenticated responsive guard", () => {
    for (const file of [
      "mobile-responsive-a11y.spec.ts",
      "mobile-responsive-visual.spec.ts",
    ]) {
      const source = readE2e(file);
      expect(source).toContain("expectResponsiveRoute");
      expect(source).not.toMatch(/await page\.goto\(/);
    }
  });

  it("pins real overlay state before and after keyboard dismissal", () => {
    for (const file of [
      "mobile-responsive-state.spec.ts",
      "mobile-responsive-a11y.spec.ts",
    ]) {
      const source = readE2e(file);
      expect(source).toContain('toHaveAttribute("aria-expanded", "true")');
      expect(source).toContain('toHaveAttribute("aria-expanded", "false")');
      expect(source).toContain("toBeVisible()");
      expect(source).toContain("toBeHidden()");
      expect(source).toContain("toBeFocused()");
    }
  });

  it("pins exact organization, member identity, aria selection, visibility, and fetch stability", () => {
    const source = readE2e("mobile-responsive-state.spec.ts");
    expect(source).toContain("selectedOrganizationName");
    expect(source).toContain("selectedMemberTestId");
    expect(source).toContain('toHaveAttribute("aria-pressed", "true")');
    expect(source).toContain("toBeVisible()");
    expect(source).toContain("respondentFetches");
  });

  it("keeps an opt-in OFF/KILL parity artifact and omits fictional volatile selectors", () => {
    const source = readE2e("mobile-responsive-visual.spec.ts");
    expect(source).toContain("MOBILE_RESPONSIVE_DESKTOP_PARITY_MODE");
    expect(source).toContain("assertDesktopParityEnvironment");
    expect(source).toContain('responsiveMode: "off"');
    expect(source).not.toContain("[data-volatile]");
  });

  it("keeps kill-switch overflow proof opt-in, marker-OFF, and offender-named", () => {
    const source = readE2e("mobile-responsive-kill-diagnostic.spec.ts");
    expect(source).toContain("MOBILE_RESPONSIVE_KILL_DIAGNOSTIC");
    expect(source).toContain("expectResponsiveKillSwitchOverflow");
    expect(source).toContain('assertDesktopParityEnvironment("kill"');
    expect(source).toContain('contentType: "application/json"');
    expect(source).not.toContain("expectResponsiveRoute");
  });
});
