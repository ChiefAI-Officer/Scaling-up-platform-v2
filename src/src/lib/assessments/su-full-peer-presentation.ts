import type { RespondentReport } from "@/lib/assessments/respondent-report";
import {
  SU_FULL_PHASE_PEER_CONTENT_HASHES,
  SU_FULL_PHASE_PEER_SOURCE_ID,
  getGovernedPeerValue,
} from "@/lib/assessments/su-full-phase-peer-catalogue";
import type { GrowthPhaseNumber } from "@/lib/assessments/su-full-phase";
import {
  SCALING_UP_FULL_TEMPLATE_ALIAS,
  SU_FULL_LEGACY_PEER_CONTENT_HASH,
  SU_FULL_LEGACY_PEER_SOURCE_ID,
  SU_FULL_QUESTION_BENCHMARKS,
} from "@/lib/assessments/su-full-question-benchmarks";

const EXPECTED_KEYS = Object.freeze(
  Array.from(
    { length: 61 },
    (_, index) => `Q${String(index + 1).padStart(2, "0")}`,
  ),
);
const EXPECTED_KEY_SET = new Set<string>(EXPECTED_KEYS);
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;

export type SuFullPeerQuestionComparison = Readonly<{
  stableKey: string;
  label: string;
  you: number;
  peers: number;
  recommendation: string | null;
}>;

export type SuFullPeerSectionComparison = Readonly<{
  stableKey: string;
  label: string;
  domain: string | null;
  youTotal: number;
  peersTotal: number;
  questions: readonly SuFullPeerQuestionComparison[];
}>;

export type SuFullPeerProvenance =
  | Readonly<{
      sourceId: string;
      contentHash: string;
      phase: GrowthPhaseNumber;
      legacy: false;
    }>
  | Readonly<{
      sourceId: string;
      contentHash: string;
      phase: null;
      legacy: true;
    }>;

export type SuFullPeerPresentation = Readonly<{
  provenance: SuFullPeerProvenance;
  sections: readonly SuFullPeerSectionComparison[];
}>;

export type SuFullPeerBuildReason =
  | "WRONG_TEMPLATE"
  | "DEGRADED_REPORT"
  | "KEY_MISMATCH"
  | "MISSING_ROWS"
  | "INVALID_SCORE"
  | "SNAPSHOT_INCOMPLETE"
  | "SNAPSHOT_HASH_MISMATCH"
  | "LEGACY_BASELINE_INCOMPLETE";

export type SuFullPeerBuildResult =
  | Readonly<{ status: "ready"; presentation: SuFullPeerPresentation }>
  | Readonly<{
      status: "unavailable";
      reason: SuFullPeerBuildReason;
      expectedCount: number;
      frozenCount: number;
      scoreCount: number;
      sourceId?: string;
      phase?: GrowthPhaseNumber;
      contentHash?: string;
    }>;

type FrozenQuestionMeta = Readonly<{
  type?: unknown;
  label?: unknown;
  sectionStableKey?: unknown;
}>;

type FrozenSection = Readonly<{
  stableKey?: unknown;
  name?: unknown;
  domain?: unknown;
}>;

