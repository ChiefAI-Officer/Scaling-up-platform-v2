/**
 * Wave W (spec 19w) — generic authored showIf evaluation + conditionally-
 * emptied page suppression + the server-prune helper.
 *
 * Contracts under test:
 *  - filterVisibleSurveyQuestions hides any question whose
 *    `showIf: { questionKey, optionKey }` gate option is NOT currently
 *    selected — for ALL templates (generic pass).
 *  - Composition is a strict pipeline (C2): LVA alias branch FIRST, generic
 *    showIf SECOND (intersection — generic can never resurrect an LVA-hidden
 *    question).
 *  - Fail-open (LVA precedent): missing gate / non-MULTI_CHOICE gate /
 *    malformed showIf → the question SHOWS (publish makes these unreachable
 *    on published versions; fail-open protects legacy data).
 *  - Single-level evaluation: a gate's own visibility is never consulted
 *    (chains are publish-rejected; runtime never recurses).
 *  - resolveVisibleSurveyQuestionKeys (server prune, C3) evaluates GENERIC
 *    rules ONLY — never the LVA alias branch (D3: LVA storage behavior
 *    byte-identical).
 *  - filterConditionallyEmptiedPages (D7): a section page with ≥1 authored
 *    question but 0 visible is suppressed; authored-empty intro pages render.
 *  - Client/server equivalence property (C3) on generic templates.
 */
import {
  filterVisibleSurveyQuestions,
  visibleSurveyQuestionKeys,
  resolveVisibleSurveyQuestionKeys,
  pruneHiddenAnswers,
} from "@/lib/assessments/form-visibility";
import {
  buildSectionPages,
  filterConditionallyEmptiedPages,
  type PagerQuestion,
  type PagerSection,
} from "@/lib/assessments/section-pages";

const LVA_ALIAS = "leadership-vision-alignment";

function q(
  stableKey: string,
  overrides: Partial<PagerQuestion> = {},
): PagerQuestion {
  return {
    stableKey,
    sortOrder: 1,
    sectionStableKey: "S1",
    type: "TEXT",
    label: stableKey,
    isRequired: false,
    ...overrides,
  };
}

const gateQ = (stableKey = "Q_GATE", overrides: Partial<PagerQuestion> = {}) =>
  q(stableKey, {
    type: "MULTI_CHOICE",
    options: [
      { key: "sales", label: "Sales" },
      { key: "cash", label: "Cash" },
    ],
    ...overrides,
  });

const depQ = (stableKey = "Q_DEP", optionKey = "sales") =>
  q(stableKey, { showIf: { questionKey: "Q_GATE", optionKey } });

function keys(questions: PagerQuestion[]): string[] {
  return questions.map((question) => question.stableKey);
}

// ── Generic showIf evaluation ────────────────────────────────────────────

describe("generic showIf evaluation (any template)", () => {
  const questions = [gateQ(), depQ(), q("Q_PLAIN")];

  it("hides the dependent when the gate option is not selected", () => {
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: "some-new-template",
          questions,
          answers: { Q_GATE: ["cash"] },
        }),
      ),
    ).toEqual(["Q_GATE", "Q_PLAIN"]);
  });

  it("hides the dependent when the gate is entirely unanswered", () => {
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: "some-new-template",
          questions,
          answers: {},
        }),
      ),
    ).toEqual(["Q_GATE", "Q_PLAIN"]);
  });

  it("shows the dependent when the gate option IS selected", () => {
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: "some-new-template",
          questions,
          answers: { Q_GATE: ["cash", "sales"] },
        }),
      ),
    ).toEqual(["Q_GATE", "Q_DEP", "Q_PLAIN"]);
  });

  it("treats a non-array gate answer as no selection (hidden)", () => {
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: "some-new-template",
          questions,
          answers: { Q_GATE: "sales" },
        }),
      ),
    ).toEqual(["Q_GATE", "Q_PLAIN"]);
  });

  it("runs for null/undefined template aliases too (public quick-quiz path)", () => {
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: null,
          questions,
          answers: { Q_GATE: ["sales"] },
        }),
      ),
    ).toEqual(["Q_GATE", "Q_DEP", "Q_PLAIN"]);
  });

  it("visibleSurveyQuestionKeys mirrors the filter", () => {
    const visible = visibleSurveyQuestionKeys({
      templateAlias: "t",
      questions,
      answers: { Q_GATE: ["sales"] },
    });
    expect(visible.has("Q_DEP")).toBe(true);
    const hidden = visibleSurveyQuestionKeys({
      templateAlias: "t",
      questions,
      answers: {},
    });
    expect(hidden.has("Q_DEP")).toBe(false);
  });
});

