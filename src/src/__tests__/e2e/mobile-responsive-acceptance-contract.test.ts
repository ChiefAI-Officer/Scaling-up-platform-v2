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

type WorkshopRouteSummary = {
  admin: { reserved: boolean; detail: boolean };
  coach: { reserved: boolean; detail: boolean };
  derived: {
    adminSurvey: boolean;
    adminSurveyHref: string;
    coachSurvey: boolean;
    adminLanding: boolean;
    invalidAdminSurveyRejected: boolean;
  };
};

type CoachRouteSummary = {
  reserved: boolean;
  detail: boolean;
  edit: boolean;
  invalidEditRejected: boolean;
};

type LiveHrefDiscoverySummary = {
  delayedHref: string | null;
  delayedReads: number;
  reservedHref: string | null;
  emptyHref: string | null;
  emptyReads: number;
  populatedWithoutDetailRejected: boolean;
  workflowSeedAccepted: boolean;
  workflowCreateRejected: boolean;
  surveySeedAccepted: boolean;
  surveyCreateRejected: boolean;
  authRedirectRejected: boolean;
  missingSourceRejected: boolean;
};

type ResponsiveSurfaceSummary = {
  assessmentReportClassified: boolean;
  respondentReportClassified: boolean;
  longitudinalKeptInShell: boolean;
  arbitraryReportKeptInShell: boolean;
  validReportAccepted: boolean;
  missingReportMarkerRejected: boolean;
  missingBodyFlagRejected: boolean;
  reportWithShellRejected: boolean;
  reportWithUnknownShellRejected: boolean;
  dashboardWithoutShellRejected: boolean;
};

