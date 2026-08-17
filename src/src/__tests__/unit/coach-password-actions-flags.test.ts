import { isCoachPasswordActionsEnabled } from "@/lib/auth/coach-password-actions-flags";

const ENABLED = "WAVE_COACH_PASSWORD_ACTIONS_ENABLED";
const KILL = "WAVE_COACH_PASSWORD_ACTIONS_KILL";

describe("isCoachPasswordActionsEnabled", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [ENABLED, KILL]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of [ENABLED, KILL]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("defaults OFF", () => {
    expect(isCoachPasswordActionsEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("enables for %s", (value) => {
    process.env[ENABLED] = value;
    expect(isCoachPasswordActionsEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on"])(
    "stays OFF for %j",
    (value) => {
      process.env[ENABLED] = value;
      expect(isCoachPasswordActionsEnabled()).toBe(false);
    },
  );

  it("lets the kill switch override enablement", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";
    expect(isCoachPasswordActionsEnabled()).toBe(false);
  });

  it("reads environment values at call time", () => {
    expect(isCoachPasswordActionsEnabled()).toBe(false);
    process.env[ENABLED] = "true";
    expect(isCoachPasswordActionsEnabled()).toBe(true);
  });
});
