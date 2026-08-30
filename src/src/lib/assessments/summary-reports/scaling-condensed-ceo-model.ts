import type { RespondentReport } from "@/lib/assessments/respondent-report";
import {
  SU_FULL_LANDSCAPE_CHAPTERS,
  SU_FULL_LANDSCAPE_SECTIONS,
  type SuFullLandscapeChapterKey,
} from "@/lib/assessments/su-full-landscape-report";
import {
  buildSuFullPeerPresentationResult,
  type SuFullPeerProvenance,
} from "@/lib/assessments/su-full-peer-presentation";

export interface ScalingCondensedCeoModel {
  respondentName: string;
  peerProvenance: SuFullPeerProvenance;
  groups: Array<{
    key: SuFullLandscapeChapterKey;
    label: string;
    questions: Array<{
      stableKey: string;
      label: string;
      you: number;
      peers: number;
    }>;
  }>;
}

export type CondensedModelResult =
  | { kind: "ok"; model: ScalingCondensedCeoModel }
  | { kind: "invalid"; code: "condensed_source_incomplete" };

const invalid = (): CondensedModelResult => ({
  kind: "invalid",
  code: "condensed_source_incomplete",
});

function hasExpectedOrder(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isVisibleScore(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 10;
}

/**
 * Projects the canonical, frozen Scaling Up Full peer presentation into the
 * five CEO decisions. It never scores, resolves peers, or exposes narrative
 * source fields; incomplete or structurally unexpected inputs fail closed.
 */
export function buildScalingCondensedCeoModel(
  report: RespondentReport,
): CondensedModelResult {
  const peers = buildSuFullPeerPresentationResult({ report });
  if (peers.status !== "ready") return invalid();

  const canonicalSectionKeys = SU_FULL_LANDSCAPE_SECTIONS.map(
    (section) => section.stableKey,
  );
  const chapterSectionKeys = SU_FULL_LANDSCAPE_CHAPTERS.flatMap(
    (chapter) => chapter.sectionStableKeys,
  );
  if (!hasExpectedOrder(chapterSectionKeys, canonicalSectionKeys)) return invalid();

  const presentationSections = peers.presentation.sections;
  if (!hasExpectedOrder(
    presentationSections.map((section) => section.stableKey),
    canonicalSectionKeys,
  )) {
    return invalid();
  }

  for (let index = 0; index < SU_FULL_LANDSCAPE_SECTIONS.length; index += 1) {
    const expected = SU_FULL_LANDSCAPE_SECTIONS[index];
    const actual = presentationSections[index];
    if (
      !expected
      || !actual
      || actual.label !== expected.label
      || actual.domain !== expected.domain
      || !hasExpectedOrder(
        actual.questions.map((question) => question.stableKey),
        expected.questionKeys,
      )
      || actual.questions.some(
        (question) => typeof question.label !== "string"
          || question.label.trim() === ""
          || !isVisibleScore(question.you)
          || !isVisibleScore(question.peers),
      )
    ) {
      return invalid();
    }
  }

  const sections = new Map(
    presentationSections.map((section) => [section.stableKey, section]),
  );
  const groups = SU_FULL_LANDSCAPE_CHAPTERS.map((chapter) => ({
    key: chapter.key,
    label: chapter.label,
    questions: chapter.sectionStableKeys.flatMap((key) =>
      (sections.get(key)?.questions ?? []).map(({ stableKey, label, you, peers: peerScore }) => ({
        stableKey,
        label,
        you,
        peers: peerScore,
      })),
    ),
  }));
  const canonicalQuestionKeys = SU_FULL_LANDSCAPE_SECTIONS.flatMap(
    (section) => section.questionKeys,
  );
  if (!hasExpectedOrder(
    groups.flatMap((group) => group.questions.map((question) => question.stableKey)),
    canonicalQuestionKeys,
  )) {
    return invalid();
  }

  return {
    kind: "ok",
    model: {
      respondentName: report.respondentName,
      peerProvenance: { ...peers.presentation.provenance },
      groups,
    },
  };
}
