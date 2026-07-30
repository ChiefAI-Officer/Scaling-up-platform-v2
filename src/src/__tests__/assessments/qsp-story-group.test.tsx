import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MAX_TEXT_ANSWER_LENGTH } from "@/lib/assessments/answer-limits";
import type { QspStoryQuestions } from "@/lib/assessments/qsp-story-group";
import { QspStoryGroup } from "@/components/assessments/qsp-story-group";

const prompt = "Which employees have demonstrated that they live the core values? Why? Share the stories.";

const triplet: QspStoryQuestions = [1, 2, 3].map((index) => ({
  stableKey: `P1_core_values_story_${index}`,
  sortOrder: index,
  sectionStableKey: "P1_retrospective",
  type: "TEXT",
  label: `${prompt} (Story ${index} of 3)`,
  isRequired: false,
})) as QspStoryQuestions;

describe("QspStoryGroup", () => {
  test("reveals fields in order, focuses the new field, and writes its stable key", async () => {
    const onAnswerChange = jest.fn();
    render(<QspStoryGroup questions={triplet} prompt={prompt} answers={{}} onAnswerChange={onAnswerChange} />);

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Person and story 1 of 3" }))
      .toHaveAttribute("maxlength", String(MAX_TEXT_ANSWER_LENGTH));
    expect(screen.getByRole("textbox", { name: "Person and story 1 of 3" }))
      .toHaveAttribute(
        "placeholder",
        "Name the person, then describe what they did…",
      );

    fireEvent.click(screen.getByRole("button", { name: /add another person/i }));
    const second = screen.getByRole("textbox", { name: "Person and story 2 of 3" });
    await waitFor(() => expect(second).toHaveFocus());

    fireEvent.change(second, { target: { value: "Ada led the launch" } });
    expect(onAnswerChange).toHaveBeenCalledWith("P1_core_values_story_2", "Ada led the launch");

    fireEvent.click(screen.getByRole("button", { name: /add another person/i }));
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /add another person/i })).not.toBeInTheDocument();
  });

  test("restores visibility through the third nonblank story", () => {
    render(<QspStoryGroup
      questions={triplet}
      prompt={prompt}
      answers={{ P1_core_values_story_3: "Grace coached the team" }}
      onAnswerChange={jest.fn()}
    />);

    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  test("does not reveal whitespace-only restored stories", () => {
    render(<QspStoryGroup
      questions={triplet}
      prompt={prompt}
      answers={{ P1_core_values_story_3: "   " }}
      onAnswerChange={jest.fn()}
    />);

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  test("keeps restored fields visible when their answers later clear", () => {
    const onAnswerChange = jest.fn();
    const { rerender } = render(<QspStoryGroup
      questions={triplet}
      prompt={prompt}
      answers={{ P1_core_values_story_3: "Grace coached the team" }}
      onAnswerChange={onAnswerChange}
    />);

    rerender(<QspStoryGroup questions={triplet} prompt={prompt} answers={{}} onAnswerChange={onAnswerChange} />);

    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  test("grows visibility when draft hydration arrives after mount", () => {
    const onAnswerChange = jest.fn();
    const { rerender } = render(<QspStoryGroup
      questions={triplet}
      prompt={prompt}
      answers={{}}
      onAnswerChange={onAnswerChange}
    />);

    rerender(<QspStoryGroup
      questions={triplet}
      prompt={prompt}
      answers={{ P1_core_values_story_3: "Grace coached the team" }}
      onAnswerChange={onAnswerChange}
    />);

    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  test("writes changes in the third slot using its original stable key", () => {
    const onAnswerChange = jest.fn();
    render(<QspStoryGroup
      questions={triplet}
      prompt={prompt}
      answers={{ P1_core_values_story_3: "Grace coached the team" }}
      onAnswerChange={onAnswerChange}
    />);

    fireEvent.change(screen.getByRole("textbox", { name: "Person and story 3 of 3" }), {
      target: { value: "Grace coached the whole team" },
    });

    expect(onAnswerChange).toHaveBeenCalledWith(
      "P1_core_values_story_3",
      "Grace coached the whole team",
    );
    expect(onAnswerChange).not.toHaveBeenCalledWith("P1_core_values_story_1", expect.anything());
    expect(onAnswerChange).not.toHaveBeenCalledWith("P1_core_values_story_2", expect.anything());
  });

  test("offers neither remove nor reorder controls", () => {
    render(<QspStoryGroup questions={triplet} prompt={prompt} answers={{}} onAnswerChange={jest.fn()} />);

    expect(screen.queryByRole("button", { name: /remove|delete|reorder|move/i })).not.toBeInTheDocument();
  });

  test("disables visible inputs and the add control", () => {
    render(<QspStoryGroup questions={triplet} prompt={prompt} answers={{}} onAnswerChange={jest.fn()} disabled />);

    expect(screen.getByRole("textbox", { name: "Person and story 1 of 3" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /add another person/i })).toBeDisabled();
  });

  test("announces an added story field", () => {
    render(<QspStoryGroup questions={triplet} prompt={prompt} answers={{}} onAnswerChange={jest.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /add another person/i }));

    expect(screen.getByText("Person and story 2 of 3 added.")).toHaveAttribute("aria-live", "polite");
  });

  test("renders the prompt and supporting copy once", () => {
    render(<QspStoryGroup questions={triplet} prompt={prompt} answers={{}} onAnswerChange={jest.fn()} />);

    expect(screen.getAllByText(prompt)).toHaveLength(1);
    expect(screen.getAllByText("Share up to three people and the examples that stood out.")).toHaveLength(1);
  });
});
