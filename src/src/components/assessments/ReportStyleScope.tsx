import { cloneElement, type ReactElement } from "react";

import { effectiveReportStyle } from "@/lib/assessments/report-style-policy";
import type { RespondentReport } from "@/lib/assessments/respondent-report";

type ReportStyleScopeChildProps = {
  "data-enabled-report-style"?: string;
};

/**
 * Adds the server-authoritative enabled appearance to an existing outer report
 * surface. Dark and kill-switch paths return the original element unchanged,
 * preserving the legacy Classic renderer DOM and computed-style contract.
 */
export function ReportStyleScope({
  report,
  reportStylesAvailable,
  children,
}: {
  report: RespondentReport;
  reportStylesAvailable?: boolean;
  children: ReactElement<ReportStyleScopeChildProps>;
}) {
  if (reportStylesAvailable !== true) return children;

  const storedStyle =
    typeof report.reportStyle === "string" ? report.reportStyle : undefined;
  const enabledStyle = effectiveReportStyle({
    storedStyle,
    available: true,
  });

  return cloneElement(children, {
    "data-enabled-report-style": enabledStyle,
  });
}
