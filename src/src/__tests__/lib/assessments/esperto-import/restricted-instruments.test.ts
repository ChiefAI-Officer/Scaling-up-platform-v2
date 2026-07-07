/**
 * Wave X (spec 19x, X-1a) — restricted-import instrument registry.
 *
 * The registry is the adapter boundary (D2): batchKind selection, flag
 * gating, data-derived shape detection (D3), the `mat` schema-identity gate
 * (D8), completeness policy (D9), and externalId prefixes — per instrument.
 * SU-Full's entry must reproduce the Wave O constants byte-identically.
 */
import {
  RESTRICTED_INSTRUMENTS,
  getInstrumentByBatchKind,
  detectShapeMatches,
  completenessKeysFor,
  checkMatAllowed,
} from "@/lib/assessments/esperto-import/restricted-instruments";
import { buildLvaContent } from "../../../../../prisma/seed-lva-assessment";
import { buildRockefellerContent } from "../../../../../prisma/seed-rockefeller-assessment";
import { scalingUpFullCrosswalk } from "@/lib/assessments/esperto-import/crosswalks/scaling-up-full";

const WAVE_X_ENABLED = "WAVE_X_ESPERTO_LVA_ROCK_IMPORT_ENABLED";
const WAVE_O_ENABLED = "WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED";

function keysOf(instrumentKey: string): string[] {
  // Structural sample shapes (no data).
  if (instrumentKey === "rock40") {
    const keys: string[] = [];
    for (let s = 1; s <= 10; s++) for (let q = 1; q <= 4; q++) keys.push(`Q${s}_${q}`);
    return keys;
  }
  if (instrumentKey === "lva71") {
    const keys: string[] = ["Q1_1"];
    for (let i = 2; i <= 9; i++) keys.push(`Q1a_${i}`);
    for (let i = 8; i <= 15; i++) keys.push(`Q${i}`);
    keys.push("Q15A", "Q15B");
    for (let n = 1; n <= 16; n++) keys.push(`Q16_${n}`);
    keys.push("Q16a");
    for (let n = 1; n <= 16; n++) keys.push(`Q17_${n}`);
    for (let i = 18; i <= 34; i++) keys.push(`Q${i}`);
    keys.push("Q29a", "currency");
    return keys;
  }
  if (instrumentKey === "sufull") {
    return scalingUpFullCrosswalk.map.map((e) => e.espertoKey);
  }
  throw new Error("unknown shape");
}

describe("RESTRICTED_INSTRUMENTS registry", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of [WAVE_X_ENABLED, WAVE_O_ENABLED]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of [WAVE_X_ENABLED, WAVE_O_ENABLED]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("has exactly three instruments keyed by unique batchKinds", () => {
    expect(RESTRICTED_INSTRUMENTS.map((i) => i.batchKind).sort()).toEqual([
      "esperto-lva-restricted-v1",
      "esperto-rockhabits-restricted-v1",
      "esperto-sufull-restricted-v1",
    ]);
    expect(new Set(RESTRICTED_INSTRUMENTS.map((i) => i.instrumentKey)).size).toBe(3);
    expect(new Set(RESTRICTED_INSTRUMENTS.map((i) => i.externalIdPrefix)).size).toBe(3);
  });

  it("SU-Full entry reproduces the Wave O constants byte-identically", () => {
    const sufull = getInstrumentByBatchKind("esperto-sufull-restricted-v1")!;
    expect(sufull.templateAlias).toBe("scaling-up-full");
    expect(sufull.externalIdPrefix).toBe("esperto:sufull");
    expect(sufull.knownMats).toBeNull(); // Wave O launched without a mat gate
    expect(sufull.completeness).toBe("required-set");
  });

  it("getInstrumentByBatchKind returns null for unknown batchKinds", () => {
    expect(getInstrumentByBatchKind("esperto-nonsense-v1")).toBeNull();
    expect(getInstrumentByBatchKind("")).toBeNull();
  });

  it("flag separation: Wave X gates ONLY lva+rock; Wave O gates ONLY sufull", () => {
    const sufull = getInstrumentByBatchKind("esperto-sufull-restricted-v1")!;
    const lva = getInstrumentByBatchKind("esperto-lva-restricted-v1")!;
    const rock = getInstrumentByBatchKind("esperto-rockhabits-restricted-v1")!;

    // Nothing set → all off.
    expect(sufull.isEnabled()).toBe(false);
    expect(lva.isEnabled()).toBe(false);
    expect(rock.isEnabled()).toBe(false);

    process.env[WAVE_X_ENABLED] = "1";
    expect(lva.isEnabled()).toBe(true);
    expect(rock.isEnabled()).toBe(true);
    expect(sufull.isEnabled()).toBe(false); // Wave X never touches SU-Full

    delete process.env[WAVE_X_ENABLED];
    process.env[WAVE_O_ENABLED] = "1";
    expect(sufull.isEnabled()).toBe(true);
    expect(lva.isEnabled()).toBe(false); // Wave O never touches the new instruments
    expect(rock.isEnabled()).toBe(false);
  });
});

