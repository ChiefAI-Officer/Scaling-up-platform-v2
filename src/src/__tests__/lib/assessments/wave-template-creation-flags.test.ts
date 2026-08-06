import { isTemplateCreationSimplifiedEnabled } from "@/lib/assessments/wave-template-creation-flags";

const ENABLED = "WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED";
const KILL = "WAVE_TEMPLATE_CREATION_SIMPLIFIED_KILL";
const ED6 = "WAVE_ED6_SINGLE_COLUMN_ENABLED";
const ED9 = "WAVE_ED9_FORMS_BUILD_ENABLED";
const ED9_KILL = "WAVE_ED9_FORMS_BUILD_KILL";
const WAVE_T = "WAVE_T_QUESTION_EDITOR_ENABLED";
const WAVE_T_KILL = "WAVE_T_QUESTION_EDITOR_KILL";

describe("isTemplateCreationSimplifiedEnabled", () => {
  const saved: Record<string, string | undefined> = {};
  const keys = [ENABLED, KILL, ED6, ED9, ED9_KILL, WAVE_T, WAVE_T_KILL];

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("defaults off", () => {
    expect(isTemplateCreationSimplifiedEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("enables for %s", (value) => {
    process.env[ED6] = "1";
    process.env[ED9] = "1";
    process.env[WAVE_T] = "1";
    process.env[ENABLED] = value;
    expect(isTemplateCreationSimplifiedEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on"])(
    "stays off for %j",
    (value) => {
      process.env[ED6] = "1";
      process.env[ED9] = "1";
      process.env[WAVE_T] = "1";
      process.env[ENABLED] = value;
      expect(isTemplateCreationSimplifiedEnabled()).toBe(false);
    },
  );

  it("lets kill override enable", () => {
    process.env[ED6] = "1";
    process.env[ED9] = "1";
    process.env[WAVE_T] = "1";
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";
    expect(isTemplateCreationSimplifiedEnabled()).toBe(false);
  });

  it.each([ED6, ED9, WAVE_T])(
    "stays off when prerequisite %s is unavailable",
    (missing) => {
      process.env[ENABLED] = "1";
      process.env[ED6] = "1";
      process.env[ED9] = "1";
      process.env[WAVE_T] = "1";
      delete process.env[missing];
      expect(isTemplateCreationSimplifiedEnabled()).toBe(false);
    },
  );

  it.each([ED9_KILL, WAVE_T_KILL])(
    "stays off when prerequisite kill switch %s is enabled",
    (prerequisiteKill) => {
      process.env[ENABLED] = "1";
      process.env[ED6] = "1";
      process.env[ED9] = "1";
      process.env[WAVE_T] = "1";
      process.env[prerequisiteKill] = "1";
      expect(isTemplateCreationSimplifiedEnabled()).toBe(false);
    },
  );

  it("reads environment values at call time", () => {
    expect(isTemplateCreationSimplifiedEnabled()).toBe(false);
    process.env[ED6] = "1";
    process.env[ED9] = "1";
    process.env[WAVE_T] = "1";
    process.env[ENABLED] = "1";
    expect(isTemplateCreationSimplifiedEnabled()).toBe(true);
  });
});
