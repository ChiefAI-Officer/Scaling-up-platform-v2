import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  compilePhasePeerCatalogue,
  hashPhasePeerVector,
  renderPhasePeerCatalogueModule,
} from "@/lib/assessments/su-full-phase-peer-catalogue-generator";
import {
  SU_FULL_PHASE_PEER_VECTORS,
} from "@/lib/assessments/su-full-phase-peer-catalogue";

const csv = readFileSync(
  join(
    process.cwd(),
    "../docs/research/esperto-feedback-five-phase-full-matrix-2026-08-20.csv",
  ),
  "utf8",
);

const CATALOGUE_ERROR = /^(SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE|SU_FULL_PHASE_PEERS_HASH_MISMATCH):/;
const CANONICAL_KEYS = Array.from(
  { length: 61 },
  (_, index) => `Q${String(index + 1).padStart(2, "0")}`,
);

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
  const checkedIn = readFileSync(
    join(process.cwd(), "src/lib/assessments/su-full-phase-peer-catalogue.ts"),
    "utf8",
  );

  expect(second).toBe(first);
  expect(first).toBe(checkedIn);
});

it("pins every complete canonical vector and the exact P3-P4-P5 transition", () => {
  const expectedHashes = {
    1: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
    2: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
    3: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
    4: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
    5: "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd",
  } as const;

  for (const phase of [1, 2, 3, 4, 5] as const) {
    expect(Object.keys(SU_FULL_PHASE_PEER_VECTORS[phase])).toEqual(CANONICAL_KEYS);
    expect(hashPhasePeerVector(SU_FULL_PHASE_PEER_VECTORS[phase])).toBe(
      expectedHashes[phase],
    );
  }
  for (const phase of [1, 2, 3, 5] as const) {
    expect(SU_FULL_PHASE_PEER_VECTORS[phase]).toEqual(
      SU_FULL_PHASE_PEER_VECTORS[1],
    );
  }

  const p3ToP4Changed = CANONICAL_KEYS.filter(
    (stableKey) =>
      SU_FULL_PHASE_PEER_VECTORS[3][stableKey]
      !== SU_FULL_PHASE_PEER_VECTORS[4][stableKey],
  );
  const p3ToP4Unchanged = CANONICAL_KEYS.filter(
    (stableKey) =>
      SU_FULL_PHASE_PEER_VECTORS[3][stableKey]
      === SU_FULL_PHASE_PEER_VECTORS[4][stableKey],
  );
  const p4ToP5Reverted = CANONICAL_KEYS.filter(
    (stableKey) =>
      SU_FULL_PHASE_PEER_VECTORS[4][stableKey]
      !== SU_FULL_PHASE_PEER_VECTORS[5][stableKey],
  );

  expect(p3ToP4Changed).toHaveLength(56);
  expect(p3ToP4Unchanged).toEqual(["Q27", "Q30", "Q38", "Q41", "Q57"]);
  expect(p4ToP5Reverted).toHaveLength(56);
  expect(p4ToP5Reverted).toEqual(p3ToP4Changed);
});

it("renders a helper that distinguishes a valid zero peer value from a missing key", () => {
  const compiled = compilePhasePeerCatalogue(csv);
  const rendered = renderPhasePeerCatalogueModule({
    ...compiled,
    phaseVectors: {
      ...compiled.phaseVectors,
      1: { ...compiled.phaseVectors[1], Q01: 0 },
    },
  });

  expect(rendered).toContain('"Q01": 0');
  expect(rendered).toContain(
    "if (SU_FULL_PHASE_PEER_VECTORS[1][stableKey] === undefined)",
  );
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

  expect(duplicate).toBeDefined();
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
