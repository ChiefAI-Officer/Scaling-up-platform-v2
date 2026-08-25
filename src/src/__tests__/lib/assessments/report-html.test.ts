import {
  extractReportHtml,
  loadSafeReportHtml,
  mergeReportHtml,
  personalizeSafeReportHtml,
  prepareReportHtmlForStorage,
} from "@/lib/assessments/report-html";
import { sanitizeReportHtmlFragment } from "@/lib/assessments/report-html-sanitizer";
import { QSP_V2_PREFACE_HTML } from "@/lib/assessments/qsp-v2-report-content";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

describe("report HTML configuration", () => {
  it("preserves unrelated report configuration", () => {
    const next = mergeReportHtml(
      {
        publicMarketing: { scoreBands: [{ min: 0, max: 100 }] },
        peer: { enabled: true },
      },
      {
        schemaVersion: 1,
        introductionHtml: "<p>Intro</p>",
        conclusionHtml: null,
      },
    );

    expect(next).toEqual({
      publicMarketing: { scoreBands: [{ min: 0, max: 100 }] },
      peer: { enabled: true },
      reportHtml: {
        schemaVersion: 1,
        introductionHtml: "<p>Intro</p>",
        conclusionHtml: null,
      },
    });
  });

  it("normalizes blank values and stores canonical HTML", () => {
    const prepared = prepareReportHtmlForStorage({
      untouched: { value: 42 },
      reportHtml: {
        schemaVersion: 1,
        introductionHtml: "  ",
        conclusionHtml: '<p onclick="evil()">Safe</p>',
      },
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error("expected success");
    expect(prepared.reportConfig).toMatchObject({ untouched: { value: 42 } });
    expect(extractReportHtml(prepared.reportConfig)).toEqual({
      schemaVersion: 1,
      introductionHtml: null,
      conclusionHtml: "<p>Safe</p>",
    });
    expect(prepared.didStripContent).toBe(true);
  });

  it("applies the smaller closing-message limit without rejecting the same welcome content", () => {
    const text = "x".repeat(901);
    const prepared = prepareReportHtmlForStorage({
      reportHtml: {
        schemaVersion: 1,
        introductionHtml: `<p>${text}</p>`,
        conclusionHtml: `<p>${text}</p>`,
      },
    });

    expect(prepared.ok).toBe(false);
    if (prepared.ok) throw new Error("expected the closing-message limit to fail");
    expect(prepared.issues).toEqual([
      {
        path: "reportHtml.conclusionHtml",
        message: expect.stringMatching(/text/i),
      },
    ]);
  });

  it("leaves configuration without reportHtml unchanged", () => {
    const reportConfig = { publicMarketing: { scoreBands: [] } };
    const prepared = prepareReportHtmlForStorage(reportConfig);

    expect(prepared).toEqual({
      ok: true,
      reportConfig,
      didStripContent: false,
    });
  });

  it("rejects malformed fragments without deleting unrelated configuration", () => {
    const reportConfig = {
      publicMarketing: { scoreBands: [{ min: 0, max: 10 }] },
      reportHtml: {
        schemaVersion: 1,
        introductionHtml: 42,
        conclusionHtml: "<p>CTA</p>",
      },
    };
    const prepared = prepareReportHtmlForStorage(reportConfig);

    expect(prepared.ok).toBe(false);
    if (prepared.ok) throw new Error("expected failure");
    expect(prepared.reportConfig).toBe(reportConfig);
    expect(prepared.issues).toEqual([
      {
        path: "reportHtml.introductionHtml",
        message: "Expected a string or null.",
      },
    ]);
  });

  it("re-sanitizes stored fragments independently and reports canonical drift", () => {
    const onDrift = jest.fn();

    expect(
      loadSafeReportHtml(
        {
          reportHtml: {
            schemaVersion: 1,
            introductionHtml: "<script>bad()</script><p>safe</p>",
            conclusionHtml: "<p>CTA</p>",
          },
        },
        { onDrift },
      ),
    ).toEqual({
      introductionHtml: "<p>safe</p>",
      conclusionHtml: "<p>CTA</p>",
    });
    expect(onDrift).toHaveBeenCalledTimes(1);
    expect(onDrift).toHaveBeenCalledWith("introductionHtml");
  });

  it("re-sanitizes personalized fragments so tokens cannot create unsafe attributes", () => {
    const stored = loadSafeReportHtml({
      reportHtml: {
        schemaVersion: 1,
        introductionHtml: '<a href="{{respondentName}}">Open {{companyName}}</a><img src="{{respondentName}}" alt="Profile">',
        conclusionHtml: null,
      },
    });
    if (!stored.introductionHtml) throw new Error("expected a safe introduction");

    const personalized = personalizeSafeReportHtml(
      stored.introductionHtml,
      {
        respondentName: "javascript:alert(1)",
        companyName: "Acme & Sons",
      },
    );

    expect(personalized).not.toContain("javascript:");
    expect(personalized).not.toMatch(/\b(?:href|src)=/);
    expect(personalized).toContain("<a>Open Acme &amp; Sons</a>");
  });

  it("personalizes the report-safe respondent first-name token", () => {
    const stored = loadSafeReportHtml({
      reportHtml: {
        schemaVersion: 1,
        introductionHtml: "<h1>Dear {{respondentFirstName}},</h1>",
        conclusionHtml: null,
      },
    });
    if (!stored.introductionHtml) throw new Error("expected a safe introduction");

    expect(
      personalizeSafeReportHtml(stored.introductionHtml, {
        respondentName: "Alex Rivera",
      }),
    ).toBe("<h1>Dear Alex,</h1>");
  });

  it("keeps the canonical QSP v2 preface inside the authored-report contract", () => {
    const sanitized = sanitizeReportHtmlFragment(
      QSP_V2_PREFACE_HTML,
      "introduction",
    );

    expect(sanitized).toMatchObject({ ok: true, didStripContent: false });
    expect(sanitized.html).toContain('aria-label="QSP v2 preface"');
    expect(sanitized.html).toContain("Dear {{respondentFirstName}},");
    expect(sanitized.html).toContain(
      "This is your report from the Quarterly Session Preparation Assessment.",
    );
    expect(sanitized.html).toContain("We wish you many great insights.");
    expect(sanitized.html).toContain("Verne Harnish");
    expect(sanitized.html.match(/<img\b/g)).toHaveLength(1);
    expect(sanitized.html).not.toMatch(/<(?:html|head|body|style)\b/i);
    expect(QSP_V2_PREFACE_HTML.length).toBeLessThanOrEqual(12_000);
  });

  it("ships the source-faithful QSP preface brand assets", () => {
    const publicBrand = path.join(process.cwd(), "public", "brand");

    expect(
      existsSync(path.join(publicBrand, "su-logo-color.png")),
    ).toBe(true);
    expect(
      existsSync(path.join(publicBrand, "verne-harnish-qsp-preface.jpg")),
    ).toBe(true);
  });

  it("binds the QSP preface markers to the canonical responsive report layout", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src", "styles", "su-report.css"),
      "utf8",
    );

    expect(css).toContain('[aria-label="QSP v2 preface"]');
    expect(css).toContain('[aria-label="QSP v2 preface brand"]');
    expect(css).toContain('url("/brand/su-logo-color.png")');
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) 220px");
    expect(css).toContain('[aria-label="QSP v2 preface signer"]');
    expect(css).toContain("border-radius: 50%");
    const qspStart = css.indexOf("Jeff's QSP v2 preface");
    const qspEnd = css.indexOf("Source-faithful Scaling Up Full", qspStart);
    expect(css.slice(qspStart, qspEnd)).toContain("break-after: page");
    expect(css.slice(qspStart, qspEnd)).toContain(
      '[data-testid="qual-section-P5_closing"]',
    );
    expect(css.slice(qspStart, qspEnd)).toContain("break-before: page");
  });

  it("drops only a malformed stored fragment", () => {
    const onDrift = jest.fn();

    expect(
      loadSafeReportHtml(
        {
          reportHtml: {
            schemaVersion: 1,
            introductionHtml: { unsafe: true },
            conclusionHtml: "<p>CTA</p>",
          },
        },
        { onDrift },
      ),
    ).toEqual({ introductionHtml: null, conclusionHtml: "<p>CTA</p>" });
    expect(onDrift).toHaveBeenCalledWith("introductionHtml");
  });

  it.each(["td", "th"] as const)(
    "rejects direct table %s children on save and drops them on defensive load",
    (cellTag) => {
      const html = `<table>${`<${cellTag}>x</${cellTag}>`.repeat(24)}</table>`;
      const reportConfig = {
        reportHtml: {
          schemaVersion: 1,
          introductionHtml: html,
          conclusionHtml: "<p>Safe closing</p>",
        },
      };
      const prepared = prepareReportHtmlForStorage(reportConfig);

      expect(prepared).toMatchObject({
        ok: false,
        reportConfig,
        issues: [{
          path: "reportHtml.introductionHtml",
          message: expect.stringMatching(/valid table structure/i),
        }],
      });

      const onDrift = jest.fn();
      expect(loadSafeReportHtml(reportConfig, { onDrift })).toEqual({
        introductionHtml: null,
        conclusionHtml: "<p>Safe closing</p>",
      });
      expect(onDrift).toHaveBeenCalledWith("introductionHtml");
    },
  );
});
