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

jest.mock("@/components/admin/PublicCampaignsManager", () => ({
  PublicCampaignsManager: () => (
    <section aria-label="Legacy public campaign manager">
      Legacy campaign controls
    </section>
  ),
}));

let listProps: { createdCampaignId?: string } | null = null;
jest.mock("@/components/admin/public-campaigns/PublicCampaignList", () => ({
  PublicCampaignList: (props: { createdCampaignId?: string }) => {
    listProps = props;
    return (
      <section aria-label="Simple public campaign list">
        {props.createdCampaignId ?? "No created campaign"}
      </section>
    );
  },
}));

import AdminPublicCampaignsPage from "@/app/(dashboard)/admin/assessments/public-campaigns/page";

async function renderPage(created?: string | string[]) {
  render(
    await AdminPublicCampaignsPage({
      searchParams: Promise.resolve({ created }),
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  listProps = null;
  mockGetServerSession.mockResolvedValue({ user: { role: "ADMIN" } });
  mockIsEnabled.mockReturnValue(false);
});

describe("AdminPublicCampaignsPage auth gate", () => {
  it("redirects an unauthenticated visitor to login before resolving the release gate", async () => {
    mockGetServerSession.mockResolvedValue(null);

    await expect(renderPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;/login",
    });
    expect(mockIsEnabled).not.toHaveBeenCalled();
  });

  it("redirects a coach to unauthorized before resolving the release gate", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "COACH" } });

    await expect(renderPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;/unauthorized",
    });
    expect(mockIsEnabled).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "STAFF"])("renders the authorized route for %s", async (role) => {
    mockGetServerSession.mockResolvedValue({ user: { role } });

    await renderPage();

    expect(
      document.querySelector('[aria-label="Legacy public campaign manager"]'),
    ).toBeInTheDocument();
  });
});

describe("AdminPublicCampaignsPage release composition", () => {
  it("preserves the legacy page copy and manager when the release gate is inactive", async () => {
    await renderPage();

    expect(
      document.querySelector(".wf-page-title"),
    ).toHaveTextContent(/^Public Campaigns$/);
    expect(document.querySelector(".wf-page-subtitle-strong")).toHaveTextContent(
      'Create and publish accessMode="PUBLIC" assessment campaigns.',
    );
    expect(document.querySelector(".wf-intersection-banner")).toHaveTextContent(
      "Schema note: organizationId is required (NOT NULL FK",
    );
    expect(
      document.querySelector('[aria-label="Legacy public campaign manager"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[aria-label="Simple public campaign list"]'),
    ).not.toBeInTheDocument();
  });

  it("renders only the plain-language list workflow when the release gate is active", async () => {
    mockIsEnabled.mockReturnValue(true);

    await renderPage("campaign-17");

    expect(
      document.querySelector(".wf-page-title"),
    ).toHaveTextContent(/^Public campaigns$/);
    expect(document.querySelector(".wf-page-subtitle")).toHaveTextContent(
      "Share an assessment with anyone using a public link.",
    );
    expect(document.querySelector('a[href="/admin/assessments/public-campaigns/new"]'))
      .toHaveTextContent("Create campaign");
    expect(
      document.querySelector('[aria-label="Simple public campaign list"]'),
    ).toHaveTextContent("campaign-17");
    expect(
      document.querySelector('[aria-label="Legacy public campaign manager"]'),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".wf-intersection-banner")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("accessMode");
    expect(document.body).not.toHaveTextContent("organizationId");
    expect(document.body).not.toHaveTextContent("createdByCoachId");
  });

  it("passes a scalar created id to the list", async () => {
    mockIsEnabled.mockReturnValue(true);

    await renderPage("campaign-23");

    expect(listProps).toEqual({ createdCampaignId: "campaign-23" });
  });

  it("ignores an array-valued created query parameter", async () => {
    mockIsEnabled.mockReturnValue(true);

    await renderPage(["campaign-23", "campaign-24"]);

    expect(listProps).toEqual({ createdCampaignId: undefined });
  });
});
