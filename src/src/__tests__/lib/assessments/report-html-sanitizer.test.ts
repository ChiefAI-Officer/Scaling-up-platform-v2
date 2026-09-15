import {
  REPORT_HTML_ALLOWED_TAGS,
  REPORT_HTML_EXPANDED_LIMITS,
  REPORT_HTML_TAG_POLICY,
  sanitizeReportHtmlFragment,
} from "@/lib/assessments/report-html-sanitizer";
import { ROCKEFELLER_BOOK_OFFER_REPORT_HTML } from "@/__tests__/fixtures/report-html";

const limits = {
  introduction: { rawCharacters: 12_000, textCharacters: 2_200, elements: 64, depth: 8, images: 1, tables: 1, tableRows: 8 },
  conclusion: { rawCharacters: 12_000, textCharacters: 900, elements: 36, depth: 6, images: 1, tables: 1, tableRows: 6 },
} as const;

const malformedTableHtml = [
  ["direct td children", `<table>${"<td>x</td>".repeat(24)}</table>`],
  ["direct th children", `<table>${"<th>x</th>".repeat(24)}</table>`],
  ["thead without tr", "<table><thead><th>x</th></thead></table>"],
  ["tbody without tr", "<table><tbody><td>x</td></tbody></table>"],
  ["tfoot without tr", "<table><tfoot><td>x</td></tfoot></table>"],
  ["cells below a div inside table", "<table><div><td>x</td><th>y</th></div></table>"],
  ["col directly below table", "<table><col><tr><td>x</td></tr></table>"],
  ["mixed explicit and implicit cells", "<table><tr><td>x</td></tr><td>y</td></table>"],
  ["case, attributes, and comments around direct cells", '<TABLE summary="Summary"><!-- comment --><TD title="Cell">x</TD></TABLE>'],
  ["self-closing direct cell syntax", "<table><td/>x</table>"],
  ["caption outside table", "<caption>x</caption><table><tr><td>y</td></tr></table>"],
  ["tr outside table", "<tr><td>x</td></tr><table><tr><td>y</td></tr></table>"],
  ["row group outside table", "<tbody><tr><td>x</td></tr></tbody>"],
  ["colgroup outside table", "<colgroup><col></colgroup>"],
  ["ordinary element directly under table", "<table><div>x</div></table>"],
  ["visible text directly under table", "<table>x<tr><td>y</td></tr></table>"],
  ["caption after rows", "<table><tbody><tr><td>x</td></tr></tbody><caption>Late</caption></table>"],
  ["colgroup after rows", "<table><tbody><tr><td>x</td></tr></tbody><colgroup><col></colgroup></table>"],
  ["duplicate thead", "<table><thead><tr><th>x</th></tr></thead><thead><tr><th>y</th></tr></thead></table>"],
  ["duplicate tfoot", "<table><tfoot><tr><td>x</td></tr></tfoot><tfoot><tr><td>y</td></tr></tfoot></table>"],
  ["mixed direct rows and row groups", "<table><tr><td>x</td></tr><tbody><tr><td>y</td></tr></tbody></table>"],
  ["nested table", "<table><tr><td><table><tr><td>x</td></tr></table></td></tr></table>"],
] as const;

