/**
 * Wave ED10 (spec 19am-plan, Task 5) — preview version adapters.
 *
 * Two tolerant adapters that normalize the editor's two content sources onto
 * the survey pager shapes (`PagerSection[]` / `PagerQuestion[]`) so the shared
 * `assembleSurveyPages` + `SectionPager` render a preview identically to the
 * live survey:
 *
 *   - DRAFT adapter (live editor state): `SectionDraft` / `QuestionDraftRow`
 *     → pager. Mirrors `buildSectionsPayload` (section sortOrder = idx+1) and
 *     `buildQuestionsPayload` per-type emission (SLIDER→scale, MULTI_CHOICE→
 *     options+maxChoices, TEXT/NUMBER→neither) + the show-if / helpText rules,
 *     so a draft preview matches what a save would persist.
 *   - STORED-JSON adapter (Active published version): tolerant read of the
 *     stored `questions`/`sections` JSON (the /me route casts these straight
 *     through, so the stored shape IS the survey shape).
 */
import {
  draftSectionsToPager,
  draftQuestionsToPager,
  storedSectionsToPager,
  storedQuestionsToPager,
} from "@/components/admin/template-editor/preview-version-adapter";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";

// ── Fixtures ──────────────────────────────────────────────────────────────

function sectionDraft(over: Partial<SectionDraft> & { stableKey: string }): SectionDraft {
  return { uid: `u_${over.stableKey}`, name: over.stableKey, ...over };
}

function questionDraft(
  over: Partial<QuestionDraftRow> & { stableKey: string; type: string },
): QuestionDraftRow {
  return {
    uid: `u_${over.stableKey}`,
    sectionStableKey: "S1",
    label: over.stableKey,
    helpText: "",
    isRequired: false,
    sortOrder: 0,
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
    ...over,
  };
}

// ── DRAFT → pager: sections ───────────────────────────────────────────────

describe("draftSectionsToPager", () => {
  it("stamps sortOrder = idx + 1 (mirrors buildSectionsPayload positional stamp)", () => {
    const out = draftSectionsToPager([
      sectionDraft({ stableKey: "S_A", name: "Alpha" }),
      sectionDraft({ stableKey: "S_B", name: "Bravo" }),
    ]);
    expect(out).toEqual([
      { stableKey: "S_A", sortOrder: 1, name: "Alpha" },
      { stableKey: "S_B", sortOrder: 2, name: "Bravo" },
    ]);
  });

  it("maps optional fields when present and omits them when undefined", () => {
    const [withOpts, bare] = draftSectionsToPager([
      sectionDraft({
        stableKey: "S_A",
        name: "Alpha",
        description: "desc",
        partLabel: "Part 1",
        domain: "PEOPLE",
      }),
      sectionDraft({ stableKey: "S_B", name: "Bravo" }),
    ]);
    expect(withOpts).toEqual({
      stableKey: "S_A",
      sortOrder: 1,
      name: "Alpha",
      description: "desc",
      partLabel: "Part 1",
      domain: "PEOPLE",
    });
    expect(bare).not.toHaveProperty("description");
    expect(bare).not.toHaveProperty("partLabel");
    expect(bare).not.toHaveProperty("domain");
  });
});

// ── DRAFT → pager: questions ──────────────────────────────────────────────

