"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReportComparisonCandidate } from "@/lib/assessments/report-comparison-model";

interface ReportComparisonControlsProps {
  candidates: ReportComparisonCandidate[];
  selectedSubmissionId: string | null;
  bounded: boolean;
  canonicalHref: string;
}

function submittedDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function candidateLabel(candidate: ReportComparisonCandidate): string {
  const date = submittedDate(candidate.submittedAt);
  const campaign = candidate.campaignLabel?.trim() || `Scaling Up Assessment · ${date}`;
  return [
    candidate.campaignLabel?.trim() ? `${campaign} · Submitted ${date}` : campaign,
    candidate.isImported ? "Imported" : null,
  ].filter(Boolean).join(" · ");
}

export function ReportComparisonControls({
  candidates,
  selectedSubmissionId,
  bounded,
  canonicalHref,
}: ReportComparisonControlsProps) {
  const router = useRouter();
  const [candidateId, setCandidateId] = useState(
    selectedSubmissionId ?? candidates[0]?.submissionId ?? "",
  );
  const [changing, setChanging] = useState(selectedSubmissionId === null);
  const selected = candidates.find((candidate) => candidate.submissionId === selectedSubmissionId) ?? null;
  const href = candidateId
    ? `${canonicalHref}?compareTo=${encodeURIComponent(candidateId)}`
    : canonicalHref;

  if (selected && !changing) {
    return (
      <section className="no-print su-report-comparison-controls" aria-label="Report comparison">
        <p className="su-report-comparison-current">Comparing with {candidateLabel(selected)}</p>
        <div className="su-report-comparison-actions">
          <button type="button" className="su-cta" onClick={() => setChanging(true)}>
            Change comparison
          </button>
          <button type="button" className="su-report-comparison-remove" onClick={() => router.push(canonicalHref)}>
            Remove comparison
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="no-print su-report-comparison-controls" aria-label="Report comparison">
      <label className="su-report-comparison-label" htmlFor="report-comparison-baseline">
        Compare to previous assessment
      </label>
      <div className="su-report-comparison-picker">
        <select
          id="report-comparison-baseline"
          value={candidateId}
          onChange={(event) => setCandidateId(event.target.value)}
        >
          {candidates.map((candidate) => (
            <option key={candidate.submissionId} value={candidate.submissionId}>
              {candidateLabel(candidate)}
            </option>
          ))}
        </select>
        <button type="button" className="su-cta" disabled={!candidateId} onClick={() => router.push(href)}>
          Compare
        </button>
        {selected ? (
          <button type="button" className="su-report-comparison-remove" onClick={() => router.push(canonicalHref)}>
            Remove comparison
          </button>
        ) : null}
      </div>
      {bounded ? <p className="su-report-comparison-limit">Showing 12 most recent</p> : null}
    </section>
  );
}
