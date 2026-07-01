"use client";

/**
 * Esperto historical import — workflow client (Slice 7c + Wave O).
 *
 * Drives the Esperto import endpoint. Three kinds:
 *   - "roster"  → people. Requires a company name (+ an owning coach in admin).
 *   - "results" → past answers. Org is resolved server-side by member-id join,
 *                 so no coach/company fields are shown.
 *   - "restrictedResults" → Wave O historical SU-Full import from a BATCH of
 *     restricted-individual export files against an EXPLICIT target org (never
 *     inferred). Gated by the `suFullImportEnabled` prop — dark by default;
 *     when false this kind option does not render and the component behaves
 *     exactly as it did before Wave O.
 *
 * Two variants:
 *   - "admin" (default): renders an owning-coach picker (fetched from
 *     /api/coaches) and POSTs to /api/admin/assessments/import with ownerCoachId.
 *   - "coach": NO coach picker (the owning coach is the logged-in user, resolved
 *     server-side) and POSTs to /api/assessments/import with NO ownerCoachId.
 *
 * Two-step gate (staging-first): Preview (mode:"preview", no writes) then
 * Commit (mode:"commit"). Commit is enabled ONLY after a successful preview
 * that carries zero blocks. Blocks are surfaced prominently (role="alert") and
 * keep Commit disabled. Everything renders defensively — a missing count or
 * array never crashes the panel.
 *
 * Brand-neutral theme (no .su-assessment-brand / participant purple).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ImportKind = "roster" | "results" | "restrictedResults";

/** The exact roundLabel length cap the server enforces (restricted-plan.ts's MAX_ROUND_LABEL_LENGTH) — mirrored here ONLY for a client-side hint, not full validation. */
const MAX_ROUND_LABEL_LENGTH = 64;

interface Organization {
  id: string;
  name?: string | null;
}

/** One multi-file slot's client-side parse state (Wave O restrictedResults). */
interface LoadedFile {
  filename: string;
  payload: unknown;
  parseError: string | null;
}

/** The outcome shape `commitRestrictedImport` returns, echoed by the route. */
interface RestrictedOutcome {
  kind?: "created" | "reused-noop" | "reused-appended";
  submissionsCreated?: number;
  [k: string]: unknown;
}

interface Coach {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  name?: string | null;
}

/** A skip/block row from either plan shape — render defensively. */
interface PlanIssue {
  reason?: string;
  message?: string;
  code?: string;
  email?: string;
  externalId?: string;
  memberid?: string;
  name?: string;
  [k: string]: unknown;
}

interface PreviewState {
  /** Counts pulled out of the response `summary`/`data`, defensively. */
  summary: Record<string, unknown>;
  skips: PlanIssue[];
  blocks: PlanIssue[];
  /** restrictedResults-only: `summary.warnings` — amber, non-blocking. */
  warnings: PlanIssue[];
  /** True only if the preview succeeded and carries zero blocks. */
  committable: boolean;
}

interface CommitState {
  counts: Record<string, unknown>;
  /** restrictedResults-only: the RestrictedCommitOutcome + inspected-not-imported count. */
  outcome?: RestrictedOutcome;
  skippedArtifacts?: number;
}

export type EspertoImportVariant = "admin" | "coach";

function coachLabel(c: Coach): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  if (name) return c.email ? `${name} (${c.email})` : name;
  return c.name || c.email || c.id;
}

/** Strip a trailing _Members suffix + file extension for a friendlier default. */
function companyFromFilename(filename: string): string {
  let base = filename.replace(/\.[^.]+$/, "");
  base = base.replace(/[_\s-]*members$/i, "");
  return base.trim();
}

function asArray(v: unknown): PlanIssue[] {
  return Array.isArray(v) ? (v as PlanIssue[]) : [];
}

/** Read a File as UTF-8 text via FileReader (jsdom-friendly; no File.text()). */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

function issueText(issue: PlanIssue): string {
  const id =
    issue.email || issue.externalId || issue.memberid || issue.name || "";
  const why = issue.reason || issue.message || issue.code || "";
  if (id && why) return `${id} — ${why}`;
  return why || id || JSON.stringify(issue);
}

/** A restricted-batch block/warning's `{reason, detail}` shape — render both, PII-free by backend design. */
function restrictedIssueText(issue: PlanIssue): string {
  const reason = issue.reason || issue.code || "";
  const detail = (issue as { detail?: string }).detail || issue.message || "";
  if (reason && detail) return `${reason} — ${detail}`;
  return detail || reason || JSON.stringify(issue);
}

