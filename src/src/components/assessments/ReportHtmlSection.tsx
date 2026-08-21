export function ReportHtmlSection({
  position,
  html,
}: {
  position: "introduction" | "conclusion";
  html: string;
}) {
  return (
    <section
      className={`su-report-custom-html su-report-custom-html--${position}`}
      data-testid={`report-html-${position}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
