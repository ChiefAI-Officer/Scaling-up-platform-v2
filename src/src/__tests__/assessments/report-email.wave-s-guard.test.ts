/**
 * Wave S (Jeff #12/#13) — email-twin BYTE-IDENTITY guard (spec 19s D9).
 *
 * The respondent results email shares `buildQualitativeModel` with the
 * on-screen report; Wave S deliberately keeps the "compared to peers" section
 * OUT of that shared model (it's a separate pure builder consumed only by the
 * report page), so the email must be structurally incapable of carrying peers.
 *
 * Two guards, CI-frozen (the Wave Q allowlist-freeze pattern):
 *   1. SOURCE — neither report-email.ts nor qualitative-report-model.ts may
 *      reference the peer-benchmarks module. A future import is a deliberate
 *      product decision (email parity follow-on) and must update this test.
 *   2. BEHAVIOR — an LVA email rendered from a report whose answers include
 *      S3 ratings carries no peer copy/markup, and `buildReportEmailHtml`'s
 *      input shape has no benchmark channel at all.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { buildReportEmailHtml } from "@/lib/assessments/report-email";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";

const LIB = join(__dirname, "..", "..", "lib", "assessments");

describe("Wave S — email twin carries no peers (source guard)", () => {
  it.each(["report-email.ts", "qualitative-report-model.ts"])(
    "%s never references the peer-benchmarks module",
    (file) => {
      const src = readFileSync(join(LIB, file), "utf8");
      expect(src).not.toContain("peer-benchmarks");
      expect(src).not.toContain("PeerComparisonSection");
    },
  );
});

function lvaReport(): RespondentReport {
  return {
    respondentName: "John CEOExec",
    respondentEmail: "john@example.com",
    jobTitle: "CEO",
    companyName: "Northwind Logistics",
    assessmentName: "Leadership Vision Alignment",
    templateAlias: "leadership-vision-alignment",
    campaignLabel: null,
    submittedAt: new Date("2026-04-30T10:00:00Z"),
    result: {} as ScoreResult,
    sections: [
      { stableKey: "S2_vision", name: "Vision on the Future" },
      { stableKey: "S3_strengths", name: "Organizational Strengths and Weaknesses" },
    ],
    questionByKey: {},
    questionsByKey: {
      S2_goal: { type: "TEXT", label: "What is the goal?", sectionStableKey: "S2_vision" },
      S3_culture: {
        type: "SLIDER_LIKERT",
        label: "Culture",
        sectionStableKey: "S3_strengths",
        scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
      },
    },
    rawAnswers: [
      { stableKey: "S2_goal", value: "Grow 3x" },
      { stableKey: "S3_culture", value: 3 },
    ],
    scoringConfig: {},
    provenance: {
      submissionId: "sub-123",
      versionId: "ver-456",
      contentHash: "abcdef0123456789",
      templateName: "Leadership Vision Alignment",
    },
    degraded: false,
  } as RespondentReport;
}

describe("Wave S — email twin carries no peers (behavior guard)", () => {
  it.each(["TAKER_COPY", "REFERRING_COACH"] as const)(
    "LVA %s email output has no peer-comparison copy even when the flag is on",
    (recipientRole) => {
      process.env.WAVE_S_PEER_BENCHMARKS_ENABLED = "1";
      try {
        const { bodyHtml } = buildReportEmailHtml({
          report: lvaReport(),
          recipientRole,
        });
        expect(bodyHtml).not.toContain("compared to peers");
        expect(bodyHtml).not.toContain("Peers");
        expect(bodyHtml).not.toContain("peer-comparison");
      } finally {
        delete process.env.WAVE_S_PEER_BENCHMARKS_ENABLED;
      }
    },
  );
});
