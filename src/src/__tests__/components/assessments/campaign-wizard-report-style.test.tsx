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
  reportStylesEnabled: true,
};
const OTHER_TEMPLATE = {
  ...TEMPLATE,
  id: "tpl-2",
  name: "Rockefeller Habits",
  alias: "rockefeller",
};
const NON_CANARY_TEMPLATE = {
  ...TEMPLATE,
  id: "tpl-non-canary",
  reportStylesEnabled: false,
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
let draftSaveBodies: unknown[] = [];

function response(data: unknown) {
  return {
    ok: true,
    json: async () => ({ success: true, data }),
  } as Response;
}

function installFetch(
  draft: unknown = null,
  template: typeof TEMPLATE | Array<typeof TEMPLATE> = TEMPLATE,
) {
  campaignCreateBodies = [];
  draftSaveBodies = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/assessment-campaigns") && method === "POST") {
      campaignCreateBodies.push(JSON.parse(String(init?.body)));
      return response({ id: "camp-1" });
    }
    if (url.includes("assessment-campaign-drafts")) {
      if (method === "PUT") draftSaveBodies.push(JSON.parse(String(init?.body)));
      return response(method === "GET" ? draft : {});
    }
    if (url.endsWith("/api/organizations")) return response([ORG]);
    if (url.endsWith("/api/assessment-templates")) {
      return response(Array.isArray(template) ? template : [template]);
    }
    if (url.includes("/teams")) return response([]);
    if (url.includes("/respondents")) return response([RESPONDENT]);
    if (url.includes("/participants")) return response({ added: 1 });
    return response({});
  }) as typeof fetch;
}

