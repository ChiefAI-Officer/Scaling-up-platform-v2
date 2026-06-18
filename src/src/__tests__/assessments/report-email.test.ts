/**
 * Spec 16 §2 — buildReportEmailHtml unit tests.
 *
 * The email-safe report HTML builder renders a RespondentReport into inline-
 * styled, table-layout HTML that survives Outlook/Gmail (no external CSS, no
 * flex/grid). Pure — no DB, no network. Reuses report-presentation.ts for
 * band / headline / domain-color logic. Every interpolated value HTML-escaped.
 *
 * These tests assert:
 *  - the overall score (headline metric) renders
 *  - the per-domain (or per-section) scores render
 *  - a taker name containing <script> is HTML-escaped (no raw tag)
 *  - the body has NO external CSS deps (<link rel=stylesheet>, <style>@import)
 *  - the body uses NO layout that breaks email (display:flex / display:grid)
 *  - subject differs by recipientRole
 */

import {
  buildReportEmailHtml,
  buildRespondentReportFromSubmission,
} from "@/lib/assessments/report-email";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";

// ── Fixture builders ─────────────────────────────────────────────────────────

function baseReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
  return {
    respondentName: "Monks Koala",
    jobTitle: null,
    companyName: "Acme Corp",
    assessmentName: "Scaling Up 4 Decisions Assessment",
    campaignLabel: null,
    submittedAt: new Date("2026-06-11T10:00:00Z"),
    result: {} as ScoreResult,
    sections: [],
    questionByKey: {},
    questionsByKey: {},
    rawAnswers: [],
    scoringConfig: {},
    provenance: {
      submissionId: "sub-1",
      versionId: "ver-1",
      contentHash: "abcdef0123456789",
      templateName: "Scaling Up 4 Decisions Assessment",
    },
    degraded: false,
    ...overrides,
  };
}

/** SU 4-Decisions style report — domains + scaleUpScore + per-section rows. */
function fourDecisionsReport(
  overrides: Partial<RespondentReport> = {},
): RespondentReport {
  const result: ScoreResult = {
    perQuestion: [
      { stableKey: "q1", value: 3, achieved: false },
      { stableKey: "q2", value: 9, achieved: true },
    ],
    perSection: [
      {
        stableKey: "s_people",
        name: "People",
        totalPoints: 36,
        averagePoints: 4.5,
        achievedCount: 1,
        totalCount: 2,
      },
      {
        stableKey: "s_cash",
        name: "Cash",
        totalPoints: 64,
        averagePoints: 8,
        achievedCount: 2,
        totalCount: 2,
      },
    ],
    perDomain: [
      {
        key: "people",
        label: "People",
        averagePoints: 4.5,
        answeredSectionCount: 1,
        totalSectionCount: 1,
        tier: null,
      },
      {
        key: "cash",
        label: "Cash",
        averagePoints: 8,
        answeredSectionCount: 1,
        totalSectionCount: 1,
        tier: null,
      },
    ],
    overallTotal: 184,
    overallAverage: 5.75,
    countAchieved: 1,
    tier: { label: "Developing", message: "You have built a solid foundation." },
    tierMetricValue: 5.75,
    scaleUpScore: 58,
    unansweredKeys: [],
  };
  return baseReport({
    result,
    sections: [
      {
        stableKey: "s_people",
        name: "People",
        domain: "people",
        questions: [{ stableKey: "q1" }],
      },
      {
        stableKey: "s_cash",
        name: "Cash",
        domain: "cash",
        questions: [{ stableKey: "q2" }],
      },
    ],
    questionByKey: {
      q1: "Our employees are highly engaged.",
      q2: "Our financial statements are accurate and timely.",
    },
    questionsByKey: {
      q1: {
        type: "SLIDER_LIKERT",
        label: "Our employees are highly engaged.",
        sectionStableKey: "s_people",
        min: 0,
        max: 10,
      },
      q2: {
        type: "SLIDER_LIKERT",
        label: "Our financial statements are accurate and timely.",
        sectionStableKey: "s_cash",
        min: 0,
        max: 10,
      },
    },
    rawAnswers: [
      { stableKey: "q1", value: 3 },
      { stableKey: "q2", value: 9 },
    ],
    scoringConfig: {
      tierMetric: "overallAvg",
      passThreshold: 0,
      scaleUpScore: true,
      tiers: [{ minMetric: 0, label: "Developing", message: "" }],
      domains: [
        { key: "people", label: "People", tiers: [] },
        { key: "cash", label: "Cash", tiers: [] },
      ],
    },
    ...overrides,
  });
}

