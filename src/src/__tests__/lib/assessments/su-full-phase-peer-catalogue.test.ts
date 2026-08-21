import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  compilePhasePeerCatalogue,
  renderPhasePeerCatalogueModule,
} from "@/lib/assessments/su-full-phase-peer-catalogue-generator";

const csv = readFileSync(
  join(
    process.cwd(),
    "../docs/research/esperto-feedback-five-phase-full-matrix-2026-08-20.csv",
  ),
  "utf8",
);

const CATALOGUE_ERROR = /^(SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE|SU_FULL_PHASE_PEERS_HASH_MISMATCH):/;

function expectCompilationFailure(input: string): void {
  expect(() => compilePhasePeerCatalogue(input)).toThrow(CATALOGUE_ERROR);
}

it("compiles all audited reports into five score-invariant phase vectors", () => {
  const compiled = compilePhasePeerCatalogue(csv);

  expect(compiled.sourceRowCount).toBe(3355);
  expect(compiled.reportCount).toBe(55);
  expect(Object.keys(compiled.phaseVectors)).toEqual(["1", "2", "3", "4", "5"]);
  for (const phase of [1, 2, 3, 4, 5] as const) {
    expect(Object.keys(compiled.phaseVectors[phase])).toHaveLength(61);
  }
  expect(compiled.contentHashes).toEqual({
    1: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
    2: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
    3: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
    4: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
    5: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  });
  expect(compiled.phaseVectors[1].Q01).toBe(6.3);
  expect(compiled.phaseVectors[4].Q01).toBe(6.6);
});

it("renders byte-identical TypeScript on repeated compilation", () => {
  const first = renderPhasePeerCatalogueModule(compilePhasePeerCatalogue(csv));
  const second = renderPhasePeerCatalogueModule(compilePhasePeerCatalogue(csv));

  expect(second).toBe(first);
});

it("rejects a missing audited phase-score-question row", () => {
  const rows = csv.trimEnd().split("\n");
  const missingRow = rows.findIndex((row) => row.startsWith("P1,Pioneering,3,0,Q01,"));
  rows.splice(missingRow, 1);

  expectCompilationFailure(`${rows.join("\n")}\n`);
});

it("rejects a duplicate audited phase-score-question row", () => {
  const rows = csv.trimEnd().split("\n");
  const duplicate = rows.find((row) => row.startsWith("P1,Pioneering,3,0,Q01,"));

  expectCompilationFailure(`${csv.trimEnd()}\n${duplicate}\n`);
});

it("rejects a peer value that changes between scores in one phase", () => {
  const changed = csv.replace(
    /^(P1,Pioneering,3,1,Q04,[^\n]*?),5\.9,([^,\n]+),([^\n]+)$/m,
    "$1,5.8,$2,$3",
  );

  expect(changed).not.toBe(csv);
  expectCompilationFailure(changed);
});

it("rejects a peer value outside the governed zero-to-ten range", () => {
  const changed = csv.replace(
    /^(P1,Pioneering,3,0,Q04,[^\n]*?),5\.9,([^,\n]+),([^\n]+)$/m,
    "$1,10.1,$2,$3",
  );

  expect(changed).not.toBe(csv);
  expectCompilationFailure(changed);
});

it("rejects an unknown phase label", () => {
  const changed = csv.replace("P1,Pioneering,3,0,Q01,", "PX,Pioneering,3,0,Q01,");

  expectCompilationFailure(changed);
});
