/**
 * @jest-environment jsdom
 */
import * as fs from "fs";
import * as path from "path";
import {
  sanitizeCustomHtml,
  FRAME_SRC_ALLOWLIST,
} from "@/lib/templates/sanitize-custom-html";

// ── path to the artifact (repo-root relative to this test file) ───────────────
// src/src/__tests__/lib/templates/ → up 5 → repo-root (where docs/ lives)
const REPO_ROOT = path.join(__dirname, "..", "..", "..", "..", "..");
const ARTIFACT_PATH = path.join(REPO_ROOT, "docs", "specs", "master-class-landing-kajabi.html");

describe("sanitizeCustomHtml", () => {
  it("1. passes through plain <p>Hello</p> unchanged", () => {
    const result = sanitizeCustomHtml("<p>Hello</p>");
    expect(result.sanitized).toContain("<p>Hello</p>");
    expect(result.didStripContent).toBe(false);
  });

  it("2. strips <script>alert(1)</script>", () => {
    const result = sanitizeCustomHtml("<script>alert(1)</script>");
    expect(result.sanitized).not.toContain("<script");
    expect(result.strippedTags).toContain("script");
    expect(result.didStripContent).toBe(true);
  });

  it("3. keeps <img src> but strips onerror", () => {
    const result = sanitizeCustomHtml(
      '<img src="https://example.com/x.jpg" onerror="bad()">'
    );
    expect(result.sanitized).toContain("<img");
    expect(result.sanitized).toContain('src="https://example.com/x.jpg"');
    expect(result.sanitized).not.toContain("onerror");
    expect(result.strippedAttrs).toContain("onerror");
  });

  it("4. allows iframe with vimeo src", () => {
    const result = sanitizeCustomHtml(
      '<iframe src="https://player.vimeo.com/video/123"></iframe>'
    );
    expect(result.sanitized).toContain("<iframe");
    expect(result.sanitized).toContain("https://player.vimeo.com/video/123");
    expect(result.strippedAttrs).not.toContain("iframe-src(blocked-host)");
  });

  it("5. allows iframe with youtube src", () => {
    const result = sanitizeCustomHtml(
      '<iframe src="https://www.youtube.com/embed/abc"></iframe>'
    );
    expect(result.sanitized).toContain("<iframe");
    expect(result.sanitized).toContain("https://www.youtube.com/embed/abc");
  });

  it("6. allows iframe with youtube-nocookie src", () => {
    const result = sanitizeCustomHtml(
      '<iframe src="https://youtube-nocookie.com/embed/abc"></iframe>'
    );
    expect(result.sanitized).toContain("<iframe");
    expect(result.sanitized).toContain("https://youtube-nocookie.com/embed/abc");
  });

  it("7. allows iframe with js.stripe.com src", () => {
    const result = sanitizeCustomHtml(
      '<iframe src="https://js.stripe.com/v3/"></iframe>'
    );
    expect(result.sanitized).toContain("<iframe");
    expect(result.sanitized).toContain("https://js.stripe.com/v3/");
  });

  it("8. blocks disallowed iframe host — strips src, keeps iframe", () => {
    const result = sanitizeCustomHtml(
      '<iframe src="https://evil.example.com/"></iframe>'
    );
    expect(result.sanitized).toContain("<iframe");
    expect(result.sanitized).not.toContain("evil.example.com");
    expect(result.strippedAttrs).toContain("iframe-src(blocked-host)");
  });

  it("9. removes srcdoc attribute (FORBID_ATTR)", () => {
    const result = sanitizeCustomHtml(
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>'
    );
    expect(result.sanitized).not.toContain("srcdoc");
    expect(result.strippedAttrs).toContain("srcdoc");
  });

  it("10. strips href=javascript: but keeps <a> tag", () => {
    const result = sanitizeCustomHtml(
      '<a href="javascript:alert(1)">x</a>'
    );
    expect(result.sanitized).toContain("<a");
    expect(result.sanitized).not.toContain("javascript:");
    expect(result.sanitized).toContain(">x</a>");
  });

  it("11. strips href=//evil.com (protocol-relative)", () => {
    const result = sanitizeCustomHtml('<a href="//evil.com/path">x</a>');
    expect(result.sanitized).not.toContain("evil.com");
    expect(result.sanitized).toContain("<a");
    expect(result.sanitized).toContain(">x</a>");
  });

  it("12. allows https absolute href", () => {
    const result = sanitizeCustomHtml(
      '<a href="https://example.com/page">x</a>'
    );
    expect(result.sanitized).toContain('href="https://example.com/page"');
  });

  it("13. allows relative href /workshop/foo", () => {
    const result = sanitizeCustomHtml('<a href="/workshop/foo">x</a>');
    expect(result.sanitized).toContain('href="/workshop/foo"');
  });

  it("14. allows mailto href", () => {
    const result = sanitizeCustomHtml(
      '<a href="mailto:test@example.com">x</a>'
    );
    expect(result.sanitized).toContain('href="mailto:test@example.com"');
  });

  it("15. allows <style> block", () => {
    const result = sanitizeCustomHtml("<style>body { color: red }</style>");
    expect(result.sanitized).toContain("<style");
    expect(result.sanitized).toContain("color: red");
  });

  it("16. allows inline style attribute", () => {
    const result = sanitizeCustomHtml('<div style="color: red">x</div>');
    expect(result.sanitized).toContain('style="color: red"');
  });

  it("17. strips doctype/html/head/title but keeps <p>hi</p>", () => {
    const result = sanitizeCustomHtml(
      "<!DOCTYPE html><html><head><title>x</title></head><body><p>hi</p></body></html>"
    );
    expect(result.sanitized).toContain("<p>hi</p>");
    expect(result.sanitized).not.toContain("<!DOCTYPE");
    expect(result.sanitized).not.toContain("<html");
    expect(result.sanitized).not.toContain("<head");
    expect(result.sanitized).not.toContain("<title");
  });

  it("18. handles empty string", () => {
    const result = sanitizeCustomHtml("");
    expect(result.sanitized).toBe("");
    expect(result.didStripContent).toBe(false);
    expect(result.strippedTags).toEqual([]);
    expect(result.strippedAttrs).toEqual([]);
  });

  it("19. concurrency-safe: parallel calls do not leak state", async () => {
    const [withScript, clean] = await Promise.all([
      Promise.resolve(sanitizeCustomHtml("<script>alert(1)</script><p>a</p>")),
      Promise.resolve(sanitizeCustomHtml("<p>b</p>")),
    ]);
    expect(withScript.strippedTags).toContain("script");
    expect(clean.strippedTags).not.toContain("script");
    expect(clean.didStripContent).toBe(false);
  });

  it("20. returns fresh arrays on subsequent calls (no shared refs)", () => {
    const a = sanitizeCustomHtml("<p>a</p>");
    const b = sanitizeCustomHtml("<p>b</p>");
    expect(a.strippedTags).not.toBe(b.strippedTags);
    expect(a.strippedAttrs).not.toBe(b.strippedAttrs);
  });

  // TEMPLATE-02 BLOCK-2: token URIs preserved in default (save-time) mode,
  // stripped in strict (post-interpolation re-sanitize) mode.
  describe("allowTokenUris option", () => {
    it("21. preserves {{registration_url}} in href when default mode (allowTokenUris=true)", () => {
      const result = sanitizeCustomHtml('<a href="{{registration_url}}">link</a>');
      expect(result.sanitized).toContain('href="{{registration_url}}"');
    });

    it("22. preserves {{ registration_url }} (spaced) in href when default mode", () => {
      const result = sanitizeCustomHtml('<a href="{{ registration_url }}">link</a>');
      expect(result.sanitized).toContain("href=");
      expect(result.sanitized).toMatch(/\{\{\s*registration_url\s*\}\}/);
    });

    it("23. strips {{registration_url}} href when allowTokenUris=false (strict mode)", () => {
      const result = sanitizeCustomHtml(
        '<a href="{{registration_url}}">link</a>',
        { allowTokenUris: false }
      );
      expect(result.sanitized).toContain("<a");
      expect(result.sanitized).not.toContain("{{registration_url}}");
      expect(result.sanitized).not.toContain("href=");
    });

    it("24. https URL survives both default and strict modes", () => {
      const loose = sanitizeCustomHtml('<a href="https://example.com">x</a>');
      const strict = sanitizeCustomHtml(
        '<a href="https://example.com">x</a>',
        { allowTokenUris: false }
      );
      expect(loose.sanitized).toContain('href="https://example.com"');
      expect(strict.sanitized).toContain('href="https://example.com"');
    });

    it("25. javascript: href stripped in both modes", () => {
      const loose = sanitizeCustomHtml('<a href="javascript:alert(1)">x</a>');
      const strict = sanitizeCustomHtml(
        '<a href="javascript:alert(1)">x</a>',
        { allowTokenUris: false }
      );
      expect(loose.sanitized).not.toContain("javascript:");
      expect(strict.sanitized).not.toContain("javascript:");
    });

    it("26. {{coach_photo}} <img src> survives default mode, stripped in strict mode", () => {
      const loose = sanitizeCustomHtml('<img src="{{coach_photo}}">');
      const strict = sanitizeCustomHtml(
        '<img src="{{coach_photo}}">',
        { allowTokenUris: false }
      );
      expect(loose.sanitized).toContain('src="{{coach_photo}}"');
      expect(strict.sanitized).toContain("<img");
      expect(strict.sanitized).not.toContain("{{coach_photo}}");
    });
  });

  it("FRAME_SRC_ALLOWLIST is exported and contains expected hosts", () => {
    expect(Array.isArray(FRAME_SRC_ALLOWLIST)).toBe(true);
    expect(FRAME_SRC_ALLOWLIST.length).toBeGreaterThanOrEqual(4);
    expect(
      FRAME_SRC_ALLOWLIST.some((r) => r.test("https://player.vimeo.com/x"))
    ).toBe(true);
    expect(
      FRAME_SRC_ALLOWLIST.some((r) => r.test("https://js.stripe.com/v3/"))
    ).toBe(true);
    expect(
      FRAME_SRC_ALLOWLIST.some((r) => r.test("https://www.youtube.com/embed/x"))
    ).toBe(true);
  });
});

