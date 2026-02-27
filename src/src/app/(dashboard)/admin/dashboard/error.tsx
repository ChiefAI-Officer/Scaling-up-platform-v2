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
        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-red-600 dark:text-red-400 text-xl">!</span>
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Failed to load dashboard data. This may be a temporary issue.
        </p>
        {process.env.NODE_ENV === "development" && (
          <p className="text-xs text-red-500 mb-4 font-mono break-all">
            {error.message}
          </p>
        )}
        <button
          onClick={reset}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
