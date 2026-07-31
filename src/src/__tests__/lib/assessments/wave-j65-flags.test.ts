import { isStableInvitationLinksEnabled } from "@/lib/assessments/wave-j65-flags";

const FLAG_KEYS = [
  "WAVE_J65_STABLE_LINKS_ENABLED",
  "WAVE_J65_STABLE_LINKS_CANARY",
  "WAVE_J65_STABLE_LINKS_KILL",
] as const;

const originalFlags = Object.fromEntries(
  FLAG_KEYS.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  for (const key of FLAG_KEYS) delete process.env[key];
});

afterAll(() => {
  for (const key of FLAG_KEYS) {
    const value = originalFlags[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("isStableInvitationLinksEnabled", () => {
  it.each([
    [{}, undefined, false],
    [{ WAVE_J65_STABLE_LINKS_ENABLED: "1" }, undefined, true],
    [{ WAVE_J65_STABLE_LINKS_CANARY: "alpha,beta" }, "beta", true],
    [{ WAVE_J65_STABLE_LINKS_CANARY: "alpha,beta" }, "gamma", false],
    [
      {
        WAVE_J65_STABLE_LINKS_ENABLED: "1",
        WAVE_J65_STABLE_LINKS_KILL: "1",
      },
      "alpha",
      false,
    ],
    [
      {
        WAVE_J65_STABLE_LINKS_CANARY: "alpha,beta",
        WAVE_J65_STABLE_LINKS_KILL: "1",
      },
      "beta",
      false,
    ],
  ])(
    "applies kill, global, and exact-alias precedence",
    (env, alias, expected) => {
      Object.assign(process.env, env);
      expect(isStableInvitationLinksEnabled(alias)).toBe(expected);
    },
  );

  it.each(["1", "true", "TRUE", "yes"])(
    "accepts %p as an explicit truthy global value",
    (value) => {
      process.env.WAVE_J65_STABLE_LINKS_ENABLED = value;
      expect(isStableInvitationLinksEnabled()).toBe(true);
    },
  );

  it.each([undefined, "", "0", "false"])(
    "treats %p as a falsey global value",
    (value) => {
      if (value === undefined) {
        delete process.env.WAVE_J65_STABLE_LINKS_ENABLED;
      } else {
        process.env.WAVE_J65_STABLE_LINKS_ENABLED = value;
      }
      expect(isStableInvitationLinksEnabled()).toBe(false);
    },
  );
});
