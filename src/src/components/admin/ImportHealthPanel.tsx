"use client";

/**
 * Wave Y — import-health panel (spec 19y Y-1). Read-only; fetches the PII-free
 * summary from /api/admin/assessments/import-health and renders the alert cron's
 * ACTUAL decisions (checkpoint history), cron health, 24h volume rollups, and
 * recent signals. Mirrors ObservabilityDashboard's Section/Stat idiom.
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type {
  ImportHealthSummary,
  FiringSummary,
  RecentSignal,
} from "@/lib/assessments/esperto-import/import-health";

const HEALTH_STYLE: Record<ImportHealthSummary["cron"]["health"], { label: string; cls: string }> = {
  healthy: { label: "Healthy", cls: "bg-success/10 text-success" },
  stale: { label: "⚠ No recent sweep", cls: "bg-destructive/10 text-destructive" },
  disabled: { label: "Alerting disabled", cls: "bg-muted text-muted-foreground" },
};

export function ImportHealthPanel() {
  const [data, setData] = useState<ImportHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/assessments/import-health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { success: boolean; data: ImportHealthSummary };
      setData(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return <div className="px-6 py-12 text-center text-sm text-muted-foreground">Loading import health…</div>;
  }
  if (error || !data) {
    return <div className="px-6 py-12 text-center text-sm text-destructive">{error || "Failed to load"}</div>;
  }

  const v = data.volume.last24h;
  const health = HEALTH_STYLE[data.cron.health];

  return (
    <div className="space-y-6" data-testid="import-health-panel">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Esperto import health</h2>
          <p className="text-xs text-muted-foreground">
            Historical-import signals (last 24h). Generated {new Date(data.generatedAt).toLocaleString()}.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"
          data-testid="refresh-import-health"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Cron health */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${health.cls}`}
          data-testid="cron-health"
        >
          Alert sweep: {health.label}
        </span>
        <span className="text-xs text-muted-foreground">
          Last swept:{" "}
          <span className="text-foreground tabular-nums">
            {data.cron.lastSweptAt ? new Date(data.cron.lastSweptAt).toLocaleString() : "never"}
          </span>
          {data.cron.staleMinutes !== null && ` (${data.cron.staleMinutes} min ago)`}
        </span>
        <span className="text-xs text-muted-foreground">
          Sweeps 24h: <span className="text-foreground tabular-nums">{data.cron.sweeps24h}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          Rows evaluated 24h: <span className="text-foreground tabular-nums">{data.cron.evaluated24h}</span>
        </span>
      </div>

      {/* Alert history — the cron's actual firings */}
      <FiringTable title="Alert firings (last 24h)" rows={data.history.last24h} />

      {/* Volume rollups (uncapped totals) */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Volume (last 24h)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Commit results" value={v.commitResults} />
          <Stat label="Commit conflicts" value={v.commitConflicts} />
          <Stat label="Route refusals" value={v.refusals} />
          <Stat label="Degraded previews" value={v.previewDegraded} />
        </div>
        <p className="text-xs text-muted-foreground">
          Reference commit-latency p95:{" "}
          <span className="text-foreground tabular-nums">
            {v.latencyP95Ms === null ? "—" : `${v.latencyP95Ms} ms`}
          </span>{" "}
          <span className="italic">(reference only — not the alert trigger)</span>
        </p>
        {v.truncated && (
          <p className="text-xs text-destructive" data-testid="truncation-note">
            High volume — code/outcome breakdowns below may be incomplete (totals above are exact).
          </p>
        )}
      </section>

      {/* Breakdowns */}
      <div className="grid gap-4 md:grid-cols-3">
        <CountTable title="Results by outcome" map={v.commitResultsByOutcome} />
        <CountTable title="Conflicts by code" map={v.commitConflictsByCode} />
        <CountTable title="Refusals by code" map={v.refusalsByCode} />
      </div>

      {/* Recent signals */}
      <RecentTable rows={data.recent} />
    </div>
  );
}

function FiringTable({ title, rows }: { title: string; rows: FiringSummary[] }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">No alert conditions fired.</p>
      ) : (
        <table className="w-full">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <Th>Condition</Th>
              <Th right>Sweeps fired</Th>
              <Th right>Last fired</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((f) => (
              <tr key={f.code}>
                <td className="px-4 py-2 text-sm font-mono text-foreground">{f.code}</td>
                <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">{f.count}</td>
                <td className="px-4 py-2 text-right text-xs text-muted-foreground tabular-nums">
                  {new Date(f.lastFiredAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CountTable({ title, map }: { title: string; map: Record<string, number> }) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">None.</p>
      ) : (
        <table className="w-full">
          <tbody className="divide-y divide-border">
            {entries.map(([k, n]) => (
              <tr key={k}>
                <td className="px-4 py-2 text-sm font-mono text-foreground">{k}</td>
                <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RecentTable({ rows }: { rows: RecentSignal[] }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Recent signals</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">No import signals yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Org</Th>
                <Th>Outcome / code</Th>
                <Th right>Latency</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={`${r.at}-${i}`}>
                  <td className="px-4 py-2 text-xs text-muted-foreground tabular-nums">{new Date(r.at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-sm font-mono text-foreground">{r.action}</td>
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{r.org}</td>
                  <td className="px-4 py-2 text-sm text-foreground">{r.outcome ?? r.code ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums text-muted-foreground">
                    {r.latencyMs === null ? "—" : `${r.latencyMs} ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
