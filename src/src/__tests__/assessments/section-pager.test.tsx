import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    // #7 — the "01" section-number badge was removed from the intro kicker.
    expect(container.querySelector(".su-intro-num")).not.toBeInTheDocument();
  });

  it("Screen 2 is DISTINCT: renders the domain accent rail + a 'What this section covers' callout from section.description", () => {
    const secs: PagerSection[] = [
      { stableKey: "S1", sortOrder: 1, name: "People", description: "How you attract and keep the right people.", domain: "People", partLabel: "Decision 1" },
    ];
    const qs: PagerQuestion[] = [
      { stableKey: "q1", sortOrder: 1, sectionStableKey: "S1", type: "SLIDER_LIKERT", label: "Q1", isRequired: true, scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" } },
    ];
    const pages = buildSectionPages(secs, qs);
    const { container } = render(
      <SectionPager pages={pages} answers={{}} onAnswerChange={jest.fn()} onSubmit={jest.fn()} submitting={false} />,
    );
    // Domain accent rail present (the distinct visual hook).
    expect(container.querySelector(".su-intro-rail")).toBeInTheDocument();
    // "What this section covers" callout wraps the section description.
    expect(screen.getByText(/what this section covers/i)).toBeInTheDocument();
    expect(screen.getByText("How you attract and keep the right people.")).toBeInTheDocument();
    // The step label uses the section's partLabel ("Decision 1"), not "Section N of M".
    expect(screen.getByText("Decision 1")).toBeInTheDocument();
  });

  it("section-intro hides the 'What this section covers' callout when there is no description", () => {
    // An empty section (no questions) opens on its intro slide even with no
    // description — the right place to assert the callout degrades gracefully.
    const secs: PagerSection[] = [
      { stableKey: "S0", sortOrder: 1, name: "Strategy", domain: "Strategy" },
      { stableKey: "S1", sortOrder: 2, name: "Section One" },
    ];
    const qs: PagerQuestion[] = [
      { stableKey: "q1", sortOrder: 1, sectionStableKey: "S1", type: "SLIDER_LIKERT", label: "Q1", isRequired: true, scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" } },
    ];
    const pages = buildSectionPages(secs, qs);
    const { container } = render(
      <SectionPager pages={pages} answers={{}} onAnswerChange={jest.fn()} onSubmit={jest.fn()} submitting={false} />,
    );
    // Section title still renders; the covers callout degrades gracefully (absent).
    expect(screen.getByRole("heading", { name: "Strategy" })).toBeInTheDocument();
    expect(screen.queryByText(/what this section covers/i)).not.toBeInTheDocument();
    expect(container.querySelector(".su-intro-covers")).not.toBeInTheDocument();
    // The accent rail is still present (domain accent always shows).
    expect(container.querySelector(".su-intro-rail")).toBeInTheDocument();
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

  it("the shell header's Section N of M tracks the pager's OWN state through next/back (single source)", () => {
    const { container } = setup(); // S0 (empty intro) + S1 (questions)
    // The shell header label lives in the appbar; it shows the pager's section.
    const headerLabel = () => container.querySelector(".su-shell-where")?.textContent ?? "";

    // On the first section's intro: Section 1 of 2.
    expect(headerLabel()).toMatch(/section 1 of 2/i);

    // Begin section → advances to S1 (S0 empty) → Section 2 of 2.
    fireEvent.click(screen.getByRole("button", { name: /begin section/i }));
    expect(headerLabel()).toMatch(/section 2 of 2/i);

    // Back across the empty welcome → back to its intro → Section 1 of 2 again.
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(headerLabel()).toMatch(/section 1 of 2/i);
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

  // ── Wave C Task 3 — per-question validation + min-answer gate + submit latch ──

  it("blocked advance flags the unanswered required question (aria-invalid) AND moves focus to it", async () => {
    setup(); // S0 (empty intro) + S1 (one required slider, unanswered)
    fireEvent.click(screen.getByRole("button", { name: /begin section/i }));
    // Submit with the required slider unanswered → blocked + flagged.
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    const slider = screen.getByRole("slider", { name: "Q1" });
    expect(slider).toHaveAttribute("aria-invalid", "true");
    // Focus moves to the offending control (deferred via requestAnimationFrame).
    await waitFor(() => expect(slider).toHaveFocus());
  });

  it("answering a flagged question clears ONLY its invalid state", () => {
    const onAnswerChange = jest.fn();
    const onSubmit = jest.fn();
    const pages = buildSectionPages(sections, questions);
    const { rerender } = render(
      <SectionPager pages={pages} answers={{}} onAnswerChange={onAnswerChange} onSubmit={onSubmit} submitting={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /begin section/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(screen.getByRole("slider", { name: "Q1" })).toHaveAttribute("aria-invalid", "true");

    // Answer the slider (controlled → feed the value back through rerender).
    fireEvent.click(screen.getByRole("slider", { name: "Q1" }));
    expect(onAnswerChange).toHaveBeenCalledWith("q1", 0);
    const pages2 = buildSectionPages(sections, questions);
    rerender(<SectionPager pages={pages2} answers={{ q1: 0 }} onAnswerChange={onAnswerChange} onSubmit={onSubmit} submitting={false} />);
    expect(screen.getByRole("slider", { name: "Q1" })).not.toHaveAttribute("aria-invalid");
  });

  it("a required TEXT question flagged, then changed to whitespace, STAYS invalid", () => {
    const secs: PagerSection[] = [{ stableKey: "T1", sortOrder: 1, name: "Notes" }];
    const qs: PagerQuestion[] = [
      { stableKey: "t1", sortOrder: 1, sectionStableKey: "T1", type: "TEXT", label: "Tell us why", isRequired: true },
    ];
    const onAnswerChange = jest.fn();
    const pages = buildSectionPages(secs, qs);
    const { rerender } = render(
      <SectionPager pages={pages} answers={{}} onAnswerChange={onAnswerChange} onSubmit={jest.fn()} submitting={false} />,
    );
    // No intro (no description, has questions) → questions are shown immediately.
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    const textarea = screen.getByRole("textbox", { name: "Tell us why" });
    expect(textarea).toHaveAttribute("aria-invalid", "true");

    // Type whitespace only — isAnswered("   ") is false, so the flag must STAY.
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(onAnswerChange).toHaveBeenCalledWith("t1", "   ");
    const pages2 = buildSectionPages(secs, qs);
    rerender(<SectionPager pages={pages2} answers={{ t1: "   " }} onAnswerChange={onAnswerChange} onSubmit={jest.fn()} submitting={false} />);
    expect(screen.getByRole("textbox", { name: "Tell us why" })).toHaveAttribute("aria-invalid", "true");
  });

  it("requireAtLeastOneAnswer: an all-optional set with zero answers blocks Submit with a non-field alert", () => {
    const secs: PagerSection[] = [{ stableKey: "O1", sortOrder: 1, name: "Optional" }];
    const qs: PagerQuestion[] = [
      { stableKey: "o1", sortOrder: 1, sectionStableKey: "O1", type: "TEXT", label: "Optional A", isRequired: false },
      { stableKey: "o2", sortOrder: 2, sectionStableKey: "O1", type: "TEXT", label: "Optional B", isRequired: false },
    ];
    const onSubmit = jest.fn();
    const pages = buildSectionPages(secs, qs);
    const { container } = render(
      <SectionPager pages={pages} answers={{}} onAnswerChange={jest.fn()} onSubmit={onSubmit} submitting={false} requireAtLeastOneAnswer />,
    );
    // No intro, no required questions → Submit is the only gate.
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    // Alert shown with the min-answer copy.
    expect(screen.getByRole("alert")).toHaveTextContent(/at least one question/i);
    // NON-field gate — no control is marked invalid.
    expect(container.querySelector("[aria-invalid='true']")).toBeNull();
    // Submit is NOT called.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("double-clicking Submit (after answering the required question) calls onSubmit at most once", () => {
    const onSubmit = jest.fn();
    const pages = buildSectionPages(sections, questions);
    render(<SectionPager pages={pages} answers={{ q1: 2 }} onAnswerChange={jest.fn()} onSubmit={onSubmit} submitting={false} />);
    fireEvent.click(screen.getByRole("button", { name: /begin section/i }));
    const submit = screen.getByRole("button", { name: /submit/i });
    // Two synchronous clicks — the ref latch must swallow the second.
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
