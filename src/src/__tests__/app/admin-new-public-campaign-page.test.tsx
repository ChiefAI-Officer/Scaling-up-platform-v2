import { render } from "@testing-library/react";
import "@testing-library/jest-dom";

jest.mock("next/navigation", () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;${url}`,
    });
  }),
}));

const mockGetServerSession = jest.fn();
jest.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));

const mockIsEnabled = jest.fn();
jest.mock("@/lib/assessments/wave-public-campaigns-simple-ui-flags", () => ({
  isPublicCampaignsSimpleUiEnabled: () => mockIsEnabled(),
}));

const mockListCreateOptions = jest.fn();
jest.mock("@/lib/assessments/public-campaign-create-options", () => ({
  listPublicCampaignCreateOptions: (...args: unknown[]) =>
    mockListCreateOptions(...args),
}));

jest.mock("@/lib/db", () => ({
  db: { assessmentTemplate: { findMany: jest.fn() } },
}));

interface FormOption {
  id: string;
  name: string;
  alias: string;
  defaultReportStyle: string;
  reportStylesEnabled: boolean;
}

let formProps: { options: FormOption[] } | null = null;
jest.mock("@/components/admin/public-campaigns/CreatePublicCampaignForm", () => ({
  CreatePublicCampaignForm: (props: { options: FormOption[] }) => {
    formProps = props;
    return (
      <form aria-label="Create public campaign form">
        {props.options.map((option) => option.name).join(", ")}
      </form>
    );
  },
}));

import NewPublicCampaignPage from "@/app/(dashboard)/admin/assessments/public-campaigns/new/page";
import { db } from "@/lib/db";

const options: FormOption[] = [
  {
    id: "template-1",
    name: "Scaling Up Assessment",
    alias: "scaling-up-assessment",
    defaultReportStyle: "CLASSIC",
    reportStylesEnabled: false,
  },
];

async function renderPage() {
  render(await NewPublicCampaignPage());
}

beforeEach(() => {
  jest.clearAllMocks();
  formProps = null;
  mockGetServerSession.mockResolvedValue({ user: { role: "ADMIN" } });
  mockIsEnabled.mockReturnValue(true);
  mockListCreateOptions.mockResolvedValue(options);
});

describe("NewPublicCampaignPage auth and release gates", () => {
  it("redirects an unauthenticated visitor to login before checking the flag or options", async () => {
    mockGetServerSession.mockResolvedValue(null);

    await expect(renderPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;/login",
    });
    expect(mockIsEnabled).not.toHaveBeenCalled();
    expect(mockListCreateOptions).not.toHaveBeenCalled();
  });

  it("redirects a coach to unauthorized before checking the flag or options", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "COACH" } });

    await expect(renderPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;/unauthorized",
    });
    expect(mockIsEnabled).not.toHaveBeenCalled();
    expect(mockListCreateOptions).not.toHaveBeenCalled();
  });

  it("redirects an authorized visitor to the list before querying options when inactive", async () => {
    mockIsEnabled.mockReturnValue(false);

    await expect(renderPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;/admin/assessments/public-campaigns",
    });
    expect(mockListCreateOptions).not.toHaveBeenCalled();
  });
});

describe("NewPublicCampaignPage active composition", () => {
  it.each(["ADMIN", "STAFF"])(
    "renders the focused creation workflow for %s",
    async (role) => {
      mockGetServerSession.mockResolvedValue({ user: { role } });

      await renderPage();

      expect(document.querySelector(".wf-page-title")).toHaveTextContent(
        "Create a public campaign",
      );
      expect(document.querySelector(".wf-page-subtitle")).toHaveTextContent(
        "Create a link anyone can use to take an assessment.",
      );
      expect(
        document.querySelector('[aria-label="Create public campaign form"]'),
      ).toHaveTextContent("Scaling Up Assessment");
    },
  );

  it("queries creation options once on the server and passes them to the form", async () => {
    await renderPage();

    expect(mockListCreateOptions).toHaveBeenCalledTimes(1);
    expect(mockListCreateOptions).toHaveBeenCalledWith(db);
    expect(formProps).toEqual({ options });
  });
});
