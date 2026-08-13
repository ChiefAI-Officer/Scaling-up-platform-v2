export type AllowedFinalPathname = string | RegExp;

export interface ResponsiveNavigationContract {
  requestedRoute: string;
  finalUrl: string;
  responsePresent: boolean;
  status: number | null;
  allowedFinalPathnames?: readonly AllowedFinalPathname[];
}

export type ResponsiveDesktopParityMode = "off" | "kill";
export type ResponsiveSurface = "auth-shell" | "report";
export type ResponsiveSurfaceRole = "admin" | "coach";

export interface ResponsiveSurfaceContract {
  surface: ResponsiveSurface;
  role: ResponsiveSurfaceRole;
  bodyResponsive: boolean;
  visibleAuthShellRoles: readonly ResponsiveSurfaceRole[];
  reportPageResponsive: boolean;
}

function pathnameOf(value: string): string {
  return new URL(value, "http://localhost").pathname;
}

function matchesPathname(pathname: string, expected: AllowedFinalPathname): boolean {
  if (typeof expected === "string") return pathname === expected;
  expected.lastIndex = 0;
  return expected.test(pathname);
}

function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function assertResponsiveNavigationContract({
  requestedRoute,
  finalUrl,
  responsePresent,
  status,
  allowedFinalPathnames = [],
}: ResponsiveNavigationContract): void {
  if (!responsePresent || status === null) {
    throw new Error(`${requestedRoute} did not return a navigation response`);
  }
  if (status >= 400) {
    throw new Error(`${requestedRoute} returned HTTP ${status}`);
  }

  const finalPathname = pathnameOf(finalUrl);
  if (finalPathname === "/login" || finalPathname === "/unauthorized") {
    throw new Error(`${requestedRoute} landed on the authentication fallback ${finalPathname}`);
  }

  const requestedPathname = pathnameOf(requestedRoute);
  if (
    finalPathname !== requestedPathname &&
    !allowedFinalPathnames.some((expected) => matchesPathname(finalPathname, expected))
  ) {
    throw new Error(
      `${requestedRoute} reached unexpected final pathname ${finalPathname}`,
    );
  }
}

export function isShelllessAssessmentReportRoute(route: string): boolean {
  return /^\/assessments\/[^/]+(?:\/respondents\/[^/]+)?\/report$/.test(
    pathnameOf(route),
  );
}

export function assertResponsiveSurfaceContract({
  surface,
  role,
  bodyResponsive,
  visibleAuthShellRoles,
  reportPageResponsive,
}: ResponsiveSurfaceContract): void {
  if (!bodyResponsive) {
    throw new Error(`${surface} route is missing the responsive body flag`);
  }

  if (surface === "report") {
    if (visibleAuthShellRoles.length > 0) {
      throw new Error("shell-less report route rendered an authenticated dashboard shell");
    }
    if (!reportPageResponsive) {
      throw new Error("shell-less report route is missing its responsive report marker");
    }
    return;
  }

  if (!visibleAuthShellRoles.includes(role)) {
    throw new Error(`${role} dashboard route is missing its authenticated shell`);
  }
}

export function assertDesktopParityEnvironment(
  mode: ResponsiveDesktopParityMode,
  env: NodeJS.ProcessEnv,
): void {
  const enabled = isOn(env.WAVE_MOBILE_RESPONSIVE_ENABLED);
  const killed = isOn(env.WAVE_MOBILE_RESPONSIVE_KILL);

  if (mode === "off") {
    if (enabled || killed) {
      throw new Error("OFF parity mode requires the responsive wave to be disabled");
    }
    return;
  }

  if (!enabled || !killed) {
    throw new Error("KILL parity mode requires both responsive flags to equal 1");
  }
}
