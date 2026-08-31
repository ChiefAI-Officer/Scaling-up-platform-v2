import {
  REPORT_HTML_ALLOWED_TAGS,
  REPORT_HTML_TAG_POLICY,
  sanitizeReportHtmlFragment,
} from "@/lib/assessments/report-html-sanitizer";

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
  it("classifies every allowed tag explicitly and gives every layout tag positive cost", () => {
    const expectedInline = ["a", "b", "code", "em", "i", "s", "small", "span", "strong", "sub", "sup", "u"];
    const expectedUnwrapped = ["footer", "pre"];
    const expectedWeighted = [
      "article", "aside", "blockquote", "br", "caption", "col", "colgroup", "dd", "div", "dl", "dt",
      "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "img", "li", "main",
      "ol", "p", "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
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

  it("keeps a Closing table with a caption inside the expanded budget and rejects added overflow blocks", () => {
    const rows = `<tr><td>x</td><td>x</td></tr>`.repeat(6);
    const withCaption = sanitizeReportHtmlFragment(`<table><caption>Cap</caption><tbody>${rows}</tbody></table>`, "conclusion");
    const atBoundary = sanitizeReportHtmlFragment(`<table><caption>Cap</caption><tbody>${rows}</tbody></table>${"<div></div>".repeat(7)}`, "conclusion");
    const overBoundary = sanitizeReportHtmlFragment(`<table><caption>Cap</caption><tbody>${rows}</tbody></table>${"<div></div>".repeat(8)}`, "conclusion");

    expect(withCaption.ok).toBe(true);
    expect(atBoundary.ok).toBe(true);
    expect(overBoundary).toMatchObject({
      ok: false,
      issue: expect.stringContaining("24 estimated lines"),
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
    ["introduction", 8, 4, 32],
    ["conclusion", 4, 2, 24],
  ] as const)(
    "enforces exact %s semantic layout sublimits",
    (position, lineBreaks, headings, estimatedLines) => {
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

      const acceptedBlocks = "<div></div>".repeat(estimatedLines);
      expect(sanitizeReportHtmlFragment(acceptedBlocks, position).ok).toBe(true);
      expect(sanitizeReportHtmlFragment(`${acceptedBlocks}<div></div>`, position)).toMatchObject({
        ok: false,
        issue: expect.stringContaining(`${estimatedLines} estimated lines`),
      });
    },
  );

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
