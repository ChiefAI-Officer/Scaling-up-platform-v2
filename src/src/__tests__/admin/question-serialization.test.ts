/**
 * question-serialization — Wave T (spec 19t §T-3, D8).
 *
 * Pure helpers replacing the always-emit-`scale` serializer inside
 * TemplateEditorTabbed.handleSaveDraft:
 *   - slugify / deriveStableKey / deriveOptionKey (D8 slug keys),
 *   - buildQuestionsPayload (per-type emission + inherited-lock re-check +
 *     content-hash-stable not-dirty passthrough).
 */
import {
  slugify,
  deriveStableKey,
  deriveOptionKey,
  buildQuestionsPayload,
  QuestionSerializationError,
  type QuestionDraftRow,
} from "@/components/admin/template-editor/question-serialization";

const KEY_REGEX = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

function makeDraft(overrides: Partial<QuestionDraftRow> = {}): QuestionDraftRow {
  return {
    uid: "u1",
    stableKey: "S1_focus",
    sectionStableKey: "S1_alignment",
    label: "Focus",
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
    isInherited: true,
    isNewToDraft: false,
    // Wave U — findings rules default empty (rule-free rows emit no
    // `recommendations` key; the raw spread's stored value is dropped).
    findingBands: [],
    findingOptionTexts: {},
    showIf: null,
    ...overrides,
  };
}

function baseOpts(overrides: Partial<Parameters<typeof buildQuestionsPayload>[1]> = {}) {
  return {
    questionsDirty: true,
    rawQuestions: [] as unknown[],
    publishedKeys: new Set<string>(),
    publishedOptionKeys: {} as Record<string, readonly string[]>,
    ...overrides,
  };
}

function expectThrowWithCode(
  fn: () => unknown,
  code: string,
  stableKey?: string,
): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(QuestionSerializationError);
  const err = caught as QuestionSerializationError;
  expect(err.code).toBe(code);
  if (stableKey !== undefined) expect(err.stableKey).toBe(stableKey);
}