async function advanceToSchedule(template = TEMPLATE) {
  installFetch(null, template);
  render(<CampaignWizard />);

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

  it("omits reportStyle from creation while the coach keeps the inherited default", async () => {
    await advanceToSchedule();
    fireEvent.change(screen.getByLabelText("Campaign name"), {
      target: { value: "Q3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^next/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Save as Draft" }));

    await waitFor(() => expect(campaignCreateBodies).toHaveLength(1));
    expect(campaignCreateBodies[0]).not.toHaveProperty("reportStyle");
  });

  it("shows a template-only canary even when the page-level global check is false", async () => {
    await advanceToSchedule(TEMPLATE);

    expect(screen.getByRole("heading", { name: "Report appearance" })).toBeInTheDocument();
  });

  it("renders report appearance for a template with an arbitrary alias", async () => {
    await advanceToSchedule(OTHER_TEMPLATE, true);

    expect(screen.getByRole("heading", { name: "Report appearance" })).toBeInTheDocument();
  });

  it("does not render report appearance for an eligible template outside the canary", async () => {
    await advanceToSchedule(NON_CANARY_TEMPLATE);

    expect(screen.queryByRole("heading", { name: "Report appearance" })).not.toBeInTheDocument();
  });

  it("treats an old inherited draft as inherited and reconciles it to fresh template metadata", async () => {
    installFetch({
      currentStep: 3,
      lastSavedAt: "2026-08-05T08:00:00.000Z",
      stepsData: JSON.stringify({
        organizationId: "org-1",
        templateId: "tpl-1",
        templateAlias: "scaling-up-full",
        templateDefaultReportStyle: "EXECUTIVE_BOARDROOM",
        reportStyle: "EXECUTIVE_BOARDROOM",
        respondentIds: ["resp-1"],
        name: "Q3",
        openAt: "2026-08-10T09:00",
        endMode: "OPEN_END",
        closeAt: "",
      }),
    });
    render(<CampaignWizard />);

    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));

    expect(await screen.findByRole("heading", { name: "Report appearance" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /modern dashboard/i })).toBeChecked();
    expect(screen.getByText("Using the admin default for this template.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^next/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Save as Draft" }));
    await waitFor(() => expect(campaignCreateBodies).toHaveLength(1));
    expect(campaignCreateBodies[0]).not.toHaveProperty("reportStyle");
  });

  it("records a coach override in review and the campaign-create request", async () => {
    await advanceToSchedule();
    fireEvent.click(screen.getByRole("radio", { name: /executive boardroom/i }));
    expect(screen.getByText("Coach selection for this campaign.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Campaign name"), {
      target: { value: "Q3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^next/i }));

    expect(await screen.findByText("Coach selection", { exact: true })).toBeInTheDocument();
    await waitFor(() => {
      expect(draftSaveBodies).toContainEqual(
        expect.objectContaining({
          data: expect.objectContaining({ reportStyleIntent: "EXPLICIT" }),
        }),
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Save as Draft" }));
    await waitFor(() => {
      expect(campaignCreateBodies).toContainEqual(
        expect.objectContaining({ reportStyle: "EXECUTIVE_BOARDROOM" }),
      );
    });
  });

  it("keeps explicit intent when the coach returns to the current template default", async () => {
    await advanceToSchedule();
    fireEvent.click(screen.getByRole("radio", { name: /executive boardroom/i }));
    fireEvent.click(screen.getByRole("radio", { name: /modern dashboard/i }));
    expect(screen.getByText("Coach selection for this campaign.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Campaign name"), {
      target: { value: "Q3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^next/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Save as Draft" }));
    await waitFor(() => {
      expect(campaignCreateBodies).toContainEqual(
        expect.objectContaining({ reportStyle: "MODERN_DASHBOARD" }),
      );
    });
  });

  it("keeps report appearance available when the coach switches to another template", async () => {
    installFetch(null, [TEMPLATE, OTHER_TEMPLATE]);
    render(<CampaignWizard />);

    fireEvent.click(await screen.findByRole("radio", { name: /acme corp/i }));
    fireEvent.click(screen.getByRole("button", { name: /^next/i }));
    fireEvent.click(await screen.findByRole("radio", { name: /scaling up full/i }));
    fireEvent.click(screen.getByRole("button", { name: /^next/i }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /alice smith/i }));
    fireEvent.click(screen.getByRole("button", { name: /^next/i }));
    fireEvent.click(screen.getByRole("radio", { name: /executive boardroom/i }));

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(await screen.findByRole("radio", { name: /rockefeller habits/i }));
    fireEvent.click(screen.getByRole("button", { name: /^next/i }));
    fireEvent.click(screen.getByRole("button", { name: /^next/i }));

    expect(screen.getByRole("heading", { name: "Report appearance" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Campaign name"), {
      target: { value: "Q3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^next/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Save as Draft" }));
    await waitFor(() => expect(campaignCreateBodies).toHaveLength(1));
    expect(campaignCreateBodies[0]).not.toHaveProperty("reportStyle");
  });

  it("retains an explicit draft selection when fresh template metadata has a different default", async () => {
    installFetch({
      currentStep: 3,
      lastSavedAt: "2026-08-05T08:00:00.000Z",
      stepsData: JSON.stringify({
        organizationId: "org-1",
        templateId: "tpl-1",
        templateAlias: "scaling-up-full",
        templateDefaultReportStyle: "EXECUTIVE_BOARDROOM",
        reportStyle: "EXECUTIVE_BOARDROOM",
        reportStyleIntent: "EXPLICIT",
        respondentIds: ["resp-1"],
        name: "Q3",
        openAt: "2026-08-10T09:00",
        endMode: "OPEN_END",
        closeAt: "",
      }),
    });
    render(<CampaignWizard />);

    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("radio", { name: /executive boardroom/i })).toBeChecked();
    expect(screen.getByText("Coach selection for this campaign.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^next/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Save as Draft" }));
    await waitFor(() => {
      expect(campaignCreateBodies).toContainEqual(
        expect.objectContaining({ reportStyle: "EXECUTIVE_BOARDROOM" }),
      );
    });
  });
});
