/**
 * Wave X (spec 19x, X-2) — LVA + Rockefeller historical-import flag.
 *
 * Mirrors the Wave O three-lever pattern: KILL > ENABLED > CANARY, call-time
 * env reads, default-OFF. Gates ONLY the new instruments' registry entries —
 * SU-Full stays on the Wave O flag (asserted in the registry tests).
 */
import { isEspertoLvaRockImportEnabled } from "@/lib/assessments/wave-x-flags";

const KILL = "WAVE_X_ESPERTO_LVA_ROCK_IMPORT_KILL";
const ENABLED = "WAVE_X_ESPERTO_LVA_ROCK_IMPORT_ENABLED";
const CANARY = "WAVE_X_ESPERTO_LVA_ROCK_IMPORT_CANARY";

describe("isEspertoLvaRockImportEnabled", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of [KILL, ENABLED, CANARY]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of [KILL, ENABLED, CANARY]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("is default-OFF when nothing is set", () => {
    expect(isEspertoLvaRockImportEnabled()).toBe(false);
    expect(isEspertoLvaRockImportEnabled({ organizationId: "org1" })).toBe(false);
  });

  it("ENABLED=1 turns it on globally", () => {
    process.env[ENABLED] = "1";
    expect(isEspertoLvaRockImportEnabled()).toBe(true);
  });

  it("KILL overrides ENABLED and CANARY", () => {
    process.env[ENABLED] = "1";
    process.env[CANARY] = "org1";
    process.env[KILL] = "1";
    expect(isEspertoLvaRockImportEnabled({ organizationId: "org1" })).toBe(false);
  });

  it("CANARY matches exact organizationId or templateId from a comma/space list", () => {
    process.env[CANARY] = "orgA, tplB";
    expect(isEspertoLvaRockImportEnabled({ organizationId: "orgA" })).toBe(true);
    expect(isEspertoLvaRockImportEnabled({ templateId: "tplB" })).toBe(true);
    expect(isEspertoLvaRockImportEnabled({ organizationId: "orgC" })).toBe(false);
    expect(isEspertoLvaRockImportEnabled()).toBe(false);
  });

  it("treats '0'/'false'/'' as off (Wave N truthiness convention)", () => {
    for (const v of ["0", "false", ""]) {
      process.env[ENABLED] = v;
      expect(isEspertoLvaRockImportEnabled()).toBe(false);
    }
  });

  it("reads env at call time (no caching)", () => {
    expect(isEspertoLvaRockImportEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isEspertoLvaRockImportEnabled()).toBe(true);
    delete process.env[ENABLED];
    expect(isEspertoLvaRockImportEnabled()).toBe(false);
  });
});
