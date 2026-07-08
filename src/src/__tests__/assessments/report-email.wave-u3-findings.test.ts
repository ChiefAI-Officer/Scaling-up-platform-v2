/**
 * Wave U3 (spec 19aa) — findings in the results email.
 *
 * Findings render from the FROZEN `result.findings` snapshot into BOTH the
 * scored anatomy and the qualitative twin, gated by the default-OFF
 * WAVE_U3_EMAIL_FINDINGS_ENABLED. Pins:
 *   - flag ON, scored: ALL kinds render — including SLIDER_LIKERT bands (D5;
 *     diverges from the on-screen scored report's non-slider filter);
 *   - flag ON, qualitative: findings render BEFORE the answers block (D5);
 *   - both recipient roles carry findings (D4);
 *   - flag OFF: byte-identical — the snapshot has ZERO effect on the email
 *     (D6), and no findings text leaks;
 *   - no peer copy leaks (Wave S guard parity).
 */
import { buildReportEmailHtml } from "@/lib/assessments/report-email";
import {
  FINDINGS_EYEBROW,
  FINDINGS_TITLE,
} from "@/lib/assessments/findings-section-model";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";
import type { ResolvedFinding } from "@/lib/assessments/findings";

const FLAG = "WAVE_U3_EMAIL_FINDINGS_ENABLED";

const FINDINGS: ResolvedFinding[] = [
  {
    stableKey: "q_sl",
    questionType: "SLIDER_LIKERT",
    sectionStableKey: "s_people",
    questionLabel: "Team alignment",
    text: "SLIDER-FINDING improve team alignment",
  },
  {
    stableKey: "q_num",
    questionType: "NUMBER",
    sectionStableKey: "s_people",
    questionLabel: "Revenue",
    text: "NUMBER-FINDING grow revenue",
  },
  {
    stableKey: "q_mc",
    questionType: "MULTI_CHOICE",
    sectionStableKey: "s_people",
    questionLabel: "Priorities",
    text: "MC-FINDING focus on cash",
  },
];

function scoredReport(withFindings: boolean): RespondentReport {
  return {
    respondentName: "Monks Koala",
    jobTitle: null,
    companyName: "Acme Corp",
    assessmentName: "Scaling Up 4 Decisions Assessment",
    campaignLabel: null,
    submittedAt: new Date("2026-06-11T10:00:00Z"),
    result: (withFindings ? { findings: FINDINGS } : {}) as ScoreResult,
    sections: [{ stableKey: "s_people", name: "People", domain: "people" }],
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
  } as RespondentReport;
}

function qualReport(withFindings: boolean): RespondentReport {
  return {
    respondentName: "Jane Doe",
    jobTitle: null,
    companyName: "Acme Corp",
    assessmentName: "Leadership Vision Alignment",
    templateAlias: "leadership-vision-alignment",
    campaignLabel: null,
    submittedAt: new Date("2026-06-17T10:00:00Z"),
    result: (withFindings ? { findings: FINDINGS } : {}) as ScoreResult,
    sections: [{ stableKey: "s_people", name: "People" }],
    questionByKey: { p_q: "What is your goal?" },
    questionsByKey: {
      p_q: {
        type: "TEXT",
        label: "What is your goal?",
        sectionStableKey: "s_people",
      },
    },
    rawAnswers: [{ stableKey: "p_q", value: "ANSWER-TEXT grow three times" }],
    scoringConfig: {},
    provenance: {
      submissionId: "sub-2",
      versionId: "ver-2",
      contentHash: "abcdef0123456789",
      templateName: "Leadership Vision Alignment",
    },
    degraded: false,
  } as RespondentReport;
}

afterEach(() => {
  delete process.env[FLAG];
});

describe("flag ON — scored email renders ALL finding kinds (incl. slider)", () => {
  it.each(["TAKER_COPY", "REFERRING_COACH"] as const)(
    "%s carries every finding text + the shared eyebrow/title",
    (recipientRole) => {
      process.env[FLAG] = "1";
      const { bodyHtml } = buildReportEmailHtml({
        report: scoredReport(true),
        recipientRole,
      });
      expect(bodyHtml).toContain("SLIDER-FINDING improve team alignment");
      expect(bodyHtml).toContain("NUMBER-FINDING grow revenue");
      expect(bodyHtml).toContain("MC-FINDING focus on cash");
      expect(bodyHtml).toContain(FINDINGS_EYEBROW);
      expect(bodyHtml).toContain(FINDINGS_TITLE);
    },
  );
});

