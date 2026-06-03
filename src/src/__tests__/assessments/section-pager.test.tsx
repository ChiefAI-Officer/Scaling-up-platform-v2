import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SectionPager } from "@/components/assessments/section-pager";
import { buildSectionPages, type PagerSection, type PagerQuestion } from "@/lib/assessments/section-pages";

const sections: PagerSection[] = [
  { stableKey: "S0", sortOrder: 1, name: "Welcome", description: "Intro copy" },
  { stableKey: "S1", sortOrder: 2, name: "Section One" },
];
const questions: PagerQuestion[] = [
  { stableKey: "q1", sortOrder: 1, sectionStableKey: "S1", type: "SLIDER_LIKERT", label: "Q1", isRequired: true, scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" } },
];

function setup(extra: Partial<React.ComponentProps<typeof SectionPager>> = {}) {
  const onAnswerChange = jest.fn();
  const onSubmit = jest.fn();
  const onExit = jest.fn();
  const pages = buildSectionPages(sections, questions);
  const utils = render(
    <SectionPager pages={pages} totalQuestions={questions.length} answers={extra.answers ?? {}}
      onAnswerChange={onAnswerChange} onSubmit={onSubmit} onExit={onExit} submitting={false} {...extra} />,
  );
  return { onAnswerChange, onSubmit, onExit, ...utils };
}

describe("SectionPager", () => {
  it("opens on the first section's intro slide when it has a description", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByText("Intro copy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
    expect(screen.getByText(/section 1 of 2/i)).toBeInTheDocument();
  });

  it("Start advances to that section's questions (S0 has no questions → straight to S1)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.getByText(/section 2 of 2/i)).toBeInTheDocument();
  });

  it("blocks Next when a required question is unanswered, advances/submits when answered", () => {
    const { onSubmit, rerender, onAnswerChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/please answer/i)).toBeInTheDocument();
    const pages = buildSectionPages(sections, questions);
    rerender(<SectionPager pages={pages} totalQuestions={1} answers={{ q1: 0 }} onAnswerChange={onAnswerChange} onSubmit={onSubmit} submitting={false} />);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Back from intro of section 1 calls onExit", () => {
    const { onExit } = setup();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onExit).toHaveBeenCalled();
  });

  it("progress bar reflects answered/total and exposes aria values", () => {
    setup({ answers: { q1: 2 } });
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "1");
  });

  it("renders the SLIDER_LIKERT with an accessible name equal to the question label", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    expect(screen.getByRole("slider", { name: "Q1" })).toBeInTheDocument();
  });
});
