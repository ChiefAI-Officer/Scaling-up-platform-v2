/**
 * D2 backwards-compatibility snapshot — Rockefeller.
 *
 * Guardrail #3 (Phase D2 plan, Codex round 4): the scoring engine MUST emit
 * byte-identical ScoreResult output for the existing Rockefeller template
 * when no D2 features (rollup, recommendations, domains, scaleUpScore) are
 * opted in. This test locks the current behavior via a SHA-256 hash of the
 * sorted-key JSON serialization of `scoreSubmission` output.
 *
 * If a future engine change drifts this snapshot, this test fails — that's
 * the signal that a "BC-safe" change wasn't actually BC-safe.
 *
 * Companion BC snapshot: QSP (post-D2.0 hotfix) is asserted in the main
 * scoring.test.ts suite; this file isolates Rockefeller because it is the
 * primary production template and the highest-risk regression surface.
 */

import { createHash } from "node:crypto";
import {
  scoreSubmission,
  type Answer,
  type TemplateVersionForScoring,
} from "@/lib/assessments/scoring";
import { buildTemplateContent } from "../../../../prisma/seed-rockefeller-assessment";

/**
 * Build a deterministic synthetic answer set across all 40 Rockefeller
 * questions. Alternating 0,1,2,3,0,1,2,3,... gives a stable distribution
 * across the [0,3] scale; ensures the snapshot exercises mixed
 * achieved/unachieved + a non-trivial overall total.
 */
function buildSyntheticAnswers(
  questions: TemplateVersionForScoring["questions"]
): Answer[] {
  return questions.map((q, idx) => ({
    stableKey: q.stableKey,
    value: idx % 4, // cycle 0,1,2,3
  }));
}

/**
 * Stable serialization: sort object keys at every level so the JSON byte
 * sequence depends only on values, not on key insertion order.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const body = keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(",");
    return `{${body}}`;
  }
  // Primitives — JSON.stringify handles number/string/boolean/null.
  // `undefined` becomes the literal string "undefined" so it survives the
  // round-trip in case a field is unexpectedly undefined (caught at assert).
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

describe("scoring BC snapshot — Rockefeller", () => {
  it("emits the locked ScoreResult for a synthetic answer set", () => {
    const content = buildTemplateContent();
    const version: TemplateVersionForScoring = {
      sections: content.sections,
      questions: content.questions,
      scoringConfig:
        content.scoringConfig as unknown as TemplateVersionForScoring["scoringConfig"],
    };
    const answers = buildSyntheticAnswers(version.questions);

    const result = scoreSubmission(version, answers);
    const serialized = stableStringify(result);
    const sha = createHash("sha256").update(serialized).digest("hex");

    // ROCKEFELLER_BC_SNAPSHOT_SHA — re-locked 2026-06-02 for the content
    // re-seed (Task 2): the Rockefeller seed content changed (invented slider
    // anchors "Not true"/"Completely true" → "" to match the source which has
    // none; Q1_1 trailing period dropped; section-7 straight quotes), which
    // flows into the per-question ScoreResult. The scoring ENGINE is unchanged
    // — this drift is from the intentional verbatim content fix, not an engine
    // regression. Prior SHA (pre-reseed): b5997e68…fc50.
    // To intentionally update again: run the test, copy "Received", explain it.
    const EXPECTED_SHA =
      "3831c5470e6ec77968e6d7ff1ab0b30e1542f2f7cbd1879bcdfd54bd62907200";

    if (sha !== EXPECTED_SHA) {
      // eslint-disable-next-line no-console
      console.error(
        `[scoring-bc-snapshot] DRIFT DETECTED\n  expected = ${EXPECTED_SHA}\n  computed = ${sha}\n  serialized = ${serialized}`
      );
    }
    expect(sha).toBe(EXPECTED_SHA);
  });
});
