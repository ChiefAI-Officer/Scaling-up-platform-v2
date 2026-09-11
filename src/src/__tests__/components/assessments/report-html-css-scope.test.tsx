import { renderToStaticMarkup } from "react-dom/server";
import { ReportHtmlSection } from "@/components/assessments/ReportHtmlSection";
import { sanitizeReportHtmlFragment } from "@/lib/assessments/report-html-sanitizer";
import type { SafeReportHtmlFragment } from "@/lib/assessments/report-html";

describe("authored report CSS containment", () => {
  it.each(["introduction", "conclusion"] as const)(
    "scopes %s CSS to its authored report region",
    (position) => {
      const result = sanitizeReportHtmlFragment(
        '<style>p { color: red; } .promo { display: flex; gap: 16px; }</style><div class="promo"><p>Authored copy</p></div>',
        position,
      );
      expect(result.ok).toBe(true);

      const markup = renderToStaticMarkup(
        <ReportHtmlSection
          position={position}
          html={result.html as SafeReportHtmlFragment}
        />,
      );

      expect(markup).toContain(
        `class="su-report-custom-html su-report-custom-html--${position}"`,
      );
      expect(markup).toContain('<div class="promo"><p>Authored copy</p></div>');
      expect(markup).toContain(
        `<style>@scope (.su-report-custom-html--${position}) {p{color:red}.promo{display:flex;gap:16px}}</style>`,
      );
    },
  );

  it("repairs an omitted closing brace before adding the scope wrapper", () => {
    const result = sanitizeReportHtmlFragment(
      '<style>.promo { color: red</style><div class="promo">Authored copy</div>',
      "conclusion",
    );
    expect(result.ok).toBe(true);

    const markup = renderToStaticMarkup(
      <ReportHtmlSection
        position="conclusion"
        html={result.html as SafeReportHtmlFragment}
      />,
    );

    expect(markup).toContain(
      '<style>@scope (.su-report-custom-html--conclusion) {.promo{color:red}}</style>',
    );
  });
});
