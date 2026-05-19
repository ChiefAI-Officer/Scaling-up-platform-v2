"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface TemplateRow {
  id: string;
  name: string;
  alias: string;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
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
      const res = await fetch("/api/admin/assessments/templates");
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
      const res = await fetch(`/api/admin/assessments/templates/${row.id}`, {
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href="/admin/assessments/templates/new"
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          data-testid="new-template-btn"
        >
          <Plus className="w-4 h-4" />
          New Template
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            Loading templates…
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center text-sm text-destructive">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No templates yet. Click <strong>New Template</strong> to create one.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Name
                </th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Alias
                </th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Aggregation
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-muted/30 transition-colors"
                  data-testid={`template-row-${row.id}`}
                >
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/admin/assessments/templates/${row.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                    {row.alias}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {row.aggregationMode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      disabled={deletingId !== null}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      data-testid={`delete-template-${row.id}`}
                      aria-label={`Soft-delete ${row.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
