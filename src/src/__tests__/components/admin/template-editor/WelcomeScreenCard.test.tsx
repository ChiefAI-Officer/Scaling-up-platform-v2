import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { WelcomeScreenCard } from "@/components/admin/template-editor/WelcomeScreenCard";
import {
  GENERIC_INVITED_WELCOME_CONFIG,
  type InvitedWelcomeAuthoringInput,
} from "@/lib/assessments/invited-welcome-config";

const values: InvitedWelcomeAuthoringInput = {
  eyebrow: GENERIC_INVITED_WELCOME_CONFIG.eyebrow,
  headingTemplate: GENERIC_INVITED_WELCOME_CONFIG.headingTemplate,
  ledeParagraphs: [...GENERIC_INVITED_WELCOME_CONFIG.ledeParagraphs],
  sharingHeading: GENERIC_INVITED_WELCOME_CONFIG.sharingHeading,
  sharingDescription: GENERIC_INVITED_WELCOME_CONFIG.sharingDescription,
  scoresHeading: GENERIC_INVITED_WELCOME_CONFIG.scoresHeading,
  scoresDescription: GENERIC_INVITED_WELCOME_CONFIG.scoresDescription,
  ctaLabel: GENERIC_INVITED_WELCOME_CONFIG.ctaLabel,
};

const questions = Array.from({ length: 8 }, (_, index) => ({
  stableKey: `q${index + 1}`,
  type: "SLIDER_LIKERT",
  scaleMin: 0,
  scaleMax: 10,
}));

function renderCard(overrides: Partial<React.ComponentProps<typeof WelcomeScreenCard>> = {}) {
  const onChange = jest.fn();
  const view = render(
    <WelcomeScreenCard
      values={values}
      finePrint={null}
      questions={questions}
      sections={[{ stableKey: "s1" }, { stableKey: "s2" }]}
      isReadOnly={false}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { ...view, onChange };
}

describe("WelcomeScreenCard", () => {
  it("is collapsed by default with the fixed position and shortened lede", () => {
    renderCard();

    expect(screen.getByText("Welcome screen")).toBeInTheDocument();
    expect(screen.getByText("First screen respondents see")).toBeInTheDocument();
    expect(screen.getByText("Before Section 1")).toBeInTheDocument();
    expect(screen.getByText(/A quick check on how your team works together/)).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Expand Welcome screen" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Invitation label")).not.toBeInTheDocument();
  });

  it("requests controlled expansion and focuses the validation field after the parent opens it", async () => {
    const onExpandedChange = jest.fn();
    const view = renderCard({ expanded: false, onExpandedChange });

    fireEvent.click(screen.getByRole("button", { name: "Expand Welcome screen" }));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(screen.queryByLabelText("Invitation label")).not.toBeInTheDocument();

    view.rerender(
      <WelcomeScreenCard
        values={values}
        finePrint={null}
        questions={questions}
        sections={[]}
        isReadOnly={false}
        errors={{ headingTemplate: "Heading must contain {{campaignName}}" }}
        expanded
        onExpandedChange={onExpandedChange}
        focusField="headingTemplate"
        onChange={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Heading")).toHaveFocus());
  });

  it("expands all eight authored fields and previews an edited sharing explanation", () => {
    const { container, onChange } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Expand Welcome screen" }));

    expect(screen.getByText(
      "Changes become the default for future invited campaigns. Campaigns already created keep the Welcome screen they started with.",
    )).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Sharing explanation"), {
      target: { value: "Only your named coach can review these answers." },
    });
    expect(onChange).toHaveBeenCalledWith({
      sharingDescription: "Only your named coach can review these answers.",
    });
    expect(screen.getByRole("button", { name: "Start the assessment →" })).toBeDisabled();
    expect(container.textContent).not.toMatch(/Automatic:|Protected:/);
    expect(screen.queryByRole("button", { name: /save welcome/i })).not.toBeInTheDocument();
  });

  it("maps blank-line-separated textarea paragraphs and renders field errors", () => {
    const { onChange } = renderCard({ errors: { headingTemplate: "Heading is required" } });
    fireEvent.click(screen.getByRole("button", { name: "Expand Welcome screen" }));

    fireEvent.change(screen.getByLabelText("Welcome message"), {
      target: { value: "Paragraph one.\n\nParagraph two." },
    });
    expect(onChange).toHaveBeenCalledWith({
      ledeParagraphs: ["Paragraph one.", "Paragraph two."],
    });
    expect(screen.getByText("Heading is required")).toHaveAttribute(
      "id",
      "welcome-headingTemplate-error",
    );
    expect(screen.getByLabelText("Heading")).toHaveAttribute(
      "aria-describedby",
      "welcome-headingTemplate-help welcome-headingTemplate-error",
    );
  });

  it("preserves a blank-line paragraph separator during sequential typing", () => {
    const StatefulCard = () => {
      const [current, setCurrent] = React.useState(values);
      return (
        <WelcomeScreenCard
          values={current}
          finePrint={null}
          questions={questions}
          sections={[]}
          isReadOnly={false}
          onChange={(patch) => setCurrent((previous) => ({ ...previous, ...patch }))}
        />
      );
    };
    render(<StatefulCard />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Welcome screen" }));
    const message = screen.getByLabelText("Welcome message") as HTMLTextAreaElement;

    fireEvent.change(message, { target: { value: "First paragraph.\n" } });
    expect(message).toHaveValue("First paragraph.\n");
    fireEvent.change(message, { target: { value: "First paragraph.\n\n" } });
    expect(message).toHaveValue("First paragraph.\n\n");
    fireEvent.change(message, {
      target: { value: "First paragraph.\n\nSecond paragraph." },
    });
    expect(message).toHaveValue("First paragraph.\n\nSecond paragraph.");
  });

  it("stacks authored fields before preview in source order and disables editing when published", () => {
    renderCard({ isReadOnly: true });
    fireEvent.click(screen.getByRole("button", { name: "Expand Welcome screen" }));

    const region = screen.getByTestId("welcome-screen-expanded");
    const fields = within(region).getByTestId("welcome-screen-fields");
    const preview = within(region).getByTestId("welcome-screen-preview");
    expect(fields.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText("Invitation label")).toBeDisabled();
  });
});
