"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface CoachResponseFormProps {
  approvalId: string;
  existingResponse: string | null;
  adminQuestion: string | null;
}

// MR-33: Form for coach to respond to INFO_REQUESTED approvals
export function CoachResponseForm({
  approvalId,
  existingResponse,
  adminQuestion,
}: CoachResponseFormProps) {
  const [response, setResponse] = useState(existingResponse ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!existingResponse);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!response.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/approvals/${approvalId}/coach-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: response.trim() }),
      });

      const result = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !result.success) {
        throw new Error(result.error ?? "Failed to submit response");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-warning">
        Additional Information Requested
      </h2>
      {adminQuestion && (
        <p className="mb-4 text-sm text-foreground">{adminQuestion}</p>
      )}
      {submitted ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Your Response
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{response}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSubmitted(false)}
          >
            Edit Response
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Type your response to the admin's question here…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={submitting || !response.trim()}>
              {submitting ? "Submitting…" : "Submit Response"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {response.length}/2000
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
