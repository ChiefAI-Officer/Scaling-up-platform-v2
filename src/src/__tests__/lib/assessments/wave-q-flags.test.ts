/**
 * Wave Q — admin & coach controls flag (spec 19q).
 *
 * KILL > ENABLED, call-time env reads, default OFF, no canary lever
 * (documented departure: admin-global controls).
 */
import { isWaveQAdminControlsEnabled } from "@/lib/assessments/wave-q-flags";

const ENABLED = "WAVE_Q_ADMIN_CONTROLS_ENABLED";
const KILL = "WAVE_Q_ADMIN_CONTROLS_KILL";

describe("isWaveQAdminControlsEnabled", () => {
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
    expect(isWaveQAdminControlsEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("enables globally for %s", (v) => {
    process.env[ENABLED] = v;
    expect(isWaveQAdminControlsEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on"])(
    "stays OFF for non-truthy value %j",
    (v) => {
      process.env[ENABLED] = v;
      expect(isWaveQAdminControlsEnabled()).toBe(false);
    },
  );

  it("KILL overrides a global enable", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";
    expect(isWaveQAdminControlsEnabled()).toBe(false);
  });

  it("KILL alone keeps it off (no double-negative)", () => {
    process.env[KILL] = "1";
    expect(isWaveQAdminControlsEnabled()).toBe(false);
  });

  it("reads env at call time (flip without module reload)", () => {
    expect(isWaveQAdminControlsEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isWaveQAdminControlsEnabled()).toBe(true);
    delete process.env[ENABLED];
    expect(isWaveQAdminControlsEnabled()).toBe(false);
  });
});