// ── Fail-open matrix ─────────────────────────────────────────────────────

describe("showIf fail-open (unpublishable states never hide)", () => {
  it("shows when the gate question is missing", () => {
    const qs = [depQ(), q("Q_PLAIN")];
    expect(
      keys(
        filterVisibleSurveyQuestions({ templateAlias: "t", questions: qs, answers: {} }),
      ),
    ).toEqual(["Q_DEP", "Q_PLAIN"]);
  });

  it("shows when the gate is not MULTI_CHOICE", () => {
    const qs = [q("Q_GATE", { type: "TEXT" }), depQ()];
    expect(
      keys(
        filterVisibleSurveyQuestions({ templateAlias: "t", questions: qs, answers: {} }),
      ),
    ).toEqual(["Q_GATE", "Q_DEP"]);
  });

  it.each([
    ["empty questionKey", { questionKey: "", optionKey: "sales" }],
    ["empty optionKey", { questionKey: "Q_GATE", optionKey: "" }],
  ])("shows on a malformed showIf (%s)", (_name, showIf) => {
    const qs = [gateQ(), q("Q_DEP", { showIf: showIf as PagerQuestion["showIf"] })];
    expect(
      keys(
        filterVisibleSurveyQuestions({ templateAlias: "t", questions: qs, answers: {} }),
      ),
    ).toEqual(["Q_GATE", "Q_DEP"]);
  });
});

// ── Single-level (no recursion) ──────────────────────────────────────────

describe("showIf is single-level (chains are publish-rejected; runtime never recurses)", () => {
  it("evaluates a dependent against its gate's raw selection even when the gate is itself hidden", () => {
    // Q_ROOT unselected → Q_GATE hidden. Q_GATE's own selection still gates
    // Q_DEP directly — documented single-pass semantics.
    const qs = [
      gateQ("Q_ROOT"),
      gateQ("Q_GATE", { showIf: { questionKey: "Q_ROOT", optionKey: "sales" } }),
      depQ(),
    ];
    const visible = keys(
      filterVisibleSurveyQuestions({
        templateAlias: "t",
        questions: qs,
        answers: { Q_GATE: ["sales"] },
      }),
    );
    expect(visible).toContain("Q_DEP"); // gate's selection satisfied
    expect(visible).not.toContain("Q_GATE"); // gate itself hidden by ITS rule
  });
});

// ── LVA composition (C2 / D3) ────────────────────────────────────────────

describe("LVA composition — strict pipeline, intersection semantics", () => {
  const lvaQuestions: PagerQuestion[] = [
    q("S4_biggest_obstacles", {
      type: "MULTI_CHOICE",
      options: [
        { key: "sales", label: "Sales" },
        { key: "cash", label: "Cash" },
      ],
    }),
    q("S5_why_sales"),
    q("S5_why_cash"),
  ];

  it("LVA behavior is byte-identical when no showIf is present (regression)", () => {
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: LVA_ALIAS,
          questions: lvaQuestions,
          answers: { S4_biggest_obstacles: ["sales"] },
        }),
      ),
    ).toEqual(["S4_biggest_obstacles", "S5_why_sales"]);
  });

  it("generic showIf can never resurrect an LVA-hidden question (intersection)", () => {
    // S5_why_cash is LVA-hidden (cash not ticked) even though it carries a
    // satisfied generic showIf. The pipeline must keep it hidden.
    const qs: PagerQuestion[] = [
      lvaQuestions[0],
      q("S5_why_sales"),
      q("S5_why_cash", {
        showIf: { questionKey: "S4_biggest_obstacles", optionKey: "sales" },
      }),
    ];
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: LVA_ALIAS,
          questions: qs,
          answers: { S4_biggest_obstacles: ["sales"] },
        }),
      ),
    ).toEqual(["S4_biggest_obstacles", "S5_why_sales"]);
  });

  it("generic showIf still applies on LVA questions the alias branch leaves visible", () => {
    const qs: PagerQuestion[] = [
      ...lvaQuestions,
      q("S6_extra", {
        showIf: { questionKey: "S4_biggest_obstacles", optionKey: "cash" },
      }),
    ];
    expect(
      keys(
        filterVisibleSurveyQuestions({
          templateAlias: LVA_ALIAS,
          questions: qs,
          answers: { S4_biggest_obstacles: ["sales"] },
        }),
      ),
    ).toEqual(["S4_biggest_obstacles", "S5_why_sales"]);
  });
});

