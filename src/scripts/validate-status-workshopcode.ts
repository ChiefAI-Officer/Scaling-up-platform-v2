/**
 * P1 cross-check:
 * - Canonical 6-stage workshop statuses are present in validation + UI labels.
 * - workshopCode propagation fields are present in schema.
 *
 * Usage: npx tsx scripts/validate-status-workshopcode.ts
 */

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const REQUIRED_STATUSES = [
  "INFO_REQUESTED",
  "AWAITING_APPROVAL",
  "PRE_EVENT",
  "POST_EVENT",
  "COMPLETED",
  "CANCELED",
] as const;

function readFile(relativePath: string): string {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing file: ${relativePath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

function assertHasAllStatuses(source: string, sourceName: string): void {
  const missing = REQUIRED_STATUSES.filter((status) => !source.includes(status));
  if (missing.length > 0) {
    throw new Error(`${sourceName} is missing status values: ${missing.join(", ")}`);
  }
}

function assertWorkshopCodePresence(schema: string): void {
  const requiredSnippets = [
    "model Workshop {",
    "workshopCode   String    @unique",
    "model WorkflowAssignment {",
    "workshopCode String",
    "model Survey {",
    "workshopCode   String?",
    "model FileAttachment {",
    "workshopCode String?",
    "model WorkshopPage {",
    "workshopCode String",
  ];

  const missing = requiredSnippets.filter((snippet) => !schema.includes(snippet));
  if (missing.length > 0) {
    throw new Error(
      `Schema is missing expected workshopCode propagation snippets:\n- ${missing.join("\n- ")}`
    );
  }
}

async function main() {
  const validationsTs = readFile("src/lib/validations.ts");
  const utilsTs = readFile("src/lib/utils.ts");
  const schemaPrisma = readFile("prisma/schema.prisma");

  assertHasAllStatuses(validationsTs, "src/lib/validations.ts");
  assertHasAllStatuses(utilsTs, "src/lib/utils.ts");
  assertWorkshopCodePresence(schemaPrisma);

  console.log("✅ Status/workshopCode cross-check passed.");
}

main().catch((error) => {
  console.error("❌ Status/workshopCode cross-check failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
