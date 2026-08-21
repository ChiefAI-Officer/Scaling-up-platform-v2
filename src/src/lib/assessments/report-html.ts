import {
  sanitizeReportHtmlFragment,
  type SanitizeReportHtmlResult,
} from "@/lib/assessments/report-html-sanitizer";

export interface ReportHtmlConfigV1 {
  schemaVersion: 1;
  introductionHtml: string | null;
  conclusionHtml: string | null;
}

export interface SafeReportHtml {
  introductionHtml: string | null;
  conclusionHtml: string | null;
}

export type ReportHtmlIssue = {
  path: string;
  message: string;
};

type PreparedReportConfig =
  | {
      ok: true;
      reportConfig: unknown;
      didStripContent: boolean;
    }
  | {
      ok: false;
      reportConfig: unknown;
      issues: ReportHtmlIssue[];
    };

const EMPTY_REPORT_HTML: ReportHtmlConfigV1 = {
  schemaVersion: 1,
  introductionHtml: null,
  conclusionHtml: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFragment(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function extractReportHtml(reportConfig: unknown): ReportHtmlConfigV1 {
  if (!isRecord(reportConfig) || !isRecord(reportConfig.reportHtml)) {
    return { ...EMPTY_REPORT_HTML };
  }

  const value = reportConfig.reportHtml;
  if (
    value.schemaVersion !== 1 ||
    !isFragment(value.introductionHtml) ||
    !isFragment(value.conclusionHtml)
  ) {
    return { ...EMPTY_REPORT_HTML };
  }

  return {
    schemaVersion: 1,
    introductionHtml: value.introductionHtml,
    conclusionHtml: value.conclusionHtml,
  };
}

export function mergeReportHtml(
  reportConfig: unknown,
  reportHtml: ReportHtmlConfigV1,
): Record<string, unknown> {
  return {
    ...(isRecord(reportConfig) ? reportConfig : {}),
    reportHtml: { ...reportHtml },
  };
}

function sanitizeFragmentForStorage(
  value: string | null,
): { value: string | null; result?: SanitizeReportHtmlResult } {
  if (value === null || value.trim() === "") return { value: null };
  const result = sanitizeReportHtmlFragment(value);
  return { value: result.ok ? result.html : null, result };
}

export function prepareReportHtmlForStorage(
  reportConfig: unknown,
): PreparedReportConfig {
  if (!isRecord(reportConfig) || !("reportHtml" in reportConfig)) {
    return { ok: true, reportConfig, didStripContent: false };
  }

  if (!isRecord(reportConfig.reportHtml)) {
    return {
      ok: false,
      reportConfig,
      issues: [
        {
          path: "reportHtml",
          message: "Expected an object.",
        },
      ],
    };
  }

  const value = reportConfig.reportHtml;
  const issues: ReportHtmlIssue[] = [];
  if (value.schemaVersion !== 1) {
    issues.push({
      path: "reportHtml.schemaVersion",
      message: "Expected schema version 1.",
    });
  }

  for (const field of ["introductionHtml", "conclusionHtml"] as const) {
    if (!isFragment(value[field])) {
      issues.push({
        path: `reportHtml.${field}`,
        message: "Expected a string or null.",
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, reportConfig, issues };
  }

  const introduction = sanitizeFragmentForStorage(
    value.introductionHtml as string | null,
  );
  const conclusion = sanitizeFragmentForStorage(
    value.conclusionHtml as string | null,
  );
  for (const [field, result] of [
    ["introductionHtml", introduction.result],
    ["conclusionHtml", conclusion.result],
  ] as const) {
    if (result && !result.ok) {
      issues.push({
        path: `reportHtml.${field}`,
        message: result.issue ?? "Invalid report HTML.",
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, reportConfig, issues };
  }

  return {
    ok: true,
    reportConfig: mergeReportHtml(reportConfig, {
      schemaVersion: 1,
      introductionHtml: introduction.value,
      conclusionHtml: conclusion.value,
    }),
    didStripContent:
      introduction.result?.didStripContent === true ||
      conclusion.result?.didStripContent === true,
  };
}

function emitCanonicalDrift(
  field: keyof SafeReportHtml,
  onDrift?: (field: keyof SafeReportHtml) => void,
): void {
  if (onDrift) {
    onDrift(field);
    return;
  }
  console.warn("[report-html] stored fragment required canonicalization", {
    field,
  });
}

export function loadSafeReportHtml(
  reportConfig: unknown,
  options: { onDrift?: (field: keyof SafeReportHtml) => void } = {},
): SafeReportHtml {
  if (!isRecord(reportConfig) || !isRecord(reportConfig.reportHtml)) {
    return { introductionHtml: null, conclusionHtml: null };
  }

  const stored = reportConfig.reportHtml;
  if (stored.schemaVersion !== 1) {
    emitCanonicalDrift("introductionHtml", options.onDrift);
    emitCanonicalDrift("conclusionHtml", options.onDrift);
    return { introductionHtml: null, conclusionHtml: null };
  }

  const loadFragment = (field: keyof SafeReportHtml): string | null => {
    const value = stored[field];
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string") {
      emitCanonicalDrift(field, options.onDrift);
      return null;
    }

    if (value.trim() === "") {
      emitCanonicalDrift(field, options.onDrift);
      return null;
    }

    const result = sanitizeReportHtmlFragment(value);
    if (!result.ok) {
      emitCanonicalDrift(field, options.onDrift);
      return null;
    }
    if (result.html !== value) emitCanonicalDrift(field, options.onDrift);
    return result.html || null;
  };

  return {
    introductionHtml: loadFragment("introductionHtml"),
    conclusionHtml: loadFragment("conclusionHtml"),
  };
}
