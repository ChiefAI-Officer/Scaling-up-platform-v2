"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useId } from "react";
import type { SummaryReportCandidate } from "@/lib/assessments/summary-reports/candidates";

interface Props {
  candidates: SummaryReportCandidate[];
  ceo: SummaryReportCandidate | null;
  team: SummaryReportCandidate[];
  selectedIds: string[];
  scope: "current" | "all";
  query: string;
  loading: boolean;
  error: string | null;
  frozen: boolean;
  onScope: (scope: "current" | "all") => void;
  onQuery: (query: string) => void;
  onSelect: (ids: string[]) => void;
  onAssign: (role: "CEO" | "TEAM") => void;
  onClear: (role: "CEO" | "TEAM") => void;
  onRemove: (id: string) => void;
}

function unavailableReason(candidate: SummaryReportCandidate) {
  switch (candidate.disabledReason) {
    case "WRONG_FAMILY": return "Wrong assessment family";
    case "WRONG_ORGANIZATION": return "Wrong organization";
    case "INCOMPATIBLE_VERSION": return "Incompatible version";
    default: return "Unavailable";
  }
}

function SourceDetails({ source }: { source: SummaryReportCandidate }) {
  const date = new Date(source.submittedAt);
  const completed = Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(date);
  return (
    <span className="block min-w-0 space-y-0.5 break-words">
      <span className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-semibold text-foreground">{source.respondentName}</span>
        <span className="text-[11px] text-muted-foreground" title={`Submission: ${source.submissionId}`}>
          Submission …{source.submissionId.slice(-8)}
        </span>
      </span>
      <span className="block text-xs text-muted-foreground">{source.jobTitle ?? "No job title"} · {source.organizationName}</span>
      <span className="block text-xs text-muted-foreground">{source.campaignName} · v{source.versionNumber} · {source.language} · {completed}</span>
    </span>
  );
}

