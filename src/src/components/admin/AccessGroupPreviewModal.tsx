"use client";

/**
 * AccessGroupPreviewModal — Wave 5 wireframe 22 preview panel.
 *
 * Open on Remove Coach OR Remove Template clicks. Fetches a DRY-RUN
 * snapshot from /api/admin/access-groups/[id]/preview-change and renders
 * the per-coach BEFORE/AFTER diff. On Confirm:
 *  - Calls DELETE on the appropriate endpoint.
 *  - If the API returns 409 BLOCKED_ZERO_ACCESS, shows a second-stage
 *    section with a free-text reason input + "Force this change anyway"
 *    button that re-calls DELETE with force=true&forceReason=…
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export interface PreviewTarget {
  /** Either coach removal or template removal. */
  kind: "REMOVE_COACH_FROM_GROUP" | "REMOVE_TEMPLATE_FROM_GROUP";
  accessGroupId: string;
  /** The coach being removed, if kind = REMOVE_COACH_FROM_GROUP. */
  coachId?: string;
  /** The template being removed, if kind = REMOVE_TEMPLATE_FROM_GROUP. */
  templateId?: string;
  /** Display label used in the modal header / context line. */
  label: string;
}

interface TemplateRef {
  id: string;
  name: string;
  alias: string;
}

interface CoachDiff {
  coachId: string;
  firstName: string;
  lastName: string;
  email: string;
  beforeTemplates: TemplateRef[];
  afterTemplates: TemplateRef[];
  addedTemplateIds: string[];
  removedTemplateIds: string[];
  beforeCount: number;
  afterCount: number;
  wouldDropToZero: boolean;
  ownsActiveCampaigns: boolean;
}

interface PreviewResponse {
  kind: string;
  accessGroupId: string;
  affectedCoachIds: string[];
  forcedZeroCoachIds: string[];
  coaches: CoachDiff[];
  wouldBlock: boolean;
}

interface Props {
  open: boolean;
  target: PreviewTarget | null;
  onClose: () => void;
  onConfirmed: () => void;
}

