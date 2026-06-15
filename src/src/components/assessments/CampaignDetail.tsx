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
  FileText,
  Loader2,
  Mail,
  Eye,
  LineChart,
  Plus,
  Trash2,
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
import { CampaignStatusMetrics } from "./CampaignStatusMetrics";
import type {
  CampaignOverview,
  CampaignRespondentRow,
} from "@/lib/assessments/campaign-detail";
import type { ScoreResult } from "@/lib/assessments/scoring";
import {
  computeCampaignStatusMetrics,
  getInvitationBand,
} from "@/lib/assessments/campaign-status-metrics";

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

const RESENDABLE = new Set(["PENDING", "SENT", "VIEWED"]);

// Band tones and labels for per-row status display — must match
// the CampaignStatusMetrics tile colours exactly.
const BAND_TONE: Record<string, string> = {
  new: "bg-muted text-muted-foreground ring-border",
  invited: "bg-primary/10 text-primary ring-primary/20",
  started: "bg-warning/10 text-warning ring-warning/20",
  completed: "bg-success/10 text-success ring-success/20",
  revoked: "bg-destructive/10 text-destructive ring-destructive/20",
};

const BAND_LABEL: Record<string, string> = {
  new: "New",
  invited: "Invited",
  started: "Started",
  completed: "Completed",
  revoked: "Revoked",
};

function formatDateTimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

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

  // Delete campaign dialog state (Wave D, #1 — soft-delete with blast-radius confirm).
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add Respondent modal state — pick-existing only (Slice 1).
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [orgRespondents, setOrgRespondents] = useState<OrgRespondentRow[]>([]);
  const [loadingOrgRespondents, setLoadingOrgRespondents] = useState(false);
  const [orgRespondentsLoaded, setOrgRespondentsLoaded] = useState(false);
  const [selectedRespondentIds, setSelectedRespondentIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // Remove participant confirm dialog state.
  const [removeTarget, setRemoveTarget] =
    useState<CampaignRespondentRow | null>(null);
  const [removing, setRemoving] = useState(false);

  // Task N — Bulk reminders state.
  const [sendingReminders, setSendingReminders] = useState(false);

  // Send Initial Invitations — fires /invite endpoint to first-send emails
  // for respondents who don't have an invitation row yet (or have a PENDING
  // one with no SMTP delivery). Closes the activation → email gap that
  // makes "Send Reminders" skip never-invited people.
  const [sendingInvitations, setSendingInvitations] = useState(false);

  // CEO designation post-creation — per-row toggle.
  const [ceoSavingFor, setCeoSavingFor] = useState<string | null>(null);

  // Task O UI follow-on — email overrides post-create edit panel.
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState<string>(
    overview.campaign.invitationSubject ?? "",
  );
  const [emailBody, setEmailBody] = useState<string>(
    overview.campaign.invitationBodyMarkdown ?? "",
  );
  const [emailSaving, setEmailSaving] = useState(false);
  const emailDirty =
    emailSubject !== (overview.campaign.invitationSubject ?? "") ||
    emailBody !== (overview.campaign.invitationBodyMarkdown ?? "");

  // Follow-on (May 21) — coach edit start-date affordance.
  // openAt is set in the wizard and locked post-creation in earlier UI;
  // PATCH route already supports openAt. This adds an inline editor next
  // to the OPENED display.
  const [openAtEditing, setOpenAtEditing] = useState(false);
  const [openAtDraft, setOpenAtDraft] = useState<string>(() =>
    formatDateTimeLocal(new Date(overview.campaign.openAt)),
  );
  const [openAtSaving, setOpenAtSaving] = useState(false);

  const campaign = overview.campaign;
  const isDraft = campaign.status === "DRAFT";
  const isClosed = campaign.status === "CLOSED";

  // Derive header aggregate metrics from the current respondents list.
  // Recomputes automatically whenever respondents changes (add/remove/refresh).
  const headerMetrics = useMemo(
    () =>
      computeCampaignStatusMetrics(
        respondents.map((r) => ({
          participantId: r.participantId,
          invitation: r.invitation
            ? {
                status: r.invitation.status,
                sentAt: r.invitation.sentAt,
                revokedAt: r.invitation.revokedAt,
              }
            : null,
        })),
      ),
    [respondents],
  );

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

  async function handleConfirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/assessment-campaigns/${campaign.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string" ? body.error : "Failed to delete campaign",
        );
      }
      toast({
        title: "Campaign deleted",
        description: "The campaign has been removed.",
      });
      setDeleteDialogOpen(false);
      router.push("/portal/assessments");
    } catch (err) {
      toast({
        title: "Could not delete campaign",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
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

  // Task N — bulk send reminders to all non-submitted, non-revoked participants.
  // Send Initial Invitations — closes the gap where campaign activation
  // doesn't auto-send emails. Targets respondents with no invitation row
  // OR an existing PENDING row (the /invite endpoint creates or refreshes
  // either case and dispatches SMTP).
  async function handleSendInvitations() {
    if (sendingInvitations) return;
    const targetable = respondents.filter(
      (r) =>
        r.invitation === null ||
        (r.invitation.revokedAt === null &&
          r.invitation.status === "PENDING"),
    );
    if (targetable.length === 0) {
      toast({
        title: "Nothing to send",
        description:
          "Every respondent already has an invitation. Use Send Reminders to nudge non-responders.",
      });
      return;
    }
    const confirmed = window.confirm(
      `Send initial invitation email to ${targetable.length} respondent${targetable.length === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;
    setSendingInvitations(true);
    try {
      const res = await fetch(
        `/api/assessment-campaigns/${campaign.id}/invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            respondentIds: targetable.map((r) => r.respondent.id),
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const results = Array.isArray(body.data?.results)
        ? body.data.results
        : [];
      const sent = results.filter((r: { status: string }) => r.status === "sent").length;
      const alreadyInvited = results.filter(
        (r: { status: string }) => r.status === "already-invited",
      ).length;
      const failed = results.filter(
        (r: { status: string }) => r.status === "send-failed",
      ).length;
      toast({
        title: "Invitations sent",
        description: `Sent ${sent}${alreadyInvited > 0 ? `, already invited ${alreadyInvited}` : ""}${failed > 0 ? `, failed ${failed}` : ""}.`,
        variant: failed > 0 ? "destructive" : undefined,
      });
      await refreshRespondents();
    } catch (err) {
      toast({
        title: "Could not send invitations",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSendingInvitations(false);
    }
  }

  async function handleSendReminders() {
    if (sendingReminders) return;
    const pendingCount = respondents.filter(
      (r) =>
        r.invitation !== null &&
        r.invitation.revokedAt === null &&
        RESENDABLE.has(r.invitation.status),
    ).length;
    if (pendingCount === 0) {
      toast({
        title: "Nothing to send",
        description: "No pending non-responders.",
      });
      return;
    }
    const confirmed = window.confirm(
      `Send reminder email to ${pendingCount} pending respondent${pendingCount === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;
    setSendingReminders(true);
    try {
      const res = await fetch(
        `/api/assessment-campaigns/${campaign.id}/reminders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const sent = body.data?.sent ?? 0;
      const skipped = body.data?.skipped ?? 0;
      const failed = Array.isArray(body.data?.failed)
        ? body.data.failed.length
        : 0;
      toast({
        title: "Reminders sent",
        description: `Sent ${sent}, skipped ${skipped}${failed > 0 ? `, failed ${failed}` : ""}.`,
      });
      await refreshRespondents();
    } catch (err) {
      toast({
        title: "Could not send reminders",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSendingReminders(false);
    }
  }

  // CEO designation — set or clear via POST /api/assessment-campaigns/[id]/ceo.
  async function handleSetCeo(
    targetParticipantId: string | null,
    rowName?: string,
  ) {
    if (ceoSavingFor !== null) return;
    setCeoSavingFor(targetParticipantId ?? "__clear__");
    try {
      const res = await fetch(`/api/assessment-campaigns/${campaign.id}/ceo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: targetParticipantId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast({
        title:
          targetParticipantId === null
            ? "CEO designation cleared"
            : `CEO set to ${rowName ?? "selected respondent"}`,
      });
      await refreshRespondents();
      router.refresh();
    } catch (err) {
      toast({
        title: "Could not update CEO designation",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCeoSavingFor(null);
    }
  }

  // Follow-on (May 21) — save updated openAt via PATCH.
  async function handleSaveOpenAt() {
    if (openAtSaving) return;
    if (openAtDraft.trim() === "") return;
    const parsed = new Date(openAtDraft);
    if (Number.isNaN(parsed.getTime())) {
      toast({
        title: "Invalid date",
        description: "Could not parse the start date — please try again.",
        variant: "destructive",
      });
      return;
    }
    setOpenAtSaving(true);
    try {
      const res = await fetch(`/api/assessment-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openAt: parsed.toISOString() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast({
        title: "Start date updated",
        description: `Opens ${formatDateTime(parsed)}.`,
      });
      setOpenAtEditing(false);
      router.refresh();
    } catch (err) {
      toast({
        title: "Could not update start date",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setOpenAtSaving(false);
    }
  }

  // Task O UI follow-on — save email overrides via PATCH /api/assessment-campaigns/[id].
  async function handleSaveEmailOverrides() {
    if (emailSaving) return;
    setEmailSaving(true);
    try {
      const res = await fetch(`/api/assessment-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationSubject: emailSubject.trim() === "" ? null : emailSubject.trim(),
          invitationBodyMarkdown:
            emailBody.trim() === "" ? null : emailBody.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast({
        title: "Invitation email saved",
        description:
          emailSubject.trim() === "" && emailBody.trim() === ""
            ? "Using template default."
            : "New campaign overrides applied.",
      });
      setEmailOpen(false);
      router.refresh();
    } catch (err) {
      toast({
        title: "Could not save email overrides",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setEmailSaving(false);
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
      setOrgRespondentsLoaded(true);
    }
  }, [campaign.organizationId, toast]);

  // Lazy-load the org respondents on first open of the Add dialog.
  // Use orgRespondentsLoaded flag instead of length check to avoid an
  // infinite loop when the org has zero members.
  useEffect(() => {
    if (addDialogOpen && !orgRespondentsLoaded && !loadingOrgRespondents) {
      void loadOrgRespondents();
    }
  }, [addDialogOpen, orgRespondentsLoaded, loadingOrgRespondents, loadOrgRespondents]);

  const participantRespondentIds = new Set(
    respondents.map((r) => r.respondent.id),
  );
  const availableRespondents = orgRespondents.filter(
    (r) => !participantRespondentIds.has(r.id),
  );

  function resetAddDialog() {
    setAddDialogOpen(false);
    setSelectedRespondentIds(new Set());
    // Clear loaded state so the next open re-fetches fresh members.
    setOrgRespondents([]);
    setOrgRespondentsLoaded(false);
  }

  /**
   * Add all selected (checked) respondents to the campaign one by one.
   * Loops through selectedRespondentIds and calls the existing POST
   * /api/assessment-campaigns/[id]/respondents endpoint for each.
   * ALREADY_PARTICIPANT responses are treated as benign (idempotent).
   */
  async function handleConfirmAdd() {
    if (selectedRespondentIds.size === 0 || adding) return;
    setAdding(true);
    const ids = Array.from(selectedRespondentIds);
    const errors: string[] = [];
    let successCount = 0;
    for (const orgRespondentId of ids) {
      try {
        const res = await fetch(
          `/api/assessment-campaigns/${campaign.id}/respondents`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgRespondentId }),
          },
        );
        const body = await res.json();
        if (!res.ok || !body.success) {
          const code = body.code as string | undefined;
          if (code === "ALREADY_PARTICIPANT") {
            successCount++; // benign — already in, counts as success
            continue;
          }
          const msg = typeof body.error === "string"
            ? body.error
            : code === "WRONG_ORGANIZATION"
              ? "Respondent belongs to a different organization."
              : code === "CAMPAIGN_CLOSED"
                ? "Cannot add respondents to a closed campaign."
                : "Failed to add respondent";
          errors.push(msg);
        } else {
          successCount++;
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Network error");
      }
    }
    setAdding(false);

    // Always refresh so any partial successes appear in the table.
    await refreshRespondents();
    router.refresh();

    const failCount = errors.length;

    if (successCount > 0 && failCount === 0) {
      // All succeeded.
      toast({
        title: successCount === 1 ? "Respondent added" : `${successCount} respondents added`,
        description:
          campaign.status === "ACTIVE"
            ? "Pending invitation rows created. Use Resend to deliver the emails."
            : "Participants added to this draft campaign.",
      });
      resetAddDialog();
    } else if (successCount > 0 && failCount > 0) {
      // Partial success — keep dialog open so the coach can retry the failures.
      toast({
        title: `${successCount} added, ${failCount} couldn't be added`,
        description: errors[0],
        variant: "destructive",
      });
    } else {
      // All failed.
      toast({
        title: "Could not add respondent",
        description: errors[0],
        variant: "destructive",
      });
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
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-destructive hover:bg-destructive/10 transition-colors"
              data-testid="campaign-delete-btn"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete campaign
            </button>
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
            {openAtEditing ? (
              <div className="mt-1 space-y-2">
                <input
                  type="datetime-local"
                  value={openAtDraft}
                  onChange={(e) => setOpenAtDraft(e.target.value)}
                  disabled={openAtSaving}
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveOpenAt}
                    disabled={openAtSaving}
                    className="text-xs font-medium px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {openAtSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenAtEditing(false);
                      setOpenAtDraft(
                        formatDateTimeLocal(new Date(campaign.openAt)),
                      );
                    }}
                    disabled={openAtSaving}
                    className="text-xs font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <span className="font-medium text-foreground">
                  {formatDateTime(campaign.openAt)}
                </span>
                {!isClosed && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenAtDraft(
                        formatDateTimeLocal(new Date(campaign.openAt)),
                      );
                      setOpenAtEditing(true);
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                    data-testid="edit-openAt"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
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

      {/* Task O UI follow-on — invitation email overrides edit panel.
          Hidden when campaign is CLOSED (no further sends to customize). */}
      {!isClosed && (
        <div
          className="bg-card border border-border rounded-xl"
          data-testid="campaign-email-overrides-card"
        >
          <button
            type="button"
            onClick={() => setEmailOpen((v) => !v)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
            data-testid="email-overrides-toggle"
          >
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Invitation email
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {overview.campaign.invitationSubject ||
                overview.campaign.invitationBodyMarkdown
                  ? "Custom subject/body set for this campaign"
                  : "Using template default — click to customize"}
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {emailOpen ? "Hide" : "Edit"}
            </span>
          </button>
          {emailOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Available tokens:{" "}
                <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                  {"{{respondentFirstName}}"}
                </code>
                ,{" "}
                <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                  {"{{respondentFullName}}"}
                </code>
                ,{" "}
                <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                  {"{{campaignName}}"}
                </code>
                ,{" "}
                <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                  {"{{invitationUrl}}"}
                </code>
                ,{" "}
                <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                  {"{{closeAt}}"}
                </code>
                . Changes apply to new and reminder sends going forward.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Subject
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  maxLength={200}
                  placeholder="Leave blank to use template default"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  data-testid="email-overrides-subject"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Body (Markdown)
                </label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  maxLength={5000}
                  rows={8}
                  placeholder="Leave blank to use template default"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                  data-testid="email-overrides-body"
                />
                <p className="text-[11px] text-muted-foreground">
                  {emailBody.length} / 5000 characters
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEmailSubject(overview.campaign.invitationSubject ?? "");
                    setEmailBody(
                      overview.campaign.invitationBodyMarkdown ?? "",
                    );
                    setEmailOpen(false);
                  }}
                  disabled={emailSaving}
                  className="inline-flex items-center text-xs font-medium px-3 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"
                  data-testid="email-overrides-cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEmailOverrides}
                  disabled={emailSaving || !emailDirty}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="email-overrides-save"
                >
                  {emailSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : null}
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Header aggregate metrics strip (Slice 5 Task 5.5) */}
      <CampaignStatusMetrics
        metrics={headerMetrics}
        testIdPrefix="campaign-detail-metrics"
        className="mb-3"
      />

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
            {campaign.status === "ACTIVE" && (
              <>
                <button
                  type="button"
                  onClick={handleSendInvitations}
                  disabled={sendingInvitations}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="send-invitations-btn"
                  title="Fire the initial invitation email to respondents who haven't been invited yet"
                >
                  {sendingInvitations ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Mail className="w-3.5 h-3.5" />
                  )}
                  Send Invitations
                </button>
                <button
                  type="button"
                  onClick={handleSendReminders}
                  disabled={sendingReminders}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="send-reminders-btn"
                  title="Nudge respondents who were already invited but haven't submitted"
                >
                  {sendingReminders ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Mail className="w-3.5 h-3.5" />
                  )}
                  Send Reminders
                </button>
              </>
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
                  Team
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
                        {!isClosed && row.isCEO && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSetCeo(null, undefined)
                            }
                            disabled={ceoSavingFor !== null}
                            className="ml-1 text-[10px] font-medium text-muted-foreground hover:text-destructive disabled:opacity-50 underline-offset-2 hover:underline"
                            data-testid={`clear-ceo-btn-${row.respondent.id}`}
                          >
                            (clear)
                          </button>
                        )}
                        {!isClosed && !row.isCEO && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSetCeo(
                                row.participantId,
                                `${row.respondent.firstName} ${row.respondent.lastName}`,
                              )
                            }
                            disabled={ceoSavingFor !== null}
                            className="ml-2 text-[10px] font-medium text-muted-foreground hover:text-primary disabled:opacity-50 underline-offset-2 hover:underline"
                            data-testid={`set-ceo-btn-${row.respondent.id}`}
                          >
                            {ceoSavingFor === row.participantId
                              ? "Setting…"
                              : "Mark as CEO"}
                          </button>
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
                      <td
                        className="px-4 py-3 text-sm"
                        data-testid={`team-cell-${row.respondent.id}`}
                      >
                        {row.teamSnapshot.pathLabels.length === 0 ? (
                          <span className="text-muted-foreground italic">—</span>
                        ) : (
                          <>
                            <span className="text-foreground">
                              {row.teamSnapshot.pathLabels[row.teamSnapshot.pathLabels.length - 1]}
                            </span>
                            {row.teamSnapshot.pathLabels.length > 1 && (
                              <div className="text-xs text-muted-foreground">
                                {row.teamSnapshot.pathLabels.join(" › ")}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const band = getInvitationBand(
                            row.invitation
                              ? {
                                  status: row.invitation.status,
                                  sentAt: row.invitation.sentAt,
                                  revokedAt: row.invitation.revokedAt,
                                }
                              : null,
                          );
                          const label = BAND_LABEL[band];
                          const tone = BAND_TONE[band];
                          return (
                            <span
                              className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded ring-1 ${tone}`}
                              data-testid={`band-pill-${band}`}
                            >
                              {label}
                            </span>
                          );
                        })()}
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
                            // PRIMARY results action: the branded report.
                            // H6 — a PLAIN <a> (NOT a Next <Link>): a Link would
                            // prefetch every visible respondent's full PII report
                            // into the client cache on render. target="_blank"
                            // opens the report in its own tab; rel guards the opener.
                            <a
                              href={`/assessments/${campaign.id}/respondents/${row.respondent.id}/report`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                              data-testid={`view-report-link-${row.respondent.id}`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              View report
                            </a>
                          )}
                          {row.hasSubmission && (
                            // Phase-1 fallback: the legacy inline raw-data view,
                            // de-emphasized to a muted secondary control. Removal
                            // is Phase 2 (gated on telemetry). Keeps resultsCache
                            // lazy-fetch intact.
                            <button
                              type="button"
                              onClick={() => handleToggleResult(row)}
                              disabled={loading}
                              className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                              data-testid={`view-result-btn-${row.respondent.id}`}
                              title="View the raw scored answers inline"
                            >
                              {loading ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Eye className="w-3 h-3" />
                              )}
                              {expanded ? "Hide raw data" : "Raw data"}
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
                        <td colSpan={7} className="px-4 py-4">
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
          if (adding) return;
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
                ? "Draft campaigns: selected members are queued and will receive an invitation when you launch."
                : "Active campaigns: selected members get pending invitation rows. Use Resend to deliver the email."}
            </DialogDescription>
          </DialogHeader>

          {/* Pick-existing member list */}
          {loadingOrgRespondents ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading members…
            </div>
          ) : availableRespondents.length === 0 ? (
            <div
              className="py-8 text-center space-y-3"
              data-testid="add-respondent-empty-state"
            >
              <p className="text-sm text-muted-foreground">
                {orgRespondents.length === 0
                  ? "This company has no members yet."
                  : "All company members are already participants in this campaign."}
              </p>
              <Link
                href="/portal/members"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
              >
                Add members in the Members lane
              </Link>
            </div>
          ) : (
            <div
              className="border border-border rounded-lg divide-y divide-border max-h-72 overflow-y-auto"
              data-testid="add-respondent-member-list"
            >
              {availableRespondents.map((r) => {
                const checked = selectedRespondentIds.has(r.id);
                return (
                  <label
                    key={r.id}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                    aria-label={`${r.firstName} ${r.lastName}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedRespondentIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.delete(r.id);
                          else next.add(r.id);
                          return next;
                        });
                      }}
                      disabled={adding}
                      className="accent-primary shrink-0"
                      aria-label={`${r.firstName} ${r.lastName}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {r.firstName} {r.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.email}
                        {r.jobTitle ? ` · ${r.jobTitle}` : ""}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={resetAddDialog}
              disabled={adding}
              className="inline-flex items-center justify-center text-sm font-medium px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="add-respondent-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmAdd}
              disabled={selectedRespondentIds.size === 0 || adding}
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="add-respondent-confirm"
            >
              {adding && <Loader2 className="w-4 h-4 animate-spin" />}
              {selectedRespondentIds.size > 1
                ? `Add ${selectedRespondentIds.size} to campaign`
                : "Add to campaign"}
            </button>
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
      {/* Delete campaign dialog (Wave D #1) */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteDialogOpen(open);
        }}
      >
        <DialogContent data-testid="campaign-delete-dialog">
          <DialogHeader>
            <DialogTitle>Delete this campaign?</DialogTitle>
            <DialogDescription>
              {headerMetrics.invited > 0 || headerMetrics.completed > 0
                ? `${headerMetrics.invited} invited and ${headerMetrics.completed} completed participants will lose access. Responses are retained.`
                : "Invited participants will lose access. Responses are retained."}
              {" "}This is not reversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
              className="inline-flex items-center justify-center text-sm font-medium px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="campaign-delete-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="campaign-delete-confirm"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete campaign
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
