/**
 * Wave U (spec 19u U-5) — findings-section-model tests.
 *
 * The pure builder for the qualitative report's consolidated findings
 * section, plus the total-tolerant parser for the frozen
 * `result.findings: ResolvedFinding[]` snapshot (ADR-0021).
 *
 * Pins:
 *  - parseResolvedFindings: absent/malformed → [] (reports must not 500 on
 *    bad frozen data — house rule since the Wave N hotfix), entry-level
 *    tolerance, questionLabel fallback.
 *  - buildFindingsSection: null when no findings; groups by sectionStableKey
 *    resolving section NAMES from the raw version sections; unknown/absent
 *    section → trailing unnamed group; suppression-agnostic (D21 — the
 *    builder never filters by REPORT_FILTERS suppression).
 */

import {
  parseResolvedFindings,
  buildFindingsSection,
  type ResolvedFinding,
} from "@/lib/assessments/findings-section-model";

const SECTIONS_RAW: unknown = [
  { stableKey: "S1_vision", name: "The vision on the future" },
  { stableKey: "S2_strengths", name: "Organizational strengths" },
  { stableKey: "S3_obstacles", name: "Obstacles and challenges" },
];

function finding(overrides: Partial<ResolvedFinding> = {}): ResolvedFinding {
  return {
    stableKey: "q1",
    questionType: "NUMBER",
    sectionStableKey: "S1_vision",
    questionLabel: "Revenue in 3 years",
    text: "Consider revisiting your revenue ambition.",
    ...overrides,
  };
}

// ── parseResolvedFindings ───────────────────────────────────────────────────

describe("parseResolvedFindings", () => {
  it("returns [] for absent / non-array / malformed roots", () => {
    for (const raw of [undefined, null, {}, "findings", 42, true]) {
      expect(parseResolvedFindings(raw)).toEqual([]);
    }
  });

  it("passes well-formed entries through, preserving order", () => {
    const a = finding({ stableKey: "a", text: "A" });
    const b = finding({
      stableKey: "b",
      questionType: "MULTI_CHOICE",
      text: "B",
      sectionStableKey: undefined,
    });
    const parsed = parseResolvedFindings([a, b]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ stableKey: "a", text: "A" });
    expect(parsed[1]).toMatchObject({
      stableKey: "b",
      questionType: "MULTI_CHOICE",
      text: "B",
    });
    expect(parsed[1].sectionStableKey).toBeUndefined();
  });

  it("skips malformed entries without throwing (entry-level tolerance)", () => {
    const parsed = parseResolvedFindings([
      null,
      "nope",
      42,
      {}, // nothing usable
      { stableKey: "no-text", questionType: "NUMBER", questionLabel: "L" },
      { text: "no stableKey", questionType: "NUMBER", questionLabel: "L" },
      { stableKey: "k", questionType: "NUMBER", text: "   " }, // blank text
      { stableKey: "k2", text: "ok but no type" }, // questionType missing
      finding({ stableKey: "good", text: "Good" }),
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].stableKey).toBe("good");
  });

  it("falls back questionLabel → stableKey and drops non-string sectionStableKey", () => {
    const parsed = parseResolvedFindings([
      {
        stableKey: "q9",
        questionType: "NUMBER",
        text: "T",
        questionLabel: 7,
        sectionStableKey: 3,
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].questionLabel).toBe("q9");
    expect(parsed[0].sectionStableKey).toBeUndefined();
  });
});

// ── buildFindingsSection ────────────────────────────────────────────────────

