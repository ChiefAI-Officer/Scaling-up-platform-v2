"use client";

import { useState } from "react";

export function PublicLeadExportButton({
  filter,
}: {
  filter: {
    search?: string;
    assessment?: string;
    from?: string;
    to?: string;
  };
}) {
  const [status, setStatus] = useState<
    "idle" | "starting" | "working" | "failed"
  >("idle");

  async function start() {
    setStatus("starting");
    try {
      const response = await fetch("/api/portal/public-leads/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filter),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Export failed");
      const exportId = body.data.exportId as string;
      setStatus("working");

      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const poll = await fetch(
          `/api/portal/public-leads/exports/${encodeURIComponent(exportId)}`,
          { cache: "no-store" },
        );
        const progress = await poll.json();
        if (!poll.ok) throw new Error(progress.error ?? "Export failed");
        if (progress.data.status === "COMPLETED") {
          window.location.assign(progress.data.downloadUrl);
          setStatus("idle");
          return;
        }
        if (progress.data.status === "ABORTED") {
          throw new Error("Export aborted");
        }
      }
      throw new Error("Export timed out");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={start}
        disabled={status === "starting" || status === "working"}
        className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted disabled:cursor-wait disabled:opacity-60"
      >
        {status === "starting"
          ? "Starting…"
          : status === "working"
            ? "Preparing CSV…"
            : "Export CSV"}
      </button>
      {status === "failed" && (
        <span className="text-xs text-destructive" role="alert">
          Export could not be prepared. Try again.
        </span>
      )}
    </div>
  );
}
