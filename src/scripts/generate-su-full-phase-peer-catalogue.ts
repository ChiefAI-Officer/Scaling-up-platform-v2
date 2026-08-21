import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  compilePhasePeerCatalogue,
  renderPhasePeerCatalogueModule,
} from "../src/lib/assessments/su-full-phase-peer-catalogue-generator";

const sourcePath = resolve(
  process.cwd(),
  "../docs/research/esperto-feedback-five-phase-full-matrix-2026-08-20.csv",
);
const outputPath = resolve(
  process.cwd(),
  "src/lib/assessments/su-full-phase-peer-catalogue.ts",
);

const output = renderPhasePeerCatalogueModule(
  compilePhasePeerCatalogue(readFileSync(sourcePath, "utf8")),
);
writeFileSync(outputPath, output, "utf8");