export function AccessGroupPreviewModal({
  open,
  target,
  onClose,
  onConfirmed,
}: Props) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Force-stage state — only enabled after a 409 BLOCKED_ZERO_ACCESS.
  const [showForceStage, setShowForceStage] = useState(false);
  const [forceReason, setForceReason] = useState("");

  useEffect(() => {
    if (!open || !target) {
      setPreview(null);
      setPreviewError(null);
      setSubmitError(null);
      setShowForceStage(false);
      setForceReason("");
      return;
    }
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const body: Record<string, string> = { kind: target.kind };
        if (target.coachId) body.coachId = target.coachId;
        if (target.templateId) body.templateId = target.templateId;
        const res = await fetch(
          `/api/admin/access-groups/${encodeURIComponent(
            target.accessGroupId,
          )}/preview-change`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const json = (await res.json()) as {
          success: boolean;
          data?: PreviewResponse;
          error?: string;
        };
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) setPreview(json.data);
      } catch (e) {
        if (!cancelled)
          setPreviewError(e instanceof Error ? e.message : "Preview failed");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, target]);

  async function performDelete(force: boolean) {
    if (!target) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const params = new URLSearchParams();
      if (force) {
        params.set("force", "true");
        params.set("forceReason", forceReason.trim());
      }
      const base = `/api/admin/access-groups/${encodeURIComponent(
        target.accessGroupId,
      )}`;
      const url =
        target.kind === "REMOVE_COACH_FROM_GROUP"
          ? `${base}/coaches/${encodeURIComponent(target.coachId ?? "")}?${params.toString()}`
          : `${base}/templates/${encodeURIComponent(target.templateId ?? "")}?${params.toString()}`;
      const res = await fetch(url, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        code?: string;
      };
      if (res.status === 409 && json.code === "BLOCKED_ZERO_ACCESS") {
        setShowForceStage(true);
        setSubmitError(
          json.error ??
            "This change would drop one or more coaches to zero access while they hold active campaigns.",
        );
        return;
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      onConfirmed();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Access change preview</DialogTitle>
          <DialogDescription>
            Review the per-coach impact before saving. The change runs through
            <code className="mx-1">evaluateAccessChange</code> with advisory
            locks + audit trail when you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {target && (
            <p className="rounded-md border bg-muted/40 p-3 text-sm text-foreground">
              <strong>Proposed change:</strong> {target.label}
            </p>
          )}

          {previewLoading && (
            <p className="text-sm text-muted-foreground">
              Computing diff (BEFORE → AFTER) for every affected coach…
            </p>
          )}
          {previewError && (
            <p className="text-sm text-destructive">{previewError}</p>
          )}

          {preview && preview.coaches.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No coaches are affected by this change.
            </p>
          )}

          {preview && preview.coaches.length > 0 && (
            <div className="space-y-3">
              <div
                className={`rounded-md border p-3 text-sm ${
                  preview.wouldBlock
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-success/40 bg-success/10 text-foreground"
                }`}
              >
                <strong>
                  {preview.affectedCoachIds.length} coach
                  {preview.affectedCoachIds.length === 1 ? "" : "es"} affected.
                </strong>{" "}
                {preview.wouldBlock
                  ? `${preview.forcedZeroCoachIds.length} would drop to zero template access AND hold active campaigns — BLOCKED_ZERO_ACCESS will fire.`
                  : "No coach drops to zero access. Safe to confirm."}
              </div>

              <div className="max-h-80 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Coach</th>
                      <th className="px-3 py-2 text-left font-medium">
                        Before
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        After
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.coaches.map((c) => {
                      const name = [c.firstName, c.lastName]
                        .filter((s) => s && s.length > 0)
                        .join(" ")
                        .trim();
                      return (
                        <tr
                          key={c.coachId}
                          className={`border-t ${
                            c.wouldDropToZero
                              ? "bg-destructive/10"
                              : ""
                          }`}
                          data-testid="preview-row"
                          data-would-drop-zero={c.wouldDropToZero}
                        >
                          <td className="px-3 py-2 align-top">
                            <div
                              className={`font-medium ${
                                c.wouldDropToZero ? "text-destructive" : ""
                              }`}
                            >
                              {name || "(no name)"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {c.email}
                            </div>
                            {c.wouldDropToZero && (
                              <div className="mt-1 text-xs text-destructive">
                                Would land at ZERO access while holding active
                                campaigns
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <ul className="space-y-1">
                              {c.beforeTemplates.length === 0 && (
                                <li className="italic text-muted-foreground">
                                  (no templates)
                                </li>
                              )}
                              {c.beforeTemplates.map((t) => (
                                <li key={t.id}>{t.name}</li>
                              ))}
                            </ul>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {c.beforeCount} template
                              {c.beforeCount === 1 ? "" : "s"}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <ul className="space-y-1">
                              {c.afterTemplates.length === 0 && (
                                <li
                                  className={`italic ${
                                    c.wouldDropToZero
                                      ? "text-destructive"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  (no templates)
                                </li>
                              )}
                              {c.afterTemplates.map((t) => (
                                <li key={t.id}>{t.name}</li>
                              ))}
                              {c.removedTemplateIds.length > 0 &&
                                c.beforeTemplates
                                  .filter((t) =>
                                    c.removedTemplateIds.includes(t.id),
                                  )
                                  .map((t) => (
                                    <li
                                      key={`rm-${t.id}`}
                                      className="text-destructive line-through"
                                    >
                                      {t.name}
                                    </li>
                                  ))}
                            </ul>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {c.afterCount} template
                              {c.afterCount === 1 ? "" : "s"}
                              {c.afterCount !== c.beforeCount && (
                                <>
                                  {" "}
                                  (
                                  {c.afterCount > c.beforeCount ? "+" : ""}
                                  {c.afterCount - c.beforeCount})
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {submitError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {submitError}
            </div>
          )}

          {showForceStage && (
            <div className="space-y-2 rounded-md border border-warning/50 bg-warning/10 p-3">
              <Label htmlFor="force-reason" className="text-sm font-medium">
                Force this change anyway
              </Label>
              <p className="text-xs text-muted-foreground">
                A non-empty reason is required and written to
                <code className="mx-1">AuditLog.changes.reason</code> with
                action=
                <code>FORCE_ZERO</code>.
              </p>
              <Textarea
                id="force-reason"
                rows={3}
                value={forceReason}
                onChange={(e) => setForceReason(e.target.value)}
                placeholder="Why is this change safe to make right now?"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          {!showForceStage && (
            <Button
              type="button"
              variant="destructive"
              disabled={submitting || previewLoading || !preview}
              onClick={() => performDelete(false)}
            >
              {submitting ? "Submitting…" : "Confirm remove"}
            </Button>
          )}
          {showForceStage && (
            <Button
              type="button"
              variant="destructive"
              disabled={submitting || forceReason.trim().length === 0}
              onClick={() => performDelete(true)}
            >
              {submitting ? "Submitting…" : "Force remove"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
