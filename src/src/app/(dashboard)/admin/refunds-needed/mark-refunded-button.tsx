"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Mark Refunded button. Prompts the operator for the Stripe refund ID,
 * POSTs to /api/registrations/[id]/refunded, refreshes the page on success.
 *
 * The actual refund must already have been processed in Stripe dashboard
 * — this button only records evidence of that work.
 */
export function MarkRefundedButton({ registrationId }: { registrationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const stripeRefundId = window.prompt(
      "Paste the Stripe refund ID (starts with 're_'). Process the refund in Stripe dashboard FIRST — this only records evidence.",
    );
    if (!stripeRefundId) return;
    const trimmed = stripeRefundId.trim();
    if (!/^re_[A-Za-z0-9]{14,}$/.test(trimmed)) {
      setError("That doesn't look like a Stripe refund ID (expected re_...).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/registrations/${registrationId}/refunded`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stripeRefundId: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleClick} disabled={busy}>
        {busy ? "Marking…" : "Mark Refunded"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
