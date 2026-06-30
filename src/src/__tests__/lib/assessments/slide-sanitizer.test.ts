import { sanitizeSlideHtml } from "@/lib/assessments/slide-sanitizer";

// ──────────────────────────────────────────────────────────────────────────
// sanitizeSlideHtml — STRICT, server-only, coach-authored, PARTICIPANT-facing
// slide HTML sanitizer (Wave M/N item 5).
//
// Stricter than the ADMIN-trusted lib/templates/sanitize-custom-html.ts (which
// allows <style>/<iframe> and passes inline styles un-allowlisted). Here:
//   - DROP: <script>, <style>, <iframe>, all on* handlers, ALL style attrs.
//   - ALLOW: text formatting tags + <img>.
//   - <a href>: https/mailto/tel only.
//   - <img src>: https + data: only, but BLOCK data:image/svg+xml; drop srcset.
//   - Protocol-relative (//evil.com) blocked.
// Warnings are populated when something material is stripped.
// ──────────────────────────────────────────────────────────────────────────

describe("sanitizeSlideHtml — neutralizes malicious fixtures", () => {
  test("strips <script> entirely (no tag, no payload) + warns", () => {
    const { html, warnings } = sanitizeSlideHtml("<p>hi</p><script>alert(1)</script>");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/alert\(1\)/);
    expect(html).toContain("<p>hi</p>");
    expect(warnings.join(" ")).toMatch(/script/i);
  });

  test("strips <img onerror> handler + payload, keeps no event attr + warns", () => {
    const { html, warnings } = sanitizeSlideHtml('<img src="https://x.com/a.png" onerror=alert(1)>');
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/alert\(1\)/);
    expect(warnings.join(" ")).toMatch(/event handler|on/i);
  });

  test("strips bare <img src=x onerror=...>", () => {
    const { html } = sanitizeSlideHtml("<img src=x onerror=alert(1)>");
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/alert\(1\)/);
  });

  test("strips <style> block entirely + warns", () => {
    const { html, warnings } = sanitizeSlideHtml(
      "<style>body{display:none}</style><p>ok</p>",
    );
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/display:none/);
    expect(html).toContain("<p>ok</p>");
    expect(warnings.join(" ")).toMatch(/style/i);
  });

  test("strips inline style attribute carrying url(javascript:) + warns", () => {
    const { html, warnings } = sanitizeSlideHtml(
      '<p style="background:url(javascript:alert(1))">hi</p>',
    );
    expect(html).not.toMatch(/style=/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/url\(/i);
    expect(html).toContain("hi");
    expect(warnings.join(" ")).toMatch(/inline style/i);
  });

  test("strips escaped/nested url(\\27 javascript...) inline style", () => {
    const { html } = sanitizeSlideHtml(
      "<div style=\"background:url(\\27 javascript:alert(1)\\27)\">x</div>",
    );
    expect(html).not.toMatch(/style=/i);
    expect(html).not.toMatch(/javascript/i);
    expect(html).toContain("x");
  });

  test("strips @import inside a <style> block", () => {
    const { html } = sanitizeSlideHtml(
      "<style>@import url('https://evil.com/x.css');</style><p>ok</p>",
    );
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/evil\.com/i);
    expect(html).toContain("<p>ok</p>");
  });

  test("blocks protocol-relative //evil.com img src", () => {
    const { html } = sanitizeSlideHtml('<img src="//evil.com/x.png" alt="a">');
    expect(html).not.toMatch(/evil\.com/i);
    expect(html).not.toMatch(/src=["']\/\//);
  });

  test("blocks protocol-relative //evil.com href", () => {
    const { html } = sanitizeSlideHtml('<a href="//evil.com/x">x</a>');
    expect(html).not.toMatch(/evil\.com/i);
    expect(html).not.toMatch(/href=["']\/\//);
  });

  test("blocks data:image/svg+xml img (SVG can carry script)", () => {
    const svg =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==";
    const { html } = sanitizeSlideHtml(`<img src="${svg}" alt="a">`);
    expect(html).not.toMatch(/svg\+xml/i);
    expect(html).not.toMatch(/src=["']data:/i);
  });

  test("blocks data:image/svg+xml even with utf8 (non-base64) payload", () => {
    const { html } = sanitizeSlideHtml(
      '<img src="data:image/svg+xml,<svg onload=alert(1)></svg>" alt="a">',
    );
    expect(html).not.toMatch(/svg/i);
    expect(html).not.toMatch(/onload/i);
    expect(html).not.toMatch(/alert/i);
  });

  test("drops srcset on <img> (avoids un-validated candidate URLs)", () => {
    const { html } = sanitizeSlideHtml(
      '<img src="https://acme.com/a.png" srcset="//evil.com/x.png 1x, data:image/svg+xml,foo 2x" alt="a">',
    );
    expect(html).not.toMatch(/srcset/i);
    expect(html).not.toMatch(/evil\.com/i);
    expect(html).not.toMatch(/svg\+xml/i);
    // The legit https src survives.
    expect(html).toMatch(/https:\/\/acme\.com\/a\.png/);
  });

  test("strips <iframe> entirely + warns", () => {
    const { html, warnings } = sanitizeSlideHtml(
      '<iframe src="https://evil.com"></iframe><p>ok</p>',
    );
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/evil\.com/i);
    expect(html).toContain("<p>ok</p>");
    expect(warnings.join(" ")).toMatch(/iframe/i);
  });

  test("strips javascript: href", () => {
    const { html } = sanitizeSlideHtml('<a href="javascript:alert(1)">x</a>');
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/alert\(1\)/);
  });

  test("strips data: href (text/html data URL link)", () => {
    const { html } = sanitizeSlideHtml('<a href="data:text/html,<b>x</b>">x</a>');
    expect(html).not.toMatch(/href=["']data:/i);
  });
});

describe("sanitizeSlideHtml — preserves safe content", () => {
  test("keeps <strong>", () => {
    const { html } = sanitizeSlideHtml("<strong>bold</strong>");
    expect(html).toContain("<strong>bold</strong>");
  });

  test("keeps <ul><li> list", () => {
    const { html } = sanitizeSlideHtml("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  test("keeps https <a href>", () => {
    const { html } = sanitizeSlideHtml('<a href="https://x.com">link</a>');
    expect(html).toMatch(/href="https:\/\/x\.com"/);
    expect(html).toContain("link");
  });

  test("keeps mailto and tel hrefs", () => {
    const mailto = sanitizeSlideHtml('<a href="mailto:hi@x.com">mail</a>').html;
    expect(mailto).toMatch(/href="mailto:hi@x\.com"/);
    const tel = sanitizeSlideHtml('<a href="tel:+15551234567">call</a>').html;
    expect(tel).toMatch(/href="tel:\+15551234567"/);
  });

  test("keeps https <img>", () => {
    const { html } = sanitizeSlideHtml('<img src="https://acme.com/logo.png" alt="logo">');
    expect(html).toMatch(/src="https:\/\/acme\.com\/logo\.png"/);
    expect(html).toMatch(/alt="logo"/);
  });

  test("keeps data:image/png base64 <img>", () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const { html } = sanitizeSlideHtml(`<img src="${png}" alt="dot">`);
    expect(html).toMatch(/src="data:image\/png;base64,/);
  });

  test("keeps headings, paragraphs, lists, em, blockquote, hr together (no false warnings)", () => {
    const input =
      "<h2>Title</h2><p>Intro <em>emphasis</em> and <strong>bold</strong>.</p>" +
      "<ul><li>a</li></ul><blockquote>quote</blockquote><hr>";
    const { html, warnings } = sanitizeSlideHtml(input);
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<em>emphasis</em>");
    expect(html).toContain("<blockquote>quote</blockquote>");
    expect(html).toMatch(/<hr\s*\/?>/);
    expect(warnings).toHaveLength(0);
  });

  test("empty input → empty html, no warnings", () => {
    const { html, warnings } = sanitizeSlideHtml("");
    expect(html).toBe("");
    expect(warnings).toHaveLength(0);
  });
});

describe("sanitizeSlideHtml — warnings reporting", () => {
  test("records a distinct warning per material strip", () => {
    const { warnings } = sanitizeSlideHtml(
      '<script>x</script><style>y</style><iframe src="https://e"></iframe>' +
        '<p style="color:red" onclick="x()">hi</p>',
    );
    const joined = warnings.join(" | ");
    expect(joined).toMatch(/script/i);
    expect(joined).toMatch(/style/i);
    expect(joined).toMatch(/iframe/i);
    expect(joined).toMatch(/event handler|on/i);
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });

  test("no warnings for clean formatting-only content", () => {
    const { warnings } = sanitizeSlideHtml("<p>Just <strong>text</strong>.</p>");
    expect(warnings).toHaveLength(0);
  });
});
