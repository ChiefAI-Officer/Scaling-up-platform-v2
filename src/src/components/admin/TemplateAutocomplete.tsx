"use client";

/**
 * TemplateAutocomplete — picker for the AccessGroup detail
 * "+ Add Template" dialog. Pulls from /api/admin/assessment-templates
 * (admin scope — bypasses INTERSECTION RBAC).
 */

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

interface TemplateRow {
  id: string;
  name: string;
  alias: string;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
}

interface Props {
  excludeIds?: string[];
  onSelect: (template: TemplateRow) => void;
  placeholder?: string;
}

export function TemplateAutocomplete({
  excludeIds,
  onSelect,
  placeholder = "Search by name or alias…",
}: Props) {
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/assessment-templates");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          success: boolean;
          data: TemplateRow[];
        };
        if (!cancelled) setTemplates(body.data ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
          setTemplates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const excluded = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (excluded.has(t.id)) return false;
      if (q.length === 0) return true;
      return (
        t.name.toLowerCase().includes(q) || t.alias.toLowerCase().includes(q)
      );
    });
  }, [templates, query, excluded]);

  return (
    <div className="space-y-2">
      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus
      />
      <div
        className="max-h-64 overflow-y-auto rounded-md border bg-card"
        role="listbox"
        aria-label="Template search results"
      >
        {loading && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Loading templates…
          </div>
        )}
        {error && (
          <div className="px-3 py-2 text-sm text-destructive">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            No templates found.
          </div>
        )}
        {!loading &&
          filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/60 focus:outline-none focus:bg-muted/60"
              role="option"
              aria-selected={false}
            >
              <div className="font-medium text-foreground">
                {t.name}
                {t.aggregationMode === "CEO_ONLY" && (
                  <span
                    className="ml-1"
                    title="CEO_ONLY aggregation"
                    aria-label="CEO_ONLY aggregation"
                  >
                    👑
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{t.alias}</div>
            </button>
          ))}
      </div>
    </div>
  );
}
