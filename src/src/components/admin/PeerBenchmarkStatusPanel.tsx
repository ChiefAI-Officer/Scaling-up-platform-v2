"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type {
  PeerBenchmarkAuditSnapshot,
  PeerBenchmarkEvidence,
  PeerBenchmarkReadiness,
} from "@/lib/assessments/peer-benchmark-audit";

const READINESS: Record<
  PeerBenchmarkReadiness,
  { label: string; className: string; explanation: string }
> = {
  dark: {
    label: "Currently dark",
    className: "bg-muted text-muted-foreground",
    explanation:
      "The effective runtime gate is dark. This does not identify which flag input caused it.",
  },
  blocked: {
    label: "Blocked",
    className: "bg-muted text-muted-foreground",
    explanation: "A required template or published-question prerequisite is absent.",
  },
  noData: {
    label: "No benchmark data",
    className: "bg-muted text-muted-foreground",
    explanation: "No stored benchmark rows match active rating questions.",
  },
  partialData: {
    label: "Partial benchmark data",
    className: "bg-warning/10 text-warning-foreground",
    explanation: "Only some active rating questions have stored benchmark rows.",
  },
  ready: {
    label: "Ready",
    className: "bg-success/10 text-success",
    explanation: "Every active rating question has a stored benchmark row.",
  },
  unknown: {
    label: "Unknown",
    className: "bg-warning/10 text-warning-foreground",
    explanation: "One or more required evidence sources could not be read.",
  },
};

function evidenceText<T>(
  evidence: PeerBenchmarkEvidence<T>,
  known: (value: T) => string,
): string {
  if (evidence.state === "known") return known(evidence.value);
  if (evidence.state === "missing") return "Missing";
  if (evidence.state === "notApplicable") return "Not applicable";
  return "Unknown";
}

export function PeerBenchmarkStatusPanel(): React.JSX.Element {
  const [data, setData] = useState<PeerBenchmarkAuditSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/admin/assessments/peer-benchmark-status",
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as {
        success: boolean;
        data?: PeerBenchmarkAuditSnapshot;
      };
      if (!body.success || !body.data) throw new Error("Invalid response");
      setData(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">
          Loading LVA peer benchmark status…
        </div>
        <PrivacyNote />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <div className="px-6 py-12 text-center text-sm text-destructive">
          Peer benchmark status failed: {error ?? "Failed to load"}
        </div>
        <PrivacyNote />
      </div>
    );
  }

  const readiness = READINESS[data.readiness];
  const gate = evidenceText(data.effectiveGate, (value) =>
    value === "enabled" ? "Enabled" : "Dark",
  );
  const template = evidenceText(data.template, () => "Present");
  const activeVersion = evidenceText(
    data.activeVersion,
    (value) => `v${value.versionNumber} · ${value.language}`,
  );
  const ratingQuestions = evidenceText(
    data.activeVersion,
    (value) => `${value.ratingQuestionCount} rating questions`,
  );
  const stored = evidenceText(
    data.storedBenchmarks,
    (value) => value.storedRowCount.toLocaleString(),
  );
  const coverage = evidenceText(
    data.keyCoverage,
    (value) =>
      `${value.matchingRowCount} matching · ` +
      `${value.missingRatingQuestionCount} missing · ` +
      `${value.staleRowCount} stale`,
  );

  return (
    <section
      className="space-y-4"
      data-testid="peer-benchmark-status-panel"
      aria-labelledby="peer-benchmark-status-heading"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2
            id="peer-benchmark-status-heading"
            className="text-lg font-bold text-foreground"
          >
            LVA peer benchmark status
          </h2>
          <p className="text-xs text-muted-foreground">
            Generated {new Date(data.generatedAt).toLocaleString()}.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          data-testid="refresh-peer-benchmark-status"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="status">
          Peer benchmark status failed: {error}
        </p>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${readiness.className}`}
          data-testid="peer-benchmark-readiness"
        >
          {readiness.label}
        </span>
        <p className="mt-2 text-sm text-muted-foreground">
          {readiness.explanation}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <EvidenceCard
          label="Effective capability"
          value={gate}
          testId="peer-benchmark-effective-gate"
        />
        <EvidenceCard label="LVA template" value={template} />
        <EvidenceCard
          label="Active version"
          value={activeVersion}
          testId="peer-benchmark-active-version"
        />
        <EvidenceCard label="Rating questions" value={ratingQuestions} />
        <EvidenceCard
          label="Stored benchmark rows"
          value={stored}
          testId="peer-benchmark-stored-count"
        />
      </div>

      <div
        className="rounded-lg border border-border bg-card/50 px-4 py-3 text-sm text-foreground"
        data-testid="peer-benchmark-coverage"
      >
        <span className="font-semibold">Active-key coverage:</span> {coverage}
      </div>

      {data.keyCoverage.state === "known" &&
        data.keyCoverage.value.staleRowCount > 0 && (
          <p className="text-sm text-warning-foreground">
            {data.keyCoverage.value.staleRowCount.toLocaleString()} stale{" "}
            {data.keyCoverage.value.staleRowCount === 1 ? "row" : "rows"} does
            not match an active rating question.
          </p>
        )}

      <PrivacyNote />
    </section>
  );
}

function PrivacyNote(): React.JSX.Element {
  return (
    <p className="text-xs text-muted-foreground">
      Underlying environment inputs and peer values are not displayed.
    </p>
  );
}

function EvidenceCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}): React.JSX.Element {
  return (
    <div
      className="rounded-lg border border-border bg-card/50 px-4 py-3"
      data-testid={testId}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}
