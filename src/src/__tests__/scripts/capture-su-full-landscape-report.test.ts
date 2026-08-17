import { existsSync, readFileSync } from "node:fs";
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
});
