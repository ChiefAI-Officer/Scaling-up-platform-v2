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
  renderResultsEmailSubject,
  renderResultsEmailBodyHtml,
  buildResultsEmailHtml,
  buildCoachNotifyEmail,
} from "@/lib/assessments/results-email";

describe("respondent first-name personalization", () => {
  it("replaces every exact subject token and strips subject control characters", () => {
    expect(
      renderResultsEmailSubject(
        "{{respondentFirstName}} — results for {{respondentFirstName}}",
        "Ja\r\nne",
      ),
    ).toBe("Jane — results for Jane");
  });

  it("replaces the body token after markdown parsing and HTML-escapes the name", () => {
    const html = renderResultsEmailBodyHtml(
      "Hi {{respondentFirstName}},\n\nYour results are ready.",
      "**<Jane>**",
    );
    expect(html).toContain("Hi **&lt;Jane&gt;**,");
    expect(html).not.toContain("<Jane>");
    expect(html).not.toContain("<strong>&lt;Jane&gt;</strong>");
  });

  it("leaves unsupported token-like text literal", () => {
    const html = renderResultsEmailBodyHtml(
      "{{templateName}} {{tierLabel}} {{tierMessage}} {{perSectionList}}",
      "Jane",
    );
    expect(html).toContain("{{templateName}}");
    expect(html).toContain("{{tierLabel}}");
    expect(html).toContain("{{tierMessage}}");
    expect(html).toContain("{{perSectionList}}");
  });
});

