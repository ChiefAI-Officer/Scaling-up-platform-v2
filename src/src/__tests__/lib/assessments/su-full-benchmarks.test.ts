/**
 * Task 4 (J-2): Static Peers benchmark — values, null-for-non-SU-Full,
 * seed-integrity, and snapshot value-lock.
 */
import {
  benchmarksFor,
  SU_FULL_BENCHMARKS_VERSION,
  SU_FULL_BENCHMARK_KEYS,
} from "@/lib/assessments/su-full-benchmarks";
import { buildScalingUpFullContent } from "../../../../prisma/seed-scaling-up-full-assessment";

// ── 1. Values ───────────────────────────────────────────────────────────────

describe("su-full-benchmarks values", () => {
  it("domain.people is 6.1, section.S_PEOPLE_YE is 5.9, scaleUp is 53.1", () => {
    const b = benchmarksFor("scaling-up-full")!;
    expect(b.domain.people).toBe(6.1);
    expect(b.section.S_PEOPLE_YE).toBe(5.9);
    expect(b.scaleUp).toBe(53.1);
  });

  it("SU_FULL_BENCHMARKS_VERSION matches YYYY-MM-DD prefix", () => {
    expect(SU_FULL_BENCHMARKS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

// ── 2. Null for non-SU-Full aliases ─────────────────────────────────────────

describe("su-full-benchmarks null for non-SU-Full", () => {
  it("returns null for leadership-vision-alignment", () => {
    expect(benchmarksFor("leadership-vision-alignment")).toBeNull();
  });

  it("returns null for null", () => {
    expect(benchmarksFor(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(benchmarksFor(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(benchmarksFor("")).toBeNull();
  });
});

// ── 3. Integrity vs. the real seed (R1-M1) ──────────────────────────────────
//
// This test imports buildScalingUpFullContent() from the actual seed and
// compares domain keys + section stableKeys to the benchmark's key sets.
// It will fail if keys are added/removed from the seed without updating the
// benchmark, and vice-versa. It does NOT compare a hand-copied list to itself.

describe("su-full-benchmarks key integrity vs seed", () => {
  const content = buildScalingUpFullContent();

  // SeedContent types sections/scoringConfig as unknown; narrow them locally
  // to read the real seed's keys (same pattern as the seed integration tests).
  const seedDomains = (
    content.scoringConfig as { domains: Array<{ key: string }> }
  ).domains
    .map((d) => d.key)
    .sort();
  const seedSections = (content.sections as Array<{ stableKey: string }>)
    .map((s) => s.stableKey)
    .sort();

  it("benchmark domain keys exactly match seed scoringConfig.domains", () => {
    const benchmarkDomains = [...SU_FULL_BENCHMARK_KEYS.domains].sort();
    expect(benchmarkDomains).toEqual(seedDomains);
  });

  it("benchmark section keys exactly match seed section stableKeys", () => {
    const benchmarkSections = [...SU_FULL_BENCHMARK_KEYS.sections].sort();
    expect(benchmarkSections).toEqual(seedSections);
  });

  it("domain record keys exactly match seed scoringConfig.domains (no missing, no extra)", () => {
    const b = benchmarksFor("scaling-up-full")!;
    expect(Object.keys(b.domain).sort()).toEqual(seedDomains);
  });

  it("section record keys exactly match seed section stableKeys (no missing, no extra)", () => {
    const b = benchmarksFor("scaling-up-full")!;
    expect(Object.keys(b.section).sort()).toEqual(seedSections);
  });

  it("all domain values are in range [0, 10]", () => {
    const b = benchmarksFor("scaling-up-full")!;
    for (const value of Object.values(b.domain)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(10);
      expect(typeof value).toBe("number");
    }
  });

  it("all section values are in range [0, 10]", () => {
    const b = benchmarksFor("scaling-up-full")!;
    for (const value of Object.values(b.section)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(10);
      expect(typeof value).toBe("number");
    }
  });

  it("scaleUp is in range [0, 100]", () => {
    const b = benchmarksFor("scaling-up-full")!;
    expect(b.scaleUp).toBeGreaterThanOrEqual(0);
    expect(b.scaleUp).toBeLessThanOrEqual(100);
  });
});

// ── 4. Value-lock snapshot (R2-L1) ──────────────────────────────────────────
//
// A quiet edit to a benchmark value without bumping SU_FULL_BENCHMARKS_VERSION
// will fail this snapshot. Commit the snapshot on first run.

describe("su-full-benchmarks value-lock", () => {
  it("benchmark values are version-locked (bump SU_FULL_BENCHMARKS_VERSION on any value change)", () => {
    expect({
      v: SU_FULL_BENCHMARKS_VERSION,
      b: benchmarksFor("scaling-up-full"),
    }).toMatchSnapshot();
  });
});
