import { createHash } from "node:crypto";

import type { GrowthPhaseNumber } from "./su-full-phase";
import { SU_FULL_QUESTION_BENCHMARKS } from "./su-full-question-benchmarks";

const PHASES = [1, 2, 3, 4, 5] as const satisfies readonly GrowthPhaseNumber[];
const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const CANONICAL_STABLE_KEYS: readonly string[] = SU_FULL_QUESTION_BENCHMARKS.map(
  ({ stableKey }) => stableKey,
);
const EXPECTED_COLUMNS = [
  "phase",
  "phase_name",
  "headcount",
  "score",
  "question_id",
  "question",
  "feedback_text",
  "peer_value",
  "pdf_sha256",
  "campaign_id",
] as const;
const AUDITED_CONTENT_HASHES: Readonly<Record<GrowthPhaseNumber, string>> = {
  1: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  2: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  3: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  4: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
  5: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
};

export interface CompiledPhasePeerCatalogue {
  readonly sourceRowCount: number;
  readonly reportCount: number;
  readonly phaseVectors: Readonly<
    Record<GrowthPhaseNumber, Readonly<Record<string, number>>>
  >;
  readonly contentHashes: Readonly<Record<GrowthPhaseNumber, string>>;
}

function incomplete(message: string): never {
  throw new Error(`SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE: ${message}`);
}

