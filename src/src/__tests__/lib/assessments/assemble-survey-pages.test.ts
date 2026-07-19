/**
 * Wave ED10 (spec 19am-plan, Task 5) — `assembleSurveyPages` parity + audience.
 *
 * `assembleSurveyPages` is the preview page-assembly helper. It COMPOSES the
 * exact same pure functions org-survey-client.tsx composes inline, in the
 * exact same order, so a Preview-tab render is byte-identical to the real
 * INVITED survey. This suite pins that:
 *
 *   (a) PARITY — for a representative multi-section fixture (empty section +
 *       orphan question + custom slides), the helper's `pages` equal a
 *       faithful INLINE COPY of org-survey-client's pipeline (the
 *       `referenceAssemble` below mirrors org-survey-client.tsx lines
 *       221-253 audience+sort, 262-270 visibility, 480-489 assembly).
 *   (b) AUDIENCE POLICY (C3) — SU-Full + non-CEO drops the CEO-only
 *       S_BACKGROUND section AND its questions at the source; CEO keeps them.
 *   (c) show-if conditional-empty page suppression + custom-slide weaving flow
 *       through unchanged (delegated to the shared lib fns).
 *
 * If org-survey-client's composition ever changes, BOTH that component AND
 * this reference copy + `assembleSurveyPages` must change together — the task
 * deliberately COMPOSES (does not refactor) org-survey-client, so the shared
 * lib fns are the anti-drift substrate and the top-level order is duplicated.
 */
import {
  assembleSurveyPages,
  type SurveyAnswersMap,
} from "@/lib/assessments/assemble-survey-pages";
import {
  buildSectionPages,
  filterConditionallyEmptiedPages,
  OTHER_PAGE_KEY,
  type PagerSection,
  type PagerQuestion,
} from "@/lib/assessments/section-pages";
import { filterVisibleSurveyQuestions } from "@/lib/assessments/form-visibility";
import { mergeCustomSlides, type SafeSlide } from "@/lib/assessments/custom-slides";

// Mirror org-survey-client.tsx's local constants (Wave J-1).
const SU_FULL_ALIAS = "scaling-up-full";
const SU_FULL_BACKGROUND_SECTION = "S_BACKGROUND";

interface AssembleOpts {
  answers: SurveyAnswersMap;
  customSlides?: SafeSlide[];
  templateAlias?: string | null;
  isCEO?: boolean;
}

/**
 * INLINE COPY of org-survey-client.tsx's exact composition. This is the
 * fidelity oracle: assembleSurveyPages must produce identical output.
 */
