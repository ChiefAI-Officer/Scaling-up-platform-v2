"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

interface CounterOfferCardProps {
  approvalId: string;
  originalPriceCents: number;
  counterOfferCents: number;
  counterOfferNote?: string | null;
}

export function CounterOfferCard({
  approvalId,
  originalPriceCents,
  counterOfferCents,
  counterOfferNote,
}: CounterOfferCardProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "declining">("idle");
  const [newPrice, setNewPrice] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${approvalId}/coach-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACCEPT_COUNTER" }),
      });
      if (res.ok) {
        setResult("accepted");
        setTimeout(() => router.refresh(), 1200);
      } else {
        const payload = await res.json().catch(() => ({})) as { error?: string };
        setError(payload.error || "Failed to accept offer — please try again");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setSubmitting(true);
    setError(null);
    const newPriceCents = newPrice.trim() ? Math.round(parseFloat(newPrice) * 100) : undefined;
    try {
      const res = await fetch(`/api/approvals/${approvalId}/coach-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DECLINE_COUNTER",
          ...(newPriceCents ? { newPriceCents } : {}),
          ...(counterNote.trim() ? { counterNote: counterNote.trim() } : {}),
        }),
      });
      if (res.ok) {
        setResult("declined");
        setTimeout(() => router.refresh(), 1200);
      } else {
        const payload = await res.json().catch(() => ({})) as { error?: string };
        setError(payload.error || "Failed to submit — please try again");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (result === "accepted") {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-5">
        <p className="text-sm font-medium text-success">
          Price accepted — {formatCurrency(counterOfferCents)} will be applied to your workshop.
        </p>
      </div>
    );
  }

  if (result === "declined") {
    return (
      <div className="rounded-xl border border-border bg-muted/50 p-5">
        <p className="text-sm text-muted-foreground">Counter-offer declined. Your admin has been notified.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-warning bg-warning/5 p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-warning mb-3">Admin Counter-Offer on Your Price Request</p>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground line-through">
            Your requested: {formatCurrency(originalPriceCents)}
          </p>
          <p className="text-lg font-bold text-warning">
            Admin offering: {formatCurrency(counterOfferCents)}
          </p>
        </div>
        {counterOfferNote && (
          <div className="mt-3 rounded-md border-l-4 border-warning bg-card px-3 py-2">
            <p className="text-xs font-medium text-warning mb-1">Note from admin</p>
            <p className="text-sm text-foreground">{counterOfferNote}</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {phase === "idle" && (
        <div className="flex gap-3">
          <button
            className="px-4 py-2 rounded-md text-sm font-medium bg-warning text-white hover:bg-warning/90 disabled:opacity-50"
            onClick={handleAccept}
            disabled={submitting}
          >
            {submitting ? "Processing..." : `Accept ${formatCurrency(counterOfferCents)}`}
          </button>
          <button
            className="px-4 py-2 rounded-md text-sm font-medium border border-border text-foreground hover:bg-accent disabled:opacity-50"
            onClick={() => setPhase("declining")}
            disabled={submitting}
          >
            Decline
          </button>
        </div>
      )}

      {phase === "declining" && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Propose a different price (optional)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 475.00"
              className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Leave blank to decline without a counter-offer.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Reason / notes (optional)
            </label>
            <textarea
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={3}
              placeholder="Explain why you're proposing this price..."
              value={counterNote}
              onChange={(e) => setCounterNote(e.target.value)}
              maxLength={1000}
            />
          </div>
          <div className="flex gap-3">
            <button
              className="px-4 py-2 rounded-md text-sm font-medium bg-destructive text-primary-foreground hover:bg-destructive/90 disabled:opacity-50"
              onClick={handleDecline}
              disabled={submitting}
            >
              {submitting ? "Submitting..." : newPrice.trim() ? "Submit New Price" : "Confirm Decline"}
            </button>
            <button
              className="px-4 py-2 rounded-md text-sm font-medium border border-border text-foreground hover:bg-accent"
              onClick={() => { setPhase("idle"); setNewPrice(""); setCounterNote(""); setError(null); }}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
