import { reportConfigFor } from "@/lib/assessments/report-config";

export const REPORT_STYLE_KEYS = Object.freeze([
  "CLASSIC",
  "EXECUTIVE_BOARDROOM",
  "MODERN_DASHBOARD",
] as const);

export type ReportStyleKey = (typeof REPORT_STYLE_KEYS)[number];

export const REPORT_STYLE_PREVIEW_PAGES = Object.freeze([
  "cover",
  "summary",
  "detail",
] as const);

export type ReportStylePreviewPage = (typeof REPORT_STYLE_PREVIEW_PAGES)[number];

export const REPORT_STYLE_PREVIEW_ANATOMIES = Object.freeze([
  "scored",
  "qualitative",
  "sparse-custom",
] as const);

export type ReportStylePreviewAnatomy =
  (typeof REPORT_STYLE_PREVIEW_ANATOMIES)[number];

export type ReportStylePreviewCapabilities = Readonly<{
  hasMetrics?: boolean;
  hasNarrativeResponses?: boolean;
}>;

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
      "A clear, familiar report presentation.",
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

export function getReportStylePreviewPath(
  style: ReportStyleKey,
  anatomy: ReportStylePreviewAnatomy,
  page: ReportStylePreviewPage,
): string {
  const metadata = getReportStyleMetadata(style);
  if (anatomy === "scored") return metadata.previews[page];
  return `/report-style-previews/${anatomy}/${metadata.rendererKey}/${page}.webp`;
}

/**
 * Chooses illustrative content from the template's existing report family.
 * Capabilities refine a qualitative family to the sparse narrative sample;
 * they never reclassify a scored template or change real report semantics.
 */
export function resolveReportStylePreviewAnatomy({
  templateAlias,
  capabilities,
}: {
  templateAlias: string | null | undefined;
  capabilities?: ReportStylePreviewCapabilities;
}): ReportStylePreviewAnatomy {
  if (reportConfigFor(templateAlias).reportType === "scored") return "scored";
  if (
    capabilities?.hasMetrics === false &&
    capabilities.hasNarrativeResponses === true
  ) {
    return "sparse-custom";
  }
  return "qualitative";
}
