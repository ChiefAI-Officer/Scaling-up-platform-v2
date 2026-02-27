"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="bg-card rounded-xl shadow-sm border border-border p-8 max-w-md text-center">
        <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-destructive text-xl">!</span>
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Failed to load dashboard data. This may be a temporary issue.
        </p>
        {process.env.NODE_ENV === "development" && (
          <p className="text-xs text-destructive mb-4 font-mono break-all">
            {error.message}
          </p>
        )}
        <button
          onClick={reset}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
