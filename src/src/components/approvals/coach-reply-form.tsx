"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export function CoachReplyForm({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${approvalId}/coach-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "INFO_RESPONSE", response: text }),
      });
      if (res.ok) {
        setText("");
        router.refresh();
        toast({ title: "Reply sent", description: "Admin has been notified." });
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Failed to send reply. Please try again.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <label htmlFor="coach-reply-textarea" className="text-sm font-medium text-foreground">Reply to admin</label>
      <textarea
        id="coach-reply-textarea"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        rows={3}
        placeholder="Type your response..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={sending}
        maxLength={2000}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        onClick={handleSend}
        disabled={sending || !text.trim()}
        size="sm"
      >
        {sending ? "Sending..." : "Send Reply"}
      </Button>
    </div>
  );
}