describe("buildFindingsSection", () => {
  it("returns null when there are no findings", () => {
    expect(buildFindingsSection([], SECTIONS_RAW)).toBeNull();
  });

  it("carries the scored-parity copy (eyebrow + title)", () => {
    const section = buildFindingsSection([finding()], SECTIONS_RAW);
    expect(section).not.toBeNull();
    expect(section!.eyebrow).toBe("What to work on next");
    expect(section!.title).toBe("Your recommendations");
  });

  it("groups by sectionStableKey, resolving names from the version sections", () => {
    const section = buildFindingsSection(
      [
        finding({ stableKey: "a", sectionStableKey: "S1_vision", text: "A" }),
        finding({ stableKey: "b", sectionStableKey: "S2_strengths", text: "B" }),
        finding({ stableKey: "c", sectionStableKey: "S1_vision", text: "C" }),
      ],
      SECTIONS_RAW,
    );
    expect(section!.groups).toEqual([
      {
        sectionName: "The vision on the future",
        items: [
          { stableKey: "a", text: "A" },
          { stableKey: "c", text: "C" },
        ],
      },
      {
        sectionName: "Organizational strengths",
        items: [{ stableKey: "b", text: "B" }],
      },
    ]);
  });

  it("puts findings with no / unknown section in a trailing unnamed group, even when they come first", () => {
    const section = buildFindingsSection(
      [
        finding({ stableKey: "orphan1", sectionStableKey: undefined, text: "O1" }),
        finding({ stableKey: "a", sectionStableKey: "S1_vision", text: "A" }),
        finding({ stableKey: "orphan2", sectionStableKey: "S9_ghost", text: "O2" }),
      ],
      SECTIONS_RAW,
    );
    expect(section!.groups).toHaveLength(2);
    expect(section!.groups[0]).toEqual({
      sectionName: "The vision on the future",
      items: [{ stableKey: "a", text: "A" }],
    });
    expect(section!.groups[1]).toEqual({
      sectionName: null,
      items: [
        { stableKey: "orphan1", text: "O1" },
        { stableKey: "orphan2", text: "O2" },
      ],
    });
  });

  it("one MC question firing multiple rules keeps every item, in order", () => {
    const section = buildFindingsSection(
      [
        finding({
          stableKey: "mc1",
          questionType: "MULTI_CHOICE",
          sectionStableKey: "S3_obstacles",
          text: "Cash finding",
        }),
        finding({
          stableKey: "mc1",
          questionType: "MULTI_CHOICE",
          sectionStableKey: "S3_obstacles",
          text: "People finding",
        }),
      ],
      SECTIONS_RAW,
    );
    expect(section!.groups).toEqual([
      {
        sectionName: "Obstacles and challenges",
        items: [
          { stableKey: "mc1", text: "Cash finding" },
          { stableKey: "mc1", text: "People finding" },
        ],
      },
    ]);
  });

  it("is suppression-agnostic (D21): a finding in ANY listed section resolves its name — no REPORT_FILTERS filtering", () => {
    // S3_strengths is the LVA section REPORT_FILTERS suppresses from the body;
    // the builder must not know or care.
    const section = buildFindingsSection(
      [finding({ stableKey: "s3q", sectionStableKey: "S3_strengths", text: "Still here" })],
      [{ stableKey: "S3_strengths", name: "Organizational strengths & weaknesses" }],
    );
    expect(section!.groups).toEqual([
      {
        sectionName: "Organizational strengths & weaknesses",
        items: [{ stableKey: "s3q", text: "Still here" }],
      },
    ]);
  });

  it("tolerates malformed sections JSON — everything lands in the unnamed group", () => {
    for (const sections of [undefined, null, "x", 42, {}, [null, "y", { name: "no-key" }]]) {
      const section = buildFindingsSection(
        [finding({ stableKey: "a", sectionStableKey: "S1_vision", text: "A" })],
        sections,
      );
      expect(section!.groups).toEqual([
        { sectionName: null, items: [{ stableKey: "a", text: "A" }] },
      ]);
    }
  });

  it("a section entry with a non-string name falls back to its stableKey", () => {
    const section = buildFindingsSection(
      [finding({ stableKey: "a", sectionStableKey: "S8", text: "A" })],
      [{ stableKey: "S8", name: 12 }],
    );
    expect(section!.groups).toEqual([
      { sectionName: "S8", items: [{ stableKey: "a", text: "A" }] },
    ]);
  });
});