describe("flag ON — qualitative email renders findings BEFORE the answers", () => {
  it.each(["TAKER_COPY", "REFERRING_COACH"] as const)(
    "%s: findings appear, positioned before the answer block",
    (recipientRole) => {
      process.env[FLAG] = "1";
      const { bodyHtml } = buildReportEmailHtml({
        report: qualReport(true),
        recipientRole,
      });
      expect(bodyHtml).toContain("SLIDER-FINDING improve team alignment");
      expect(bodyHtml).toContain("ANSWER-TEXT grow three times");
      // D5: findings render before the answers so they survive the byte budget.
      expect(bodyHtml.indexOf("SLIDER-FINDING")).toBeLessThan(
        bodyHtml.indexOf("ANSWER-TEXT"),
      );
    },
  );
});

describe("flag OFF — byte-identical (the snapshot has zero effect)", () => {
  it.each(["TAKER_COPY", "REFERRING_COACH"] as const)(
    "scored %s: output identical with vs without a findings snapshot; no text leaks",
    (recipientRole) => {
      delete process.env[FLAG];
      const withF = buildReportEmailHtml({
        report: scoredReport(true),
        recipientRole,
      }).bodyHtml;
      const withoutF = buildReportEmailHtml({
        report: scoredReport(false),
        recipientRole,
      }).bodyHtml;
      expect(withF).toBe(withoutF);
      expect(withF).not.toContain("SLIDER-FINDING");
      expect(withF).not.toContain(FINDINGS_TITLE);
    },
  );

  it.each(["TAKER_COPY", "REFERRING_COACH"] as const)(
    "qualitative %s: output identical with vs without a findings snapshot; no text leaks",
    (recipientRole) => {
      delete process.env[FLAG];
      const withF = buildReportEmailHtml({
        report: qualReport(true),
        recipientRole,
      }).bodyHtml;
      const withoutF = buildReportEmailHtml({
        report: qualReport(false),
        recipientRole,
      }).bodyHtml;
      expect(withF).toBe(withoutF);
      expect(withF).not.toContain("SLIDER-FINDING");
      expect(withF).not.toContain(FINDINGS_TITLE);
    },
  );
});

describe("qualitative degraded body — findings survive an empty answer body (D5)", () => {
  // sections:[] ⇒ the model renders no answer sections ⇒ the "received"
  // fallback. Findings must STILL lead (the extreme of answer truncation).
  function emptyBodyReport(withFindings: boolean): RespondentReport {
    return {
      ...qualReport(withFindings),
      sections: [],
      questionsByKey: {},
      questionByKey: {},
      rawAnswers: [],
    } as RespondentReport;
  }

  it("flag ON: findings render even in the 'received' fallback body", () => {
    process.env[FLAG] = "1";
    const { bodyHtml } = buildReportEmailHtml({
      report: emptyBodyReport(true),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).toContain("Your assessment has been received.");
    expect(bodyHtml).toContain("SLIDER-FINDING improve team alignment");
    expect(bodyHtml).toContain(FINDINGS_TITLE);
  });

  it("flag OFF: the degraded body is byte-identical (snapshot has no effect)", () => {
    delete process.env[FLAG];
    const withF = buildReportEmailHtml({
      report: emptyBodyReport(true),
      recipientRole: "TAKER_COPY",
    }).bodyHtml;
    const withoutF = buildReportEmailHtml({
      report: emptyBodyReport(false),
      recipientRole: "TAKER_COPY",
    }).bodyHtml;
    expect(withF).toBe(withoutF);
    expect(withF).not.toContain("SLIDER-FINDING");
  });
});

describe("Wave S guard parity — no peer copy leaks via the findings block", () => {
  it("flag ON does not introduce peer copy", () => {
    process.env[FLAG] = "1";
    const { bodyHtml } = buildReportEmailHtml({
      report: scoredReport(true),
      recipientRole: "TAKER_COPY",
    });
    expect(bodyHtml).not.toContain("compared to peers");
    expect(bodyHtml).not.toContain("Peers");
  });
});
