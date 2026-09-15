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
  onCampaignUpdated: (
    updates: Pick<PublicCampaignViewModel, "status"> &
      Partial<Pick<PublicCampaignViewModel, "closedAt">>,
  ) => void;
  onCampaignDeleted: () => void;
  onToggleResponses: () => void;
  responsesExpanded: boolean;
  lifecycleActionsEnabled?: boolean;
  responsiveEnabled?: boolean;
}

type Notice = { kind: "status" | "alert"; message: string } | null;

const CLOSE_REASON_MAX_LENGTH = 500;

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function PublicCampaignActions({
  campaign,
  origin,
  onCampaignUpdated,
  onCampaignDeleted,
  onToggleResponses,
  responsesExpanded,
  lifecycleActionsEnabled = false,
  responsiveEnabled = false,
}: PublicCampaignActionsProps) {
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  const actionClassName = responsiveEnabled ? "min-h-11 min-w-11" : undefined;

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

  async function closeCampaign() {
    if (closing) return;
    setClosing(true);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/assessment-campaigns/${campaign.id}/close?expectedStatus=${campaign.status}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: closeReason.trim() || undefined }),
        },
      );
      const body = (await response.json()) as {
        success?: boolean;
        code?: unknown;
        data?: { id?: unknown; status?: unknown; closedAt?: unknown };
      };

      const hasMatchingClosedState =
        body.data?.id === campaign.id &&
        body.data.status === "CLOSED";
      const hasAuthoritativeClosedState =
        hasMatchingClosedState && isValidTimestamp(body.data?.closedAt);

      if (response.ok && body.success === true && hasAuthoritativeClosedState) {
        onCampaignUpdated({
          status: "CLOSED",
          closedAt: body.data!.closedAt as string,
        });
        setNotice({
          kind: "status",
          message: "Campaign closed. Its public link is disabled.",
        });
        setCloseReason("");
        setCloseOpen(false);
        return;
      }

      if (
        response.status === 409 &&
        body.code === "ALREADY_CLOSED" &&
        hasMatchingClosedState &&
        (body.data?.closedAt === null || isValidTimestamp(body.data?.closedAt))
      ) {
        onCampaignUpdated({
          status: "CLOSED",
          closedAt: body.data!.closedAt as string | null,
        });
        setNotice({
          kind: "status",
          message: "Campaign was already closed. The list is up to date.",
        });
        setCloseReason("");
        setCloseOpen(false);
        return;
      }

      throw new Error("Invalid close response");
    } catch {
      setNotice({
        kind: "alert",
        message: "We couldn't close this campaign. Try again.",
      });
      setCloseOpen(false);
    } finally {
      setClosing(false);
    }
  }

  async function deleteCampaign() {
    if (deleting) return;
    setDeleting(true);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/assessment-campaigns/${campaign.id}?expectedStatus=${campaign.status}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { success?: boolean; code?: unknown };
      if (response.status === 409 && body.code === "CAMPAIGN_STATUS_CHANGED") {
        setNotice({
          kind: "alert",
          message: "This campaign changed status. Refresh the page and try again.",
        });
        setDeleteOpen(false);
        return;
      }
      if (!response.ok || body.success !== true) {
        throw new Error("Invalid delete response");
      }

      setDeleteOpen(false);
      onCampaignDeleted();
    } catch {
      setNotice({
        kind: "alert",
        message: "We couldn't delete this campaign. Try again.",
      });
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
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

        {lifecycleActionsEnabled && campaign.status === "ACTIVE" && (
          <Dialog
            open={closeOpen}
            onOpenChange={(open) => {
              if (closing) return;
              setCloseOpen(open);
              if (!open) setCloseReason("");
            }}
          >
            <DialogTrigger asChild>
              <Button
                size="sm"
                type="button"
                variant="destructive"
                className={actionClassName}
              >
                Close
              </Button>
            </DialogTrigger>
            <DialogContent responsiveEnabled={responsiveEnabled}>
              <DialogHeader>
                <DialogTitle>Close {campaign.name}?</DialogTitle>
                <DialogDescription>
                  The public link stops working immediately. People who already
                  started will not be able to submit. Responses collected so far are
                  kept. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label
                  htmlFor={`public-campaign-close-reason-${campaign.id}`}
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Reason
                </label>
                <textarea
                  id={`public-campaign-close-reason-${campaign.id}`}
                  value={closeReason}
                  onChange={(event) => setCloseReason(event.target.value)}
                  maxLength={CLOSE_REASON_MAX_LENGTH}
                  rows={3}
                  placeholder="Optional — appears in audit log"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={closing}
                />
                <div className="text-right text-xs tabular-nums text-muted-foreground">
                  {closeReason.length}/{CLOSE_REASON_MAX_LENGTH}
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={closing}
                    className={responsiveEnabled ? "min-h-11 min-w-11" : undefined}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={closing}
                  onClick={closeCampaign}
                  className={responsiveEnabled ? "min-h-11 min-w-11" : undefined}
                >
                  {closing ? "Closing…" : "Close campaign"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {lifecycleActionsEnabled && campaign.status !== "ACTIVE" && (
          <Dialog
            open={deleteOpen}
            onOpenChange={(open) => {
              if (!deleting) setDeleteOpen(open);
            }}
          >
            <DialogTrigger asChild>
              <Button
                size="sm"
                type="button"
                variant="destructive"
                className={actionClassName}
              >
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent responsiveEnabled={responsiveEnabled}>
              <DialogHeader>
                <DialogTitle>Delete {campaign.name}?</DialogTitle>
                <DialogDescription>
                  {campaign.responseCount === 0
                    ? "This campaign will be removed from this page. This cannot be undone."
                    : `${campaign.responseCount} ${campaign.responseCount === 1 ? "response is" : "responses are"} kept but will no longer be reachable from this page. This cannot be undone.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={deleting}
                    className={responsiveEnabled ? "min-h-11 min-w-11" : undefined}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleting}
                  onClick={deleteCampaign}
                  className={responsiveEnabled ? "min-h-11 min-w-11" : undefined}
                >
                  {deleting ? "Deleting…" : "Delete campaign"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
