/**
 * Wave S — LVA peer-benchmarks flag (spec 19s S-2).
 *
 * KILL > ENABLED, call-time env reads, default OFF, no canary lever
 * (benchmarks are template-level platform config, not per-org content).
 */
import { isPeerBenchmarksEnabled } from "@/lib/assessments/wave-s-flags";

const ENABLED = "WAVE_S_PEER_BENCHMARKS_ENABLED";
const KILL = "WAVE_S_PEER_BENCHMARKS_KILL";

describe("isPeerBenchmarksEnabled", () => {
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
    expect(isPeerBenchmarksEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("enables globally for %s", (v) => {
    process.env[ENABLED] = v;
    expect(isPeerBenchmarksEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on"])(
    "stays OFF for non-truthy value %j",
    (v) => {
      process.env[ENABLED] = v;
      expect(isPeerBenchmarksEnabled()).toBe(false);
    },
  );

  it("KILL overrides a global enable", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";
    expect(isPeerBenchmarksEnabled()).toBe(false);
  });

  it("KILL alone keeps it off (no double-negative)", () => {
    process.env[KILL] = "1";
    expect(isPeerBenchmarksEnabled()).toBe(false);
  });

  it("reads env at call time (flip without module reload)", () => {
    expect(isPeerBenchmarksEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isPeerBenchmarksEnabled()).toBe(true);
    delete process.env[ENABLED];
    expect(isPeerBenchmarksEnabled()).toBe(false);
  });
});
