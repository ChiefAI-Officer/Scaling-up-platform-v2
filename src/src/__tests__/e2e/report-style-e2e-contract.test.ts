import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type GuardModule = {
  createAssessmentReportE2eWebServer: (env: NodeJS.ProcessEnv) => undefined | {
    command: string;
    reuseExistingServer: boolean;
    env: NodeJS.ProcessEnv;
  };
  createReportStyleWebServer: (env: NodeJS.ProcessEnv) => undefined | {
    command: string;
    reuseExistingServer: boolean;
    env: NodeJS.ProcessEnv;
  };
  expectedRaceReportStyle: (status: number) => "CLASSIC" | "MODERN_DASHBOARD";
  productionServerCommands: (options: {
    cwd: string;
    execPath: string;
    platform: NodeJS.Platform;
  }) => {
    build: { command: string; args: string[] };
    start: { command: string; args: string[] };
  };
  assertDisposableReportStyleDatabase: (options: {
    env: NodeJS.ProcessEnv;
    createClient: (databaseUrl: string) => {
      organization: {
        findUnique: (args: unknown) => Promise<{ id: string; name: string; deletedAt: Date | null } | null>;
      };
      $disconnect: () => Promise<void>;
    };
  }) => Promise<void>;
  assertDisposableReportComparisonDatabase: (options: {
    env: NodeJS.ProcessEnv;
    createClient: (databaseUrl: string) => {
      organization: { findUnique: (args: unknown) => Promise<{ id: string; name: string; deletedAt: Date | null } | null> };
      $disconnect: () => Promise<void>;
    };
  }) => Promise<void>;
  runReportStyleE2eServer: (options: {
    env: NodeJS.ProcessEnv;
    createClient: (databaseUrl: string) => unknown;
    runBuild: (env: NodeJS.ProcessEnv) => Promise<void>;
    startProductionServer: (env: NodeJS.ProcessEnv) => Promise<void>;
  }) => Promise<void>;
  runAssessmentReportE2eServer: (options: {
    env: NodeJS.ProcessEnv;
    createClient: (databaseUrl: string) => unknown;
    runBuild: (env: NodeJS.ProcessEnv) => Promise<void>;
    startProductionServer: (env: NodeJS.ProcessEnv) => Promise<void>;
  }) => Promise<void>;
};

const guardPath = resolve(process.cwd(), "scripts/report-style-e2e-server-contract.cjs");

function loadGuard(): GuardModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(guardPath) as GuardModule;
}

const fixtureEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://fixture.invalid/report_style_e2e",
  E2E_REPORT_STYLES_DATABASE_URL: "postgresql://fixture.invalid/report_style_e2e",
  E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_ID:
    "report-style-e2e-sentinel-0123456789abcdefghijkl",
  E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_VALUE:
    "report-style-e2e-disposable:0123456789abcdefghijklmnopqrstuvwxyz_ABCD",
};

const comparisonFixtureEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://fixture.invalid/report_comparison_e2e",
  E2E_REPORT_COMPARISON_DATABASE_URL: "postgresql://fixture.invalid/report_comparison_e2e",
  E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_ID:
    "report-comparison-e2e-sentinel-0123456789abcdefghijkl",
  E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_VALUE:
    "report-comparison-e2e-disposable:0123456789abcdefghijklmnopqrstuvwxyz_ABCD",
  E2E_REPORT_COMPARISON_FIXTURE: "{}",
};

