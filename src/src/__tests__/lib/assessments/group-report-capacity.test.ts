/**
 * Task 8 (Wave J) — SU-Full group-report capacity perf smoke.
 *
 * Asserts that buildGroupReportModel for a 1-CEO + 40-member SU-Full cohort
 * completes well within a generous CI budget (1500ms — the design targets are
 * model < 500ms and render < 1s; 1500ms provides a 3× CI multiplier to avoid
 * flakiness on slow runners).
 *
 * The test is DETERMINISTIC: member cohort built synthetically from the
 * existing fixtureScalingUpFull factory shape; no Date.now() in assertions.
 * The model is correct-checked (basic structural invariants), not just timed,
 * to prevent a "fast but empty" false-pass.
 *
 * Pure — NO DB.
 */

import { buildGroupReportModel } from "@/lib/assessments/group-report-model";
import type { GroupReportInput } from "@/lib/assessments/group-report-model";
import { fixtureScalingUpFull } from "./fixtures/group-report-fixtures";

// ── Cohort builder ─────────────────────────────────────────────────────────

/**
 * Build a synthetic SU-Full GroupReportInput with 1 CEO + `memberCount` team
 * members. Each team member gets deterministic domain averages computed from
 * their index so the fixture is stable + representative.
 *
 * Domain averages rotate in [3, 8] across the 5 domains — each member scores
 * differently so team variance is realistic.
 */
function buildLargeSufCohort(memberCount: number): GroupReportInput {
  // Borrow the canonical base fixture to get the correct version shape
  // (questions, sections, scoringConfig).
  const base = fixtureScalingUpFull();

  const DOMAINS = ["people", "strategy", "execution", "cash", "you"] as const;
  const SECTIONS = [
    { stableKey: "S_PEOPLE_YE", domain: "people" as const },
    { stableKey: "S_STRATEGY", domain: "strategy" as const },
    { stableKey: "S_EXEC_LT", domain: "execution" as const },
    { stableKey: "S_CASH", domain: "cash" as const },
    { stableKey: "S_YOU_LEAD", domain: "you" as const },
  ] as const;

  // Build a deterministic ScoreResult for a given domain-averages map.
  function makeSufResult(
    domainAverages: Record<string, number>,
    scaleUpScore: number,
    tierLabel: string,
  ): unknown {
    const perDomain = DOMAINS.map((d) => ({
      key: d,
      label: d.charAt(0).toUpperCase() + d.slice(1),
      averagePoints: domainAverages[d],
      answeredSectionCount: 1,
      totalSectionCount: 1,
      tier: { label: tierLabel, message: "" },
    }));
    const perSection = SECTIONS.map((s) => ({
      stableKey: s.stableKey,
      name: s.stableKey,
      totalPoints: domainAverages[s.domain],
      averagePoints: domainAverages[s.domain],
      achievedCount: 0,
      totalCount: 1,
    }));
    const vals = Object.values(domainAverages);
    const overallAverage = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
      perQuestion: SECTIONS.map((s) => ({
        stableKey: `Q_${s.stableKey}`,
        value: domainAverages[s.domain],
        achieved: domainAverages[s.domain] >= 5,
      })),
      perSection,
      perDomain,
      overallTotal: 0,
      overallAverage,
      countAchieved: 0,
      tier: { label: tierLabel, message: `Overall: ${tierLabel}` },
      tierMetricValue: overallAverage,
      scaleUpScore,
      unansweredKeys: [],
    };
  }

  // Build submissions: first = CEO, then memberCount team members.
  const submissions: GroupReportInput["submissions"] = [];
  const participants: GroupReportInput["participants"] = [];

  // CEO submission (index 0, high scores)
  const ceoDomains: Record<string, number> = {};
  for (const d of DOMAINS) ceoDomains[d] = 8;
  submissions.push({
    respondentId: "cap-ceo",
    answers: SECTIONS.map((s) => ({
      stableKey: `Q_${s.stableKey}`,
      value: ceoDomains[s.domain],
    })),
    result: makeSufResult(ceoDomains, 80, "Exemplary"),
    respondent: { firstName: "Cap", lastName: "CEO", jobTitle: "CEO" },
  });
  participants.push({
    respondentId: "cap-ceo",
    isCEO: true,
    respondent: { firstName: "Cap", lastName: "CEO", jobTitle: "CEO" },
  });

  // Team members: deterministic scores in [3, 8] rotated per member + domain.
  for (let i = 0; i < memberCount; i++) {
    const id = `cap-member-${i}`;
    const domainAverages: Record<string, number> = {};
    DOMAINS.forEach((d, di) => {
      // Value cycles in [3..8] — distinct enough to drive variance.
      domainAverages[d] = 3 + ((i + di) % 6);
    });
    const avg =
      Object.values(domainAverages).reduce((a, b) => a + b, 0) / DOMAINS.length;
    const scaleUpScore = Math.round(avg * 10);
    const tierLabel = avg >= 6 ? "Good" : avg >= 4 ? "Moderate" : "Needs Work";

    submissions.push({
      respondentId: id,
      answers: SECTIONS.map((s) => ({
        stableKey: `Q_${s.stableKey}`,
        value: domainAverages[s.domain],
      })),
      result: makeSufResult(domainAverages, scaleUpScore, tierLabel),
      respondent: {
        firstName: `Member`,
        lastName: `${i}`,
        jobTitle: `Team Member ${i}`,
      },
    });
    participants.push({
      respondentId: id,
      isCEO: false,
      respondent: {
        firstName: `Member`,
        lastName: `${i}`,
        jobTitle: `Team Member ${i}`,
      },
    });
  }

  return {
    alias: "scaling-up-full",
    version: base.version,
    participants,
    submissions,
  };
}

