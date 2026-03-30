"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type TemplateValue = "SOLO_LANDING" | "DUO_LANDING" | "REGISTRATION" | "THANK_YOU";

interface Candidate {
  id: string;
  template: TemplateValue;
  status: string;
  slug: string;
  workshopId: string;
  workshopTitle: string;
  workshopCode: string;
  categoryId: string | null;
  isActiveTemplate: boolean;
  updatedAt: string;
}

interface ActivateTemplateModalProps {
  template: TemplateValue;
  categoryId: string | null;
  categoryName: string;
  templateLabel: string;
  hasGlobalFallback: boolean;
}

export function ActivateTemplateModal({
  template,
  categoryId,
  categoryName,
  templateLabel,
  hasGlobalFallback,
}: ActivateTemplateModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activateErrors, setActivateErrors] = useState<Record<string, string>>({});

  async function fetchCandidates() {
    setLoading(true);
    setFetchError(null);
    setCandidates(null);
    try {
      const url =
        `/api/landing-pages/library?template=${template}&activeOnly=false` +
        (categoryId ? `&categoryId=${categoryId}` : "");
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFetchError(json.error ?? "Failed to load candidates.");
      } else {
        setCandidates(json.data as Candidate[]);
      }
    } catch {
      setFetchError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      fetchCandidates();
    } else {
      // Reset state on close
      setCandidates(null);
      setFetchError(null);
      setActivatingId(null);
      setActivateErrors({});
    }
  }

  async function handleActivate(page: Candidate) {
    setActivatingId(page.id);
    setActivateErrors((prev) => {
      const next = { ...prev };
      delete next[page.id];
      return next;
    });

    try {
      const body: { isActiveTemplate: boolean; categoryId?: string | null } = {
        isActiveTemplate: true,
      };

      // If the page is global and we're activating it for a specific category,
      // re-scope it to that category.
      if (page.categoryId === null && categoryId !== null) {
        body.categoryId = categoryId;
      }

      const res = await fetch(`/api/landing-pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setActivateErrors((prev) => ({
          ...prev,
          [page.id]: json.error ?? "Activation failed.",
        }));
      } else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setActivateErrors((prev) => ({
        ...prev,
        [page.id]: "Network error — please try again.",
      }));
    } finally {
      setActivatingId(null);
    }
  }

  const triggerClassName = hasGlobalFallback
    ? "inline-flex items-center justify-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
    : "inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer";

  const triggerLabel = hasGlobalFallback ? "Set Override" : "Set Template";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className={triggerClassName}>{triggerLabel}</button>
      </DialogTrigger>

      <DialogContent aria-describedby={undefined} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {hasGlobalFallback ? "Set Category Override" : "Set Template"} — {templateLabel}
          </DialogTitle>
        </DialogHeader>

        {categoryId && (
          <p className="text-sm text-muted-foreground -mt-2">
            Activating for category: <span className="font-semibold text-foreground">{categoryName}</span>
          </p>
        )}

        <div className="mt-1">
          {/* Loading state */}
          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {/* Fetch error */}
          {!loading && fetchError && (
            <div className="py-4 text-center space-y-3">
              <p className="text-sm text-destructive">{fetchError}</p>
              <button
                onClick={fetchCandidates}
                className="text-sm text-primary underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !fetchError && candidates !== null && candidates.length === 0 && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              No inactive landing pages available for this template type. Go to a workshop&apos;s
              landing page editor and toggle &quot;Auto-Build&quot; off to make a page available
              here.
            </p>
          )}

          {/* Candidates list */}
          {!loading && !fetchError && candidates !== null && candidates.length > 0 && (
            <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
              {candidates.map((page) => (
                <div
                  key={page.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground truncate">
                        {page.workshopTitle}
                      </span>
                      <span className="text-xs text-muted-foreground">{page.workshopCode}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={page.categoryId === null ? "secondary" : "outline"} className="text-xs">
                        {page.categoryId === null ? "All Categories" : "Category"}
                      </Badge>
                      <Badge
                        variant={page.status === "PUBLISHED" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {page.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(page.updatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    {page.categoryId === null && categoryId !== null && (
                      <p className="text-xs text-muted-foreground italic">
                        Will be scoped to {categoryName}
                      </p>
                    )}

                    {activateErrors[page.id] && (
                      <p className="text-xs text-destructive">{activateErrors[page.id]}</p>
                    )}
                  </div>

                  <button
                    onClick={() => handleActivate(page)}
                    disabled={activatingId === page.id}
                    className="shrink-0 inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer"
                  >
                    {activatingId === page.id ? "Activating…" : "Activate"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