describe("draftQuestionsToPager", () => {
  it("emits scale (from flat fields) for SLIDER_LIKERT and no options/maxChoices", () => {
    const [pager] = draftQuestionsToPager([
      questionDraft({
        stableKey: "s1_slide",
        type: "SLIDER_LIKERT",
        label: "How aligned?",
        isRequired: true,
        sortOrder: 5,
        scaleMin: 1,
        scaleMax: 5,
        scaleStep: 1,
        anchorMin: "Not at all",
        anchorMax: "Completely",
      }),
    ]);
    expect(pager).toEqual({
      stableKey: "s1_slide",
      sortOrder: 5,
      sectionStableKey: "S1",
      type: "SLIDER_LIKERT",
      label: "How aligned?",
      isRequired: true,
      scale: { min: 1, max: 5, step: 1, anchorMin: "Not at all", anchorMax: "Completely" },
    });
    expect(pager).not.toHaveProperty("options");
    expect(pager).not.toHaveProperty("maxChoices");
  });

  it("emits options + maxChoices for MULTI_CHOICE and no scale", () => {
    const [pager] = draftQuestionsToPager([
      questionDraft({
        stableKey: "s1_mc",
        type: "MULTI_CHOICE",
        label: "Pick",
        options: [
          { key: "a", label: "Option A", isNew: false },
          { key: "b", label: "Option B", isNew: true },
        ],
        maxChoices: 2,
      }),
    ]);
    expect(pager.options).toEqual([
      { key: "a", label: "Option A" },
      { key: "b", label: "Option B" },
    ]);
    expect(pager.maxChoices).toBe(2);
    expect(pager).not.toHaveProperty("scale");
  });

  it("omits maxChoices for MULTI_CHOICE when null", () => {
    const [pager] = draftQuestionsToPager([
      questionDraft({
        stableKey: "s1_mc",
        type: "MULTI_CHOICE",
        options: [{ key: "a", label: "A", isNew: false }],
        maxChoices: null,
      }),
    ]);
    expect(pager.options).toEqual([{ key: "a", label: "A" }]);
    expect(pager).not.toHaveProperty("maxChoices");
  });

  it("emits neither scale nor options for TEXT / NUMBER", () => {
    const [text, number] = draftQuestionsToPager([
      questionDraft({ stableKey: "s1_text", type: "TEXT" }),
      questionDraft({ stableKey: "s1_num", type: "NUMBER" }),
    ]);
    expect(text).not.toHaveProperty("scale");
    expect(text).not.toHaveProperty("options");
    expect(text).not.toHaveProperty("maxChoices");
    expect(number).not.toHaveProperty("scale");
    expect(number).not.toHaveProperty("options");
    expect(number).not.toHaveProperty("maxChoices");
  });

  it("emits helpText only when non-blank", () => {
    const [withHelp, blankHelp] = draftQuestionsToPager([
      questionDraft({ stableKey: "s1_a", type: "TEXT", helpText: "  Some hint " }),
      questionDraft({ stableKey: "s1_b", type: "TEXT", helpText: "   " }),
    ]);
    expect(withHelp.helpText).toBe("  Some hint ");
    expect(blankHelp).not.toHaveProperty("helpText");
  });

  it("emits a COMPLETE show-if rule and drops a half-picked / cleared one", () => {
    const [complete, halfPicked, cleared] = draftQuestionsToPager([
      questionDraft({
        stableKey: "s1_a",
        type: "TEXT",
        showIf: { questionKey: "gate", optionKey: "yes" },
      }),
      questionDraft({
        stableKey: "s1_b",
        type: "TEXT",
        showIf: { questionKey: "gate", optionKey: "" },
      }),
      questionDraft({ stableKey: "s1_c", type: "TEXT", showIf: null }),
    ]);
    expect(complete.showIf).toEqual({ questionKey: "gate", optionKey: "yes" });
    expect(halfPicked).not.toHaveProperty("showIf");
    expect(cleared).not.toHaveProperty("showIf");
  });

  it("passes sortOrder + sectionStableKey through", () => {
    const [pager] = draftQuestionsToPager([
      questionDraft({ stableKey: "s2_a", type: "TEXT", sectionStableKey: "S2", sortOrder: 42 }),
    ]);
    expect(pager.sortOrder).toBe(42);
    expect(pager.sectionStableKey).toBe("S2");
  });
});

// ── STORED JSON → pager: sections ─────────────────────────────────────────