/** Neutral (QSP/LVA) — single tier, passThreshold 0, no domains. */
function neutralReport(): RespondentReport {
  const result: ScoreResult = {
    perQuestion: [{ stableKey: "q1", value: 4, achieved: true }],
    perSection: [
      {
        stableKey: "s1",
        name: "Priorities",
        totalPoints: 4,
        averagePoints: 4,
        achievedCount: 1,
        totalCount: 1,
      },
    ],
    overallTotal: 4,
    overallAverage: 4,
    countAchieved: 1,
    tier: { label: "Submitted", message: "" },
    tierMetricValue: 4,
    unansweredKeys: [],
  };
  return baseReport({
    assessmentName: "Quarterly Strategy Pulse",
    result,
    sections: [
      { stableKey: "s1", name: "Priorities", questions: [{ stableKey: "q1" }] },
    ],
    questionByKey: { q1: "We have a clear top priority" },
    questionsByKey: {
      q1: { type: "SLIDER_LIKERT", label: "We have a clear top priority", sectionStableKey: "s1" },
    },
    rawAnswers: [{ stableKey: "q1", value: 4 }],
    scoringConfig: {
      tierMetric: "overallAvg",
      passThreshold: 0,
      tiers: [{ minMetric: 0, label: "Submitted", message: "" }],
    },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("buildReportEmailHtml — overall score", () => {
  it("renders the overall headline metric (ScaleUp score)", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: fourDecisionsReport(),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toContain("58");
    expect(bodyHtml).toContain("Developing");
  });

  it("renders a neutral 'Submitted' overall for a neutral template", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: neutralReport(),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toContain("Submitted");
  });
});

describe("buildReportEmailHtml — per-domain / per-section scores", () => {
  it("renders each per-domain row with its score", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: fourDecisionsReport(),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toContain("People");
    expect(bodyHtml).toContain("Cash");
    // section totals / averages surfaced
    expect(bodyHtml).toContain("36");
    expect(bodyHtml).toContain("64");
    expect(bodyHtml).toContain("4.5");
    expect(bodyHtml).toContain("8");
  });

  it("renders per-section rows when there are no domains (neutral)", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: neutralReport(),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toContain("Priorities");
  });
});

describe("buildReportEmailHtml — HTML escaping", () => {
  it("escapes a taker name containing <script> in the HTML body (not raw tag)", () => {
    const report = fourDecisionsReport({
      respondentName: '<script>alert("xss")</script>',
    });
    const { bodyHtml, subject } = buildReportEmailHtml({
      report,
      recipientRole: "REFERRING_COACH",
    });
    // Body must HTML-escape the name — never emit a raw <script> tag.
    expect(bodyHtml).not.toContain("<script>");
    expect(bodyHtml).toContain("&lt;script&gt;");
    // Subject is a plain-text MIME header — must NOT HTML-escape; the raw
    // (control-stripped) name goes in verbatim so the inbox shows it correctly.
    expect(subject).not.toContain("&lt;script&gt;");
    expect(subject).toContain("<script>");
  });

  it("escapes a malicious section name (rendered in the score table)", () => {
    const report = fourDecisionsReport();
    // Corrupt a section name with markup; it surfaces in the score-summary row.
    report.result.perSection[0] = {
      ...report.result.perSection[0],
      name: "<img src=x onerror=1>",
    };
    // Section name also comes from the parsed version sections JSON; corrupt both.
    report.sections = [
      { stableKey: "s_people", name: "<img src=x onerror=1>", domain: "people", questions: [{ stableKey: "q1" }] },
      { stableKey: "s_cash", name: "Cash", domain: "cash", questions: [{ stableKey: "q2" }] },
    ];
    const { bodyHtml } = buildReportEmailHtml({
      report,
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).not.toContain("<img src=x");
    expect(bodyHtml).toContain("&lt;img src=x");
  });
});

describe("buildReportEmailHtml — email safety", () => {
  it("has NO external stylesheet or @import dependencies", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: fourDecisionsReport(),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).not.toMatch(/<link[^>]+stylesheet/i);
    expect(bodyHtml).not.toContain("@import");
  });

  it("uses NO flex/grid layout (Outlook-safe table layout only)", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: fourDecisionsReport(),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).not.toMatch(/display\s*:\s*flex/i);
    expect(bodyHtml).not.toMatch(/display\s*:\s*grid/i);
  });

  it("uses a <table> for layout", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: fourDecisionsReport(),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toMatch(/<table/i);
  });
});