describe("renderResultsEmailBodyHtml", () => {
  it("renders paragraphs from blank-line-separated markdown", () => {
    const html = renderResultsEmailBodyHtml("First para.\n\nSecond para.", "Jane");
    expect(html).toContain("First para.");
    expect(html).toContain("Second para.");
    // Two paragraphs.
    expect((html.match(/<p/g) ?? []).length).toBe(2);
  });

  it("escapes HTML in the body (no raw tags survive)", () => {
    const html = renderResultsEmailBodyHtml("Hello <script>alert(1)</script>", "Jane");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("supports **bold** and [text](https://x) links, rejecting non-http schemes", () => {
    const html = renderResultsEmailBodyHtml(
      "**bold** and [ok](https://example.com) and [bad](javascript:alert(1))",
      "Jane",
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("javascript:");
  });

  it("empty/whitespace body renders nothing", () => {
    expect(renderResultsEmailBodyHtml("", "Jane")).toBe("");
    expect(renderResultsEmailBodyHtml("   \n  ", "Jane")).toBe("");
  });
});

describe("buildResultsEmailHtml", () => {
  it("concatenates the admin body HTML and the report HTML", () => {
    const out = buildResultsEmailHtml({
      bodyMarkdown: "Your results are ready.",
      reportHtml: "<table>REPORT</table>",
      respondentFirstName: "Jane",
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
      respondentFirstName: "Jane",
    });
    expect(out).toContain("REPORT");
  });

  it("adds one escaped CEO self-access CTA after the report", () => {
    const out = buildResultsEmailHtml({
      bodyMarkdown: "Your results are ready.",
      reportHtml: "<table>REPORT</table>",
      respondentFirstName: "Jane",
      ceoSelfAccessUrl: "https://app.example.com/ceo-report-access#t=token&next=report",
    });

    expect(out).toContain("<table>REPORT</table>");
    expect(out).toContain("View and compare your reports");
    expect(out).toContain(
      'href="https://app.example.com/ceo-report-access#t=token&amp;next=report"',
    );
    expect((out.match(/View and compare your reports/g) ?? [])).toHaveLength(1);
    expect(out.indexOf("REPORT")).toBeLessThan(
      out.indexOf("View and compare your reports"),
    );
  });

  it("keeps the existing HTML byte-compatible when CEO self-access is absent", () => {
    const withoutOption = buildResultsEmailHtml({
      bodyMarkdown: "Your results are ready.",
      reportHtml: "<table>REPORT</table>",
      respondentFirstName: "Jane",
    });
    const nullOption = buildResultsEmailHtml({
      bodyMarkdown: "Your results are ready.",
      reportHtml: "<table>REPORT</table>",
      respondentFirstName: "Jane",
      ceoSelfAccessUrl: null,
    });

    expect(nullOption).toBe(withoutOption);
  });

  it.each([
    "javascript:alert(1)",
    "//tracker.example/ceo-report-access",
    "mailto:ceo@example.com",
    "data:text/html,unsafe",
    "/ceo-report-access#t=token",
    "https://ceo:secret@app.example.com/ceo-report-access#t=token",
  ])("rejects an unsafe CEO self-access URL: %s", (ceoSelfAccessUrl) => {
    const out = buildResultsEmailHtml({
      bodyMarkdown: "",
      reportHtml: "<table>REPORT</table>",
      respondentFirstName: "Jane",
      ceoSelfAccessUrl,
    });

    expect(out).toBe("<table>REPORT</table>");
  });

  it("accepts HTTP only for a local self-access origin", () => {
    const local = buildResultsEmailHtml({
      bodyMarkdown: "",
      reportHtml: "<table>REPORT</table>",
      respondentFirstName: "Jane",
      ceoSelfAccessUrl: "http://localhost:3000/ceo-report-access#t=token",
    });
    const remote = buildResultsEmailHtml({
      bodyMarkdown: "",
      reportHtml: "<table>REPORT</table>",
      respondentFirstName: "Jane",
      ceoSelfAccessUrl: "http://app.example.com/ceo-report-access#t=token",
    });

    expect(local).toContain("View and compare your reports");
    expect(remote).toBe("<table>REPORT</table>");
  });
});

describe("buildCoachNotifyEmail", () => {
  it("builds an absolute gated-report link from APP_URL + campaignId + respondentId", () => {
    const { subject, bodyHtml } = buildCoachNotifyEmail({
      appUrl: "https://app.example.com",
      campaignId: "camp-1",
      respondentId: "resp-1",
      assessmentName: "Rockefeller Habits Checklist",
      respondentName: "Jane Doe",
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
      respondentName: "Jane Doe",
    });
    expect(bodyHtml).toContain("https://app.example.com/assessments/c/respondents/r/report");
    expect(bodyHtml).not.toContain("example.com//assessments");
  });

  it("shows the respondent's name in the subject and body (#50)", () => {
    // Jeff #50: the coach must be able to see WHO completed the assessment
    // without clicking through — name in the inbox preview (subject) and body.
    const { subject, bodyHtml } = buildCoachNotifyEmail({
      appUrl: "https://app.example.com",
      campaignId: "c",
      respondentId: "r",
      assessmentName: "Rockefeller Habits Checklist",
      respondentName: "Jane Doe",
    });
    expect(subject).toContain("Jane Doe");
    expect(bodyHtml).toContain("Jane Doe");
  });

  it("renders the email fallback the caller resolved when the name was blank (#50 + Wave P)", () => {
    // The caller resolves the display name via respondentDisplayName, which
    // falls back to the email when first/last are blank. Coach-facing surfaces
    // intentionally show that email so the coach knows who completed it — this
    // reverses the old PII-minimal design per Jeff #50.
    const { subject, bodyHtml } = buildCoachNotifyEmail({
      appUrl: "https://app.example.com",
      campaignId: "c",
      respondentId: "r",
      assessmentName: "X",
      respondentName: "jane@example.com",
    });
    expect(subject).toContain("jane@example.com");
    expect(bodyHtml).toContain("jane@example.com");
  });

  it("keeps the generic 'A respondent' wording when the name is blank (no leading space, no empty <strong>)", () => {
    const { subject, bodyHtml } = buildCoachNotifyEmail({
      appUrl: "https://app.example.com",
      campaignId: "c",
      respondentId: "r",
      assessmentName: "X",
      respondentName: "",
    });
    expect(subject).toBe("A respondent completed X");
    expect(bodyHtml).toContain("A respondent");
    // No empty bold placeholder where a name would go.
    expect(bodyHtml).not.toContain("<strong></strong>");
  });

  it("escapes the respondent name and the assessment name", () => {
    const { bodyHtml } = buildCoachNotifyEmail({
      appUrl: "https://app.example.com",
      campaignId: "c",
      respondentId: "r",
      assessmentName: "<b>X</b>",
      respondentName: "<i>Jane</i>",
    });
    expect(bodyHtml).not.toContain("<b>X</b>");
    expect(bodyHtml).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(bodyHtml).not.toContain("<i>Jane</i>");
    expect(bodyHtml).toContain("&lt;i&gt;Jane&lt;/i&gt;");
  });
});
