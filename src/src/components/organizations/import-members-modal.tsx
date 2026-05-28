"use client";

/**
 * ImportMembersModal — bulk CSV import of respondents into one organization.
 *
 * Calls POST /api/organizations/[id]/respondents/bulk with the pre-parsed rows
 * and the chosen conflict-resolution mode (skip / merge).
 *
 * Mirrors AddMemberModal / AddTeamModal conventions exactly:
 *   - Dialog + DialogDescription for a11y
 *   - submitting guard, setError(null) reset on open/attempt
 *   - res.ok && json.success checks
 *   - Array.isArray(json.error) ? json.error[0]?.message : ... unwrap
 *   - awaitable onUpdated() awaited BEFORE onClose()
 *
 * PROPS
 * ─────
 * open        — controls visibility
 * onClose     — called when modal should close (cancel or after success + display)
 * onUpdated   — awaitable callback; called after a successful import so the
 *               caller can refresh the member list
 * orgId       — the organization whose /respondents/bulk endpoint we post to
 * orgName     — displayed in the dialog title for context
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  parseRespondentCsv,
  type ParsedRow,
  type ParseError,
} from "@/lib/assessments/respondent-csv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConflictMode = "skip" | "merge";

interface ImportResult {
  created: Array<{ id: string; email: string }>;
  updated: Array<{ id: string; email: string }>;
  skipped: Array<{ email: string }>;
  errors:  Array<{ row: number; reason: string }>;
}

export interface ImportMembersModalProps {
  open:      boolean;
  onClose:   () => void;
  onUpdated: () => void | Promise<void>;
  orgId:     string;
  orgName:   string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PREVIEW_ROW_LIMIT = 10;
const ERROR_DISPLAY_LIMIT = 5;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportMembersModal({
  open,
  onClose,
  onUpdated,
  orgId,
  orgName,
}: ImportMembersModalProps) {
  // --------------------------------------------------------------------------
  // Form state
  // --------------------------------------------------------------------------

  const [csvText,    setCsvText]    = useState("");
  const [mode,       setMode]       = useState<ConflictMode>("skip");

  // Submission / result state
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [result,     setResult]     = useState<ImportResult | null>(null);

  // --------------------------------------------------------------------------
  // Reset state on open/close
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (open) {
      setCsvText("");
      setMode("skip");
      setError(null);
      setResult(null);
    }
  }, [open]);

  // --------------------------------------------------------------------------
  // Live parse
  // --------------------------------------------------------------------------

  const { rows, errors: parseErrors } = useMemo<{ rows: ParsedRow[]; errors: ParseError[] }>(
    () => {
      if (!csvText.trim()) return { rows: [], errors: [] };
      return parseRespondentCsv(csvText);
    },
    [csvText]
  );

  const canImport = rows.length > 0 && parseErrors.length === 0 && !submitting && result === null;

  // --------------------------------------------------------------------------
  // Submit
  // --------------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (!canImport) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/respondents/bulk`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ rows, mode }),
      });

      const json = await res.json() as {
        success: boolean;
        data?: ImportResult;
        error?: unknown;
      };

      if (!res.ok || !json.success) {
        const errMsg = Array.isArray(json.error)
          ? ((json.error as Array<{ message?: string }>)[0]?.message ?? "Import failed. Please try again.")
          : typeof json.error === "string"
          ? json.error
          : "Import failed. Please try again.";
        setError(errMsg);
        return;
      }

      // Success — show summary, then notify + close after brief display
      const importResult = json.data!;
      setResult(importResult);
      await onUpdated();

      // Give the user ~1.5 s to read the summary, then close
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [canImport, orgId, rows, mode, onUpdated, onClose]);

  // --------------------------------------------------------------------------
  // Derived display values
  // --------------------------------------------------------------------------

  const previewRows  = rows.slice(0, PREVIEW_ROW_LIMIT);
  const shownErrors  = parseErrors.slice(0, ERROR_DISPLAY_LIMIT);
  const hiddenErrors = parseErrors.length - shownErrors.length;

  const importBtnLabel = (() => {
    if (submitting)     return "Importing…";
    if (rows.length > 0) return `Import ${rows.length} respondent${rows.length === 1 ? "" : "s"}`;
    return "Import";
  })();

  const importTotal = result
    ? result.created.length + result.updated.length
    : 0;

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import members — {orgName}</DialogTitle>
          <DialogDescription>
            Paste a CSV with one member per row. Required headers:{" "}
            <code className="text-xs bg-muted px-1 rounded">name</code>,{" "}
            <code className="text-xs bg-muted px-1 rounded">email</code>
            {" "}— plus optional{" "}
            <code className="text-xs bg-muted px-1 rounded">team</code>{" "}
            (use <code className="text-xs bg-muted px-1 rounded">/</code> to
            separate nested paths, e.g.{" "}
            <code className="text-xs bg-muted px-1 rounded">Engineering/Frontend</code>).
            <br />
            Example:{" "}
            <code className="text-xs bg-muted px-1 rounded">
              Alice Smith,alice@company.com,Engineering/Frontend
            </code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ---------------------------------------------------------------- */}
          {/* Paste area                                                        */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-1.5">
            <Label htmlFor="csv-paste-area">CSV data</Label>
            <textarea
              id="csv-paste-area"
              rows={10}
              placeholder={"name,email,team\nAlice Smith,alice@company.com,Engineering\nBob Jones,bob@company.com,"}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              disabled={submitting || result !== null}
              className="w-full font-mono text-xs rounded-md border border-input bg-background px-3 py-2 shadow-sm resize-y ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Live preview summary + table                                      */}
          {/* ---------------------------------------------------------------- */}
          {csvText.trim().length > 0 && (
            <div className="space-y-2">
              {/* Summary line — kept as plain text so test matchers work */}
              <p
                data-testid="csv-parse-summary"
                className="text-sm text-muted-foreground"
              >
                {parseErrors.length > 0
                  ? `Parsed ${rows.length} row${rows.length === 1 ? "" : "s"}, ${parseErrors.length} error${parseErrors.length === 1 ? "" : "s"}.`
                  : `Parsed ${rows.length} row${rows.length === 1 ? "" : "s"}.`}
              </p>

              {/* Parse errors */}
              {parseErrors.length > 0 && (
                <ul className="space-y-1">
                  {shownErrors.map((e, i) => (
                    <li
                      key={i}
                      className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
                    >
                      <span className="font-medium">Row {e.row}:</span>{" "}
                      {e.reason}
                    </li>
                  ))}
                  {hiddenErrors > 0 && (
                    <li className="text-xs text-muted-foreground pl-3">
                      …and {hiddenErrors} more error{hiddenErrors === 1 ? "" : "s"}.
                    </li>
                  )}
                </ul>
              )}

              {/* Preview table (first N rows) */}
              {rows.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Team</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-3 py-1.5 text-foreground">{r.name}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{r.email}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {r.teamPath.length > 0 ? r.teamPath.join(" / ") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > PREVIEW_ROW_LIMIT && (
                    <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                      Showing first {PREVIEW_ROW_LIMIT} of {rows.length} rows.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Conflict mode                                                     */}
          {/* ---------------------------------------------------------------- */}
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-foreground">
              If a member already exists (same email)
            </legend>
            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="conflict-mode"
                  value="skip"
                  checked={mode === "skip"}
                  onChange={() => setMode("skip")}
                  disabled={submitting || result !== null}
                  aria-label="Skip — leave existing untouched"
                />
                Skip — leave existing untouched
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="conflict-mode"
                  value="merge"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                  disabled={submitting || result !== null}
                  aria-label="Merge — update name and team"
                />
                Merge — update name and team
              </label>
            </div>
          </fieldset>

          {/* ---------------------------------------------------------------- */}
          {/* Result summary (post-success)                                     */}
          {/* ---------------------------------------------------------------- */}
          {result !== null && (
            <div className="rounded-md bg-success/10 border border-success/20 px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-success">
                Imported {importTotal}{" "}
                {importTotal === 1 ? "respondent" : "respondents"}.
              </p>
              <p className="text-xs text-muted-foreground">
                {result.created.length} created,{" "}
                {result.updated.length} updated,{" "}
                {result.skipped.length} skipped,{" "}
                {result.errors.length} errors.
              </p>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Inline error (network / server)                                   */}
          {/* ---------------------------------------------------------------- */}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canImport}
          >
            {importBtnLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