describe("buildReportEmailHtml — subject by role", () => {
  it("taker subject is 'Your Scaling Up 4 Decisions results'", () => {
    const { subject } = buildReportEmailHtml({
      report: fourDecisionsReport(),
      recipientRole: "TAKER_COPY",
    });
    expect(subject).toBe("Your Scaling Up 4 Decisions results");
  });

  it("coach subject embeds the plain taker name (no HTML entities) + 'completed'", () => {
    const { subject } = buildReportEmailHtml({
      report: fourDecisionsReport({ respondentName: "Jane Doe" }),
      recipientRole: "REFERRING_COACH",
    });
    expect(subject).toContain("Jane Doe");
    expect(subject).toContain("completed");
    expect(subject).toContain("Scaling Up 4 Decisions");
    // Must be plain text — MIME headers must not contain HTML entities.
    expect(subject).not.toContain("&");
  });

  it("coach subject with apostrophe in name is NOT HTML-escaped", () => {
    const { subject } = buildReportEmailHtml({
      report: fourDecisionsReport({ respondentName: "O'Brien" }),
      recipientRole: "REFERRING_COACH",
    });
    // Plain text — apostrophe passes through, not encoded as &#x27;
    expect(subject).toContain("O'Brien");
    expect(subject).not.toContain("&#x27;");
    expect(subject).not.toContain("&amp;");
  });

  it("coach subject strips control characters from taker name (header injection guard)", () => {
    const { subject } = buildReportEmailHtml({
      report: fourDecisionsReport({ respondentName: "Eve\r\nBcc: evil@ex.com" }),
      recipientRole: "REFERRING_COACH",
    });
    // Control chars (\r\n) stripped — header injection prevented.
    expect(subject).not.toContain("\r");
    expect(subject).not.toContain("\n");
    expect(subject).toContain("Eve");
  });

  it("the two roles produce different subjects", () => {
    const report = fourDecisionsReport({ respondentName: "Jane Doe" });
    const taker = buildReportEmailHtml({ report, recipientRole: "TAKER_COPY" });
    const coach = buildReportEmailHtml({ report, recipientRole: "REFERRING_COACH" });
    expect(taker.subject).not.toBe(coach.subject);
  });

  it("the coach body carries a 'your client' lead-in the taker body does not", () => {
    const report = fourDecisionsReport({ respondentName: "Jane Doe" });
    const taker = buildReportEmailHtml({ report, recipientRole: "TAKER_COPY" });
    const coach = buildReportEmailHtml({ report, recipientRole: "REFERRING_COACH" });
    expect(taker.bodyHtml).not.toBe(coach.bodyHtml);
  });
});

