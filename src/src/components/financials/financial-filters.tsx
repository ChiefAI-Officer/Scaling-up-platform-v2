"use client";

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

interface FinancialFiltersProps {
  coaches: CoachOption[];
  categories: CategoryOption[];
}

export function FinancialFilters({ coaches, categories }: FinancialFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const period = searchParams.get("period") || "month";
  const coachId = searchParams.get("coachId") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

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
      return `/admin/financials?${params.toString()}`;
    },
    [searchParams]
  );

  const handleChange = (key: string, value: string) => {
    // When switching to a preset period, clear custom dates
    if (key === "period" && value !== "custom") {
      router.push(buildUrl({ [key]: value, startDate: "", endDate: "" }));
    } else {
      router.push(buildUrl({ [key]: value }));
    }
  };

  const handleDateChange = (key: string, value: string) => {
    // When using custom dates, switch to "custom" period
    router.push(buildUrl({ [key]: value, period: "custom" }));
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Period Presets */}
      <div className="flex gap-1.5">
        {(["month", "quarter", "year", "all"] as const).map((p) => (
          <button
            key={p}
            onClick={() => handleChange("period", p)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              period === p
                ? "bg-blue-600 text-white"
                : "bg-card border border-border text-foreground hover:bg-accent"
            }`}
          >
            {p === "month" ? "Monthly" : p === "quarter" ? "Quarterly" : p === "year" ? "Annual" : "All Time"}
          </button>
        ))}
      </div>

      {/* Coach Filter */}
      <div>
        <label htmlFor="coachFilter" className="block text-xs font-medium text-muted-foreground mb-1">
          Coach
        </label>
        <select
          id="coachFilter"
          value={coachId}
          onChange={(e) => handleChange("coachId", e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Coaches</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
        </select>
      </div>

      {/* Category Filter */}
      <div>
        <label htmlFor="categoryFilter" className="block text-xs font-medium text-muted-foreground mb-1">
          Category
        </label>
        <select
          id="categoryFilter"
          value={categoryId}
          onChange={(e) => handleChange("categoryId", e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date Range */}
      <div>
        <label htmlFor="startDate" className="block text-xs font-medium text-muted-foreground mb-1">
          From
        </label>
        <input
          id="startDate"
          type="date"
          value={startDate}
          onChange={(e) => handleDateChange("startDate", e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="endDate" className="block text-xs font-medium text-muted-foreground mb-1">
          To
        </label>
        <input
          id="endDate"
          type="date"
          value={endDate}
          onChange={(e) => handleDateChange("endDate", e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
        />
      </div>

      {/* Clear Filters */}
      {(coachId || categoryId || startDate || endDate) && (
        <button
          onClick={() => router.push(`/admin/financials?period=${period === "custom" ? "month" : period}`)}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
