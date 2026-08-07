import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  REPORT_STYLE_PREVIEW_ANATOMIES,
  REPORT_STYLE_PREVIEW_VARIANTS,
  buildReportStylePreviewPresentation,
  buildReportStylePreviewReport,
} from "@/lib/assessments/report-style-preview-fixture";

function serializedFixtureMatrix(): string {
  return JSON.stringify(
    REPORT_STYLE_PREVIEW_ANATOMIES.flatMap((anatomy) =>
      REPORT_STYLE_PREVIEW_VARIANTS.map((variant) =>
        buildReportStylePreviewReport(anatomy, variant),
      ),
    ),
  );
}

describe("report-style preview fixtures", () => {
  it("provides scored, qualitative, and sparse-custom reports through the real neutral adapter", () => {
    expect(REPORT_STYLE_PREVIEW_ANATOMIES).toEqual([
      "scored",
      "qualitative",
      "sparse-custom",
    ]);

    const scored = buildReportStylePreviewPresentation("scored", "normal");
    const qualitative = buildReportStylePreviewPresentation("qualitative", "normal");
    const sparse = buildReportStylePreviewPresentation("sparse-custom", "normal");

    expect(scored.blocks.map((block) => block.kind)).toEqual(
      expect.arrayContaining([
        "score-summary",
        "metric-group",
        "recommendation",
        "additional-response",
      ]),
    );
    expect(qualitative.blocks.map((block) => block.kind)).toEqual(
      expect.arrayContaining([
        "metric-group",
        "qualitative-scale",
        "theme",
        "narrative-response",
        "finding",
      ]),
    );
    expect(qualitative.blocks.some((block) => block.kind === "score-summary")).toBe(false);
    expect(sparse.blocks).toEqual([
      expect.objectContaining({
        kind: "narrative-response",
        stableKey: "founder-reflections",
      }),
      expect.objectContaining({
        kind: "narrative-response",
        stableKey: "operating-reflections",
      }),
    ]);
    expect(
      sparse.blocks.some((block) =>
        [
          "score-summary",
          "metric-group",
          "qualitative-scale",
          "finding",
          "recommendation",
          "coach-cta",
          "closing",
        ].includes(block.kind),
      ),
    ).toBe(false);
  });

  it("keeps every anatomy serializable, synthetic, and free of production/customer identifiers", () => {
    const serialized = serializedFixtureMatrix();

    for (const anatomy of REPORT_STYLE_PREVIEW_ANATOMIES) {
      const report = buildReportStylePreviewReport(anatomy, "normal");
      expect(report.companyName).toBe("ABC Corp");
      expect(report.submittedAt.toISOString()).toBe("2026-01-15T12:00:00.000Z");
      expect(report.provenance).toMatchObject({
        submissionId: expect.stringMatching(/^preview_/),
        versionId: expect.stringMatching(/^preview_/),
        contentHash: expect.stringMatching(/^preview_/),
      });
    }

    expect(serialized.length).toBeGreaterThan(5_000);
    expect(serialized).not.toMatch(/@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(serialized).not.toMatch(
      /(?:prod|customer|respondent|organization|campaign|submission|version)[-_](?!preview)[a-z0-9_-]+/i,
    );
  });

  it("builds maximum-length and missing-block cases without empty semantic blocks", () => {
    for (const anatomy of REPORT_STYLE_PREVIEW_ANATOMIES) {
      const maximum = buildReportStylePreviewPresentation(anatomy, "max-length");
      const missing = buildReportStylePreviewPresentation(anatomy, "missing-blocks");
      expect(JSON.stringify(maximum)).toContain("deliberately long synthetic");

      for (const block of missing.blocks) {
        for (const value of Object.values(block)) {
          if (Array.isArray(value) && value.length === 0) {
            expect(block).toEqual(
              expect.objectContaining({
                kind: "metric-group",
                summary: expect.any(Object),
              }),
            );
          }
        }
      }
      expect(missing.blocks.some((block) => block.kind === "coach-cta")).toBe(false);
      expect(missing.blocks.some((block) => block.kind === "recommendation")).toBe(false);
      expect(missing.blocks.some((block) => block.kind === "finding")).toBe(false);
    }
  });

  it("makes every sparse stress variant semantically and visually distinct without metrics", () => {
    const variants = [
      "normal",
      "partial",
      "degraded",
      "max-length",
      "missing-blocks",
    ] as const;
    const presentations = variants.map((variant) =>
      buildReportStylePreviewPresentation("sparse-custom", variant),
    );
    const fingerprints = presentations.map((presentation) =>
      createHash("sha256").update(JSON.stringify(presentation)).digest("hex"),
    );

    expect(new Set(fingerprints).size).toBe(variants.length);
    for (const presentation of presentations) {
      expect(
        presentation.blocks.some((block) =>
          ["score-summary", "metric-group", "qualitative-scale", "theme"].includes(
            block.kind,
          ),
        ),
      ).toBe(false);
    }
    expect(presentations[0].blocks).toHaveLength(2);
    expect(presentations[1].blocks).toEqual([
      expect.objectContaining({
        kind: "narrative-response",
        stableKey: "founder-reflections",
      }),
    ]);
    expect(presentations[2].blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "additional-response" }),
      ]),
    );
    expect(JSON.stringify(presentations[3])).toContain(
      "deliberately long synthetic",
    );
    expect(presentations[4].blocks).toEqual([
      expect.objectContaining({
        kind: "narrative-response",
        stableKey: "operating-reflections",
      }),
    ]);
  });

  it("returns fresh deeply frozen reports and presentations", () => {
    const firstReport = buildReportStylePreviewReport("scored", "normal");
    const secondReport = buildReportStylePreviewReport("scored", "normal");
    const presentation = buildReportStylePreviewPresentation("qualitative", "normal");

    expect(firstReport).not.toBe(secondReport);
    expect(Object.isFrozen(firstReport)).toBe(true);
    expect(Object.isFrozen(firstReport.result)).toBe(true);
    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation.blocks)).toBe(true);
    expect(() => {
      firstReport.respondentName = "mutated";
    }).toThrow();
  });

  it("uses the production adapter without importing a database or respondent-report loader", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/assessments/report-style-preview-fixture.ts"),
      "utf8",
    );

    expect(source).toContain("buildIndividualReportPresentation");
    expect(source).not.toMatch(/from\s+["']@\/lib\/db["']/);
    expect(source).not.toMatch(
      /from\s+["']@\/lib\/assessments\/respondent-report["'](?!\s*;?\s*$)/m,
    );
  });
});
