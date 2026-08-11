import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

jest.mock("@/components/assessments/AssessmentResultView", () => ({
  AssessmentResultView: () => <div data-testid="mock-result-view" />,
}));

const toast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type {
  CampaignOverview,
  CampaignRespondentRow,
} from "@/lib/assessments/campaign-detail";

const CAMPAIGN_ID = "camp-html-branding-1";
const originalFetch = global.fetch;

function makeOverview(opts: {
  invitationBodyHtml?: string | null;
  invitationSubject?: string | null;
  invitationBodyMarkdown?: string | null;
} = {}): CampaignOverview {
  return {
    campaign: {
      id: CAMPAIGN_ID,
      name: "HTML Branding Campaign",
      alias: "html-branding-test",
      status: "ACTIVE",
      templateId: "tpl-1",
      templateName: "Rockefeller Habits Checklist",
      templateAlias: "rockefeller-habits",
      reportStyle: "CLASSIC",
      reportStyleSource: "TEMPLATE_DEFAULT",
      reportStyleLockedAt: null,
      organizationId: "org-1",
      organizationName: "Acme Corp",
      openAt: new Date("2026-07-01T00:00:00Z"),
      closeAt: null,
      createdAt: new Date("2026-06-01T00:00:00Z"),
      invitationSubject: opts.invitationSubject ?? null,
      invitationBodyMarkdown: opts.invitationBodyMarkdown ?? null,
      invitationBodyHtml: opts.invitationBodyHtml ?? null,
      showResultsOnScreen: false,
    },
    stats: {
      totalParticipants: 1,
      invited: 1,
      viewed: 0,
      submitted: 0,
      completionPct: 0,
    },
  };
}

const ROW: CampaignRespondentRow = {
  participantId: "part-1",
  respondent: {
    id: "resp-1",
    firstName: "Casey",
    lastName: "Respondent",
    email: "casey@test.com",
    jobTitle: null,
  },
  teamSnapshot: { pathIds: [], pathLabels: [] },
  invitation: {
    id: "inv-1",
    status: "SENT",
    sentAt: new Date("2026-07-02T00:00:00Z"),
    submittedAt: null,
    expiresAt: new Date("2026-08-02T00:00:00Z"),
    revokedAt: null,
    resentCount: 0,
  },
  hasSubmission: false,
  submissionId: null,
  submittedAt: null,
  isCEO: false,
};

function renderDetail(input: {
  brandedCustomHtmlEnabled: boolean;
  invitationBannerEnabled?: boolean;
  invitationBodyHtml: string | null;
  invitationSubject?: string | null;
  invitationBodyMarkdown?: string | null;
}): void {
  render(
    <CampaignDetail
      initialOverview={makeOverview(input)}
      initialRespondents={[ROW]}
      customHtmlEmailEnabled
      brandedCustomHtmlEnabled={input.brandedCustomHtmlEnabled}
      invitationBannerEnabled={input.invitationBannerEnabled}
    />,
  );
}

function mockSuccessfulSave() {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true }),
  })) as unknown as typeof fetch;
}

