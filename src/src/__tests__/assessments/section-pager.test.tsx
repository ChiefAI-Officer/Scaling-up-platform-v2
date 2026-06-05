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
    <SectionPager pages={pages} answers={extra.answers ?? {}}
      onAnswerChange={onAnswerChange} onSubmit={onSubmit} onExit={onExit} submitting={false} {...extra} />,
  );
  return { onAnswerChange, onSubmit, onExit, ...utils };
}

describe("SectionPager", () => {
  it("opens on the first section's intro slide when it has a description", () => {
    const { container } = setup();
    // Heading uses the new su-intro-title class (inside the .su-intro-slide hero).
    expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
    // Description comes from section.description (ADR-0004 — never hardcoded).
    expect(screen.getByText("Intro copy")).toBeInTheDocument();
    // "Begin section" affordance replaces the old plain "Start" label.
    expect(screen.getByRole("button", { name: /begin section/i })).toBeInTheDocument();
    // Section position shown in the shell header.
    expect(screen.getByText(/section 1 of 2/i)).toBeInTheDocument();
    // Intro slide hero container renders.
    expect(container.querySelector(".su-intro-slide")).toBeInTheDocument();
    // Section number badge (01) renders inside the kicker.
    expect(container.querySelector(".su-intro-num")).toBeInTheDocument();
  });

  it("Begin section advances to that section's questions (S0 has no questions → straight to S1)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /begin section/i }));
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.getByText(/section 2 of 2/i)).toBeInTheDocument();
  });

  it("blocks Next when a required question is unanswered, advances/submits when answered", () => {
    const { onSubmit, rerender, onAnswerChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /begin section/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/please answer/i)).toBeInTheDocument();
    const pages = buildSectionPages(sections, questions);
    rerender(<SectionPager pages={pages} answers={{ q1: 0 }} onAnswerChange={onAnswerChange} onSubmit={onSubmit} submitting={false} />);
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

  it("renders the SLIDER_LIKERT as a slider with an accessible name equal to the question label", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /begin section/i }));
    expect(screen.getByRole("slider", { name: "Q1" })).toBeInTheDocument();
  });

  it("selecting the MINIMUM value (0) reports it and satisfies the required gate", () => {
    const { onSubmit, onAnswerChange, rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: /begin section/i }));
    // Click the slider at its default minimum (0) — the previously-unrecordable
    // case where the thumb sits at min and a plain click fired nothing.
    fireEvent.click(screen.getByRole("slider", { name: "Q1" }));
    // The change is reported with the literal 0 (not undefined / no-op).
    expect(onAnswerChange).toHaveBeenCalledWith("q1", 0);
    // SectionPager is controlled: the parent now feeds the recorded answer back.
    const pages = buildSectionPages(sections, questions);
    rerender(<SectionPager pages={pages} answers={{ q1: 0 }} onAnswerChange={onAnswerChange} onSubmit={onSubmit} submitting={false} />);
    // 0 satisfies the required gate → Submit fires.
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Back across an empty welcome section lands on that section's intro", () => {
    setup(); // S0 (empty, has description) + S1 (questions)
    fireEvent.click(screen.getByRole("button", { name: /begin section/i })); // S0 intro → S1 questions
    expect(screen.getByText("Q1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));  // back across empty S0 → its intro
    expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByText("Intro copy")).toBeInTheDocument();
    expect(screen.getByText(/section 1 of 2/i)).toBeInTheDocument();
  });

  it("renders the branded shell header (logo) above the pager", () => {
    setup({ assessmentName: "Rockefeller Habits", companyName: "Northwind Logistics" });
    const logo = screen.getByRole("img", { name: /scaling up/i });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "/brand/su-logo-white.svg");
    expect(screen.getByText(/rockefeller habits/i)).toBeInTheDocument();
    expect(screen.getByText(/northwind logistics/i)).toBeInTheDocument();
  });

  it("the shell header's Section N of M + active-segment count track the pager's OWN state through next/back (single source)", () => {
    const { container } = setup(); // S0 (empty intro) + S1 (questions)
    // The shell header label lives in the appbar; it shows the pager's section.
    const headerLabel = () => container.querySelector(".su-shell-where")?.textContent ?? "";
    const activeSegs = () => container.querySelectorAll(".su-shell-seg-item.is-active").length;

    // On the first section's intro: Section 1 of 2, 1 active segment.
    expect(headerLabel()).toMatch(/section 1 of 2/i);
    expect(activeSegs()).toBe(1);
    expect(container.querySelectorAll(".su-shell-seg-item")).toHaveLength(2);

    // Begin section → advances to S1 (S0 empty) → Section 2 of 2, 2 active segments.
    fireEvent.click(screen.getByRole("button", { name: /begin section/i }));
    expect(headerLabel()).toMatch(/section 2 of 2/i);
    expect(activeSegs()).toBe(2);

    // Back across the empty welcome → back to its intro → Section 1 of 2 again.
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(headerLabel()).toMatch(/section 1 of 2/i);
    expect(activeSegs()).toBe(1);
  });

  it("a section with BOTH a description and questions: intro → Begin section → questions → Back → intro", () => {
    const secs: PagerSection[] = [{ stableKey: "S1", sortOrder: 1, name: "Strategy", description: "Strategy intro" }];
    const qs: PagerQuestion[] = [{ stableKey: "q1", sortOrder: 1, sectionStableKey: "S1", type: "SLIDER_LIKERT", label: "Q1", isRequired: true, scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" } }];
    const pages = buildSectionPages(secs, qs);
    render(<SectionPager pages={pages} answers={{}} onAnswerChange={jest.fn()} onSubmit={jest.fn()} submitting={false} />);
    // intro shown — description comes from section.description (ADR-0004)
    expect(screen.getByText("Strategy intro")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /begin section/i }));
    expect(screen.getByText("Q1")).toBeInTheDocument(); // questions
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText("Strategy intro")).toBeInTheDocument(); // back to intro (ADR-0004 description persists)
  });
});
