/**
 * Wave U3 (spec 19aa D7) — the shared findings-rule helper + no-drift property.
 *
 * `buildFindingRecommendations` is the SINGLE source of truth for the emitted
 * `recommendations` array, used by BOTH the save path (`buildQuestionsPayload`)
 * and the editor test-a-value preview. These pins prove the two can never
 * disagree ("what the preview says fires" == "what a save emits & resolves"):
 *
 *   1. buildFindingRecommendations(d)  ≡  buildQuestionsPayload emission for d.
 *   2. resolveFindings over that output fires the expected texts (the value the
 *      preview shows), across bands / MC option-order / TEXT / no-answer.
 */
import {
  buildQuestionsPayload,
  buildFindingRecommendations,
  type QuestionDraftRow,
} from "@/components/admin/template-editor/question-serialization";
import { resolveFindings } from "@/lib/assessments/findings";

function makeDraft(overrides: Partial<QuestionDraftRow> = {}): QuestionDraftRow {
  return {
    uid: "u1",
    stableKey: "S1_q",
    sectionStableKey: "S1_sec",
    label: "Q",
    helpText: "",
    isRequired: true,
    type: "SLIDER_LIKERT",
    sortOrder: 1,
    scaleMin: 0,
    scaleMax: 10,
    scaleStep: 1,
    anchorMin: "Low",
    anchorMax: "High",
    options: [],
    maxChoices: null,
    isInherited: false,
    isNewToDraft: false,
    findingBands: [],
    findingOptionTexts: {},
    showIf: null,
    ...overrides,
  };
}

function emittedRecommendations(d: QuestionDraftRow): unknown {
  const { payload } = buildQuestionsPayload([d], {
    questionsDirty: true,
    rawQuestions: [],
    publishedKeys: new Set<string>(),
    publishedOptionKeys: {},
  });
  const row = (payload as Array<Record<string, unknown>>)[0];
  return "recommendations" in row ? row.recommendations : undefined;
}

/** Build the fake question the preview resolves against (mirrors FindingsPreview). */
function firedTexts(d: QuestionDraftRow, sample: unknown): string[] {
  const recs = buildFindingRecommendations(d) ?? [];
  const fakeQ = {
    stableKey: d.stableKey,
    type: d.type,
    label: d.label,
    sortOrder: 0,
    recommendations: recs,
    options: d.options.map((o) => ({ key: o.key })),
  };
  const answers = new Map<string, unknown>();
  if (sample !== undefined) answers.set(d.stableKey, sample);
  return resolveFindings([fakeQ], answers).map((f) => f.text);
}

const CASES: Array<{ name: string; draft: QuestionDraftRow }> = [
  {
    name: "SLIDER bands (finite + non-blank only)",
    draft: makeDraft({
      type: "SLIDER_LIKERT",
      findingBands: [
        { minScore: 0, maxScore: 3, text: "Low band" },
        { minScore: 4, maxScore: 7, text: "" }, // blank → dropped
        { minScore: null, maxScore: 10, text: "half-typed" }, // null → dropped
        { minScore: 8, maxScore: 10, text: "High band" },
      ],
    }),
  },
  {
    name: "NUMBER bands",
    draft: makeDraft({
      type: "NUMBER",
      findingBands: [{ minScore: 0, maxScore: 50, text: "Under target" }],
    }),
  },
  {
    name: "MULTI_CHOICE rules in authored OPTION order",
    draft: makeDraft({
      type: "MULTI_CHOICE",
      // isNew: true — these options aren't in any published version, so they
      // skip the inherited-option-key immutability guard (that lock is tested
      // elsewhere; here we're pinning the recommendations shape).
      options: [
        { key: "a", label: "Alpha", isNew: true },
        { key: "b", label: "Bravo", isNew: true },
        { key: "c", label: "Charlie", isNew: true },
      ],
      findingOptionTexts: { a: "Pick A note", b: "", c: "Pick C note" },
    }),
  },
  {
    name: "TEXT never emits",
    draft: makeDraft({ type: "TEXT" }),
  },
  {
    name: "no rules at all",
    draft: makeDraft({ type: "SLIDER_LIKERT", findingBands: [] }),
  },
];

describe("buildFindingRecommendations ≡ buildQuestionsPayload emission (no drift)", () => {
  it.each(CASES)("$name", ({ draft }) => {
    const helper = buildFindingRecommendations(draft);
    const emitted = emittedRecommendations(draft);
    // null (helper) and undefined (absent key) both mean "no recommendations".
    expect(helper ?? undefined).toEqual(emitted);
  });
});

describe("preview resolution matches what the frozen snapshot would carry", () => {
  it("SLIDER: an answer inside a band fires that band's text", () => {
    const draft = CASES[0].draft;
    expect(firedTexts(draft, 2)).toEqual(["Low band"]);
    expect(firedTexts(draft, 9)).toEqual(["High band"]);
    expect(firedTexts(draft, 5)).toEqual([]); // the blank band was dropped
  });

  it("MULTI_CHOICE fires in authored OPTION order regardless of selection order", () => {
    const draft = CASES[2].draft;
    // Tick c THEN a — resolver still returns authored order (a before c); b has
    // no rule so never fires.
    expect(firedTexts(draft, ["c", "a", "b"])).toEqual([
      "Pick A note",
      "Pick C note",
    ]);
  });

  it("no answer ⇒ nothing fires (the explicit empty case the preview shows)", () => {
    expect(firedTexts(CASES[0].draft, undefined)).toEqual([]);
    expect(firedTexts(CASES[2].draft, [])).toEqual([]);
    expect(firedTexts(CASES[1].draft, "")).toEqual([]);
  });

  it("TEXT fires nothing even with an answer", () => {
    expect(firedTexts(CASES[3].draft, "anything")).toEqual([]);
  });
});
