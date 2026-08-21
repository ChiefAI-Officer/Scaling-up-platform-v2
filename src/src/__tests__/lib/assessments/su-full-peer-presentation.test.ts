import {
  buildSuFullPeerPresentation,
  buildSuFullPeerPresentationResult,
} from "@/lib/assessments/su-full-peer-presentation";
import {
  SU_FULL_PHASE_PEER_CONTENT_HASHES,
  SU_FULL_PHASE_PEER_SOURCE_ID,
  SU_FULL_PHASE_PEER_VECTORS,
} from "@/lib/assessments/su-full-phase-peer-catalogue";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import { completeSuFullPeerReport } from "@/__tests__/fixtures/su-full-peer";

function phaseFourReport(): RespondentReport {
  const report = completeSuFullPeerReport();
  return {
    ...report,
    result: {
      ...report.result,
      recommendationPhase: 4,
      peerBenchmarkSnapshot: {
        sourceId: SU_FULL_PHASE_PEER_SOURCE_ID,
        contentHash: SU_FULL_PHASE_PEER_CONTENT_HASHES[4],
        phase: 4,
      },
      perQuestion: report.result.perQuestion.map((row) => ({
        ...row,
        peerValue: SU_FULL_PHASE_PEER_VECTORS[4][row.stableKey],
      })),
    },
  };
}

test("renders all 61 frozen P4 peers with their stored provenance", () => {
  const result = buildSuFullPeerPresentationResult({ report: phaseFourReport() });

  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.reason);
  expect(result.presentation.sections.flatMap((section) => section.questions)).toHaveLength(61);
  expect(result.presentation.sections[0].stableKey).toBe("S_PEOPLE_YE");
  expect(result.presentation.sections[0].questions[0]).toMatchObject({
    stableKey: "Q01",
    peers: 6.6,
    recommendation: "Frozen feedback Q01",
  });
  expect(result.presentation.provenance).toEqual({
    sourceId: "2026-08-20.esperto-five-phase-peers-v1",
    contentHash: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
    phase: 4,
    legacy: false,
  });
  expect(Object.isFrozen(result.presentation)).toBe(true);
  expect(Object.isFrozen(result.presentation.provenance)).toBe(true);
  expect(Object.isFrozen(result.presentation.sections[0].questions)).toBe(true);
});

test("strictly historical reports render the executable legacy baseline", () => {
  const result = buildSuFullPeerPresentationResult({
    report: completeSuFullPeerReport(),
  });

  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.reason);
  expect(result.presentation.sections[0].questions[0].peers).toBe(6.3);
  expect(result.presentation.provenance).toEqual({
    sourceId: "2026-08-14.esperto-controlled-v1",
    contentHash: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
    phase: null,
    legacy: true,
  });
});

test.each([
  ["wrong alias", (report: RespondentReport) => ({ ...report, templateAlias: "qsp-v2" }), "WRONG_TEMPLATE"],
  ["degraded", (report: RespondentReport) => ({ ...report, degraded: true }), "DEGRADED_REPORT"],
])("%s fails closed", (_name, mutate, reason) => {
  const report = mutate(phaseFourReport());
  const result = buildSuFullPeerPresentationResult({ report });

  expect(result).toMatchObject({ status: "unavailable", reason });
  expect(buildSuFullPeerPresentation({ report })).toBeNull();
});

test("a blank frozen recommendation remains null and is never invented", () => {
  const report = phaseFourReport();
  const q01 = report.result.perQuestion.find((row) => row.stableKey === "Q01");
  if (q01) q01.recommendation = "";

  const result = buildSuFullPeerPresentationResult({ report });

  expect(result.status).toBe("ready");
  if (result.status === "ready") {
    expect(result.presentation.sections[0].questions[0].recommendation).toBeNull();
  }
});

