import { PrismaClient } from "@prisma/client";

import { listRatingQuestionKeys } from "../src/lib/assessments/peer-benchmarks";
import {
  SCALING_UP_FULL_TEMPLATE_ALIAS,
  SU_FULL_QUESTION_BENCHMARKS,
} from "../src/lib/assessments/su-full-question-benchmarks";

const EXPECTED_ROW_COUNT = 61;

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function assertSameKeys(
  label: string,
  actual: ReadonlySet<string>,
  expected: ReadonlySet<string>,
): void {
  const missing = sorted([...expected].filter((key) => !actual.has(key)));
  const extra = sorted([...actual].filter((key) => !expected.has(key)));

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${label} keys differ from the governed snapshot: ${JSON.stringify({ missing, extra })}`,
    );
  }
}

async function main(): Promise<void> {
  const db = new PrismaClient();

  try {
    const expectedKeys = new Set(
      SU_FULL_QUESTION_BENCHMARKS.map((row) => row.stableKey),
    );
    if (
      SU_FULL_QUESTION_BENCHMARKS.length !== EXPECTED_ROW_COUNT ||
      expectedKeys.size !== EXPECTED_ROW_COUNT
    ) {
      throw new Error(
        `Governed snapshot must contain exactly ${EXPECTED_ROW_COUNT} unique keys`,
      );
    }

    const template = await db.assessmentTemplate.findFirst({
      where: {
        alias: SCALING_UP_FULL_TEMPLATE_ALIAS,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!template) throw new Error("Scaling Up Full template not found");

    const version = await db.assessmentTemplateVersion.findFirst({
      where: {
        templateId: template.id,
        language: "enUS",
        publishedAt: { not: null },
        archivedAt: null,
      },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true, questions: true },
    });
    if (!version) throw new Error("Active Scaling Up Full version not found");

    const activeRows = listRatingQuestionKeys(
      version.questions,
      SCALING_UP_FULL_TEMPLATE_ALIAS,
    );
    const activeKeys = new Set(activeRows.map((row) => row.stableKey));
    if (
      activeRows.length !== EXPECTED_ROW_COUNT ||
      activeKeys.size !== EXPECTED_ROW_COUNT
    ) {
      throw new Error(
        `Active Scaling Up Full version must contain exactly ${EXPECTED_ROW_COUNT} unique rating keys`,
      );
    }
    assertSameKeys("Active version", activeKeys, expectedKeys);

    const rows = await db.assessmentBenchmark.findMany({
      where: { templateId: template.id, metricKind: "QUESTION" },
      select: { metricKey: true, value: true, updatedAt: true },
      orderBy: { metricKey: "asc" },
    });
    const storedKeys = new Set(rows.map((row) => row.metricKey));
    if (
      rows.length !== EXPECTED_ROW_COUNT ||
      storedKeys.size !== EXPECTED_ROW_COUNT
    ) {
      throw new Error(
        `Production benchmark store must contain exactly ${EXPECTED_ROW_COUNT} unique QUESTION rows; found ${rows.length} rows and ${storedKeys.size} unique keys`,
      );
    }
    assertSameKeys("Stored benchmark", storedKeys, expectedKeys);

    const invalidValues = rows
      .filter(
        (row) => !Number.isFinite(row.value) || row.value < 0 || row.value > 10,
      )
      .map((row) => ({ metricKey: row.metricKey, value: row.value }));
    if (invalidValues.length > 0) {
      throw new Error(
        `Production benchmark values must be finite and inside [0, 10]: ${JSON.stringify(invalidValues)}`,
      );
    }

    const greatestUpdatedAt = rows.reduce<Date | null>(
      (greatest, row) =>
        greatest === null || row.updatedAt > greatest
          ? row.updatedAt
          : greatest,
      null,
    );
    if (!greatestUpdatedAt) {
      throw new Error(
        "Production benchmark rows do not have an updatedAt receipt",
      );
    }

    console.log(
      JSON.stringify({
        templateId: template.id,
        versionNumber: version.versionNumber,
        rowCount: rows.length,
        firstKey: rows[0]?.metricKey,
        lastKey: rows.at(-1)?.metricKey,
        greatestUpdatedAt: greatestUpdatedAt.toISOString(),
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
