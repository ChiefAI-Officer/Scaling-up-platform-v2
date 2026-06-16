/**
 * Wave D Task 6a — results-email builders.
 *
 * `buildResultsEmailHtml` combines the admin-authored markdown body with the
 * Spec-16 rendered report HTML. `buildCoachNotifyEmail` produces a short
 * notification with an ABSOLUTE link to the gated Spec-13 report (minimal PII).
 *
 * Both are pure (props in → string out); every interpolated value is escaped.
 */

import {
  renderResultsEmailBodyHtml,
  buildResultsEmailHtml,
  buildCoachNotifyEmail,
} from "@/lib/assessments/results-email";

describe("renderResultsEmailBodyHtml", () => {
  it("renders paragraphs from blank-line-separated markdown", () => {
    const html = renderResultsEmailBodyHtml("First para.\n\nSecond para.");
    expect(html).toContain("First para.");
    expect(html).toContain("Second para.");
    // Two paragraphs.
    expect((html.match(/<p/g) ?? []).length).toBe(2);
  });

  it("escapes HTML in the body (no raw tags survive)", () => {
    const html = renderResultsEmailBodyHtml("Hello <script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("supports **bold** and [text](https://x) links, rejecting non-http schemes", () => {
    const html = renderResultsEmailBodyHtml(
      "**bold** and [ok](https://example.com) and [bad](javascript:alert(1))",
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("javascript:");
  });

  it("empty/whitespace body renders nothing", () => {
    expect(renderResultsEmailBodyHtml("")).toBe("");
    expect(renderResultsEmailBodyHtml("   \n  ")).toBe("");
  });
});

describe("buildResultsEmailHtml", () => {
  it("concatenates the admin body HTML and the report HTML", () => {
    const out = buildResultsEmailHtml({
      bodyMarkdown: "Your results are ready.",
      reportHtml: "<table>REPORT</table>",
    });
    expect(out).toContain("Your results are ready.");
    expect(out).toContain("<table>REPORT</table>");
    // Body precedes the report.
    expect(out.indexOf("Your results are ready.")).toBeLessThan(
      out.indexOf("REPORT"),
    );
  });

  it("works with an empty admin body (report only)", () => {
    const out = buildResultsEmailHtml({
      bodyMarkdown: "",
      reportHtml: "<table>REPORT</table>",
    });
    expect(out).toContain("REPORT");
  });
});

describe("buildCoachNotifyEmail", () => {
  it("builds an absolute gated-report link from APP_URL + campaignId + respondentId", () => {
    const { subject, bodyHtml } = buildCoachNotifyEmail({
      appUrl: "https://app.example.com",
      campaignId: "camp-1",
      respondentId: "resp-1",
      assessmentName: "Rockefeller Habits Checklist",
    });
    expect(subject.length).toBeGreaterThan(0);
    expect(bodyHtml).toContain(
      "https://app.example.com/assessments/camp-1/respondents/resp-1/report",
    );
    // Assessment name appears (escaped) in the body.
    expect(bodyHtml).toContain("Rockefeller Habits Checklist");
  });

  it("trims a trailing slash on APP_URL so the link has no double slash", () => {
    const { bodyHtml } = buildCoachNotifyEmail({
      appUrl: "https://app.example.com/",
      campaignId: "c",
      respondentId: "r",
      assessmentName: "X",
    });
    expect(bodyHtml).toContain("https://app.example.com/assessments/c/respondents/r/report");
    expect(bodyHtml).not.toContain("example.com//assessments");
  });

  it("does NOT leak respondent PII (email/name) into the coach-notify body", () => {
    const { bodyHtml } = buildCoachNotifyEmail({
      appUrl: "https://app.example.com",
      campaignId: "c",
      respondentId: "r",
      assessmentName: "X",
    });
    // The builder is given no PII; the link is the only way to the data.
    expect(bodyHtml).not.toContain("@");
  });

  it("escapes the assessment name", () => {
    const { bodyHtml } = buildCoachNotifyEmail({
      appUrl: "https://app.example.com",
      campaignId: "c",
      respondentId: "r",
      assessmentName: "<b>X</b>",
    });
    expect(bodyHtml).not.toContain("<b>X</b>");
    expect(bodyHtml).toContain("&lt;b&gt;X&lt;/b&gt;");
  });
});