/** Parses exactly one RFC4180 physical row; governed source fields cannot span rows. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) incomplete("embedded newline or unterminated CSV quote");
  cells.push(cell);
  return cells;
}

function parsePhase(value: string, rowNumber: number): GrowthPhaseNumber {
  const match = /^P([1-5])$/.exec(value);
  if (!match) incomplete(`unexpected phase ${JSON.stringify(value)} in CSV row ${rowNumber}`);
  return Number(match[1]) as GrowthPhaseNumber;
}

function parseScore(value: string, rowNumber: number): number {
  const score = Number(value);
  if (!Number.isInteger(score) || !SCORES.includes(score as (typeof SCORES)[number])) {
    incomplete(`unexpected score ${JSON.stringify(value)} in CSV row ${rowNumber}`);
  }
  return score;
}

function parsePeerValue(value: string, rowNumber: number): number {
  const peerValue = Number(value);
  if (!Number.isFinite(peerValue) || peerValue < 0 || peerValue > 10) {
    incomplete(`peer value outside 0..10 in CSV row ${rowNumber}`);
  }
  return peerValue;
}

/** Hash the canonical Q01..Q61 vector serialization, including its final newline. */
export function hashPhasePeerVector(vector: Readonly<Record<string, number>>): string {
  const serialized = CANONICAL_STABLE_KEYS.map(
    (stableKey) => `${stableKey}=${vector[stableKey]}\n`,
  ).join("");
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

/** Compile the committed five-phase report evidence into governed peer vectors. */
export function compilePhasePeerCatalogue(csv: string): CompiledPhasePeerCatalogue {
  const lines = csv.split("\n").map((line) => line.endsWith("\r") ? line.slice(0, -1) : line);
  if (lines.at(-1) === "") lines.pop();
  const [headerLine, ...dataLines] = lines;
  if (!headerLine) incomplete("missing CSV header");
  const header = parseCsvLine(headerLine);
  if (JSON.stringify(header) !== JSON.stringify(EXPECTED_COLUMNS)) {
    incomplete("unexpected CSV columns");
  }

  const reports = new Map<string, Map<string, number>>();
  for (const [index, line] of dataLines.entries()) {
    const rowNumber = index + 2;
    if (!line) incomplete(`blank CSV row ${rowNumber}`);
    const row = parseCsvLine(line);
    if (row.length !== EXPECTED_COLUMNS.length) {
      incomplete(`unexpected column count in CSV row ${rowNumber}`);
    }
    const [phaseLabel, , , scoreLabel, stableKey, , , peerValueLabel] = row;
    const phase = parsePhase(phaseLabel, rowNumber);
    const score = parseScore(scoreLabel, rowNumber);
    if (!CANONICAL_STABLE_KEYS.includes(stableKey)) {
      incomplete(`unexpected question key ${JSON.stringify(stableKey)} in CSV row ${rowNumber}`);
    }
    const peerValue = parsePeerValue(peerValueLabel, rowNumber);
    const reportKey = `${phase}:${score}`;
    const questions = reports.get(reportKey) ?? new Map<string, number>();
    if (questions.has(stableKey)) {
      incomplete(`duplicate phase/score/question row ${reportKey}:${stableKey}`);
    }
    questions.set(stableKey, peerValue);
    reports.set(reportKey, questions);
  }

  const phaseVectors = {} as Record<GrowthPhaseNumber, Readonly<Record<string, number>>>;
  for (const phase of PHASES) {
    let baseline: Readonly<Record<string, number>> | undefined;
    for (const score of SCORES) {
      const reportKey = `${phase}:${score}`;
      const questions = reports.get(reportKey);
      if (!questions || questions.size !== CANONICAL_STABLE_KEYS.length) {
        incomplete(`expected 61 questions for report ${reportKey}`);
      }
      const vector: Record<string, number> = {};
      for (const stableKey of CANONICAL_STABLE_KEYS) {
        const peerValue = questions.get(stableKey);
        if (peerValue === undefined) incomplete(`missing ${reportKey}:${stableKey}`);
        vector[stableKey] = peerValue;
      }
      if (!baseline) {
        baseline = vector;
      } else {
        for (const stableKey of CANONICAL_STABLE_KEYS) {
          if (vector[stableKey] !== baseline[stableKey]) {
            incomplete(`peer value changes between scores for ${phase}:${stableKey}`);
          }
        }
      }
    }
    if (!baseline) incomplete(`missing score zero baseline for phase ${phase}`);
    phaseVectors[phase] = Object.freeze(baseline);
  }

  if (reports.size !== PHASES.length * SCORES.length) {
    incomplete(`expected 55 reports, found ${reports.size}`);
  }
  if (dataLines.length !== PHASES.length * SCORES.length * CANONICAL_STABLE_KEYS.length) {
    incomplete(`expected 3355 source rows, found ${dataLines.length}`);
  }

  const contentHashes = {} as Record<GrowthPhaseNumber, string>;
  for (const phase of PHASES) {
    const hash = hashPhasePeerVector(phaseVectors[phase]);
    if (hash !== AUDITED_CONTENT_HASHES[phase]) {
      throw new Error(`SU_FULL_PHASE_PEERS_HASH_MISMATCH: phase ${phase}`);
    }
    contentHashes[phase] = hash;
  }

  return Object.freeze({
    sourceRowCount: dataLines.length,
    reportCount: reports.size,
    phaseVectors: Object.freeze(phaseVectors),
    contentHashes: Object.freeze(contentHashes),
  });
}

function renderVector(name: string, vector: Readonly<Record<string, number>>): string {
  return `const ${name}: Readonly<Record<string, number>> = Object.freeze({\n${CANONICAL_STABLE_KEYS.map(
    (stableKey) => `  ${JSON.stringify(stableKey)}: ${vector[stableKey]},`,
  ).join("\n")}\n});`;
}

/** Render the checked peer vectors as the deterministic production module. */
export function renderPhasePeerCatalogueModule(
  catalogue: CompiledPhasePeerCatalogue,
): string {
  const baseline = catalogue.phaseVectors[1];
  const phaseFour = catalogue.phaseVectors[4];
  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source: docs/research/esperto-feedback-five-phase-full-matrix-2026-08-20.csv
 * Regenerate: npm run generate:scaling-up-full-phase-peers
 */

import type { GrowthPhaseNumber } from "./su-full-phase";

export const SU_FULL_PHASE_PEER_SOURCE_ID =
  "2026-08-20.esperto-five-phase-peers-v1";

export interface PhasePeerBenchmark {
  readonly phase: GrowthPhaseNumber;
  readonly value: number;
}

${renderVector("P1_P2_P3_P5_VECTOR", baseline)}

${renderVector("P4_VECTOR", phaseFour)}

export const SU_FULL_PHASE_PEER_CONTENT_HASHES = Object.freeze({
${PHASES.map((phase) => `  ${phase}: ${JSON.stringify(catalogue.contentHashes[phase])},`).join("\n")}
});

export const SU_FULL_PHASE_PEER_VECTORS: Readonly<
  Record<GrowthPhaseNumber, Readonly<Record<string, number>>>
> = Object.freeze({
  1: P1_P2_P3_P5_VECTOR,
  2: P1_P2_P3_P5_VECTOR,
  3: P1_P2_P3_P5_VECTOR,
  4: P4_VECTOR,
  5: P1_P2_P3_P5_VECTOR,
});

export function buildPhasePeerBenchmarks(
  stableKey: string,
): readonly PhasePeerBenchmark[] {
  if (!SU_FULL_PHASE_PEER_VECTORS[1][stableKey]) {
    throw new Error(
      \`Unknown canonical Scaling Up Full question key: \${JSON.stringify(stableKey)}.\`,
    );
  }
  return [1, 2, 3, 4, 5].map((phase) => ({
    phase: phase as GrowthPhaseNumber,
    value: SU_FULL_PHASE_PEER_VECTORS[phase as GrowthPhaseNumber][stableKey],
  }));
}

export function getGovernedPeerValue(
  stableKey: string,
  phase: GrowthPhaseNumber,
): number | null {
  return SU_FULL_PHASE_PEER_VECTORS[phase][stableKey] ?? null;
}
`;
}
