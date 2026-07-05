/**
 * Wave T — question-editor type-unlock flag (spec 19t T-1).
 *
 * KILL > ENABLED, call-time env reads, default OFF, no canary lever
 * (the editor is an admin/STAFF-only surface).
 */
import { isQuestionEditorUnlockEnabled } from "@/lib/assessments/wave-t-flags";

const ENABLED = "WAVE_T_QUESTION_EDITOR_ENABLED";
const KILL = "WAVE_T_QUESTION_EDITOR_KILL";

describe("isQuestionEditorUnlockEnabled", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [ENABLED, KILL]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of [ENABLED, KILL]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults OFF when nothing is set", () => {
    expect(isQuestionEditorUnlockEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("enables globally for %s", (v) => {
    process.env[ENABLED] = v;
    expect(isQuestionEditorUnlockEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on"])(
    "stays OFF for non-truthy value %j",
    (v) => {
      process.env[ENABLED] = v;
      expect(isQuestionEditorUnlockEnabled()).toBe(false);
    },
  );

  it("KILL overrides a global enable", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";
    expect(isQuestionEditorUnlockEnabled()).toBe(false);
  });

  it("KILL alone keeps it off (no double-negative)", () => {
    process.env[KILL] = "1";
    expect(isQuestionEditorUnlockEnabled()).toBe(false);
  });

  it("reads env at call time (flip without module reload)", () => {
    expect(isQuestionEditorUnlockEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isQuestionEditorUnlockEnabled()).toBe(true);
    delete process.env[ENABLED];
    expect(isQuestionEditorUnlockEnabled()).toBe(false);
  });
});
