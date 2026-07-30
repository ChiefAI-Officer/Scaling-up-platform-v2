import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SectionPager } from "@/components/assessments/section-pager";
import { buildSectionPages, type PagerQuestion, type PagerSection } from "@/lib/assessments/section-pages";
import { mergeCustomSlides } from "@/lib/assessments/custom-slides";

const prompt = "Which employees have demonstrated that they live the core values? Why? Share the stories.";
const sections: PagerSection[] = [{ stableKey: "P1_retrospective", sortOrder: 1, name: "Core values" }];
const questions: PagerQuestion[] = [
  { stableKey: "ordinary", sortOrder: 1, sectionStableKey: "P1_retrospective", type: "TEXT", label: "What is working well?", isRequired: false },
  ...[1, 2, 3].map((index) => ({
    stableKey: `P1_core_values_story_${index}`,
    sortOrder: index + 1,
    sectionStableKey: "P1_retrospective",
    type: "TEXT",
    label: `${prompt} (Story ${index} of 3)`,
    isRequired: false,
  })),
];
const pages = mergeCustomSlides(buildSectionPages(sections, questions), []).pages;

function renderPager(props: Partial<React.ComponentProps<typeof SectionPager>> = {}) {
  const onAnswerChange = jest.fn();
  const onSubmit = jest.fn();
  return {
    onAnswerChange,
    onSubmit,
    ...render(
      <SectionPager
        pages={pages}
        answers={{ ordinary: "answered" }}
        onAnswerChange={onAnswerChange}
        onSubmit={onSubmit}
        submitting={false}
        templateAlias="qsp-v2"
        qspStoryGroupEnabled
        {...props}
      />,
    ),
  };
}

describe("SectionPager QSP story grouping", () => {
  test("groups the canonical triplet and counts it as one logical question", () => {
    const { rerender, onAnswerChange, onSubmit } = renderPager();

    expect(screen.getByTestId("qsp-story-group")).toBeInTheDocument();
    expect(screen.getAllByText(prompt)).toHaveLength(1);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "2");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");

    rerender(
      <SectionPager pages={pages} answers={{ ordinary: "answered", P1_core_values_story_3: "Grace coached the team" }} onAnswerChange={onAnswerChange} onSubmit={onSubmit} submitting={false} templateAlias="qsp-v2" qspStoryGroupEnabled />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(within(screen.getByTestId("qsp-story-group")).getAllByRole("textbox")).toHaveLength(3);
  });

  test("leaves canonical story questions ordinary when the gate is false, omitted, or the alias is wrong", () => {
    const { rerender, onAnswerChange, onSubmit } = renderPager({ qspStoryGroupEnabled: false });

    expect(screen.queryByTestId("qsp-story-group")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Story [123] of 3/)).toHaveLength(3);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "4");

    rerender(
      <SectionPager pages={pages} answers={{ ordinary: "answered" }} onAnswerChange={onAnswerChange} onSubmit={onSubmit} submitting={false} templateAlias="qsp-v2" />,
    );
    expect(screen.queryByTestId("qsp-story-group")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Story [123] of 3/)).toHaveLength(3);

    rerender(
      <SectionPager pages={pages} answers={{ ordinary: "answered" }} onAnswerChange={onAnswerChange} onSubmit={onSubmit} submitting={false} templateAlias="other" qspStoryGroupEnabled />,
    );
    expect(screen.queryByTestId("qsp-story-group")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Story [123] of 3/)).toHaveLength(3);
  });

  test("does not let blank optional story slots block the assessment-wide answer gate", () => {
    const { onSubmit } = renderPager({ answers: { ordinary: "answered" }, requireAtLeastOneAnswer: true });

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("adds the second story field and reports its canonical stable key", () => {
    const { onAnswerChange } = renderPager();

    fireEvent.click(screen.getByRole("button", { name: /add another person/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Person and story 2 of 3" }), { target: { value: "Ada helped the team" } });

    expect(onAnswerChange).toHaveBeenCalledWith("P1_core_values_story_2", "Ada helped the team");
  });

  test("keeps story fields and Add read-only in preview mode", () => {
    renderPager({ previewMode: true });

    expect(screen.getByRole("textbox", { name: "Person and story 1 of 3" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /add another person/i })).toBeDisabled();
  });
});
