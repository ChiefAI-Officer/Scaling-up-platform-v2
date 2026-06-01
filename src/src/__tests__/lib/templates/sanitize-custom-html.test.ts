/**
 * @jest-environment jsdom
 */
import {
  sanitizeCustomHtml,
  FRAME_SRC_ALLOWLIST,
} from "@/lib/templates/sanitize-custom-html";

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
