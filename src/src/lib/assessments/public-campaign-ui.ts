import {
  isReportStyleKey,
  type ReportStyleKey,
  type ReportStylePreviewCapabilities,
} from "@/lib/assessments/report-style-registry";

export type PublicCampaignStatus = "DRAFT" | "ACTIVE" | "CLOSED";

export interface PublicCampaignViewModel {
  id: string;
  name: string;
  alias: string;
  status: PublicCampaignStatus;
  openAt: string;
  closeAt: string | null;
  responseCount: number;
  reportStyle: ReportStyleKey;
  reportStyleSource: "TEMPLATE_DEFAULT" | "CAMPAIGN_OVERRIDE";
  reportStyleLockedAt: string | null;
  reportStylesAvailable: boolean;
  reportStylePreviewCapabilities?: ReportStylePreviewCapabilities;
  template: { id: string; name: string; alias: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isPreviewCapabilities(
  value: unknown,
): value is ReportStylePreviewCapabilities {
  return (
    isRecord(value) &&
    (value.reportType === "scored" || value.reportType === "qualitative") &&
    typeof value.hasMetrics === "boolean" &&
    typeof value.hasNarrativeResponses === "boolean"
  );
}

function isTemplate(
  value: unknown,
): value is NonNullable<PublicCampaignViewModel["template"]> {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.alias === "string"
  );
}

function isPublicCampaignViewModel(
  value: unknown,
): value is PublicCampaignViewModel {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.alias === "string" &&
    (value.status === "DRAFT" ||
      value.status === "ACTIVE" ||
      value.status === "CLOSED") &&
    isDateString(value.openAt) &&
    (value.closeAt === null || isDateString(value.closeAt)) &&
    typeof value.responseCount === "number" &&
    Number.isFinite(value.responseCount) &&
    value.responseCount >= 0 &&
    isReportStyleKey(value.reportStyle) &&
    (value.reportStyleSource === "TEMPLATE_DEFAULT" ||
      value.reportStyleSource === "CAMPAIGN_OVERRIDE") &&
    (value.reportStyleLockedAt === null ||
      isDateString(value.reportStyleLockedAt)) &&
    typeof value.reportStylesAvailable === "boolean" &&
    (value.reportStylePreviewCapabilities === undefined ||
      isPreviewCapabilities(value.reportStylePreviewCapabilities)) &&
    (value.template === null || isTemplate(value.template))
  );
}

export function decodePublicCampaignList(
  value: unknown,
): PublicCampaignViewModel[] | null {
  if (!Array.isArray(value) || !value.every(isPublicCampaignViewModel)) {
    return null;
  }

  return value;
}

export function publicCampaignStatusLabel(status: PublicCampaignStatus): string {
  return { DRAFT: "Draft", ACTIVE: "Live", CLOSED: "Closed" }[status];
}

export function publicCampaignUrl(origin: string, alias: string): string {
  return new URL(`/quiz/${encodeURIComponent(alias)}`, origin).toString();
}

export function publicCampaignScheduleLabel(
  input: Pick<PublicCampaignViewModel, "status" | "openAt" | "closeAt">,
  now = new Date(),
  format: (date: Date) => string = defaultFormatter,
): string {
  const openAt = new Date(input.openAt);
  const closeAt = input.closeAt ? new Date(input.closeAt) : null;

  if (input.status === "CLOSED") {
    return closeAt ? `Closed ${format(closeAt)}` : "Closed";
  }

  if (openAt > now) {
    return `Opens ${format(openAt)}${closeAt ? "" : " · No end date"}`;
  }

  if (input.status === "DRAFT") {
    return `Opens when published${closeAt ? "" : " · No end date"}`;
  }

  return closeAt ? `Open until ${format(closeAt)}` : "Open now · No end date";
}

export function publicCampaignCreateError(_status: number, error: string): string {
  if (error === "TEMPLATE_VERSION_NOT_PUBLISHED" || error === "TEMPLATE_DISABLED") {
    return "Publish this assessment before creating a campaign.";
  }

  return "We couldn't create this campaign. Check the details and try again.";
}

function defaultFormatter(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
