export type AllowedFinalPathname = string | RegExp;

export interface ResponsiveNavigationContract {
  requestedRoute: string;
  finalUrl: string;
  responsePresent: boolean;
  status: number | null;
  allowedFinalPathnames?: readonly AllowedFinalPathname[];
}

export type ResponsiveDesktopParityMode = "off" | "kill";

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
