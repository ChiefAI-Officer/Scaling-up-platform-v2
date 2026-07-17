/**
 * F5 — Versions tab (Checkpoint 4).
 *
 * Lists every version of the template with per-row Edit / Duplicate /
 * Publish actions.
 *
 * Publish + Duplicate are PARENT-OWNED handlers (TemplateEditorTabbed)
 * so the E1.2 PublishFailureModal stays mounted at the shell and a
 * single source of truth handles the 422 / 409 / 200 paths.
 *
 * Plan: ~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md (F5 section)
 *
 * Wave ED8 (spec 19ak §2) — when `versionLifecycleEnabled` is true this tab
 * becomes the single lifecycle surface: a Version | Language | Status |
 * Published | Actions table with DERIVED statuses (Active / Superseded /
 * Draft / Archived via `version-lifecycle.ts`), per-status verbs (Roll
 * back… / Archive / Unarchive / Delete), and archived rows collapsed
 * behind an "N archived — Show" toggle. The content-hash column and the
 * "(you are here)" label are gone in that mode. Flag OFF renders the EXACT
 * legacy markup below (byte-identity pinned by T8) — the lifecycle
 * handlers are optional props so pre-ED8 render sites compile unchanged.
 */

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";
import {
  deriveVersionStatuses,
  nextActiveVersionNumber,
  willBecomeActiveOnUnarchive,
  type LifecycleVersionRow,
  type VersionLifecycleStatus,
} from "@/components/admin/template-editor/version-lifecycle";

export interface VersionRow {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string | null;
  contentHash: string;
  /**
   * Wave ED8 (spec 19ak) — ISO string when the version is archived.
   * OPTIONAL (treated as null) so pre-ED8 fixtures/render sites compile
   * unchanged; the legacy flag-OFF branch never reads it.
   */
  archivedAt?: string | null;
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
  /**
   * Wave ED8 (spec 19ak §2) — flips the tab to the lifecycle table. Server-
   * computed (`isVersionLifecycleEnabled()`) and threaded from the edit page
   * via TabbedShell. Default false ⇒ the legacy table renders byte-identically.
   */
  versionLifecycleEnabled?: boolean;
  /** Wave ED8 — while an archive/roll-back is in flight, both verbs disable. */
  archivingVersionId?: string | null;
  /** Wave ED8 — while an unarchive is in flight, all Unarchive buttons disable. */
  unarchivingVersionId?: string | null;
  /** Wave ED8 — while a draft delete is in flight, all Delete buttons disable. */
  deletingVersionId?: string | null;
  /** Wave ED8 — POST /archive. Serves Roll back… (isActive) AND Archive. */
  onArchive?: (
    versionId: string,
    opts: {
      isActive: boolean;
      versionNumber: number;
      nextActiveVersionNumber: number | null;
    },
  ) => void;
  /** Wave ED8 — DELETE /archive (unarchive). */
  onUnarchive?: (
    versionId: string,
    opts: { versionNumber: number; willBecomeActive: boolean },
  ) => void;
  /** Wave ED8 — DELETE the draft version row. */
  onDelete?: (versionId: string, opts: { versionNumber: number }) => void;
}

// House row-action button classes (shared by both branches' buttons).
const actionBtnCls =
  "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50";
const destructiveBtnCls =
  "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border text-destructive hover:bg-destructive/10 disabled:opacity-50";

