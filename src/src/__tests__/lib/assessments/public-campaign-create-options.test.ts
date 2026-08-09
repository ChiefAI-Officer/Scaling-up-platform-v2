/**
 * Public campaign creation must offer only templates that can immediately
 * resolve an Active version. This structural stub records the query sent to
 * persistence while keeping the observable return value at the form boundary.
 */
import {
  listPublicCampaignCreateOptions,
  type PublicCampaignCreateOptionsDb,
} from "@/lib/assessments/public-campaign-create-options";

type CreateOptionsQuery = Parameters<
  PublicCampaignCreateOptionsDb["assessmentTemplate"]["findMany"]
>[0];

interface TemplateFixture {
  id: string;
  name: string;
  alias: string;
  defaultReportStyle: "CLASSIC" | "EXECUTIVE_BOARDROOM" | "MODERN_DASHBOARD";
  versions: Array<{ questions: unknown }>;
}

function makeDb(rows: TemplateFixture[]): {
  db: PublicCampaignCreateOptionsDb;
  calls: CreateOptionsQuery[];
} {
  const calls: CreateOptionsQuery[] = [];
  return {
    db: {
      assessmentTemplate: {
        findMany: async (query) => {
          calls.push(query);
          return rows;
        },
      },
    },
    calls,
  };
}

function template(overrides: Partial<TemplateFixture> = {}): TemplateFixture {
  return {
    id: "template-preview",
    name: "Leadership survey",
    alias: "qsp-v2",
    defaultReportStyle: "MODERN_DASHBOARD",
    versions: [{ questions: [{ type: "SLIDER_LIKERT" }, { type: "TEXTAREA" }] }],
    ...overrides,
  };
}

const reportStyleEnvKeys = [
  "WAVE_REPORT_STYLES_ENABLED",
  "WAVE_REPORT_STYLES_KILL",
  "WAVE_REPORT_STYLES_CANARY",
] as const;

let originalReportStyleEnv: Record<(typeof reportStyleEnvKeys)[number], string | undefined>;

beforeEach(() => {
  originalReportStyleEnv = Object.fromEntries(
    reportStyleEnvKeys.map((key) => [key, process.env[key]]),
  ) as typeof originalReportStyleEnv;
  process.env.WAVE_REPORT_STYLES_ENABLED = "0";
  process.env.WAVE_REPORT_STYLES_KILL = "0";
  process.env.WAVE_REPORT_STYLES_CANARY = "template-preview";
});

afterEach(() => {
  for (const key of reportStyleEnvKeys) {
    const value = originalReportStyleEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("listPublicCampaignCreateOptions", () => {
  it("queries only undeleted, enabled templates with their latest Active version", async () => {
    const { db, calls } = makeDb([template()]);

    await listPublicCampaignCreateOptions(db);

    expect(calls).toEqual([
      {
        where: {
          deletedAt: null,
          disabledAt: null,
          versions: {
            some: {
              language: "enUS",
              publishedAt: { not: null },
              archivedAt: null,
            },
          },
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          alias: true,
          defaultReportStyle: true,
          versions: {
            where: {
              language: "enUS",
              publishedAt: { not: null },
              archivedAt: null,
            },
            select: { questions: true },
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
      },
    ]);
  });

  it("returns only create-form fields and enables report previews per template", async () => {
    const { db } = makeDb([
      template(),
      template({
        id: "template-classic",
        name: "Scale Up Full",
        alias: "scaling-up-full",
        defaultReportStyle: "CLASSIC",
        versions: [{ questions: [{ type: "NUMBER" }] }],
      }),
    ]);

    await expect(listPublicCampaignCreateOptions(db)).resolves.toEqual([
      {
        id: "template-preview",
        name: "Leadership survey",
        alias: "qsp-v2",
        defaultReportStyle: "MODERN_DASHBOARD",
        reportStylesEnabled: true,
        reportStylePreviewCapabilities: {
          reportType: "qualitative",
          hasMetrics: true,
          hasNarrativeResponses: true,
        },
      },
      {
        id: "template-classic",
        name: "Scale Up Full",
        alias: "scaling-up-full",
        defaultReportStyle: "CLASSIC",
        reportStylesEnabled: false,
      },
    ]);
  });
});
