import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const appRoot = join(process.cwd());

describe("capture:invitation-banner", () => {
  it("renders the seven synthetic universal-banner acceptance cases without email delivery", () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), "invitation-banner-previews-"));

    try {
      const result = spawnSync("npm", ["run", "capture:invitation-banner", "--", outputDirectory], {
        cwd: appRoot,
        encoding: "utf8",
        timeout: 60_000,
      });

      expect(result.status).toBe(0);
      expect(readdirSync(outputDirectory).sort()).toEqual([
        "01-image-name-markdown-desktop.png",
        "02-name-only-markdown-desktop.png",
        "03-scaling-up-only-markdown-desktop.png",
        "04-image-name-custom-html-desktop.png",
        "05-image-name-markdown-mobile.png",
        "06-name-only-long-name-mobile.png",
        "07-image-blocked-desktop.png",
        "index.html",
      ]);

      const manifest = readFileSync(join(outputDirectory, "index.html"), "utf8");
      expect(manifest).toContain('data-renderer="buildInvitationEmailShell"');
      expect(manifest).toContain("Your coach");
      expect(manifest).not.toMatch(/smtp|customer|organization-banner/i);
      expect(manifest).not.toMatch(/@|password|token|secret/i);
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});
