import { renderToStaticMarkup } from "react-dom/server";

const mockIsQspStoryGroupEnabled = jest.fn(() => false);
jest.mock("@/lib/assessments/wave-48-flags", () => ({
  isQspStoryGroupEnabled: () => mockIsQspStoryGroupEnabled(),
}));

const mockOrgSurveyClient = jest.fn(() => <div />);
jest.mock("@/components/assessments/org-survey-client", () => ({
  OrgSurveyClient: (props: Record<string, unknown>) => mockOrgSurveyClient(props),
}));

import OrgSurveyPage from "@/app/(public)/org-survey/[campaignAlias]/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockIsQspStoryGroupEnabled.mockReturnValue(false);
});

async function renderPageProps() {
  const page = await OrgSurveyPage({
    params: Promise.resolve({ campaignAlias: "qsp-invited" }),
  });
  renderToStaticMarkup(page);
  return mockOrgSurveyClient.mock.calls[0][0] as Record<string, unknown>;
}

describe("OrgSurveyPage QSP story-group server boundary", () => {
  it("omits the client prop while the server gate is off", async () => {
    mockIsQspStoryGroupEnabled.mockReturnValue(false);

    expect(await renderPageProps()).not.toHaveProperty("qspStoryGroupEnabled");
  });

  it("passes literal true while the server gate is on", async () => {
    mockIsQspStoryGroupEnabled.mockReturnValue(true);

    expect(await renderPageProps()).toHaveProperty("qspStoryGroupEnabled", true);
  });
});
