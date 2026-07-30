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

const mockPublicQuizClient = jest.fn(
  (props: Record<string, unknown>) => (
    <div
      data-testid="public-quiz-client"
      data-referred-results={String(props.referredResultsEnabled)}
    />
  ),
);
jest.mock("@/components/assessments/public-quiz-client", () => ({
  PublicQuizClient: (props: Record<string, unknown>) =>
    mockPublicQuizClient(props),
}));

import PublicQuizPage from "@/app/(public)/quiz/[campaignAlias]/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockIsReferredResultsEnabled.mockReturnValue(false);
  mockCampaignFindUnique.mockResolvedValue({
    id: "campaign-83",
    name: "Quick Assessment",
    description: null,
    accessMode: "PUBLIC",
    status: "ACTIVE",
    openAt: new Date("2026-07-01T00:00:00Z"),
    closeAt: null,
    versionId: "version-83",
    deletedAt: null,
    customSlides: null,
    template: {
      id: "template-83",
      name: "Scaling Up Quick",
      alias: "scaling-up-quick",
    },
  });
  mockVersionFindUnique.mockResolvedValue({
    questions: [],
    sections: [],
    publishedAt: new Date("2026-06-01T00:00:00Z"),
  });
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
});
