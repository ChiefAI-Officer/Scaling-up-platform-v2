"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  publicCampaignUrl,
  type PublicCampaignViewModel,
} from "@/lib/assessments/public-campaign-ui";

interface PublicCampaignActionsProps {
  campaign: PublicCampaignViewModel;
  origin: string;
  onCampaignUpdated: (updates: Pick<PublicCampaignViewModel, "status">) => void;
  onToggleResponses: () => void;
  responsesExpanded: boolean;
  responsiveEnabled?: boolean;
}

type Notice = { kind: "status" | "alert"; message: string } | null;

export function PublicCampaignActions({
  campaign,
  origin,
  onCampaignUpdated,
  onToggleResponses,
  responsesExpanded,
  responsiveEnabled = false,
}: PublicCampaignActionsProps) {
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  async function publishCampaign() {
    setPublishing(true);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/admin/public-campaigns/${campaign.id}/publish`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        success?: boolean;
        data?: { id?: unknown; status?: unknown };
      };

      if (
        !response.ok ||
        body.success !== true ||
        body.data?.id !== campaign.id ||
        body.data.status !== "ACTIVE"
      ) {
        throw new Error("Invalid publish response");
      }

      onCampaignUpdated({ status: "ACTIVE" });
      setNotice({
        kind: "status",
        message: "Campaign published. Its public link is ready to share.",
      });
      setPublishOpen(false);
    } catch {
      setNotice({
        kind: "alert",
        message: "We couldn't publish this campaign. Try again.",
      });
      setPublishOpen(false);
    } finally {
      setPublishing(false);
    }
  }

  async function copyPublicLink() {
    const url = publicCampaignUrl(origin, campaign.alias);
    setNotice(null);
    setManualUrl(null);

    try {
      await navigator.clipboard.writeText(url);
      setNotice({ kind: "status", message: "Public link copied." });
    } catch {
      setManualUrl(url);
      setNotice({
        kind: "alert",
        message: "We couldn't copy the link. Select and copy it manually.",
      });
    }
  }

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {campaign.status === "DRAFT" && (
          <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                type="button"
                className={responsiveEnabled ? "min-h-11 min-w-11" : undefined}
              >
                Publish
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Publish {campaign.name}?</DialogTitle>
                <DialogDescription>
                  Anyone with the link will be able to take it once the campaign opens.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={publishing}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="button" disabled={publishing} onClick={publishCampaign}>
                  {publishing ? "Publishing…" : "Publish"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {campaign.status === "ACTIVE" && (
          <Button
            size="sm"
            type="button"
            onClick={copyPublicLink}
            className={responsiveEnabled ? "min-h-11 min-w-11" : undefined}
          >
            Copy link
          </Button>
        )}

        {campaign.status !== "DRAFT" && (
          <Button
            size="sm"
            type="button"
            variant="outline"
            aria-expanded={responsesExpanded}
            onClick={onToggleResponses}
            className={responsiveEnabled ? "min-h-11 min-w-11" : undefined}
          >
            {responsesExpanded ? "Hide responses" : "View responses"}
          </Button>
        )}
      </div>

      {notice && (
        <p
          role={notice.kind}
          className={
            notice.kind === "alert"
              ? "text-sm font-medium text-destructive"
              : "text-sm font-medium text-success"
          }
        >
          {notice.message}
        </p>
      )}

      {manualUrl && (
        <div className="grid gap-1">
          <label
            className="text-xs font-semibold text-muted-foreground"
            htmlFor={`public-link-${campaign.id}`}
          >
            Public link
          </label>
          <input
            id={`public-link-${campaign.id}`}
            className="wf-input"
            readOnly
            value={manualUrl}
          />
        </div>
      )}
    </div>
  );
}
