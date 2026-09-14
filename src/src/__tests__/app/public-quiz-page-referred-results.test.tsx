import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const mockCampaignFindUnique = jest.fn();
const mockVersionFindUnique = jest.fn();
const mockVersionFindFirst = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: {
      findUnique: (...args: unknown[]) => mockCampaignFindUnique(...args),
    },
    assessmentTemplateVersion: {
      findUnique: (...args: unknown[]) => mockVersionFindUnique(...args),
      findFirst: (...args: unknown[]) => mockVersionFindFirst(...args),
    },
  },
}));

const mockIsReferredResultsEnabled = jest.fn(() => false);
jest.mock("@/lib/assessments/wave-83-flags", () => ({
  isReferredResultsEnabled: () => mockIsReferredResultsEnabled(),
}));

jest.mock("@/lib/assessments/wave-m-flags", () => ({
  isCustomSlidesEnabled: () => false,
}));
jest.mock("@/lib/assessments/load-safe-slides", () => ({
  loadSafeSlides: jest.fn(() => []),
}));

const mockPublicQuizClient = jest.fn((props: Record<string, unknown>) => (
  <div
    data-testid="public-quiz-client"
    data-referred-results={String(props.referredResultsEnabled)}
  />
));
jest.mock("@/components/assessments/public-quiz-client", () => ({
  PublicQuizClient: (props: Record<string, unknown>) =>
    mockPublicQuizClient(props),
}));

import PublicQuizPage from "@/app/(public)/quiz/[campaignAlias]/page";
import { DEFAULT_INVITED_WELCOME_SHARING_DESCRIPTION } from "@/lib/assessments/invited-welcome-config";

const baseCampaign = {
  id: "campaign-83",
  name: "Quick Assessment",
  description: null,
  accessMode: "PUBLIC",
  status: "ACTIVE",
  openAt: new Date("2026-07-01T00:00:00Z"),
  closeAt: null,
  language: "enUS",
  versionId: "version-83",
  deletedAt: null,
  customSlides: null,
  template: {
    id: "template-83",
    name: "Scaling Up Quick",
    alias: "scaling-up-quick",
    deliveryType: "PUBLIC_MARKETING_QUIZ",
    invitedWelcomeDefault: null,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WAVE_ED10_PREVIEW_SETTINGS_ENABLED;
  delete process.env.WAVE_ED10_PREVIEW_SETTINGS_KILL;
  delete process.env.WAVE_REPORT_HTML_AUTHORING_ENABLED;
  delete process.env.WAVE_REPORT_HTML_AUTHORING_KILL;
  delete process.env.WAVE_REPORT_HTML_ACTIVE_VERSION_ENABLED;
  delete process.env.WAVE_REPORT_HTML_ACTIVE_VERSION_KILL;
  mockIsReferredResultsEnabled.mockReturnValue(false);
  mockCampaignFindUnique.mockResolvedValue(baseCampaign);
  mockVersionFindUnique.mockResolvedValue({
    questions: [],
    sections: [],
    publishedAt: new Date("2026-06-01T00:00:00Z"),
  });
  mockVersionFindFirst.mockResolvedValue(null);
});

async function renderPage() {
  const page = await PublicQuizPage({
    params: Promise.resolve({ campaignAlias: "quick-assessment" }),
  });
  renderToStaticMarkup(page);
  return mockPublicQuizClient.mock.calls[0][0] as Record<string, unknown>;
}