export function SummaryReportComposition({
  candidates, ceo, team, selectedIds, scope, query, loading, error, frozen,
  onScope, onQuery, onSelect, onAssign, onClear, onRemove,
}: Props) {
  const descriptionPrefix = useId();
  const assigned = new Set([ceo?.submissionId, ...team.map((source) => source.submissionId)]);
  const available = candidates.filter((source) => !assigned.has(source.submissionId));
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const visible = available.filter((source) => {
    const text = [source.respondentName, source.jobTitle, source.organizationName, source.campaignName,
      source.submissionId, source.templateAlias, source.language].join(" ").toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
  const eligibleIds = visible.filter((source) => source.eligible).map((source) => source.submissionId);
  const busy = frozen || loading || Boolean(error);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Select available reports, then add them to CEO or Team. Only reports in those boxes are included.</p>
      <div className="grid min-w-0 items-start gap-5 md:grid-cols-2">
        <section aria-label="Available reports" className="min-w-0 space-y-3">
          <h3 className="text-sm font-semibold">Available reports</h3>
          <div className="flex flex-wrap gap-1 border-b" role="group" aria-label="Source campaign scope">
            {(["current", "all"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={scope === value} disabled={frozen}
                onClick={() => onScope(value)}
                className={`border-b-2 px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${scope === value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {value === "current" ? "Current campaign" : "All campaigns"}
              </button>
            ))}
          </div>
          <Input type="search" aria-label="Search report sources" placeholder="Search name, campaign or organization…"
            value={query} disabled={frozen} onChange={(event) => onQuery(event.target.value)} className="h-9 text-sm" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{visible.length} available · {selectedIds.length} selected</span>
            <div className="flex gap-3">
              <button type="button" disabled={busy || !eligibleIds.length} onClick={() => onSelect(eligibleIds)}
                className="text-primary hover:underline disabled:opacity-40">Select all</button>
              <button type="button" disabled={frozen || !selectedIds.length} onClick={() => onSelect([])}
                className="text-primary hover:underline disabled:opacity-40">Deselect all</button>
            </div>
          </div>
          <div className="max-h-[42vh] min-h-28 overflow-y-auto rounded-lg border bg-muted/10 p-1.5 md:max-h-[calc(90vh-24rem)]">
            {loading ? <p className="p-3 text-sm text-muted-foreground">Loading report sources…</p>
              : error ? <p role="alert" className="p-3 text-sm text-destructive">{error}</p>
              : visible.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{query.trim()
                ? "No matching reports. Try a different search."
                : candidates.length === 0 ? "No completed reports available in this scope."
                : "All available reports have been added."}</p>
              : visible.map((source) => {
                const selected = selectedIds.includes(source.submissionId);
                return (
                  <button key={source.submissionId} type="button"
                    aria-label={source.eligible ? `Select ${source.respondentName}` : `${source.respondentName} ${unavailableReason(source)}`}
                    aria-describedby={`${descriptionPrefix}-${source.submissionId}`}
                    aria-pressed={selected} disabled={frozen || !source.eligible}
                    onClick={() => onSelect(selected ? selectedIds.filter((id) => id !== source.submissionId) : [...selectedIds, source.submissionId])}
                    className={`mb-1.5 flex w-full items-start gap-2.5 rounded-md border p-2.5 text-left last:mb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}>
                    <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{selected ? "✓" : ""}</span>
                    <span className="min-w-0 flex-1">
                      <SourceDetails source={source} />
                      <span id={`${descriptionPrefix}-${source.submissionId}`} className="sr-only">
                        {source.campaignName}; version {source.versionNumber}; {source.language}; completed {source.submittedAt}; submission {source.submissionId}
                      </span>
                      {!source.eligible && <span className="mt-1 block text-xs text-destructive">{unavailableReason(source)}</span>}
                    </span>
                  </button>
                );
              })}
          </div>
          <p className="text-xs text-muted-foreground">Completed reports you can access in this organization. Incompatible versions cannot be selected.</p>
        </section>

        <div className="min-w-0 space-y-4">
          <h3 className="text-sm font-semibold">Included in this report</h3>
          {(["CEO", "TEAM"] as const).map((role) => {
            const title = role === "CEO" ? "CEO" : "Team";
            const sources = role === "CEO" ? (ceo ? [ceo] : []) : team;
            const canAdd = !busy && selectedIds.length > 0 && (role === "TEAM" || (!ceo && selectedIds.length === 1));
            return (
              <section key={role} aria-label={`${title} component`} className="min-w-0 rounded-lg border">
                <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold">{title}</h4>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{sources.length}</span>
                    <span className="text-xs text-muted-foreground">{role === "CEO" ? "Exactly 1" : "Optional"}</span>
                  </div>
                  <button type="button" aria-label={`Clear ${title}`} disabled={frozen || !sources.length}
                    onClick={() => onClear(role)} className="text-xs text-primary hover:underline disabled:opacity-40">Clear</button>
                </div>
                <div className="max-h-[26vh] overflow-y-auto p-2">
                  {sources.length ? sources.map((source) => (
                    <div key={source.submissionId} className="flex items-start gap-2 rounded-md p-1.5">
                      <div className="min-w-0 flex-1">
                        <SourceDetails source={source} />
                        {!source.eligible && <p className="mt-1 text-xs text-destructive">{unavailableReason(source)} — remove this report before review.</p>}
                      </div>
                      <button type="button" aria-label={`Remove ${source.respondentName} from ${title}`} disabled={frozen}
                        onClick={() => onRemove(source.submissionId)} className="shrink-0 rounded px-1 text-lg leading-none text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">×</button>
                    </div>
                  )) : <p className="px-1 py-3 text-xs text-muted-foreground">{role === "CEO" ? "Select one report, then add it as CEO." : "Select one or more reports, then add them as Team."}</p>}
                </div>
                <div className="border-t p-2">
                  <Button type="button" variant="outline" size="sm" className="w-full" disabled={!canAdd} onClick={() => onAssign(role)}>
                    Add selected to {title}
                  </Button>
                  {role === "CEO" && ceo && <p className="mt-1.5 text-center text-xs text-muted-foreground">Clear CEO to choose a different report.</p>}
                </div>
              </section>
            );
          })}
          {selectedIds.length > 0 && <p role="status" className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
            {selectedIds.length} selected, not yet included. Add to CEO or Team, or deselect before review.
          </p>}
        </div>
      </div>
    </div>
  );
}