async function saveAndGetPayload() {
  fireEvent.click(screen.getByTestId("email-overrides-save"));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  return JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSuccessfulSave();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("CampaignDetail — invitation HTML branding", () => {
  it("uses body-only copy and summary when banner ownership is enabled independently", () => {
    renderDetail({
      brandedCustomHtmlEnabled: false,
      invitationBannerEnabled: true,
      invitationBodyHtml: "<p>Coach body</p>",
    });

    expect(screen.getByText("Branded custom HTML body set for this campaign")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    expect(screen.getByRole("textbox", { name: "Custom HTML body (advanced)" })).toHaveAttribute(
      "placeholder",
      expect.stringContaining("body fragment"),
    );
    expect(screen.queryByText(/must include.*invitationUrl/i)).not.toBeInTheDocument();
  });

  it("summarizes branded custom HTML without requiring another override", () => {
    renderDetail({
      brandedCustomHtmlEnabled: true,
      invitationBodyHtml: "<p>Coach body</p>",
    });

    expect(
      screen.getByText("Branded custom HTML body set for this campaign"),
    ).toBeInTheDocument();
  });

  it("labels branded custom HTML as a body fragment", () => {
    renderDetail({
      brandedCustomHtmlEnabled: true,
      invitationBodyHtml: null,
    });

    fireEvent.click(screen.getByTestId("email-overrides-toggle"));

    expect(
      screen.getByRole("textbox", { name: "Custom HTML body (advanced)" }),
    ).toHaveAttribute(
      "placeholder",
      "Paste a custom HTML body fragment here, or upload an .html file above. Leave blank to use the markdown body above.",
    );
  });

  it("uses the successful HTML save as the next editor baseline", async () => {
    renderDetail({
      brandedCustomHtmlEnabled: true,
      invitationBodyHtml: "<p>Initial body</p>",
      invitationSubject: "Initial subject",
    });

    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    fireEvent.change(screen.getByTestId("email-overrides-subject"), {
      target: { value: "Saved subject" },
    });
    fireEvent.change(screen.getByTestId("email-overrides-html"), {
      target: { value: "<p>Saved body</p>" },
    });
    await saveAndGetPayload();

    expect(
      screen.getByText("Branded custom HTML body set for this campaign"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    expect(screen.getByTestId("email-overrides-html")).toHaveValue(
      "<p>Saved body</p>",
    );
    expect(screen.getByTestId("email-overrides-subject")).toHaveValue(
      "Saved subject",
    );
    expect(screen.getByTestId("email-overrides-save")).toBeDisabled();

    fireEvent.change(screen.getByTestId("email-overrides-html"), {
      target: { value: "<p>Discarded body</p>" },
    });
    fireEvent.change(screen.getByTestId("email-overrides-subject"), {
      target: { value: "Discarded subject" },
    });
    expect(screen.getByTestId("email-overrides-save")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("email-overrides-cancel"));

    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    expect(screen.getByTestId("email-overrides-html")).toHaveValue(
      "<p>Saved body</p>",
    );
    expect(screen.getByTestId("email-overrides-subject")).toHaveValue(
      "Saved subject",
    );
  });

  it("normalizes controlled drafts to the successful PATCH row before reopening", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          invitationSubject: "Saved subject",
          invitationBodyMarkdown: "Saved markdown",
          invitationBodyHtml: null,
        },
      }),
    })) as unknown as typeof fetch;
    renderDetail({
      brandedCustomHtmlEnabled: true,
      invitationBodyHtml: "<p>Initial body</p>",
      invitationSubject: "Initial subject",
      invitationBodyMarkdown: "Initial markdown",
    });

    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    fireEvent.change(screen.getByTestId("email-overrides-subject"), {
      target: { value: "  Saved subject  " },
    });
    fireEvent.change(screen.getByTestId("email-overrides-body"), {
      target: { value: "\n Saved markdown \n" },
    });
    fireEvent.change(screen.getByTestId("email-overrides-html"), {
      target: { value: "  \n  " },
    });
    await saveAndGetPayload();

    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    expect(screen.getByTestId("email-overrides-subject")).toHaveValue(
      "Saved subject",
    );
    expect(screen.getByTestId("email-overrides-body")).toHaveValue(
      "Saved markdown",
    );
    expect(screen.getByTestId("email-overrides-html")).toHaveValue("");
    expect(screen.getByTestId("email-overrides-save")).toBeDisabled();
  });

  it("updates the collapsed summary from a successful subject-only save", async () => {
    renderDetail({
      brandedCustomHtmlEnabled: true,
      invitationBodyHtml: null,
    });

    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    fireEvent.change(screen.getByTestId("email-overrides-subject"), {
      target: { value: "Saved subject" },
    });
    await saveAndGetPayload();

    expect(
      screen.getByText("Custom subject/body set for this campaign"),
    ).toBeInTheDocument();
  });

  it("uses the template-default summary only when every stored override is empty", () => {
    renderDetail({
      brandedCustomHtmlEnabled: false,
      invitationBodyHtml: null,
      invitationSubject: "",
      invitationBodyMarkdown: "",
    });

    expect(
      screen.getByText("Using template default — click to customize"),
    ).toBeInTheDocument();
  });

  it("omits unchanged retained tokenless HTML from an unrelated subject PATCH", async () => {
    renderDetail({
      brandedCustomHtmlEnabled: false,
      invitationBodyHtml: "<p>Retained tokenless body</p>",
    });

    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    fireEvent.change(screen.getByTestId("email-overrides-subject"), {
      target: { value: "Updated subject" },
    });

    await expect(saveAndGetPayload()).resolves.toEqual({
      invitationSubject: "Updated subject",
      invitationBodyMarkdown: null,
    });
  });

  it("sends an edited retained HTML override and shows the server validation inline", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: "HTML must include {{invitationUrl}}.",
      }),
    })) as unknown as typeof fetch;
    renderDetail({
      brandedCustomHtmlEnabled: false,
      invitationBodyHtml: "<p>Retained tokenless body</p>",
    });

    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    fireEvent.change(screen.getByTestId("email-overrides-html"), {
      target: { value: "<p>Edited tokenless body</p>" },
    });

    const payload = await saveAndGetPayload();
    expect(payload).toMatchObject({
      invitationBodyHtml: "<p>Edited tokenless body</p>",
    });
    expect(
      screen.getByText("Full custom HTML must include {{invitationUrl}} or be cleared."),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("email-overrides-html-error"),
    ).toHaveTextContent("HTML must include {{invitationUrl}}.");
  });

  it("sends null when the retained HTML override is cleared", async () => {
    renderDetail({
      brandedCustomHtmlEnabled: false,
      invitationBodyHtml: "<p>Retained tokenless body</p>",
    });

    fireEvent.click(screen.getByTestId("email-overrides-toggle"));
    fireEvent.click(screen.getByTestId("email-overrides-html-clear"));

    await expect(saveAndGetPayload()).resolves.toEqual({
      invitationSubject: null,
      invitationBodyMarkdown: null,
      invitationBodyHtml: null,
    });
  });

  it.each([
    {
      name: "branded body",
      brandedCustomHtmlEnabled: true,
      invitationBodyHtml: "<p>Coach body</p>",
      expected: "Branded custom HTML body saved.",
    },
    {
      name: "full replacement",
      brandedCustomHtmlEnabled: false,
      invitationBodyHtml: '<a href="{{invitationUrl}}">Start</a>',
      expected: "Full custom HTML replacement saved.",
    },
    {
      name: "retained inactive HTML",
      brandedCustomHtmlEnabled: false,
      invitationBodyHtml: "<p>Retained tokenless body</p>",
      expected:
        "Custom HTML retained but inactive — branded template fallback will send.",
    },
    {
      name: "empty defaults",
      brandedCustomHtmlEnabled: false,
      invitationBodyHtml: null,
      invitationSubject: "Prior custom subject",
      expected: "Using template default.",
    },
    {
      name: "subject override",
      brandedCustomHtmlEnabled: false,
      invitationBodyHtml: null,
      invitationSubject: "Custom subject",
      expected: "New campaign overrides applied.",
    },
  ])("uses the $name save confirmation", async (input) => {
    renderDetail(input);
    fireEvent.click(screen.getByTestId("email-overrides-toggle"));

    if (input.name === "empty defaults") {
      fireEvent.change(screen.getByTestId("email-overrides-subject"), {
        target: { value: "" },
      });
    } else {
      fireEvent.change(screen.getByTestId("email-overrides-subject"), {
        target: { value: "Updated subject" },
      });
    }

    await saveAndGetPayload();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Invitation email saved",
        description: input.expected,
      }),
    );
  });
});