// ── Server prune helper (C3, D3) ─────────────────────────────────────────

describe("resolveVisibleSurveyQuestionKeys (server prune — generic rules ONLY)", () => {
  it("drops hidden-question keys from the visible set", () => {
    const visible = resolveVisibleSurveyQuestionKeys({
      questions: [gateQ(), depQ(), q("Q_PLAIN")],
      answers: { Q_GATE: ["cash"] },
    });
    expect(visible.has("Q_DEP")).toBe(false);
    expect(visible.has("Q_GATE")).toBe(true);
    expect(visible.has("Q_PLAIN")).toBe(true);
  });

  it("does NOT run the LVA alias branch (D3 — LVA storage behavior unchanged)", () => {
    // A non-gated S5_why_ follow-up stays in the server-visible set even for
    // LVA-shaped questions: the alias filter is presentation-layer only and
    // REPORT_FILTERS already suppresses it report-side.
    const visible = resolveVisibleSurveyQuestionKeys({
      questions: [
        q("S4_biggest_obstacles", {
          type: "MULTI_CHOICE",
          options: [{ key: "sales", label: "Sales" }],
        }),
        q("S5_why_sales"),
        q("S5_why_cash"),
      ],
      answers: { S4_biggest_obstacles: [] },
    });
    expect(visible.has("S5_why_sales")).toBe(true);
    expect(visible.has("S5_why_cash")).toBe(true);
  });

  it("client/server equivalence on generic templates (C3 property)", () => {
    const questions = [gateQ(), depQ(), q("Q_B", { showIf: { questionKey: "Q_GATE", optionKey: "cash" } }), q("Q_PLAIN")];
    for (const answers of [
      {},
      { Q_GATE: ["sales"] },
      { Q_GATE: ["cash"] },
      { Q_GATE: ["sales", "cash"] },
    ] as Record<string, string[]>[]) {
      const client = visibleSurveyQuestionKeys({
        templateAlias: "generic-template",
        questions,
        answers,
      });
      const server = resolveVisibleSurveyQuestionKeys({ questions, answers });
      expect([...server].sort()).toEqual([...client].sort());
    }
  });
});

// ── Submit-route prune (C3) ──────────────────────────────────────────────

