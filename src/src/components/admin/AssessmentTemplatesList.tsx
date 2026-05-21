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
}

export function AssessmentTemplatesList() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className="wf-actions">
                        <Link
                          href={`/admin/assessments/templates/${row.id}`}
                          className="wf-action-link"
                        >
                          View
                        </Link>
                        <span className="wf-action-sep">·</span>
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
