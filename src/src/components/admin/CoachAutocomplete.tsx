"use client";

/**
 * CoachAutocomplete — type-ahead picker for the AccessGroup detail
 * "+ Add Coach" dialog.
 *
 * Queries /api/admin/coaches?search=…&excludeGroupId=… and renders the
 * matching coaches in a list. On select, fires onSelect(coachId).
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

interface Coach {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  certificationStatus: string | null;
}

interface Props {
  excludeGroupId?: string;
  onSelect: (coach: Coach) => void;
  placeholder?: string;
}

export function CoachAutocomplete({
  excludeGroupId,
  onSelect,
  placeholder = "Search by name or email…",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (query.trim().length > 0) params.set("search", query.trim());
        if (excludeGroupId) params.set("excludeGroupId", excludeGroupId);
        const res = await fetch(`/api/admin/coaches?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          success: boolean;
          data: Coach[];
        };
        if (!cancelled) setResults(body.data ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, excludeGroupId]);

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
        aria-label="Coach search results"
      >
        {loading && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Searching…
          </div>
        )}
        {error && (
          <div className="px-3 py-2 text-sm text-destructive">{error}</div>
        )}
        {!loading && !error && results.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            No coaches found.
          </div>
        )}
        {!loading &&
          results.map((c) => {
            const name = [c.firstName, c.lastName]
              .filter((s) => s && s.length > 0)
              .join(" ")
              .trim();
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/60 focus:outline-none focus:bg-muted/60"
                role="option"
                aria-selected={false}
              >
                <div className="font-medium text-foreground">
                  {name || "(no name)"}
                </div>
                <div className="text-xs text-muted-foreground">{c.email}</div>
              </button>
            );
          })}
      </div>
    </div>
  );
}
