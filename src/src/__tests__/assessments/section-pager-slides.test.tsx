/**
 * Wave M (#19) — custom-slide interstitials in SectionPager.
 *
 * Slides are woven into the page array by mergeCustomSlides and render as
 * branded interstitials with NO shell header / NO "Section N of M" counter
 * (mirroring the uncounted phase-tile pattern). They carry no questions, so
 * every section-only path (counter, answered/total, required gate, phase tile)
 * must be a no-op on a slide.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SectionPager } from "@/components/assessments/section-pager";
import {
  buildSectionPages,
  type PagerSection,
  type PagerQuestion,
} from "@/lib/assessments/section-pages";
import { mergeCustomSlides, type SafeSlide } from "@/lib/assessments/custom-slides";

const sections: PagerSection[] = [
  { stableKey: "S1", sortOrder: 1, name: "People", description: "People intro" },
  { stableKey: "S2", sortOrder: 2, name: "Cash", description: "Cash intro" },
];
const questions: PagerQuestion[] = [
  { stableKey: "q1", sortOrder: 1, sectionStableKey: "S1", type: "SLIDER_LIKERT", label: "Q1", isRequired: false, scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" } },
  { stableKey: "q2", sortOrder: 2, sectionStableKey: "S2", type: "SLIDER_LIKERT", label: "Q2", isRequired: false, scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" } },
];

function slide(over: Partial<SafeSlide> = {}): SafeSlide {
  return {
    id: over.id ?? "slide_aaaaaaaa1",
    title: over.title,
    safeHtml: over.safeHtml ?? "<p>Promo body</p>",
    position: over.position ?? { kind: "start" },
    sortOrder: over.sortOrder ?? 0,
  };
}

function renderWithSlides(
  slides: SafeSlide[],
  extra: Partial<React.ComponentProps<typeof SectionPager>> = {},
  secs: PagerSection[] = sections,
  qs: PagerQuestion[] = questions,
) {
  const onSubmit = jest.fn();
  const onExit = jest.fn();
  const { pages } = mergeCustomSlides(buildSectionPages(secs, qs), slides);
  const utils = render(
    <SectionPager
      pages={pages}
      answers={extra.answers ?? {}}
      onAnswerChange={jest.fn()}
      onSubmit={onSubmit}
      onExit={onExit}
      submitting={false}
      assessmentName="Rockefeller Habits"
      {...extra}
    />,
  );
  return { onSubmit, onExit, ...utils };
}

describe("SectionPager — custom slides (Wave M)", () => {
  it("renders a slide's title + sanitized HTML body on the slide page", () => {
    renderWithSlides([
      slide({ title: "Welcome to our workshop", safeHtml: "<p>Hello <strong>team</strong></p>", position: { kind: "start" } }),
    ]);
    // Slide leads (kind:"start"): title + body show.
    expect(screen.getByRole("heading", { name: "Welcome to our workshop" })).toBeInTheDocument();
    expect(screen.getByText("team")).toBeInTheDocument();
  });

  it("a slide page shows NO 'Section N of M' counter and NO shell header (uncounted interstitial)", () => {
    const { container } = renderWithSlides([
      slide({ title: "Promo", position: { kind: "start" } }),
    ]);
    // On the start slide: no shell header banner, no section counter, no progressbar.
    expect(container.querySelector(".su-shell-header")).not.toBeInTheDocument();
    expect(screen.queryByText(/section \d+ of \d+/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("the section counter counts SECTION pages only with a slide interleaved", () => {
    // start slide → S1 → before-S2 slide → S2. The counter must read 2 sections.
    renderWithSlides([
      slide({ id: "slide_start0001", title: "Intro", position: { kind: "start" }, sortOrder: 0 }),
      slide({ id: "slide_mid000001", title: "Midway", position: { kind: "before-section", sectionStableKey: "S2" }, sortOrder: 1 }),
    ]);
    // Page 0 = start slide (no counter).
    expect(screen.queryByText(/section \d+ of/i)).not.toBeInTheDocument();
    // Advance to S1 — denominator is 2 (not 4).
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/section 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
    // Advance off S1 → the before-S2 slide (uncounted, no counter visible).
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByRole("heading", { name: "Midway" })).toBeInTheDocument();
    expect(screen.queryByText(/section \d+ of/i)).not.toBeInTheDocument();
    // Advance off the slide → S2 — still "Section 2 of 2".
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/section 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cash" })).toBeInTheDocument();
  });

  it("a trailing END slide's forward button reads Submit and calls onSubmit", () => {
    const { onSubmit } = renderWithSlides(
      [slide({ title: "Closing promo", position: { kind: "end" }, sortOrder: 0 })],
      { answers: { q1: 1 } }, // one answered question so requireAtLeastOneAnswer is satisfied
      sections,
      questions,
    );
    // Walk: S1 → S2 → end slide.
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // S1 → S2
    expect(screen.getByRole("heading", { name: "Cash" })).toBeInTheDocument();
    // On S2 the button is NOT Submit (the end slide is still after it).
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // S2 → end slide
    expect(screen.getByRole("heading", { name: "Closing promo" })).toBeInTheDocument();
    // The trailing slide's forward button is Submit.
    const submit = screen.getByRole("button", { name: /submit/i });
    expect(submit).toBeInTheDocument();
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("requireAtLeastOneAnswer: an END slide is the last page but the answer gate still applies on Submit", () => {
    // Zero answers + requireAtLeastOneAnswer → the trailing slide's Submit is blocked.
    const { onSubmit } = renderWithSlides(
      [slide({ title: "Closing", position: { kind: "end" }, sortOrder: 0 })],
      { answers: {}, requireAtLeastOneAnswer: true },
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // S1 → S2
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // S2 → end slide
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/at least one question/i);
  });

  it("Back from a START slide at page 0 calls onExit", () => {
    const { onExit } = renderWithSlides([
      slide({ title: "Intro", position: { kind: "start" } }),
    ]);
    // The start slide is page 0.
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("the required-answer gate is a NO-OP on a slide page (a slide carries no questions)", () => {
    // S1 has a REQUIRED question; insert a slide before S2. On the slide page the
    // gate must not block forward navigation even though it's a "Next".
    const reqQuestions: PagerQuestion[] = [
      { stableKey: "q1", sortOrder: 1, sectionStableKey: "S1", type: "SLIDER_LIKERT", label: "Q1", isRequired: false, scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" } },
      { stableKey: "q2", sortOrder: 2, sectionStableKey: "S2", type: "TEXT", label: "Q2", isRequired: true },
    ];
    renderWithSlides(
      [slide({ id: "slide_gate00001", title: "Interstitial", position: { kind: "before-section", sectionStableKey: "S2" }, sortOrder: 0 })],
      {},
      sections,
      reqQuestions,
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // S1 → slide
    expect(screen.getByRole("heading", { name: "Interstitial" })).toBeInTheDocument();
    // Forward off the slide is NOT gated (no questions) → lands on S2.
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByRole("heading", { name: "Cash" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Back across a slide returns to the slide, not skipping it", () => {
    renderWithSlides([
      slide({ id: "slide_back00001", title: "Midway", position: { kind: "before-section", sectionStableKey: "S2" }, sortOrder: 0 }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // S1 → slide
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // slide → S2
    expect(screen.getByRole("heading", { name: "Cash" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back/i })); // S2 → slide
    expect(screen.getByRole("heading", { name: "Midway" })).toBeInTheDocument();
  });

  describe("SU-Full phase tile adjacency (R3-Low-2)", () => {
    const suSections: PagerSection[] = [
      { stableKey: "S_BACKGROUND", sortOrder: 0, name: "Background" },
      { stableKey: "S1", sortOrder: 1, name: "People" },
    ];
    const suQuestions: PagerQuestion[] = [
      { stableKey: "Q_FTE_CONTRACT", sortOrder: 1, sectionStableKey: "S_BACKGROUND", type: "NUMBER", label: "FTE", isRequired: false },
      { stableKey: "q1", sortOrder: 2, sectionStableKey: "S1", type: "SLIDER_LIKERT", label: "Q1", isRequired: false, scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" } },
    ];

    it("a slide before the phase-tile section does NOT break the SU-Full phase tile", () => {
      // start slide → S_BACKGROUND → (phase tile) → S1. Advancing off S_BACKGROUND
      // must still fire the phase tile for an SU-Full CEO; the leading slide is inert.
      renderWithSlides(
        [slide({ id: "slide_sufull001", title: "Welcome", position: { kind: "start" }, sortOrder: 0 })],
        {
          templateAlias: "scaling-up-full",
          isCEO: true,
          answers: { Q_FTE_CONTRACT: 5 },
        },
        suSections,
        suQuestions,
      );
      // Page 0 = start slide.
      expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /next/i })); // slide → S_BACKGROUND
      expect(screen.getByRole("heading", { name: "Background" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /next/i })); // S_BACKGROUND → phase tile
      expect(screen.getByRole("heading", { name: /phase 1 - Pioneering phase/i })).toBeInTheDocument();
      // Continue advances to the next real section.
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
      expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
    });

    it("advancing off a SLIDE (not a section) never fires the phase tile", () => {
      // A before-S1 slide sits between S_BACKGROUND's tile target and S1. Leaving
      // the slide must NOT re-trigger a phase tile (the tile only fires leaving a section).
      renderWithSlides(
        [slide({ id: "slide_betw00001", title: "Between", position: { kind: "before-section", sectionStableKey: "S1" }, sortOrder: 0 })],
        {
          templateAlias: "scaling-up-full",
          isCEO: true,
          answers: { Q_FTE_CONTRACT: 5 },
        },
        suSections,
        suQuestions,
      );
      fireEvent.click(screen.getByRole("button", { name: /next/i })); // S_BACKGROUND → phase tile
      expect(screen.getByRole("heading", { name: /phase 1 - Pioneering phase/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /continue/i })); // tile → before-S1 slide
      expect(screen.getByRole("heading", { name: "Between" })).toBeInTheDocument();
      // Forward off the slide: no second phase tile, lands on S1.
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
      expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /phase 1/i })).not.toBeInTheDocument();
    });
  });
});
