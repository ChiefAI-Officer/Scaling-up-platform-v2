/**
 * Wave ED8 — version-lifecycle flag (spec 19ak).
 *
 * KILL > ENABLED, call-time env reads, default OFF. The flag gates the
 * lifecycle WRITE endpoints + new UI only — archived-exclusion in read
 * paths is persisted admin intent and is never flag-gated.
 */
import { isVersionLifecycleEnabled } from "@/lib/assessments/wave-ed8-flags";

const ENABLED = "WAVE_ED8_VERSION_LIFECYCLE_ENABLED";
const KILL = "WAVE_ED8_VERSION_LIFECYCLE_KILL";

describe("isVersionLifecycleEnabled", () => {
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
    expect(isVersionLifecycleEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("enables globally for %s", (v) => {
    process.env[ENABLED] = v;
    expect(isVersionLifecycleEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on"])(
    "stays OFF for non-truthy value %j",
    (v) => {
      process.env[ENABLED] = v;
      expect(isVersionLifecycleEnabled()).toBe(false);
    },
  );

  it("KILL overrides a global enable", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";
    expect(isVersionLifecycleEnabled()).toBe(false);
  });

  it("KILL alone keeps it off (no double-negative)", () => {
    process.env[KILL] = "1";
    expect(isVersionLifecycleEnabled()).toBe(false);
  });

  it("reads env at call time (flip without module reload)", () => {
    expect(isVersionLifecycleEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isVersionLifecycleEnabled()).toBe(true);
    delete process.env[ENABLED];
    expect(isVersionLifecycleEnabled()).toBe(false);
  });
});