/** Plain-language message for each RestrictedCommitOutcome.kind variant. */
function outcomeMessage(outcome: RestrictedOutcome): string {
  const count = typeof outcome.submissionsCreated === "number"
    ? outcome.submissionsCreated
    : 0;
  switch (outcome.kind) {
    case "created":
      return `Created a new imported round with ${count} submission${count === 1 ? "" : "s"}.`;
    case "reused-noop":
      return "This round was already imported — nothing changed.";
    case "reused-appended":
      return `Added ${count} new respondent${count === 1 ? "" : "s"} to an existing round.`;
    default:
      return "Import committed successfully.";
  }
}

/** Map a RestrictedCommitError HTTP body (`error` is the error CODE for this path) to a specific, human message. */
function restrictedCommitErrorMessage(json: {
  error?: unknown;
  message?: unknown;
} | null): string | null {
  if (!json) return null;
  const code = typeof json.error === "string" ? json.error : "";
  const message = typeof json.message === "string" ? json.message : "";
  const knownCodes: Record<string, string> = {
    "plan-blocked": "The plan has blocking issues — fix the export before committing.",
    "entitlement-denied": "Not authorized to create a campaign for this template.",
    "org-not-found": "Target organization not found or no longer accessible.",
    "cid-mismatch": "This batch's cid does not match the organization's previously imported SU-Full batch.",
    "low-resolution-batch": "This batch covers a small share of the organization's roster.",
    "version-changed-since-preview": "The template version changed since preview — run Preview again.",
    "divergent-reimport": "This batch conflicts with a previously imported round.",
    "externalId-conflict": "This round's identifier conflicts with an existing campaign.",
  };
  if (message) return message;
  if (code && knownCodes[code]) return knownCodes[code];
  return null;
}