describe("report-style isolated Playwright database contract", () => {
  it("binds report-comparison acceptance to its fixture database and rejects competing fixture lanes", () => {
    const { createAssessmentReportE2eWebServer } = loadGuard();
    const config = createAssessmentReportE2eWebServer({
      ...comparisonFixtureEnvironment,
      DATABASE_URL: "postgresql://ambient.invalid/production",
    });

    expect(config).toEqual(expect.objectContaining({
      command: "node scripts/start-report-style-e2e.mjs",
      reuseExistingServer: false,
    }));
    expect(config?.env.DATABASE_URL).toBe(comparisonFixtureEnvironment.E2E_REPORT_COMPARISON_DATABASE_URL);
    expect(() => createAssessmentReportE2eWebServer({
      ...fixtureEnvironment,
      ...comparisonFixtureEnvironment,
    })).toThrow("Only one managed assessment report E2E fixture lane may be configured.");
  });

  it("binds the app server to the explicit fixture URL and never reuses an ambient server", () => {
    const { createReportStyleWebServer } = loadGuard();
    const config = createReportStyleWebServer({
      ...fixtureEnvironment,
      DATABASE_URL: "postgresql://ambient.invalid/production",
    });

    expect(config).toEqual(expect.objectContaining({
      command: "node scripts/start-report-style-e2e.mjs",
      reuseExistingServer: false,
    }));
    expect(config?.env.DATABASE_URL).toBe(fixtureEnvironment.E2E_REPORT_STYLES_DATABASE_URL);
  });

  it("keeps the database-free renderer lane serverless", () => {
    const { createReportStyleWebServer } = loadGuard();
    expect(createReportStyleWebServer({
      NODE_ENV: "test",
      PLAYWRIGHT_SKIP_WEBSERVER: "1",
    })).toBeUndefined();
  });

  it("preserves the existing dev server for unrelated Playwright suites", () => {
    const { createReportStyleWebServer } = loadGuard();

    expect(createReportStyleWebServer({ NODE_ENV: "test" })).toEqual(expect.objectContaining({
      command: "npm run dev",
      reuseExistingServer: true,
    }));
  });

  it("uses a production build followed by the compiled Next.js server", () => {
    const { productionServerCommands } = loadGuard();

    expect(productionServerCommands({
      cwd: "/fixture/app",
      execPath: "/fixture/node",
      platform: "darwin",
    })).toEqual({
      build: { command: "npm", args: ["run", "build"] },
      start: {
        command: "/fixture/node",
        args: ["/fixture/app/node_modules/next/dist/bin/next", "start"],
      },
    });
  });

  it("rejects a mismatched ambient URL before opening a database client", async () => {
    const { assertDisposableReportStyleDatabase } = loadGuard();
    const createClient = jest.fn();

    await expect(assertDisposableReportStyleDatabase({
      env: { ...fixtureEnvironment, DATABASE_URL: "postgresql://ambient.invalid/production" },
      createClient,
    })).rejects.toThrow("Report-style E2E database contract is invalid.");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a weak disposable sentinel before opening a database client", async () => {
    const { assertDisposableReportStyleDatabase } = loadGuard();
    const createClient = jest.fn();

    await expect(assertDisposableReportStyleDatabase({
      env: {
        ...fixtureEnvironment,
        E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_VALUE: "disposable",
      },
      createClient,
    })).rejects.toThrow("Report-style E2E database contract is invalid.");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("gives the comparison provisioner the same hard refusal before it can mutate", async () => {
    const { assertDisposableReportComparisonDatabase } = loadGuard();
    const createClient = jest.fn();

    await expect(assertDisposableReportComparisonDatabase({
      env: { ...comparisonFixtureEnvironment, DATABASE_URL: "postgresql://ambient.invalid/customer" },
      createClient,
    })).rejects.toThrow("Report-comparison E2E database contract is invalid.");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a missing or mismatched sentinel row and disconnects without leaking values", async () => {
    const { assertDisposableReportStyleDatabase } = loadGuard();
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const createClient = jest.fn().mockReturnValue({
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: fixtureEnvironment.E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_ID,
          name: "wrong-sentinel-value",
          deletedAt: null,
        }),
      },
      $disconnect: disconnect,
    });

    let thrown: Error | undefined;
    try {
      await assertDisposableReportStyleDatabase({ env: fixtureEnvironment, createClient });
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toBe("Disposable report-style E2E database sentinel was not found.");
    expect(thrown?.message).not.toContain(fixtureEnvironment.DATABASE_URL);
    expect(thrown?.message).not.toContain(fixtureEnvironment.E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_VALUE);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("checks the sentinel before building and starting the production server", async () => {
    const { runReportStyleE2eServer } = loadGuard();
    const events: string[] = [];
    const createClient = jest.fn().mockReturnValue({
      organization: {
        findUnique: jest.fn().mockImplementation(async () => {
          events.push("sentinel");
          return {
            id: fixtureEnvironment.E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_ID,
            name: fixtureEnvironment.E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_VALUE,
            deletedAt: null,
          };
        }),
      },
      $disconnect: jest.fn().mockResolvedValue(undefined),
    });

    await runReportStyleE2eServer({
      env: fixtureEnvironment,
      createClient,
      runBuild: async (env) => {
        expect(env.NODE_ENV).toBe("production");
        expect(env.DATABASE_URL).toBe(fixtureEnvironment.E2E_REPORT_STYLES_DATABASE_URL);
        events.push("build");
      },
      startProductionServer: async (env) => {
        expect(env.NODE_ENV).toBe("production");
        expect(env.DATABASE_URL).toBe(fixtureEnvironment.E2E_REPORT_STYLES_DATABASE_URL);
        events.push("start");
      },
    });

    expect(events).toEqual(["sentinel", "build", "start"]);
  });

  it("checks the comparison sentinel before building and starting the production server", async () => {
    const { runAssessmentReportE2eServer } = loadGuard();
    const events: string[] = [];
    const createClient = jest.fn().mockReturnValue({
      organization: {
        findUnique: jest.fn().mockImplementation(async () => {
          events.push("sentinel");
          return {
            id: comparisonFixtureEnvironment.E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_ID,
            name: comparisonFixtureEnvironment.E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_VALUE,
            deletedAt: null,
          };
        }),
      },
      $disconnect: jest.fn().mockResolvedValue(undefined),
    });

    await runAssessmentReportE2eServer({
      env: comparisonFixtureEnvironment,
      createClient,
      runBuild: async (env) => {
        expect(env.DATABASE_URL).toBe(comparisonFixtureEnvironment.E2E_REPORT_COMPARISON_DATABASE_URL);
        events.push("build");
      },
      startProductionServer: async (env) => {
        expect(env.DATABASE_URL).toBe(comparisonFixtureEnvironment.E2E_REPORT_COMPARISON_DATABASE_URL);
        events.push("start");
      },
    });

    expect(events).toEqual(["sentinel", "build", "start"]);
  });
});

describe("report-style completion/PATCH race outcome", () => {
  it("keeps Classic when completion wins and the PATCH is rejected", () => {
    const { expectedRaceReportStyle } = loadGuard();
    expect(expectedRaceReportStyle(409)).toBe("CLASSIC");
  });

  it("locks Modern Dashboard when the PATCH commits before completion", () => {
    const { expectedRaceReportStyle } = loadGuard();
    expect(expectedRaceReportStyle(200)).toBe("MODERN_DASHBOARD");
  });
});

describe("report-style fixture-only visual matrix", () => {
  it("walks all three anatomies and all safe content variants through the renderer lane", () => {
    const source = readFileSync(resolve(process.cwd(), "e2e/report-styles.spec.ts"), "utf8");

    expect(source).toContain("REPORT_STYLE_PREVIEW_ANATOMIES");
    expect(source).toContain("REPORT_STYLE_PREVIEW_VARIANTS");
    expect(source).toMatch(/for \(const anatomy of REPORT_STYLE_PREVIEW_ANATOMIES\)/);
    expect(source).toMatch(/for \(const variant of REPORT_STYLE_PREVIEW_VARIANTS\)/);
    expect(source).toContain("data-preview-anatomy");
    expect(source).toContain("data-preview-variant");
    expect(source).toContain("assertNoEmptyReportComposition");
    expect(source).toContain("assertNoColorOnlyStatus");
    expect(source).toContain(
      'readFile(resolve(stylesRoot, "su-report.css"), "utf8")',
    );
  });
});