function unavailable(
  reason: SuFullPeerBuildReason,
  frozenCount: number,
  scoreCount: number,
  snapshot?: Record<string, unknown>,
): SuFullPeerBuildResult {
  const sourceId = (
    snapshot?.sourceId === SU_FULL_PHASE_PEER_SOURCE_ID
    || snapshot?.sourceId === SU_FULL_LEGACY_PEER_SOURCE_ID
  )
    ? snapshot.sourceId
    : undefined;
  const contentHash = (
    typeof snapshot?.contentHash === "string"
    && CONTENT_HASH_PATTERN.test(snapshot.contentHash)
  )
    ? snapshot.contentHash
    : undefined;
  const phase = isGrowthPhase(snapshot?.phase) ? snapshot.phase : undefined;
  return {
    status: "unavailable",
    reason,
    expectedCount: EXPECTED_KEYS.length,
    frozenCount,
    scoreCount,
    ...(sourceId === undefined ? {} : { sourceId }),
    ...(phase === undefined ? {} : { phase }),
    ...(contentHash === undefined ? {} : { contentHash }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactlyExpectedKeys(keys: readonly string[]): boolean {
  return keys.length === EXPECTED_KEYS.length
    && new Set(keys).size === EXPECTED_KEYS.length
    && keys.every((key) => EXPECTED_KEY_SET.has(key));
}

function roundedTotal(values: readonly number[]): number {
  return Math.round(
    (values.reduce((total, value) => total + value, 0) + Number.EPSILON) * 10,
  ) / 10;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPeerValue(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 10;
}

function isGrowthPhase(value: unknown): value is GrowthPhaseNumber {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function structurallyEqual(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return Array.isArray(actual)
      && Array.isArray(expected)
      && actual.length === expected.length
      && actual.every((value, index) => structurallyEqual(value, expected[index]));
  }
  if (!isRecord(actual) || !isRecord(expected)) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
    && actualKeys.every((key) => structurallyEqual(actual[key], expected[key]));
}

/**
 * Validates the optional presentation after an untrusted JSON round trip.
 * Invalid enhancement data is discarded by the caller; the base report stays
 * usable and can render its unchanged Classic fallback.
 */
export function isSuFullPeerPresentation(
  value: unknown,
): value is SuFullPeerPresentation {
  if (!isRecord(value) || !isRecord(value.provenance)) return false;
  const provenance = value.provenance;
  if (
    !isNonBlankString(provenance.sourceId)
    || typeof provenance.contentHash !== "string"
    || !CONTENT_HASH_PATTERN.test(provenance.contentHash)
    || typeof provenance.legacy !== "boolean"
    || !(
      (provenance.legacy && provenance.phase === null)
      || (!provenance.legacy && isGrowthPhase(provenance.phase))
    )
  ) {
    return false;
  }
  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    return false;
  }

  const sectionKeys = new Set<string>();
  const questionKeys: string[] = [];
  const peerValuesByKey = new Map<string, number>();

  for (const section of value.sections) {
    if (
      !isRecord(section)
      || !isNonBlankString(section.stableKey)
      || sectionKeys.has(section.stableKey)
      || !isNonBlankString(section.label)
      || !(section.domain === null || isNonBlankString(section.domain))
      || typeof section.youTotal !== "number"
      || !Number.isFinite(section.youTotal)
      || typeof section.peersTotal !== "number"
      || !Number.isFinite(section.peersTotal)
      || !Array.isArray(section.questions)
      || section.questions.length === 0
    ) {
      return false;
    }
    sectionKeys.add(section.stableKey);

    const youValues: number[] = [];
    const peerValues: number[] = [];
    for (const question of section.questions) {
      if (
        !isRecord(question)
        || !isNonBlankString(question.stableKey)
        || !isNonBlankString(question.label)
        || !isPeerValue(question.you)
        || !isPeerValue(question.peers)
        || !(
          question.recommendation === null
          || isNonBlankString(question.recommendation)
        )
      ) {
        return false;
      }
      questionKeys.push(question.stableKey);
      peerValuesByKey.set(question.stableKey, question.peers);
      youValues.push(question.you);
      peerValues.push(question.peers);
    }

    if (
      section.youTotal !== roundedTotal(youValues)
      || section.peersTotal !== roundedTotal(peerValues)
    ) {
      return false;
    }
  }

  const hasCanonicalQuestions = questionKeys.length === EXPECTED_KEYS.length
    && questionKeys.every((key, index) => key === EXPECTED_KEYS[index]);
  if (!hasCanonicalQuestions) return false;

  if (provenance.legacy) {
    const legacyValues = new Map<string, number>(
      SU_FULL_QUESTION_BENCHMARKS.map((row) => [row.stableKey, row.value]),
    );
    return provenance.sourceId === SU_FULL_LEGACY_PEER_SOURCE_ID
      && provenance.contentHash === SU_FULL_LEGACY_PEER_CONTENT_HASH
      && hasExactlyExpectedKeys([...legacyValues.keys()])
      && EXPECTED_KEYS.every(
        (stableKey) => peerValuesByKey.get(stableKey) === legacyValues.get(stableKey),
      );
  }

  const phase = provenance.phase;
  return isGrowthPhase(phase)
    && provenance.sourceId === SU_FULL_PHASE_PEER_SOURCE_ID
    && provenance.contentHash === SU_FULL_PHASE_PEER_CONTENT_HASHES[phase]
    && EXPECTED_KEYS.every(
      (stableKey) =>
        peerValuesByKey.get(stableKey) === getGovernedPeerValue(stableKey, phase),
    );
}

/**
 * Binds an internally valid presentation to the frozen result it accompanies.
 * This is used at untrusted JSON boundaries so a coherent presentation from a
 * different result cannot be substituted. It validates only and never repairs.
 */
export function isSuFullPeerPresentationForReport(
  value: unknown,
  report: unknown,
): value is SuFullPeerPresentation {
  if (
    !isSuFullPeerPresentation(value)
    || !isRecord(report)
    || report.templateAlias !== SCALING_UP_FULL_TEMPLATE_ALIAS
    || !isRecord(report.result)
  ) {
    return false;
  }
  const expected = buildSuFullPeerPresentationResult({
    report: report as unknown as RespondentReport,
  });
  return expected.status === "ready"
    && structurallyEqual(value, expected.presentation);
}

function buildPresentationFromValues(
  report: RespondentReport,
  sliderQuestionEntries: Array<[string, FrozenQuestionMeta]>,
  scoreRows: RespondentReport["result"]["perQuestion"],
  valuesByKey: ReadonlyMap<string, number>,
  provenance: SuFullPeerProvenance,
  frozenCount: number,
): SuFullPeerBuildResult {
  if (
    !hasExactlyExpectedKeys([...valuesByKey.keys()])
    || [...valuesByKey.values()].some((value) => !isPeerValue(value))
  ) {
    return unavailable(
      provenance.legacy
        ? "LEGACY_BASELINE_INCOMPLETE"
        : "SNAPSHOT_HASH_MISMATCH",
      frozenCount,
      scoreRows.length,
    );
  }

  const sections = Array.isArray(report.sections)
    ? report.sections as FrozenSection[]
    : [];
  const scoreByKey = new Map(scoreRows.map((row) => [row.stableKey, row]));
  const presentationSections: SuFullPeerSectionComparison[] = [];
  const emittedKeys: string[] = [];

  for (const section of sections) {
    if (
      !isRecord(section)
      || typeof section.stableKey !== "string"
      || typeof section.name !== "string"
      || (
        section.domain !== undefined
        && section.domain !== null
        && typeof section.domain !== "string"
      )
    ) {
      return unavailable("KEY_MISMATCH", frozenCount, scoreRows.length);
    }
    const questions = sliderQuestionEntries
      .filter(([, question]) => question.sectionStableKey === section.stableKey)
      .map(([stableKey, question]) => {
        const score = scoreByKey.get(stableKey);
        const peerValue = valuesByKey.get(stableKey);
        if (!score || peerValue === undefined || typeof question.label !== "string") {
          return null;
        }
        emittedKeys.push(stableKey);
        return {
          stableKey,
          label: question.label,
          you: score.value,
          peers: peerValue,
          recommendation:
            typeof score.recommendation === "string"
            && score.recommendation.trim() !== ""
              ? score.recommendation
              : null,
        };
      });

    if (questions.some((question) => question === null)) {
      return unavailable("KEY_MISMATCH", frozenCount, scoreRows.length);
    }
    if (questions.length > 0) {
      const comparisons = questions as SuFullPeerQuestionComparison[];
      presentationSections.push({
        stableKey: section.stableKey,
        label: section.name,
        domain: typeof section.domain === "string" ? section.domain : null,
        youTotal: roundedTotal(comparisons.map((question) => question.you)),
        peersTotal: roundedTotal(comparisons.map((question) => question.peers)),
        questions: comparisons,
      });
    }
  }

  if (!hasExactlyExpectedKeys(emittedKeys)) {
    return unavailable("KEY_MISMATCH", frozenCount, scoreRows.length);
  }

  return {
    status: "ready",
    presentation: deepFreeze({
      provenance,
      sections: presentationSections,
    }),
  };
}

/**
 * Builds Scaling Up Full Peers only from the result's frozen snapshot. Reports
 * with neither snapshot provenance nor any frozen peer rows use the explicit
 * historical baseline. Declared-but-invalid snapshots fail closed.
 */
export function buildSuFullPeerPresentationResult(input: {
  report: RespondentReport;
}): SuFullPeerBuildResult {
  const report = input?.report;
  const scoreRows = Array.isArray(report?.result?.perQuestion)
    ? report.result.perQuestion
    : [];
  const scoreCount = scoreRows.length;
  const frozenRows = scoreRows.filter((row) => row?.peerValue !== undefined);
  const frozenCount = frozenRows.length;

  if (!report || report.templateAlias !== SCALING_UP_FULL_TEMPLATE_ALIAS) {
    return unavailable("WRONG_TEMPLATE", frozenCount, scoreCount);
  }
  if (report.degraded) {
    return unavailable("DEGRADED_REPORT", frozenCount, scoreCount);
  }

  const questionsByKey = report.questionsByKey;
  if (!isRecord(questionsByKey)) {
    return unavailable("KEY_MISMATCH", frozenCount, scoreCount);
  }
  const unorderedSliderQuestionEntries = Object.entries(questionsByKey).filter(
    ([, question]) =>
      isRecord(question)
      && (question as FrozenQuestionMeta).type === "SLIDER_LIKERT",
  ) as Array<[string, FrozenQuestionMeta]>;
  if (!hasExactlyExpectedKeys(unorderedSliderQuestionEntries.map(([key]) => key))) {
    return unavailable("KEY_MISMATCH", frozenCount, scoreCount);
  }
  const sliderQuestionsByKey = new Map(unorderedSliderQuestionEntries);
  const sliderQuestionEntries = EXPECTED_KEYS.map((stableKey) => [
    stableKey,
    sliderQuestionsByKey.get(stableKey) as FrozenQuestionMeta,
  ] satisfies [string, FrozenQuestionMeta]);

  if (scoreCount < EXPECTED_KEYS.length) {
    return unavailable("MISSING_ROWS", frozenCount, scoreCount);
  }
  if (!hasExactlyExpectedKeys(scoreRows.map((row) => row?.stableKey))) {
    return unavailable("KEY_MISMATCH", frozenCount, scoreCount);
  }
  if (scoreRows.some((row) => !isPeerValue(row.value))) {
    return unavailable("INVALID_SCORE", frozenCount, scoreCount);
  }

  const rawSnapshot: unknown = report.result.peerBenchmarkSnapshot;
  const hasSnapshot = rawSnapshot !== undefined;
  if (!hasSnapshot && frozenCount === 0) {
    return buildPresentationFromValues(
      report,
      sliderQuestionEntries,
      scoreRows,
      new Map(
        SU_FULL_QUESTION_BENCHMARKS.map((row) => [row.stableKey, row.value]),
      ),
      {
        sourceId: SU_FULL_LEGACY_PEER_SOURCE_ID,
        contentHash: SU_FULL_LEGACY_PEER_CONTENT_HASH,
        phase: null,
        legacy: true,
      },
      frozenCount,
    );
  }

  if (
    !isRecord(rawSnapshot)
    || frozenCount !== EXPECTED_KEYS.length
    || !isNonBlankString(rawSnapshot.sourceId)
    || typeof rawSnapshot.contentHash !== "string"
    || !CONTENT_HASH_PATTERN.test(rawSnapshot.contentHash)
    || !isGrowthPhase(rawSnapshot.phase)
    || !isGrowthPhase(report.result.recommendationPhase)
  ) {
    return unavailable(
      "SNAPSHOT_INCOMPLETE",
      frozenCount,
      scoreCount,
      isRecord(rawSnapshot) ? rawSnapshot : undefined,
    );
  }

  const phase = rawSnapshot.phase;
  const expectedHash = SU_FULL_PHASE_PEER_CONTENT_HASHES[phase];
  const frozenValues = new Map(
    frozenRows.map((row) => [row.stableKey, row.peerValue as number]),
  );
  const snapshotMatches =
    rawSnapshot.sourceId === SU_FULL_PHASE_PEER_SOURCE_ID
    && rawSnapshot.contentHash === expectedHash
    && report.result.recommendationPhase === phase
    && hasExactlyExpectedKeys([...frozenValues.keys()])
    && EXPECTED_KEYS.every((stableKey) => {
      const frozenValue = frozenValues.get(stableKey);
      return isPeerValue(frozenValue)
        && frozenValue === getGovernedPeerValue(stableKey, phase);
    });
  if (!snapshotMatches) {
    return unavailable(
      "SNAPSHOT_HASH_MISMATCH",
      frozenCount,
      scoreCount,
      rawSnapshot,
    );
  }

  return buildPresentationFromValues(
    report,
    sliderQuestionEntries,
    scoreRows,
    frozenValues,
    {
      sourceId: rawSnapshot.sourceId,
      contentHash: rawSnapshot.contentHash,
      phase,
      legacy: false,
    },
    frozenCount,
  );
}

export function buildSuFullPeerPresentation(input: {
  report: RespondentReport;
}): SuFullPeerPresentation | null {
  const result = buildSuFullPeerPresentationResult(input);
  return result.status === "ready" ? result.presentation : null;
}