type CoachResponsiveContextSummary = {
  campaignReport: { role: string; responsiveSurface: string };
  respondentReport: { role: string; responsiveSurface: string };
  longitudinal: { role: string; responsiveSurface: string };
  ordinary: { role: string; responsiveSurface: string };
  ordinaryWithoutCoachShellRejected: boolean;
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

function inspectWorkshopRouteContract(): WorkshopRouteSummary | null {
  try {
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `import importedContract from "./e2e/helpers/workshop-route-contract";
const { workshopChildHref, workshopChildHrefPattern, workshopDetailHrefPattern } = importedContract.default ?? importedContract;
const adminDetail = "/workshops/cm1234567890abcdefghijkl";
const coachDetail = "/portal/workshops/cm1234567890abcdefghijkl";
let invalidAdminSurveyRejected = false;
try {
  workshopChildHref("/workshops/new", "surveys");
} catch {
  invalidAdminSurveyRejected = true;
}

console.log(JSON.stringify({
  admin: {
    reserved: workshopDetailHrefPattern("admin").test("/workshops/new"),
    detail: workshopDetailHrefPattern("admin").test(adminDetail),
  },
  coach: {
    reserved: workshopDetailHrefPattern("coach").test("/portal/workshops/new"),
    detail: workshopDetailHrefPattern("coach").test(coachDetail),
  },
  derived: {
    adminSurvey: workshopChildHrefPattern(adminDetail, "surveys").test(adminDetail + "/surveys"),
    adminSurveyHref: workshopChildHref(adminDetail, "surveys"),
    coachSurvey: workshopChildHrefPattern(coachDetail, "surveys").test(coachDetail + "/surveys"),
    adminLanding: workshopChildHrefPattern(adminDetail, "landing-pages").test(adminDetail + "/landing-pages"),
    invalidAdminSurveyRejected,
  },
}));`,
      ],
      { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(output) as WorkshopRouteSummary;
  } catch {
    return null;
  }
}

function inspectCoachRouteContract(): CoachRouteSummary | null {
  try {
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `import importedContract from "./e2e/helpers/coach-route-contract";
const { coachDetailHrefPattern, coachEditHrefPattern } = importedContract.default ?? importedContract;
const detail = "/coaches/cm1234567890abcdefghijkl";
let invalidEditRejected = false;
try {
  coachEditHrefPattern("/coaches/new");
} catch {
  invalidEditRejected = true;
}
console.log(JSON.stringify({
  reserved: coachDetailHrefPattern().test("/coaches/new"),
  detail: coachDetailHrefPattern().test(detail),
  edit: coachEditHrefPattern(detail).test(detail + "/edit"),
  invalidEditRejected,
}));`,
      ],
      { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(output) as CoachRouteSummary;
  } catch {
    return null;
  }
}

function inspectLiveHrefDiscoveryContract(): LiveHrefDiscoverySummary | null {
  try {
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `import importedContract from "./e2e/helpers/live-href-discovery-contract";
const {
  cuidDetailHrefPattern,
  discoverSettledHref,
  nonReservedDetailHrefPattern,
} = importedContract.default ?? importedContract;
const navigation = (requestedRoute, finalUrl = requestedRoute, status = 200) => ({
  requestedRoute,
  finalUrl: "https://preview.example.test" + finalUrl,
  responsePresent: true,
  status,
});

let delayedReads = 0;
const delayedHref = await discoverSettledHref({
  navigate: async () => navigation("/admin/assessments/access-groups"),
  settle: async () => 1,
  readHrefs: async () => {
    delayedReads += 1;
    return delayedReads < 3 ? [] : ["/admin/assessments/access-groups/cm1234567890abcdefghijkl"];
  },
  pattern: cuidDetailHrefPattern("/admin/assessments/access-groups"),
  label: "access-group detail",
  pollIntervalMs: 0,
  timeoutMs: 100,
});

let reservedReads = 0;
const reservedHref = await discoverSettledHref({
  navigate: async () => navigation("/admin/assessments/templates"),
  settle: async () => 1,
  readHrefs: async () => {
    reservedReads += 1;
    return reservedReads === 1
      ? ["/admin/assessments/templates/new"]
      : [
          "/admin/assessments/templates/new",
          "/admin/assessments/templates/cm1234567890abcdefghijkl",
        ];
  },
  pattern: cuidDetailHrefPattern("/admin/assessments/templates"),
  label: "assessment template detail",
  pollIntervalMs: 0,
  timeoutMs: 100,
});

let emptyReads = 0;
const emptyHref = await discoverSettledHref({
  navigate: async () => navigation("/admin/assessments/campaigns"),
  settle: async () => 0,
  readHrefs: async () => {
    emptyReads += 1;
    return [];
  },
  pattern: cuidDetailHrefPattern("/admin/assessments/campaigns"),
  label: "campaign detail",
  pollIntervalMs: 0,
  timeoutMs: 0,
});

let populatedWithoutDetailRejected = false;
try {
  await discoverSettledHref({
    navigate: async () => navigation("/admin/assessments/access-groups"),
    settle: async () => 1,
    readHrefs: async () => ["/admin/assessments/access-groups"],
    pattern: cuidDetailHrefPattern("/admin/assessments/access-groups"),
    label: "access-group detail",
    pollIntervalMs: 0,
    timeoutMs: 0,
  });
} catch {
  populatedWithoutDetailRejected = true;
}

const workflowPattern = nonReservedDetailHrefPattern("/admin/workflows");
const surveyPattern = nonReservedDetailHrefPattern("/admin/surveys/templates");

let authRedirectRejected = false;
try {
  await discoverSettledHref({
    navigate: async () => navigation("/admin/workflows", "/login"),
    settle: async () => 0,
    readHrefs: async () => [],
    pattern: workflowPattern,
    label: "workflow detail",
  });
} catch {
  authRedirectRejected = true;
}

let missingSourceRejected = false;
try {
  await discoverSettledHref({
    navigate: async () => navigation("/admin/workflows", "/admin/workflows", 404),
    settle: async () => 0,
    readHrefs: async () => [],
    pattern: workflowPattern,
    label: "workflow detail",
  });
} catch {
  missingSourceRejected = true;
}

console.log(JSON.stringify({
  delayedHref,
  delayedReads,
  reservedHref,
  emptyHref,
  emptyReads,
  populatedWithoutDetailRejected,
  workflowSeedAccepted: workflowPattern.test("/admin/workflows/post-event-coach-survey-workflow-seed"),
  workflowCreateRejected: workflowPattern.test("/admin/workflows/new") === false,
  surveySeedAccepted: surveyPattern.test("/admin/surveys/templates/coach-post-workshop-seed"),
  surveyCreateRejected: surveyPattern.test("/admin/surveys/templates/new") === false,
  authRedirectRejected,
  missingSourceRejected,
}));`,
      ],
      { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(output) as LiveHrefDiscoverySummary;
  } catch {
    return null;
  }
}

function inspectResponsiveSurfaceContract(): ResponsiveSurfaceSummary | null {
  try {
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `import importedContract from "./e2e/helpers/responsive-route-contract";
const {
  assertResponsiveSurfaceContract,
  isShelllessAssessmentReportRoute,
} = importedContract.default ?? importedContract;

const report = {
  surface: "shellless-report",
  role: "admin",
  bodyResponsive: true,
  visibleAuthShellCount: 0,
  visibleAuthShellRoles: [],
  reportPageResponsive: true,
};
let validReportAccepted = true;
try { assertResponsiveSurfaceContract(report); } catch { validReportAccepted = false; }

const rejected = (overrides) => {
  try {
    assertResponsiveSurfaceContract({ ...report, ...overrides });
    return false;
  } catch {
    return true;
  }
};

console.log(JSON.stringify({
  assessmentReportClassified: isShelllessAssessmentReportRoute("/assessments/campaign-1/report?view=full"),
  respondentReportClassified: isShelllessAssessmentReportRoute("/assessments/campaign-1/respondents/person-1/report"),
  longitudinalKeptInShell: !isShelllessAssessmentReportRoute("/portal/assessments/respondents/person-1/longitudinal"),
  arbitraryReportKeptInShell: !isShelllessAssessmentReportRoute("/admin/arbitrary/report"),
  validReportAccepted,
  missingReportMarkerRejected: rejected({ reportPageResponsive: false }),
  missingBodyFlagRejected: rejected({ bodyResponsive: false }),
  reportWithShellRejected: rejected({
    visibleAuthShellCount: 1,
    visibleAuthShellRoles: ["admin"],
  }),
  reportWithUnknownShellRejected: rejected({
    visibleAuthShellCount: 1,
    visibleAuthShellRoles: [],
  }),
  dashboardWithoutShellRejected: rejected({
    surface: "auth-shell",
    reportPageResponsive: false,
  }),
}));`,
      ],
      { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(output) as ResponsiveSurfaceSummary;
  } catch {
    return null;
  }
}

function inspectCoachResponsiveContext(): CoachResponsiveContextSummary | null {
  try {
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `import importedContract from "./e2e/helpers/responsive-route-contract";
const {
  assertResponsiveSurfaceContract,
  responsivePresentationContext,
} = importedContract.default ?? importedContract;
const campaignReport = responsivePresentationContext("coach", "/assessments/campaign-1/report?view=full");
const respondentReport = responsivePresentationContext("coach", "/assessments/campaign-1/respondents/person-1/report");
const longitudinal = responsivePresentationContext("coach", "/portal/assessments/respondents/person-1/longitudinal");
const ordinary = responsivePresentationContext("coach", "/portal/home");
let ordinaryWithoutCoachShellRejected = false;
try {
  assertResponsiveSurfaceContract({
    surface: ordinary.responsiveSurface,
    role: ordinary.role,
    bodyResponsive: true,
    visibleAuthShellCount: 0,
    visibleAuthShellRoles: [],
    reportPageResponsive: false,
  });
} catch {
  ordinaryWithoutCoachShellRejected = true;
}
console.log(JSON.stringify({
  campaignReport,
  respondentReport,
  longitudinal,
  ordinary,
  ordinaryWithoutCoachShellRejected,
}));`,
      ],
      { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(output) as CoachResponsiveContextSummary;
  } catch {
    return null;
  }
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

  it("keeps shell-less report auth redirects and missing routes fail-closed", () => {
    const reportRoute = "/assessments/campaign-1/report";

    expect(() => assertResponsiveNavigationContract({
      requestedRoute: reportRoute,
      finalUrl: "http://localhost:3000/login",
      responsePresent: true,
      status: 200,
    })).toThrow("authentication fallback /login");
    expect(() => assertResponsiveNavigationContract({
      requestedRoute: reportRoute,
      finalUrl: `http://localhost:3000${reportRoute}`,
      responsePresent: true,
      status: 404,
    })).toThrow("returned HTTP 404");
  });
});

