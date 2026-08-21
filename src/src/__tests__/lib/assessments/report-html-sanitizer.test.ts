import { sanitizeReportHtmlFragment } from "@/lib/assessments/report-html-sanitizer";

const limits = {
  introduction: { rawCharacters: 12_000, textCharacters: 2_200, elements: 64, depth: 8, images: 1, tables: 1, tableRows: 8 },
  conclusion: { rawCharacters: 12_000, textCharacters: 900, elements: 36, depth: 6, images: 1, tables: 1, tableRows: 6 },
} as const;

describe("sanitizeReportHtmlFragment", () => {
  it("keeps semantic report markup, accessibility attributes, and approved visual styles", () => {
    const result = sanitizeReportHtmlFragment(
      '<section aria-label="Next step" style="background-color:#ffffff;color:#522583"><h2>Next step</h2><a href="https://scalingup.com">Continue</a></section>',
      "introduction",
    );

    expect(result.html).toContain('aria-label="Next step"');
    expect(result.html).toContain("background-color:#ffffff");
    expect(result.html).toContain("color:#522583");
    expect(result.html).toContain('href="https://scalingup.com"');
  });

  it("strips selector-bearing attributes while retaining a plain accessible label", () => {
    const result = sanitizeReportHtmlFragment(
      '<section class="report-callout" id="custom-report" data-region="cta" data-testid="authored" role="status" aria-labelledby="report-style-actions-title" aria-label="Next step"><h2>Next step</h2></section>',
      "introduction",
    );

    expect(result.ok).toBe(true);
    expect(result.html).toBe('<section aria-label="Next step"><h2>Next step</h2></section>');
    expect(result.didStripContent).toBe(true);
  });

  it("strips production page classes from authored content", () => {
    const result = sanitizeReportHtmlFragment(
      '<div class="su-full-landscape-page">Authored content</div>',
      "conclusion",
    );

    expect(result.ok).toBe(true);
    expect(result.html).toBe("<div>Authored content</div>");
    expect(result.html).not.toContain("su-full-landscape-page");
  });

  it("removes page-breaking typography and spacing declarations", () => {
    const result = sanitizeReportHtmlFragment(
      '<div style="white-space:nowrap;font-size:9999px;line-height:9999px;letter-spacing:9999px;padding:9999px;margin:9999px;gap:9999px;border:9999px solid red;border-radius:9999px;color:red">Safe text</div>',
      "conclusion",
    );

    expect(result.ok).toBe(true);
    expect(result.html).toBe('<div style="color:red">Safe text</div>');
  });

  it("removes executable and interactive content", () => {
    const result = sanitizeReportHtmlFragment(
      '<style>body{display:none}</style><script>alert(1)</script><form><input></form><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)" onclick="x()">x</a>',
      "introduction",
    );

    expect(result.html).not.toMatch(
      /script|style|form|input|iframe|javascript:|onclick/i,
    );
    expect(result.didStripContent).toBe(true);
  });

  it("blocks CSS URL vectors while keeping an approved declaration", () => {
    const result = sanitizeReportHtmlFragment(
      '<div style="background-image:url(https://evil.test/pixel);color:red">x</div>',
      "introduction",
    );

    expect(result.html).toBe('<div style="color:red">x</div>');
  });

  it.each([
    "background-image:url(https://evil.test/pixel)",
    String.raw`background:u\72l(https://evil.test/pixel)`,
    "--payload:url(https://evil.test/pixel)",
    "width:expression(alert(1))",
    "behavior:url(xss.htc)",
    "color:red/*comment*/",
  ])("rejects adversarial CSS declaration %s", (style) => {
    expect(
      sanitizeReportHtmlFragment(`<div style="${style};color:red">x</div>`, "introduction")
        .html,
    ).toBe('<div style="color:red">x</div>');
  });

  it("is idempotent for an accepted fragment", () => {
    const once = sanitizeReportHtmlFragment(
      '<section aria-label="Report callout" style="color:#123456"><a href="https://scalingup.com">Continue</a></section>',
      "introduction",
    ).html;

    expect(sanitizeReportHtmlFragment(once, "introduction").html).toBe(once);
  });

  it("keeps safe image sources and strips SVG data images", () => {
    const httpsImage = sanitizeReportHtmlFragment(
      '<img src="https://cdn.scalingup.com/report.png" alt="Report">',
      "introduction",
    ).html;
    const relativeImage = sanitizeReportHtmlFragment(
      '<img src="/uploads/report.png" alt="Report">',
      "introduction",
    ).html;
    const svgImage = sanitizeReportHtmlFragment(
      '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="Unsafe">',
      "introduction",
    ).html;

    expect(httpsImage).toContain('referrerpolicy="no-referrer"');
    expect(relativeImage).toContain('src="/uploads/report.png"');
    expect(svgImage).not.toContain("data:image/svg+xml");
  });

  it.each(["introduction", "conclusion"] as const)("rejects a fragment over the %s source limit", (position) => {
    const result = sanitizeReportHtmlFragment(
      "x".repeat(limits[position].rawCharacters + 1),
      position,
    );

    expect(result.ok).toBe(false);
    expect(result.html).toBe("");
  });

  it.each(["introduction", "conclusion"] as const)("rejects %s content over the visible-text limit", (position) => {
    const result = sanitizeReportHtmlFragment(
      `<p>${"x".repeat(limits[position].textCharacters + 1)}</p>`,
      position,
    );

    expect(result.ok).toBe(false);
    expect(result.issue).toMatch(/text/i);
  });

  it.each(["introduction", "conclusion"] as const)("rejects %s content over the element limit", (position) => {
    const result = sanitizeReportHtmlFragment(
      Array.from({ length: limits[position].elements + 1 }, () => "<span>x</span>").join(""),
      position,
    );

    expect(result.ok).toBe(false);
    expect(result.issue).toMatch(/element/i);
  });

  it.each(["introduction", "conclusion"] as const)("rejects %s content over the nesting limit", (position) => {
    const levels = limits[position].depth + 1;
    const result = sanitizeReportHtmlFragment(
      `${"<div>".repeat(levels)}x${"</div>".repeat(levels)}`,
      position,
    );

    expect(result.ok).toBe(false);
    expect(result.issue).toMatch(/nested/i);
  });

  it.each(["introduction", "conclusion"] as const)("rejects %s content over the image limit", (position) => {
    const result = sanitizeReportHtmlFragment(
      '<img src="https://cdn.scalingup.com/one.png"><img src="https://cdn.scalingup.com/two.png">',
      position,
    );

    expect(result.ok).toBe(false);
    expect(result.issue).toMatch(/image/i);
  });

  it.each(["introduction", "conclusion"] as const)("rejects %s content over the table limit", (position) => {
    const result = sanitizeReportHtmlFragment(
      "<table><tbody><tr><td>One</td></tr></tbody></table><table><tbody><tr><td>Two</td></tr></tbody></table>",
      position,
    );

    expect(result.ok).toBe(false);
    expect(result.issue).toMatch(/table/i);
  });

  it.each(["introduction", "conclusion"] as const)("rejects %s content over the table-row limit", (position) => {
    const rows = Array.from(
      { length: limits[position].tableRows + 1 },
      () => "<tr><td>row</td></tr>",
    ).join("");
    const result = sanitizeReportHtmlFragment(`<table><tbody>${rows}</tbody></table>`, position);

    expect(result.ok).toBe(false);
    expect(result.issue).toMatch(/row/i);
  });

  it("removes layout-affecting CSS and image dimensions while keeping bounded content", () => {
    const result = sanitizeReportHtmlFragment(
      '<section style="width:100px;max-width:90px;min-width:10px;height:100px;min-height:10px;max-height:90px;margin:-1px;padding:1vw;display:grid;gap:2vh;color:red"><h2>Heading</h2><a href="https://scalingup.com">Link</a><ul><li>Item</li></ul><img src="https://cdn.scalingup.com/report.png" width="400" height="300"><table><tbody><tr><td>Cell</td></tr></tbody></table></section>',
      "introduction",
    );

    expect(result.ok).toBe(true);
    expect(result.html).toContain("<h2>Heading</h2>");
    expect(result.html).toContain('href="https://scalingup.com"');
    expect(result.html).toContain("<ul><li>Item</li></ul>");
    expect(result.html).toContain("<table><tbody><tr><td>Cell</td></tr></tbody></table>");
    expect(result.html).toContain('src="https://cdn.scalingup.com/report.png"');
    expect(result.html).not.toMatch(/(?:width|height|grid|flex|vw|vh|-1px)/i);
  });
});
