// eslint-disable-next-line no-var -- Jest evaluates this mock factory before imports.
var mockAuthOptions: {
  callbacks: { authorized: (args: { token: unknown; req: { nextUrl: { pathname: string } } }) => boolean };
} | undefined;

jest.mock("next-auth/middleware", () => ({
  withAuth: (handler: unknown, options: typeof mockAuthOptions) => {
    mockAuthOptions = options;
    return handler;
  },
}));

function response() {
  const values = new Map<string, string>();
  return {
    headers: { set: (name: string, value: string) => values.set(name, value), get: (name: string) => values.get(name) },
    status: 200,
  };
}

jest.mock("next/server", () => ({
  NextResponse: {
    next: () => response(),
    redirect: () => response(),
    json: () => response(),
  },
}));
jest.mock("@/lib/global-rate-limit", () => ({
  enforceGlobalApiRateLimit: () => ({ enforced: false }),
  getRequestIdentifierFromHeaders: () => "test",
}));
const mockReportComparisonRolloutActive = jest.fn(() => true);
jest.mock("@/lib/assessments/wave-report-comparison-flags", () => ({
  isReportComparisonRolloutActive: () => mockReportComparisonRolloutActive(),
}));

import middleware from "@/middleware";

function request(pathname: string, token: unknown = null) {
  return {
    nextauth: { token },
    nextUrl: { pathname },
    method: "GET",
    headers: new Headers(),
    url: `https://platform.example${pathname}`,
  } as Parameters<typeof middleware>[0];
}

function runMiddleware(pathname: string, token: unknown = null): ReturnType<typeof response> {
  return middleware(request(pathname, token), {} as never) as unknown as ReturnType<typeof response>;
}

describe("CEO self-report middleware policy", () => {
  beforeEach(() => {
    mockReportComparisonRolloutActive.mockReturnValue(true);
  });

  it("allows only the exact public exchange shell and individual report path without an account", () => {
    expect(mockAuthOptions?.callbacks.authorized({ token: null, req: request("/assessments/self-report") })).toBe(true);
    expect(mockAuthOptions?.callbacks.authorized({ token: null, req: request("/assessments/self-report/exchange") })).toBe(true);
    expect(mockAuthOptions?.callbacks.authorized({ token: null, req: request("/assessments/campaign-1/respondents/respondent-1/report") })).toBe(true);
    expect(mockAuthOptions?.callbacks.authorized({ token: null, req: request("/assessments/campaign-1/respondents/respondent-1/report/extra") })).toBe(false);
    expect(mockAuthOptions?.callbacks.authorized({ token: null, req: request("/assessments/self-report/other") })).toBe(false);
  });

  it("preserves authentication for the group report", () => {
    expect(mockAuthOptions?.callbacks.authorized({ token: null, req: request("/assessments/campaign-1/report") })).toBe(false);
    expect(mockAuthOptions?.callbacks.authorized({ token: { sub: "user-1" }, req: request("/assessments/campaign-1/report", { sub: "user-1" }) })).toBe(true);
  });

  it("requires authentication for all capability surfaces while rollout is globally inactive", () => {
    mockReportComparisonRolloutActive.mockReturnValue(false);

    expect(mockAuthOptions?.callbacks.authorized({ token: null, req: request("/assessments/self-report") })).toBe(false);
    expect(mockAuthOptions?.callbacks.authorized({ token: null, req: request("/assessments/self-report/exchange") })).toBe(false);
    expect(mockAuthOptions?.callbacks.authorized({ token: null, req: request("/assessments/campaign-1/respondents/respondent-1/report") })).toBe(false);
  });

  it("sets no-store and no-referrer headers on every PII report response", () => {
    const shell = runMiddleware("/assessments/self-report");
    const exchange = runMiddleware("/assessments/self-report/exchange");
    const individual = runMiddleware("/assessments/campaign-1/respondents/respondent-1/report");
    const selfComparison = runMiddleware("/assessments/campaign-1/self-comparison", { sub: "user-1" });

    expect(shell.headers.get("Cache-Control")).toBe("no-store, private");
    expect(shell.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(exchange.headers.get("Cache-Control")).toBe("no-store, private");
    expect(exchange.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(individual.headers.get("Cache-Control")).toBe("no-store, private");
    expect(individual.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(selfComparison.headers.get("Cache-Control")).toBe("no-store, private");
    expect(selfComparison.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("keeps the established no-store group-report behavior", () => {
    const group = runMiddleware("/assessments/campaign-1/report", { sub: "user-1" });
    const condensed = runMiddleware("/assessments/campaign-1/report/condensed", { sub: "user-1" });
    expect(group.headers.get("Cache-Control")).toBe("no-store, private");
    expect(condensed.headers.get("Cache-Control")).toBe("no-store, private");
  });
});
