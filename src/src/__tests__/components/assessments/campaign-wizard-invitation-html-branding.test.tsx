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
  name: "Rockefeller Habits",
  alias: "rockefeller",
  description: null,
  aggregationMode: "FULL_VISIBILITY" as const,
  resultsEmailApproved: false,
};
const TEAM_ENG = {
  id: "team-eng",
  organizationId: "org-1",
  parentTeamId: null,
  name: "Engineering",
  type: null,
  description: null,
  children: [],
};
const ALICE = {
  id: "resp-1",
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@acme.com",
  jobTitle: null,
  teamId: "team-eng",
  roleType: null as string | null,
};

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

let fetchCalls: FetchCall[] = [];
const originalFetch = global.fetch;

function jsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => payload,
  } as unknown as Response;
}

function installFetch() {
  fetchCalls = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    fetchCalls.push({ url, method, body });

    if (url.includes("/api/assessment-campaign-drafts")) {
      if (method === "GET") return jsonResponse({ success: true, data: null });
      return jsonResponse({ success: true });
    }
    if (url.endsWith("/api/organizations") && method === "GET") {
      return jsonResponse({ success: true, data: [ORG] });
    }
    if (url.match(/\/api\/organizations\/org-1$/) && method === "GET") {
      return jsonResponse({ success: true, data: ORG });
    }
    if (url.endsWith("/api/assessment-templates") && method === "GET") {
      return jsonResponse({ success: true, data: [TEMPLATE] });
    }
    if (url.includes("/api/organizations/org-1/teams") && method === "GET") {
      return jsonResponse({ success: true, data: [TEAM_ENG] });
    }
    if (url.includes("/api/organizations/org-1/respondents") && method === "GET") {
      return jsonResponse({ success: true, data: [ALICE] });
    }
    if (url.endsWith("/api/assessment-campaigns") && method === "POST") {
      return jsonResponse({ success: true, data: { id: "camp-1" } });
    }
    if (url.includes("/api/assessment-campaigns/camp-1/participants")) {
      return jsonResponse({ success: true, data: { added: 1 } });
    }
    return jsonResponse({ success: false, error: "unhandled" }, false);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
});

async function advanceToReviewPanel(props: {
  brandedCustomHtmlEnabled: boolean;
  invitationBannerGate?: { globallyEnabled: boolean; canaryIds: string[] };
}): Promise<void> {
  installFetch();
  render(
    <CampaignWizard
      customHtmlEmailEnabled
      brandedCustomHtmlEnabled={props.brandedCustomHtmlEnabled}
      invitationBannerGate={props.invitationBannerGate}
      autoSend={false}
    />,
  );

  fireEvent.click(await screen.findByRole("radio", { name: /acme corp/i }));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  fireEvent.click(await screen.findByRole("radio", {
    name: /rockefeller habits/i,
  }));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  fireEvent.click(await screen.findByRole("checkbox", {
    name: /alice smith/i,
  }));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  fireEvent.change(await screen.findByLabelText(/campaign name/i), {
    target: { value: "Q3 Test Campaign" },
  });
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  fireEvent.click(await screen.findByTestId("email-overrides-toggle"));
}

describe("CampaignWizard — invitation HTML branding", () => {
  it.each([
    ["matching organization canary", { globallyEnabled: false, canaryIds: ["org-1"] }],
    ["global banner", { globallyEnabled: true, canaryIds: [] }],
  ])("uses body-only authoring when the invitation banner is enabled by %s", async (_name, invitationBannerGate) => {
    await advanceToReviewPanel({
      brandedCustomHtmlEnabled: false,
      invitationBannerGate,
    });

    expect(screen.getByText("Custom HTML body (advanced)")).toBeInTheDocument();
    expect(screen.getByText(/branding.*Coach identity.*button\/link.*footer/i)).toBeInTheDocument();
    expect(screen.getByTestId("invitation-html-input")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("body fragment"),
    );
    expect(screen.queryByText(/full HTML email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/must include.*invitationUrl/i)).not.toBeInTheDocument();
  });

  it.each([
    ["nonmatching canary", { globallyEnabled: false, canaryIds: ["other-org"] }],
    ["kill-derived empty snapshot", { globallyEnabled: false, canaryIds: [] }],
  ])("preserves full replacement authoring when the invitation banner is disabled by %s", async (_name, invitationBannerGate) => {
    await advanceToReviewPanel({
      brandedCustomHtmlEnabled: false,
      invitationBannerGate,
    });

    expect(screen.getByText("Full custom HTML (advanced)")).toBeInTheDocument();
    expect(screen.getByTestId("invitation-html-input")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("full HTML email"),
    );
  });

  it("describes branded custom HTML as a body and summarizes it when collapsed", async () => {
    await advanceToReviewPanel({ brandedCustomHtmlEnabled: true });

    expect(screen.getByText("Custom HTML body (advanced)")).toBeInTheDocument();
    expect(
      screen.getByText(/branding.*Coach identity.*button\/link.*footer/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/replaces only the markdown body/i)).toBeInTheDocument();
    expect(screen.getByText(/invitationUrl.*optional/i)).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Custom HTML body (advanced)" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("invitation-html-input"), {
      target: { value: "<p>Coach body</p>" },
    });
    fireEvent.click(screen.getByTestId("email-overrides-toggle"));

    expect(
      screen.getByText("Branded custom HTML body set for this campaign"),
    ).toBeInTheDocument();
  });

  it("distinguishes token-bearing full replacement HTML from a tokenless rollback draft", async () => {
    await advanceToReviewPanel({ brandedCustomHtmlEnabled: false });

    fireEvent.change(screen.getByTestId("invitation-html-input"), {
      target: { value: '<a href="{{invitationUrl}}">Start</a>' },
    });
    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    expect(
      screen.getByText("Full custom HTML replaces the branded email"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    fireEvent.change(screen.getByTestId("invitation-html-input"), {
      target: { value: "<p>Retained custom HTML</p>" },
    });
    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    expect(
      screen.getByText(
        "Custom HTML retained but inactive — branded template fallback will send",
      ),
    ).toBeInTheDocument();
  });

  it("blocks a tokenless rollback draft, then clears it and omits the HTML from creation", async () => {
    await advanceToReviewPanel({ brandedCustomHtmlEnabled: false });

    fireEvent.change(screen.getByTestId("invitation-html-input"), {
      target: { value: "<p>Retained custom HTML</p>" },
    });
    expect(
      screen.getByTestId("invitation-html-error"),
    ).toHaveTextContent("Full custom HTML must include {{invitationUrl}} or be cleared.");
    expect(screen.getByRole("button", { name: /save as draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /create campaign/i })).toBeDisabled();

    fireEvent.click(screen.getByTestId("invitation-html-clear"));
    expect(screen.queryByTestId("invitation-html-error")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save as draft/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /create campaign/i })).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
    });
    await waitFor(() => {
      expect(
        fetchCalls.find(
          (call) =>
            call.url.endsWith("/api/assessment-campaigns") &&
            call.method === "POST",
        ),
      ).toBeDefined();
    });
    const createCall = fetchCalls.find(
      (call) =>
        call.url.endsWith("/api/assessment-campaigns") && call.method === "POST",
    );
    expect(createCall?.body).not.toHaveProperty("invitationBodyHtml");
  });
});
