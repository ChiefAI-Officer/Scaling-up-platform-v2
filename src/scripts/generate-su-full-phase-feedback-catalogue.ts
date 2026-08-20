import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_COLUMNS = [
  "phase",
  "phase_name",
  "representative_headcount",
  "band_id",
  "min_score",
  "max_score",
  "question_id",
  "question",
  "feedback_text",
  "source_score",
  "source_campaign_id",
  "source_pdf_sha256",
  "provenance",
] as const;

const EXPECTED_RANGES = [
  { bandId: "B1", minScore: 0, maxScore: 4 },
  { bandId: "B2", minScore: 5, maxScore: 6 },
  { bandId: "B3", minScore: 7, maxScore: 8 },
  { bandId: "B4", minScore: 9, maxScore: 10 },
] as const;

const PHASES = [1, 2, 3, 4, 5] as const;
const CANONICAL_STABLE_KEYS = Array.from(
  { length: 61 },
  (_, index) => `Q${String(index + 1).padStart(2, "0")}`,
);
const EXPECTED_RECORD_COUNT =
  PHASES.length * CANONICAL_STABLE_KEYS.length * EXPECTED_RANGES.length;

export interface CatalogueRow {
  phase: number;
  stableKey: string;
  minScore: number;
  maxScore: number;
  feedbackText: string;
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteClosed = false;

  const finishField = () => {
    row.push(field);
    field = "";
    quoteClosed = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (quoteClosed && character !== "," && character !== "\n" && character !== "\r") {
      throw new Error("Malformed CSV: unexpected content after closing quote.");
    }
    if (character === '"') {
      if (field !== "") {
        throw new Error("Malformed CSV: quote in an unquoted field.");
      }
      inQuotes = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\n") {
      finishRow();
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (inQuotes) throw new Error("Malformed CSV: unclosed quoted field.");
  if (field !== "" || row.length > 0) finishRow();
  return rows;
}

/** Parse the committed research source and reject every incomplete or unexpected shape. */
export function parseAndValidateCatalogue(input: string): CatalogueRow[] {
  const rows = parseCsv(input);
  const [header, ...dataRows] = rows;
  if (!header || JSON.stringify(header) !== JSON.stringify(EXPECTED_COLUMNS)) {
    throw new Error("Unexpected CSV columns in SU Full phase feedback catalogue.");
  }
  const records: CatalogueRow[] = [];
  const seen = new Set<string>();
  const expectedRangeByBandId = new Map(
    EXPECTED_RANGES.map((range) => [range.bandId, range]),
  );
  for (const [index, row] of dataRows.entries()) {
    const recordNumber = index + 2;
    if (row.length !== EXPECTED_COLUMNS.length) {
      throw new Error(`Unexpected column count in CSV row ${recordNumber}.`);
    }
    if (row.some((field) => field.trim() === "")) {
      throw new Error(`Blank field in CSV row ${recordNumber}.`);
    }

    const [phaseId, , , bandId, minScoreText, maxScoreText, questionId, , feedbackText] = row;
    const phaseMatch = /^P([1-5])$/.exec(phaseId);
    if (!phaseMatch) {
      throw new Error(`Unexpected phase ${JSON.stringify(phaseId)} in CSV row ${recordNumber}.`);
    }
    if (!CANONICAL_STABLE_KEYS.includes(questionId)) {
      throw new Error(`Unexpected canonical question key ${JSON.stringify(questionId)} in CSV row ${recordNumber}.`);
    }
    const minScore = Number(minScoreText);
    const maxScore = Number(maxScoreText);
    const expectedRange = expectedRangeByBandId.get(bandId);
    if (
      !expectedRange ||
      !Number.isInteger(minScore) ||
      !Number.isInteger(maxScore) ||
      minScore !== expectedRange.minScore ||
      maxScore !== expectedRange.maxScore
    ) {
      throw new Error(`Unexpected score range in CSV row ${recordNumber}.`);
    }

    const phase = Number(phaseMatch[1]);
    const key = `${phase}:${questionId}:${minScore}-${maxScore}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate phase/question/band record: ${key}.`);
    }
    seen.add(key);
    records.push({ phase, stableKey: questionId, minScore, maxScore, feedbackText });
  }