// ── Task 2 — Artifact survives sanitization ────────────────────────────────────
describe("master-class artifact survives sanitizeCustomHtml (default mode)", () => {
  let artifact: string;
  let result: ReturnType<typeof sanitizeCustomHtml>;

  beforeAll(() => {
    artifact = fs.readFileSync(ARTIFACT_PATH, "utf8");
    result = sanitizeCustomHtml(artifact);
  });

  it("didStripContent is false", () => {
    expect(result.didStripContent).toBe(false);
  });

  it("sanitized output contains @import", () => {
    expect(result.sanitized).toContain("@import");
  });

  it("sanitized output contains data-su-mc", () => {
    expect(result.sanitized).toContain("data-su-mc");
  });

  it("sanitized output contains href=\"{{registration_url}}\"", () => {
    expect(result.sanitized).toContain('href="{{registration_url}}"');
  });

  it("sanitized output contains src=\"{{coach_photo}}\"", () => {
    expect(result.sanitized).toContain('src="{{coach_photo}}"');
  });

  it("sanitized output contains {{workshop_description}}", () => {
    expect(result.sanitized).toContain("{{workshop_description}}");
  });

  it("sanitized output contains .ico-cal", () => {
    expect(result.sanitized).toContain(".ico-cal");
  });

  it("sanitized output does NOT contain <svg", () => {
    expect(result.sanitized).not.toMatch(/<svg\b/i);
  });

  it("sanitized output does NOT contain <path", () => {
    expect(result.sanitized).not.toMatch(/<path\b/i);
  });

  it("sanitized output does NOT contain <rect", () => {
    expect(result.sanitized).not.toMatch(/<rect\b/i);
  });

  it("sanitized output does NOT contain <link", () => {
    expect(result.sanitized).not.toMatch(/<link\b/i);
  });

  it("sanitized output does NOT contain <iframe", () => {
    expect(result.sanitized).not.toMatch(/<iframe\b/i);
  });

  // Defence: verify the raw artifact itself is also free of stripped elements.
  it("raw artifact contains no <svg tags", () => {
    expect(artifact).not.toMatch(/<svg\b/i);
  });

  it("raw artifact contains no <link tags", () => {
    expect(artifact).not.toMatch(/<link\b/i);
  });

  it("raw artifact contains no <iframe tags", () => {
    expect(artifact).not.toMatch(/<iframe\b/i);
  });
});
