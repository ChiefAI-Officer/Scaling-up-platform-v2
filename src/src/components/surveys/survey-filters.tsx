"use client";

/**
 * ENH-MAY6-9: Aggregator filters mirroring Financials.
 *
 * URL search-params-driven coach/category/format/date-range/group-by controls
 * for /admin/surveys/aggregate. Pattern lifted from components/financials/
 * financial-filters.tsx.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface CoachOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface SurveyFiltersProps {
  coaches: CoachOption[];
  categories: CategoryOption[];
}

const FORMAT_OPTIONS = ["VIRTUAL", "IN_PERSON", "HYBRID"] as const;
const GROUP_BY_OPTIONS = [
  { value: "", label: "None" },
  { value: "coach", label: "By Coach" },
  { value: "category", label: "By Category" },
  { value: "format", label: "By Format" },
  { value: "workshopType", label: "By Workshop Type" },
] as const;

export function SurveyFilters({ coaches, categories }: SurveyFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const coachId = searchParams.get("coachId") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const workshopFormat = searchParams.get("workshopFormat") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  const groupBy = searchParams.get("groupBy") || "";

  const buildUrl = useCallback(
    (overrides: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(overrides)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      return `/admin/surveys/aggregate?${params.toString()}`;
    },
    [searchParams],
  );

  const handleChange = (key: string, value: string) => {
    router.push(buildUrl({ [key]: value }));
  };

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    ["coachId", "categoryId", "workshopFormat", "startDate", "endDate", "groupBy"].forEach((k) =>
      params.delete(k),
    );
    router.push(`/admin/surveys/aggregate?${params.toString()}`);
  };

  const hasActiveFilter = !!(
    coachId || categoryId || workshopFormat || startDate || endDate || groupBy
  );

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Coach</label>
        <select
          value={coachId}
          onChange={(e) => handleChange("coachId", e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All Coaches</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Category</label>
        <select
          value={categoryId}
          onChange={(e) => handleChange("categoryId", e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Format</label>
        <select
          value={workshopFormat}
          onChange={(e) => handleChange("workshopFormat", e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All Formats</option>
          {FORMAT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">From</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => handleChange("startDate", e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">To</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => handleChange("endDate", e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Group by</label>
        <select
          value={groupBy}
          onChange={(e) => handleChange("groupBy", e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          {GROUP_BY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilter && (
        <button
          onClick={clearFilters}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