describe("PublicQuizPage referred-results disclosure boundary", () => {
  it("omits the client prop entirely while the server flag is off", async () => {
    const props = await renderPage();

    expect(props).not.toHaveProperty("referredResultsEnabled");
  });

  it("passes literal true while the server flag is on", async () => {
    mockIsReferredResultsEnabled.mockReturnValue(true);

    const props = await renderPage();

    expect(props).toHaveProperty("referredResultsEnabled", true);
  });

  it.each([
    "jv-new-assessment-testing",
    "sunhub-quick-quiz",
    "scaling-up-quick",
    "future-public-template",
    "__proto__",
    "constructor",
  ])(
    "passes the related template's strictly parsed Welcome config for %s",
    async (templateAlias) => {
      const welcomeConfig = {
        schemaVersion: 2,
        eyebrow: "You're invited to take this survey",
        headingTemplate: "Take {{campaignName}} today",
        ledeParagraphs: ["This survey is better than chocolate"],
        sharingHeading: "Your information",
        sharingDescription: "Your coach has access to your data.",
        scoresHeading: "Your category scores",
        scoresDescription: "You will get customized scoring.",
        ctaLabel: "Start the assessment Now",
        finePrint: null,
      };
      mockCampaignFindUnique.mockResolvedValue({
        ...baseCampaign,
        template: {
          id: "template-jv",
          name: "JV New Assessment Testing",
          alias: templateAlias,
          deliveryType: "PUBLIC_MARKETING_QUIZ",
          invitedWelcomeDefault: welcomeConfig,
        },
      });

      const props = await renderPage();

      expect(props).toHaveProperty("welcomeConfig", welcomeConfig);
      expect(mockCampaignFindUnique).toHaveBeenLastCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            template: {
              select: expect.objectContaining({ invitedWelcomeDefault: true }),
            },
          }),
        }),
      );
    },
  );

  it("normalizes an existing schema-v1 template backfill for public rendering", async () => {
    const storedV1Backfill = {
      schemaVersion: 1,
      eyebrow: "You're invited",
      headingTemplate: "{{campaignName}}",
      ledeParagraphs: [
        "A quick check on how your team works together. You can answer in one sitting or come back later — your link stays active.",
      ],
      sharingHeading: "How your answers are shared",
      scoresHeading: "Your category scores",
      scoresDescription: "See where the team stands across each category.",
      ctaLabel: "Start the assessment",
      finePrint: null,
    };
    mockCampaignFindUnique.mockResolvedValue({
      ...baseCampaign,
      description: "Campaign-specific public description.",
      template: {
        ...baseCampaign.template,
        invitedWelcomeDefault: storedV1Backfill,
      },
    });

    const props = await renderPage();

    expect(props).toHaveProperty("welcomeConfig", {
      ...storedV1Backfill,
      schemaVersion: 2,
      sharingDescription: DEFAULT_INVITED_WELCOME_SHARING_DESCRIPTION,
    });
    expect(props).toHaveProperty(
      "campaignDescription",
      "Campaign-specific public description.",
    );
  });

  it("does not pass malformed persisted Welcome JSON to the public client", async () => {
    mockCampaignFindUnique.mockResolvedValue({
      ...baseCampaign,
      template: {
        id: "template-jv",
        name: "JV New Assessment Testing",
        alias: "jv-new-assessment-testing",
        deliveryType: "PUBLIC_MARKETING_QUIZ",
        invitedWelcomeDefault: { schemaVersion: 99, eyebrow: "unsafe partial" },
      },
    });

    const props = await renderPage();

    expect(props).not.toHaveProperty("welcomeConfig");
  });

  it("omits report HTML props while the successor experience is off", async () => {
    const props = await renderPage();

    expect(props).not.toHaveProperty("reportHtmlExperienceActive");
    expect(props).not.toHaveProperty("reportHtml");
  });

  it("keeps the pinned presentation unchanged while Active-version parity is off", async () => {
    process.env.WAVE_ED10_PREVIEW_SETTINGS_ENABLED = "1";
    process.env.WAVE_REPORT_HTML_AUTHORING_ENABLED = "1";
    mockVersionFindUnique.mockResolvedValue({
      questions: [],
      sections: [],
      publishedAt: new Date("2026-06-01T00:00:00Z"),
      reportConfig: {
        reportHtml: {
          schemaVersion: 1,
          introductionHtml: "<p>Pinned intro</p>",
          conclusionHtml: "<p>Pinned conclusion</p>",
        },
      },
    });

    const props = await renderPage();

    expect(props).toHaveProperty("reportHtml", {
      introductionHtml: "<p>Pinned intro</p>",
      conclusionHtml: "<p>Pinned conclusion</p>",
    });
    expect(props).not.toHaveProperty("pinnedVersionId");
    expect(props).not.toHaveProperty("presentationVersionId");
    expect(mockVersionFindFirst).not.toHaveBeenCalled();
  });

  it("passes report HTML from the template's published Active version while campaign content stays pinned", async () => {
    process.env.WAVE_ED10_PREVIEW_SETTINGS_ENABLED = "1";
    process.env.WAVE_REPORT_HTML_AUTHORING_ENABLED = "1";
    process.env.WAVE_REPORT_HTML_ACTIVE_VERSION_ENABLED = "1";
    mockVersionFindUnique.mockResolvedValue({
      questions: [{ stableKey: "pinned-question" }],
      sections: [{ stableKey: "pinned-section" }],
      publishedAt: new Date("2026-06-01T00:00:00Z"),
      reportConfig: {
        reportHtml: {
          schemaVersion: 1,
          introductionHtml: "<p>Pinned intro</p>",
          conclusionHtml: "<p>Pinned conclusion</p>",
        },
      },
    });
    mockVersionFindFirst.mockResolvedValue({
      id: "version-active",
      language: "enUS",
      versionNumber: 8,
      publishedAt: new Date("2026-09-11T00:00:00Z"),
      archivedAt: null,
      reportConfig: {
        reportHtml: {
          schemaVersion: 1,
          introductionHtml: '<p onclick="bad()">Active intro</p>',
          conclusionHtml: "<p>Active conclusion</p>",
        },
      },
    });

    const props = await renderPage();

    expect(props).toHaveProperty("reportHtmlExperienceActive", true);
    expect(props).toHaveProperty("reportHtml", {
      introductionHtml: "<p>Active intro</p>",
      conclusionHtml: "<p>Active conclusion</p>",
    });
    expect(props).toHaveProperty("pinnedVersionId", "version-83");
    expect(props).toHaveProperty("presentationVersionId", "version-active");
    expect(props).toHaveProperty("questions", [{ stableKey: "pinned-question" }]);
    expect(props).toHaveProperty("sections", [{ stableKey: "pinned-section" }]);
  });
});
