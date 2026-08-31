import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { SimplifiedAssessmentTemplateForm } from "@/components/admin/SimplifiedAssessmentTemplateForm";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function enterName(value = "Team Health") {
  fireEvent.change(screen.getByLabelText("Assessment name"), {
    target: { value },
  });
}

beforeEach(() => {
  pushMock.mockReset();
  global.fetch = jest.fn();
});

afterEach(() => cleanup());

describe("SimplifiedAssessmentTemplateForm", () => {
  it("requires an explicit public or invited assessment type when enabled", () => {
    render(<SimplifiedAssessmentTemplateForm deliveryTypeEnabled />);

    expect(
      screen.getByRole("radio", { name: /public marketing quiz/i }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("radio", { name: /invited assessment/i }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Create and start building" }),
    ).toBeDisabled();
  });

  it("posts the selected public delivery type", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(201, {
        success: true,
        data: { id: "tpl-1", alias: "team-health", versionId: "ver-1" },
      }),
    );
    render(<SimplifiedAssessmentTemplateForm deliveryTypeEnabled />);

    fireEvent.click(
      screen.getByRole("radio", { name: /public marketing quiz/i }),
    );
    enterName();
    fireEvent.click(
      screen.getByRole("button", { name: "Create and start building" }),
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string),
    ).toEqual({
      creationMode: "simplified",
      name: "Team Health",
      deliveryType: "PUBLIC_MARKETING_QUIZ",
    });
  });

  it("shows only the required identity field and a collapsed Advanced disclosure", () => {
    render(<SimplifiedAssessmentTemplateForm />);

    expect(
      screen.getByRole("textbox", { name: "Assessment name" }),
    ).toBeRequired();
    expect(
      screen.getByRole("button", { name: "Advanced" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Internal ID")).not.toBeInTheDocument();
    expect(screen.queryByText(/scoring configuration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invitation/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/admin/assessments/templates",
    );
    expect(
      screen.getByRole("button", { name: "Create and start building" }),
    ).toBeInTheDocument();
  });

  it("keeps the welcome card and welcome payload absent by default", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(201, {
        success: true,
        data: { id: "tpl-1", alias: "team-health", versionId: "ver-1" },
      }),
    );
    render(<SimplifiedAssessmentTemplateForm />);

    expect(screen.queryByTestId("welcome-screen-card")).not.toBeInTheDocument();
    enterName();
    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string),
    ).toEqual({ creationMode: "simplified", name: "Team Health" });
  });

  it("renders the collapsed welcome card between the name and Advanced controls", () => {
    render(<SimplifiedAssessmentTemplateForm welcomeAuthoringEnabled />);

    const name = screen.getByLabelText("Assessment name");
    const card = screen.getByTestId("welcome-screen-card");
    const advanced = screen.getByRole("button", { name: "Advanced" });
    expect(name.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expand Welcome screen" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand Welcome screen" }));

    for (const label of [
      "Invitation label",
      "Heading",
      "Welcome message",
      "Sharing heading",
      "Sharing explanation",
      "Scores heading",
      "Scores explanation",
      "Button label",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "Example campaign" })).toBeInTheDocument();
    expect(screen.getByTestId("welcome-stats")).toHaveTextContent(
      "0questions0sections",
    );
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("posts the authored welcome default when welcome authoring is enabled", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(201, {
        success: true,
        data: { id: "tpl-1", alias: "team-health", versionId: "ver-1" },
      }),
    );
    render(<SimplifiedAssessmentTemplateForm welcomeAuthoringEnabled />);

    enterName();
    fireEvent.click(screen.getByRole("button", { name: "Expand Welcome screen" }));
    fireEvent.change(screen.getByLabelText("Invitation label"), {
      target: { value: "Please begin" },
    });
    fireEvent.change(screen.getByLabelText("Welcome message"), {
      target: { value: "First paragraph.\n\nSecond paragraph." },
    });
    fireEvent.change(screen.getByLabelText("Sharing explanation"), {
      target: { value: "Your facilitator can review your named answers." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string),
    ).toEqual({
      creationMode: "simplified",
      name: "Team Health",
      invitedWelcomeDefault: {
        eyebrow: "Please begin",
        headingTemplate: "{{campaignName}}",
        ledeParagraphs: ["First paragraph.", "Second paragraph."],
        sharingHeading: "How your answers are shared",
        sharingDescription: "Your facilitator can review your named answers.",
        scoresHeading: "Your category scores",
        scoresDescription: "See where the team stands across each category.",
        ctaLabel: "Start the assessment",
      },
    });
  });

  it.each([
    [
      "a heading without the required token",
      "Heading",
      "A heading without the required token",
      "Heading must contain {{campaignName}}",
    ],
    [
      "an unsupported heading token",
      "Heading",
      "Welcome {{organizationName}} {{campaignName}}",
      "Only {{campaignName}} is supported",
    ],
    ["an empty invitation label", "Invitation label", "", "Too small: expected string to have >=1 characters"],
    [
      "five welcome paragraphs",
      "Welcome message",
      "One.\n\nTwo.\n\nThree.\n\nFour.\n\nFive.",
      "Too big: expected array to have <=4 items",
    ],
    ["a CTA longer than 80 characters", "Button label", "x".repeat(81), "Too big: expected string to have <=80 characters"],
    ["a control character", "Invitation label", "Welcome\u0000team", "Control characters are not allowed"],
  ])(
    "blocks submission, expands, and focuses the first invalid field for %s",
    async (_scenario, label, value, error) => {
      render(<SimplifiedAssessmentTemplateForm welcomeAuthoringEnabled />);

      enterName();
      fireEvent.click(screen.getByRole("button", { name: "Expand Welcome screen" }));
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Collapse Welcome screen" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.getByText(error)).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText(label)).toHaveFocus());
    },
  );

  it("refocuses the first invalid Welcome field on an unchanged repeated submit", async () => {
    render(<SimplifiedAssessmentTemplateForm welcomeAuthoringEnabled />);

    enterName();
    fireEvent.click(screen.getByRole("button", { name: "Expand Welcome screen" }));
    const heading = screen.getByLabelText("Heading");
    fireEvent.change(heading, {
      target: { value: "A heading without the required token" },
    });
    const submit = screen.getByRole("button", {
      name: "Create and start building",
    });

    fireEvent.click(submit);
    await waitFor(() => expect(heading).toHaveFocus());

    submit.focus();
    expect(submit).toHaveFocus();
    fireEvent.click(submit);

    expect(global.fetch).not.toHaveBeenCalled();
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("derives the Internal ID from the name until an administrator edits it", () => {
    render(<SimplifiedAssessmentTemplateForm />);

    enterName("  Team Health & Growth  ");
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(screen.getByLabelText("Internal ID")).toHaveValue(
      "team-health-growth",
    );

    fireEvent.change(screen.getByLabelText("Internal ID"), {
      target: { value: "team-check" },
    });
    fireEvent.change(screen.getByLabelText("Assessment name"), {
      target: { value: "Renamed Assessment" },
    });
    expect(screen.getByLabelText("Internal ID")).toHaveValue("team-check");
  });

  it("preserves a manually entered uppercase Internal ID and rejects its format locally", () => {
    render(<SimplifiedAssessmentTemplateForm />);

    enterName();
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByLabelText("Internal ID"), {
      target: { value: "Team-Check" },
    });

    expect(screen.getByLabelText("Internal ID")).toHaveValue("Team-Check");
    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Use lowercase letters, numbers, and hyphens for the Internal ID.",
      ),
    ).toBeInTheDocument();
  });

  it("posts the simplified payload without an Internal ID and starts building on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(201, {
        success: true,
        data: { id: "tpl-1", alias: "team-health", versionId: "ver-1" },
      }),
    );
    render(<SimplifiedAssessmentTemplateForm />);

    enterName("  Team Health  ");
    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/assessment-templates",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string),
    ).toEqual({ creationMode: "simplified", name: "Team Health" });
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/admin/assessments/templates/tpl-1/versions/ver-1/edit?tab=questions",
      ),
    );
  });

  it("posts the manually edited Internal ID exactly once", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(201, {
        success: true,
        data: { id: "tpl-1", alias: "team-check", versionId: "ver-1" },
      }),
    );
    render(<SimplifiedAssessmentTemplateForm />);

    enterName();
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByLabelText("Internal ID"), {
      target: { value: "team-check" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string),
    ).toEqual({
      creationMode: "simplified",
      name: "Team Health",
      internalId: "team-check",
    });
  });

  it("opens Advanced, focuses Internal ID, and does not retry a collision", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(409, {}));
    render(<SimplifiedAssessmentTemplateForm />);

    enterName();
    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    await waitFor(() =>
      expect(
        screen.getByText("That Internal ID is already in use. Choose another one."),
      ).toBeInTheDocument(),
    );
    const internalId = screen.getByLabelText("Internal ID");
    expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await waitFor(() => expect(internalId).toHaveFocus());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(internalId).toHaveAccessibleDescription(
      "That Internal ID is already in use. Choose another one.",
    );
  });

  it("clears an automatic Internal ID validation error when a new name generates an ID", async () => {
    render(<SimplifiedAssessmentTemplateForm />);

    enterName("!!!");
    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    const internalId = await screen.findByLabelText("Internal ID");
    expect(internalId).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter an Internal ID.")).toBeInTheDocument();

    enterName("Team Health");

    expect(internalId).toHaveValue("team-health");
    expect(internalId).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText("Enter an Internal ID.")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears an automatic collision error when a renamed assessment generates a new ID", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(409, {}));
    render(<SimplifiedAssessmentTemplateForm />);

    enterName("Team Health");
    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    const internalId = await screen.findByLabelText("Internal ID");
    expect(internalId).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("That Internal ID is already in use. Choose another one."),
    ).toBeInTheDocument();

    enterName("Leadership Health");

    expect(internalId).toHaveValue("leadership-health");
    expect(internalId).toHaveAttribute("aria-invalid", "false");
    expect(
      screen.queryByText("That Internal ID is already in use. Choose another one."),
    ).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a blank name locally and associates the error with the field", () => {
    render(<SimplifiedAssessmentTemplateForm />);

    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    const name = screen.getByLabelText("Assessment name");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(name).toHaveAttribute(
      "aria-describedby",
      "template-assessment-name-error",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/assessment name/i);
  });

  it("opens Advanced and focuses the Internal ID when the name cannot generate one", async () => {
    render(<SimplifiedAssessmentTemplateForm />);

    enterName("!!!");
    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    const internalId = await screen.findByLabelText("Internal ID");
    expect(global.fetch).not.toHaveBeenCalled();
    await waitFor(() => expect(internalId).toHaveFocus());
  });

  it("prevents a second request while the first creation request is pending", async () => {
    let resolveFetch: (response: ReturnType<typeof jsonResponse>) => void;
    (global.fetch as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    render(<SimplifiedAssessmentTemplateForm />);

    enterName();
    const submit = screen.getByRole("button", { name: "Create and start building" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveFetch!(jsonResponse(500, {}));
    await screen.findByText("We couldn't create this assessment. Try again.");
  });

  it("keeps entered values and shows retry-later copy after rate limiting", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(429, {}));
    render(<SimplifiedAssessmentTemplateForm />);

    enterName();
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByLabelText("Internal ID"), {
      target: { value: "team-check" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    expect(
      await screen.findByText("Too many attempts. Wait a moment and try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Assessment name")).toHaveValue("Team Health");
    expect(screen.getByLabelText("Internal ID")).toHaveValue("team-check");
  });

  it.each([
    ["a server error", () => Promise.resolve(jsonResponse(500, {}))],
    ["a network error", () => Promise.reject(new Error("offline"))],
    [
      "a success response without versionId",
      () =>
        Promise.resolve(
          jsonResponse(201, {
            success: true,
            data: { id: "tpl-1", alias: "team-health" },
          }),
        ),
    ],
  ])("keeps entered values after %s", async (_scenario, fetchResult) => {
    (global.fetch as jest.Mock).mockImplementation(fetchResult);
    render(<SimplifiedAssessmentTemplateForm />);

    enterName();
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByLabelText("Internal ID"), {
      target: { value: "team-check" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create and start building" }));

    expect(
      await screen.findByText("We couldn't create this assessment. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Assessment name")).toHaveValue("Team Health");
    expect(screen.getByLabelText("Internal ID")).toHaveValue("team-check");
  });
});
