/**
 * Wave S (spec 19s S-3) — PeerBenchmarksPanel component test.
 *
 * Covers: row rendering (report label + prefilled value, blank when unset),
 * the exact PUT payload (blank rows excluded), save success syncing inputs to
 * the RETURNED saved set, save error surfacing the API message, and the
 * disabled-while-saving state.
 *
 * Harness mirrors CustomSlidesPanel.test.tsx; fetch is mocked globally.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  PeerBenchmarksPanel,
  type PeerBenchmarkRow,
} from "@/components/assessments/PeerBenchmarksPanel";

const ROWS: PeerBenchmarkRow[] = [
  { stableKey: "S3_recruitment", label: "Recruitment of new employees", value: 6.3 },
  { stableKey: "S3_market", label: "The market", value: null },
  { stableKey: "S3_leadership_team", label: "Management Team", value: 4 },
];

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

function input(stableKey: string): HTMLInputElement {
  return screen.getByTestId(`peer-benchmark-input-${stableKey}`);
}

describe("PeerBenchmarksPanel", () => {
  it("renders the heading, helper copy, and one row per rating question", () => {
    render(<PeerBenchmarksPanel templateId="tpl-1" rows={ROWS} />);
    expect(screen.getByText("Peer averages")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Peer averages render on LVA reports. Blank = the factor shows no peer comparison.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Recruitment of new employees")).toBeInTheDocument();
    expect(screen.getByText("The market")).toBeInTheDocument();
    expect(screen.getByText("Management Team")).toBeInTheDocument();
    expect(input("S3_recruitment").value).toBe("6.3");
    expect(input("S3_market").value).toBe("");
    expect(input("S3_leadership_team").value).toBe("4");
  });

  it("PUTs the full non-blank set — blank rows are excluded from the payload", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          entries: [
            { stableKey: "S3_recruitment", value: 6.3 },
            { stableKey: "S3_leadership_team", value: 4 },
          ],
        },
      }),
    );
    render(<PeerBenchmarksPanel templateId="tpl-1" rows={ROWS} />);
    fireEvent.click(screen.getByTestId("peer-benchmarks-save"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/assessment-templates/tpl-1/benchmarks");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      entries: [
        { stableKey: "S3_recruitment", value: 6.3 },
        { stableKey: "S3_leadership_team", value: 4 },
      ],
    });
  });

  it("a row blanked in the UI is dropped from the next save payload", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { entries: [{ stableKey: "S3_leadership_team", value: 4 }] },
      }),
    );
    render(<PeerBenchmarksPanel templateId="tpl-1" rows={ROWS} />);
    fireEvent.change(input("S3_recruitment"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("peer-benchmarks-save"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.entries).toEqual([{ stableKey: "S3_leadership_team", value: 4 }]);
  });

  it("save success shows the success state and syncs inputs to the RETURNED saved set", async () => {
    // Server rounds 6.25 → 6.3; the panel must adopt the server's value.
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          entries: [
            { stableKey: "S3_recruitment", value: 6.3 },
            { stableKey: "S3_market", value: 8 },
          ],
        },
      }),
    );
    render(<PeerBenchmarksPanel templateId="tpl-1" rows={ROWS} />);
    fireEvent.change(input("S3_recruitment"), { target: { value: "6.25" } });
    fireEvent.change(input("S3_market"), { target: { value: "8" } });
    fireEvent.change(input("S3_leadership_team"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("peer-benchmarks-save"));

    await waitFor(() =>
      expect(screen.getByTestId("peer-benchmarks-status")).toHaveTextContent(
        "Peer averages saved.",
      ),
    );
    expect(input("S3_recruitment").value).toBe("6.3");
    expect(input("S3_market").value).toBe("8");
    expect(input("S3_leadership_team").value).toBe("");
  });

  it("save error surfaces the API error message and keeps the edited values", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: "VALUE_OUT_OF_BOUNDS",
          message:
            'Benchmark value for "S3_market" must be between 0 and 10 (got 12).',
        },
        400,
      ),
    );
    render(<PeerBenchmarksPanel templateId="tpl-1" rows={ROWS} />);
    fireEvent.change(input("S3_market"), { target: { value: "12" } });
    fireEvent.click(screen.getByTestId("peer-benchmarks-save"));

    await waitFor(() =>
      expect(screen.getByTestId("peer-benchmarks-status")).toHaveTextContent(
        'Benchmark value for "S3_market" must be between 0 and 10 (got 12).',
      ),
    );
    expect(input("S3_market").value).toBe("12");
  });

  it("network failure shows a generic error", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<PeerBenchmarksPanel templateId="tpl-1" rows={ROWS} />);
    fireEvent.click(screen.getByTestId("peer-benchmarks-save"));
    await waitFor(() =>
      expect(screen.getByTestId("peer-benchmarks-status")).toHaveTextContent(
        /failed/i,
      ),
    );
  });

  it("disables the Save button while the save is in flight", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    render(<PeerBenchmarksPanel templateId="tpl-1" rows={ROWS} />);
    const save = screen.getByTestId("peer-benchmarks-save");
    fireEvent.click(save);
    expect(save).toBeDisabled();
    resolveFetch(jsonResponse({ success: true, data: { entries: [] } }));
    await waitFor(() => expect(save).not.toBeDisabled());
  });
});
