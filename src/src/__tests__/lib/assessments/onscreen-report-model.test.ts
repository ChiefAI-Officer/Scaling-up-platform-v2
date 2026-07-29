/**
 * Wave OSR (Jeff #71) — assertions against the REAL report-model builder.
 *
 * Why this file exists separately: the submit-route suite mocks
 * `@/lib/assessments/report-email` wholesale, so anything it asserts about the
 * payload's SHAPE is really asserting a property of its own fixture constant.
 * The PR-#236 review caught exactly that — the "no cohort data" guard was
 * vacuous. These tests call `buildRespondentReportFromSubmission` for real.
 *
 * They also pin the three deltas the review found between what the ADR claimed
 * ("the identical BrandedReport a coach/admin sees") and what the builder
 * actually produced: no org name (an orphan " · " on the cover), no coach
 * byline, and a hardcoded `degraded: false`.
 */

import { buildRespondentReportFromSubmission } from "@/lib/assessments/report-email";
import type { ScoreResult } from "@/lib/assessments/scoring";

const scoreResult = {
  totalScore: 24,
  maxScore: 40,
  countAchieved: 12,
  sectionScores: [{ stableKey: "s1", score: 24, max: 40, average: 2.4 }],
  tier: { label: "Developing", message: "Keep going." },
} as unknown as ScoreResult;

function build(overrides?: Record<string, unknown>) {
  return buildRespondentReportFromSubmission({
    result: scoreResult,
    publicTaker: {
      firstName: "Resp",
      lastName: "Ondent",
      email: "resp@example.com",
    },
    assessmentName: "Rockefeller Habits Checklist",
    templateAlias: "RockHabits",
    campaignLabel: "Q3 2026",
    sections: [{ stableKey: "s1", sortOrder: 1, name: "S1" }],
    questions: [
      {
        stableKey: "q1",
        sortOrder: 1,
        type: "SLIDER_LIKERT",
        label: "Q1",
        isRequired: true,
        scale: { min: 0, max: 3, step: 1, anchorMin: "Lo", anchorMax: "Hi" },
      },
    ],
    scoringConfig: { tierMetric: "countAchieved", passThreshold: 2, tiers: [] },
    rawAnswers: [{ stableKey: "q1", value: 3 }],
    submittedAt: new Date("2026-07-29T10:30:00.000Z"),
    submissionId: "sub-1",
    ...overrides,
  });
}

// ─── anonymity, asserted against real output (was vacuous — review #4) ──────

describe("the respondent's own result only — no cohort or aggregate data", () => {
  it("emits no cohort/aggregate/peer keys anywhere in the model", () => {
    const serialized = JSON.stringify(build());
    for (const forbidden of [
      "cohort",
      "aggregate",
      "peer",
      "teamAverage",
      "participants",
      "respondents",
      "peerComparison",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("carries only the one submission's own answers", () => {
    const report = build();
    expect(report.rawAnswers).toEqual([{ stableKey: "q1", value: 3 }]);
  });
});

// ─── the invited path knows org + coach; the public quiz does not (review #3) ─

describe("invited-path fields", () => {
  it("defaults to the public-quiz values when the new args are omitted", () => {
    const report = build();
    expect(report.companyName).toBe("");
    expect(report.jobTitle).toBeNull();
    expect(report.coachLogoUrl).toBeNull();
    expect(report.coachName).toBeNull();
  });

  it("carries the org name so the cover subtitle has no orphan separator", () => {
    const report = build({ companyName: "Spectrum Health" });
    expect(report.companyName).toBe("Spectrum Health");
  });

  it("carries the coach byline (Jeff #63/#67/#73/#78/#81, PR #230)", () => {
    const report = build({
      coachName: "Jane Coach",
      coachLogoUrl: "https://example.com/coach.jpg",
    });
    expect(report.coachName).toBe("Jane Coach");
    expect(report.coachLogoUrl).toBe("https://example.com/coach.jpg");
  });

  it("carries the respondent's job title", () => {
    expect(build({ jobTitle: "COO" }).jobTitle).toBe("COO");
  });
});

// ─── degraded passthrough (review #6) ──────────────────────────────────────

describe("degraded", () => {
  it("defaults to false", () => {
    expect(build().degraded).toBe(false);
  });

  it("passes through true so the report renders its degraded notice", () => {
    expect(build({ degraded: true }).degraded).toBe(true);
  });
});

// ─── the field that makes the qualitative dispatch work ────────────────────

describe("templateAlias", () => {
  it("is always populated, so reportConfigFor can dispatch scored vs qualitative", () => {
    expect(build().templateAlias).toBe("RockHabits");
    expect(build({ templateAlias: "qsp-v2" }).templateAlias).toBe("qsp-v2");
  });
});

// ─── the JSON boundary the on-screen payload crosses ───────────────────────

describe("JSON round trip (the server -> client boundary)", () => {
  it("turns submittedAt into a string, which is why the client must revive it", () => {
    const round = JSON.parse(JSON.stringify(build()));
    expect(typeof round.submittedAt).toBe("string");
  });

  it("survives the round trip with its identifying fields intact", () => {
    const round = JSON.parse(
      JSON.stringify(build({ companyName: "Spectrum Health" })),
    );
    expect(round.respondentName).toBe("Resp Ondent");
    expect(round.companyName).toBe("Spectrum Health");
    expect(round.templateAlias).toBe("RockHabits");
  });
});
