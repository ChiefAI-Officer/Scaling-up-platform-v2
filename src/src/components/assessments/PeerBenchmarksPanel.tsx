"use client";

/**
 * PeerBenchmarksPanel — Wave S (spec 19s S-3) admin peer-averages editor.
 *
 * One row per rating question of the template's published version (report
 * label + numeric input 0–10, step 0.1, blank = unset) and ONE Save button
 * that PUTs the FULL non-blank set to
 * `/api/admin/assessment-templates/[id]/benchmarks` (atomic reconcile, D14 —
 * a blank field means "no row", so blanked rows are simply absent from the
 * payload). After a successful save the inputs sync to the RETURNED saved
 * set (the server rounds to 1dp), so what the admin sees is what's stored.
 *
 * The server page supplies the initial rows (no GET endpoint exists) and only
 * mounts this panel when the Wave S flag is ON and the template alias is
 * render-enabled (D10) — the panel itself carries no flag logic.
 */

import { useState } from "react";

export interface PeerBenchmarkRow {
  stableKey: string;
  /** Report label (LVA factor-label overrides already applied server-side). */
  label: string;
  /** Stored peer average, or null when unset. */
  value: number | null;
}

export interface PeerBenchmarksPanelProps {
  templateId: string;
  rows: PeerBenchmarkRow[];
}

type SaveStatus = { kind: "success" | "error"; message: string } | null;

export function PeerBenchmarksPanel({
  templateId,
  rows,
}: PeerBenchmarksPanelProps) {
  // Input strings keyed by stableKey; "" = unset (no benchmark row).
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.stableKey, r.value === null ? "" : String(r.value)]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  function setValue(stableKey: string, raw: string) {
    setValues((prev) => ({ ...prev, [stableKey]: raw }));
  }

  async function save() {
    // The full desired set: only non-blank rows become entries (blank = unset).
    const entries: { stableKey: string; value: number }[] = [];
    for (const row of rows) {
      const raw = (values[row.stableKey] ?? "").trim();
      if (raw === "") continue;
      entries.push({ stableKey: row.stableKey, value: Number(raw) });
    }

    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/admin/assessment-templates/${templateId}/benchmarks`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus({
          kind: "error",
          message:
            (body?.message as string | undefined) ??
            (typeof body?.error === "string" ? body.error : undefined) ??
            "Save failed. Please try again.",
        });
        return;
      }
      // Sync inputs to the saved set the server returned (values are 1dp-
      // rounded server-side; keys absent from the response are unset).
      const saved: { stableKey: string; value: number }[] =
        body?.data?.entries ?? [];
      const savedByKey = new Map(saved.map((e) => [e.stableKey, e.value]));
      setValues(
        Object.fromEntries(
          rows.map((r) => {
            const v = savedByKey.get(r.stableKey);
            return [r.stableKey, v === undefined ? "" : String(v)];
          }),
        ),
      );
      setStatus({ kind: "success", message: "Peer averages saved." });
    } catch {
      setStatus({ kind: "error", message: "Save failed. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="border border-border rounded-lg bg-card p-4 space-y-4"
      data-testid="peer-benchmarks-panel"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Peer averages</h2>
        <p className="text-sm text-muted-foreground">
          Peer averages render on LVA reports. Blank = the factor shows no peer
          comparison.
        </p>
      </div>

      <ul className="space-y-2" data-testid="peer-benchmarks-rows">
        {rows.map((row) => (
          <li
            key={row.stableKey}
            className="flex items-center justify-between gap-3"
            data-testid="peer-benchmark-row"
          >
            <label
              htmlFor={`peer-benchmark-${row.stableKey}`}
              className="text-sm text-foreground"
            >
              {row.label}
            </label>
            <input
              id={`peer-benchmark-${row.stableKey}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={10}
              step={0.1}
              value={values[row.stableKey] ?? ""}
              disabled={saving}
              onChange={(e) => setValue(row.stableKey, e.target.value)}
              className="w-24 px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground text-right focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              data-testid={`peer-benchmark-input-${row.stableKey}`}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="peer-benchmarks-save"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {status && (
          <span
            role="status"
            className={`text-sm ${
              status.kind === "error" ? "text-destructive" : "text-success"
            }`}
            data-testid="peer-benchmarks-status"
          >
            {status.message}
          </span>
        )}
      </div>
    </section>
  );
}

export default PeerBenchmarksPanel;