  if (dataRows.length !== EXPECTED_RECORD_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_RECORD_COUNT.toLocaleString("en-US")} catalogue records, found ${dataRows.length}.`,
    );
  }

  for (const phase of PHASES) {
    for (const stableKey of CANONICAL_STABLE_KEYS) {
      for (const { minScore, maxScore } of EXPECTED_RANGES) {
        if (!seen.has(`${phase}:${stableKey}:${minScore}-${maxScore}`)) {
          throw new Error(
            `Missing phase/question/band record: ${phase}:${stableKey}:${minScore}-${maxScore}.`,
          );
        }
      }
    }
  }

  return records.sort(
    (left, right) =>
      left.phase - right.phase ||
      left.stableKey.localeCompare(right.stableKey) ||
      left.minScore - right.minScore,
  );
}

export function renderCatalogue(records: readonly CatalogueRow[]): string {
  const byPhase = new Map<number, Map<string, CatalogueRow[]>>();
  for (const record of records) {
    const byQuestion = byPhase.get(record.phase) ?? new Map<string, CatalogueRow[]>();
    const bands = byQuestion.get(record.stableKey) ?? [];
    bands.push(record);
    byQuestion.set(record.stableKey, bands);
    byPhase.set(record.phase, byQuestion);
  }

  const phaseBlocks = PHASES.map((phase) => {
    const questions = byPhase.get(phase);
    if (!questions) throw new Error(`Missing phase ${phase} after catalogue validation.`);
    const questionBlocks = CANONICAL_STABLE_KEYS.map((stableKey) => {
      const bands = questions.get(stableKey);
      if (!bands) throw new Error(`Missing question ${stableKey} in phase ${phase}.`);
      const bandLines = bands
        .sort((left, right) => left.minScore - right.minScore)
        .map(
          ({ minScore, maxScore, feedbackText }) =>
            `      { minScore: ${minScore}, maxScore: ${maxScore}, text: ${JSON.stringify(feedbackText)} },`,
        );
      return `    ${JSON.stringify(stableKey)}: [\n${bandLines.join("\n")}\n    ],`;
    });
    return `  ${phase}: {\n${questionBlocks.join("\n")}\n  },`;
  });

  return `/**\n * GENERATED FILE — DO NOT EDIT.\n *\n * Source: docs/research/esperto-feedback-five-phase-band-catalogue-2026-08-20.csv\n * Regenerate: npx tsx scripts/generate-su-full-phase-feedback-catalogue.ts\n */\n\nimport type { GrowthPhaseNumber } from "./su-full-phase";\n\nexport const SU_FULL_PHASE_FEEDBACK_SOURCE_ID =\n  "2026-08-20.esperto-five-phase-v1";\n\nexport interface RecommendationBand {\n  readonly minScore: number;\n  readonly maxScore: number;\n  readonly text: string;\n}\n\ninterface MutableRecommendationBand {\n  minScore: number;\n  maxScore: number;\n  text: string;\n}\n\nexport interface PhaseRecommendation {\n  phase: GrowthPhaseNumber;\n  bands: MutableRecommendationBand[];\n}\n\nfunction freezeCatalogue(\n  catalogue: Record<GrowthPhaseNumber, Record<string, RecommendationBand[]>>,\n): Readonly<\n  Record<GrowthPhaseNumber, Readonly<Record<string, readonly RecommendationBand[]>>>\n> {\n  for (const phase of [1, 2, 3, 4, 5] as const) {\n    const questions = catalogue[phase];\n    for (const bands of Object.values(questions)) {\n      for (const band of bands) Object.freeze(band);\n      Object.freeze(bands);\n    }\n    Object.freeze(questions);\n  }\n  return Object.freeze(catalogue);\n}\n\nexport const SU_FULL_PHASE_FEEDBACK = freezeCatalogue({\n${phaseBlocks.join("\n")}\n});\n\n/** Build a mutable version-payload shape without exposing the frozen catalogue arrays. */\nexport function buildPhaseRecommendations(\n  stableKey: string,\n): PhaseRecommendation[] {\n  const bandsForFirstPhase = SU_FULL_PHASE_FEEDBACK[1][stableKey];\n  if (!bandsForFirstPhase) {\n    throw new Error(\n      \`Unknown canonical Scaling Up Full question key: \${JSON.stringify(stableKey)}.\`,\n    );\n  }\n\n  return ([1, 2, 3, 4, 5] as const).map((phase) => ({\n    phase,\n    bands: SU_FULL_PHASE_FEEDBACK[phase][stableKey].map((band) => ({ ...band })),\n  }));\n}\n`;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(
  scriptDirectory,
  "../../docs/research/esperto-feedback-five-phase-band-catalogue-2026-08-20.csv",
);
const outputPath = resolve(
  scriptDirectory,
  "../src/lib/assessments/su-full-phase-feedback-catalogue.ts",
);

function main(): void {
  const records = parseAndValidateCatalogue(readFileSync(sourcePath, "utf8"));
  writeFileSync(outputPath, renderCatalogue(records), "utf8");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