// ── Test ────────────────────────────────────────────────────────────────────

describe("SU-Full group-report capacity smoke (Task 8 / Wave J)", () => {
  const CEO_COUNT = 1;
  const MEMBER_COUNT = 40;
  const TOTAL = CEO_COUNT + MEMBER_COUNT;

  // Generous CI budget: 1500ms (design targets: model <500ms, 3× multiplier).
  const MODEL_BUILD_BUDGET_MS = 1500;

  it(`builds a ${TOTAL}-person SU-Full cohort model in < ${MODEL_BUILD_BUDGET_MS}ms`, () => {
    const input = buildLargeSufCohort(MEMBER_COUNT);
    expect(input.submissions).toHaveLength(TOTAL);
    expect(input.participants).toHaveLength(TOTAL);

    const start = performance.now();
    const model = buildGroupReportModel(input);
    const elapsed = performance.now() - start;

    // Timing assertion (generous CI budget).
    expect(elapsed).toBeLessThan(MODEL_BUILD_BUDGET_MS);

    // Correctness: model must not be empty.
    expect(model.respondents).toHaveLength(TOTAL);
    expect(model.respondentCount).toBe(TOTAL);
    expect(model.reportType).toBe("scored");

    // CEO is first in the sorted respondents list.
    expect(model.respondents[0]?.isCEO).toBe(true);
    expect(model.respondents[0]?.respondentId).toBe("cap-ceo");

    // No structural degradation (all submissions have well-formed results).
    expect(model.degraded).toBe(false);

    // Scored report is present with the expected domain structure.
    expect(model.scored).toBeDefined();
    const scored = model.scored!;
    expect(scored.domains).toHaveLength(5);
    expect(scored.sections).toHaveLength(5);

    // Peers benchmark attaches for SU-Full.
    expect(model.benchmarkVersion).toBeDefined();
    expect(typeof model.benchmarkVersion).toBe("string");
    expect(model.benchmarkKeyMismatch).toBe(false);

    // Each domain has a teamAvg (40 non-CEO members → always N≥2).
    for (const domain of scored.domains!) {
      expect(domain.teamAvg).not.toBeNull();
      expect(typeof domain.teamAvg).toBe("number");
      // Peers and devPeers attach for SU-Full.
      expect(domain.peers).toBeDefined();
      expect(typeof domain.peers).toBe("number");
      expect(domain.devPeers).toBeDefined();
    }
  });

  it("model is deterministic — calling twice returns the same respondent count + benchmark version", () => {
    const input = buildLargeSufCohort(MEMBER_COUNT);
    const m1 = buildGroupReportModel(input);
    const m2 = buildGroupReportModel(input);
    expect(m1.respondentCount).toBe(m2.respondentCount);
    expect(m1.benchmarkVersion).toBe(m2.benchmarkVersion);
    expect(m1.benchmarkKeyMismatch).toBe(m2.benchmarkKeyMismatch);
    // Respondent order is stable across calls.
    expect(m1.respondents.map((r) => r.respondentId)).toEqual(
      m2.respondents.map((r) => r.respondentId),
    );
  });
});
