export const REPORT_STYLE_KEYS = Object.freeze([
  "CLASSIC",
  "EXECUTIVE_BOARDROOM",
  "MODERN_DASHBOARD",
] as const);

export type ReportStyleKey = (typeof REPORT_STYLE_KEYS)[number];

export type ReportStyleMetadata = Readonly<{
  label: string;
  description: string;
  paperFormat: "A4" | "US Letter";
  rendererKey: string;
  previews: Readonly<{
    cover: string;
    summary: string;
    detail: string;
  }>;
}>;

function metadata(
  label: string,
  description: string,
  paperFormat: ReportStyleMetadata["paperFormat"],
  rendererKey: string,
): ReportStyleMetadata {
  const basePath = `/report-style-previews/${rendererKey}`;

  return Object.freeze({
    label,
    description,
    paperFormat,
    rendererKey,
    previews: Object.freeze({
      cover: `${basePath}/cover.webp`,
      summary: `${basePath}/summary.webp`,
      detail: `${basePath}/detail.webp`,
    }),
  });
}

export const REPORT_STYLE_REGISTRY: Readonly<Record<ReportStyleKey, ReportStyleMetadata>> =
  Object.freeze({
    CLASSIC: metadata(
      "Classic",
      "The current Scaling Up report presentation.",
      "A4",
      "classic",
    ),
    EXECUTIVE_BOARDROOM: metadata(
      "Executive Boardroom",
      "Editorial, restrained, and board-ready.",
      "US Letter",
      "executive-boardroom",
    ),
    MODERN_DASHBOARD: metadata(
      "Modern Dashboard",
      "Compact, visual, and data-forward.",
      "US Letter",
      "modern-dashboard",
    ),
  });

export function isReportStyleKey(value: unknown): value is ReportStyleKey {
  return typeof value === "string" && REPORT_STYLE_KEYS.some((key) => key === value);
}

export function getReportStyleMetadata(style: ReportStyleKey): ReportStyleMetadata {
  return REPORT_STYLE_REGISTRY[style];
}
