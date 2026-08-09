import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PublicCampaignCreateOption } from "@/lib/assessments/public-campaign-create-options";
import { CreatePublicCampaignForm } from "@/components/admin/public-campaigns/CreatePublicCampaignForm";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const OPTIONS: PublicCampaignCreateOption[] = [
  {
    id: "template-scaling-up",
    name: "Scaling Up Assessment",
    alias: "scaling-up-assessment",
    defaultReportStyle: "CLASSIC",
    reportStylesEnabled: true,
    reportStylePreviewCapabilities: {
      reportType: "scored",
      hasMetrics: true,
      hasNarrativeResponses: false,
    },
  },
  {
    id: "template-leadership",
    name: "Leadership Values Assessment",
    alias: "leadership-values-custom",
    defaultReportStyle: "MODERN_DASHBOARD",
    reportStylesEnabled: true,
    reportStylePreviewCapabilities: {
      reportType: "qualitative",
      hasMetrics: false,
      hasNarrativeResponses: true,
    },
  },
  {
    id: "template-rockefeller",
    name: "Rockefeller Habits Checklist",
    alias: "rockefeller-habits-checklist",
    defaultReportStyle: "EXECUTIVE_BOARDROOM",
    reportStylesEnabled: false,
  },
];

const CREATED_CAMPAIGN = {
  id: "campaign-new",
  name: "Leadership Momentum",
  alias: "leadership-momentum",
  status: "DRAFT",
  accessMode: "PUBLIC",
  openAt: "2026-08-10T04:00:00.000Z",
  closeAt: null,
  reportStyle: "CLASSIC",
  reportStyleSource: "TEMPLATE_DEFAULT",
  reportStyleLockedAt: null,
  template: {
    id: "template-scaling-up",
    name: "Scaling Up Assessment",
    alias: "scaling-up-assessment",
  },
  organization: null,
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => body,
  } as Response;
}

function chooseAssessment(id = "template-scaling-up") {
  fireEvent.change(screen.getByRole("combobox", { name: "Assessment" }), {
    target: { value: id },
  });
}

