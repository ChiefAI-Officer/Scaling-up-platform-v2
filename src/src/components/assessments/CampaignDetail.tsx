"use client";

/**
 * Assessment v7.6 — Coach campaign detail client UI (Task F).
 *
 * Receives the initial server-rendered overview + respondents, then
 * handles client interactions:
 *  - "View results" expands an inline panel below the row, lazily
 *    fetching `/api/assessment-campaigns/[id]/respondents/[rid]/result`.
 *  - "Resend invite" POSTs to
 *    `/api/assessment-campaigns/[id]/invitations/[iid]/resend` and toasts.
 *
 * Spec/wireframe refs:
 *  - public/wireframes/06-campaign-detail-overview.html
 *  - public/wireframes/07-campaign-detail-respondents.html
 *  - public/wireframes-phase2/revisions/08-revised-individual-results.html
 */

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Loader2,
  Mail,
  Eye,
  LineChart,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssessmentResultView } from "./AssessmentResultView";
import type {
  CampaignOverview,
  CampaignRespondentRow,
} from "@/lib/assessments/campaign-detail";
import type { ScoreResult } from "@/lib/assessments/scoring";

const REASON_MAX_LENGTH = 500;

interface ResultPayload {
  submissionId: string;
  submittedAt: string;
  result: ScoreResult;
  version: { sections: unknown; scoringConfig: unknown };
}

export interface CampaignDetailProps {
  initialOverview: CampaignOverview;
  initialRespondents: CampaignRespondentRow[];
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

const CAMPAIGN_STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground ring-border",
  ACTIVE: "bg-success/10 text-success ring-success/20",
  CLOSED: "bg-secondary/10 text-secondary-foreground ring-border",
};

const INV_STATUS_TONE: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground ring-border",
  SENT: "bg-primary/10 text-primary ring-primary/20",
  VIEWED: "bg-warning/10 text-warning ring-warning/20",
  SUBMITTED: "bg-success/10 text-success ring-success/20",
};

