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
  reportType: "scored" | "qualitative";
  hasMetrics: boolean;
  hasNarrativeResponses: boolean;
}>;

const METRIC_QUESTION_TYPES = new Set([
  "SLIDER_LIKERT",
  "NUMBER",
  "MULTI_CHOICE",
]);
const NARRATIVE_QUESTION_TYPES = new Set([
  "TEXT",
  "TEXTAREA",
  "LONG_TEXT",
  "SHORT_TEXT",
]);

/**
 * Projects the canonical report family and stored version-question content
 * into the small capability shape needed by the illustrative preview picker.
 * Unknown or malformed rows are ignored rather than guessed from labels,
 * stable keys, or alias naming conventions.
 */
export function deriveReportStylePreviewCapabilities({
  templateAlias,
  questions,
}: {
  templateAlias: string | null | undefined;
  questions: unknown;
}): ReportStylePreviewCapabilities {
  let hasMetrics = false;
  let hasNarrativeResponses = false;

  if (Array.isArray(questions)) {
    for (const question of questions) {
      if (!question || typeof question !== "object") continue;
      const type = (question as { type?: unknown }).type;
      if (typeof type !== "string") continue;
      if (METRIC_QUESTION_TYPES.has(type)) hasMetrics = true;
      if (NARRATIVE_QUESTION_TYPES.has(type)) hasNarrativeResponses = true;
    }
  }

  return Object.freeze({
    reportType: reportConfigFor(templateAlias).reportType,
    hasMetrics,
    hasNarrativeResponses,
  });
}

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
 * Chooses illustrative content from the template's canonical report family
 * and stored-version capabilities. Explicit content capabilities take
 * precedence over the default family for narrative-only custom instruments;
 * this selects preview evidence only and never changes real report semantics.
 */
export function resolveReportStylePreviewAnatomy({
  templateAlias,
  capabilities,
}: {
  templateAlias: string | null | undefined;
  capabilities?: ReportStylePreviewCapabilities;
}): ReportStylePreviewAnatomy {
  if (
    capabilities &&
    !capabilities.hasMetrics &&
    capabilities.hasNarrativeResponses
  ) {
    return "sparse-custom";
  }
  if (capabilities) return capabilities.reportType;
  if (reportConfigFor(templateAlias).reportType === "scored") return "scored";
  return "qualitative";
}
