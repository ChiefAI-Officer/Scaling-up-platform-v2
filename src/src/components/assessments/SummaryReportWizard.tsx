"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SummaryReportCandidate } from "@/lib/assessments/summary-reports/candidates";
import type { SummaryReportType } from "@/lib/assessments/summary-reports/types";

interface ScalingCeoFullDraft {
  step: "TYPE" | "COMPOSITION" | "REVIEW";
  reportType: "SCALING_CEO_FULL" | null;
  scope: "current" | "all";
  selectedIds: string[];
  ceoSubmissionId: string | null;
  teamSubmissionIds: string[];
  creationRequestId: string;
}

interface ImplementedType {
  type: SummaryReportType;
  label: string;
  description: string;
}

export interface SummaryReportWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  campaignId: string;
  campaignName: string;
  assessmentName: string;
  implementedTypes: ImplementedType[];
}

type CreateState = "idle" | "submitting" | "ambiguous";

function newDraft(): ScalingCeoFullDraft {
  return {
    step: "TYPE",
    reportType: null,
    scope: "current",
    selectedIds: [],
    ceoSubmissionId: null,
    teamSubmissionIds: [],
    creationRequestId: crypto.randomUUID(),
  };
}

function isCandidate(value: unknown): value is SummaryReportCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return [
    "submissionId",
    "campaignId",
    "campaignName",
    "respondentId",
    "respondentName",
    "organizationId",
    "organizationName",
    "templateId",
    "templateAlias",
    "versionId",
    "language",
    "submittedAt",
  ].every((key) => typeof candidate[key] === "string") &&
    typeof candidate.versionNumber === "number" &&
    typeof candidate.eligible === "boolean" &&
    (candidate.jobTitle === null || typeof candidate.jobTitle === "string") &&
    (candidate.disabledReason === null || typeof candidate.disabledReason === "string");
}

function parseCandidates(value: unknown): SummaryReportCandidate[] | null {
  if (!value || typeof value !== "object") return null;
  const candidates = (value as Record<string, unknown>).candidates;
  return Array.isArray(candidates) && candidates.every(isCandidate) ? candidates : null;
}

