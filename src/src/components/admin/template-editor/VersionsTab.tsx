/**
 * F5 — Versions tab (Checkpoint 4).
 *
 * Lists every version of the template with per-row Edit / Duplicate /
 * Publish actions. Mirrors the existing version-row UI from
 * AssessmentTemplateDetail.tsx (which stays in tree until F7 cleanup).
 *
 * Publish + Duplicate are PARENT-OWNED handlers (TemplateEditorTabbed)
 * so the E1.2 PublishFailureModal stays mounted at the shell and a
 * single source of truth handles the 422 / 409 / 200 paths.
 *
 * Plan: ~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md (F5 section)
 */

"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";

export interface VersionRow {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string | null;
  contentHash: string;
}

export interface VersionsTabProps {
  templateId: string;
  /** The version the operator is currently editing — gets highlight ring. */
  currentVersionId: string;
  versions: VersionRow[];
  /** While a publish request is in flight, all Publish buttons disable. */
  publishingVersionId: string | null;
  /** While a duplicate request is in flight, all Duplicate buttons disable. */
  duplicatingVersionId: string | null;
  onPublish: (versionId: string) => void;
  onDuplicate: (versionId: string) => void;
}

export function VersionsTab({
  templateId,
  currentVersionId,
  versions,
  publishingVersionId,
  duplicatingVersionId,
  onPublish,
  onDuplicate,
}: VersionsTabProps) {
  // Newest first — versionNumber descending.
  const sorted = [...versions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  );

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">
          Version History
        </h3>
        <p className="text-sm text-muted-foreground">
          Each saved version is immutable once published. Duplicate a
          published version to evolve content; the new draft starts from
          that version&apos;s content byte-for-byte.
        </p>
      </header>

      {sorted.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
          No versions yet.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Version
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Language
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Content hash
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((v) => {
                const isCurrent = v.id === currentVersionId;
                const isPublished = v.publishedAt !== null;
                return (
                  <tr
                    key={v.id}
                    data-testid={`version-row-${v.id}`}
                    data-current={isCurrent ? "true" : "false"}
                    className={
                      "hover:bg-muted/30 transition-colors" +
                      (isCurrent ? " ring-2 ring-primary/40 ring-inset" : "")
                    }
                  >
                    <td className="px-4 py-3 text-sm font-medium">
                      v{v.versionNumber}
                      {isCurrent && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground italic">
                          (you are here)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">{v.language}</td>
                    <td className="px-4 py-3 text-xs">
                      {isPublished ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-success/10 text-success ring-1 ring-success/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Published
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-warning/10 text-warning ring-1 ring-warning/20">
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[10px] font-mono text-muted-foreground">
                      {v.contentHash.slice(0, 12)}…
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {!isPublished && (
                          <Link
                            href={`/admin/assessments/templates/${templateId}/versions/${v.id}/edit`}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted"
                            data-testid={`edit-version-${v.id}`}
                          >
                            Edit
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => onDuplicate(v.id)}
                          disabled={duplicatingVersionId !== null}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50"
                          data-testid={`duplicate-version-${v.id}`}
                        >
                          {duplicatingVersionId === v.id && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          )}
                          Duplicate
                        </button>
                        {!isPublished && (
                          <button
                            type="button"
                            onClick={() => onPublish(v.id)}
                            disabled={publishingVersionId !== null}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            data-testid={`publish-version-${v.id}`}
                          >
                            {publishingVersionId === v.id && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            )}
                            Publish
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
