/**
 * Wave T (spec 19t §4, last bullet) — end-to-end pipeline proof.
 *
 * Exercises the whole editor→engine chain with NO mocks: an editor draft set
 * (one inherited slider, one legacy TEXT carrying the old serializer's stale
 * `scale`, plus NEW TEXT / NUMBER / MULTI_CHOICE questions) is serialized via
 * buildQuestionsPayload, then the SAME payload must:
 *   1. pass QuestionSchema per row (draft-save validation, §T-5),
 *   2. pass TemplateVersionForPublishSchema as a full version (publish gate),
 *   3. place every question on the right survey page (buildSectionPages),
 *   4. land in the qualitative report model with the right presentation kind
 *      and resolved MULTI_CHOICE display labels (buildQualitativeModel).
 */
import {
  buildQuestionsPayload,
  type QuestionDraftRow,
} from "@/components/admin/template-editor/question-serialization";
import {
  QuestionSchema,
  TemplateVersionForPublishSchema,
} from "@/lib/assessments/scoring";
import {
  buildSectionPages,
  OTHER_PAGE_KEY,
  type PagerQuestion,
  type PagerSection,
} from "@/lib/assessments/section-pages";
import {
  buildQualitativeModel,
  type QMeta,
} from "@/lib/assessments/qualitative-report-model";

const SECTIONS: PagerSection[] = [
  { stableKey: "P1_retro", sortOrder: 1, name: "Retrospective" },
  { stableKey: "S9_extras", sortOrder: 2, name: "Extras" },
];

/** The stored draft rows, as the version JSON holds them today. */
const RAW_QUESTIONS: unknown[] = [
  {
    stableKey: "P1_rating",
    sortOrder: 1,
    type: "SLIDER_LIKERT",
    label: "Rate the quarter",
    sectionStableKey: "P1_retro",
    isRequired: true,
    scale: { min: 0, max: 10, step: 1, anchorMin: "Poor", anchorMax: "Great" },
    recommendations: [{ minScore: 0, maxScore: 10, text: "Keep going." }],
    futureField: "must-survive",
  },
  {
    // Legacy defect shape: a TEXT row that the OLD serializer polluted with
    // a scale object. Wave T's serializer must strip it (spec §0 / §T-3).
    stableKey: "P1_notes",
    sortOrder: 2,
    type: "TEXT",
    label: "Anything else?",
    sectionStableKey: "P1_retro",
    isRequired: false,
    scale: { min: 0, max: 3, step: 1, anchorMin: "", anchorMax: "" },
  },
];

function draftFromRaw(
  raw: Record<string, unknown>,
  publishedKeys: ReadonlySet<string>,
): QuestionDraftRow {
  const scale = (raw.scale ?? {}) as Record<string, unknown>;
  const inherited = publishedKeys.has(raw.stableKey as string);
  return {
    uid: `u_${raw.stableKey as string}`,
    stableKey: raw.stableKey as string,
    sectionStableKey: raw.sectionStableKey as string,
    label: raw.label as string,
    helpText: "",
    isRequired: Boolean(raw.isRequired),
    type: raw.type as string,
    sortOrder: raw.sortOrder as number,
    scaleMin: typeof scale.min === "number" ? scale.min : 0,
    scaleMax: typeof scale.max === "number" ? scale.max : 10,
    scaleStep: typeof scale.step === "number" ? scale.step : 1,
    anchorMin: typeof scale.anchorMin === "string" ? scale.anchorMin : "",
    anchorMax: typeof scale.anchorMax === "string" ? scale.anchorMax : "",
    options: [],
    maxChoices: null,
    isInherited: inherited,
    isNewToDraft: !inherited,
    // Wave U — mirror hydrateQuestionsFromJson: persisted band rules ride
    // into the draft (that is how they survive a dirty save now — explicit
    // re-emission, not blind spread).
    findingBands: Array.isArray(raw.recommendations)
      ? (raw.recommendations as Array<Record<string, unknown>>)
          .filter(
            (b) =>
              typeof b.minScore === "number" &&
              typeof b.maxScore === "number" &&
              typeof b.text === "string",
          )
          .map((b) => ({
            minScore: b.minScore as number,
            maxScore: b.maxScore as number,
            text: b.text as string,
          }))
      : [],
    findingOptionTexts: {},
  };
}

function newDraft(
  partial: Partial<QuestionDraftRow> &
    Pick<QuestionDraftRow, "uid" | "sectionStableKey" | "label" | "type" | "sortOrder">,
): QuestionDraftRow {
  return {
    stableKey: "",
    helpText: "",
    isRequired: false,
    scaleMin: 0,
    scaleMax: 10,
    scaleStep: 1,
    anchorMin: "",
    anchorMax: "",
    options: [],
    maxChoices: null,
    isInherited: false,
    isNewToDraft: true,
    findingBands: [],
    findingOptionTexts: {},
    ...partial,
  };
}