describe("detectShapeMatches (D3 — data-derived universes + distinctive anchors)", () => {
  const lva = () => getInstrumentByBatchKind("esperto-lva-restricted-v1")!;
  const rock = () => getInstrumentByBatchKind("esperto-rockhabits-restricted-v1")!;
  const sufull = () => getInstrumentByBatchKind("esperto-sufull-restricted-v1")!;

  it("each sample shape matches its own instrument", () => {
    expect(detectShapeMatches(lva(), keysOf("lva71")).ok).toBe(true);
    expect(detectShapeMatches(rock(), keysOf("rock40")).ok).toBe(true);
    expect(detectShapeMatches(sufull(), keysOf("sufull")).ok).toBe(true);
  });

  it("cross-instrument: every wrong pairing is rejected (the Q-code overlap hazard)", () => {
    const shapes = { lva: keysOf("lva71"), rock: keysOf("rock40"), sufull: keysOf("sufull") };
    const instruments = { lva: lva(), rock: rock(), sufull: sufull() };
    for (const [shapeName, keys] of Object.entries(shapes)) {
      for (const [instName, inst] of Object.entries(instruments)) {
        const result = detectShapeMatches(inst, keys);
        expect(result.ok).toBe(shapeName === instName);
      }
    }
  });

  it("a sparse Rockefeller export (JSON omits empties) still matches Rockefeller — subset rule", () => {
    const sparse = keysOf("rock40").slice(0, 30); // includes Q1_*/Q2_* anchors
    expect(detectShapeMatches(rock(), sparse).ok).toBe(true);
  });

  it("the ambiguous 32-key middle block (Q3_1..Q10_4, shared Rock∩SU-Full) matches NOTHING", () => {
    const ambiguous = keysOf("rock40").filter((k) => !/^Q[12]_/.test(k)); // 32 keys
    expect(ambiguous).toHaveLength(32);
    expect(detectShapeMatches(rock(), ambiguous).ok).toBe(false);
    expect(detectShapeMatches(sufull(), ambiguous).ok).toBe(false);
    expect(detectShapeMatches(lva(), ambiguous).ok).toBe(false);
  });

  it("rejects an empty key set and reports a reason string on failure", () => {
    const r = detectShapeMatches(lva(), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.reason).toBe("string");
    const wrong = detectShapeMatches(lva(), keysOf("rock40"));
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toBeTruthy();
  });
});

describe("completenessKeysFor (D9 — per-instrument policy)", () => {
  it("required-set (SU-Full/Rockefeller): the isRequired-filtered keys", () => {
    const rock = getInstrumentByBatchKind("esperto-rockhabits-restricted-v1")!;
    const content = buildRockefellerContent();
    const qs = content.questions.map((q) => ({
      stableKey: q.stableKey,
      isRequired: q.isRequired,
      type: q.type,
    }));
    expect(completenessKeysFor(rock, qs)).toHaveLength(40); // all 40 required
  });

  it("slider-core-set (LVA): exactly the 16 S3 sliders — required TEXTs do NOT gate", () => {
    const lva = getInstrumentByBatchKind("esperto-lva-restricted-v1")!;
    const content = buildLvaContent();
    const qs = content.questions.map((q) => ({
      stableKey: q.stableKey,
      isRequired: (q as { isRequired: boolean }).isRequired,
      type: q.type,
    }));
    const keys = completenessKeysFor(lva, qs);
    expect(keys).toHaveLength(16);
    for (const k of keys) expect(k.startsWith("S3_")).toBe(true);
    // The required S2/S6 TEXTs exist but must not be in the core set.
    expect(qs.filter((q) => q.isRequired && q.type === "TEXT").length).toBeGreaterThan(0);
  });
});

describe("checkMatAllowed (D8 — verified-against-only membership)", () => {
  const base = getInstrumentByBatchKind("esperto-lva-restricted-v1")!;

  it("null knownMats = no gate (always allowed)", () => {
    expect(checkMatAllowed({ ...base, knownMats: null }, "anything").ok).toBe(true);
    expect(checkMatAllowed({ ...base, knownMats: null }, undefined).ok).toBe(true);
  });

  it("with a knownMats list: member passes, unknown/absent mat rejects with a reason", () => {
    const gated = { ...base, knownMats: ["AbOTKKmwk2"] as const };
    expect(checkMatAllowed(gated, "AbOTKKmwk2").ok).toBe(true);
    const unknown = checkMatAllowed(gated, "ZZunverified");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toMatch(/unverified/i);
    expect(checkMatAllowed(gated, undefined).ok).toBe(false);
  });
});
