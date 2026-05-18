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

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileUp,
  Loader2,
  Mail,
  Eye,
  LineChart,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { parseRespondentCsv } from "@/lib/assessments/respondent-csv";
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

interface OrgRespondentRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
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

  // Add Respondent modal state.
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addTab, setAddTab] = useState<"single" | "bulk">("single");
  const [orgRespondents, setOrgRespondents] = useState<OrgRespondentRow[]>([]);
  const [loadingOrgRespondents, setLoadingOrgRespondents] = useState(false);
  const [selectedRespondentId, setSelectedRespondentId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [newRespondentFirstName, setNewRespondentFirstName] = useState("");
  const [newRespondentLastName, setNewRespondentLastName] = useState("");
  const [newRespondentEmail, setNewRespondentEmail] = useState("");
  const [creatingRespondent, setCreatingRespondent] = useState(false);

  // Task M — Bulk CSV tab state.
  const [bulkCsvText, setBulkCsvText] = useState("");
  const [bulkMode, setBulkMode] = useState<"skip" | "merge">("skip");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // Remove participant confirm dialog state.
  const [removeTarget, setRemoveTarget] =
    useState<CampaignRespondentRow | null>(null);
  const [removing, setRemoving] = useState(false);

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

  // Refetch the respondents list from the server. Used after add/remove
  // mutations so the row + stats agree by construction.
  const refreshRespondents = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/assessment-campaigns/${campaign.id}/respondents`,
      );
      const body = await res.json();
      if (res.ok && body.success && body.data?.respondents) {
        setRespondents(body.data.respondents as CampaignRespondentRow[]);
      }
    } catch {
      // Non-fatal — leave previous list in place; toast on the action itself.
    }
  }, [campaign.id]);

  const loadOrgRespondents = useCallback(async () => {
    setLoadingOrgRespondents(true);
    try {
      const res = await fetch(
        `/api/organizations/${campaign.organizationId}/respondents`,
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to load respondents",
        );
      }
      setOrgRespondents((body.data ?? []) as OrgRespondentRow[]);
    } catch (err) {
      toast({
        title: "Could not load respondents",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingOrgRespondents(false);
    }
  }, [campaign.organizationId, toast]);

  // Lazy-load the org respondents on first open of the Add dialog.
  useEffect(() => {
    if (addDialogOpen && orgRespondents.length === 0 && !loadingOrgRespondents) {
      void loadOrgRespondents();
    }
  }, [addDialogOpen, orgRespondents.length, loadingOrgRespondents, loadOrgRespondents]);

  const participantRespondentIds = new Set(
    respondents.map((r) => r.respondent.id),
  );
  const availableRespondents = orgRespondents.filter(
    (r) => !participantRespondentIds.has(r.id),
  );

  function resetAddDialog() {
    setAddDialogOpen(false);
    setSelectedRespondentId("");
    setNewRespondentFirstName("");
    setNewRespondentLastName("");
    setNewRespondentEmail("");
    setAddTab("single");
    setBulkCsvText("");
    setBulkMode("skip");
    setBulkProgress(null);
  }

  async function handleCreateAndAdd() {
    const firstName = newRespondentFirstName.trim();
    const lastName = newRespondentLastName.trim();
    const email = newRespondentEmail.trim();
    if (!firstName || !lastName || !email) {
      toast({
        title: "Missing fields",
        description: "First name, last name, and email are required.",
        variant: "destructive",
      });
      return;
    }
    setCreatingRespondent(true);
    try {
      const createRes = await fetch(
        `/api/organizations/${campaign.organizationId}/respondents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName, lastName, email }),
        },
      );
      const createBody = await createRes.json();
      if (!createRes.ok || !createBody.success) {
        throw new Error(
          typeof createBody.error === "string"
            ? createBody.error
            : "Failed to create respondent",
        );
      }
      const created = createBody.data as OrgRespondentRow;
      setOrgRespondents((prev) => [...prev, created]);
      setSelectedRespondentId(created.id);
      setNewRespondentFirstName("");
      setNewRespondentLastName("");
      setNewRespondentEmail("");
      toast({
        title: "Respondent created",
        description: `${created.firstName} ${created.lastName} has been added to the organization.`,
      });
    } catch (err) {
      toast({
        title: "Could not create respondent",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreatingRespondent(false);
    }
  }

  async function handleConfirmAdd() {
    if (!selectedRespondentId || adding) return;
    setAdding(true);
    try {
      const res = await fetch(
        `/api/assessment-campaigns/${campaign.id}/respondents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgRespondentId: selectedRespondentId }),
        },
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : body.code === "ALREADY_PARTICIPANT"
              ? "This respondent is already a participant."
              : body.code === "WRONG_ORGANIZATION"
                ? "This respondent belongs to a different organization."
                : body.code === "CAMPAIGN_CLOSED"
                  ? "Cannot add respondents to a closed campaign."
                  : "Failed to add respondent",
        );
      }
      toast({
        title: "Respondent added",
        description:
          body.data?.invitation !== null
            ? "Participant added and a pending invitation row was created. Use Resend to deliver the link."
            : "Participant added to this draft campaign.",
      });
      resetAddDialog();
      await refreshRespondents();
      router.refresh();
    } catch (err) {
      toast({
        title: "Could not add respondent",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  }

  // Task M — Bulk CSV: live-parsed preview.
  const bulkParsed = useMemo(
    () =>
      bulkCsvText.trim().length > 0
        ? parseRespondentCsv(bulkCsvText)
        : null,
    [bulkCsvText],
  );

  async function handleConfirmBulkAdd() {
    if (!bulkParsed || bulkParsed.errors.length > 0) return;
    if (bulkParsed.rows.length === 0) return;
    setBulkSubmitting(true);
    setBulkProgress(null);
    try {
      // 1) Bulk-create org respondents (Task M's new route).
      const createRes = await fetch(
        `/api/organizations/${campaign.organizationId}/respondents/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: bulkParsed.rows,
            mode: bulkMode,
          }),
        },
      );
      const createBody = await createRes.json();
      if (!createRes.ok || !createBody.success) {
        throw new Error(
          typeof createBody.error === "string"
            ? createBody.error
            : "Failed to import respondents",
        );
      }
      type RefRow = { id: string; email: string };
      const created: RefRow[] = createBody.data?.created ?? [];
      const updated: RefRow[] = createBody.data?.updated ?? [];
      const skipped: { email: string }[] = createBody.data?.skipped ?? [];
      const errors: { row: number; reason: string }[] =
        createBody.data?.errors ?? [];

      // 2) For every created OR updated respondent, attach as campaign
      // participant. Skipped respondents are NOT auto-attached because
      // the coach may already be tracking them on another campaign — we
      // surface them in the toast and let the coach add explicitly via
      // the Single tab if desired.
      const attachTargets: RefRow[] = [...created, ...updated];
      // Filter out anyone already in the participants table to avoid the
      // 409 ALREADY_PARTICIPANT noise.
      const alreadyIds = new Set(respondents.map((r) => r.respondent.id));
      const toAttach = attachTargets.filter((r) => !alreadyIds.has(r.id));

      let attachedCount = 0;
      const attachErrors: string[] = [];
      setBulkProgress({ current: 0, total: toAttach.length });
      for (let i = 0; i < toAttach.length; i++) {
        const ref = toAttach[i];
        try {
          const res = await fetch(
            `/api/assessment-campaigns/${campaign.id}/respondents`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orgRespondentId: ref.id }),
            },
          );
          if (res.ok) {
            attachedCount += 1;
          } else {
            const body = await res.json().catch(() => ({}));
            // ALREADY_PARTICIPANT is benign — coach added them via another
            // path between bulk-create and this attach loop.
            if (body?.code !== "ALREADY_PARTICIPANT") {
              attachErrors.push(`${ref.email}: ${body?.error ?? res.status}`);
            }
          }
        } catch (err) {
          attachErrors.push(
            `${ref.email}: ${err instanceof Error ? err.message : "network error"}`,
          );
        }
        setBulkProgress({ current: i + 1, total: toAttach.length });
      }

      const summary = [
        `${created.length} created`,
        `${updated.length} updated`,
        `${skipped.length} skipped`,
        `${attachedCount} added to campaign`,
      ];
      if (errors.length > 0 || attachErrors.length > 0) {
        summary.push(`${errors.length + attachErrors.length} errors`);
      }

      toast({
        title: "Bulk import complete",
        description: summary.join(" • "),
        variant:
          errors.length + attachErrors.length > 0 ? "destructive" : undefined,
      });

      resetAddDialog();
      await refreshRespondents();
      router.refresh();
    } catch (err) {
      toast({
        title: "Could not import respondents",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBulkSubmitting(false);
      setBulkProgress(null);
    }
  }

  async function handleConfirmRemove() {
    if (!removeTarget || removing) return;
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/assessment-campaigns/${campaign.id}/participants/${removeTarget.participantId}`,
        { method: "DELETE" },
      );
      if (res.status === 204) {
        toast({
          title: "Respondent removed",
          description: `${removeTarget.respondent.firstName} ${removeTarget.respondent.lastName} no longer has access to this campaign.`,
        });
        setRemoveTarget(null);
        await refreshRespondents();
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      throw new Error(
        typeof body.error === "string"
          ? body.error
          : body.code === "ALREADY_SUBMITTED"
            ? "This respondent has already submitted — their results are locked."
            : "Failed to remove respondent",
      );
    } catch (err) {
      toast({
        title: "Could not remove respondent",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
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
          <div className="inline-flex items-center gap-2">
            {!isClosed && (
              <button
                type="button"
                onClick={() => setAddDialogOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                data-testid="add-respondent-btn"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Respondent
              </button>
            )}
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
                const canRemove =
                  !isClosed &&
                  !row.hasSubmission &&
                  row.invitation?.status !== "SUBMITTED";

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
                          {canRemove && (
                            <button
                              type="button"
                              onClick={() => setRemoveTarget(row)}
                              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border text-destructive hover:bg-destructive/10"
                              data-testid={`remove-respondent-btn-${row.respondent.id}`}
                              aria-label={`Remove ${row.respondent.firstName} ${row.respondent.lastName}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
        open={addDialogOpen}
        onOpenChange={(open) => {
          if (adding || creatingRespondent) return;
          if (!open) resetAddDialog();
          else setAddDialogOpen(open);
        }}
      >
        <DialogContent
          data-testid="add-respondent-dialog"
          className="max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>Add respondents to this campaign</DialogTitle>
            <DialogDescription>
              {isDraft
                ? "Draft campaigns: new respondents are queued and will receive an invitation when you launch."
                : "Active campaigns: new respondents get pending invitation rows. Use Resend to deliver the email."}
            </DialogDescription>
          </DialogHeader>

          {/* Task M — Single vs Bulk tabs */}
          <div
            className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5 text-xs font-medium"
            role="tablist"
            aria-label="Add respondent mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={addTab === "single"}
              onClick={() => setAddTab("single")}
              disabled={adding || creatingRespondent || bulkSubmitting}
              className={
                addTab === "single"
                  ? "px-3 py-1.5 rounded-md bg-card text-foreground shadow-sm"
                  : "px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
              }
              data-testid="add-respondent-tab-single"
            >
              Single
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={addTab === "bulk"}
              onClick={() => setAddTab("bulk")}
              disabled={adding || creatingRespondent || bulkSubmitting}
              className={
                addTab === "bulk"
                  ? "px-3 py-1.5 rounded-md bg-card text-foreground shadow-sm inline-flex items-center gap-1"
                  : "px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              }
              data-testid="add-respondent-tab-bulk"
            >
              <FileUp className="w-3.5 h-3.5" />
              Bulk CSV
            </button>
          </div>

          {addTab === "single" && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="add-respondent-select"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Existing respondent
              </label>
              <select
                id="add-respondent-select"
                data-testid="add-respondent-select"
                value={selectedRespondentId}
                onChange={(e) => setSelectedRespondentId(e.target.value)}
                disabled={loadingOrgRespondents || adding}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">
                  {loadingOrgRespondents
                    ? "Loading..."
                    : availableRespondents.length === 0
                      ? "No respondents available — create one below"
                      : "Select a respondent..."}
                </option>
                {availableRespondents.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.firstName} {r.lastName} — {r.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Or create a new respondent
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  data-testid="new-respondent-firstName"
                  type="text"
                  placeholder="First name"
                  value={newRespondentFirstName}
                  onChange={(e) =>
                    setNewRespondentFirstName(e.target.value)
                  }
                  disabled={creatingRespondent}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                <input
                  data-testid="new-respondent-lastName"
                  type="text"
                  placeholder="Last name"
                  value={newRespondentLastName}
                  onChange={(e) =>
                    setNewRespondentLastName(e.target.value)
                  }
                  disabled={creatingRespondent}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
              </div>
              <input
                data-testid="new-respondent-email"
                type="email"
                placeholder="Email"
                value={newRespondentEmail}
                onChange={(e) => setNewRespondentEmail(e.target.value)}
                disabled={creatingRespondent}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleCreateAndAdd}
                disabled={
                  creatingRespondent ||
                  !newRespondentFirstName.trim() ||
                  !newRespondentLastName.trim() ||
                  !newRespondentEmail.trim()
                }
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="create-new-respondent-btn"
              >
                {creatingRespondent && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Create & select
              </button>
            </div>
          </div>
          )}

          {addTab === "bulk" && (
            <div
              className="space-y-3"
              data-testid="add-respondent-bulk-panel"
            >
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Paste CSV
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Header row: <code className="font-mono">name,email,team</code>{" "}
                  (team optional, slash-delimited). Max 500 rows.
                </p>
              </div>
              <textarea
                value={bulkCsvText}
                onChange={(e) => setBulkCsvText(e.target.value)}
                placeholder={`name,email,team\nAlice Example,alice@example.com,Marketing/Brand\nBob Tester,bob@example.com,`}
                rows={6}
                disabled={bulkSubmitting}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                data-testid="add-respondent-bulk-textarea"
              />

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  If a respondent already exists
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="bulk-mode"
                      value="skip"
                      checked={bulkMode === "skip"}
                      onChange={() => setBulkMode("skip")}
                      disabled={bulkSubmitting}
                      className="accent-primary"
                      data-testid="add-respondent-bulk-mode-skip"
                    />
                    Skip existing
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="bulk-mode"
                      value="merge"
                      checked={bulkMode === "merge"}
                      onChange={() => setBulkMode("merge")}
                      disabled={bulkSubmitting}
                      className="accent-primary"
                      data-testid="add-respondent-bulk-mode-merge"
                    />
                    Merge existing
                  </label>
                </div>
              </div>

              {bulkParsed && (
                <div
                  className="text-xs space-y-2"
                  data-testid="add-respondent-bulk-preview"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-foreground">
                      {bulkParsed.rows.length} valid row
                      {bulkParsed.rows.length === 1 ? "" : "s"}
                    </span>
                    {bulkParsed.errors.length > 0 && (
                      <span className="text-destructive font-medium">
                        {bulkParsed.errors.length} error
                        {bulkParsed.errors.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {bulkParsed.rows.length > 0 && (
                    <div className="border border-border rounded-md overflow-hidden max-h-48 overflow-y-auto">
                      <table className="w-full">
                        <thead className="bg-muted/40 sticky top-0">
                          <tr>
                            <th className="text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Name
                            </th>
                            <th className="text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Email
                            </th>
                            <th className="text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Team
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {bulkParsed.rows.map((row, i) => (
                            <tr key={`${row.email}-${i}`}>
                              <td className="px-2 py-1 text-foreground">
                                {row.name}
                              </td>
                              <td className="px-2 py-1 text-foreground font-mono">
                                {row.email}
                              </td>
                              <td className="px-2 py-1 text-muted-foreground">
                                {row.teamPath.length > 0
                                  ? row.teamPath.join(" / ")
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {bulkParsed.errors.length > 0 && (
                    <ul className="border border-destructive/40 rounded-md p-2 bg-destructive/5 max-h-32 overflow-y-auto space-y-1">
                      {bulkParsed.errors.slice(0, 20).map((e, i) => (
                        <li key={i} className="text-destructive">
                          Row {e.row}: {e.reason}
                        </li>
                      ))}
                      {bulkParsed.errors.length > 20 && (
                        <li className="text-destructive/80 italic">
                          + {bulkParsed.errors.length - 20} more errors…
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              {bulkProgress && (
                <div
                  className="text-xs text-muted-foreground"
                  data-testid="add-respondent-bulk-progress"
                  role="status"
                >
                  Adding {bulkProgress.current} of {bulkProgress.total}…
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={resetAddDialog}
              disabled={adding || creatingRespondent || bulkSubmitting}
              className="inline-flex items-center justify-center text-sm font-medium px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="add-respondent-cancel"
            >
              Cancel
            </button>
            {addTab === "single" ? (
              <button
                type="button"
                onClick={handleConfirmAdd}
                disabled={
                  !selectedRespondentId || adding || creatingRespondent
                }
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="add-respondent-confirm"
              >
                {adding && <Loader2 className="w-4 h-4 animate-spin" />}
                Add to campaign
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConfirmBulkAdd}
                disabled={
                  !bulkParsed ||
                  bulkParsed.rows.length === 0 ||
                  bulkParsed.errors.length > 0 ||
                  bulkSubmitting
                }
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="add-respondent-bulk-confirm"
              >
                {bulkSubmitting && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {bulkSubmitting
                  ? bulkProgress
                    ? `Adding ${bulkProgress.current}/${bulkProgress.total}…`
                    : "Importing…"
                  : `Import ${bulkParsed?.rows.length ?? 0} respondent${
                      bulkParsed?.rows.length === 1 ? "" : "s"
                    }`}
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (removing) return;
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent data-testid="remove-respondent-dialog">
          <DialogHeader>
            <DialogTitle>Remove this respondent?</DialogTitle>
            <DialogDescription>
              {removeTarget
                ? `${removeTarget.respondent.firstName} ${removeTarget.respondent.lastName} will lose access to the survey link. This is not reversible.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRemoveTarget(null)}
              disabled={removing}
              className="inline-flex items-center justify-center text-sm font-medium px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="remove-respondent-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmRemove}
              disabled={removing}
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="remove-respondent-confirm"
            >
              {removing && <Loader2 className="w-4 h-4 animate-spin" />}
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
