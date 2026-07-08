/**
 * Wave Y — <ImportHealthPanel/> render tests. Fetches the summary and renders
 * cron health, alert firings, volume, breakdowns, recent signals + honest
 * empty/error/truncation states.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { ImportHealthPanel } from "@/components/admin/ImportHealthPanel";
import type { ImportHealthSummary } from "@/lib/assessments/esperto-import/import-health";

function summary(over: Partial<ImportHealthSummary> = {}): ImportHealthSummary {
  const emptyVol = {
    commitResults: 0, commitConflicts: 0, refusals: 0, previewDegraded: 0,
    commitResultsByOutcome: {}, commitConflictsByCode: {}, refusalsByCode: {},
    latencyP95Ms: null, truncated: false,
  };
  return {
    generatedAt: "2026-07-07T20:00:00.000Z",
    alerting: { enabled: true },
    cron: { lastSweptAt: "2026-07-07T19:55:00.000Z", processedThrough: "2026-07-07T20:00:00.000Z", sweeps24h: 144, evaluated24h: 12, health: "healthy", staleMinutes: 5 },
    history: { last24h: [], last7d: [] },
    volume: { last24h: emptyVol, last7d: emptyVol },
    recent: [],
    ...over,
  };
}

function mockFetch(body: unknown, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({ ok, status, json: async () => body }) as unknown as typeof fetch;
}

beforeEach(() => jest.restoreAllMocks());

it("renders cron health + volume once loaded", async () => {
  mockFetch({ success: true, data: summary() });
  render(<ImportHealthPanel />);
  await waitFor(() => expect(screen.getByTestId("import-health-panel")).toBeInTheDocument());
  expect(screen.getByTestId("cron-health").textContent).toMatch(/Healthy/);
  expect(screen.getByText("Commit results")).toBeInTheDocument();
});

it("shows the 'disabled' cron state neutrally (not an alarm)", async () => {
  mockFetch({ success: true, data: summary({ alerting: { enabled: false }, cron: { ...summary().cron, health: "disabled" } }) });
  render(<ImportHealthPanel />);
  await waitFor(() => expect(screen.getByTestId("cron-health").textContent).toMatch(/Alerting disabled/));
});

it("renders alert firings from checkpoint history", async () => {
  mockFetch({ success: true, data: summary({ history: { last24h: [{ code: "divergent-reimport", count: 2, lastFiredAt: "2026-07-07T19:50:00.000Z" }], last7d: [] } }) });
  render(<ImportHealthPanel />);
  await waitFor(() => expect(screen.getByText("divergent-reimport")).toBeInTheDocument());
});

it("surfaces the truncation note when a breakdown is capped", async () => {
  const vol = { ...summary().volume.last24h, truncated: true, commitResults: 5000 };
  mockFetch({ success: true, data: summary({ volume: { last24h: vol, last7d: vol } }) });
  render(<ImportHealthPanel />);
  await waitFor(() => expect(screen.getByTestId("truncation-note")).toBeInTheDocument());
});

it("renders an honest empty state (no imports yet)", async () => {
  mockFetch({ success: true, data: summary() });
  render(<ImportHealthPanel />);
  await waitFor(() => expect(screen.getByText("No import signals yet.")).toBeInTheDocument());
  expect(screen.getByText("No alert conditions fired.")).toBeInTheDocument();
});

it("shows an error state when the fetch fails", async () => {
  mockFetch({ success: false }, false, 500);
  render(<ImportHealthPanel />);
  await waitFor(() => expect(screen.getByText(/HTTP 500/)).toBeInTheDocument());
});
