/**
 * Guard / characterization tests for the Kajabi master-class landing HTML artifact.
 *
 * All tests load the artifact from disk — never inline the markup — so a change
 * to the file is immediately visible in CI.
 *
 * Repo-root is three levels up from this test file:
 *   src/src/__tests__/lib/templates/ → src/src/__tests__/lib/ → src/src/__tests__/
 *   → src/src/ → src/ → repo-root (docs/)
 */

import * as fs from "fs";
import * as path from "path";

// ── path helpers ───────────────────────────────────────────────────────────────
const REPO_ROOT = path.join(__dirname, "..", "..", "..", "..", "..");
const ARTIFACT_PATH = path.join(REPO_ROOT, "docs", "specs", "master-class-landing-kajabi.html");
const SPEC_PATH = path.join(REPO_ROOT, "docs", "specs", "master-class-landing-kajabi.md");

function loadArtifact(): string {
  return fs.readFileSync(ARTIFACT_PATH, "utf8");
}

function loadSpec(): string {
  return fs.readFileSync(SPEC_PATH, "utf8");
}

// ── Task 1 — Artifact ↔ spec sync ─────────────────────────────────────────────
describe("master-class artifact ↔ spec sync (CI guard)", () => {
  it("artifact file content equals the ```html fenced block in the spec", () => {
    const spec = loadSpec();
    const artifact = loadArtifact();

    // Extract the first ```html…``` block from the spec markdown.
    const match = spec.match(/```html\n([\s\S]*?)\n```/);
    expect(match).not.toBeNull();
    const extractedFromSpec = match![1];

    // The artifact file ends with a single trailing newline; trim it once.
    const artifactTrimmed = artifact.replace(/\n$/, "");

    expect(artifactTrimmed).toBe(extractedFromSpec);
  });
});

// ── Task 6 — Render-rules presence (cheap CI proxy) ───────────────────────────
describe("master-class artifact render-rules presence", () => {
  let artifact: string;

  beforeAll(() => {
    artifact = loadArtifact();
  });

  it("contains @import url with Fira+Sans from Google Fonts", () => {
    expect(artifact).toMatch(
      /@import url\('https:\/\/fonts\.googleapis\.com\/.*Fira\+Sans/
    );
  });

  it("contains @media(max-width:760px) responsive breakpoint", () => {
    expect(artifact).toContain("@media(max-width:760px)");
  });

  it("contains responsive .hero-card grid-template-columns:1fr inside the media block", () => {
    // The media block must reset the two-col hero to single-col.
    expect(artifact).toMatch(
      /@media\(max-width:760px\)\s*\{[\s\S]*?\.su-mc \.hero-card\s*\{[^}]*grid-template-columns\s*:\s*1fr\b/
    );
  });

  it("contains .ico-cal CSS rule", () => {
    expect(artifact).toContain(".su-mc .ico-cal");
  });

  it("contains .ico-clock CSS rule", () => {
    expect(artifact).toContain(".su-mc .ico-clock");
  });

  it("contains .ico-pin CSS rule", () => {
    expect(artifact).toContain(".su-mc .ico-pin");
  });

  // Defence: the artifact must never contain inline SVG (stripped by sanitizer),
  // <link> (stripped by sanitizer), or <iframe> (would need allowlisted host).
  it("artifact itself contains no <svg tags", () => {
    expect(artifact).not.toMatch(/<svg\b/i);
  });

  it("artifact itself contains no <link tags", () => {
    expect(artifact).not.toMatch(/<link\b/i);
  });

  it("artifact itself contains no <iframe tags", () => {
    expect(artifact).not.toMatch(/<iframe\b/i);
  });

  it("artifact itself contains no <path tags", () => {
    expect(artifact).not.toMatch(/<path\b/i);
  });

  it("artifact itself contains no <rect tags", () => {
    expect(artifact).not.toMatch(/<rect\b/i);
  });
});
