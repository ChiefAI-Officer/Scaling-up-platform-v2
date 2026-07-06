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

    // ROCKEFELLER_BC_SNAPSHOT_SHA — re-locked 2026-07-05 for Wave U (spec
    // 19u D18): scoreSubmission now UNCONDITIONALLY freezes the findings
    // snapshot as `result.findings` (empty array here — Rockefeller carries
    // no findings rules). The ONLY delta vs the prior snapshot is the added
    // `"findings":[]` key; every pre-existing field is byte-identical (the
    // per-row `recommendation` path is untouched). Prior SHA (pre-Wave-U):
    // 3831c547…7200; before that (pre-reseed 2026-06-02): b5997e68…fc50.
    // To intentionally update again: run the test, copy "Received", explain it.
    const EXPECTED_SHA =
      "dbe653ad601c80aa9752953e76d8f3d38b1910da4cf8e0886cfc6d80229b6547";

    if (sha !== EXPECTED_SHA) {
      console.error(
        `[scoring-bc-snapshot] DRIFT DETECTED\n  expected = ${EXPECTED_SHA}\n  computed = ${sha}\n  serialized = ${serialized}`
      );
    }
    expect(sha).toBe(EXPECTED_SHA);
  });
});
