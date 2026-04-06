"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";

interface CounterOfferCardProps {
  approvalId: string;
  workshopId: string;
  originalPriceCents: number;
  counterOfferCents: number;
  counterOfferNote?: string | null;
}

export function CounterOfferCard({
  approvalId,
  workshopId: _workshopId,
  originalPriceCents,
  counterOfferCents,
  counterOfferNote,
}: CounterOfferCardProps) {
  const [phase, setPhase] = useState<"idle" | "declining">("idle");
  const [newPrice, setNewPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/approvals/${approvalId}/coach-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACCEPT_COUNTER" }),
      });
      if (res.ok) {
        setResult("accepted");
        // Reload after a short delay to reflect the price change
        setTimeout(() => window.location.reload(), 1200);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setSubmitting(true);
    const newPriceCents = newPrice.trim() ? Math.round(parseFloat(newPrice) * 100) : undefined;
    try {
      const res = await fetch(`/api/approvals/${approvalId}/coach-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DECLINE_COUNTER",
          ...(newPriceCents ? { newPriceCents } : {}),
        }),
      });
      if (res.ok) {
        setResult("declined");
        setTimeout(() => window.location.reload(), 1200);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (result === "accepted") {
    return (
      <div className="rounded-xl border border-green-300 bg-green-50 p-5">
        <p className="text-sm font-medium text-green-800">
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
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-amber-900 mb-3">Admin Counter-Offer on Your Price Request</p>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground line-through">
            Your requested: {formatCurrency(originalPriceCents)}
          </p>
          <p className="text-lg font-bold text-amber-700">
            Admin offering: {formatCurrency(counterOfferCents)}
          </p>
        </div>
        {counterOfferNote && (
          <div className="mt-3 rounded-md border-l-4 border-amber-400 bg-white px-3 py-2">
            <p className="text-xs font-medium text-amber-800 mb-1">Note from admin</p>
            <p className="text-sm text-foreground">{counterOfferNote}</p>
          </div>
        )}
      </div>

      {phase === "idle" && (
        <div className="flex gap-3">
          <button
            className="px-4 py-2 rounded-md text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
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
              onClick={() => { setPhase("idle"); setNewPrice(""); }}
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
