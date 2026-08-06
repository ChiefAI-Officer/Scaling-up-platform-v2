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
