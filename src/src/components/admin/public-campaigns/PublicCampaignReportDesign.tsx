"use client";

import { useEffect, useState } from "react";
import { ReportStylePicker } from "@/components/assessments/ReportStylePicker";
import type { PublicCampaignViewModel } from "@/lib/assessments/public-campaign-ui";
import {
  isReportStyleKey,
  resolveReportStylePreviewAnatomy,
  type ReportStyleKey,
} from "@/lib/assessments/report-style-registry";

interface PublicCampaignReportDesignProps {
  campaign: PublicCampaignViewModel;
  expanded: boolean;
  onCampaignUpdated: (campaign: PublicCampaignViewModel) => void;
}

type Appearance = Pick<
  PublicCampaignViewModel,
  "reportStyle" | "reportStyleSource" | "reportStyleLockedAt"
>;

interface ReportStyleEnvelope {
  success?: boolean;
  data?: {
    id?: unknown;
    reportStyle?: unknown;
    reportStyleSource?: unknown;
    reportStyleLockedAt?: unknown;
  };
}

function appearanceFromCampaign(campaign: PublicCampaignViewModel): Appearance {
  return {
    reportStyle: campaign.reportStyle,
    reportStyleSource: campaign.reportStyleSource,
    reportStyleLockedAt: campaign.reportStyleLockedAt,
  };
}

function validAppearance(
  campaignId: string,
  data: ReportStyleEnvelope["data"],
): Appearance | null {
  if (
    data?.id !== campaignId ||
    !isReportStyleKey(data.reportStyle) ||
    (data.reportStyleSource !== "TEMPLATE_DEFAULT" &&
      data.reportStyleSource !== "CAMPAIGN_OVERRIDE") ||
    (data.reportStyleLockedAt !== null &&
      typeof data.reportStyleLockedAt !== "string")
  ) {
    return null;
  }

  return {
    reportStyle: data.reportStyle,
    reportStyleSource: data.reportStyleSource,
    reportStyleLockedAt: data.reportStyleLockedAt,
  };
}

export function PublicCampaignReportDesign({
  campaign,
  expanded,
  onCampaignUpdated,
}: PublicCampaignReportDesignProps) {
  const [appearance, setAppearance] = useState<Appearance>(() =>
    appearanceFromCampaign(campaign),
  );
  const [draft, setDraft] = useState<ReportStyleKey>(campaign.reportStyle);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const authoritativeReportStyle = campaign.reportStyle;
  const authoritativeReportStyleSource = campaign.reportStyleSource;
  const authoritativeReportStyleLockedAt = campaign.reportStyleLockedAt;

  useEffect(() => {
    const nextAppearance: Appearance = {
      reportStyle: authoritativeReportStyle,
      reportStyleSource: authoritativeReportStyleSource,
      reportStyleLockedAt: authoritativeReportStyleLockedAt,
    };
    setAppearance(nextAppearance);
    setDraft(nextAppearance.reportStyle);
  }, [
    authoritativeReportStyle,
    authoritativeReportStyleLockedAt,
    authoritativeReportStyleSource,
  ]);

  if (!expanded) return null;

  const locked = appearance.reportStyleLockedAt !== null;
  const sourceCopy =
    appearance.reportStyleSource === "CAMPAIGN_OVERRIDE"
      ? "Customized for this campaign"
      : "Uses the assessment's default design";

  async function saveReportDesign() {
    if (locked || saving || draft === appearance.reportStyle) return;

    setSaving(true);
    setSaveError(false);
    setSaved(false);

    try {
      const response = await fetch(
        `/api/admin/public-campaigns/${campaign.id}/report-style`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportStyle: draft }),
        },
      );
      const body = (await response.json()) as ReportStyleEnvelope;
      const nextAppearance = validAppearance(campaign.id, body.data);

      if (response.status === 409 && nextAppearance) {
        setAppearance(nextAppearance);
        setDraft(nextAppearance.reportStyle);
        onCampaignUpdated({ ...campaign, ...nextAppearance });
        return;
      }

      if (!response.ok || body.success !== true || !nextAppearance) {
        throw new Error("Invalid report design response");
      }

      setAppearance(nextAppearance);
      setDraft(nextAppearance.reportStyle);
      setSaved(true);
      onCampaignUpdated({ ...campaign, ...nextAppearance });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={`${campaign.name} report design`}
      className="max-w-5xl space-y-4"
    >
      <p className="text-sm font-medium text-muted-foreground">{sourceCopy}</p>
      {locked && (
        <p className="text-sm font-medium text-muted-foreground">
          This report design cannot be changed after the first response.
        </p>
      )}

      <ReportStylePicker
        value={locked ? appearance.reportStyle : draft}
        onChange={(value) => {
          if (!locked) {
            setDraft(value);
            setSaveError(false);
            setSaved(false);
          }
        }}
        disabled={locked || saving}
        previewAnatomy={resolveReportStylePreviewAnatomy({
          templateAlias: campaign.template?.alias,
          capabilities: campaign.reportStylePreviewCapabilities,
        })}
      />

      {!locked && (
        <button
          type="button"
          className="wf-btn wf-btn-primary wf-btn-sm"
          disabled={saving || draft === appearance.reportStyle}
          onClick={saveReportDesign}
        >
          {saving ? "Saving…" : "Save report design"}
        </button>
      )}

      {saved && (
        <p role="status" className="text-sm font-medium text-emerald-700">
          Report design saved.
        </p>
      )}
      {saveError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          We couldn&apos;t save the report design. Try again.
        </p>
      )}
    </section>
  );
}