function enterName(value = "Leadership Momentum") {
  fireEvent.change(screen.getByRole("textbox", { name: "Campaign name" }), {
    target: { value },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
}

function submittedBody(): Record<string, unknown> {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  jest.useRealTimers();
  mockPush.mockReset();
  global.fetch = jest.fn().mockResolvedValue(
    jsonResponse(201, { success: true, data: CREATED_CAMPAIGN }),
  );
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("CreatePublicCampaignForm", () => {
  it("replaces creation controls with a directed empty state when no assessment is eligible", () => {
    render(<CreatePublicCampaignForm options={[]} />);

    expect(
      screen.getByRole("heading", {
        name: "No published assessments are available.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Publish an assessment before creating a public campaign.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage assessments" })).toHaveAttribute(
      "href",
      "/admin/assessments/templates",
    );
    expect(screen.queryByRole("button", { name: "Create draft" })).not.toBeInTheDocument();
  });

  it("renders the focused plain-language form with immediate and open-ended defaults", () => {
    const { container } = render(<CreatePublicCampaignForm options={OPTIONS} />);

    expect(screen.getByRole("combobox", { name: "Assessment" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Campaign name" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Starts" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Ends" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Open immediately" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "No end date" })).toBeChecked();
    expect(screen.queryByLabelText("Start date and time")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("End date and time")).not.toBeInTheDocument();

    chooseAssessment();
    expect(
      screen.getByRole("heading", { name: "Report design" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Report design" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Report style" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Uses the assessment's default design."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create draft" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/admin/assessments/public-campaigns",
    );

    [
      'accessMode="PUBLIC"',
      "organizationId",
      "createdByCoachId",
      "NOT NULL FK",
      "422",
      "OPEN_END",
      "ENDS_AFTER",
      "scaling-up-assessment",
    ].forEach((forbidden) => {
      expect(container).not.toHaveTextContent(forbidden);
    });
  });

  it("exposes every conditionally required field to assistive technology", () => {
    render(<CreatePublicCampaignForm options={OPTIONS} />);

    expect(screen.getByRole("combobox", { name: "Assessment" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Campaign name" })).toBeRequired();
    fireEvent.click(screen.getByRole("radio", { name: "Choose a date and time" }));
    fireEvent.click(screen.getByRole("radio", { name: "Choose an end date" }));
    expect(screen.getByLabelText("Start date and time")).toBeRequired();
    expect(screen.getByLabelText("End date and time")).toBeRequired();
  });

  it("marks every missing required value and focuses the first invalid control", async () => {
    render(<CreatePublicCampaignForm options={OPTIONS} />);

    fireEvent.click(screen.getByRole("radio", { name: "Choose a date and time" }));
    fireEvent.click(screen.getByRole("radio", { name: "Choose an end date" }));
    submit();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Complete the highlighted fields.",
    );
    expect(screen.getByText("Choose an assessment.")).toBeInTheDocument();
    expect(screen.getByText("Enter a campaign name.")).toBeInTheDocument();
    expect(screen.getByText("Choose a start date and time.")).toBeInTheDocument();
    expect(screen.getByText("Choose an end date and time.")).toBeInTheDocument();
    const assessment = screen.getByRole("combobox", { name: "Assessment" });
    await waitFor(() => expect(assessment).toHaveFocus());
    expect(assessment).toHaveAttribute("aria-invalid", "true");
    expect(assessment).toHaveAccessibleDescription("Choose an assessment.");
  });

  it("focuses the first missing scheduled date after earlier required values are complete", async () => {
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    enterName();
    fireEvent.click(screen.getByRole("radio", { name: "Choose a date and time" }));
    fireEvent.click(screen.getByRole("radio", { name: "Choose an end date" }));

    submit();

    const start = screen.getByLabelText("Start date and time");
    await waitFor(() => expect(start).toHaveFocus());
    expect(start).toHaveAccessibleDescription("Choose a start date and time.");
    expect(screen.getByLabelText("End date and time")).toHaveAccessibleDescription(
      "Choose an end date and time.",
    );
  });

  it("rejects an end date at or before the start date without a request", async () => {
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    enterName();
    fireEvent.click(screen.getByRole("radio", { name: "Choose a date and time" }));
    fireEvent.change(screen.getByLabelText("Start date and time"), {
      target: { value: "2026-08-18T10:00" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Choose an end date" }));
    fireEvent.change(screen.getByLabelText("End date and time"), {
      target: { value: "2026-08-18T10:00" },
    });

    submit();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      screen.getByText("Choose an end date after the start date."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("End date and time")).toHaveFocus(),
    );
  });

  it("serializes immediate and no-end modes without internal or inherited fields", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-10T04:00:00.000Z"));
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    enterName("  Leadership Momentum  ");

    submit();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/public-campaigns",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(submittedBody()).toEqual({
      templateId: "template-scaling-up",
      name: "Leadership Momentum",
      openAt: "2026-08-10T04:00:00.000Z",
      closeAt: null,
    });
  });

  it("serializes scheduled dates and only the explicitly customized report style", async () => {
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    enterName();
    fireEvent.click(
      screen.getByRole("radio", { name: /Executive Boardroom/i }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Choose a date and time" }));
    fireEvent.change(screen.getByLabelText("Start date and time"), {
      target: { value: "2026-08-18T10:00" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Choose an end date" }));
    fireEvent.change(screen.getByLabelText("End date and time"), {
      target: { value: "2026-09-18T17:30" },
    });

    submit();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(submittedBody()).toEqual({
      templateId: "template-scaling-up",
      name: "Leadership Momentum",
      openAt: new Date("2026-08-18T10:00").toISOString(),
      closeAt: new Date("2026-09-18T17:30").toISOString(),
      reportStyle: "EXECUTIVE_BOARDROOM",
    });
  });

  it("resets customization to the next assessment default and resolves its preview anatomy", () => {
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    fireEvent.click(
      screen.getByRole("radio", { name: /Executive Boardroom/i }),
    );
    expect(screen.getByText("Customized for this campaign.")).toBeInTheDocument();

    chooseAssessment("template-leadership");

    expect(screen.getByRole("radio", { name: /Modern Dashboard/i })).toBeChecked();
    expect(
      screen.getByText("Uses the assessment's default design."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Modern Dashboard Cover preview" }),
    ).toHaveAttribute(
      "src",
      "/report-style-previews/sparse-custom/modern-dashboard/cover.webp",
    );
  });

  it("removes report design for unsupported assessments and never serializes a style", async () => {
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    fireEvent.click(
      screen.getByRole("radio", { name: /Executive Boardroom/i }),
    );

    chooseAssessment("template-rockefeller");
    enterName();
    expect(
      screen.queryByRole("heading", { name: "Report design" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Report style selection" }),
    ).not.toBeInTheDocument();

    submit();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(submittedBody()).toEqual(
      expect.not.objectContaining({ reportStyle: expect.anything() }),
    );
  });

  it("redirects to the list with the encoded created campaign ID", async () => {
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    enterName();

    submit();

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        "/admin/assessments/public-campaigns?created=campaign-new",
      ),
    );
  });

  it.each(["TEMPLATE_VERSION_NOT_PUBLISHED", "TEMPLATE_DISABLED"])(
    "maps the %s eligibility race to approved guidance and preserves values",
    async (error) => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse(409, {
          success: false,
          error,
          message: "Raw server detail must not be rendered.",
        }),
      );
      render(<CreatePublicCampaignForm options={OPTIONS} />);
      chooseAssessment("template-leadership");
      enterName("Momentum Check");

      submit();

      expect(
        await screen.findByRole("alert"),
      ).toHaveTextContent("Publish this assessment before creating a campaign.");
      expect(screen.queryByText("Raw server detail must not be rendered.")).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Assessment" })).toHaveValue("template-leadership");
      expect(screen.getByRole("textbox", { name: "Campaign name" })).toHaveValue("Momentum Check");
    },
  );

  it("uses approved generic guidance for unknown server failures without leaking raw detail", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(500, {
        success: false,
        error: "DATABASE_CONSTRAINT_DETAIL",
        message: "organizationId violated NOT NULL FK",
      }),
    );
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    enterName("Momentum Check");

    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't create this campaign. Check the details and try again.",
    );
    expect(screen.queryByText(/DATABASE_CONSTRAINT_DETAIL/)).not.toBeInTheDocument();
    expect(screen.queryByText(/organizationId/)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Assessment" })).toHaveValue("template-scaling-up");
    expect(screen.getByRole("textbox", { name: "Campaign name" })).toHaveValue("Momentum Check");
  });

  it("uses approved generic guidance for network failures and preserves all scheduling values", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("socket ENETDOWN"));
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    enterName("Momentum Check");
    fireEvent.click(screen.getByRole("radio", { name: "Choose a date and time" }));
    fireEvent.change(screen.getByLabelText("Start date and time"), {
      target: { value: "2026-08-18T10:00" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Choose an end date" }));
    fireEvent.change(screen.getByLabelText("End date and time"), {
      target: { value: "2026-09-18T17:30" },
    });

    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't create this campaign. Check the details and try again.",
    );
    expect(screen.queryByText(/socket|ENETDOWN/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Campaign name" })).toHaveValue("Momentum Check");
    expect(screen.getByLabelText("Start date and time")).toHaveValue(
      "2026-08-18T10:00",
    );
    expect(screen.getByLabelText("End date and time")).toHaveValue(
      "2026-09-18T17:30",
    );
  });

  it("keeps a successful creation latched while navigation completes", async () => {
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    enterName();

    submit();

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const redirecting = screen.getByRole("button", { name: "Redirecting…" });
    expect(redirecting).toBeDisabled();
    fireEvent.click(redirecting);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const cancel = screen.getByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    expect(cancel).toHaveAttribute("tabindex", "-1");
    expect(fireEvent.click(cancel)).toBe(false);
  });

  it("re-enables creation controls when redirecting fails", async () => {
    mockPush.mockImplementationOnce(() => {
      throw new Error("navigation failed");
    });
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    enterName();

    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't create this campaign. Check the details and try again.",
    );
    expect(screen.getByRole("button", { name: "Create draft" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Cancel" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });

  it("disables duplicate submission and makes Cancel inert while creation is pending", async () => {
    let resolveRequest!: (response: Response) => void;
    (global.fetch as jest.Mock).mockImplementation(
      () => new Promise<Response>((resolve) => (resolveRequest = resolve)),
    );
    render(<CreatePublicCampaignForm options={OPTIONS} />);
    chooseAssessment();
    enterName();

    submit();

    const pending = screen.getByRole("button", { name: "Creating…" });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const cancel = screen.getByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    expect(cancel).toHaveAttribute("tabindex", "-1");
    expect(fireEvent.click(cancel)).toBe(false);

    resolveRequest(jsonResponse(201, { success: true, data: CREATED_CAMPAIGN }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  });
});