describe("pruneHiddenAnswers (shared submit-route prune)", () => {
  const questions = [gateQ(), depQ(), q("Q_PLAIN")];

  it("drops answers to hidden questions (tampered submit)", () => {
    const pruned = pruneHiddenAnswers(
      [
        { stableKey: "Q_GATE", value: ["cash"] },
        { stableKey: "Q_DEP", value: "smuggled through the API" },
        { stableKey: "Q_PLAIN", value: "ok" },
      ],
      questions,
    );
    expect(pruned.map((a) => a.stableKey)).toEqual(["Q_GATE", "Q_PLAIN"]);
  });

  it("keeps answers to visible conditional questions", () => {
    const answers = [
      { stableKey: "Q_GATE", value: ["sales"] },
      { stableKey: "Q_DEP", value: "legit" },
    ];
    expect(pruneHiddenAnswers(answers, questions)).toBe(answers); // same-ref
  });

  it("keeps UNKNOWN stableKeys (they must reach scoreSubmission's UNKNOWN_STABLE_KEY path)", () => {
    const pruned = pruneHiddenAnswers(
      [
        { stableKey: "Q_GATE", value: [] },
        { stableKey: "Q_NOT_A_QUESTION", value: "x" },
      ],
      questions,
    );
    expect(pruned.map((a) => a.stableKey)).toContain("Q_NOT_A_QUESTION");
  });

  it("is a same-ref no-op when the version has no showIf at all", () => {
    const answers = [{ stableKey: "Q_PLAIN", value: "x" }];
    expect(pruneHiddenAnswers(answers, [q("Q_PLAIN")])).toBe(answers);
  });

  it("does NOT prune LVA follow-ups (generic rules only — D3)", () => {
    const lva = [
      q("S4_biggest_obstacles", {
        type: "MULTI_CHOICE",
        options: [{ key: "sales", label: "Sales" }],
      }),
      q("S5_why_sales"),
    ];
    const answers = [
      { stableKey: "S4_biggest_obstacles", value: [] as string[] },
      { stableKey: "S5_why_sales", value: "stored-but-suppressed, as today" },
    ];
    expect(pruneHiddenAnswers(answers, lva)).toBe(answers);
  });
});

// ── Route wiring guard (Wave V pattern — source-grep freeze) ─────────────

describe("submit-route prune wiring", () => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const routes = [
    "src/app/(public)/org-survey/[campaignAlias]/submit/route.ts",
    "src/app/api/quiz/[campaignAlias]/submit/route.ts",
  ];

  it.each(routes)("%s calls pruneHiddenAnswers before scoring", (rel) => {
    const source = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(source).toContain("pruneHiddenAnswers(");
    // The prune must run BEFORE scoreSubmission in the handler body.
    expect(source.indexOf("pruneHiddenAnswers(")).toBeLessThan(
      source.indexOf("scoreSubmission(version"),
    );
  });
});

// ── Conditionally-emptied page suppression (D7) ──────────────────────────

describe("filterConditionallyEmptiedPages (D7)", () => {
  const sections: PagerSection[] = [
    { stableKey: "S_INTRO", sortOrder: 1, name: "Welcome" },
    { stableKey: "S_MAIN", sortOrder: 2, name: "Main" },
    { stableKey: "S_COND", sortOrder: 3, name: "Follow-ups" },
  ];
  const allQuestions: PagerQuestion[] = [
    gateQ("Q_GATE", { sectionStableKey: "S_MAIN" }),
    q("Q_DEP", {
      sectionStableKey: "S_COND",
      showIf: { questionKey: "Q_GATE", optionKey: "sales" },
    }),
  ];

  function visiblePages(answers: Record<string, string[]>) {
    const visible = filterVisibleSurveyQuestions({
      templateAlias: "t",
      questions: allQuestions,
      answers,
    });
    return filterConditionallyEmptiedPages(
      buildSectionPages(sections, visible),
      allQuestions,
    );
  }

  it("suppresses a section page whose authored questions are ALL hidden", () => {
    const pages = visiblePages({ Q_GATE: [] });
    expect(pages.map((p) => p.stableKey)).toEqual(["S_INTRO", "S_MAIN"]);
  });

  it("keeps the section page when its question becomes visible", () => {
    const pages = visiblePages({ Q_GATE: ["sales"] });
    expect(pages.map((p) => p.stableKey)).toEqual(["S_INTRO", "S_MAIN", "S_COND"]);
  });

  it("always keeps authored-empty intro pages (zero questions in the version)", () => {
    const pages = visiblePages({ Q_GATE: [] });
    expect(pages.map((p) => p.stableKey)).toContain("S_INTRO");
  });

  it("no-ops when nothing is conditional (same page list)", () => {
    const plainQuestions = [gateQ("Q_GATE", { sectionStableKey: "S_MAIN" })];
    const pages = filterConditionallyEmptiedPages(
      buildSectionPages(sections, plainQuestions),
      plainQuestions,
    );
    expect(pages.map((p) => p.stableKey)).toEqual(["S_INTRO", "S_MAIN", "S_COND"]);
  });
});
