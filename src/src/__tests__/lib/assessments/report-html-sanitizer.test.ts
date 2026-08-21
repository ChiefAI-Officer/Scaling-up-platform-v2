import {
  MAX_REPORT_HTML_FRAGMENT_LENGTH,
  sanitizeReportHtmlFragment,
} from "@/lib/assessments/report-html-sanitizer";

describe("sanitizeReportHtmlFragment", () => {
  it("keeps report presentation markup and approved inline styles", () => {
    const result = sanitizeReportHtmlFragment(
      '<section class="report-callout" aria-label="Next step" data-region="cta" style="padding:20px;background-color:#ffffff"><h2>Next step</h2><a href="https://scalingup.com">Continue</a></section>',
    );

    expect(result.html).toContain('class="report-callout"');
    expect(result.html).toContain('aria-label="Next step"');
    expect(result.html).toContain('data-region="cta"');
    expect(result.html).toContain("padding:20px");
    expect(result.html).toContain('href="https://scalingup.com"');
  });

  it("removes executable and interactive content", () => {
    const result = sanitizeReportHtmlFragment(
      '<style>body{display:none}</style><script>alert(1)</script><form><input></form><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)" onclick="x()">x</a>',
    );

    expect(result.html).not.toMatch(
      /script|style|form|input|iframe|javascript:|onclick/i,
    );
    expect(result.didStripContent).toBe(true);
  });

  it("blocks CSS URL vectors while keeping an approved declaration", () => {
    const result = sanitizeReportHtmlFragment(
      '<div style="background-image:url(https://evil.test/pixel);color:red">x</div>',
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
      sanitizeReportHtmlFragment(`<div style="${style};color:red">x</div>`)
        .html,
    ).toBe('<div style="color:red">x</div>');
  });

  it("is idempotent for an accepted fragment", () => {
    const once = sanitizeReportHtmlFragment(
      '<section class="report-callout" style="color:#123456;padding:16px"><a href="https://scalingup.com">Continue</a></section>',
    ).html;

    expect(sanitizeReportHtmlFragment(once).html).toBe(once);
  });

  it("keeps safe image sources and strips SVG data images", () => {
    const httpsImage = sanitizeReportHtmlFragment(
      '<img src="https://cdn.scalingup.com/report.png" alt="Report">',
    ).html;
    const relativeImage = sanitizeReportHtmlFragment(
      '<img src="/uploads/report.png" alt="Report">',
    ).html;
    const svgImage = sanitizeReportHtmlFragment(
      '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="Unsafe">',
    ).html;

    expect(httpsImage).toContain('referrerpolicy="no-referrer"');
    expect(relativeImage).toContain('src="/uploads/report.png"');
    expect(svgImage).not.toContain("data:image/svg+xml");
  });

  it("rejects a fragment over the storage limit", () => {
    const result = sanitizeReportHtmlFragment(
      "x".repeat(MAX_REPORT_HTML_FRAGMENT_LENGTH + 1),
    );

    expect(result.ok).toBe(false);
    expect(result.html).toBe("");
  });
});
