/**
 * Wave J-1 — SU-Full growth-phase computation (pure-logic foundation).
 *
 * Tests the pure phase-band resolver + the verbatim in-survey phase narratives.
 *
 * Phase bands (driver = permanentFte + temporaryFte; freelance EXCLUDED):
 *   1–7    → Phase 1 "Pioneering"
 *   8–24   → Phase 2 "Organization"
 *   25–49  → Phase 3 "Management"
 *   50–149 → Phase 4 "Delegation"
 *   150+   → Phase 5 "Standardization"
 *   0 / negative / NaN → no phase (null)
 *
 * Esperto quirk: the P4 (Delegation) interstitial tile shares the IDENTICAL
 * body text as P3 (Management) — a genuine source artifact, replicated as-is.
 */

import {
  computeGrowthPhase,
  GROWTH_PHASE_BANDS,
  GROWTH_PHASE_NARRATIVES,
  type GrowthPhase,
} from "../../../lib/assessments/su-full-phase";

describe("computeGrowthPhase — band worked examples", () => {
  const cases: Array<[number, 1 | 2 | 3 | 4 | 5]> = [
    [3, 1],
    [7, 1],
    [8, 2],
    [15, 2],
    [24, 2],
    [25, 3],
    [40, 3],
    [49, 3],
    [50, 4],
    [100, 4],
    [149, 4],
    [150, 5],
    [200, 5],
  ];

  it.each(cases)(
    "permanent %i + temp 0 → Phase %i",
    (permanent, expectedPhase) => {
      const phase = computeGrowthPhase(permanent, 0);
      expect(phase).not.toBeNull();
      expect(phase!.number).toBe(expectedPhase);
    }
  );
});

describe("computeGrowthPhase — freelance exclusion / driver = perm + temp", () => {
  it("permanent 7 + temp 0 → Phase 1 (freelance is never an argument here)", () => {
    expect(computeGrowthPhase(7, 0)!.number).toBe(1);
  });

  it("permanent 7 + temp 1 → 8 combined → Phase 2", () => {
    expect(computeGrowthPhase(7, 1)!.number).toBe(2);
  });

  it("permanent 24 + temp 1 → 25 combined → Phase 3", () => {
    expect(computeGrowthPhase(24, 1)!.number).toBe(3);
  });

  it("permanent 49 + temp 100 → 149 combined → Phase 4", () => {
    expect(computeGrowthPhase(49, 100)!.number).toBe(4);
  });
});

describe("computeGrowthPhase — no-phase edges", () => {
  it("0 → null (no phase)", () => {
    expect(computeGrowthPhase(0, 0)).toBeNull();
  });

  it("negative → null", () => {
    expect(computeGrowthPhase(-5, 0)).toBeNull();
    expect(computeGrowthPhase(5, -10)).toBeNull();
  });

  it("NaN driver → null", () => {
    expect(computeGrowthPhase(NaN, 0)).toBeNull();
    expect(computeGrowthPhase(5, NaN)).toBeNull();
  });

  it("non-finite (Infinity) → null", () => {
    expect(computeGrowthPhase(Infinity, 0)).toBeNull();
  });
});

describe("GrowthPhase shape — number / name / heading", () => {
  const expected: Array<[number, number, string, string]> = [
    [3, 1, "Pioneering", "You've reached phase 1 - Pioneering phase"],
    [15, 2, "Organization", "You've reached phase 2 - Organization phase"],
    [40, 3, "Management", "You've reached phase 3 - Management phase"],
    [100, 4, "Delegation", "You've reached phase 4 - Delegation phase"],
    [200, 5, "Standardization", "You've reached phase 5 - Standardization phase"],
  ];

  it.each(expected)(
    "driver %i → number %i, name %s, heading %s",
    (driver, number, name, heading) => {
      const phase = computeGrowthPhase(driver, 0) as GrowthPhase;
      expect(phase.number).toBe(number);
      expect(phase.name).toBe(name);
      expect(phase.heading).toBe(heading);
      expect(typeof phase.narrative).toBe("string");
      expect(phase.narrative.length).toBeGreaterThan(0);
    }
  );
});

describe("Esperto quirk — P3 and P4 narratives are identical", () => {
  it("P3.narrative === P4.narrative (source artifact, replicated as-is)", () => {
    const p3 = computeGrowthPhase(40, 0) as GrowthPhase;
    const p4 = computeGrowthPhase(100, 0) as GrowthPhase;
    expect(p3.narrative).toBe(p4.narrative);
  });

  it("the shared P3/P4 body references the 'Growth gobbles up cash' paragraph", () => {
    const p3 = computeGrowthPhase(40, 0) as GrowthPhase;
    expect(p3.narrative).toContain("Growth gobbles up cash");
  });
});

describe("verbatim narrative anchors (source-faithful)", () => {
  it("P1 narrative is the Pioneering creativity/energy copy", () => {
    const p1 = computeGrowthPhase(3, 0) as GrowthPhase;
    expect(p1.narrative).toContain(
      "actively involved co-worker"
    );
    expect(p1.narrative).toContain("product, market and positioning strategy");
  });

  it("P2 narrative is the Organization management-processes copy", () => {
    const p2 = computeGrowthPhase(15, 0) as GrowthPhase;
    expect(p2.narrative).toContain("management processes require development");
    expect(p2.narrative).toContain("HR/Marketing/Sales/Operations");
  });

  it("P5 narrative is the Standardization bureaucracy copy", () => {
    const p5 = computeGrowthPhase(200, 0) as GrowthPhase;
    expect(p5.narrative).toContain("bureaucracy");
    expect(p5.narrative).toContain("managers must continually develop into leaders");
  });
});

describe("exported bands + narratives for UI consumption", () => {
  it("GROWTH_PHASE_BANDS covers all 5 phases in order", () => {
    expect(GROWTH_PHASE_BANDS).toHaveLength(5);
    expect(GROWTH_PHASE_BANDS.map((b) => b.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("GROWTH_PHASE_NARRATIVES has all 5 phases keyed 1..5 with heading/name/narrative", () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      const entry = GROWTH_PHASE_NARRATIVES[n];
      expect(entry).toBeDefined();
      expect(entry.number).toBe(n);
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.heading).toBe("string");
      expect(typeof entry.narrative).toBe("string");
      expect(entry.narrative.length).toBeGreaterThan(0);
    }
  });
});
