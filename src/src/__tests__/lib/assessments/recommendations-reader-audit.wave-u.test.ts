/**
 * Wave U (spec 19u D20, co-validate C5 rider) — reader audit for
 * `question.recommendations`.
 *
 * D3 keeps ONE field whose item shape the question TYPE discriminates
 * (bands on SLIDER/NUMBER, option rules on MULTI_CHOICE). Codex's accepted
 * rider: every generic reader/writer of the field must be enumerated and
 * pinned so the MC option-rule shape can never silently corrupt a consumer
 * that assumed bands.
 *
 * ENUMERATION (grep -rln "recommendations" src/src src/prisma src/scripts,
 * non-test, 2026-07-05):
 *   1. lib/assessments/scoring.ts        — per-type schemas + runtime/publish
 *      checks + the resolver call. Pinned by scoring.wave-u.test.ts.
 *   2. lib/assessments/findings.ts       — the resolver itself (shape-aware
 *      per type). Pinned by findings.test.ts.
 *   3. lib/assessments/question-meta.ts  — builds QuestionMeta WITHOUT
 *      recommendations (deliberate strip; reports read the frozen snapshot,
 *      never the rules). Pinned HERE.
 *   4. components/admin/template-editor/question-serialization.ts — raw-spread
 *      passthrough (+ Wave U explicit per-type emission). Pinned by
 *      question-serialization.wave-u.test.ts.
 *   5. app/api/admin/assessment-templates/[id]/versions/[versionId]/route.ts
 *      — validates via QuestionSchema, persists the ORIGINAL payload.
 *      Pinned by template-version-patch.wave-t/.wave-u tests.
 *   6. components/assessments/BrandedReport.tsx — renders ScoreResult
 *      row.recommendation + the snapshot; NEVER reads question.recommendations
 *      directly (comments only). Pinned by branded-report tests.
 *   7. prisma/seed-scaling-up-full-assessment.ts — WRITES the 305 live
 *      slider bands; its integrity guard is slider-scoped. Pinned by the
 *      SU-Full regression pin in scoring.wave-u.test.ts.
 *   8. scripts/wave-u-preflight-scan.ts — read-only D19 scan (shape-aware).
 *
 * If a new reader appears, add it to this enumeration and pin it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildQuestionMetaByKey } from "@/lib/assessments/question-meta";

describe("question-meta strips recommendations for EVERY rule shape (reader #3)", () => {
  const questions = [
    {
      stableKey: "Q_SLIDER",
      label: "Slider",
      type: "SLIDER_LIKERT",
      scale: { min: 0, max: 10 },
      recommendations: [{ minScore: 0, maxScore: 10, text: "band" }],
    },
    {
      stableKey: "Q_NUMBER",
      label: "Number",
      type: "NUMBER",
      recommendations: [{ minScore: 0, maxScore: 9, text: "band" }],
    },
    {
      stableKey: "Q_MULTI",
      label: "Multi",
      type: "MULTI_CHOICE",
      options: [{ key: "cash", label: "Cash" }],
      recommendations: [{ optionKey: "cash", text: "rule" }],
    },
  ];

  it("no QuestionMeta entry carries a recommendations key (reports read the snapshot instead)", () => {
    const map = buildQuestionMetaByKey(questions);
    expect(Object.keys(map)).toEqual(["Q_SLIDER", "Q_NUMBER", "Q_MULTI"]);
    for (const meta of Object.values(map)) {
      expect(meta).not.toHaveProperty("recommendations");
    }
    // The MC option-rule shape does not disturb the meta the #136 fix relies on.
    expect(map.Q_MULTI.options).toEqual([{ key: "cash", label: "Cash" }]);
    expect(map.Q_SLIDER.min).toBe(0);
    expect(map.Q_SLIDER.max).toBe(10);
  });
});

describe("the enumeration itself stays honest", () => {
  it("BrandedReport source never reads question.recommendations directly (reader #6)", () => {
    // Pin via source scan: the component renders row.recommendation (from the
    // frozen ScoreResult) and result.findings — never the raw rules.
    const src = readFileSync(
      join(process.cwd(), "src/components/assessments/BrandedReport.tsx"),
      "utf8"
    );
    // `.recommendations` property ACCESS is banned; comments mentioning the
    // word are fine (strip line comments + block comments first).
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/\.recommendations\b/);
  });
});