describe("Wave T pipeline: editor payload → publish → survey pages → report model", () => {
  const publishedKeys = new Set(["P1_rating"]); // the slider shipped in v1

  const drafts: QuestionDraftRow[] = [
    draftFromRaw(RAW_QUESTIONS[0] as Record<string, unknown>, publishedKeys),
    draftFromRaw(RAW_QUESTIONS[1] as Record<string, unknown>, publishedKeys),
    newDraft({
      uid: "u_new_text",
      sectionStableKey: "P1_retro",
      label: "Biggest win",
      type: "TEXT",
      sortOrder: 3,
    }),
    newDraft({
      uid: "u_new_number",
      sectionStableKey: "P1_retro",
      label: "Revenue target",
      type: "NUMBER",
      sortOrder: 4,
    }),
    newDraft({
      uid: "u_new_mc",
      sectionStableKey: "S9_extras",
      label: "Pick your top obstacle",
      type: "MULTI_CHOICE",
      sortOrder: 1,
      options: [
        { key: "", label: "Cash", isNew: true },
        { key: "", label: "Sales", isNew: true },
      ],
      maxChoices: 1,
    }),
  ];

  const { payload, assignedKeys } = buildQuestionsPayload(drafts, {
    questionsDirty: true,
    rawQuestions: RAW_QUESTIONS,
    publishedKeys,
    publishedOptionKeys: {},
  });
  const rows = payload as Array<Record<string, unknown>>;

  it("derives section-prefixed keys for the new questions", () => {
    expect(assignedKeys.get("u_new_text")).toBe("P1_biggest_win");
    expect(assignedKeys.get("u_new_number")).toBe("P1_revenue_target");
    expect(assignedKeys.get("u_new_mc")).toBe("S9_pick_your_top_obstacle");
  });

  it("every payload row passes QuestionSchema (draft-save validation)", () => {
    for (const row of rows) {
      const parsed = QuestionSchema.safeParse(row);
      expect(parsed.success).toBe(true);
    }
  });

  it("strips the legacy stale scale from the TEXT row and preserves slider extras", () => {
    const notes = rows.find((r) => r.stableKey === "P1_notes")!;
    expect("scale" in notes).toBe(false);
    const rating = rows.find((r) => r.stableKey === "P1_rating")!;
    expect(rating.futureField).toBe("must-survive");
    expect(Array.isArray(rating.recommendations)).toBe(true);
  });

  it("the full version passes TemplateVersionForPublishSchema (neutral tier)", () => {
    const parsed = TemplateVersionForPublishSchema.safeParse({
      questions: rows,
      sections: SECTIONS.map((s) => ({
        stableKey: s.stableKey,
        sortOrder: s.sortOrder,
        name: s.name,
      })),
      scoringConfig: {
        tierMetric: "overallAvg",
        passThreshold: 0,
        tiers: [
          { minMetric: 0, label: "All results", message: "Neutral summary." },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("buildSectionPages places every question on its section page (no Other bucket)", () => {
    const pages = buildSectionPages(SECTIONS, rows as unknown as PagerQuestion[]);
    expect(pages.some((p) => p.stableKey === OTHER_PAGE_KEY)).toBe(false);
    const p1 = pages.find((p) => p.stableKey === "P1_retro")!;
    expect(p1.questions.map((q) => q.stableKey)).toEqual([
      "P1_rating",
      "P1_notes",
      "P1_biggest_win",
      "P1_revenue_target",
    ]);
    const s9 = pages.find((p) => p.stableKey === "S9_extras")!;
    expect(s9.questions.map((q) => q.stableKey)).toEqual([
      "S9_pick_your_top_obstacle",
    ]);
    const mc = s9.questions[0];
    expect(mc.options).toEqual([
      { key: "cash", label: "Cash" },
      { key: "sales", label: "Sales" },
    ]);
    expect(mc.maxChoices).toBe(1);
  });

  it("buildQualitativeModel renders the new answers with the right presentation kinds", () => {
    const questionsByKey: Record<string, QMeta> = {};
    for (const row of rows) {
      questionsByKey[row.stableKey as string] = {
        type: row.type as string,
        label: row.label as string,
        sectionStableKey: row.sectionStableKey as string,
        ...(Array.isArray(row.options)
          ? { options: row.options as Array<{ key: string; label: string }> }
          : {}),
      };
    }
    const model = buildQualitativeModel({
      templateAlias: "some-unfiltered-template",
      sections: SECTIONS.map((s) => ({
        stableKey: s.stableKey,
        name: s.name,
      })),
      questionsByKey,
      rawAnswers: [
        { stableKey: "P1_rating", value: 8 },
        { stableKey: "P1_notes", value: "All good" },
        { stableKey: "P1_biggest_win", value: "Closed the big deal" },
        { stableKey: "P1_revenue_target", value: 4200000 },
        { stableKey: "S9_pick_your_top_obstacle", value: ["cash"] },
      ],
    });

    const p1 = model.sections.find((s) => s.stableKey === "P1_retro")!;
    expect(p1.items.map((i) => i.stableKey)).toContain("P1_biggest_win");
    expect(p1.items.map((i) => i.stableKey)).toContain("P1_revenue_target");

    const s9 = model.sections.find((s) => s.stableKey === "S9_extras")!;
    expect(s9.kind).toBe("choices"); // classifyPresentationByTypes: any MULTI_CHOICE
    const mcItem = s9.items.find(
      (i) => i.stableKey === "S9_pick_your_top_obstacle",
    )!;
    expect(mcItem.displayValues).toEqual(["Cash"]); // key resolved to label
  });
});
