"use client";

/**
 * Admin assessment templates list.
 *
 * WF14 restyle (May 21 2026): paste-and-swap from
 * src/public/wireframes-phase2/admin/14-admin-templates-list.html
 * Real data fetch + delete handler preserved from prior version.
 * All classNames use the .wf-scope CSS (imported in the lane layout).
 */

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

interface TemplateRow {
  id: string;
  name: string;
  alias: string;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  // Optional extra fields the wireframe shows — fall back to safe defaults
  // when not present in the API response.
  accessMode?: "INVITED" | "PUBLIC";
  versionCount?: number;
  activeVersionPublishedAt?: string | null;
  status?: "ACTIVE" | "PENDING" | "DRAFT";
  /**
   * Wave Q item #6 — soft-DISABLE marker (distinct from soft-delete). Set ⇒
   * hidden from the new-campaign picker; existing campaigns/reports keep
   * working. Optional defensively for payloads predating the Wave Q API.
   */
  disabledAt?: string | null;
}

export function AssessmentTemplatesList({
  waveQEnabled = false,
}: {
  /**
   * Wave Q — gates the Enable/Disable row action (the WRITE capability).
   * Server-computed (`isWaveQAdminControlsEnabled()`) and passed down from
   * the page. The `Disabled` badge is NOT gated — persisted admin intent
   * stays visible even when the flag is off (spec 19q durable rule).
   */
  waveQEnabled?: boolean;
} = {}) {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { toast } = useToast();

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/assessment-templates");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { success: boolean; data: TemplateRow[] };
      setRows(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleDelete(row: TemplateRow) {
    const confirmed = window.confirm(
      `Soft-delete template "${row.name}"? This is reversible by clearing deletedAt in the DB.`,
    );
    if (!confirmed) return;
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/admin/assessment-templates/${row.id}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.error === "TEMPLATE_HAS_ACTIVE_CAMPAIGNS") {
          toast({
            title: "Cannot delete",
            description: "Close all active campaigns on this template first.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast({ title: "Template deleted" });
      await reload();
    } catch (e) {
      toast({
        title: "Could not delete template",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  }

  // Wave Q item #6 — flag-gated Enable/Disable row action. Disable hides the
  // template from new-campaign setup only (running campaigns/reports keep
  // working — no active-campaign guard by design); Enable reverses it.
  async function handleToggleDisabled(row: TemplateRow) {
    const disabling = !row.disabledAt;
    if (disabling) {
      const confirmed = window.confirm(
        `Disable template "${row.name}"? Hidden from new-campaign setup. Existing campaigns and reports are not affected.`,
      );
      if (!confirmed) return;
    }
    setTogglingId(row.id);
    try {
      const res = await fetch(`/api/admin/assessment-templates/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: disabling }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 403 = the Wave Q server flag is off (or was killed) — the write
        // capability is gated even if this UI rendered from a stale page.
        if (res.status === 403) {
          toast({
            title: disabling
              ? "Cannot disable template"
              : "Cannot enable template",
            description:
              "Admin template controls are not enabled on the server.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast({
        title: disabling ? "Template disabled" : "Template enabled",
        description: disabling
          ? "It no longer appears when setting up a new campaign."
          : "It appears again when setting up a new campaign.",
      });
      await reload();
    } catch (e) {
      toast({
        title: disabling
          ? "Could not disable template"
          : "Could not enable template",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setTogglingId(null);
    }
  }

  // Stats computed from rows
  const stats = useMemo(() => {
    const invitedActive = rows.filter(
      (r) => (r.accessMode ?? "INVITED") === "INVITED" && (r.status ?? "ACTIVE") === "ACTIVE",
    ).length;
    const publicActive = rows.filter(
      (r) => r.accessMode === "PUBLIC" && (r.status ?? "ACTIVE") === "ACTIVE",
    ).length;
    const drafts = rows.filter((r) => r.status === "DRAFT").length;
    return {
      total: rows.length,
      invitedActive,
      publicActive,
      drafts,
    };
  }, [rows]);

  return (
    <>
      {/* Page header + primary CTA — WF14 lines 482-498 */}
      <div className="wf-page-header-row">
        <div>
          <h2 className="wf-page-title">Assessment Templates</h2>
          <p className="wf-page-subtitle-strong">
            Catalogue of templates available for campaign creation. Per-coach
            access managed at <em>Admin › Assessments › Access Groups</em>.
          </p>
        </div>
        <div className="wf-cta-stack">
          <Link
            href="/admin/assessments/templates/new"
            className="wf-btn wf-btn-primary"
            data-testid="new-template-btn"
          >
            + Create Template
          </Link>
        </div>
      </div>

      {/* Stats row — WF14 lines 501-518 */}
      <div className="wf-stats-row">
        <div className="wf-stat-card">
          <span className="wf-stat-label">Total Templates</span>
          <span className="wf-stat-value">{loading ? "…" : stats.total}</span>
        </div>
        <div className="wf-stat-card">
          <span className="wf-stat-label">INVITED (active)</span>
          <span className="wf-stat-value">{loading ? "…" : stats.invitedActive}</span>
        </div>
        <div className="wf-stat-card">
          <span className="wf-stat-label">PUBLIC (active)</span>
          <span className="wf-stat-value">{loading ? "…" : stats.publicActive}</span>
        </div>
        <div className="wf-stat-card">
          <span className="wf-stat-label">Drafts</span>
          <span className="wf-stat-value">{loading ? "…" : stats.drafts}</span>
        </div>
      </div>

      {/* Templates table — WF14 lines 521-635 */}
      <div className="wf-table-wrap">
        {loading ? (
          <div style={{ padding: "3rem 1.5rem", textAlign: "center" }} className="wf-text-muted wf-text-sm">
            Loading templates…
          </div>
        ) : error ? (
          <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "hsl(var(--destructive))" }} className="wf-text-sm">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "3rem 1.5rem", textAlign: "center" }} className="wf-text-muted wf-text-sm">
            No templates yet. Click <strong>Create Template</strong> to add one.
          </div>
        ) : (
          <table className="wf-table">
            <thead>
              <tr>
                <th>Template Name</th>
                <th>Access Mode</th>
                <th>Aggregation</th>
                <th>Versions</th>
                <th>Active Version Published</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const accessMode = row.accessMode ?? "INVITED";
                const status = row.status ?? "ACTIVE";
                const versionCount = row.versionCount ?? 1;
                const publishedAt = row.activeVersionPublishedAt
                  ? new Date(row.activeVersionPublishedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—";
                return (
                  <tr key={row.id} data-testid={`template-row-${row.id}`}>
                    <td>
                      <Link
                        href={`/admin/assessments/templates/${row.id}`}
                        className="wf-table-name wf-action-link"
                        style={{ textDecoration: "none" }}
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td>
                      {accessMode === "PUBLIC" ? (
                        <span className="wf-pill wf-pill-access-public">PUBLIC</span>
                      ) : (
                        <span className="wf-pill wf-pill-access-invited">INVITED</span>
                      )}
                    </td>
                    <td>
                      {row.aggregationMode === "CEO_ONLY" ? (
                        <span className="wf-pill wf-pill-agg-ceo">CEO_ONLY</span>
                      ) : (
                        <span className="wf-pill wf-pill-agg-full">FULL_VISIBILITY</span>
                      )}
                    </td>
                    <td>
                      <span className="wf-table-meta">
                        v{versionCount} ({versionCount} total)
                      </span>
                    </td>
                    <td>
                      <span className="wf-table-meta">{publishedAt}</span>
                    </td>
                    <td>
                      {status === "PENDING" ? (
                        <span className="wf-pill-status-pending">⏳ Pending</span>
                      ) : status === "DRAFT" ? (
                        <span className="wf-version-pill-draft">Draft</span>
                      ) : (
                        <span className="wf-pill-status-active">● Active</span>
                      )}
                      {/* Wave Q (#6) — always shown when the row carries the
                          persisted disable marker (not flag-gated). */}
                      {row.disabledAt && (
                        <span
                          className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[0.625rem] font-semibold uppercase tracking-wider bg-muted text-muted-foreground"
                          data-testid={`disabled-badge-${row.id}`}
                        >
                          Disabled
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className="wf-actions">
                        {/* Jul-8 roadmap #2 — "View" removed: it linked to the
                            same editor URL as the row name + "Edit" (3 controls,
                            1 destination). The template NAME is now the open
                            affordance; "Edit" stays as the explicit verb. */}
                        <Link
                          href={`/admin/assessments/access-groups`}
                          className="wf-action-link"
                        >
                          Access ↗
                        </Link>
                        <span className="wf-action-sep">·</span>
                        <Link
                          href={`/admin/assessments/templates/${row.id}`}
                          className="wf-action-link"
                        >
                          Edit
                        </Link>
                        {/* Wave Q (#6) — Enable/Disable is the flag-gated
                            write capability; existing actions stay as-is. */}
                        {waveQEnabled && (
                          <>
                            <span className="wf-action-sep">·</span>
                            <button
                              type="button"
                              onClick={() => handleToggleDisabled(row)}
                              disabled={togglingId !== null || deletingId !== null}
                              className="wf-action-link"
                              data-testid={`toggle-disabled-${row.id}`}
                              aria-label={
                                row.disabledAt
                                  ? `Enable ${row.name}`
                                  : `Disable ${row.name}`
                              }
                            >
                              {row.disabledAt ? "Enable" : "Disable"}
                            </button>
                          </>
                        )}
                        <span className="wf-action-sep">·</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          disabled={deletingId !== null}
                          className="wf-action-link-destructive"
                          data-testid={`delete-template-${row.id}`}
                          aria-label={`Soft-delete ${row.name}`}
                        >
                          Delete
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