function referenceAssemble(
  sections: PagerSection[],
  questions: PagerQuestion[],
  opts: AssembleOpts,
) {
  const { answers } = opts;
  const templateAlias = opts.templateAlias ?? null;
  const isCEO = opts.isCEO ?? false;
  const dropBackground = templateAlias === SU_FULL_ALIAS && !isCEO;

  const sortedSections = [...sections]
    .filter((s) => !(dropBackground && s.stableKey === SU_FULL_BACKGROUND_SECTION))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedQuestions = [...questions]
    .filter(
      (q) => !(dropBackground && q.sectionStableKey === SU_FULL_BACKGROUND_SECTION),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const visibleQuestions = filterVisibleSurveyQuestions({
    templateAlias,
    questions: sortedQuestions,
    answers,
  });

  return mergeCustomSlides(
    filterConditionallyEmptiedPages(
      buildSectionPages(sortedSections, visibleQuestions),
      sortedQuestions,
    ),
    opts.customSlides ?? [],
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────────

function sec(over: Partial<PagerSection> & { stableKey: string; sortOrder: number }): PagerSection {
  return { name: over.stableKey, ...over };
}

function q(
  over: Partial<PagerQuestion> & { stableKey: string; sortOrder: number },
): PagerQuestion {
  return { type: "SLIDER_LIKERT", label: over.stableKey, isRequired: false, ...over };
}

/** A representative multi-section instrument: intro (empty) + 2 real + orphan. */
function multiSectionFixture(): { sections: PagerSection[]; questions: PagerQuestion[] } {
  const sections: PagerSection[] = [
    sec({ stableKey: "S_INTRO", sortOrder: 1, name: "Welcome" }), // empty (authored intro)
    sec({ stableKey: "S1", sortOrder: 2, name: "Section One" }),
    sec({ stableKey: "S2", sortOrder: 3, name: "Section Two" }),
  ];
  const questions: PagerQuestion[] = [
    q({ stableKey: "S1_a", sortOrder: 10, sectionStableKey: "S1" }),
    q({ stableKey: "S1_b", sortOrder: 11, sectionStableKey: "S1" }),
    q({ stableKey: "S2_a", sortOrder: 20, sectionStableKey: "S2" }),
    // orphan — no sectionStableKey ⇒ trailing "Other" page
    q({ stableKey: "orphan_1", sortOrder: 30 }),
  ];
  return { sections, questions };
}

function pageShape(pages: ReturnType<typeof assembleSurveyPages>["pages"]): string[] {
  return pages.map((p) =>
    p.kind === "section"
      ? `S:${p.stableKey}[${p.questions.map((qq) => qq.stableKey).join(",")}]`
      : `slide:${p.id}`,
  );
}

// ── (a) Parity ──────────────────────────────────────────────────────────────

describe("assembleSurveyPages — parity with org-survey-client composition", () => {
  it("matches the reference pipeline for a multi-section fixture (answers={})", () => {
    const { sections, questions } = multiSectionFixture();
    const opts: AssembleOpts = { answers: {} };
    expect(assembleSurveyPages(sections, questions, opts)).toEqual(
      referenceAssemble(sections, questions, opts),
    );
  });

  it("renders every section incl. the empty intro, then the trailing Other page", () => {
    const { sections, questions } = multiSectionFixture();
    const { pages } = assembleSurveyPages(sections, questions, { answers: {} });
    expect(pageShape(pages)).toEqual([
      "S:S_INTRO[]",
      "S:S1[S1_a,S1_b]",
      "S:S2[S2_a]",
      `S:${OTHER_PAGE_KEY}[orphan_1]`,
    ]);
  });

  it("does not mutate the input arrays (works on copies)", () => {
    const { sections, questions } = multiSectionFixture();
    const sectionsSnapshot = JSON.stringify(sections);
    const questionsSnapshot = JSON.stringify(questions);
    assembleSurveyPages(sections, questions, { answers: {} });
    expect(JSON.stringify(sections)).toBe(sectionsSnapshot);
    expect(JSON.stringify(questions)).toBe(questionsSnapshot);
  });

  it("orders sections + within-section questions by sortOrder regardless of input order", () => {
    const sections: PagerSection[] = [
      sec({ stableKey: "S2", sortOrder: 3 }),
      sec({ stableKey: "S1", sortOrder: 2 }),
    ];
    const questions: PagerQuestion[] = [
      q({ stableKey: "S1_b", sortOrder: 11, sectionStableKey: "S1" }),
      q({ stableKey: "S1_a", sortOrder: 10, sectionStableKey: "S1" }),
    ];
    const { pages } = assembleSurveyPages(sections, questions, { answers: {} });
    expect(pageShape(pages)).toEqual(["S:S1[S1_a,S1_b]", "S:S2[]"]);
  });
});

// ── (b) Audience policy (C3) ──────────────────────────────────────────────────

describe("assembleSurveyPages — SU-Full CEO-only S_BACKGROUND audience policy", () => {
  function suFullFixture(): { sections: PagerSection[]; questions: PagerQuestion[] } {
    return {
      sections: [
        sec({ stableKey: SU_FULL_BACKGROUND_SECTION, sortOrder: 1, name: "Background" }),
        sec({ stableKey: "S1", sortOrder: 2, name: "Team" }),
      ],
      questions: [
        q({ stableKey: "bg_fte", sortOrder: 5, sectionStableKey: SU_FULL_BACKGROUND_SECTION }),
        q({ stableKey: "s1_a", sortOrder: 10, sectionStableKey: "S1" }),
      ],
    };
  }

  it("drops the CEO-only S_BACKGROUND section + its questions for a non-CEO respondent", () => {
    const { sections, questions } = suFullFixture();
    const { pages } = assembleSurveyPages(sections, questions, {
      answers: {},
      templateAlias: SU_FULL_ALIAS,
      isCEO: false,
    });
    const shape = pageShape(pages);
    expect(shape).toEqual(["S:S1[s1_a]"]);
    expect(JSON.stringify(pages)).not.toContain(SU_FULL_BACKGROUND_SECTION);
    expect(JSON.stringify(pages)).not.toContain("bg_fte");
  });

  it("keeps the S_BACKGROUND section + questions for the CEO", () => {
    const { sections, questions } = suFullFixture();
    const { pages } = assembleSurveyPages(sections, questions, {
      answers: {},
      templateAlias: SU_FULL_ALIAS,
      isCEO: true,
    });
    expect(pageShape(pages)).toEqual(["S:S_BACKGROUND[bg_fte]", "S:S1[s1_a]"]);
  });

  it("keeps S_BACKGROUND on a non-SU-Full template even for a non-CEO", () => {
    const { sections, questions } = suFullFixture();
    const { pages } = assembleSurveyPages(sections, questions, {
      answers: {},
      templateAlias: "some-other-template",
      isCEO: false,
    });
    expect(pageShape(pages)).toEqual(["S:S_BACKGROUND[bg_fte]", "S:S1[s1_a]"]);
  });

  it("defaults to non-CEO NON-drop when isCEO/templateAlias omitted (generic preview)", () => {
    const { sections, questions } = suFullFixture();
    const { pages } = assembleSurveyPages(sections, questions, { answers: {} });
    // No templateAlias ⇒ dropBackground false ⇒ nothing dropped.
    expect(pageShape(pages)).toEqual(["S:S_BACKGROUND[bg_fte]", "S:S1[s1_a]"]);
  });
});

// ── (c) show-if empty-page suppression + custom slides flow through ────────────

describe("assembleSurveyPages — show-if suppression + custom slides", () => {
  it("suppresses a section whose questions are ALL hidden by show-if", () => {
    const sections: PagerSection[] = [
      sec({ stableKey: "S_GATE", sortOrder: 1 }),
      sec({ stableKey: "S_DEP", sortOrder: 2 }),
    ];
    const gate = q({
      stableKey: "gate",
      sortOrder: 10,
      sectionStableKey: "S_GATE",
      type: "MULTI_CHOICE",
      options: [
        { key: "yes", label: "Yes" },
        { key: "no", label: "No" },
      ],
    });
    const dependent = q({
      stableKey: "dep",
      sortOrder: 20,
      sectionStableKey: "S_DEP",
      showIf: { questionKey: "gate", optionKey: "yes" },
    });

    // gate unanswered ⇒ dependent hidden ⇒ S_DEP has ≥1 authored question, all
    // show-if, 0 visible ⇒ page suppressed.
    const hidden = assembleSurveyPages([...sections], [gate, dependent], {
      answers: {},
    });
    expect(pageShape(hidden.pages)).toEqual(["S:S_GATE[gate]"]);

    // gate answered "yes" ⇒ dependent visible ⇒ S_DEP renders.
    const shown = assembleSurveyPages([...sections], [gate, dependent], {
      answers: { gate: ["yes"] },
    });
    expect(pageShape(shown.pages)).toEqual(["S:S_GATE[gate]", "S:S_DEP[dep]"]);
  });

  it("weaves custom slides (start + before-section) into the page array", () => {
    const { sections, questions } = multiSectionFixture();
    const slides: SafeSlide[] = [
      { id: "slidestart01", title: "Intro", safeHtml: "<p>hi</p>", position: { kind: "start" }, sortOrder: 0 },
      {
        id: "slidebefore01",
        title: "Before S2",
        safeHtml: "<p>next</p>",
        position: { kind: "before-section", sectionStableKey: "S2" },
        sortOrder: 1,
      },
    ];
    const { pages } = assembleSurveyPages(sections, questions, {
      answers: {},
      customSlides: slides,
    });
    expect(pageShape(pages)).toEqual([
      "slide:slidestart01",
      "S:S_INTRO[]",
      "S:S1[S1_a,S1_b]",
      "slide:slidebefore01",
      "S:S2[S2_a]",
      `S:${OTHER_PAGE_KEY}[orphan_1]`,
    ]);
  });

  it("returns droppedSlideIds for a slide whose before-section anchor matches nothing", () => {
    const { sections, questions } = multiSectionFixture();
    const slides: SafeSlide[] = [
      {
        id: "slideorphan1",
        title: "Nowhere",
        safeHtml: "<p>x</p>",
        position: { kind: "before-section", sectionStableKey: "S_DOES_NOT_EXIST" },
        sortOrder: 0,
      },
    ];
    const result = assembleSurveyPages(sections, questions, {
      answers: {},
      customSlides: slides,
    });
    expect(result.droppedSlideIds).toEqual(["slideorphan1"]);
  });
});
