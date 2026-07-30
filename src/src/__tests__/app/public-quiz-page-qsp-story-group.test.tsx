import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const mockCampaignFindUnique = jest.fn();
const mockVersionFindUnique = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: {
      findUnique: (...args: unknown[]) => mockCampaignFindUnique(...args),
    },
    assessmentTemplateVersion: {
      findUnique: (...args: unknown[]) => mockVersionFindUnique(...args),
    },
  },
}));

const mockIsQspStoryGroupEnabled = jest.fn(() => false);
jest.mock("@/lib/assessments/wave-48-flags", () => ({
  isQspStoryGroupEnabled: () => mockIsQspStoryGroupEnabled(),
}));

jest.mock("@/lib/assessments/wave-83-flags", () => ({
  isReferredResultsEnabled: () => false,
}));
jest.mock("@/lib/assessments/wave-m-flags", () => ({
  isCustomSlidesEnabled: () => false,
}));
jest.mock("@/lib/assessments/load-safe-slides", () => ({
  loadSafeSlides: jest.fn(() => []),
}));

const mockPublicQuizClient = jest.fn(() => <div />);
jest.mock("@/components/assessments/public-quiz-client", () => ({
  PublicQuizClient: (props: Record<string, unknown>) => mockPublicQuizClient(props),
}));

import PublicQuizPage from "@/app/(public)/quiz/[campaignAlias]/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockIsQspStoryGroupEnabled.mockReturnValue(false);
  mockCampaignFindUnique.mockResolvedValue({
    id: "campaign-qsp",
    name: "QSP Public",
    description: null,
    accessMode: "PUBLIC",
    status: "ACTIVE",
    openAt: new Date("2026-07-01T00:00:00Z"),
    closeAt: null,
    versionId: "version-qsp",
    deletedAt: null,
    customSlides: null,
    template: { id: "template-qsp", name: "QSP v2", alias: "qsp-v2" },
  });
  mockVersionFindUnique.mockResolvedValue({
    questions: [],
    sections: [],
    publishedAt: new Date("2026-07-01T00:00:00Z"),
  });
});

async function renderPageProps() {
  const page = await PublicQuizPage({
    params: Promise.resolve({ campaignAlias: "qsp-public" }),
  });
  renderToStaticMarkup(page);
  return mockPublicQuizClient.mock.calls[0][0] as Record<string, unknown>;
}

describe("PublicQuizPage QSP story-group server boundary", () => {
  it("omits the client prop while the server gate is off", async () => {
    mockIsQspStoryGroupEnabled.mockReturnValue(false);

    expect(await renderPageProps()).not.toHaveProperty("qspStoryGroupEnabled");
  });

  it("passes literal true while the server gate is on", async () => {
    mockIsQspStoryGroupEnabled.mockReturnValue(true);

    expect(await renderPageProps()).toHaveProperty("qspStoryGroupEnabled", true);
  });
});