describe("sanitizeReportHtmlFragment", () => {
  it.each(["introduction", "conclusion"] as const)(
    "accepts the Rockefeller book-offer composition as %s content",
    (position) => {
      const result = sanitizeReportHtmlFragment(
        ROCKEFELLER_BOOK_OFFER_REPORT_HTML,
        position,
      );

      expect(result).toMatchObject({
        ok: true,
        didStripContent: false,
      });
      expect(result.html).toContain(
        '<table aria-label="Rockefeller Habits checklist conclusion">',
      );
      expect(result.html).toContain(
        'alt="Mastering the Rockefeller Habits book cover"',
      );
      expect(result.html).toContain("Order your own personal copy");
      expect(result.html).toContain('href="https://amzn.to/4xtRFrS"');
      expect(result.html).toContain('width="269"');
      expect(result.html).toContain('height="403"');
    },
  );

  it("classifies every allowed tag explicitly and gives every layout tag positive cost", () => {
    const expectedInline = ["a", "b", "code", "em", "i", "s", "small", "span", "strong", "sub", "sup", "u"];
    const expectedUnwrapped = ["footer", "pre"];
    const expectedWeighted = [
      "article", "aside", "blockquote", "br", "caption", "col", "colgroup", "dd", "div", "dl", "dt",
      "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "img", "li", "main",
      "ol", "p", "section", "style", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
    ];
    const entries = Object.entries(REPORT_HTML_TAG_POLICY);
    const inline = entries.filter(([, policy]) => policy.classification === "safe-inline-zero-cost").map(([tag]) => tag).sort();
    const unwrapped = entries.filter(([, policy]) => policy.classification === "unwrapped-or-disallowed").map(([tag]) => tag).sort();
    const weighted = entries.filter(([, policy]) => policy.classification === "positive-weighted-or-limited");

    expect(inline).toEqual(expectedInline);
    expect(unwrapped).toEqual(expectedUnwrapped);
    expect(weighted.map(([tag]) => tag).sort()).toEqual(expectedWeighted);
    expect(weighted.every(([, policy]) => "weight" in policy && policy.weight > 0)).toBe(true);
    expect([...REPORT_HTML_ALLOWED_TAGS].sort()).toEqual([...expectedInline, ...expectedWeighted].sort());
  });

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

  it("keeps authored class names and embedded CSS used to compose a report region", () => {
    const result = sanitizeReportHtmlFragment(
      '<style>.promo { display: flex; gap: 16px; padding: 32px; background: #2b1648; } .metric { border: 1px solid #6e5d7e; border-radius: 14px; }</style><section class="promo"><div class="metric">100%</div></section>',
      "conclusion",
    );

    expect(result).toMatchObject({ ok: true, didStripContent: false });
    expect(result.html).toContain("<style>.promo { display: flex;");
    expect(result.html).toContain('<section class="promo">');
    expect(result.html).toContain('<div class="metric">100%</div>');
  });

  it.each([
    ["external stylesheet imports", '@import "https://example.com/report.css";', /import/i],
    ["font downloads", '@font-face { font-family: Promo; src: url("https://example.com/promo.woff2"); }', /font/i],
    ["global keyframe names", "@keyframes promo-pulse { from { opacity: .5; } to { opacity: 1; } }", /keyframes/i],
    ["global custom property registrations", '@property --promo-color { syntax: "<color>"; inherits: false; initial-value: red; }', /property/i],
    ["global position fallback names", "@position-try --promo-position { inset: 0; }", /position-try/i],
    ["global font-feature names", "@font-feature-values Promo { @styleset { display: 1; } }", /font-feature-values/i],
    ["global cascade layer order", "@layer authored, platform;", /layer/i],
    ["non-HTTPS CSS URL fetches", '.promo { background-image: url("http://example.com/pixel.png"); }', /https/i],
    ["non-HTTPS image-set string fetches", '.promo { background-image: image-set("http://example.com/pixel.png" 1x); }', /https/i],
    ["non-HTTPS prefixed image-set string fetches", '.promo { background-image: -webkit-image-set("http://example.com/pixel.png" 1x); }', /https/i],
    ["report-wide page rules", "@page { size: landscape; }", /page/i],
    ["fixed overlays", ".promo { position: fixed; }", /position/i],
    ["sticky overlays", ".promo { position: sticky; }", /position/i],
    ["vendor-prefixed sticky overlays", ".promo { position: -webkit-sticky; }", /position/i],
    ["escaped property names", String.raw`.promo { p\6fsition: fixed; }`, /escaped/i],
    ["escaped image function names", String.raw`.promo { background-image: image\2d set("http://example.com/pixel.png" 1x); }`, /escaped/i],
    ["custom property indirection", ".promo { --placement: fixed; position: var(--placement); }", /custom properties|var/i],
    ["attribute substitution", ".promo { position: attr(title type(<custom-ident>), static); }", /attr/i],
    ["environment substitution", ".promo { position: env(report-position, fixed); }", /position/i],
    ["conditional substitution", ".promo { position: if(style(--chapter-color): fixed; else: static); }", /position|parsed/i],
  ] as const)("rejects %s with a clear authoring issue", (_risk, css, issue) => {
    const result = sanitizeReportHtmlFragment(
      `<style>${css}</style><section class="promo">Promotion</section>`,
      "conclusion",
    );

    expect(result).toMatchObject({ ok: false, html: "" });
    expect(result.issue).toMatch(issue);
  });

  it("allows an HTTPS image referenced by authored CSS", () => {
    const result = sanitizeReportHtmlFragment(
      '<style>.promo { background-image: url("https://example.com/promo.png"); background-image: image-set("https://example.com/promo@2x.png" 2x); }</style><section class="promo">Promotion</section>',
      "conclusion",
    );

    expect(result).toMatchObject({ ok: true, didStripContent: false });
  });

  it("allows region-safe responsive and conditional at-rules", () => {
    const result = sanitizeReportHtmlFragment(
      '<style>@media (max-width:640px){.promo{display:block}}@supports(display:grid){.promo{display:grid}}@container (min-width:300px){.promo{gap:1rem}}@scope (.inner){.promo{color:white}}</style><section class="inner"><div class="promo">Promotion</div></section>',
      "conclusion",
    );

    expect(result).toMatchObject({ ok: true, didStripContent: false });
  });

  it("rejects CSS beyond the per-region CSS limit", () => {
    const result = sanitizeReportHtmlFragment(
      `<style type="text/css">${".x{color:red}".repeat(400)}</style><p class="x">Promotion</p>`,
      "conclusion",
    );

    expect(result).toMatchObject({ ok: false, html: "" });
    expect(result.issue).toMatch(/CSS.*4,000/i);
  });

  it("rejects malformed CSS that could escape the rendered scope", () => {
    const result = sanitizeReportHtmlFragment(
      '<style>.promo { color: red; }}</style><section class="promo">Promotion</section>',
      "conclusion",
    );

    expect(result).toMatchObject({ ok: false, html: "" });
    expect(result.issue).toMatch(/could not be parsed/i);
  });

  it("keeps author classes while stripping ids, data attributes, and roles", () => {
    const result = sanitizeReportHtmlFragment(
      '<section class="author-callout" id="custom-report" data-region="cta" data-testid="authored" role="status" aria-labelledby="report-style-actions-title" aria-label="Next step"><h2>Next step</h2></section>',
      "introduction",
    );

    expect(result.ok).toBe(true);
    expect(result.html).toBe('<section class="author-callout" aria-label="Next step"><h2>Next step</h2></section>');
    expect(result.didStripContent).toBe(true);
  });

  it("keeps every authored class name without a hidden naming policy", () => {
    const result = sanitizeReportHtmlFragment(
      '<div class="su-promo report-promo">Authored content</div>',
      "conclusion",
    );

    expect(result).toMatchObject({ ok: true, didStripContent: false });
    expect(result.html).toBe('<div class="su-promo report-promo">Authored content</div>');
  });

  it.each([
    "su-full-landscape-page",
    "su-full-landscape-page--cover",
    "su-full-landscape-page--authored",
    "su-full-landscape-page--chapter",
    "su-full-landscape-page--detail",
    "su-full-landscape-page--appendix",
    "report-page",
    "report-page-break",
    "report-page--dashboard-cover",
    "report-page--executive-cover",
  ])("removes the exact internal %s shell class", (shellClass) => {
    const result = sanitizeReportHtmlFragment(
      `<div class="su-promo ${shellClass} report-promo">Authored content</div>`,
      "conclusion",
    );

    expect(result).toMatchObject({ ok: true, didStripContent: true });
    expect(result.html).toBe('<div class="su-promo report-promo">Authored content</div>');
  });

  it("removes page-breaking typography and spacing declarations", () => {
    const result = sanitizeReportHtmlFragment(
      '<div style="white-space:nowrap;font-size:9999px;line-height:9999px;letter-spacing:9999px;padding:9999px;margin:9999px;gap:9999px;border:9999px solid red;border-radius:9999px;color:red">Safe text</div>',
      "conclusion",
    );

    expect(result.ok).toBe(true);
    expect(result.html).toBe('<div style="color:red">Safe text</div>');
  });

  it("unwraps preformatted exact-limit text so UA white-space cannot escape the page", () => {
    const result = sanitizeReportHtmlFragment(
      `<pre>${"x".repeat(limits.introduction.textCharacters)}</pre>`,
      "introduction",
    );

    expect(result.ok).toBe(true);
    expect(result.html).not.toContain("<pre");
    expect(result.html).toBe("x".repeat(limits.introduction.textCharacters));
    expect(result.didStripContent).toBe(true);
  });

  it.each(["introduction", "conclusion"] as const)(
    "rejects the maximum accepted %s line-break composition with a plain issue",
    (position) => {
      const result = sanitizeReportHtmlFragment(
        "<br>".repeat(limits[position].elements),
        position,
      );

      expect(result.ok).toBe(false);
      expect(result.html).toBe("");
      expect(result.issue).toMatch(/line break/i);
    },
  );

  it.each(["introduction", "conclusion"] as const)(
    "rejects the maximum accepted %s heading composition with a plain issue",
    (position) => {
      const result = sanitizeReportHtmlFragment(
        Array.from({ length: limits[position].elements }, () => "<h1>x</h1>").join(""),
        position,
      );

      expect(result.ok).toBe(false);
      expect(result.html).toBe("");
      expect(result.issue).toMatch(/heading/i);
    },
  );

  it.each(["introduction", "conclusion"] as const)(
    "rejects the former maximum accepted %s standalone figcaption composition",
    (position) => {
      const result = sanitizeReportHtmlFragment(
        "<figcaption>x</figcaption>".repeat(limits[position].elements),
        position,
      );

      expect(result.ok).toBe(false);
      expect(result.html).toBe("");
      expect(result.issue).toMatch(/figure caption/i);
    },
  );

  it("rejects the former exact-element Welcome table with eight rows and 54 cells", () => {
    const rows = Array.from({ length: 8 }, (_, rowIndex) => {
      const cells = rowIndex === 0 ? 47 : 1;
      return `<tr>${"<td>x</td>".repeat(cells)}</tr>`;
    }).join("");
    const result = sanitizeReportHtmlFragment(`<table><tbody>${rows}</tbody></table>`, "introduction");

    expect(result.ok).toBe(false);
    expect(result.html).toBe("");
    expect(result.issue).toMatch(/table (?:column|cell)/i);
  });

  it("rejects one table containing the former exact-element 63 captions", () => {
    const result = sanitizeReportHtmlFragment(
      `<table>${"<caption>x</caption>".repeat(63)}</table>`,
      "introduction",
    );

    expect(result.ok).toBe(false);
    expect(result.html).toBe("");
    expect(result.issue).toMatch(/table caption/i);
  });

  it.each([
    ["introduction", 4, 24],
    ["conclusion", 3, 12],
  ] as const)("enforces exact %s table column and cell caps", (position, columns, cells) => {
    const exactColumnTable = `<table><tbody><tr>${"<td>x</td>".repeat(columns)}</tr></tbody></table>`;
    const overColumnTable = `<table><tbody><tr>${"<td>x</td>".repeat(columns + 1)}</tr></tbody></table>`;
    const fullRows = Math.floor(cells / columns);
    const remainder = cells % columns;
    const exactCellRows = `${`<tr>${"<td>x</td>".repeat(columns)}</tr>`.repeat(fullRows)}${remainder ? `<tr>${"<td>x</td>".repeat(remainder)}</tr>` : ""}`;
    const overCellRows = `${exactCellRows}<tr><td>x</td></tr>`;

    expect(sanitizeReportHtmlFragment(exactColumnTable, position).ok).toBe(true);
    expect(sanitizeReportHtmlFragment(overColumnTable, position)).toMatchObject({
      ok: false,
      issue: expect.stringContaining(`${columns} table columns`),
    });
    expect(sanitizeReportHtmlFragment(`<table><tbody>${exactCellRows}</tbody></table>`, position).ok).toBe(true);
    expect(sanitizeReportHtmlFragment(`<table><tbody>${overCellRows}</tbody></table>`, position)).toMatchObject({
      ok: false,
      issue: expect.stringContaining(`${cells} table cells`),
    });
  });

  it.each(["introduction", "conclusion"] as const)(
    "enforces one figure caption and one table caption in %s",
    (position) => {
      expect(sanitizeReportHtmlFragment("<figcaption>One</figcaption>", position).ok).toBe(true);
      expect(sanitizeReportHtmlFragment("<figcaption>One</figcaption><figcaption>Two</figcaption>", position)).toMatchObject({
        ok: false,
        issue: expect.stringMatching(/1 figure caption/),
      });
      expect(sanitizeReportHtmlFragment("<table><caption>One</caption></table>", position).ok).toBe(true);
      expect(sanitizeReportHtmlFragment("<table><caption>One</caption><caption>Two</caption></table>", position)).toMatchObject({
        ok: false,
        issue: expect.stringMatching(/1 table caption/),
      });
    },
  );

  it("strips table span attributes so column and cell counts stay literal", () => {
    const result = sanitizeReportHtmlFragment(
      '<table><colgroup><col span="4"></colgroup><tbody><tr><th colspan="3" rowspan="2">Head</th><td colspan="2">Cell</td></tr></tbody></table>',
      "introduction",
    );

    expect(result.ok).toBe(true);
    expect(result.html).not.toMatch(/(?:colspan|rowspan|<col[^>]+span)/i);
    expect(result.html).toContain("<th>Head</th><td>Cell</td>");
  });

  it.each(malformedTableHtml)("rejects malformed table grammar: %s", (_name, html) => {
    expect(sanitizeReportHtmlFragment(html, "introduction")).toMatchObject({
      ok: false,
      html: "",
      issue: expect.stringMatching(/valid table structure/i),
    });
  });

  it.each([
    [
      "omitted cell and row closing tags",
      "<table><tbody><tr><td>x<td>y<tr><td>z</table>",
      "<table><tbody><tr><td>x</td><td>y</td></tr><tr><td>z</td></tr></tbody></table>",
    ],
    [
      "case, comments, attributes, and self-closing cell syntax",
      '<TABLE summary="Summary"><!-- comment --><TBODY><TR><TD title="Cell"/>x</TR></TBODY></TABLE>',
      '<table summary="Summary"><tbody><tr><td title="Cell">x</td></tr></tbody></table>',
    ],
    [
      "malformed close order canonicalized by sanitize-html",
      "<table><tbody><tr><td>x</tbody></td></tr></table>",
      "<table><tbody><tr><td>x</td></tr></tbody></table>",
    ],
  ] as const)("validates the canonical table produced from %s", (_name, raw, canonical) => {
    expect(sanitizeReportHtmlFragment(raw, "introduction")).toMatchObject({
      ok: true,
      html: canonical,
      didStripContent: true,
    });
  });

  it("accepts the former Closing overflow composition while retaining element limits", () => {
    const rows = `<tr><td>x</td><td>x</td></tr>`.repeat(6);
    const withCaption = sanitizeReportHtmlFragment(`<table><caption>Cap</caption><tbody>${rows}</tbody></table>`, "conclusion");
    const formerOverflow = sanitizeReportHtmlFragment(`<table><caption>Cap</caption><tbody>${rows}</tbody></table>${"<div></div>".repeat(8)}`, "conclusion");
    const tooManyElements = sanitizeReportHtmlFragment("<blockquote></blockquote>".repeat(37), "conclusion");

    expect(withCaption.ok).toBe(true);
    expect(formerOverflow.ok).toBe(true);
    expect(tooManyElements).toMatchObject({
      ok: false,
      issue: expect.stringContaining("36 HTML elements"),
    });
  });

  it.each(["introduction", "conclusion"] as const)("caps %s table-caption text at 60 visible characters", (position) => {
    expect(sanitizeReportHtmlFragment(`<table><caption>${"x".repeat(60)}</caption></table>`, position).ok).toBe(true);
    expect(sanitizeReportHtmlFragment(`<table><caption>${"x".repeat(61)}</caption></table>`, position)).toMatchObject({
      ok: false,
      issue: expect.stringContaining("60 visible table-caption characters"),
    });
  });

  it.each([
    ["introduction", 8, 4],
    ["conclusion", 4, 2],
  ] as const)(
    "retains exact %s line-break and heading sublimits",
    (position, lineBreaks, headings) => {
      expect(sanitizeReportHtmlFragment("<br>".repeat(lineBreaks), position).ok).toBe(true);
      expect(sanitizeReportHtmlFragment("<br>".repeat(lineBreaks + 1), position)).toMatchObject({
        ok: false,
        issue: expect.stringContaining(`${lineBreaks} line breaks`),
      });
      expect(sanitizeReportHtmlFragment("<h6>x</h6>".repeat(headings), position).ok).toBe(true);
      expect(sanitizeReportHtmlFragment("<h6>x</h6>".repeat(headings + 1), position)).toMatchObject({
        ok: false,
        issue: expect.stringContaining(`${headings} headings`),
      });
    },
  );

  it("accepts 200 estimated Welcome lines and rejects 201", () => {
    const atBoundary = `${"<blockquote></blockquote>".repeat(58)}${"<h1></h1>".repeat(4)}<img src="https://cdn.scalingup.com/report.png" alt="Report">`;

    expect(sanitizeReportHtmlFragment(atBoundary, "introduction").ok).toBe(true);
    expect(sanitizeReportHtmlFragment(`${atBoundary}<div></div>`, "introduction")).toMatchObject({
      ok: false,
      issue: expect.stringContaining("200 estimated lines"),
    });
  });

  it("removes executable and interactive HTML while retaining authored CSS", () => {
    const result = sanitizeReportHtmlFragment(
      '<style>body{display:none}</style><script>alert(1)</script><form><input></form><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)" onclick="x()">x</a>',
      "introduction",
    );

    expect(result.html).toContain("<style>body{display:none}</style>");
    expect(result.html).not.toMatch(/script|form|input|iframe|javascript:|onclick/i);
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

  it("preserves Jeff's bounded integer banner dimensions in Closing HTML", () => {
    const result = sanitizeReportHtmlFragment(
      '<a href="https://calendly.com/example"><img src="https://cdn.scalingup.com/banner.png" alt="Book a free call" width="1530" height="810"></a>',
      "conclusion",
    );

    expect(result.ok).toBe(true);
    expect(result.html).toContain('width="1530"');
    expect(result.html).toContain('height="810"');
    expect(result.html).toContain('href="https://calendly.com/example"');
  });

  it.each([
    ["width", "0"],
    ["width", "2001"],
    ["width", "100%"],
    ["width", "600px"],
    ["width", "-1"],
    ["width", "calc(100% - 1px)"],
    ["height", "0"],
    ["height", "2001"],
    ["height", "100vh"],
  ] as const)("strips an unsafe image %s value of %s", (attribute, value) => {
    const result = sanitizeReportHtmlFragment(
      `<img src="https://cdn.scalingup.com/banner.png" ${attribute}="${value}">`,
      "conclusion",
    );

    expect(result.ok).toBe(true);
    expect(result.html).not.toContain(`${attribute}=`);
  });

  it.each([
    ["width", "1530"],
    ["height", "810"],
  ] as const)("strips an unpaired bounded image %s", (attribute, value) => {
    const result = sanitizeReportHtmlFragment(
      `<img src="https://cdn.scalingup.com/banner.png" ${attribute}="${value}">`,
      "conclusion",
    );

    expect(result.ok).toBe(true);
    expect(result.html).not.toMatch(/\s(?:width|height)="/);
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

  it("removes container layout CSS while preserving bounded image dimensions", () => {
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
    expect(result.html).toContain('width="400"');
    expect(result.html).toContain('height="300"');
    expect(result.html).toContain('style="color:red"');
    expect(result.html).not.toMatch(/(?:max-width|min-width|min-height|max-height|grid|flex|vw|vh|-1px)/i);
  });
});

describe("expanded report HTML authoring limits", () => {
  const enabledKey = "WAVE_REPORT_HTML_LIMITS_ENABLED";
  const killKey = "WAVE_REPORT_HTML_LIMITS_KILL";
  const savedEnabled = process.env[enabledKey];
  const savedKill = process.env[killKey];

  beforeEach(() => {
    process.env[enabledKey] = "1";
    delete process.env[killKey];
  });

  afterAll(() => {
    if (savedEnabled === undefined) delete process.env[enabledKey];
    else process.env[enabledKey] = savedEnabled;
    if (savedKill === undefined) delete process.env[killKey];
    else process.env[killKey] = savedKill;
  });

  it.each(["introduction", "conclusion"] as const)(
    "accepts multiple bounded images in %s content",
    (position) => {
      const result = sanitizeReportHtmlFragment(
        '<img src="https://cdn.scalingup.com/one.png" width="400" height="300"><img src="https://cdn.scalingup.com/two.png" width="600" height="400">',
        position,
      );

      expect(result).toMatchObject({ ok: true, didStripContent: true });
      expect(result.html.match(/<img\b/g)).toHaveLength(2);
      expect(result.html.match(/referrerpolicy="no-referrer"/g)).toHaveLength(2);
      expect(result.html).toContain('width="400" height="300"');
      expect(result.html).toContain('width="600" height="400"');
    },
  );

  it("independently enforces source and dimension policy across multiple images", () => {
    const result = sanitizeReportHtmlFragment(
      '<img src="https://cdn.scalingup.com/safe.png" width="400" height="300"><img src="javascript:alert(1)" width="2001" height="300"><img src="https://cdn.scalingup.com/unpaired.png" width="600">',
      "introduction",
    );

    expect(result).toMatchObject({ ok: true, didStripContent: true });
    expect(result.html.match(/<img\b/g)).toHaveLength(3);
    expect(result.html.match(/referrerpolicy="no-referrer"/g)).toHaveLength(3);
    expect(result.html).toContain(
      'src="https://cdn.scalingup.com/safe.png" width="400" height="300"',
    );
    expect(result.html).not.toContain("javascript:");
    expect(result.html).not.toContain('width="2001"');
    expect(result.html).not.toContain('src="https://cdn.scalingup.com/unpaired.png" width');
  });

  it("restores the exact legacy result shape and image cap when the kill switch wins", () => {
    process.env[killKey] = "1";
    const result = sanitizeReportHtmlFragment(
      '<img src="https://cdn.scalingup.com/one.png"><img src="https://cdn.scalingup.com/two.png">',
      "introduction",
    );

    expect(result).toEqual({
      ok: false,
      html: "",
      didStripContent: true,
      issue: "Welcome section can contain 1 image or fewer.",
    });
  });

  it("keeps responsive, disclosure, and navigation markup while filtering source URLs", () => {
    const result = sanitizeReportHtmlFragment(
      '<nav aria-label="Report links"><a href="https://scalingup.com">Home</a></nav><picture><source media="(min-width: 800px)" type="image/webp" srcset="https://cdn.scalingup.com/hero.webp 1x, javascript:alert(1) 2x"><img src="https://cdn.scalingup.com/hero.png" alt="Team"></picture><details open><summary>Read more</summary><p>Detail</p></details>',
      "introduction",
    );

    expect(result).toMatchObject({ ok: true });
    expect(result.html).toContain('<nav aria-label="Report links">');
    expect(result.html).toContain("<picture><source");
    expect(result.html).toContain('srcset="https://cdn.scalingup.com/hero.webp 1x"');
    expect(result.html).not.toContain("javascript:");
    expect(result.html).toContain("<details open");
    expect(result.html).toContain("<summary>Read more</summary>");
  });

  it("keeps safe inline layout CSS with the same policy as a style block", () => {
    const result = sanitizeReportHtmlFragment(
      '<div style="display:flex;gap:1rem;padding:12px;margin-top:8px;background-image:url(https://cdn.scalingup.com/pattern.png)">Layout</div>',
      "introduction",
    );

    expect(result).toMatchObject({ ok: true, didStripContent: false });
    expect(result.html).toContain("display:flex");
    expect(result.html).toContain("gap:1rem");
    expect(result.html).toContain("padding:12px");
    expect(result.html).toContain("margin-top:8px");
    expect(result.html).toContain(
      "background-image:url(https://cdn.scalingup.com/pattern.png)",
    );
  });

  it("still strips unsafe inline declarations while retaining safe siblings", () => {
    const result = sanitizeReportHtmlFragment(
      '<div style="position:fixed;color:red;background-image:url(http://evil.test/pixel.png);--overlay:fixed">Layout</div>',
      "introduction",
    );

    expect(result.html).toBe('<div style="color:red">Layout</div>');
  });

  it("accepts multiple tables and headings while preserving table-shape guards", () => {
    const result = sanitizeReportHtmlFragment(
      `${"<h3>Heading</h3>".repeat(6)}<table><tbody><tr><td>One</td></tr></tbody></table><table><tbody><tr><td>Two</td></tr></tbody></table>`,
      "introduction",
    );

    expect(result).toMatchObject({ ok: true });
    const tooManyColumns = sanitizeReportHtmlFragment(
      `<table><tbody><tr>${"<td>x</td>".repeat(REPORT_HTML_EXPANDED_LIMITS.introduction.tableColumns + 1)}</tr></tbody></table>`,
      "introduction",
    );
    expect(tooManyColumns).toMatchObject({
      ok: false,
      issue: expect.stringMatching(/table columns/i),
    });
  });

  it.each(["introduction", "conclusion"] as const)(
    "keeps estimated lines as the vertical governor for %s content",
    (position) => {
      const images = Math.floor(
        REPORT_HTML_EXPANDED_LIMITS[position].estimatedLines / 6,
      ) + 1;
      const result = sanitizeReportHtmlFragment(
        Array.from(
          { length: images },
          (_, index) =>
            `<img src="https://cdn.scalingup.com/${index}.png" alt="Image ${index}">`,
        ).join(""),
        position,
      );

      expect(result).toMatchObject({
        ok: false,
        issue: expect.stringContaining("200 estimated lines"),
      });
    },
  );

  it("continues discarding executable content including SVG", () => {
    const result = sanitizeReportHtmlFragment(
      '<script>script-marker</script><iframe>iframe-marker</iframe><form>form-marker</form><svg><text>svg-marker</text></svg><p>safe-marker</p>',
      "introduction",
    );

    expect(result.html).toBe("<p>safe-marker</p>");
  });
});