describe("storedSectionsToPager", () => {
  it("reads sortOrder + optional fields from stored JSON", () => {
    const out = storedSectionsToPager([
      { stableKey: "S1", sortOrder: 2, name: "One", description: "d", partLabel: "P", domain: "PEOPLE" },
      { stableKey: "S2", sortOrder: 1, name: "Two" },
    ]);
    expect(out).toEqual([
      { stableKey: "S1", sortOrder: 2, name: "One", description: "d", partLabel: "P", domain: "PEOPLE" },
      { stableKey: "S2", sortOrder: 1, name: "Two" },
    ]);
  });

  it("defaults sortOrder to the array index and name to empty when missing", () => {
    const out = storedSectionsToPager([{ stableKey: "S1" }, { stableKey: "S2" }]);
    expect(out).toEqual([
      { stableKey: "S1", sortOrder: 0, name: "" },
      { stableKey: "S2", sortOrder: 1, name: "" },
    ]);
  });

  it("is tolerant of a non-array / null / garbage entries", () => {
    expect(storedSectionsToPager(null)).toEqual([]);
    expect(storedSectionsToPager(undefined)).toEqual([]);
    expect(storedSectionsToPager("nope")).toEqual([]);
    expect(storedSectionsToPager([null, 3, { stableKey: "S1", sortOrder: 0, name: "One" }])).toEqual([
      { stableKey: "S1", sortOrder: 0, name: "One" },
    ]);
  });
});

// ── STORED JSON → pager: questions ────────────────────────────────────────

describe("storedQuestionsToPager", () => {
  it("reads a full SLIDER_LIKERT question incl. scale", () => {
    const [pager] = storedQuestionsToPager([
      {
        stableKey: "q1",
        sortOrder: 3,
        sectionStableKey: "S1",
        type: "SLIDER_LIKERT",
        label: "Rate it",
        isRequired: true,
        helpText: "hint",
        scale: { min: 0, max: 10, step: 1, anchorMin: "Lo", anchorMax: "Hi" },
      },
    ]);
    expect(pager).toEqual({
      stableKey: "q1",
      sortOrder: 3,
      sectionStableKey: "S1",
      type: "SLIDER_LIKERT",
      label: "Rate it",
      isRequired: true,
      helpText: "hint",
      scale: { min: 0, max: 10, step: 1, anchorMin: "Lo", anchorMax: "Hi" },
    });
  });

  it("reads MULTI_CHOICE options + maxChoices + show-if", () => {
    const [pager] = storedQuestionsToPager([
      {
        stableKey: "q_mc",
        sortOrder: 1,
        sectionStableKey: "S1",
        type: "MULTI_CHOICE",
        label: "Pick",
        isRequired: false,
        options: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
        maxChoices: 1,
        showIf: { questionKey: "gate", optionKey: "yes" },
      },
    ]);
    expect(pager.options).toEqual([
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ]);
    expect(pager.maxChoices).toBe(1);
    expect(pager.showIf).toEqual({ questionKey: "gate", optionKey: "yes" });
  });

  it("defaults type=TEXT, isRequired=false, label='', sortOrder=idx when missing", () => {
    const out = storedQuestionsToPager([{ stableKey: "q1" }, { stableKey: "q2" }]);
    expect(out).toEqual([
      { stableKey: "q1", sortOrder: 0, type: "TEXT", label: "", isRequired: false },
      { stableKey: "q2", sortOrder: 1, type: "TEXT", label: "", isRequired: false },
    ]);
  });

  it("drops a malformed scale / show-if (tolerant) rather than throwing", () => {
    const [badScale, badShowIf] = storedQuestionsToPager([
      { stableKey: "q1", type: "SLIDER_LIKERT", scale: { min: 0 } }, // missing max/step
      { stableKey: "q2", type: "TEXT", showIf: { questionKey: "gate" } }, // missing optionKey
    ]);
    expect(badScale).not.toHaveProperty("scale");
    expect(badShowIf).not.toHaveProperty("showIf");
  });

  it("is tolerant of non-array / garbage input", () => {
    expect(storedQuestionsToPager(null)).toEqual([]);
    expect(storedQuestionsToPager([undefined, "x", 7])).toEqual([]);
  });
});