export function VersionsTab({
  templateId,
  currentVersionId,
  versions,
  publishingVersionId,
  duplicatingVersionId,
  onPublish,
  onDuplicate,
  versionLifecycleEnabled = false,
  archivingVersionId = null,
  unarchivingVersionId = null,
  deletingVersionId = null,
  onArchive,
  onUnarchive,
  onDelete,
}: VersionsTabProps) {
  // Wave ED8 — archived rows are collapsed by default behind a toggle row.
  // Hook must run unconditionally; the legacy branch simply never reads it.
  const [showArchived, setShowArchived] = useState(false);

  // Newest first — versionNumber descending.
  const sorted = [...versions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  );

  if (!versionLifecycleEnabled) {
    // ─── Legacy table (pre-ED8) — byte-identical markup; do not touch. ───
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

  // ─── Wave ED8 lifecycle table (flag ON) ─────────────────────────────────
  const lifecycleRows: LifecycleVersionRow[] = versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    language: v.language,
    publishedAt: v.publishedAt,
    archivedAt: v.archivedAt ?? null,
  }));
  const statuses = deriveVersionStatuses(lifecycleRows);
  const visibleSorted = sorted.filter(
    (v) => statuses.get(v.id) !== "archived",
  );
  const archivedSorted = sorted.filter(
    (v) => statuses.get(v.id) === "archived",
  );

  const renderLifecycleRow = (v: VersionRow) => {
    const status: VersionLifecycleStatus =
      statuses.get(v.id) ?? (v.publishedAt !== null ? "superseded" : "draft");
    const isCurrent = v.id === currentVersionId;
    return (
      <tr
        key={v.id}
        data-testid={`version-row-${v.id}`}
        data-current={isCurrent ? "true" : "false"}
        data-status={status}
        className={
          "hover:bg-muted/30 transition-colors" +
          (isCurrent ? " ring-2 ring-primary/40 ring-inset" : "")
        }
      >
        <td className="px-4 py-3 text-sm font-medium">v{v.versionNumber}</td>
        <td className="px-4 py-3 text-sm font-mono">{v.language}</td>
        <td className="px-4 py-3 text-xs">
          {status === "active" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-success/10 text-success ring-1 ring-success/20">
              <CheckCircle2 className="w-3 h-3" />
              Active
            </span>
          )}
          {status === "superseded" && (
            <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground ring-1 ring-border">
              Superseded
            </span>
          )}
          {status === "draft" && (
            <span className="px-2 py-0.5 rounded bg-warning/10 text-warning ring-1 ring-warning/20">
              Draft
            </span>
          )}
          {status === "archived" && (
            <span className="px-2 py-0.5 rounded bg-muted/60 text-muted-foreground ring-1 ring-border/60">
              Archived
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {v.publishedAt !== null ? formatTimestamp(v.publishedAt) : "—"}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="inline-flex items-center gap-2">
            {status === "draft" && (
              <>
                <Link
                  href={`/admin/assessments/templates/${templateId}/versions/${v.id}/edit`}
                  className={actionBtnCls}
                  data-testid={`edit-version-${v.id}`}
                >
                  Edit
                </Link>
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
                <button
                  type="button"
                  onClick={() =>
                    onDelete?.(v.id, { versionNumber: v.versionNumber })
                  }
                  disabled={deletingVersionId !== null}
                  className={destructiveBtnCls}
                  data-testid={`delete-version-${v.id}`}
                >
                  {deletingVersionId === v.id && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Delete
                </button>
              </>
            )}
            {status === "active" && (
              <button
                type="button"
                onClick={() =>
                  onArchive?.(v.id, {
                    isActive: true,
                    versionNumber: v.versionNumber,
                    nextActiveVersionNumber: nextActiveVersionNumber(
                      lifecycleRows,
                      v.id,
                    ),
                  })
                }
                disabled={archivingVersionId !== null}
                className={actionBtnCls}
                data-testid={`rollback-version-${v.id}`}
              >
                {archivingVersionId === v.id && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Roll back…
              </button>
            )}
            {status === "superseded" && (
              <button
                type="button"
                onClick={() =>
                  onArchive?.(v.id, {
                    isActive: false,
                    versionNumber: v.versionNumber,
                    nextActiveVersionNumber: nextActiveVersionNumber(
                      lifecycleRows,
                      v.id,
                    ),
                  })
                }
                disabled={archivingVersionId !== null}
                className={actionBtnCls}
                data-testid={`archive-version-${v.id}`}
              >
                {archivingVersionId === v.id && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Archive
              </button>
            )}
            {status === "archived" && (
              <button
                type="button"
                onClick={() =>
                  onUnarchive?.(v.id, {
                    versionNumber: v.versionNumber,
                    willBecomeActive: willBecomeActiveOnUnarchive(
                      lifecycleRows,
                      v.id,
                    ),
                  })
                }
                disabled={unarchivingVersionId !== null}
                className={actionBtnCls}
                data-testid={`unarchive-version-${v.id}`}
              >
                {unarchivingVersionId === v.id && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Unarchive
              </button>
            )}
            {status !== "draft" && (
              <button
                type="button"
                onClick={() => onDuplicate(v.id)}
                disabled={duplicatingVersionId !== null}
                className={actionBtnCls}
                data-testid={`duplicate-version-${v.id}`}
              >
                {duplicatingVersionId === v.id && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Duplicate
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

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
                  Published
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleSorted.map(renderLifecycleRow)}
              {archivedSorted.length > 0 && (
                <tr data-testid="archived-versions-toggle-row">
                  <td colSpan={5} className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setShowArchived((s) => !s)}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground"
                      data-testid="toggle-archived-versions"
                      aria-expanded={showArchived}
                    >
                      {archivedSorted.length} archived —{" "}
                      {showArchived ? "Hide" : "Show"}
                    </button>
                  </td>
                </tr>
              )}
              {showArchived && archivedSorted.map(renderLifecycleRow)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
