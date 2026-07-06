/**
 * Wave W (spec 19w §2.6) — showIf serialization: explicit emission with
 * anti-resurrection, hash-stable passthrough on untouched saves, and
 * half-picked rules never emitting.
 */
import {
  buildQuestionsPayload,
  type QuestionDraftRow,
} from "@/components/admin/template-editor/question-serialization";

function draft(overrides: Partial<QuestionDraftRow>): QuestionDraftRow {
  return {
    uid: "u1",
    stableKey: "S1_q1",
    sectionStableKey: "S1",
    label: "Question one",
    helpText: "",
    isRequired: false,
    type: "TEXT",
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

const rawRow = {
  stableKey: "S1_q1",
  sortOrder: 1,
  type: "TEXT",
  label: "Question one",
  sectionStableKey: "S1",
  isRequired: false,
};

describe("showIf serialization", () => {
  it("emits a complete showIf from the draft on a dirty save", () => {
    const { payload } = buildQuestionsPayload(
      [draft({ showIf: { questionKey: "S1_gate", optionKey: "sales" } })],
      { rawQuestions: [rawRow], publishedKeys: new Set(), questionsDirty: true },
    );
    expect((payload as Record<string, unknown>[])[0].showIf).toEqual({
      questionKey: "S1_gate",
      optionKey: "sales",
    });
  });

  it("anti-resurrection: a cleared rule DELETES the stored showIf", () => {
    const stored = {
      ...rawRow,
      showIf: { questionKey: "S1_gate", optionKey: "sales" },
    };
    const { payload } = buildQuestionsPayload([draft({ showIf: null })], {
      rawQuestions: [stored],
      publishedKeys: new Set(),
      questionsDirty: true,
    });
    expect("showIf" in (payload as Record<string, unknown>[])[0]).toBe(false);
  });

  it("half-picked rules (gate chosen, option not yet) do NOT emit", () => {
    const { payload } = buildQuestionsPayload(
      [draft({ showIf: { questionKey: "S1_gate", optionKey: "" } })],
      { rawQuestions: [rawRow], publishedKeys: new Set(), questionsDirty: true },
    );
    expect("showIf" in (payload as Record<string, unknown>[])[0]).toBe(false);
  });

  it("untouched save (questionsDirty=false) is a same-ref passthrough — stored showIf survives byte-exact", () => {
    const stored = [
      { ...rawRow, showIf: { questionKey: "S1_gate", optionKey: "sales" } },
    ];
    const { payload } = buildQuestionsPayload([draft({})], {
      rawQuestions: stored,
      publishedKeys: new Set(),
      questionsDirty: false,
    });
    expect(payload).toBe(stored);
  });

  it("an edit to OTHER fields keeps the draft's showIf (raw spread + explicit emission agree)", () => {
    const stored = {
      ...rawRow,
      showIf: { questionKey: "S1_gate", optionKey: "sales" },
    };
    const { payload } = buildQuestionsPayload(
      [
        draft({
          label: "Reworded label",
          showIf: { questionKey: "S1_gate", optionKey: "sales" },
        }),
      ],
      { rawQuestions: [stored], publishedKeys: new Set(), questionsDirty: true },
    );
    const row = (payload as Record<string, unknown>[])[0];
    expect(row.label).toBe("Reworded label");
    expect(row.showIf).toEqual({ questionKey: "S1_gate", optionKey: "sales" });
  });
});
