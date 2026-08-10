"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { PublicCampaignActions } from "@/components/admin/public-campaigns/PublicCampaignActions";
import { PublicCampaignResponses } from "@/components/admin/public-campaigns/PublicCampaignResponses";
import {
  decodePublicCampaignList,
  publicCampaignScheduleLabel,
  publicCampaignStatusLabel,
  type PublicCampaignViewModel,
} from "@/lib/assessments/public-campaign-ui";

interface PublicCampaignListProps {
  createdCampaignId?: string;
}

interface ListResponse {
  success?: boolean;
  data?: unknown;
}

const cellClassName =
  "max-[1120px]:grid max-[1120px]:grid-cols-[7.5rem_minmax(0,1fr)] max-[1120px]:gap-2 max-[1120px]:border-0 max-[1120px]:py-2.5 max-[1120px]:before:text-[0.6875rem] max-[1120px]:before:font-bold max-[1120px]:before:uppercase max-[1120px]:before:tracking-[0.05em] max-[1120px]:before:text-muted-foreground max-[1120px]:before:content-[attr(data-label)]";

export function PublicCampaignList({
  createdCampaignId,
}: PublicCampaignListProps) {
  const [campaigns, setCampaigns] = useState<PublicCampaignViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [responsesExpandedId, setResponsesExpandedId] = useState<string | null>(null);
  const [visitedResponseIds, setVisitedResponseIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const createdStatusRef = useRef<HTMLDivElement>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const createdCampaignExists = campaigns.some(
    (campaign) => campaign.id === createdCampaignId,
  );

  useEffect(() => {
    let active = true;

    async function loadCampaigns() {
      try {
        const response = await fetch("/api/admin/public-campaigns");
        const body = (await response.json()) as ListResponse;
        const decodedCampaigns = decodePublicCampaignList(body.data);
        if (!response.ok || body.success !== true || decodedCampaigns === null) {
          throw new Error("Invalid campaign list response");
        }
        if (active) setCampaigns(decodedCampaigns);
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

  useEffect(() => {
    if (!loading && createdCampaignExists) {
      createdStatusRef.current?.focus();
    }
  }, [createdCampaignExists, loading]);

  function patchCampaign(
    campaignId: string,
    updates: Pick<PublicCampaignViewModel, "status">,
  ) {
    setCampaigns((current) =>
      current.map((campaign) =>
        campaign.id === campaignId ? { ...campaign, ...updates } : campaign,
      ),
    );
  }

  function toggleResponses(campaignId: string) {
    if (responsesExpandedId === campaignId) {
      setResponsesExpandedId(null);
      return;
    }

    setVisitedResponseIds((current) => new Set(current).add(campaignId));
    setResponsesExpandedId(campaignId);
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
      {createdCampaignExists && (
        <div
          ref={createdStatusRef}
          role="status"
          tabIndex={-1}
          className="mb-4 rounded-md border border-success/20 bg-success/10 px-4 py-3 text-sm font-semibold text-success"
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
        <div className="wf-table-wrap">
          <table className="wf-table">
            <thead className="max-[1120px]:hidden">
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

                const responsesExpanded = responsesExpandedId === campaign.id;

                return (
                  <Fragment key={campaign.id}>
                    <tr
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
                            ? "bg-success/10 text-success"
                            : campaign.status === "DRAFT"
                              ? "bg-warning/10 text-warning"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            campaign.status === "ACTIVE"
                              ? "bg-success"
                              : campaign.status === "DRAFT"
                                ? "bg-warning"
                                : "bg-muted-foreground"
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
                        onCampaignUpdated={(updates) =>
                          patchCampaign(campaign.id, updates)
                        }
                        onToggleResponses={() => toggleResponses(campaign.id)}
                        responsesExpanded={responsesExpanded}
                      />
                    </td>
                    </tr>
                    {visitedResponseIds.has(campaign.id) && (
                      <tr
                        className="wf-tr"
                        hidden={!responsesExpanded}
                        aria-hidden={!responsesExpanded}
                      >
                        <td className="wf-td" colSpan={6}>
                          <PublicCampaignResponses
                            campaignId={campaign.id}
                            expanded={responsesExpanded}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