export function EspertoImportClient({
  variant = "admin",
  suFullImportEnabled = false,
}: {
  variant?: EspertoImportVariant;
  suFullImportEnabled?: boolean;
} = {}) {
  const isCoach = variant === "coach";
  const apiPath = isCoach
    ? "/api/assessments/import"
    : "/api/admin/assessments/import";

  const [kind, setKind] = useState<ImportKind>("roster");

  // ── File / payload state ──────────────────────────────────────────────
  const [payload, setPayload] = useState<unknown>(null);
  const [filename, setFilename] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Roster-only fields ────────────────────────────────────────────────
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [coachesError, setCoachesError] = useState<string | null>(null);
  const [ownerCoachId, setOwnerCoachId] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");

  // ── restrictedResults-only fields (Wave O SU-Full) ─────────────────────
  const [roundLabel, setRoundLabel] = useState<string>("");
  const [targetOrgId, setTargetOrgId] = useState<string>("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsError, setOrganizationsError] = useState<string | null>(
    null,
  );
  const [organizationsFetched, setOrganizationsFetched] = useState(false);
  const [restrictedFiles, setRestrictedFiles] = useState<LoadedFile[]>([]);
  const [aggregateFiles, setAggregateFiles] = useState<LoadedFile[]>([]);
  const [ackLowResolution, setAckLowResolution] = useState(false);
  const [lowResolutionRetryAvailable, setLowResolutionRetryAvailable] =
    useState(false);

  // ── Request / result state ────────────────────────────────────────────
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverBlocks, setServerBlocks] = useState<PlanIssue[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [commitResult, setCommitResult] = useState<CommitState | null>(null);
  const [resolvedVersionId, setResolvedVersionId] = useState<string | null>(
    null,
  );

  const inFlight = previewLoading || commitLoading;

  // Fetch coaches on mount (roster picker source) — admin variant only.
  // In the coach variant the owning coach is the logged-in user (resolved
  // server-side), so there is no picker and we never touch /api/coaches.
  useEffect(() => {
    if (isCoach) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/coaches?pageSize=200");
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.success && Array.isArray(json.data)) {
          setCoaches(json.data as Coach[]);
        } else {
          setCoachesError(
            (json && (json.error as string)) || "Failed to load coaches",
          );
        }
      } catch {
        if (!cancelled) setCoachesError("Failed to load coaches");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCoach]);

  // Fetch organizations on mount when the restrictedResults kind is selected
  // — only once, cached in state (mirrors the coaches fetch above). Not
  // fetched at all unless/until this kind is chosen, since it's gated dark
  // by default.
  useEffect(() => {
    if (kind !== "restrictedResults" || organizationsFetched) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/organizations");
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        setOrganizationsFetched(true);
        if (res.ok && json?.success && Array.isArray(json.data)) {
          setOrganizations(json.data as Organization[]);
        } else {
          setOrganizationsError(
            (json && (json.error as string)) || "Failed to load organizations",
          );
        }
      } catch {
        if (!cancelled) {
          setOrganizationsFetched(true);
          setOrganizationsError("Failed to load organizations");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, organizationsFetched]);

  function resetResults() {
    setPreview(null);
    setCommitResult(null);
    setServerError(null);
    setServerBlocks([]);
    setResolvedVersionId(null);
    setAckLowResolution(false);
    setLowResolutionRetryAvailable(false);
  }

  /** Reset ALL restrictedResults batch-specific state (B3). */
  function resetRestrictedBatchState() {
    setRoundLabel("");
    setTargetOrgId("");
    setRestrictedFiles([]);
    setAggregateFiles([]);
  }

  function switchKind(next: ImportKind) {
    if (next === kind) return;
    setKind(next);
    resetResults();
    // Switching AWAY FROM or TO restrictedResults must fully reset its
    // batch-specific state, whichever direction the switch goes (B3).
    if (kind === "restrictedResults" || next === "restrictedResults") {
      resetRestrictedBatchState();
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    resetResults();
    setParseError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setPayload(null);
      setFilename("");
      return;
    }
    setFilename(file.name);
    try {
      const text = await readFileText(file);
      const parsed = JSON.parse(text);
      setPayload(parsed);
      if (kind === "roster" && !companyName.trim()) {
        const guess = companyFromFilename(file.name);
        if (guess) setCompanyName(guess);
      }
    } catch {
      setPayload(null);
      setParseError(
        `Could not parse "${file.name}" as JSON. Export a raw Esperto JSON file.`,
      );
    }
  }

  /** Parse every selected file as JSON — mirrors onFileChange's single-file pattern, extended to N files. */
  async function parseFileList(fileList: FileList): Promise<LoadedFile[]> {
    const files = Array.from(fileList);
    return Promise.all(
      files.map(async (file) => {
        try {
          const text = await readFileText(file);
          const parsed = JSON.parse(text);
          return { filename: file.name, payload: parsed, parseError: null };
        } catch {
          return {
            filename: file.name,
            payload: null,
            parseError: `Could not parse "${file.name}" as JSON. Export a raw Esperto JSON file.`,
          };
        }
      }),
    );
  }

  async function onRestrictedFilesChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    resetResults();
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      setRestrictedFiles([]);
      return;
    }
    setRestrictedFiles(await parseFileList(fileList));
  }

  async function onAggregateFilesChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    resetResults();
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      setAggregateFiles([]);
      return;
    }
    setAggregateFiles(await parseFileList(fileList));
  }

  const roundLabelError = useMemo(() => {
    if (kind !== "restrictedResults") return null;
    const trimmed = roundLabel.trim();
    if (!trimmed) return null; // emptiness is handled by disabling Preview, not an inline error
    if (trimmed.length > MAX_ROUND_LABEL_LENGTH) {
      return `Round label is too long (max ${MAX_ROUND_LABEL_LENGTH} characters).`;
    }
    return null;
  }, [kind, roundLabel]);

  const restrictedFilesHaveError = restrictedFiles.some((f) => f.parseError);
  const aggregateFilesHaveError = aggregateFiles.some((f) => f.parseError);

  const canPreview = useMemo(() => {
    if (inFlight) return false;
    if (kind === "roster") {
      if (!payload) return false;
      // Admin must also pick an owning coach; for a coach it's implicit.
      const coachReady = isCoach ? true : !!ownerCoachId;
      return coachReady && !!companyName.trim();
    }
    if (kind === "restrictedResults") {
      const labelReady =
        !!roundLabel.trim() &&
        roundLabel.trim().length <= MAX_ROUND_LABEL_LENGTH;
      return (
        labelReady &&
        !!targetOrgId &&
        restrictedFiles.length > 0 &&
        !restrictedFilesHaveError &&
        !aggregateFilesHaveError
      );
    }
    return !!payload;
  }, [
    payload,
    inFlight,
    kind,
    ownerCoachId,
    companyName,
    isCoach,
    roundLabel,
    targetOrgId,
    restrictedFiles,
    restrictedFilesHaveError,
    aggregateFilesHaveError,
  ]);

  function buildBody(mode: "preview" | "commit") {
    if (kind === "restrictedResults") {
      const body: Record<string, unknown> = {
        mode,
        kind,
        batchKind: "esperto-sufull-restricted-v1",
        roundLabel: roundLabel.trim(),
        targetOrgId,
        files: restrictedFiles.map((f) => f.payload),
      };
      if (aggregateFiles.length > 0) {
        body.aggregateFiles = aggregateFiles.map((f) => f.payload);
      }
      if (mode === "commit") {
        body.expectedVersionId = resolvedVersionId;
        if (ackLowResolution) body.ackLowResolution = true;
      }
      return body;
    }
    const body: Record<string, unknown> = { mode, kind, payload };
    if (kind === "roster") {
      body.companyName = companyName.trim();
      // ownerCoachId is admin-only — the coach route derives it server-side.
      if (!isCoach) {
        body.ownerCoachId = ownerCoachId;
      }
    }
    return body;
  }

  async function runPreview() {
    resetResults();
    setPreviewLoading(true);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody("preview")),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        if (kind === "restrictedResults") {
          setServerError(
            restrictedCommitErrorMessage(json) ||
              `Preview failed (HTTP ${res.status})`,
          );
          return;
        }
        setServerError(
          (json && extractErrorText(json.error)) ||
            `Preview failed (HTTP ${res.status})`,
        );
        setServerBlocks(asArray(json?.blocks));
        return;
      }
      const data = (json.data ?? {}) as Record<string, unknown>;
      const summary = (data.summary ?? {}) as Record<string, unknown>;
      if (kind === "restrictedResults") {
        const blocks = asArray(summary.blocks);
        const warnings = asArray(summary.warnings);
        setResolvedVersionId(
          typeof data.resolvedVersionId === "string"
            ? data.resolvedVersionId
            : null,
        );
        setPreview({
          summary,
          skips: [],
          blocks,
          warnings,
          committable: blocks.length === 0,
        });
        return;
      }
      const plan = (data.plan ?? {}) as Record<string, unknown>;
      const blocks = asArray(plan.blocks);
      // Results-plan blocks can also live on nested campaigns — defensively merge.
      const skips = asArray(plan.skips);
      setPreview({
        summary,
        skips,
        blocks,
        warnings: [],
        committable: blocks.length === 0,
      });
    } catch {
      setServerError("Preview request failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runCommit() {
    setServerError(null);
    setServerBlocks([]);
    setCommitResult(null);
    setCommitLoading(true);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody("commit")),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        if (kind === "restrictedResults") {
          const code = typeof json?.error === "string" ? json.error : "";
          setLowResolutionRetryAvailable(code === "low-resolution-batch");
          setServerError(
            restrictedCommitErrorMessage(json) ||
              `Commit failed (HTTP ${res.status})`,
          );
          return;
        }
        // Keep the preview panel open on failure so the operator sees context.
        setServerError(
          (json && extractErrorText(json.error)) ||
            `Commit failed (HTTP ${res.status})`,
        );
        setServerBlocks(asArray(json?.blocks));
        return;
      }
      if (kind === "restrictedResults") {
        const data = (json.data ?? {}) as Record<string, unknown>;
        setCommitResult({
          counts: {},
          outcome: (data.outcome ?? {}) as RestrictedOutcome,
          skippedArtifacts:
            typeof data.skippedArtifacts === "number"
              ? data.skippedArtifacts
              : 0,
        });
        return;
      }
      setCommitResult({ counts: (json.data ?? {}) as Record<string, unknown> });
    } catch {
      setServerError("Commit request failed");
    } finally {
      setCommitLoading(false);
    }
  }

  const commitEnabled =
    !!preview && preview.committable && !commitResult && !inFlight;

  return (
    <div className="space-y-6">
      {/* ── Mode switch ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What are you importing?</CardTitle>
          <CardDescription>
            Roster brings people into a company roster. Results backfills past
            answers for people who already exist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="radiogroup"
            aria-label="Import kind"
            className="inline-flex rounded-lg border border-border p-1"
          >
            <ModeButton
              active={kind === "roster"}
              onClick={() => switchKind("roster")}
            >
              Roster (people)
            </ModeButton>
            <ModeButton
              active={kind === "results"}
              onClick={() => switchKind("results")}
            >
              Results (past answers)
            </ModeButton>
            {suFullImportEnabled ? (
              <ModeButton
                active={kind === "restrictedResults"}
                onClick={() => switchKind("restrictedResults")}
              >
                SU-Full (historical)
              </ModeButton>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ── Inputs ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Provide the export</CardTitle>
          <CardDescription>
            {kind === "restrictedResults"
              ? "Upload the restricted-individual export files for one round, name the round, and choose the organization they belong to."
              : (
                <>
                  Upload the raw Esperto JSON export
                  {kind === "roster"
                    ? isCoach
                      ? " (a Members file) and name the company it belongs to."
                      : " (a Members file) and pick the owning coach + company."
                    : " (a Report file). The company is matched automatically by member id."}
                </>
              )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {kind === "restrictedResults" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="round-label">Round label</Label>
                <Input
                  id="round-label"
                  value={roundLabel}
                  onChange={(e) => {
                    setRoundLabel(e.target.value);
                    resetResults();
                  }}
                  placeholder='e.g. "2025 Annual", "Year 1"'
                />
                <p className="text-xs text-muted-foreground">
                  Names this import round (e.g. &quot;2025 Annual&quot;,
                  &quot;Year 1&quot;) — used to tell repeated rounds apart.
                </p>
                {roundLabelError ? (
                  <p className="text-xs text-destructive">{roundLabelError}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-org">Target organization</Label>
                <select
                  id="target-org"
                  value={targetOrgId}
                  onChange={(e) => {
                    setTargetOrgId(e.target.value);
                    resetResults();
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select an organization…</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name || o.id}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  The company these historical results belong to. Chosen
                  explicitly — never guessed from the file contents.
                </p>
                {organizationsError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {organizationsError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="restricted-files">Individual files</Label>
                <input
                  id="restricted-files"
                  type="file"
                  multiple
                  accept="application/json"
                  onChange={onRestrictedFilesChange}
                  className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70"
                />
                {restrictedFiles.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {restrictedFiles.length} file
                    {restrictedFiles.length === 1 ? "" : "s"} loaded
                  </p>
                ) : null}
                {restrictedFiles.length > 0 ? (
                  <ul role="list" className="space-y-1">
                    {restrictedFiles.map((f, i) => (
                      <li key={i} role="listitem" className="text-sm">
                        {f.parseError ? (
                          <span role="alert" className="text-destructive">
                            {f.parseError}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {f.filename}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="aggregate-files">
                  Aggregate export (optional, not required)
                </Label>
                <input
                  id="aggregate-files"
                  type="file"
                  multiple
                  accept="application/json"
                  onChange={onAggregateFilesChange}
                  className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70"
                />
                <p className="text-xs text-muted-foreground">
                  If you also have the cohort/aggregate export, you can attach
                  it — it&apos;s inspected but never imported; the group view
                  is always recomputed from individuals.
                </p>
                {aggregateFiles.length > 0 ? (
                  <ul role="list" className="space-y-1">
                    {aggregateFiles.map((f, i) => (
                      <li key={i} role="listitem" className="text-sm">
                        {f.parseError ? (
                          <span role="alert" className="text-destructive">
                            {f.parseError}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {f.filename}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="esperto-file">Esperto export (JSON)</Label>
                <input
                  ref={fileInputRef}
                  id="esperto-file"
                  type="file"
                  accept="application/json"
                  onChange={onFileChange}
                  className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70"
                />
                {filename && !parseError ? (
                  <p className="text-sm text-muted-foreground" data-testid="filename">
                    Loaded:{" "}
                    <span className="font-medium text-foreground">{filename}</span>
                  </p>
                ) : null}
                {parseError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {parseError}
                  </p>
                ) : null}
              </div>

              {kind === "roster" ? (
                <>
                  {!isCoach ? (
                    <div className="space-y-2">
                      <Label htmlFor="owner-coach">Owning coach</Label>
                      <select
                        id="owner-coach"
                        value={ownerCoachId}
                        onChange={(e) => {
                          setOwnerCoachId(e.target.value);
                          resetResults();
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Select a coach…</option>
                        {coaches.map((c) => (
                          <option key={c.id} value={c.id}>
                            {coachLabel(c)}
                          </option>
                        ))}
                      </select>
                      {coachesError ? (
                        <p role="alert" className="text-sm text-destructive">
                          {coachesError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="company-name">Company name</Label>
                    <Input
                      id="company-name"
                      value={companyName}
                      onChange={(e) => {
                        setCompanyName(e.target.value);
                        resetResults();
                      }}
                      placeholder="Acme Corp"
                    />
                    <p className="text-xs text-muted-foreground">
                      Pre-filled from the filename; edit to match the existing
                      company exactly.
                    </p>
                  </div>
                </>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Preview, then commit</CardTitle>
          <CardDescription>
            Preview is read-only. Commit only unlocks after a clean preview with
            no blocking issues.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={runPreview} disabled={!canPreview}>
              {previewLoading ? "Previewing…" : "Preview"}
            </Button>
            <Button
              variant="default"
              onClick={runCommit}
              disabled={!commitEnabled}
            >
              {commitLoading ? "Committing…" : "Commit"}
            </Button>
          </div>

          {/* Server error (non-2xx) + any returned blocks. */}
          {serverError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <p className="font-medium">{serverError}</p>
              {serverBlocks.length > 0 ? (
                <ul role="list" className="mt-2 space-y-1">
                  {serverBlocks.map((b, i) => (
                    <li key={i} role="listitem" className="font-mono text-xs">
                      {issueText(b)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* low-resolution-batch 409 on commit — offer an explicit acknowledgment + retry, never predicted at preview time. */}
          {kind === "restrictedResults" && lowResolutionRetryAvailable ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={ackLowResolution}
                  onChange={(e) => setAckLowResolution(e.target.checked)}
                />
                Proceed anyway
              </label>
              <div>
                <Button
                  variant="outline"
                  onClick={runCommit}
                  disabled={!ackLowResolution || inFlight}
                >
                  Retry with acknowledgment
                </Button>
              </div>
            </div>
          ) : null}

          {/* Commit success. */}
          {commitResult ? (
            <div
              role="status"
              className="rounded-md border border-border bg-muted/40 p-3 text-sm"
            >
              {kind === "restrictedResults" ? (
                <>
                  <p className="font-medium text-foreground">
                    {outcomeMessage(commitResult.outcome ?? {})}
                  </p>
                  {(commitResult.skippedArtifacts ?? 0) > 0 ? (
                    <p className="mt-1 text-muted-foreground">
                      {commitResult.skippedArtifacts} aggregate file(s) were
                      inspected but not imported.
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="font-medium text-foreground">
                    Import committed successfully.
                  </p>
                  <CountGrid counts={commitResult.counts} />
                </>
              )}
            </div>
          ) : null}

          {/* Preview panel. */}
          {preview ? (
            <div
              className="space-y-4 rounded-md border border-border p-4"
              data-testid="preview-panel"
            >
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Preview plan
                </h3>
                <CountGrid counts={preview.summary} />
              </div>

              {preview.blocks.length > 0 ? (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 p-3"
                >
                  <p className="text-sm font-medium text-destructive">
                    {preview.blocks.length} blocking issue
                    {preview.blocks.length === 1 ? "" : "s"} — fix the export
                    before committing.
                  </p>
                  <ul role="list" className="mt-2 space-y-1">
                    {preview.blocks.map((b, i) => (
                      <li
                        key={i}
                        role="listitem"
                        className="font-mono text-xs text-destructive"
                      >
                        {kind === "restrictedResults"
                          ? restrictedIssueText(b)
                          : issueText(b)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No blocking issues. You can commit this plan.
                </p>
              )}

              {kind === "restrictedResults" && preview.warnings.length > 0 ? (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
                  <p className="text-sm font-medium text-warning-foreground">
                    {preview.warnings.length} warning
                    {preview.warnings.length === 1 ? "" : "s"}
                  </p>
                  <ul role="list" className="mt-2 space-y-1">
                    {preview.warnings.map((w, i) => (
                      <li
                        key={i}
                        role="listitem"
                        className="font-mono text-xs text-warning-foreground"
                      >
                        {restrictedIssueText(w)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.skips.length > 0 ? (
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    Skipped ({preview.skips.length})
                  </h4>
                  <ul role="list" className="mt-1 space-y-1">
                    {preview.skips.map((s, i) => (
                      <li
                        key={i}
                        role="listitem"
                        className="font-mono text-xs text-muted-foreground"
                      >
                        {issueText(s)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={
        "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
        (active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

/** Render whatever numeric/string counts a summary or commit result carries. */
function CountGrid({ counts }: { counts: Record<string, unknown> }) {
  const entries = Object.entries(counts ?? {}).filter(
    ([, v]) => typeof v === "number" || typeof v === "string",
  );
  if (entries.length === 0) {
    return (
      <p className="mt-1 text-sm text-muted-foreground">No counts returned.</p>
    );
  }
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline justify-between gap-2">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {key}
          </dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The API returns `error` as a string OR a Zod issue array — flatten safely. */
function extractErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (Array.isArray(error)) {
    return error
      .map((e) =>
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : String(e),
      )
      .join("; ");
  }
  return "";
}
