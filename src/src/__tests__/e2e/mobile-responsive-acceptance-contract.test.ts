import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertDesktopParityEnvironment,
  assertResponsiveNavigationContract,
} from "../../../e2e/helpers/responsive-route-contract";

const readE2e = (file: string) =>
  readFileSync(resolve(process.cwd(), "e2e", file), "utf8");

type PlaywrightConfigSummary = {
  baseURL: string;
  hasWebServer: boolean;
};

function inspectPlaywrightConfig(override?: string): PlaywrightConfigSummary {
  const environment = { ...process.env };
  if (override === undefined) delete environment.PLAYWRIGHT_BASE_URL;
  else environment.PLAYWRIGHT_BASE_URL = override;

  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `import importedConfig from "./playwright.config"; const config = importedConfig.default ?? importedConfig; console.log(JSON.stringify({ baseURL: config.use?.baseURL, hasWebServer: Boolean(config.webServer) }));`,
    ],
    { cwd: process.cwd(), env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return JSON.parse(output) as PlaywrightConfigSummary;
}

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
  it("keeps the coach inventory free of the stale public-leads redirect and conditionally discovers the exposed referred-results owner", () => {
    const source = readE2e("mobile-responsive-coach.spec.ts");

    expect(source).not.toContain('"/portal/assessments/public-leads"');
    expect(source).toContain('const REFERRED_RESULTS_ROUTE = "/portal/assessments/referred-results"');
    expect(source).toMatch(/optionalHrefs\(\s*page,\s*"\/portal\/assessments",/);
    expect(source).toContain("referredResultsRoutes");
  });

  it("covers all reachable admin create and operations owners in the static inventory", () => {
    const source = readE2e("mobile-responsive-admin.spec.ts");

    for (const route of [
      "/workshops/new",
      "/templates/new",
      "/admin/workflows/new",
      "/admin/assessments/delivery-holds",
      "/admin/assessments/public-campaigns/new",
      "/admin/surveys/templates/new",
    ]) {
      expect(source).toContain(`"${route}"`);
    }
    expect(source).not.toContain('"/admin/surveys/report-style-preview"');
  });

  it("keeps the selected workshop surveys owner in populated admin route discovery", () => {
    const source = readE2e("mobile-responsive-admin.spec.ts");

    expect(source).toContain("admin workshop survey");
    expect(source).toContain("workshopSurvey");
    expect(source).toContain("workshopDetail");
  });

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

describe("Playwright authorized-preview base URL contract", () => {
  it("keeps localhost and the guarded local web server without an override", () => {
    expect(inspectPlaywrightConfig()).toEqual({
      baseURL: "http://localhost:3000",
      hasWebServer: true,
    });
  });

  it("uses a valid HTTPS preview override without starting a local web server", () => {
    expect(inspectPlaywrightConfig("https://preview.example.test")).toEqual({
      baseURL: "https://preview.example.test",
      hasWebServer: false,
    });
  });

  it.each(["preview.example.test", "ftp://preview.example.test"])(
    "rejects a malformed or non-HTTP preview override: %s",
    (override) => {
      expect(() => inspectPlaywrightConfig(override)).toThrow();
    },
  );
});
