"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatEventDateUTC } from "@/lib/utils";

export interface SelfComparisonFocusCandidate {
  submissionId: string;
  label: string;
  submittedAt: string;
}

interface EarlierCandidate {
  submissionId: string;
  campaignLabel: string | null;
  submittedAt: string;
  versionNumber: number;
  isImported: boolean;
}

export function SelfComparisonPicker({ open, onClose, campaignId, focusCandidates }: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  focusCandidates: readonly SelfComparisonFocusCandidate[];
}) {
  const [focusId, setFocusId] = useState(focusCandidates.length === 1 ? focusCandidates[0].submissionId : "");
  const [earlierId, setEarlierId] = useState("");
  const [candidates, setCandidates] = useState<EarlierCandidate[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!open || !focusId) return;
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setState("loading");
      setEarlierId("");
      try {
        const response = await fetch(`/api/assessment-campaigns/${encodeURIComponent(campaignId)}/summary-reports/self-comparison-candidates?focus=${encodeURIComponent(focusId)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("candidate request failed");
        const body = await response.json() as { candidates?: EarlierCandidate[] };
        if (!Array.isArray(body.candidates)) throw new Error("invalid candidate response");
        setCandidates(body.candidates);
        setState("ready");
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    })();
    return () => controller.abort();
  }, [campaignId, focusId, open]);

  const openReport = () => {
    if (!focusId || !earlierId) return;
    const href = `/assessments/${encodeURIComponent(campaignId)}/self-comparison?focus=${encodeURIComponent(focusId)}&earlier=${encodeURIComponent(earlierId)}`;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create Self Comparison</DialogTitle>
        <DialogDescription>Compare one person&apos;s completed report now with an earlier personal report for that same person.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <label className="grid gap-2 text-sm font-medium">Focus report
          <select className="h-10 rounded-md border bg-background px-3" value={focusId} onChange={(event) => setFocusId(event.target.value)}>
            <option value="">Select Focus</option>
            {focusCandidates.map((candidate) => <option value={candidate.submissionId} key={candidate.submissionId}>{candidate.label} · {formatEventDateUTC(candidate.submittedAt)}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">Earlier report
          <select className="h-10 rounded-md border bg-background px-3" value={earlierId} onChange={(event) => setEarlierId(event.target.value)} disabled={state !== "ready"}>
            <option value="">{state === "loading" ? "Loading earlier reports…" : "Select Earlier"}</option>
            {candidates.map((candidate) => <option value={candidate.submissionId} key={candidate.submissionId}>{candidate.campaignLabel ?? "Earlier assessment"} · {formatEventDateUTC(candidate.submittedAt)} · Version {candidate.versionNumber}{candidate.isImported ? " · Imported" : ""}</option>)}
          </select>
        </label>
        {state === "ready" && candidates.length === 0 ? <p className="text-sm text-muted-foreground">No compatible earlier personal report is available.</p> : null}
        {state === "error" ? <p role="alert" className="text-sm text-destructive">Earlier reports are temporarily unavailable.</p> : null}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={openReport} disabled={!focusId || !earlierId}>Open Self Comparison</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
