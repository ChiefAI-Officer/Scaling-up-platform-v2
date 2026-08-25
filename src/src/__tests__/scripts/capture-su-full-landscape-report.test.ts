import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = join(
  process.cwd(),
  "scripts",
  "capture-su-full-landscape-report.tsx",
);

test("captures the canonical landscape fixture as a CSS-sized print PDF", () => {
  expect(existsSync(scriptPath)).toBe(true);

  const script = readFileSync(scriptPath, "utf8");
  expect(script).toContain("completeSuFullLandscapeReport");
  expect(script).toContain("completeSuFullLandscapePresentation");
  expect(script).toContain("buildSuFullLandscapeReportModel");
  expect(script).toContain("renderToStaticMarkup");
  expect(script).toContain("su-report.css");
  expect(script).toContain("chromium.launch");
  expect(script).toContain('emulateMedia({ media: "print" })');
  expect(script).toContain("preferCSSPageSize: true");
  expect(script).toContain("landscape: true");
  expect(script).toContain("printBackground: true");
  expect(script).toContain("tmp/pdfs/su-full-landscape-fixture.pdf");
  expect(script).not.toContain('<div className="su-public-brand su-report su-full-landscape">');
});

test.each([
  { variant: "edition-6", pages: 25, requiredText: "PREFACE" },
  { variant: "null-preface", pages: 24, requiredText: "TABLE OF CONTENTS" },
])("captures the $variant fixture as a sequential $pages-page PDF", ({ variant, pages, requiredText }) => {
  const directory = mkdtempSync(join(tmpdir(), "su-full-landscape-capture-"));
  const pdfPath = join(directory, `${variant}.pdf`);

  try {
    execFileSync(join(process.cwd(), "node_modules", ".bin", "tsx"), [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SU_FULL_LANDSCAPE_CAPTURE_VARIANT: variant,
        SU_FULL_LANDSCAPE_CAPTURE_OUTPUT: pdfPath,
      },
      stdio: "pipe",
    });

    expect(existsSync(pdfPath)).toBe(true);
    expect(execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" })).toMatch(
      new RegExp(`^Pages:\\s+${pages}$`, "m"),
    );
    expect(execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" })).toContain(requiredText);
    expect(execFileSync("pdfimages", ["-list", pdfPath], { encoding: "utf8" })).not.toMatch(
      /^\s*1\s+\d+\s+\w+\s+14\s+16\s/m,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