test("a snapshot with only 60 frozen values is unavailable", () => {
  const report = phaseFourReport();
  report.result.perQuestion[0].peerValue = undefined;

  expect(buildSuFullPeerPresentationResult({ report })).toMatchObject({
    status: "unavailable",
    reason: "SNAPSHOT_INCOMPLETE",
    expectedCount: 61,
    frozenCount: 60,
  });
});

test("frozen rows without snapshot provenance are unavailable, not historical", () => {
  const report = phaseFourReport();
  report.result.peerBenchmarkSnapshot = undefined;

  expect(buildSuFullPeerPresentationResult({ report })).toMatchObject({
    status: "unavailable",
    reason: "SNAPSHOT_INCOMPLETE",
    frozenCount: 61,
  });
});

test("snapshot provenance without frozen rows is unavailable, not historical", () => {
  const report = phaseFourReport();
  report.result.perQuestion = report.result.perQuestion.map((row) => ({
    ...row,
    peerValue: undefined,
  }));

  expect(buildSuFullPeerPresentationResult({ report })).toMatchObject({
    status: "unavailable",
    reason: "SNAPSHOT_INCOMPLETE",
    frozenCount: 0,
  });
});

test.each([
  ["a changed Q01 under valid P4 provenance", (report: RespondentReport) => { report.result.perQuestion[0].peerValue = 6.5; }],
  ["baseline values under the P4 hash", (report: RespondentReport) => { report.result.perQuestion = report.result.perQuestion.map((row) => ({ ...row, peerValue: SU_FULL_PHASE_PEER_VECTORS[1][row.stableKey] })); }],
  ["a different catalogue source", (report: RespondentReport) => { if (report.result.peerBenchmarkSnapshot) report.result.peerBenchmarkSnapshot.sourceId = "mutable-current-source"; }],
  ["a baseline hash under P4", (report: RespondentReport) => { if (report.result.peerBenchmarkSnapshot) report.result.peerBenchmarkSnapshot.contentHash = SU_FULL_PHASE_PEER_CONTENT_HASHES[1]; }],
  ["a snapshot phase that disagrees with the frozen recommendation phase", (report: RespondentReport) => { if (report.result.peerBenchmarkSnapshot) report.result.peerBenchmarkSnapshot.phase = 3; }],
])("%s returns SNAPSHOT_HASH_MISMATCH", (_name, mutate) => {
  const report = phaseFourReport();
  mutate(report);

  expect(buildSuFullPeerPresentationResult({ report })).toMatchObject({
    status: "unavailable",
    reason: "SNAPSHOT_HASH_MISMATCH",
    frozenCount: 61,
  });
});

test.each([
  ["a missing frozen score", (report: RespondentReport) => { report.result.perQuestion = report.result.perQuestion.slice(1); }, "MISSING_ROWS"],
  ["an invalid frozen score", (report: RespondentReport) => { report.result.perQuestion[0].value = -1; }, "INVALID_SCORE"],
  ["a missing frozen question key", (report: RespondentReport) => { const questionsByKey = { ...report.questionsByKey }; delete questionsByKey.Q01; report.questionsByKey = questionsByKey; }, "KEY_MISMATCH"],
  ["an unexpected required slider key", (report: RespondentReport) => { report.questionsByKey.Q62 = { type: "SLIDER_LIKERT", label: "Unexpected", max: 10 }; }, "KEY_MISMATCH"],
])("%s returns a bounded unavailable result", (_name, mutate, reason) => {
  const report = phaseFourReport();
  mutate(report);
  const result = buildSuFullPeerPresentationResult({ report });

  expect(result).toMatchObject({ status: "unavailable", reason });
  expect(result).not.toHaveProperty("presentation");
});

test("ignores a legitimate non-slider background question", () => {
  const report = phaseFourReport();
  report.questionsByKey.BACKGROUND_FTE = {
    type: "NUMBER",
    label: "How many employees?",
    sectionStableKey: "S_BACKGROUND",
  };

  expect(buildSuFullPeerPresentationResult({ report }).status).toBe("ready");
});
