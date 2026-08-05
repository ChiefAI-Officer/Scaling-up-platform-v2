import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CampaignWizard } from "@/components/assessments/CampaignWizard";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const ORG = { id: "org-1", name: "Acme Corp", externalId: null };
const TEMPLATE = {
  id: "tpl-1",
  name: "Scaling Up Full",
  alias: "scaling-up-full",
  description: null,
  aggregationMode: "FULL_VISIBILITY" as const,
  resultsEmailApproved: false,
  defaultReportStyle: "MODERN_DASHBOARD" as const,
};
const OTHER_TEMPLATE = {
  ...TEMPLATE,
  id: "tpl-2",
  name: "Rockefeller Habits",
  alias: "rockefeller",
};
const RESPONDENT = {
  id: "resp-1",
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@acme.com",
  jobTitle: null,
  teamId: null,
  roleType: null,
};
let campaignCreateBodies: unknown[] = [];

function response(data: unknown) {
  return {
    ok: true,
    json: async () => ({ success: true, data }),
  } as Response;
}

function installFetch(draft: unknown = null, template = TEMPLATE) {
  campaignCreateBodies = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/assessment-campaigns") && method === "POST") {
      campaignCreateBodies.push(JSON.parse(String(init?.body)));
      return response({ id: "camp-1" });
    }
    if (url.includes("assessment-campaign-drafts")) {
      return response(method === "GET" ? draft : {});
    }
    if (url.endsWith("/api/organizations")) return response([ORG]);
    if (url.endsWith("/api/assessment-templates")) return response([template]);
    if (url.includes("/teams")) return response([]);
    if (url.includes("/respondents")) return response([RESPONDENT]);
    if (url.includes("/participants")) return response({ added: 1 });
    return response({});
  }) as typeof fetch;
}

async function advanceToSchedule(
  template = TEMPLATE,
  reportStylesEnabled = true,
) {
  installFetch(null, template);
  render(<CampaignWizard reportStylesEnabled={reportStylesEnabled} />);

  fireEvent.click(await screen.findByRole("radio", { name: /acme corp/i }));
  fireEvent.click(screen.getByRole("button", { name: /^next/i }));
  fireEvent.click(await screen.findByRole("radio", { name: new RegExp(template.name, "i") }));
  fireEvent.click(screen.getByRole("button", { name: /^next/i }));
  fireEvent.click(await screen.findByRole("checkbox", { name: /alice smith/i }));
  fireEvent.click(screen.getByRole("button", { name: /^next/i }));
  await act(async () => {});
}

describe("CampaignWizard — report appearance", () => {
  afterEach(() => jest.restoreAllMocks());

  it("shows the Scaling Up Full report appearance panel with the inherited admin default", async () => {
    await advanceToSchedule();

    expect(screen.getByRole("heading", { name: "Report appearance" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /modern dashboard/i })).toBeChecked();
    expect(screen.getByText("Using the admin default for this template.")).toBeInTheDocument();
  });

  it("does not render report appearance when the server-computed feature flag is off", async () => {
    await advanceToSchedule(TEMPLATE, false);

    expect(screen.queryByRole("heading", { name: "Report appearance" })).not.toBeInTheDocument();
  });

  it("does not render report appearance for an ineligible template", async () => {
    await advanceToSchedule(OTHER_TEMPLATE, true);

    expect(screen.queryByRole("heading", { name: "Report appearance" })).not.toBeInTheDocument();
  });

  it("restores the report style and inherited source when resuming a draft", async () => {
    installFetch({
      currentStep: 3,
      lastSavedAt: "2026-08-05T08:00:00.000Z",
      stepsData: JSON.stringify({
        organizationId: "org-1",
        templateId: "tpl-1",
        templateAlias: "scaling-up-full",
        templateDefaultReportStyle: "MODERN_DASHBOARD",
        reportStyle: "MODERN_DASHBOARD",
        respondentIds: ["resp-1"],
        name: "Q3",
        openAt: "2026-08-10T09:00",
        endMode: "OPEN_END",
        closeAt: "",
      }),
    });
    render(<CampaignWizard reportStylesEnabled />);

    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));

    expect(await screen.findByRole("heading", { name: "Report appearance" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /modern dashboard/i })).toBeChecked();
    expect(screen.getByText("Using the admin default for this template.")).toBeInTheDocument();
  });

  it("records a coach override in review and the campaign-create request", async () => {
    await advanceToSchedule();
    fireEvent.click(screen.getByRole("radio", { name: /executive boardroom/i }));
    expect(screen.getByText("Coach override for this campaign.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Campaign name"), {
      target: { value: "Q3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^next/i }));

    expect(await screen.findByText("Coach override", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save as Draft" }));
    await waitFor(() => {
      expect(campaignCreateBodies).toContainEqual(
        expect.objectContaining({ reportStyle: "EXECUTIVE_BOARDROOM" }),
      );
    });
  });
});
