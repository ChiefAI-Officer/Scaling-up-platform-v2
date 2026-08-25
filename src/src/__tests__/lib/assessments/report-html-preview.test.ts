import { buildTemplateContent } from "../../../../prisma/seed-scaling-up-full-assessment";
import { buildQspV2Content } from "../../../../prisma/seed-qsp-v2-assessment";
import { loadSafeReportHtml } from "@/lib/assessments/report-html";
import { buildReportHtmlPreviewReport } from "@/lib/assessments/report-html-preview";
import {
  buildPhasePeerBenchmarks,
  SU_FULL_PHASE_PEER_CONTENT_HASHES,
  SU_FULL_PHASE_PEER_SOURCE_ID,
} from "@/lib/assessments/su-full-phase-peer-catalogue";
import { buildSuFullPeerDisclosureModel } from "@/lib/assessments/su-full-peer-disclosure";

const content = buildTemplateContent();
const phaseAwareQuestions = content.questions.map((question) =>
  question.type === "SLIDER_LIKERT"
    ? { ...question, phasePeerBenchmarks: buildPhasePeerBenchmarks(question.stableKey) }
    : question,
);
const phaseAwareScoringConfig = {
  ...content.scoringConfig,
  phasePeerBenchmarkCatalogue: {
    sourceId: SU_FULL_PHASE_PEER_SOURCE_ID,
    phases: [1, 2, 3, 4, 5].map((phase) => ({
      phase,
      contentHash: SU_FULL_PHASE_PEER_CONTENT_HASHES[phase as 1 | 2 | 3 | 4 | 5],
    })),
  },
};

function input(peerReference: "current" | "historical") {
  return {
    template: { id: "tpl_preview", alias: "scaling-up-full", name: "Scaling Up Full" },
    version: {
      id: "ver_preview",
      questions: phaseAwareQuestions,
      sections: content.sections,
      scoringConfig: phaseAwareScoringConfig,
      reportConfig: { reportHtml: { schemaVersion: 1, introductionHtml: "<p>Saved welcome</p>", conclusionHtml: "<p>Saved close</p>" } },
    },
    peerReference,
  } as const;
}

describe("buildReportHtmlPreviewReport", () => {
  it("builds a representative Phase 4 Scaling Up Full report from saved content", () => {
    const report = buildReportHtmlPreviewReport(input("current"));

    expect(report.respondentName).toBe("Representative leader");
    expect(report.respondentEmail).toBeNull();
    expect(report.result.perQuestion).toHaveLength(61);
    expect(report.result.recommendationPhase).toBe(4);
    expect(report.result.peerBenchmarkSnapshot).toBeDefined();
    expect(report.result.perQuestion.every((row) => typeof row.peerValue === "number")).toBe(true);
    expect(report.suFullPeerPresentation).not.toBeNull();
    expect(buildSuFullPeerDisclosureModel(report.suFullPeerPresentation!.provenance).provenanceLabel).toBe("Phase 4 · Delegation");
    expect(report.reportHtml).toEqual(loadSafeReportHtml(input("current").version.reportConfig));
  });

  it("uses the historical peer presentation without a snapshot or peer row values", () => {
    const report = buildReportHtmlPreviewReport(input("historical"));

    expect(report.result.peerBenchmarkSnapshot).toBeUndefined();
    expect(report.result.perQuestion.every((row) => row.peerValue === undefined)).toBe(true);
    expect(report.suFullPeerPresentation?.provenance.legacy).toBe(true);
    expect(buildSuFullPeerDisclosureModel(report.suFullPeerPresentation!.provenance).provenanceLabel).toBe("Historical benchmark");
  });

  it("builds QSP v2 from the saved qualitative sections and questions", () => {
    const qsp = buildQspV2Content();
    const report = buildReportHtmlPreviewReport({
      template: {
        id: "tpl_qsp",
        alias: "qsp-v2",
        name: "Quarterly Session Prep v2",
      },
      version: {
        id: "ver_qsp",
        questions: qsp.questions,
        sections: qsp.sections,
        scoringConfig: qsp.scoringConfig,
        reportConfig: {
          reportHtml: {
            schemaVersion: 1,
            introductionHtml: "<h1>Dear {{respondentFirstName}},</h1>",
            conclusionHtml: null,
          },
        },
      },
      peerReference: "current",
    });

    expect(report.templateAlias).toBe("qsp-v2");
    expect(report.sections).toEqual(qsp.sections);
    expect(Object.keys(report.questionsByKey)).toHaveLength(qsp.questions.length);
    expect(report.rawAnswers).toHaveLength(qsp.questions.length);
    expect(report.questionByKey.P4_critical_number).toBe(
      "Critical Number Identification: What is the ONE area of the business where significant improvement would have the greatest impact next quarter?",
    );
    expect(report.reportHtml).toEqual(
      loadSafeReportHtml({
        reportHtml: {
          schemaVersion: 1,
          introductionHtml: "<h1>Dear {{respondentFirstName}},</h1>",
          conclusionHtml: null,
        },
      }),
    );
  });
});
