import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PeerBenchmarkStatusPanel } from "@/components/admin/PeerBenchmarkStatusPanel";
import type { PeerBenchmarkAuditSnapshot } from "@/lib/assessments/peer-benchmark-audit";

function snapshot(
  over: Partial<PeerBenchmarkAuditSnapshot> = {},
): PeerBenchmarkAuditSnapshot {
  return {
    generatedAt: "2026-08-04T06:00:00.000Z",
    targetAlias: "leadership-vision-alignment",
    effectiveGate: { state: "known", value: "dark" },
    template: { state: "known", value: "present" },
    activeVersion: {
      state: "known",
      value: {
        versionNumber: 3,
        language: "enUS",
        publishedAt: "2026-07-02T16:20:09.782Z",
        ratingQuestionCount: 16,
      },
    },
    storedBenchmarks: { state: "known", value: { storedRowCount: 0 } },
    keyCoverage: {
      state: "known",
      value: {
        matchingRowCount: 0,
        missingRatingQuestionCount: 16,
        staleRowCount: 0,
      },
    },
    readiness: "dark",
    ...over,
  };
}

function mockFetch(data: PeerBenchmarkAuditSnapshot, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => ({ success: ok, data }),
  }) as unknown as typeof fetch;
}

beforeEach(() => jest.restoreAllMocks());

it("renders dark neutrally while preserving prerequisite evidence", async () => {
  mockFetch(snapshot());
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-status-panel")).toBeInTheDocument(),
  );
  expect(screen.getByTestId("peer-benchmark-readiness")).toHaveTextContent(
    "Currently dark",
  );
  expect(screen.getByTestId("peer-benchmark-effective-gate")).toHaveTextContent(
    "Dark",
  );
  expect(screen.getByTestId("peer-benchmark-active-version")).toHaveTextContent(
    "v3",
  );
  expect(screen.getByText("16 rating questions")).toBeInTheDocument();
  expect(screen.getByTestId("peer-benchmark-stored-count")).toHaveTextContent(
    "0",
  );
  expect(screen.getByText(/does not identify which flag input caused it/i))
    .toBeInTheDocument();
});

it.each([
  ["noData", "No benchmark data"],
  ["partialData", "Partial benchmark data"],
  ["ready", "Ready"],
  ["blocked", "Blocked"],
  ["unknown", "Unknown"],
] as const)("renders %s readiness", async (readiness, label) => {
  mockFetch(snapshot({ readiness }));
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-readiness")).toHaveTextContent(
      label,
    ),
  );
});

it("shows known stored count beside unknown coverage", async () => {
  mockFetch(
    snapshot({
      activeVersion: { state: "unknown", reason: "query_failed" },
      storedBenchmarks: { state: "known", value: { storedRowCount: 4 } },
      keyCoverage: { state: "unknown", reason: "dependency_unknown" },
      readiness: "unknown",
    }),
  );
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-stored-count")).toHaveTextContent(
      "4",
    ),
  );
  expect(screen.getByTestId("peer-benchmark-active-version")).toHaveTextContent(
    "Unknown",
  );
  expect(screen.getByTestId("peer-benchmark-coverage")).toHaveTextContent(
    "Unknown",
  );
});

it("refreshes only its own endpoint", async () => {
  mockFetch(snapshot());
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      screen.getByTestId("refresh-peer-benchmark-status"),
    ).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByTestId("refresh-peer-benchmark-status"));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    "/api/admin/assessments/peer-benchmark-status",
    { cache: "no-store" },
  );
});

it("contains the permanent privacy note and no mutation controls", async () => {
  mockFetch(snapshot());
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(
      screen.getByText(
        "Underlying environment inputs and peer values are not displayed.",
      ),
    ).toBeInTheDocument(),
  );
  expect(screen.queryByRole("button", { name: /save|enable|disable|edit/i }))
    .not.toBeInTheDocument();
});

it("isolates an endpoint error inside the peer panel", async () => {
  mockFetch(snapshot(), false, 500);
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByText("Peer benchmark status failed: HTTP 500"))
      .toBeInTheDocument(),
  );
});

it("shows stale rows without downgrading ready coverage", async () => {
  mockFetch(
    snapshot({
      effectiveGate: { state: "known", value: "enabled" },
      storedBenchmarks: { state: "known", value: { storedRowCount: 17 } },
      keyCoverage: {
        state: "known",
        value: {
          matchingRowCount: 16,
          missingRatingQuestionCount: 0,
          staleRowCount: 1,
        },
      },
      readiness: "ready",
    }),
  );
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-readiness")).toHaveTextContent(
      "Ready",
    ),
  );
  expect(screen.getByTestId("peer-benchmark-coverage")).toHaveTextContent(
    "1 stale",
  );
});

it("renders a known missing template as Missing, not Unknown", async () => {
  mockFetch(
    snapshot({
      template: { state: "missing", reason: "template_not_found" },
      activeVersion: {
        state: "notApplicable",
        reason: "template_missing",
      },
      storedBenchmarks: {
        state: "notApplicable",
        reason: "template_missing",
      },
      keyCoverage: {
        state: "notApplicable",
        reason: "template_missing",
      },
      readiness: "blocked",
    }),
  );
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() => expect(screen.getByText("Missing")).toBeInTheDocument());
  expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
});

it("renders known zero as 0 rather than an em dash", async () => {
  mockFetch(snapshot());
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-stored-count")).toHaveTextContent(
      "0",
    ),
  );
  expect(screen.getByTestId("peer-benchmark-stored-count")).not.toHaveTextContent(
    "—",
  );
});

it("keeps the last verified snapshot visible when refresh fails", async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: snapshot() }),
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false }),
    }) as unknown as typeof fetch;
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-active-version")).toHaveTextContent(
      "v3",
    ),
  );
  fireEvent.click(screen.getByTestId("refresh-peer-benchmark-status"));
  await waitFor(() =>
    expect(screen.getByText("Peer benchmark status failed: HTTP 500"))
      .toBeInTheDocument(),
  );
  expect(screen.getByTestId("peer-benchmark-active-version")).toHaveTextContent(
    "v3",
  );
  expect(screen.getByTestId("peer-benchmark-stored-count")).toHaveTextContent(
    "0",
  );
});