const RESENDABLE = new Set(["PENDING", "SENT", "VIEWED"]);

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusPill({
  status,
  toneMap,
}: {
  status: string;
  toneMap: Record<string, string>;
}) {
  const tone = toneMap[status] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded ring-1 ${tone}`}
      data-testid={`status-pill-${status.toLowerCase()}`}
    >
      {status}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

export function CampaignDetail({
  initialOverview,
  initialRespondents,
}: CampaignDetailProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [overview] = useState<CampaignOverview>(initialOverview);
  const [respondents, setRespondents] =
    useState<CampaignRespondentRow[]>(initialRespondents);
  const [expandedRespondentId, setExpandedRespondentId] =
    useState<string | null>(null);
  const [resultsCache, setResultsCache] = useState<
    Record<string, ResultPayload>
  >({});
  const [loadingRespondentId, setLoadingRespondentId] = useState<string | null>(
    null,
  );
  const [resendingInvitationId, setResendingInvitationId] = useState<
    string | null
  >(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [closing, setClosing] = useState(false);

  const campaign = overview.campaign;
  const isDraft = campaign.status === "DRAFT";
  const isClosed = campaign.status === "CLOSED";
  const closeActionLabel = isDraft ? "Discard Draft" : "Close Campaign";
  const closeDialogTitle = isDraft
    ? "Discard this draft?"
    : "Close this campaign?";
  const closeDialogBody = isDraft
    ? "Draft campaigns that you no longer plan to launch can be discarded. This moves the campaign to CLOSED and is not reversible."
    : "Closing this campaign stops accepting new submissions and marks it as complete after debriefing. This is not reversible.";

  async function handleConfirmClose() {
    if (closing) return;
    setClosing(true);
    try {
      const trimmed = closeReason.trim();
      const res = await fetch(
        `/api/assessment-campaigns/${campaign.id}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(trimmed.length > 0 ? { reason: trimmed } : {}),
        },
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : body.code === "ALREADY_CLOSED"
              ? "This campaign is already closed."
              : "Failed to close campaign",
        );
      }
      toast({
        title: isDraft ? "Draft discarded" : "Campaign closed",
        description: isDraft
          ? "This draft has been moved to CLOSED."
          : "This campaign is now closed.",
      });
      setCloseDialogOpen(false);
      setCloseReason("");
      router.refresh();
    } catch (err) {
      toast({
        title: isDraft ? "Could not discard draft" : "Could not close campaign",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setClosing(false);
    }
  }

  async function handleToggleResult(row: CampaignRespondentRow) {
    if (!row.hasSubmission) return;
    if (expandedRespondentId === row.respondent.id) {
      setExpandedRespondentId(null);
      return;
    }
    if (resultsCache[row.respondent.id]) {
      setExpandedRespondentId(row.respondent.id);
      return;
    }
    setLoadingRespondentId(row.respondent.id);
    try {
      const res = await fetch(
        `/api/assessment-campaigns/${campaign.id}/respondents/${row.respondent.id}/result`,
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Failed to load result",
        );
      }
      setResultsCache((prev) => ({
        ...prev,
        [row.respondent.id]: body.data as ResultPayload,
      }));
      setExpandedRespondentId(row.respondent.id);
    } catch (err) {
      toast({
        title: "Could not load results",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingRespondentId(null);
    }
  }

  async function handleResend(row: CampaignRespondentRow) {
    if (!row.invitation) return;
    const invitationId = row.invitation.id;
    if (resendingInvitationId === invitationId) return;
    setResendingInvitationId(invitationId);
    try {
      const res = await fetch(
        `/api/assessment-campaigns/${campaign.id}/invitations/${invitationId}/resend`,
        { method: "POST" },
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to resend invitation",
        );
      }
      // Optimistically bump resentCount in local state so the UI reflects it
      // without a re-fetch.
      setRespondents((prev) =>
        prev.map((r) =>
          r.invitation && r.invitation.id === invitationId
            ? {
                ...r,
                invitation: {
                  ...r.invitation,
                  resentCount:
                    typeof body.data?.resentCount === "number"
                      ? body.data.resentCount
                      : r.invitation.resentCount + 1,
                },
              }
            : r,
        ),
      );
      toast({
        title: "Invitation resent",
        description: `Sent a fresh link to ${row.respondent.email}.`,
      });
    } catch (err) {
      toast({
        title: "Could not resend invitation",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setResendingInvitationId(null);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/portal/assessments"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Assessments
        </Link>
        <Link
          href={`/portal/assessments/trends?templateId=${encodeURIComponent(campaign.templateId)}&organizationId=${encodeURIComponent(campaign.organizationId)}`}
          className="inline-flex items-center gap-2 bg-card border border-border hover:bg-muted/40 text-sm font-medium text-foreground px-3 py-1.5 rounded-lg transition-colors"
          data-testid="campaign-detail-view-trends"
        >
          <LineChart className="w-4 h-4" /> View Trends
        </Link>
      </div>

      {/* Overview card */}
      <div
        className="bg-card border border-border rounded-xl p-6"
        data-testid="campaign-overview-card"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground truncate">
              {campaign.name}
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              {campaign.alias}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StatusPill
              status={campaign.status}
              toneMap={CAMPAIGN_STATUS_TONE}
            />
            {!isClosed && (
              <button
                type="button"
                onClick={() => setCloseDialogOpen(true)}
                className={
                  isDraft
                    ? "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                    : "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-destructive hover:bg-destructive/10 transition-colors"
                }
                data-testid="campaign-close-btn"
              >
                <XCircle className="w-3.5 h-3.5" />
                {closeActionLabel}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Template
            </div>
            <div className="mt-1 font-medium text-foreground">
              {campaign.templateName}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Organization
            </div>
            <div className="mt-1 font-medium text-foreground">
              {campaign.organizationName}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Opened
            </div>
            <div className="mt-1 font-medium text-foreground">
              {formatDateTime(campaign.openAt)}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Closes
            </div>
            <div className="mt-1 font-medium text-foreground">
              {campaign.closeAt
                ? formatDateTime(campaign.closeAt)
                : "Open-ended"}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div
          className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6"
          data-testid="campaign-stats"
        >
          <Stat label="Participants" value={overview.stats.totalParticipants} />
          <Stat label="Invited" value={overview.stats.invited} />
          <Stat label="Viewed" value={overview.stats.viewed} tone="warning" />
          <Stat
            label="Submitted"
            value={overview.stats.submitted}
            tone="success"
          />
          <Stat
            label="Completion"
            value={`${overview.stats.completionPct}%`}
            tone="primary"
          />
        </div>
      </div>

      {/* Respondents table */}
      <div
        className="bg-card border border-border rounded-xl overflow-hidden"
        data-testid="campaign-respondents-card"
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Respondents
            </h2>
            <p className="text-xs text-muted-foreground">
              Track invitation delivery and view individual results.
            </p>
          </div>
          <a
            href={`/api/assessment-campaigns/${campaign.id}/respondents/export.csv`}
            download
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
            data-testid="export-respondents-csv"
          >
            <Download className="w-3.5 h-3.5" />
            Export respondents (CSV)
          </a>
        </div>

        {respondents.length === 0 ? (
          <div className="px-6 py-12 text-center" data-testid="empty-state">
            <p className="text-sm text-muted-foreground">
              No participants assigned to this campaign yet.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Name
                </th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email
                </th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sent
                </th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Submitted
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {respondents.map((row) => {
                const expanded = expandedRespondentId === row.respondent.id;
                const loading = loadingRespondentId === row.respondent.id;
                const cached = resultsCache[row.respondent.id];
                const invStatus = row.invitation?.status ?? "PENDING";
                const canResend =
                  row.invitation !== null &&
                  row.invitation.revokedAt === null &&
                  RESENDABLE.has(row.invitation.status);
                const resending =
                  row.invitation !== null &&
                  resendingInvitationId === row.invitation.id;

                return (
                  <Fragment key={row.participantId}>
                    <tr
                      className="hover:bg-muted/30 transition-colors"
                      data-testid={`respondent-row-${row.respondent.id}`}
                    >
                      <td className="px-4 py-3 text-sm">
                        <span className="font-medium text-foreground">
                          {row.respondent.firstName} {row.respondent.lastName}
                        </span>
                        {row.isCEO && (
                          <span
                            className="ml-2 text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded ring-1 ring-primary/20"
                            data-testid="ceo-badge"
                          >
                            CEO
                          </span>
                        )}
                        {row.respondent.jobTitle && (
                          <div className="text-xs text-muted-foreground">
                            {row.respondent.jobTitle}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {row.respondent.email}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          status={invStatus}
                          toneMap={INV_STATUS_TONE}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDateTime(row.invitation?.sentAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDateTime(row.submittedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {row.hasSubmission && (
                            <button
                              type="button"
                              onClick={() => handleToggleResult(row)}
                              disabled={loading}
                              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                              data-testid={`view-result-btn-${row.respondent.id}`}
                            >
                              {loading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                              {expanded ? "Hide results" : "View results"}
                            </button>
                          )}
                          {row.hasSubmission && (
                            <a
                              href={`/api/assessment-campaigns/${campaign.id}/respondents/${row.respondent.id}/result/export.csv`}
                              download
                              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted"
                              data-testid={`download-result-csv-${row.respondent.id}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download result (CSV)
                            </a>
                          )}
                          {canResend && (
                            <button
                              type="button"
                              onClick={() => handleResend(row)}
                              disabled={resending}
                              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                              data-testid={`resend-btn-${row.respondent.id}`}
                            >
                              {resending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Mail className="w-3.5 h-3.5" />
                              )}
                              Resend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded && cached && (
                      <tr className="bg-muted/10">
                        <td colSpan={6} className="px-4 py-4">
                          <AssessmentResultView
                            result={cached.result}
                            version={cached.version}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog
        open={closeDialogOpen}
        onOpenChange={(open) => {
          if (closing) return;
          setCloseDialogOpen(open);
          if (!open) setCloseReason("");
        }}
      >
        <DialogContent data-testid="campaign-close-dialog">
          <DialogHeader>
            <DialogTitle>{closeDialogTitle}</DialogTitle>
            <DialogDescription>{closeDialogBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label
              htmlFor="campaign-close-reason"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Reason
            </label>
            <textarea
              id="campaign-close-reason"
              data-testid="campaign-close-reason"
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              maxLength={REASON_MAX_LENGTH}
              rows={3}
              placeholder="Optional — appears in audit log"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={closing}
            />
            <div className="text-xs text-muted-foreground text-right tabular-nums">
              {closeReason.length}/{REASON_MAX_LENGTH}
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setCloseDialogOpen(false);
                setCloseReason("");
              }}
              disabled={closing}
              className="inline-flex items-center justify-center text-sm font-medium px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="campaign-close-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmClose}
              disabled={closing}
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="campaign-close-confirm"
            >
              {closing && <Loader2 className="w-4 h-4 animate-spin" />}
              {closeActionLabel}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "success" | "warning" | "primary";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "primary"
          ? "text-primary"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

export default CampaignDetail;
