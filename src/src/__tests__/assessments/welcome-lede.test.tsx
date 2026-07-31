/**
 * Welcome screen ("Screen 1") — per-template lede copy is wired to the DOM.
 *
 * The resolver itself is covered by __tests__/lib/assessments/welcome-copy.test.ts.
 * This file covers only what a pure unit test cannot: that the alias actually
 * reaches the render site, and that multi-paragraph copy produces multiple <p>.
 *
 * Fixture discipline (matters): three alias-shaped values are in scope at the
 * render site — the `campaignAlias` route prop, `campaign.alias` (a per-campaign
 * slug), and `campaign.templateAlias` (the AssessmentTemplate alias). Only the
 * last is a valid key. They are kept deliberately DISTINCT here, and the final
 * test pins that ordering, because an implementation keyed off the wrong one
 * would pass a sloppier fixture while being a total no-op in production, where
 * campaign aliases are per-campaign slugs like `spectrum_qsp_v2_260724133919`.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { OrgSurveyClient } from "@/components/assessments/org-survey-client";
import { DEFAULT_WELCOME_LEDE } from "@/lib/assessments/welcome-copy";

/** A per-campaign slug — deliberately NOT any template alias. */
const CAMPAIGN_ALIAS = "spectrum-welcome-lede-test";

/* The byte-exact pin lives in welcome-copy.test.ts; transcribing it a second
   time here would just be a second thing to keep in sync. */
const APPROVED_DEFAULT_LEDE = DEFAULT_WELCOME_LEDE[0];

function surveyData(campaign: { alias: string; templateAlias: string | null }) {
  return {
    isCEO: false,
    respondentKey: "resp-welcome-lede",
    campaign: { name: "Spectrum 2026", ...campaign },
    version: { language: "en" },
    sections: [{ stableKey: "S1", sortOrder: 1, name: "People" }],
    questions: [
      {
        stableKey: "q1",
        sortOrder: 1,
        sectionStableKey: "S1",
        type: "SLIDER_LIKERT",
        label: "Q1",
        isRequired: true,
        scale: { min: 0, max: 10, step: 1, anchorMin: "lo", anchorMax: "hi" },
      },
    ],
  };
}

function mockMe(campaign: { alias: string; templateAlias: string | null }) {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/me")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: surveyData(campaign) }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    } as Response);
  }) as unknown as typeof fetch;
}

async function renderWelcome(templateAlias: string | null) {
  mockMe({ alias: CAMPAIGN_ALIAS, templateAlias });
  const view = render(<OrgSurveyClient campaignAlias={CAMPAIGN_ALIAS} />);
  // Wait for /me to resolve into the intro phase.
  await screen.findByRole("button", { name: /start the assessment/i });
  return view;
}

function ledeParagraphs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".su-welcome-lede")).map((el) =>
    (el.textContent ?? "").trim(),
  );
}

describe("Welcome screen lede — DOM wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders SU-Full's two-paragraph copy as two separate elements", async () => {
    const { container } = await renderWelcome("scaling-up-full");
    const paragraphs = ledeParagraphs(container);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContain("Rockefeller Habits 2.0 methodology");
    expect(paragraphs[1]).toContain("throughout your report");
    // The re-anchored wording must not regress to the dictated original.
    expect(paragraphs.join(" ")).not.toContain("this report");
  });

  it("renders a single-paragraph template as one element", async () => {
    const { container } = await renderWelcome("leadership-vision-alignment");
    const paragraphs = ledeParagraphs(container);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toContain("Leadership Vision Alignment Assessment");
  });

  it("renders the truthful default for an unkeyed template", async () => {
    const { container } = await renderWelcome("qsp-v1");

    expect(ledeParagraphs(container)).toEqual([APPROVED_DEFAULT_LEDE]);
    expect(ledeParagraphs(container).join(" ")).not.toMatch(
      /\b(?:confidential|anonymous|private)\b/i,
    );
  });

  it("keys off templateAlias — NOT the campaign alias or the route param", async () => {
    // The campaign slug is set to a real map key while templateAlias is null.
    // An implementation that resolved from campaign.alias (or the route prop)
    // would render SU-Full's copy here and be a no-op in production.
    mockMe({ alias: "scaling-up-full", templateAlias: null });
    const { container } = render(
      <OrgSurveyClient campaignAlias="scaling-up-full" />,
    );
    await screen.findByRole("button", { name: /start the assessment/i });

    expect(ledeParagraphs(container)).toEqual([APPROVED_DEFAULT_LEDE]);
  });
});

describe("Welcome screen — the resume affordance survives the copy change", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const RESUME = /come back later — your link stays active/i;

  function fineText(container: HTMLElement): string {
    return Array.from(container.querySelectorAll(".su-welcome-fine"))
      .map((el) => (el.textContent ?? "").trim())
      .join(" ");
  }

  // Jeff's replacement copy drops the sentence promising resume, which was the
  // ONLY place the invited card said so — and the promise is TRUE (partial
  // answers persist via useAnswerDraft). He asked to ADD intro copy, not to
  // remove that. So bespoke templates carry it in the fine print instead.
  it.each(["scaling-up-full", "leadership-vision-alignment", "RockHabits", "qsp-v2"])(
    "%s moves it to the fine print, not the lede",
    async (alias) => {
      const { container } = await renderWelcome(alias);

      expect(fineText(container)).toMatch(RESUME);
      expect(ledeParagraphs(container).join(" ")).not.toMatch(RESUME);
    },
  );

  // A template that kept the default lede already states it there. Adding it to
  // the fine print too would say the same thing twice on one small card.
  it("is NOT duplicated on a template that kept the default lede", async () => {
    const { container } = await renderWelcome("qsp-v1");

    expect(ledeParagraphs(container).join(" ")).toMatch(RESUME);
    expect(fineText(container)).not.toMatch(RESUME);
  });

  it("appears exactly once on every template", async () => {
    for (const alias of ["scaling-up-full", "qsp-v2", "qsp-v1", null]) {
      jest.clearAllMocks();
      const { container, unmount } = await renderWelcome(alias);
      const occurrences = (container.textContent ?? "").match(
        /come back later — your link stays active/gi,
      );

      expect(occurrences).toHaveLength(1);
      unmount();
    }
  });

  it("keeps only the resume note in fine print and moves sharing into the expectation row", async () => {
    const { container } = await renderWelcome("scaling-up-full");

    expect(fineText(container)).toBe(
      "Answer in one sitting or come back later — your link stays active.",
    );
    const expectations = screen.getByTestId("welcome-expectations");
    expect(
      expectations,
    ).toHaveTextContent("How your answers are shared");
    expect(expectations).toHaveTextContent(
      "Your coach or facilitator and authorized Scaling Up staff can review your named individual answers.",
    );
  });
});
