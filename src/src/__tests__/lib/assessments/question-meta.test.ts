/**
 * Assessment v7.6 Wave E — shared question-meta builder tests (co-validate C-H1/C-M1).
 *
 * buildQuestionMetaByKey(version.questions) is the single source of truth for
 * the per-question metadata both report loaders consume. It must carry:
 *   - type + label (+ stripped section)
 *   - scale.min / scale.max (so 1–N ratings render correctly)
 *   - well-formed options ({key,label}[]) so MULTI_CHOICE keys resolve to labels
 * with the same first-wins dup-guard the loaders used to hand-roll.
 *
 * Fixtures inline — NO DB.
 */

import { buildQuestionMetaByKey } from "@/lib/assessments/question-meta";

describe("buildQuestionMetaByKey", () => {
  it("captures type + label + sectionStableKey", () => {
    const map = buildQuestionMetaByKey([
      { stableKey: "q1", label: "Question One", type: "TEXT", sectionStableKey: "s1" },
    ]);
    expect(map.q1).toEqual({
      type: "TEXT",
      label: "Question One",
      sectionStableKey: "s1",
    });
  });

  it("captures scale.min/scale.max for rating questions", () => {
    const map = buildQuestionMetaByKey([
      {
        stableKey: "q1",
        label: "Rate it",
        type: "SLIDER_LIKERT",
        sectionStableKey: "s1",
        scale: { min: 1, max: 3 },
      },
    ]);
    expect(map.q1.min).toBe(1);
    expect(map.q1.max).toBe(3);
  });

  it("captures well-formed {key,label} options for MULTI_CHOICE", () => {
    const map = buildQuestionMetaByKey([
      {
        stableKey: "obs",
        label: "Pick obstacles",
        type: "MULTI_CHOICE",
        sectionStableKey: "s4",
        options: [
          { key: "the_leadership", label: "The Leadership" },
          { key: "culture", label: "Culture" },
        ],
      },
    ]);
    expect(map.obs.options).toEqual([
      { key: "the_leadership", label: "The Leadership" },
      { key: "culture", label: "Culture" },
    ]);
  });

  it("drops malformed option entries (keeps only well-formed {key,label})", () => {
    const map = buildQuestionMetaByKey([
      {
        stableKey: "obs",
        label: "Pick obstacles",
        type: "MULTI_CHOICE",
        sectionStableKey: "s4",
        options: [
          { key: "culture", label: "Culture" },
          { key: 5, label: "bad-key-type" },
          { label: "no-key" },
          "not-an-object",
          null,
        ],
      },
    ]);
    expect(map.obs.options).toEqual([{ key: "culture", label: "Culture" }]);
  });

  it("omits the options key entirely when there are no well-formed options", () => {
    const map = buildQuestionMetaByKey([
      { stableKey: "q1", label: "Open", type: "TEXT", sectionStableKey: "s1" },
    ]);
    expect("options" in map.q1).toBe(false);
  });

  it("first-wins on a duplicate stableKey (warns once)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const map = buildQuestionMetaByKey([
      { stableKey: "q1", label: "First Label", type: "TEXT" },
      { stableKey: "q1", label: "Second Label", type: "TEXT" },
    ]);
    expect(map.q1.label).toBe("First Label");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("ignores rows that are not well-formed questions", () => {
    const map = buildQuestionMetaByKey([
      null,
      "garbage",
      { stableKey: "q1" }, // no label
      { label: "no stableKey" },
      { stableKey: "ok", label: "Real", type: "TEXT" },
    ]);
    expect(Object.keys(map)).toEqual(["ok"]);
  });

  it("returns an empty map for non-array input (guarded)", () => {
    expect(buildQuestionMetaByKey(null)).toEqual({});
    expect(buildQuestionMetaByKey("nope")).toEqual({});
    expect(buildQuestionMetaByKey(undefined)).toEqual({});
  });

  it("defaults type to UNKNOWN when missing", () => {
    const map = buildQuestionMetaByKey([{ stableKey: "q1", label: "X" }]);
    expect(map.q1.type).toBe("UNKNOWN");
  });
});
