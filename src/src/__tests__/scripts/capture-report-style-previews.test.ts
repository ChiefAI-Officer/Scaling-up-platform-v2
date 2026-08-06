import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("capture-report-style-previews credentials gate", () => {
  it("refuses generically before any browser or authentication attempt", () => {
    const env = { ...process.env };
    delete env.E2E_ADMIN_EMAIL;
    delete env.E2E_ADMIN_PASSWORD;
    env.PLAYWRIGHT_BROWSERS_PATH = join(process.cwd(), "definitely-not-a-browser");
    env.REPORT_STYLE_PREVIEW_BASE_URL = "http://127.0.0.1:1";

    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts", "capture-report-style-previews.mjs")],
      {
        cwd: process.cwd(),
        env,
        encoding: "utf8",
        timeout: 10_000,
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe(
      "Report style preview capture requires explicit admin credentials.",
    );
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toMatch(/chromium|playwright|login|email|password/i);
  });

  it("publishes a deterministic 27-entry anatomy/style/page capture contract", () => {
    const result = spawnSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "capture-report-style-previews.mjs"),
        "--print-manifest",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env },
        encoding: "utf8",
        timeout: 10_000,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const manifest = JSON.parse(result.stdout) as Array<{
      anatomy: string;
      style: string;
      page: string;
      format: string;
      output: string;
    }>;
    expect(manifest).toHaveLength(27);
    expect(new Set(manifest.map((entry) => entry.anatomy))).toEqual(
      new Set(["scored", "qualitative", "sparse-custom"]),
    );
    expect(
      manifest.filter((entry) => entry.style === "CLASSIC").every(
        (entry) => entry.format === "A4",
      ),
    ).toBe(true);
    expect(
      manifest.filter((entry) => entry.style !== "CLASSIC").every(
        (entry) => entry.format === "Letter",
      ),
    ).toBe(true);
    expect(new Set(manifest.map((entry) => entry.output)).size).toBe(27);
  });

  it("keeps the authenticated route as the default and exposes an explicit DB-free renderer mode", () => {
    const captureSource = readFileSync(
      join(process.cwd(), "scripts", "capture-report-style-previews.mjs"),
      "utf8",
    );
    const rendererSource = readFileSync(
      join(process.cwd(), "scripts", "render-report-style-qa.cjs"),
      "utf8",
    );

    expect(captureSource).toContain('process.argv.includes("--db-free")');
    expect(captureSource).toContain("render-report-style-qa.cjs");
    expect(rendererSource).toContain("buildReportStylePreviewReport");
    expect(rendererSource).toContain("BrandedReport");
  });
});