function disabledReasonLabel(reason: SummaryReportCandidate["disabledReason"]) {
  switch (reason) {
    case "WRONG_FAMILY":
      return "Wrong assessment family";
    case "WRONG_ORGANIZATION":
      return "Wrong organization";
    case "INCOMPATIBLE_VERSION":
      return "Incompatible version";
    default:
      return "Unavailable";
  }
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function sourceCandidate(
  candidates: Map<string, SummaryReportCandidate>,
  id: string | null,
) {
  return id ? candidates.get(id) ?? null : null;
}

export function SummaryReportWizard({
  open,
  onClose,
  onSuccess,
  campaignId,
  campaignName,
  assessmentName,
  implementedTypes,
}: SummaryReportWizardProps) {
  const [draft, setDraft] = useState<ScalingCeoFullDraft>({
    step: "TYPE",
    reportType: null,
    scope: "current",
    selectedIds: [],
    ceoSubmissionId: null,
    teamSubmissionIds: [],
    creationRequestId: "",
  });
  const [candidates, setCandidates] = useState<SummaryReportCandidate[]>([]);
  const candidateCache = useRef(new Map<string, SummaryReportCandidate>());
  const scopeCache = useRef(new Map<string, SummaryReportCandidate[]>());
  const candidateRequestId = useRef(0);
  const createRequestInFlight = useRef(false);
  const wasOpen = useRef(open);
  const [candidateState, setCandidateState] = useState<"idle" | "loading" | "error">("idle");
  const [createState, setCreateState] = useState<CreateState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && (!wasOpen.current || !draft.creationRequestId)) {
      candidateCache.current = new Map();
      scopeCache.current = new Map();
      setCandidates([]);
      setDraft(newDraft());
      setCandidateState("idle");
      setCreateState("idle");
      createRequestInFlight.current = false;
      setError(null);
    }
    wasOpen.current = open;
  }, [draft.creationRequestId, open]);

  useEffect(() => {
    if (!open || draft.step !== "COMPOSITION" || !draft.reportType) return;
    const reportType = draft.reportType;
    const scopeKey = `${campaignId}:${reportType}:${draft.scope}`;
    const cached = scopeCache.current.get(scopeKey);
    if (cached) {
      setCandidates(cached);
      setCandidateState("idle");
      return;
    }
    const controller = new AbortController();
    const requestId = ++candidateRequestId.current;
    setCandidateState("loading");
    setError(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/assessment-campaigns/${encodeURIComponent(campaignId)}/summary-reports/candidates?type=${encodeURIComponent(reportType)}&scope=${draft.scope}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Unable to load report sources");
        const body = await response.json();
        if (controller.signal.aborted || requestId !== candidateRequestId.current) return;
        const parsed = parseCandidates(body);
        if (!parsed) throw new Error("Malformed report sources");
        parsed.forEach((candidate) => candidateCache.current.set(candidate.submissionId, candidate));
        scopeCache.current.set(scopeKey, parsed);
        setCandidates(parsed);
        setCandidateState("idle");
      } catch (requestError) {
        if (controller.signal.aborted || requestId !== candidateRequestId.current) return;
        setCandidateState("error");
        setError(requestError instanceof Error ? requestError.message : "Unable to load report sources");
      }
    })();
    return () => controller.abort();
  }, [campaignId, draft.reportType, draft.scope, draft.step, open]);

  const allCandidates = candidateCache.current;
  const ceo = sourceCandidate(allCandidates, draft.ceoSubmissionId);
  const team = draft.teamSubmissionIds
    .map((id) => sourceCandidate(allCandidates, id))
    .filter((candidate): candidate is SummaryReportCandidate => candidate !== null);
  const canReview = draft.reportType === "SCALING_CEO_FULL" && ceo !== null;
  const frozen = createState === "submitting" || createState === "ambiguous";

  function updateDraft(update: (value: ScalingCeoFullDraft) => ScalingCeoFullDraft) {
    if (!frozen) setDraft(update);
  }

  function close() {
    if (createState === "submitting") return;
    onClose();
  }

  function toggleSelection(id: string) {
    updateDraft((value) => ({
      ...value,
      selectedIds: value.selectedIds.includes(id)
        ? value.selectedIds.filter((selectedId) => selectedId !== id)
        : [...value.selectedIds, id],
      ceoSubmissionId: value.ceoSubmissionId === id ? null : value.ceoSubmissionId,
      teamSubmissionIds: value.teamSubmissionIds.filter((teamId) => teamId !== id),
    }));
  }

  function assignCeo(id: string) {
    updateDraft((value) => ({
      ...value,
      ceoSubmissionId: id,
      teamSubmissionIds: value.teamSubmissionIds.filter((teamId) => teamId !== id),
    }));
  }

  function assignTeam(id: string) {
    updateDraft((value) => ({
      ...value,
      ceoSubmissionId: value.ceoSubmissionId === id ? null : value.ceoSubmissionId,
      teamSubmissionIds: value.teamSubmissionIds.includes(id)
        ? value.teamSubmissionIds
        : [...value.teamSubmissionIds, id],
    }));
  }

  function moveTeam(id: string, direction: -1 | 1) {
    updateDraft((value) => {
      const index = value.teamSubmissionIds.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= value.teamSubmissionIds.length) return value;
      const teamSubmissionIds = [...value.teamSubmissionIds];
      [teamSubmissionIds[index], teamSubmissionIds[target]] = [teamSubmissionIds[target], teamSubmissionIds[index]];
      return { ...value, teamSubmissionIds };
    });
  }

  async function create() {
    if (!draft.reportType || !ceo || createState === "submitting" || createRequestInFlight.current) return;
    createRequestInFlight.current = true;
    setCreateState("submitting");
    setError(null);
    const sources = [
      { submissionId: ceo.submissionId, sourceCampaignId: ceo.campaignId, role: "CEO", position: 0 },
      ...team.map((candidate, position) => ({
        submissionId: candidate.submissionId,
        sourceCampaignId: candidate.campaignId,
        role: "TEAM",
        position,
      })),
    ];
    const body = JSON.stringify({
      reportType: draft.reportType,
      creationRequestId: draft.creationRequestId,
      sources,
    });
    try {
      const response = await fetch(
        `/api/assessment-campaigns/${encodeURIComponent(campaignId)}/summary-reports`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body },
      );
      const responseBody = await response.json().catch(() => null);
      if (response.ok) {
        createRequestInFlight.current = false;
        onSuccess();
        onClose();
        return;
      }
      if (response.status === 422) {
        createRequestInFlight.current = false;
        setCreateState("idle");
        setError(
          responseBody && typeof responseBody === "object" && typeof (responseBody as Record<string, unknown>).error === "string"
            ? (responseBody as Record<string, string>).error
            : "Please correct the composition and try again.",
        );
        return;
      }
      setCreateState("ambiguous");
      createRequestInFlight.current = false;
      setError("We could not confirm whether this report was created. Retry this exact request, or close and reopen to start a new report.");
    } catch {
      setCreateState("ambiguous");
      createRequestInFlight.current = false;
      setError("We could not confirm whether this report was created. Retry this exact request, or close and reopen to start a new report.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) close(); }}>
      <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create summary report</DialogTitle>
          <DialogDescription>{campaignName} · {assessmentName}</DialogDescription>
        </DialogHeader>

        {draft.step === "TYPE" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Choose a report type.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {implementedTypes.map((type) => (
                <button
                  key={type.type}
                  type="button"
                  aria-label={type.label}
                  className={`rounded-lg border p-4 text-left transition-colors ${draft.reportType === type.type ? "border-primary bg-primary/5" : "hover:bg-accent"}`}
                  onClick={() => updateDraft((value) => ({ ...value, reportType: type.type === "SCALING_CEO_FULL" ? type.type : null }))}
                >
                  <span className="block font-semibold text-foreground">{type.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{type.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {draft.step === "COMPOSITION" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Source campaign scope">
              <Button variant={draft.scope === "current" ? "default" : "outline"} size="sm" disabled={frozen} onClick={() => updateDraft((value) => ({ ...value, scope: "current" }))}>Current campaign</Button>
              <Button variant={draft.scope === "all" ? "default" : "outline"} size="sm" disabled={frozen} onClick={() => updateDraft((value) => ({ ...value, scope: "all" }))}>All campaigns</Button>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>{ceo ? `CEO: ${ceo.respondentName}` : "CEO: Choose exactly one CEO"}</p>
              <p>Team: {team.length ? team.map((candidate) => candidate.respondentName).join(", ") : "None selected"}</p>
            </div>
            {candidateState === "loading" && <p className="text-sm text-muted-foreground">Loading report sources…</p>}
            {candidateState === "error" && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="space-y-3">
              {candidates.map((candidate) => {
                const selected = draft.selectedIds.includes(candidate.submissionId);
                const isCeo = draft.ceoSubmissionId === candidate.submissionId;
                const isTeam = draft.teamSubmissionIds.includes(candidate.submissionId);
                const unavailable = !candidate.eligible;
                const suffix = candidate.submissionId.slice(-8);
                return (
                  <Card key={candidate.submissionId} className={unavailable ? "opacity-60" : ""}>
                    <CardHeader className="space-y-1 p-4">
                      <CardTitle className="text-base">{candidate.respondentName}</CardTitle>
                      <CardDescription>{candidate.jobTitle ?? "No job title"} · {candidate.organizationName}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4 pt-0">
                      <p className="text-sm text-muted-foreground">{candidate.campaignName} · Scaling Up · v{candidate.versionNumber} · {shortDate(candidate.submittedAt)}</p>
                      <p className="text-xs text-muted-foreground">Submission …{suffix}</p>
                      {unavailable ? (
                        <Button variant="outline" size="sm" disabled aria-label={`${candidate.respondentName} ${disabledReasonLabel(candidate.disabledReason)}`}>{disabledReasonLabel(candidate.disabledReason)}</Button>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" disabled={frozen} onClick={() => toggleSelection(candidate.submissionId)}>{selected ? `Remove ${candidate.respondentName}` : `Select ${candidate.respondentName}`}</Button>
                          {selected && <>
                            <Button variant={isCeo ? "default" : "outline"} size="sm" disabled={frozen} onClick={() => assignCeo(candidate.submissionId)}>{isCeo ? `${candidate.respondentName} is CEO` : `Assign ${candidate.respondentName} as CEO`}</Button>
                            <Button variant={isTeam ? "default" : "outline"} size="sm" disabled={frozen} onClick={() => assignTeam(candidate.submissionId)}>{isTeam ? `${candidate.respondentName} is Team` : `Assign ${candidate.respondentName} as Team`}</Button>
                          </>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {draft.step === "REVIEW" && ceo && (
          <div className="space-y-4">
            <Card><CardContent className="space-y-2 p-4 text-sm">
              <p className="font-semibold">{campaignName} — Scaling CEO Full</p>
              <p>Destination: {campaignName}</p>
              <p>Assessment/version: {ceo.templateAlias} · v{ceo.versionNumber} · {ceo.language}</p>
              <p>CEO: {ceo.respondentName}</p>
              <p>Team count: {team.length}</p>
              {team.length > 0 && <ol className="list-decimal pl-5">{team.map((candidate, index) => <li key={candidate.submissionId} className="flex items-center gap-2">{candidate.respondentName} <Button size="sm" variant="ghost" disabled={frozen || index === 0} onClick={() => moveTeam(candidate.submissionId, -1)}>Move up</Button><Button size="sm" variant="ghost" disabled={frozen || index === team.length - 1} onClick={() => moveTeam(candidate.submissionId, 1)}>Move down</Button></li>)}</ol>}
            </CardContent></Card>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter className="sticky bottom-0 border-t bg-card pt-4 sm:justify-between">
          <Button variant="ghost" disabled={createState === "submitting"} onClick={draft.step === "TYPE" ? close : () => { setError(null); setCreateState("idle"); updateDraft((value) => ({ ...value, step: value.step === "REVIEW" ? "COMPOSITION" : "TYPE" })); }}>{draft.step === "TYPE" ? "Cancel" : "Back"}</Button>
          {draft.step === "TYPE" && <Button disabled={!draft.reportType} onClick={() => updateDraft((value) => ({ ...value, step: "COMPOSITION" }))}>Next</Button>}
          {draft.step === "COMPOSITION" && <Button disabled={!canReview || frozen} onClick={() => updateDraft((value) => ({ ...value, step: "REVIEW" }))}>Review</Button>}
          {draft.step === "REVIEW" && <Button disabled={!canReview || createState === "submitting"} onClick={create}>{createState === "submitting" ? "Creating…" : createState === "ambiguous" ? "Retry" : "Create report"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
