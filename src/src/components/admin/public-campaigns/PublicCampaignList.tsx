"use client";

import { useEffect, useState } from "react";
import { PublicCampaignActions } from "@/components/admin/public-campaigns/PublicCampaignActions";
import {
  publicCampaignScheduleLabel,
  publicCampaignStatusLabel,
  type PublicCampaignViewModel,
} from "@/lib/assessments/public-campaign-ui";

interface PublicCampaignListProps {
  createdCampaignId?: string;
}

interface ListResponse {
  success?: boolean;
  data?: PublicCampaignViewModel[];
}

const cellClassName =
  "border-b border-border px-3.5 py-4 align-middle max-[1120px]:grid max-[1120px]:grid-cols-[7.5rem_minmax(0,1fr)] max-[1120px]:gap-2 max-[1120px]:border-0 max-[1120px]:py-2.5 max-[1120px]:before:text-[0.6875rem] max-[1120px]:before:font-bold max-[1120px]:before:uppercase max-[1120px]:before:tracking-[0.05em] max-[1120px]:before:text-muted-foreground max-[1120px]:before:content-[attr(data-label)]";

export function PublicCampaignList({
  createdCampaignId,
}: PublicCampaignListProps) {
  const [campaigns, setCampaigns] = useState<PublicCampaignViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [responsesExpandedId, setResponsesExpandedId] = useState<string | null>(null);
  const [reportDesignExpandedId, setReportDesignExpandedId] = useState<string | null>(
    null,
  );
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    let active = true;

    async function loadCampaigns() {
      try {
        const response = await fetch("/api/admin/public-campaigns");
        const body = (await response.json()) as ListResponse;
        if (!response.ok || body.success !== true || !Array.isArray(body.data)) {
          throw new Error("Invalid campaign list response");
        }
        if (active) setCampaigns(body.data);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCampaigns();
    return () => {
      active = false;
    };
  }, []);

  function replaceCampaign(updated: PublicCampaignViewModel) {
    setCampaigns((current) =>
      current.map((campaign) =>
        campaign.id === updated.id ? updated : campaign,
      ),
    );
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading campaigns…
      </p>
    );
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive"
      >
        We couldn&apos;t load campaigns. Try again.
      </div>
    );
  }

  return (
    <section aria-label="Public campaigns">
      {createdCampaignId && (
        <div
          role="status"
          className="mb-4 rounded-md border border-emerald-600/30 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
        >
          Campaign created as a draft.
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-5 py-6">
          <h3 className="text-sm font-semibold text-foreground">
            No public campaigns yet.
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a campaign to share an assessment using a public link.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted max-[1120px]:hidden">
              <tr>
                {[
                  "Campaign",
                  "Assessment",
                  "Status",
                  "Availability",
                  "Responses",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="border-b border-border px-3.5 py-3 text-left text-[0.6875rem] font-bold uppercase tracking-[0.05em] text-muted-foreground"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="max-[1120px]:block">
              {campaigns.map((campaign) => {
                const created = campaign.id === createdCampaignId;
                const responseLabel = `${campaign.responseCount} ${
                  campaign.responseCount === 1 ? "response" : "responses"
                }`;

                return (
                  <tr
                    key={campaign.id}
                    data-created={created ? "true" : undefined}
                    className={`max-[1120px]:grid max-[1120px]:grid-cols-2 max-[1120px]:border-b max-[1120px]:border-border max-[760px]:grid-cols-1 ${
                      created ? "bg-primary/5" : ""
                    }`}
                  >
                    <td
                      data-label="Campaign"
                      className={`${cellClassName} ${
                        created
                          ? "shadow-[inset_4px_0_0_hsl(var(--primary))]"
                          : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold leading-snug">
                          {campaign.name}
                        </span>
                        {created && (
                          <span className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-bold text-primary">
                            Just created
                          </span>
                        )}
                      </span>
                    </td>
                    <td data-label="Assessment" className={cellClassName}>
                      {campaign.template?.name ?? "Assessment unavailable"}
                    </td>
                    <td data-label="Status" className={cellClassName}>
                      <span
                        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          campaign.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-800"
                            : campaign.status === "DRAFT"
                              ? "bg-amber-50 text-amber-800"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            campaign.status === "ACTIVE"
                              ? "bg-emerald-600"
                              : campaign.status === "DRAFT"
                                ? "bg-amber-500"
                                : "bg-slate-400"
                          }`}
                        />
                        {publicCampaignStatusLabel(campaign.status)}
                      </span>
                    </td>
                    <td
                      data-label="Availability"
                      className={`${cellClassName} text-muted-foreground`}
                    >
                      {publicCampaignScheduleLabel(campaign)}
                    </td>
                    <td
                      data-label="Responses"
                      className={`${cellClassName} tabular-nums font-semibold`}
                    >
                      {responseLabel}
                    </td>
                    <td
                      data-label="Actions"
                      className={`${cellClassName} max-[1120px]:col-span-2 max-[760px]:col-span-1`}
                    >
                      <PublicCampaignActions
                        campaign={campaign}
                        origin={origin}
                        onCampaignUpdated={replaceCampaign}
                        onToggleResponses={() =>
                          setResponsesExpandedId((current) =>
                            current === campaign.id ? null : campaign.id,
                          )
                        }
                        responsesExpanded={responsesExpandedId === campaign.id}
                        onToggleReportDesign={() =>
                          setReportDesignExpandedId((current) =>
                            current === campaign.id ? null : campaign.id,
                          )
                        }
                        reportDesignExpanded={
                          reportDesignExpandedId === campaign.id
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
