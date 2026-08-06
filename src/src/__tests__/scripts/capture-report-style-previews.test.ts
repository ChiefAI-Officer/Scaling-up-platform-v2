import { spawnSync } from "node:child_process";
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
});
