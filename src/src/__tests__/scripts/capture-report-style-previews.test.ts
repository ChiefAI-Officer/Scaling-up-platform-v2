import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type FontSeam = {
  css: string;
  variables: Record<string, { variable: string }>;
};

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

  it("uses generated production font variables and self-hosted font bytes in DB-free rendering", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadReportStyleFontSeam } = require(
      join(process.cwd(), "scripts", "report-style-font-seam.cjs"),
    ) as { loadReportStyleFontSeam: (root: string) => FontSeam };
    const temporaryRoot = mkdtempSync(join(tmpdir(), "report-style-font-seam-"));
    const chunks = join(temporaryRoot, ".next", "static", "chunks");
    mkdirSync(chunks, { recursive: true });
    writeFileSync(join(chunks, "assessment.woff2"), Buffer.from("font-bytes"));
    writeFileSync(
      join(chunks, "assessment.css"),
      [
        '@font-face{font-family:"Assessment";src:url(./assessment.woff2)}',
        ".inter_test__variable{--font-assessment-inter:\"Assessment\"}",
        ".playfair_display_test__variable{--font-assessment-display:\"Assessment\"}",
        ".roboto_test__variable{--font-assessment-body:\"Assessment\"}",
      ].join("\n"),
    );

    try {
      const seam = loadReportStyleFontSeam(temporaryRoot);
      expect(seam.variables.Inter.variable).toBe("inter_test__variable");
      expect(seam.variables.Playfair_Display.variable).toBe(
        "playfair_display_test__variable",
      );
      expect(seam.variables.Roboto.variable).toBe("roboto_test__variable");
      expect(seam.css).toContain("data:font/woff2;base64,");

      const markup = spawnSync(
        process.execPath,
        [
          join(process.cwd(), "scripts", "render-report-style-qa.cjs"),
          "EXECUTIVE_BOARDROOM",
          "scored",
          "normal",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            REPORT_STYLE_FONT_ASSET_ROOT: temporaryRoot,
          },
          timeout: 10_000,
        },
      );
      expect(markup.status).toBe(0);
      expect(markup.stdout).toContain(seam.variables.Inter.variable);
      expect(markup.stdout).toContain(seam.variables.Playfair_Display.variable);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it(
    "executes nonblank image and PDF content checks against real artifacts",
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sharp = require("sharp") as (typeof import("sharp"))["default"];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { chromium } = require("playwright") as typeof import("playwright");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const integrity = require(
        join(process.cwd(), "scripts", "report-style-capture-integrity.cjs"),
      ) as {
        assertMeaningfulImage: (
          path: string,
          expected?: { width?: number; height?: number },
        ) => Promise<unknown>;
        assertSinglePagePdf: (
          path: string,
          format: "A4" | "Letter",
          options?: { markers?: string[]; rasterDirectory?: string },
        ) => Promise<unknown>;
      };

      const temporaryRoot = mkdtempSync(
        join(tmpdir(), "report-style-integrity-test-"),
      );
      const meaningful = join(temporaryRoot, "meaningful.png");
      const blank = join(temporaryRoot, "blank.png");
      const pdf = join(temporaryRoot, "meaningful.pdf");
      const originalSetImmediate = global.setImmediate;
      if (typeof global.setImmediate !== "function") {
        global.setImmediate = ((
          callback: (...args: unknown[]) => void,
          ...args: unknown[]
        ) => setTimeout(callback, 0, ...args)) as unknown as typeof setImmediate;
      }
      const browser = await chromium.launch({ headless: true });
      try {
        await sharp({
          create: {
            width: 320,
            height: 180,
            channels: 3,
            background: "#ffffff",
          },
        })
          .composite([
            {
              input: Buffer.from(
                '<svg width="320" height="180"><rect x="20" y="20" width="280" height="100" fill="#522583"/><text x="35" y="80" fill="white" font-size="28">ABC Corp</text></svg>',
              ),
            },
          ])
          .png()
          .toFile(meaningful);
        await sharp({
          create: {
            width: 320,
            height: 180,
            channels: 3,
            background: "#ffffff",
          },
        })
          .png()
          .toFile(blank);

        await expect(
          integrity.assertMeaningfulImage(meaningful, {
            width: 320,
            height: 180,
          }),
        ).resolves.toEqual(expect.objectContaining({ width: 320, height: 180 }));
        await expect(
          integrity.assertMeaningfulImage(blank),
        ).rejects.toThrow(/foreground coverage|blank or flat/i);

        const page = await browser.newPage();
        await page.setContent(
          '<main style="border-top:80px solid #522583;padding:48px;background:#f7f3fb;min-height:700px"><h1>Confidential assessment report</h1><p>ABC Corp renderer evidence</p></main>',
        );
        await page.pdf({ path: pdf, format: "A4", printBackground: true });
        await expect(
          integrity.assertSinglePagePdf(pdf, "A4", {
            markers: ["Confidential assessment report", "ABC Corp"],
            rasterDirectory: temporaryRoot,
          }),
        ).resolves.toEqual(expect.objectContaining({ pages: 1 }));
        await expect(
          integrity.assertSinglePagePdf(pdf, "A4", {
            markers: ["missing renderer marker"],
          }),
        ).rejects.toThrow(/missing expected content/i);
      } finally {
        await browser.close();
        global.setImmediate = originalSetImmediate;
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
