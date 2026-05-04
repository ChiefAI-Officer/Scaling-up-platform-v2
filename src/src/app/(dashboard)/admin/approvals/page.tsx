"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ApprovalThread } from "@/components/approvals/approval-thread";
import { formatTimestamp } from "@/lib/utils";

type ApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "INFO_REQUESTED" | "COUNTER_OFFERED";
type FilterStatus = ApprovalStatus | "ALL";

interface ApprovalMessage {
  id: string;
  from: string;
  text: string;
  createdAt: string;
}

interface Approval {
  id: string;
  type: string;
  status: ApprovalStatus;
  coachName: string;
  details: string;
  workshopId?: string | null;
  workshopCode?: string | null;
  requestedAt: string;
  escalatedAt?: string | null;
  coachResponse?: string | null; // MR-33
  counterOfferCents?: number | null;
  counterOfferNote?: string | null;
  notes?: string | null;
  requestData?: Record<string, unknown> | null;
  messages?: ApprovalMessage[];
}

interface ApprovalsApiResponse {
  approvals?: Approval[];
}

const FILTERS: FilterStatus[] = ["PENDING", "COUNTER_OFFERED", "INFO_REQUESTED", "APPROVED", "DENIED", "ALL"];

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("PENDING");
  const [processing, setProcessing] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [infoModalId, setInfoModalId] = useState<string | null>(null);
  const [infoQuestion, setInfoQuestion] = useState("");
  const [counterOfferModalId, setCounterOfferModalId] = useState<string | null>(null);
  const [counterOfferAmount, setCounterOfferAmount] = useState("");
  const [counterOfferNoteInput, setCounterOfferNoteInput] = useState("");

  const loadApprovals = useCallback(async (status: FilterStatus) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/approvals?status=${status}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load approvals (${response.status})`);
      }

      const payload = (await response.json()) as ApprovalsApiResponse;
      setApprovals(Array.isArray(payload.approvals) ? payload.approvals : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
      setApprovals([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApprovals(filter);
  }, [filter, loadApprovals]);

  const handleAction = async (approvalId: string, action: "APPROVE" | "DENY" | "RESET_TO_PENDING" | "INFO_REQUESTED", reason?: string) => {
    setProcessing(approvalId);
    setActionError(null);

    try {
      const response = await fetch(`/api/approvals/${approvalId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setActionError((payload as { error?: string }).error || "Action failed — please try again");
        return;
      }

      const newStatus: ApprovalStatus =
        action === "APPROVE" ? "APPROVED" :
        action === "DENY" ? "DENIED" :
        action === "INFO_REQUESTED" ? "INFO_REQUESTED" :
        "PENDING";

      setApprovals((prev) =>
        prev.map((approval) =>
          approval.id === approvalId ? { ...approval, status: newStatus } : approval
        )
      );
    } catch (err) {
      console.error("Action failed:", err);
      setActionError("Unexpected error — please try again");
    } finally {
      setProcessing(null);
    }
  };

  const handleInfoRequest = async () => {
    if (!infoModalId || !infoQuestion.trim()) return;
    await handleAction(infoModalId, "INFO_REQUESTED", infoQuestion.trim());
    setInfoModalId(null);
    setInfoQuestion("");
  };

  const handleCounterOfferSubmit = async () => {
    if (!counterOfferModalId || !counterOfferAmount.trim()) return;
    const cents = Math.round(parseFloat(counterOfferAmount) * 100);
    if (isNaN(cents) || cents <= 0) return;
    setProcessing(counterOfferModalId);
    setActionError(null);
    try {
      const response = await fetch(`/api/approvals/${counterOfferModalId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "COUNTER_OFFER",
          counterOfferCents: cents,
          counterOfferNote: counterOfferNoteInput.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setActionError((payload as { error?: string }).error || "Counter-offer failed");
        return;
      }
      setApprovals((prev) =>
        prev.map((a) => a.id === counterOfferModalId ? { ...a, status: "COUNTER_OFFERED" as ApprovalStatus } : a)
      );
      setCounterOfferModalId(null);
      setCounterOfferAmount("");
      setCounterOfferNoteInput("");
    } catch (err) {
      console.error("Counter-offer failed:", err);
      setActionError("Unexpected error — please try again");
    } finally {
      setProcessing(null);
    }
  };

  const titleText = useMemo(
    () => (filter === "ALL" ? "all approvals" : `${filter.toLowerCase()} approvals`),
    [filter]
  );

  const getTypeBadgeClasses = (type: string) => {
    switch (type) {
      case "WORKSHOP_REQUEST":
        return "bg-primary";
      case "CUSTOM_PRICING":
        return "bg-warning";
      case "CANCELLATION":
        return "bg-destructive";
      case "REFUND":
        return "bg-warning";
      case "DATE_CHANGE":
        return "bg-primary";
      default:
        return "bg-muted-foreground";
    }
  };

  const getStatusBadgeClasses = (status: ApprovalStatus) => {
    switch (status) {
      case "APPROVED":
        return "bg-success/10 text-success";
      case "DENIED":
        return "bg-destructive/10 text-destructive";
      case "INFO_REQUESTED":
        return "bg-warning/10 text-warning";
      case "COUNTER_OFFERED":
        return "bg-warning/15 text-warning border border-warning/30";
      case "EXPIRED":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: ApprovalStatus) => {
    if (status === "INFO_REQUESTED") return "Awaiting Coach Response";
    if (status === "COUNTER_OFFERED") return "Counter-Offered";
    return status.charAt(0) + status.slice(1).toLowerCase();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
    >
      <h2 className="mb-6 text-2xl font-bold text-foreground">Approval Queue</h2>

      {/* Action error toast */}
      {actionError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-4 font-bold">×</button>
        </div>
      )}

      {/* Counter-Offer Modal */}
      {counterOfferModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border border-border mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">Send Counter-Offer</h3>
            <p className="text-sm text-muted-foreground mb-4">Propose an alternative price for this custom pricing request.</p>
            <label className="block text-sm font-medium text-foreground mb-1">Counter-offer price (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-3"
              placeholder="e.g. 450.00"
              value={counterOfferAmount}
              onChange={(e) => setCounterOfferAmount(e.target.value)}
            />
            <label className="block text-sm font-medium text-foreground mb-1">Note (optional)</label>
            <textarea
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={3}
              placeholder="Explain your offer..."
              value={counterOfferNoteInput}
              onChange={(e) => setCounterOfferNoteInput(e.target.value)}
            />
            <div className="flex gap-3 mt-4 justify-end">
              <button
                className="px-4 py-2 rounded-md text-sm font-medium border border-border text-foreground hover:bg-accent"
                onClick={() => { setCounterOfferModalId(null); setCounterOfferAmount(""); setCounterOfferNoteInput(""); }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-md text-sm font-medium bg-warning text-white hover:bg-warning/90 disabled:opacity-50"
                onClick={handleCounterOfferSubmit}
                disabled={!counterOfferAmount.trim() || processing === counterOfferModalId}
              >
                {processing === counterOfferModalId ? "Sending..." : "Send Counter-Offer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Info Modal */}
      {infoModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border border-border mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">Request More Information</h3>
            <p className="text-sm text-muted-foreground mb-4">What information do you need from the coach?</p>
            <textarea
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={4}
              placeholder="Enter your question..."
              value={infoQuestion}
              onChange={(e) => setInfoQuestion(e.target.value)}
            />
            <div className="flex gap-3 mt-4 justify-end">
              <button
                className="px-4 py-2 rounded-md text-sm font-medium border border-border text-foreground hover:bg-accent"
                onClick={() => { setInfoModalId(null); setInfoQuestion(""); }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-md text-sm font-medium bg-warning text-white hover:bg-warning/90 disabled:opacity-50"
                onClick={handleInfoRequest}
                disabled={!infoQuestion.trim() || processing === infoModalId}
              >
                {processing === infoModalId ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-6 flex-wrap">
        {FILTERS.map((status) => (
          <button
            key={status}
            className={`px-4 py-2 border rounded-md text-sm font-medium cursor-pointer transition-all duration-200 ${
              filter === status
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:bg-accent"
            }`}
            onClick={() => setFilter(status)}
          >
            {status === "ALL" ? "All" : status === "INFO_REQUESTED" ? "Info Requested" : status === "COUNTER_OFFERED" ? "Counter-Offered" : status.charAt(0) + status.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-muted-foreground">Showing {titleText}</p>

      <div className="flex flex-col gap-4">
        {isLoading ? (
          <div className="text-center p-12 text-muted-foreground bg-card rounded-xl">
            <p>Loading approvals...</p>
          </div>
        ) : error ? (
          <div className="text-center p-12 bg-card rounded-xl text-destructive">
            <p>Failed to load approvals</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        ) : approvals.length === 0 ? (
          <div className="text-center p-12 text-muted-foreground bg-card rounded-xl">
            <p>No {titleText}</p>
          </div>
        ) : (
          approvals.map((approval) => (
            <div
              key={approval.id}
              className={`bg-card p-6 rounded-xl shadow-sm grid grid-cols-[1fr_auto] gap-4 items-center ${
                approval.escalatedAt ? "border-l-4 border-destructive" : ""
              }`}
            >
              <div>
                <h3 className="mb-2 text-foreground font-semibold">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-medium text-white ${getTypeBadgeClasses(approval.type)}`}
                  >
                    {approval.type.replace(/_/g, " ")}
                  </span>
                  {approval.type === "CUSTOM_PRICING" && typeof approval.requestData?.newPriceCents === "number" && (
                    <span className="inline-block ml-2 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                      Custom Price: ${(approval.requestData.newPriceCents / 100).toLocaleString()}
                    </span>
                  )}
                  {approval.status === "COUNTER_OFFERED" && typeof approval.counterOfferCents === "number" && (
                    <span className="inline-block ml-2 px-3 py-1 rounded-full text-xs font-medium bg-warning text-white">
                      Offered: ${(approval.counterOfferCents / 100).toLocaleString()}
                    </span>
                  )}
                  &nbsp; {approval.coachName}
                </h3>
                {approval.workshopId ? (
                  <Link
                    href={`/workshops/${approval.workshopId}`}
                    className="text-foreground hover:underline hover:text-primary transition-colors"
                  >
                    {approval.details}
                  </Link>
                ) : (
                  <p className="text-foreground">{approval.details}</p>
                )}
                {approval.type === "CUSTOM_PRICING" && approval.notes && (
                  <p className="text-sm text-muted-foreground mt-1 italic">
                    Coach&apos;s note: {approval.notes}
                  </p>
                )}
                {approval.type === "CUSTOM_PRICING" && typeof approval.requestData?.counterNote === "string" && (
                  <p className="text-sm text-muted-foreground mt-1 italic">
                    Coach&apos;s counter-offer reason: {approval.requestData.counterNote as string}
                  </p>
                )}
                {approval.coachResponse && (
                  <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Coach Response</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{approval.coachResponse}</p>
                  </div>
                )}
                <ApprovalThread messages={approval.messages ?? []} perspective="admin" />
                <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                  <span>
                    Requested: {formatTimestamp(approval.requestedAt)}
                  </span>
                  {approval.workshopCode && (
                    <span className="font-mono">{approval.workshopCode}</span>
                  )}
                </div>
                {approval.escalatedAt && (
                  <p className="text-destructive font-medium text-sm mt-2">
                    ⚠️ Escalated - pending for 24+ hours
                  </p>
                )}
              </div>

              <div className="flex gap-2 items-center flex-wrap justify-end">
                {approval.status === "PENDING" ? (
                  <>
                    <button
                      className="px-5 py-2.5 rounded-md font-medium text-sm cursor-pointer transition-all duration-200 bg-success text-primary-foreground hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleAction(approval.id, "APPROVE")}
                      disabled={processing === approval.id}
                    >
                      {processing === approval.id ? "..." : "Approve"}
                    </button>
                    <button
                      className="px-5 py-2.5 rounded-md font-medium text-sm cursor-pointer transition-all duration-200 bg-destructive text-primary-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleAction(approval.id, "DENY")}
                      disabled={processing === approval.id}
                    >
                      {processing === approval.id ? "..." : "Deny"}
                    </button>
                    <button
                      className="px-5 py-2.5 rounded-md font-medium text-sm cursor-pointer transition-all duration-200 bg-warning text-white hover:bg-warning/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => { setInfoModalId(approval.id); setInfoQuestion(""); }}
                      disabled={processing === approval.id}
                    >
                      Request Info
                    </button>
                    {approval.type === "CUSTOM_PRICING" && (
                      <button
                        className="px-5 py-2.5 rounded-md font-medium text-sm cursor-pointer transition-all duration-200 bg-warning text-white hover:bg-warning/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => { setCounterOfferModalId(approval.id); setCounterOfferAmount(""); setCounterOfferNoteInput(""); }}
                        disabled={processing === approval.id}
                      >
                        Counter-Offer
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className={`px-4 py-2 rounded-md font-medium text-sm ${getStatusBadgeClasses(approval.status)}`}>
                      {getStatusLabel(approval.status)}
                    </span>
                    {approval.status === "DENIED" && (
                      <button
                        className="px-4 py-2 rounded-md font-medium text-sm cursor-pointer transition-all duration-200 bg-muted text-foreground hover:bg-accent border border-border disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => handleAction(approval.id, "RESET_TO_PENDING")}
                        disabled={processing === approval.id}
                        title="Move back to pending for re-review"
                      >
                        {processing === approval.id ? "..." : "Move to Pending"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
