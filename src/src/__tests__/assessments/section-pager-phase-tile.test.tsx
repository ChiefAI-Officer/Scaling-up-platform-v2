/**
 * Wave J-1 — SU-Full growth-phase mid-survey interstitial in SectionPager.
 *
 * The CEO answers the S_BACKGROUND FTE question (Q_FTE_CONTRACT). Right after
 * advancing past S_BACKGROUND, a phase-tile interstitial appears for
 * scaling-up-full + isCEO + a valid FTE answer. Its Continue advances to the
 * next section. The interstitial is NOT a counted section (progress/section
 * counts ignore it). Every other template/flow is unchanged.
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

/** PagerPage[] for the SectionPager (no slides ⇒ section pages wrapped). */
function makePages(secs: PagerSection[], qs: PagerQuestion[], slides: SafeSlide[] = []) {
  return mergeCustomSlides(buildSectionPages(secs, qs), slides).pages;
}

const sections: PagerSection[] = [
  { stableKey: "S_BACKGROUND", sortOrder: 0, name: "Background" },
  { stableKey: "S1", sortOrder: 1, name: "People" },
];
const questions: PagerQuestion[] = [
  {
    stableKey: "Q_FTE_CONTRACT",
    sortOrder: 1,
    sectionStableKey: "S_BACKGROUND",
    type: "NUMBER",
    label: "Number of employees (FTE)",
    isRequired: true,
  },
  {
    stableKey: "q1",
    sortOrder: 2,
    sectionStableKey: "S1",
    type: "SLIDER_LIKERT",
    label: "Q1",
    isRequired: true,
    scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" },
  },
];

function renderPager(
  extra: Partial<React.ComponentProps<typeof SectionPager>> = {},
) {
  const pages = makePages(sections, questions);
  return render(
    <SectionPager
      pages={pages}
      answers={extra.answers ?? {}}
      onAnswerChange={jest.fn()}
      onSubmit={jest.fn()}
      submitting={false}
      {...extra}
    />,
  );
}

describe("SectionPager — SU-Full growth-phase interstitial", () => {
  it("shows the phase tile after S_BACKGROUND for scaling-up-full + CEO + valid FTE, then Continue advances to the next section", () => {
    renderPager({
      templateAlias: "scaling-up-full",
      isCEO: true,
      answers: { Q_FTE_CONTRACT: 5 },
    });
    // On S_BACKGROUND first.
    expect(screen.getByRole("heading", { name: "Background" })).toBeInTheDocument();
    // Advance past S_BACKGROUND.
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    // FTE 5 → Phase 1 (Pioneering). The interstitial heading appears.
    expect(
      screen.getByRole("heading", { name: /phase 1 - Pioneering phase/i }),
    ).toBeInTheDocument();
    // The next section is NOT yet rendered.
    expect(screen.queryByRole("heading", { name: "People" })).not.toBeInTheDocument();
    // Continue advances to the next section.
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
  });

  it("computes the phase band from the FTE answer (50 → Phase 4 Delegation)", () => {
    renderPager({
      templateAlias: "scaling-up-full",
      isCEO: true,
      answers: { Q_FTE_CONTRACT: 50 },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(
      screen.getByRole("heading", { name: /phase 4 - Delegation phase/i }),
    ).toBeInTheDocument();
  });

  it("does NOT show the tile for a non-CEO respondent", () => {
    renderPager({
      templateAlias: "scaling-up-full",
      isCEO: false,
      answers: { Q_FTE_CONTRACT: 5 },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByRole("heading", { name: /reached phase/i })).not.toBeInTheDocument();
    // Advances straight to the next section.
    expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
  });

  it("does NOT show the tile for a non-SU-Full alias", () => {
    renderPager({
      templateAlias: "leadership-vision-alignment",
      isCEO: true,
      answers: { Q_FTE_CONTRACT: 5 },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByRole("heading", { name: /reached phase/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
  });

  it("does NOT show the tile when FTE is 0 (computeGrowthPhase → null); advances normally", () => {
    // 0 is a valid answer to the NUMBER question (isAnswered true) but maps to
    // no phase, so the interstitial is skipped.
    renderPager({
      templateAlias: "scaling-up-full",
      isCEO: true,
      answers: { Q_FTE_CONTRACT: 0 },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByRole("heading", { name: /reached phase/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
  });

  it("does not loop the tile: Back from the next section returns to S_BACKGROUND (not the tile)", () => {
    renderPager({
      templateAlias: "scaling-up-full",
      isCEO: true,
      answers: { Q_FTE_CONTRACT: 5 },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
    // Back from People returns to the S_BACKGROUND section, not the tile.
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByRole("heading", { name: "Background" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /reached phase/i })).not.toBeInTheDocument();
  });

  it("the interstitial is NOT counted as a section (Section N of M stays at the real count)", () => {
    renderPager({
      templateAlias: "scaling-up-full",
      isCEO: true,
      answers: { Q_FTE_CONTRACT: 5 },
    });
    // 2 real sections.
    expect(screen.getByText(/section 1 of 2/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    // On the tile — no "Section N of M" shell counting it (the tile has no shell header).
    expect(screen.queryByText(/section 3 of/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText(/section 2 of 2/i)).toBeInTheDocument();
  });
});