// ────────────────────────────────────────────────────────────────────────
// slugify
// ────────────────────────────────────────────────────────────────────────
describe("slugify", () => {
  it("lowercases", () => {
    expect(slugify("Hello World")).toBe("hello_world");
  });

  it("collapses every run of non-alphanumerics into a single underscore", () => {
    expect(slugify("What's your #1 priority?!")).toBe("what_s_your_1_priority");
  });

  it("trims leading and trailing underscores", () => {
    expect(slugify("  --Growth--  ")).toBe("growth");
  });

  it("keeps digits", () => {
    expect(slugify("Top 3 rocks (Q4)")).toBe("top_3_rocks_q4");
  });

  it("returns empty string for emoji-only input", () => {
    expect(slugify("🎯🚀")).toBe("");
  });

  it("returns empty string for punctuation-only input", () => {
    expect(slugify("!!! ??? ...")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });
});

// ────────────────────────────────────────────────────────────────────────
// deriveStableKey
// ────────────────────────────────────────────────────────────────────────
describe("deriveStableKey", () => {
  const none = new Set<string>();

  it("prefixes with the section key up to its first underscore (P1_retrospective → P1)", () => {
    expect(deriveStableKey("Biggest win", "P1_retrospective", none)).toBe(
      "P1_biggest_win",
    );
  });

  it("prefixes S1_financials → S1", () => {
    expect(deriveStableKey("Cash cycle", "S1_financials", none)).toBe(
      "S1_cash_cycle",
    );
  });

  it("uses the whole section key when it has no underscore", () => {
    expect(deriveStableKey("Company name", "INTRO", none)).toBe(
      "INTRO_company_name",
    );
  });

  it("truncates to 40 chars total", () => {
    const key = deriveStableKey("a".repeat(50), "P1_retrospective", none);
    expect(key).toBe(`P1_${"a".repeat(37)}`);
    expect(key).toHaveLength(40);
  });

  it("trims a trailing underscore left by truncation", () => {
    // "P1_" + 36×a + "_tail" — the 40-char cut lands exactly after the "_".
    const key = deriveStableKey(`${"a".repeat(36)} tail`, "P1_retrospective", none);
    expect(key).toBe(`P1_${"a".repeat(36)}`);
    expect(key).toHaveLength(39);
  });

  it("throws EMPTY_LABEL_SLUG for punctuation/emoji-only labels", () => {
    expectThrowWithCode(
      () => deriveStableKey("🎯!!", "P1_retrospective", none),
      "EMPTY_LABEL_SLUG",
    );
  });

  it("appends _2 on collision with the taken set", () => {
    const taken = new Set(["P1_biggest_win"]);
    expect(deriveStableKey("Biggest win", "P1_retrospective", taken)).toBe(
      "P1_biggest_win_2",
    );
  });

  it("walks to _3 when _2 is also taken", () => {
    const taken = new Set(["P1_biggest_win", "P1_biggest_win_2"]);
    expect(deriveStableKey("Biggest win", "P1_retrospective", taken)).toBe(
      "P1_biggest_win_3",
    );
  });

  it("keeps the collision suffix within the 40-char cap by truncating the base", () => {
    const base = `P1_${"a".repeat(37)}`; // exactly 40 chars
    const taken = new Set([base]);
    const key = deriveStableKey("a".repeat(50), "P1_retrospective", taken);
    expect(key).toBe(`P1_${"a".repeat(35)}_2`);
    expect(key).toHaveLength(40);
  });

  it("always conforms to the stableKey regex", () => {
    const samples = [
      deriveStableKey("Biggest win", "P1_retrospective", none),
      deriveStableKey("a".repeat(50), "S1_financials", none),
      deriveStableKey("What's #1?", "INTRO", none),
      deriveStableKey("Biggest win", "P1_x", new Set(["P1_biggest_win"])),
    ];
    for (const key of samples) expect(key).toMatch(KEY_REGEX);
  });
});

// ────────────────────────────────────────────────────────────────────────
// deriveOptionKey
// ────────────────────────────────────────────────────────────────────────
describe("deriveOptionKey", () => {
  it("derives lower_snake from the label", () => {
    expect(deriveOptionKey("Not Applicable", new Set())).toBe("not_applicable");
  });

  it("appends _2 on collision within the question", () => {
    expect(deriveOptionKey("Yes", new Set(["yes"]))).toBe("yes_2");
  });

  it("caps at 40 chars", () => {
    expect(deriveOptionKey("a".repeat(45), new Set())).toBe("a".repeat(40));
  });

  it("throws EMPTY_LABEL_SLUG on an empty slug", () => {
    expectThrowWithCode(() => deriveOptionKey("???", new Set()), "EMPTY_LABEL_SLUG");
  });
});

// ────────────────────────────────────────────────────────────────────────
// buildQuestionsPayload
// ────────────────────────────────────────────────────────────────────────
describe("buildQuestionsPayload", () => {
  describe("not-dirty passthrough (content-hash contract)", () => {
    it("returns the raw array by REFERENCE and an empty assignedKeys map", () => {
      const raw = [{ stableKey: "S1_focus", type: "SLIDER_LIKERT" }];
      const result = buildQuestionsPayload(
        [makeDraft()],
        baseOpts({ questionsDirty: false, rawQuestions: raw }),
      );
      expect(result.payload).toBe(raw); // same reference, byte-for-byte
      expect(result.assignedKeys.size).toBe(0);
    });
  });

  describe("key assignment for new-to-draft questions", () => {
    it("derives the key from label + section, records it in assignedKeys by uid, and emits it", () => {
      const draft = makeDraft({
        uid: "u-new",
        stableKey: "",
        label: "Biggest win",
        sectionStableKey: "P1_retrospective",
        type: "TEXT",
        isInherited: false,
        isNewToDraft: true,
      });
      const { payload, assignedKeys } = buildQuestionsPayload([draft], baseOpts());
      expect(assignedKeys.get("u-new")).toBe("P1_biggest_win");
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect(row.stableKey).toBe("P1_biggest_win");
    });

    it("collides with a PUBLISHED key and resolves via _2", () => {
      const draft = makeDraft({
        uid: "u-new",
        stableKey: "",
        label: "Biggest win",
        sectionStableKey: "P1_retrospective",
        type: "TEXT",
        isInherited: false,
        isNewToDraft: true,
      });
      const { assignedKeys } = buildQuestionsPayload(
        [draft],
        baseOpts({ publishedKeys: new Set(["P1_biggest_win"]) }),
      );
      expect(assignedKeys.get("u-new")).toBe("P1_biggest_win_2");
    });

    it("collides with a RAW-question key and resolves via _2", () => {
      const raw = [
        { stableKey: "P1_biggest_win", type: "TEXT", label: "Biggest win" },
      ];
      const drafts = [
        makeDraft({
          uid: "u-old",
          stableKey: "P1_biggest_win",
          label: "Biggest win",
          sectionStableKey: "P1_retrospective",
          type: "TEXT",
        }),
        makeDraft({
          uid: "u-new",
          stableKey: "",
          label: "Biggest win",
          sectionStableKey: "P1_retrospective",
          type: "TEXT",
          isInherited: false,
          isNewToDraft: true,
        }),
      ];
      const { assignedKeys } = buildQuestionsPayload(
        drafts,
        baseOpts({ rawQuestions: raw }),
      );
      expect(assignedKeys.get("u-new")).toBe("P1_biggest_win_2");
    });

    it("two new siblings with the same label in the same section get _2 for the second (Duplicate action)", () => {
      const mk = (uid: string) =>
        makeDraft({
          uid,
          stableKey: "",
          label: "Biggest win",
          sectionStableKey: "P1_retrospective",
          type: "TEXT",
          isInherited: false,
          isNewToDraft: true,
        });
      const { assignedKeys } = buildQuestionsPayload(
        [mk("u-a"), mk("u-b")],
        baseOpts(),
      );
      expect(assignedKeys.get("u-a")).toBe("P1_biggest_win");
      expect(assignedKeys.get("u-b")).toBe("P1_biggest_win_2");
    });

    it("does not assign a key to inherited rows or new rows that already carry one", () => {
      const drafts = [
        makeDraft({ uid: "u-inh", stableKey: "S1_focus" }),
        makeDraft({
          uid: "u-kept",
          stableKey: "P1_already_assigned",
          isInherited: false,
          isNewToDraft: true,
          type: "TEXT",
          sectionStableKey: "P1_retrospective",
        }),
      ];
      const raw = [{ stableKey: "S1_focus", type: "SLIDER_LIKERT" }];
      const { assignedKeys } = buildQuestionsPayload(
        drafts,
        baseOpts({ rawQuestions: raw }),
      );
      expect(assignedKeys.size).toBe(0);
    });

    it("throws EMPTY_LABEL_SLUG when a new question's label slugs to nothing", () => {
      const draft = makeDraft({
        stableKey: "",
        label: "🎯!!",
        type: "TEXT",
        isInherited: false,
        isNewToDraft: true,
      });
      expectThrowWithCode(
        () => buildQuestionsPayload([draft], baseOpts()),
        "EMPTY_LABEL_SLUG",
      );
    });
  });

  describe("new MULTI_CHOICE option key assignment", () => {
    it("derives keys for new options and keeps them unique within the question", () => {
      const draft = makeDraft({
        stableKey: "",
        label: "Why not",
        sectionStableKey: "S5_why",
        type: "MULTI_CHOICE",
        isInherited: false,
        isNewToDraft: true,
        options: [
          { key: "", label: "Yes", isNew: true },
          { key: "", label: "Yes!", isNew: true }, // same slug → _2
          { key: "", label: "No", isNew: true },
        ],
      });
      const { payload } = buildQuestionsPayload([draft], baseOpts());
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect(row.options).toEqual([
        { key: "yes", label: "Yes" },
        { key: "yes_2", label: "Yes!" },
        { key: "no", label: "No" },
      ]);
    });

    it("new option keys avoid existing persisted option keys on the same question", () => {
      const raw = [
        {
          stableKey: "S4_obstacles",
          type: "MULTI_CHOICE",
          label: "Obstacles",
          options: [{ key: "yes", label: "Yes" }],
        },
      ];
      const draft = makeDraft({
        stableKey: "S4_obstacles",
        label: "Obstacles",
        type: "MULTI_CHOICE",
        options: [
          { key: "yes", label: "Yes", isNew: false },
          { key: "", label: "Yes", isNew: true },
        ],
      });
      const { payload } = buildQuestionsPayload(
        [draft],
        baseOpts({ rawQuestions: raw }),
      );
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect(row.options).toEqual([
        { key: "yes", label: "Yes" },
        { key: "yes_2", label: "Yes" },
      ]);
    });
  });

  describe("per-type emission", () => {
    it("SLIDER_LIKERT emits scale (raw-scale spread + draft overrides) and strips options/maxChoices", () => {
      const raw = [
        {
          stableKey: "S1_focus",
          type: "SLIDER_LIKERT",
          label: "Focus",
          scale: { min: 1, max: 5, step: 1, anchorMin: "a", anchorMax: "b", futureScaleField: "keep" },
          options: [{ key: "stale", label: "Stale" }],
          maxChoices: 2,
        },
      ];
      const draft = makeDraft({
        stableKey: "S1_focus",
        scaleMin: 0,
        scaleMax: 10,
        scaleStep: 2,
        anchorMin: "Low",
        anchorMax: "High",
      });
      const { payload } = buildQuestionsPayload(
        [draft],
        baseOpts({ rawQuestions: raw }),
      );
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect(row.scale).toEqual({
        min: 0,
        max: 10,
        step: 2,
        anchorMin: "Low",
        anchorMax: "High",
        futureScaleField: "keep",
      });
      expect("options" in row).toBe(false);
      expect("maxChoices" in row).toBe(false);
    });

    it("TEXT emits neither scale nor options/maxChoices even when the raw row HAD a stale scale (defect-fix proof)", () => {
      const raw = [
        {
          stableKey: "P1_biggest_win",
          type: "TEXT",
          label: "Biggest win",
          // the old serializer injected this into every row:
          scale: { min: 0, max: 10, step: 1, anchorMin: "", anchorMax: "" },
        },
      ];
      const draft = makeDraft({
        stableKey: "P1_biggest_win",
        label: "Biggest win",
        type: "TEXT",
        sectionStableKey: "P1_retrospective",
      });
      const { payload } = buildQuestionsPayload(
        [draft],
        baseOpts({ rawQuestions: raw }),
      );
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect("scale" in row).toBe(false);
      expect("options" in row).toBe(false);
      expect("maxChoices" in row).toBe(false);
      expect(row.type).toBe("TEXT");
    });

    it("NUMBER emits neither scale nor options/maxChoices even with a stale raw scale", () => {
      const raw = [
        {
          stableKey: "S2_fte",
          type: "NUMBER",
          label: "FTE count",
          scale: { min: 0, max: 10, step: 1, anchorMin: "", anchorMax: "" },
          options: [{ key: "stale", label: "Stale" }],
        },
      ];
      const draft = makeDraft({
        stableKey: "S2_fte",
        label: "FTE count",
        type: "NUMBER",
        sectionStableKey: "S2_people",
      });
      const { payload } = buildQuestionsPayload(
        [draft],
        baseOpts({ rawQuestions: raw }),
      );
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect("scale" in row).toBe(false);
      expect("options" in row).toBe(false);
      expect("maxChoices" in row).toBe(false);
    });

    it("MULTI_CHOICE emits options as exactly {key,label} pairs + maxChoices, and no scale", () => {
      const raw = [
        {
          stableKey: "S4_obstacles",
          type: "MULTI_CHOICE",
          label: "Obstacles",
          scale: { min: 0, max: 10 }, // stale — must drop
          options: [{ key: "time", label: "Time" }],
        },
      ];
      const draft = makeDraft({
        stableKey: "S4_obstacles",
        label: "Obstacles",
        type: "MULTI_CHOICE",
        maxChoices: 2,
        options: [
          { key: "time", label: "Time (edited)", isNew: false },
          { key: "", label: "Money", isNew: true },
        ],
      });
      const { payload } = buildQuestionsPayload(
        [draft],
        baseOpts({ rawQuestions: raw }),
      );
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect("scale" in row).toBe(false);
      expect(row.maxChoices).toBe(2);
      expect(row.options).toEqual([
        { key: "time", label: "Time (edited)" },
        { key: "money", label: "Money" },
      ]);
      // option rows carry EXACTLY key + label
      for (const o of row.options as Array<Record<string, unknown>>) {
        expect(Object.keys(o).sort()).toEqual(["key", "label"]);
      }
    });

    it("MULTI_CHOICE omits maxChoices when null, removing a stale raw value", () => {
      const raw = [
        {
          stableKey: "S4_obstacles",
          type: "MULTI_CHOICE",
          label: "Obstacles",
          options: [{ key: "time", label: "Time" }],
          maxChoices: 3,
        },
      ];
      const draft = makeDraft({
        stableKey: "S4_obstacles",
        label: "Obstacles",
        type: "MULTI_CHOICE",
        maxChoices: null,
        options: [{ key: "time", label: "Time", isNew: false }],
      });
      const { payload } = buildQuestionsPayload(
        [draft],
        baseOpts({ rawQuestions: raw }),
      );
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect("maxChoices" in row).toBe(false);
    });

    it("emits helpText only when non-blank", () => {
      const drafts = [
        makeDraft({
          uid: "u-a",
          stableKey: "",
          label: "With help",
          helpText: "Some help",
          type: "TEXT",
          isInherited: false,
          isNewToDraft: true,
          sectionStableKey: "P1_x",
        }),
        makeDraft({
          uid: "u-b",
          stableKey: "",
          label: "Without help",
          helpText: "   ",
          type: "TEXT",
          isInherited: false,
          isNewToDraft: true,
          sectionStableKey: "P1_x",
        }),
      ];
      const { payload } = buildQuestionsPayload(drafts, baseOpts());
      const rows = payload as Array<Record<string, unknown>>;
      expect(rows[0].helpText).toBe("Some help");
      expect("helpText" in rows[1]).toBe(false);
    });
  });

  describe("raw-spread preservation (content-hash contract, dirty path)", () => {
    // Wave U note: `recommendations` is no longer an UNKNOWN field — it is
    // owned (typed per question type, hydrated into the draft, explicitly
    // re-emitted). It survives a dirty save via hydration → draft →
    // emission, NOT via the blind spread (anti-resurrection, spec 19u U-4).
    // Truly-unknown future fields (`futureField`) still survive via the
    // spread — that remains the validate-don't-strip core.
    const RAW_BANDS = [
      { minScore: 0, maxScore: 4, text: "Do X" },
      { minScore: 5, maxScore: 10, text: "Do Y" },
    ];
    const raw = [
      {
        stableKey: "S1_focus",
        sectionStableKey: "S1_alignment",
        sortOrder: 1,
        type: "SLIDER_LIKERT",
        label: "Focus",
        isRequired: true,
        scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
        recommendations: RAW_BANDS,
        futureField: { keep: true },
      },
    ];
    /** The hydrated draft carries the raw bands (hydrateQuestionsFromJson). */
    const hydratedDraft = () =>
      makeDraft({
        stableKey: "S1_focus",
        label: "Focus (edited)",
        findingBands: RAW_BANDS.map((b) => ({ ...b })),
      });

    it("preserves recommendations[] (via hydrated draft) and unknown future fields (via spread) on a slider row", () => {
      const { payload } = buildQuestionsPayload(
        [hydratedDraft()],
        baseOpts({ rawQuestions: raw }),
      );
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect(row.recommendations).toEqual(RAW_BANDS);
      expect(row.futureField).toEqual({ keep: true });
      expect(row.label).toBe("Focus (edited)");
    });

    it("preserves the raw row's key ORDER (spread raw first)", () => {
      const { payload } = buildQuestionsPayload(
        [hydratedDraft()],
        baseOpts({ rawQuestions: raw }),
      );
      const row = (payload as Array<Record<string, unknown>>)[0];
      const rawKeys = Object.keys(raw[0]);
      expect(Object.keys(row).slice(0, rawKeys.length)).toEqual(rawKeys);
    });

    it("Wave U anti-resurrection: a rule deleted in the panel stays deleted on a dirty save", () => {
      // Same raw row, but the draft's bands were emptied in the panel.
      const { payload } = buildQuestionsPayload(
        [makeDraft({ stableKey: "S1_focus", findingBands: [] })],
        baseOpts({ rawQuestions: raw }),
      );
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect("recommendations" in row).toBe(false);
      // The truly-unknown field still survives.
      expect(row.futureField).toEqual({ keep: true });
    });
  });

  describe("guards", () => {
    it("throws DUPLICATE_STABLE_KEY on duplicate final keys", () => {
      const raw = [{ stableKey: "S1_focus", type: "SLIDER_LIKERT" }];
      const drafts = [
        makeDraft({ uid: "u-a", stableKey: "S1_focus" }),
        makeDraft({ uid: "u-b", stableKey: "S1_focus" }),
      ];
      expectThrowWithCode(
        () => buildQuestionsPayload(drafts, baseOpts({ rawQuestions: raw })),
        "DUPLICATE_STABLE_KEY",
        "S1_focus",
      );
    });

    it("throws INHERITED_KEY_MUTATED when an inherited row's key is not among the raw questions", () => {
      const raw = [{ stableKey: "S1_focus", type: "SLIDER_LIKERT" }];
      const draft = makeDraft({ stableKey: "S1_focus_RENAMED", isInherited: true });
      expectThrowWithCode(
        () => buildQuestionsPayload([draft], baseOpts({ rawQuestions: raw })),
        "INHERITED_KEY_MUTATED",
        "S1_focus_RENAMED",
      );
    });

    it("throws INHERITED_TYPE_MUTATED when an inherited row's type differs from its raw row", () => {
      const raw = [{ stableKey: "S1_focus", type: "SLIDER_LIKERT" }];
      const draft = makeDraft({ stableKey: "S1_focus", type: "TEXT", isInherited: true });
      expectThrowWithCode(
        () => buildQuestionsPayload([draft], baseOpts({ rawQuestions: raw })),
        "INHERITED_TYPE_MUTATED",
        "S1_focus",
      );
    });

    it("throws INHERITED_OPTION_KEY_MUTATED when a not-new option's key is absent from the raw row's options", () => {
      const raw = [
        {
          stableKey: "S4_obstacles",
          type: "MULTI_CHOICE",
          label: "Obstacles",
          options: [{ key: "time", label: "Time" }],
        },
      ];
      const draft = makeDraft({
        stableKey: "S4_obstacles",
        type: "MULTI_CHOICE",
        options: [{ key: "time_RENAMED", label: "Time", isNew: false }],
      });
      expectThrowWithCode(
        () => buildQuestionsPayload([draft], baseOpts({ rawQuestions: raw })),
        "INHERITED_OPTION_KEY_MUTATED",
        "S4_obstacles",
      );
    });

    it("allows removing an inherited option (D9 warn-not-lock — remaining keys still valid)", () => {
      const raw = [
        {
          stableKey: "S4_obstacles",
          type: "MULTI_CHOICE",
          label: "Obstacles",
          options: [
            { key: "time", label: "Time" },
            { key: "money", label: "Money" },
          ],
        },
      ];
      const draft = makeDraft({
        stableKey: "S4_obstacles",
        type: "MULTI_CHOICE",
        options: [{ key: "time", label: "Time", isNew: false }],
      });
      const { payload } = buildQuestionsPayload(
        [draft],
        baseOpts({ rawQuestions: raw }),
      );
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect(row.options).toEqual([{ key: "time", label: "Time" }]);
    });

    it("throws MULTI_CHOICE_NO_OPTIONS for a MULTI_CHOICE with zero options", () => {
      const draft = makeDraft({
        stableKey: "",
        label: "Pick some",
        type: "MULTI_CHOICE",
        isInherited: false,
        isNewToDraft: true,
        sectionStableKey: "S4_obstacles",
        options: [],
      });
      expectThrowWithCode(
        () => buildQuestionsPayload([draft], baseOpts()),
        "MULTI_CHOICE_NO_OPTIONS",
      );
    });

    it("throws MAX_CHOICES_EXCEEDS_OPTIONS when maxChoices > option count", () => {
      const draft = makeDraft({
        stableKey: "",
        label: "Pick some",
        type: "MULTI_CHOICE",
        isInherited: false,
        isNewToDraft: true,
        sectionStableKey: "S4_obstacles",
        maxChoices: 3,
        options: [
          { key: "", label: "A", isNew: true },
          { key: "", label: "B", isNew: true },
        ],
      });
      expectThrowWithCode(
        () => buildQuestionsPayload([draft], baseOpts()),
        "MAX_CHOICES_EXCEEDS_OPTIONS",
      );
    });

    it("throws MAX_CHOICES_EXCEEDS_OPTIONS when maxChoices < 1", () => {
      const draft = makeDraft({
        stableKey: "",
        label: "Pick some",
        type: "MULTI_CHOICE",
        isInherited: false,
        isNewToDraft: true,
        sectionStableKey: "S4_obstacles",
        maxChoices: 0,
        options: [{ key: "", label: "A", isNew: true }],
      });
      expectThrowWithCode(
        () => buildQuestionsPayload([draft], baseOpts()),
        "MAX_CHOICES_EXCEEDS_OPTIONS",
      );
    });

    it("accepts maxChoices exactly equal to the option count", () => {
      const draft = makeDraft({
        stableKey: "",
        label: "Pick some",
        type: "MULTI_CHOICE",
        isInherited: false,
        isNewToDraft: true,
        sectionStableKey: "S4_obstacles",
        maxChoices: 2,
        options: [
          { key: "", label: "A", isNew: true },
          { key: "", label: "B", isNew: true },
        ],
      });
      const { payload } = buildQuestionsPayload([draft], baseOpts());
      const row = (payload as Array<Record<string, unknown>>)[0];
      expect(row.maxChoices).toBe(2);
    });
  });

  describe("mixed-type end-to-end shape", () => {
    it("serializes a mixed slider + TEXT + MULTI_CHOICE draft set in one pass", () => {
      const raw = [
        {
          stableKey: "S1_focus",
          type: "SLIDER_LIKERT",
          label: "Focus",
          scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
      ];
      const drafts = [
        makeDraft({ uid: "u-1", stableKey: "S1_focus" }),
        makeDraft({
          uid: "u-2",
          stableKey: "",
          label: "Biggest win",
          type: "TEXT",
          sectionStableKey: "P1_retrospective",
          isInherited: false,
          isNewToDraft: true,
          sortOrder: 2,
        }),
        makeDraft({
          uid: "u-3",
          stableKey: "",
          label: "Obstacles",
          type: "MULTI_CHOICE",
          sectionStableKey: "S4_obstacles",
          isInherited: false,
          isNewToDraft: true,
          sortOrder: 3,
          maxChoices: 1,
          options: [
            { key: "", label: "Time", isNew: true },
            { key: "", label: "Money", isNew: true },
          ],
        }),
      ];
      const { payload, assignedKeys } = buildQuestionsPayload(
        drafts,
        baseOpts({ rawQuestions: raw }),
      );
      const rows = payload as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(3);
      expect(assignedKeys.get("u-2")).toBe("P1_biggest_win");
      expect(assignedKeys.get("u-3")).toBe("S4_obstacles"); // prefix "S4" + slug "obstacles", no collision
      expect("scale" in rows[0]).toBe(true);
      expect("scale" in rows[1]).toBe(false);
      expect("scale" in rows[2]).toBe(false);
      expect(rows[2].options).toEqual([
        { key: "time", label: "Time" },
        { key: "money", label: "Money" },
      ]);
      expect(rows[2].maxChoices).toBe(1);
    });
  });
});
