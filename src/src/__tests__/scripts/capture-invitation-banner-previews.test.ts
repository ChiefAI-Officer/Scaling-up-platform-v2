import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const appRoot = join(process.cwd());
const forbiddenManifestValues = [
  "Avery",
  "Preview",
  "Morgan Coach",
  "Dr. Alexandria Penelope Montgomery-Smythe, Executive Leadership Coach",
  "Synthetic preview organization",
  "Sample leadership assessment",
  "Sample assessment",
  "Hi Avery,",
  "Hello Avery,",
  "Your perspective matters.",
  "Please complete the assessment.",
  "Your input will help focus our next conversation.",
  "Please share your assessment responses.",
  "Bring your candid perspective",
  "Bring your candid perspective to this assessment.",
  "Please complete the assessment when you have a few minutes.",
  "Your response is important.",
  "The banner remains readable when the coach image is unavailable.",
];

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
      expect(manifest).toContain('data-assertions="byline-state,cta,fallback,footer,no-horizontal-overflow"');
      expect(manifest).toContain('data-fixture-values="excluded"');
      expect(manifest).toContain("Your coach");
      expect(manifest).not.toMatch(/smtp|customer|organization-banner/i);
      expect(manifest).not.toMatch(/@|password|token|secret/i);
      for (const forbiddenValue of forbiddenManifestValues) {
        expect(manifest).not.toContain(forbiddenValue);
      }
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});