describe("responsive authenticated surface contract", () => {
  it("classifies only the two shell-less assessment report route shapes", () => {
    const summary = inspectResponsiveSurfaceContract();
    expect(summary?.assessmentReportClassified).toBe(true);
    expect(summary?.respondentReportClassified).toBe(true);
    expect(summary?.longitudinalKeptInShell).toBe(true);
    expect(summary?.arbitraryReportKeptInShell).toBe(true);
  });

  it("accepts a responsive report only with its route marker, body flag, and no auth shell", () => {
    const summary = inspectResponsiveSurfaceContract();
    expect(summary?.validReportAccepted).toBe(true);
    expect(summary?.missingReportMarkerRejected).toBe(true);
    expect(summary?.missingBodyFlagRejected).toBe(true);
    expect(summary?.reportWithShellRejected).toBe(true);
    expect(summary?.reportWithUnknownShellRejected).toBe(true);
  });

  it("does not weaken the dashboard auth-shell requirement", () => {
    expect(
      inspectResponsiveSurfaceContract()?.dashboardWithoutShellRejected,
    ).toBe(true);
  });

  it("gives coach consumers report presentation only for standalone report routes", () => {
    const summary = inspectCoachResponsiveContext();
    expect(summary?.campaignReport).toEqual({
      role: "coach",
      responsiveSurface: "shellless-report",
    });
    expect(summary?.respondentReport).toEqual({
      role: "coach",
      responsiveSurface: "shellless-report",
    });
    expect(summary?.longitudinal).toEqual({
      role: "coach",
      responsiveSurface: "auth-shell",
    });
    expect(summary?.ordinary).toEqual({
      role: "coach",
      responsiveSurface: "auth-shell",
    });
    expect(summary?.ordinaryWithoutCoachShellRejected).toBe(true);
  });
});