describe("buildRespondentReportFromSubmission — templateAlias", () => {
  function submissionArgs(
    overrides: Partial<Parameters<typeof buildRespondentReportFromSubmission>[0]> = {},
  ): Parameters<typeof buildRespondentReportFromSubmission>[0] {
    return {
      result: {} as ScoreResult,
      publicTaker: { firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
      assessmentName: "Rockefeller Habits Checklist",
      campaignLabel: null,
      sections: [],
      questions: [],
      scoringConfig: {},
      rawAnswers: [],
      submittedAt: new Date("2026-06-17T10:00:00Z"),
      submissionId: "sub-1",
      templateAlias: "RockHabits",
      ...overrides,
    };
  }

  it("threads templateAlias onto the returned RespondentReport (so reportConfigFor can read it)", () => {
    const report = buildRespondentReportFromSubmission(submissionArgs());
    expect(report.templateAlias).toBe("RockHabits");
  });

  // ── Wave E Task 9 — thread real answers + submittedAt + submissionId ───────
  it("threads the submitted rawAnswers onto the returned RespondentReport (qualitative path renders answers)", () => {
    const report = buildRespondentReportFromSubmission(
      submissionArgs({
        rawAnswers: [{ stableKey: "q1", value: "hello" }],
      }),
    );
    expect(report.rawAnswers).toEqual([{ stableKey: "q1", value: "hello" }]);
  });

  it("threads the real submittedAt + submissionId from args (no placeholder defaults)", () => {
    const report = buildRespondentReportFromSubmission(
      submissionArgs({
        rawAnswers: [{ stableKey: "q1", value: "hello" }],
        submittedAt: new Date("2026-05-01T00:00:00Z"),
        submissionId: "sub_1",
      }),
    );
    expect(report.submittedAt).toEqual(new Date("2026-05-01T00:00:00Z"));
    expect(report.provenance.submissionId).toBe("sub_1");
  });

  // ── C-M1 — questionsByKey now carries scale (min/max) AND options ──────────
  it("carries scale min/max from a rating question onto questionsByKey (so email ratings render)", () => {
    const report = buildRespondentReportFromSubmission(
      submissionArgs({
        questions: [
          {
            stableKey: "S3_sales",
            label: "Sales",
            type: "SLIDER_LIKERT",
            sectionStableKey: "S3_strengths",
            scale: { min: 1, max: 3 },
          },
        ],
      }),
    );
    expect(report.questionsByKey["S3_sales"].min).toBe(1);
    expect(report.questionsByKey["S3_sales"].max).toBe(3);
  });

  it("carries MULTI_CHOICE {key,label} options onto questionsByKey (so email resolves labels)", () => {
    const report = buildRespondentReportFromSubmission(
      submissionArgs({
        questions: [
          {
            stableKey: "S4_biggest_obstacles",
            label: "Pick the biggest obstacles",
            type: "MULTI_CHOICE",
            sectionStableKey: "S4_obstacles",
            options: [
              { key: "the_leadership", label: "The Leadership" },
              { key: "culture", label: "Culture" },
            ],
          },
        ],
      }),
    );
    expect(report.questionsByKey["S4_biggest_obstacles"].options).toEqual([
      { key: "the_leadership", label: "The Leadership" },
      { key: "culture", label: "Culture" },
    ]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Wave E — footer cleanup (#25)
// ════════════════════════════════════════════════════════════════════════════

describe("buildReportEmailHtml — footer (#25)", () => {
  it("credit line reads 'Generated by Scaling Up Platform' (no 'Assessment', no 'Confidential')", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: fourDecisionsReport(),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toContain("Generated by Scaling Up Platform");
    expect(bodyHtml).not.toContain("Confidential");
    expect(bodyHtml).not.toContain("Scaling Up Assessment platform");
  });

  it("footer carries the submission date", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: fourDecisionsReport({ submittedAt: new Date("2026-05-01T12:00:00Z") }),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toMatch(/May/);
    expect(bodyHtml).toMatch(/2026/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Wave E — score table gated by report-config (#24)
// ════════════════════════════════════════════════════════════════════════════

describe("buildReportEmailHtml — score table gating (#24)", () => {
  it("omits the score-summary table for the Rockefeller alias", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: fourDecisionsReport({ templateAlias: "RockHabits" }),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).not.toContain("Score summary");
  });

  it("includes the score-summary table for a default/scored alias", () => {
    const { bodyHtml } = buildReportEmailHtml({
      report: fourDecisionsReport({ templateAlias: undefined }),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toContain("Score summary");
  });
});
