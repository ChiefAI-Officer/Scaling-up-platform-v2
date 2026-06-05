"use client";

/**
 * Esperto historical import — admin workflow client (Slice 7c).
 *
 * Drives POST /api/admin/assessments/import (already built). Two kinds:
 *   - "roster"  → people. Requires an owning coach + a company name.
 *   - "results" → past answers. Org is resolved server-side by member-id join,
 *                 so no coach/company fields are shown.
 *
 * Two-step gate (staging-first): Preview (mode:"preview", no writes) then
 * Commit (mode:"commit"). Commit is enabled ONLY after a successful preview
 * that carries zero blocks. Blocks are surfaced prominently (role="alert") and
 * keep Commit disabled. Everything renders defensively — a missing count or
 * array never crashes the panel.
 *
 * Brand-neutral admin theme (no .su-assessment-brand / participant purple).
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

type ImportKind = "roster" | "results";

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
  /** True only if the preview succeeded and carries zero blocks. */
  committable: boolean;
}

interface CommitState {
  counts: Record<string, unknown>;
}

const IMPORT_URL = "/api/admin/assessments/import";

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

export function EspertoImportClient() {
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

  // ── Request / result state ────────────────────────────────────────────
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverBlocks, setServerBlocks] = useState<PlanIssue[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [commitResult, setCommitResult] = useState<CommitState | null>(null);

  const inFlight = previewLoading || commitLoading;

  // Fetch coaches on mount (roster picker source).
  useEffect(() => {
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
  }, []);

  function resetResults() {
    setPreview(null);
    setCommitResult(null);
    setServerError(null);
    setServerBlocks([]);
  }

  function switchKind(next: ImportKind) {
    if (next === kind) return;
    setKind(next);
    resetResults();
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

  const canPreview = useMemo(() => {
    if (!payload || inFlight) return false;
    if (kind === "roster") {
      return !!ownerCoachId && !!companyName.trim();
    }
    return true;
  }, [payload, inFlight, kind, ownerCoachId, companyName]);

  function buildBody(mode: "preview" | "commit") {
    const body: Record<string, unknown> = { mode, kind, payload };
    if (kind === "roster") {
      body.ownerCoachId = ownerCoachId;
      body.companyName = companyName.trim();
    }
    return body;
  }

  async function runPreview() {
    resetResults();
    setPreviewLoading(true);
    try {
      const res = await fetch(IMPORT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody("preview")),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setServerError(
          (json && extractErrorText(json.error)) ||
            `Preview failed (HTTP ${res.status})`,
        );
        setServerBlocks(asArray(json?.blocks));
        return;
      }
      const data = (json.data ?? {}) as Record<string, unknown>;
      const summary = (data.summary ?? {}) as Record<string, unknown>;
      const plan = (data.plan ?? {}) as Record<string, unknown>;
      const blocks = asArray(plan.blocks);
      // Results-plan blocks can also live on nested campaigns — defensively merge.
      const skips = asArray(plan.skips);
      setPreview({
        summary,
        skips,
        blocks,
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
      const res = await fetch(IMPORT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody("commit")),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        // Keep the preview panel open on failure so the operator sees context.
        setServerError(
          (json && extractErrorText(json.error)) ||
            `Commit failed (HTTP ${res.status})`,
        );
        setServerBlocks(asArray(json?.blocks));
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
          </div>
        </CardContent>
      </Card>

      {/* ── Inputs ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Provide the export</CardTitle>
          <CardDescription>
            Upload the raw Esperto JSON export
            {kind === "roster"
              ? " (a Members file) and pick the owning coach + company."
              : " (a Report file). The company is matched automatically by member id."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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

          {/* Commit success. */}
          {commitResult ? (
            <div
              role="status"
              className="rounded-md border border-border bg-muted/40 p-3 text-sm"
            >
              <p className="font-medium text-foreground">
                Import committed successfully.
              </p>
              <CountGrid counts={commitResult.counts} />
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
                        {issueText(b)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No blocking issues. You can commit this plan.
                </p>
              )}

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