describe("live populated href discovery contract", () => {
  it("polls through initial empty scans until a delayed valid detail anchor appears", () => {
    const summary = inspectLiveHrefDiscoveryContract();
    expect(summary?.delayedHref).toBe(
      "/admin/assessments/access-groups/cm1234567890abcdefghijkl",
    );
    expect(summary?.delayedReads).toBe(3);
  });

  it("ignores a reserved create owner while waiting for a real detail", () => {
    expect(inspectLiveHrefDiscoveryContract()?.reservedHref).toBe(
      "/admin/assessments/templates/cm1234567890abcdefghijkl",
    );
  });

  it("returns no candidate for an authoritatively settled empty collection", () => {
    const summary = inspectLiveHrefDiscoveryContract();
    expect(summary?.emptyHref).toBeNull();
    expect(summary?.emptyReads).toBe(0);
  });

  it("fails when a settled populated collection never exposes a valid detail", () => {
    expect(
      inspectLiveHrefDiscoveryContract()?.populatedWithoutDetailRejected,
    ).toBe(true);
  });

  it("accepts valid non-CUID workflow and survey seeds but rejects their create owners", () => {
    const summary = inspectLiveHrefDiscoveryContract();
    expect(summary?.workflowSeedAccepted).toBe(true);
    expect(summary?.workflowCreateRejected).toBe(true);
    expect(summary?.surveySeedAccepted).toBe(true);
    expect(summary?.surveyCreateRejected).toBe(true);
  });

  it("keeps authentication redirects and missing collection routes fail-closed", () => {
    const summary = inspectLiveHrefDiscoveryContract();
    expect(summary?.authRedirectRejected).toBe(true);
    expect(summary?.missingSourceRejected).toBe(true);
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

  it("keeps unconditional admin owners static and conditionally discovers public-campaign creation", () => {
    const source = readE2e("mobile-responsive-admin.spec.ts");
    const staticInventory = source.slice(
      source.indexOf("export const ADMIN_ROUTES"),
      source.indexOf("] as const;"),
    );

    for (const route of [
      "/workshops/new",
      "/templates/new",
      "/admin/workflows/new",
      "/admin/assessments/delivery-holds",
      "/admin/surveys/templates/new",
    ]) {
      expect(staticInventory).toContain(`"${route}"`);
    }
    expect(staticInventory).not.toContain('"/admin/assessments/public-campaigns/new"');
    expect(source).toContain('const PUBLIC_CAMPAIGN_CREATE_ROUTE = "/admin/assessments/public-campaigns/new"');
    expect(source).toMatch(/optionalHrefs\(\s*page,\s*"\/admin\/assessments\/public-campaigns",/);
    expect(source).toContain("publicCampaignCreateRoutes");
    expect(source).not.toContain('"/admin/surveys/report-style-preview"');
  });

  it("keeps the selected workshop surveys owner in populated admin route discovery", () => {
    const source = readE2e("mobile-responsive-admin.spec.ts");

    expect(source).toContain('workshopChildHref(workshopDetail, "surveys")');
    expect(source).toContain("workshopSurvey");
    expect(source).toContain("workshopDetail");
  });

  it("rejects reserved workshop owners while accepting ID-shaped details and deriving child routes", () => {
    expect(inspectWorkshopRouteContract()).toEqual({
      admin: { reserved: false, detail: true },
      coach: { reserved: false, detail: true },
      derived: {
        adminSurvey: true,
        adminSurveyHref: "/workshops/cm1234567890abcdefghijkl/surveys",
        coachSurvey: true,
        adminLanding: true,
        invalidAdminSurveyRejected: true,
      },
    });

    const adminSource = readE2e("mobile-responsive-admin.spec.ts");
    const coachSource = readE2e("mobile-responsive-coach.spec.ts");
    expect(adminSource).toContain('workshopDetailHrefPattern("admin")');
    expect(coachSource).toContain('workshopDetailHrefPattern("coach")');
    expect(adminSource).toContain('workshopChildHref(workshopDetail, "surveys")');
    expect(coachSource).toContain('workshopChildHrefPattern(workshopDetail, "surveys")');
  });

  it("derives the required admin survey owner without requiring a detail-page shortcut", () => {
    const adminSource = readE2e("mobile-responsive-admin.spec.ts");
    const coachSource = readE2e("mobile-responsive-coach.spec.ts");

    expect(adminSource).toContain('const workshopSurvey = workshopChildHref(workshopDetail, "surveys")');
    expect(adminSource).not.toMatch(/const workshopSurvey = await firstMatchingHref/);
    expect(adminSource).toContain("expectResponsiveRoute");
    expect(coachSource).toMatch(/const workshopSurvey = await firstMatchingHref/);
    expect(coachSource).toContain('workshopChildHrefPattern(workshopDetail, "surveys")');
  });

  it("rejects the reserved coach-create owner while accepting CUID details and rooted edits", () => {
    expect(inspectCoachRouteContract()).toEqual({
      reserved: false,
      detail: true,
      edit: true,
      invalidEditRejected: true,
    });
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
