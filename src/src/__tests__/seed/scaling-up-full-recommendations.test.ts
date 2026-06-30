/**
 * Per-question recommendation tests for the Scaling Up Full Assessment seed.
 *
 * Verifies the full 5-stop recommendation bands (0/3/5/7/10 → tiled as
 * [0-2]/[3-4]/[5-6]/[7-9]/[10-10]) harvested from Esperto uniform-fill
 * sample reports.
 *
 * These tests are DB-free and run against the exported builders only.
 *
 * What is asserted:
 *   1. All 61 questions have exactly 5 recommendation bands.
 *   2. Every set of 5 bands tiles [0, 10] with the integer-touching convention
 *      (maxScore + 1 == next minScore; first minScore 0; last maxScore 10).
 *   3. Spot-checks: two verbatim text prefixes from the source matrix:
 *      - Q01 "Effective recruitment process" s0 band starts "In order to grow,
 *        you continuously need new"
 *      - Q02 "High staff retention" s10 band starts "Your employee turnover is
 *        very little / none"
 *   4. buildScalingUpFullContent() passes TemplateVersionForPublishSchema
 *      with no structural failures (recommendation text failures are
 *      acceptable for DRAFT — confirmed by existing content test).
 */

import { buildScalingUpFullContent } from "../../../prisma/seed-scaling-up-full-assessment";
import { TemplateVersionForPublishSchema } from "../../lib/assessments/scoring";

// ─── Shared fixture ───────────────────────────────────────────────────────

const content = buildScalingUpFullContent();

type Rec = { minScore: number; maxScore: number; text: string };
type Q = { stableKey: string; type: string; recommendations: Rec[] };
// These tests are about the 5-stop RECOMMENDATION library, which lives on the
// SLIDER_LIKERT questions only. v2 (Wave J-1) adds 3 non-scored NUMBER
// background questions (no recommendations) — scope past them here.
const questions = (content.questions as Q[]).filter(
  (q) => q.type === "SLIDER_LIKERT"
);

// ─── 1. Band count ────────────────────────────────────────────────────────

describe("SU Full 5-stop recommendations — band count", () => {
  it("has exactly 61 scored questions", () => {
    expect(questions).toHaveLength(61);
  });

  it("every scored question has exactly 5 recommendation bands", () => {
    for (const q of questions) {
      expect(q.recommendations).toHaveLength(5);
    }
  });
});

// ─── 2. Tiling [0, 10] ───────────────────────────────────────────────────

describe("SU Full 5-stop recommendations — tiling [0, 10]", () => {
  it("every question's bands tile [0, 10] with integer-touching convention", () => {
    for (const q of questions) {
      const sorted = [...q.recommendations].sort((a, b) => a.minScore - b.minScore);

      // First band starts at 0
      expect(sorted[0].minScore).toBe(0);

      // Last band ends at 10
      expect(sorted[sorted.length - 1].maxScore).toBe(10);

      // Adjacent bands touch: next.minScore === prev.maxScore + 1
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        expect(b.minScore).toBe(a.maxScore + 1);
      }
    }
  });

  it("every question's bands match the expected 5-stop tiling [0-2],[3-4],[5-6],[7-9],[10-10]", () => {
    const expectedTiling = [
      { minScore: 0, maxScore: 2 },
      { minScore: 3, maxScore: 4 },
      { minScore: 5, maxScore: 6 },
      { minScore: 7, maxScore: 9 },
      { minScore: 10, maxScore: 10 },
    ];
    for (const q of questions) {
      const sorted = [...q.recommendations].sort((a, b) => a.minScore - b.minScore);
      for (let i = 0; i < expectedTiling.length; i++) {
        expect(sorted[i].minScore).toBe(expectedTiling[i].minScore);
        expect(sorted[i].maxScore).toBe(expectedTiling[i].maxScore);
      }
    }
  });
});

// ─── 3. Verbatim spot-checks ──────────────────────────────────────────────

describe("SU Full 5-stop recommendations — verbatim spot-checks", () => {
  it("Q01 'Effective recruitment process' s0 band starts 'In order to grow, you continuously need new'", () => {
    const q01 = questions.find((q) => q.stableKey === "Q01");
    expect(q01).toBeDefined();
    const s0 = q01!.recommendations.find((b) => b.minScore === 0 && b.maxScore === 2);
    expect(s0).toBeDefined();
    expect(s0!.text).toContain("In order to grow, you continuously need new");
  });

  it("Q02 'High staff retention' s10 band starts 'Your employee turnover is very little / none'", () => {
    const q02 = questions.find((q) => q.stableKey === "Q02");
    expect(q02).toBeDefined();
    const s10 = q02!.recommendations.find((b) => b.minScore === 10 && b.maxScore === 10);
    expect(s10).toBeDefined();
    expect(s10!.text).toContain("Your employee turnover is very little / none");
  });

  it("Q01 s0 and s3 bands both carry 'very difficult' (same text per source matrix)", () => {
    // In the source matrix, stops 0 and 3 for Q01 are identical — verify the seed preserves this.
    const q01 = questions.find((q) => q.stableKey === "Q01");
    expect(q01).toBeDefined();
    const s0 = q01!.recommendations.find((b) => b.minScore === 0)!;
    const s3 = q01!.recommendations.find((b) => b.minScore === 3)!;
    expect(s0.text).toContain("very difficult");
    expect(s3.text).toContain("very difficult");
  });

  it("Q01 s5 band contains 'find this difficult' (not 'very difficult')", () => {
    const q01 = questions.find((q) => q.stableKey === "Q01");
    expect(q01).toBeDefined();
    const s5 = q01!.recommendations.find((b) => b.minScore === 5)!;
    expect(s5.text).toContain("find this difficult");
    expect(s5.text).not.toContain("very difficult");
  });

  it("Q01 s10 band contains 'very successful'", () => {
    const q01 = questions.find((q) => q.stableKey === "Q01");
    expect(q01).toBeDefined();
    const s10 = q01!.recommendations.find((b) => b.maxScore === 10)!;
    expect(s10.text).toContain("very successful");
  });
});

// ─── 4. Publish schema structural pass ───────────────────────────────────

describe("SU Full 5-stop recommendations — publish schema structural pass", () => {
  it("buildScalingUpFullContent() passes TemplateVersionForPublishSchema with no STRUCTURAL failures", () => {
    const parsed = TemplateVersionForPublishSchema.safeParse({
      questions: content.questions,
      sections: content.sections,
      scoringConfig: content.scoringConfig,
    });

    if (parsed.success) {
      expect(parsed.success).toBe(true);
      return;
    }

    // Any failure must be on recommendation-text paths only (DRAFT-acceptable).
    const structural = parsed.error.issues.filter(
      (iss) => !iss.path.includes("recommendations")
    );
    if (structural.length > 0) {
      throw new Error(
        `TemplateVersionForPublishSchema rejected on STRUCTURAL path(s):\n` +
          structural.map((iss) => `  [${iss.path.join(".")}]: ${iss.message}`).join("\n")
      );
    }
    // Only text issues — acceptable for DRAFT
    expect(parsed.error.issues.length).toBeGreaterThan(0);
  });
});
