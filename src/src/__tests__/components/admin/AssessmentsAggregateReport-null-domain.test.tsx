/**
 * D2.1 consumer test (Codex round 2 #4 + round 3 #2) — null-domain rendering.
 *
 * Per the Phase D2 plan: the existing AssessmentsAggregateReport does NOT
 * yet render `perDomain[]` rows. This test asserts:
 *   1. The component renders successfully when the fetched payload has no
 *      perDomain field (existing behavior — null-domain support pending).
 *   2. The exported `formatNullableNumber` helper handles null + undefined
 *      + NaN gracefully ("—" rather than "0" / "NaN"). When the report
 *      gains a per-domain panel, every cell rendering domain averages
 *      MUST route through this helper.
 *
 * TODO (D2 follow-on): once the per-domain UI ships, extend this test to
 * render the actual perDomain[] row with a null-averagePoints fixture and
 * assert the "—" indicator appears in the DOM.
 */

import React from "react";
import { render, act, waitFor } from "@testing-library/react";

import {
  AssessmentsAggregateReport,
  formatNullableNumber,
} from "@/components/admin/AssessmentsAggregateReport";

beforeEach(() => {
  // The component fetches /api/admin/assessment-templates on mount. Stub
  // global.fetch to return an empty template list — the report shows a
  // "Select a template" empty state and does NOT crash.
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/admin/assessment-templates")) {
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ success: true, data: null }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
});

describe("AssessmentsAggregateReport — null-domain rendering safety", () => {
  it("renders without crashing when no template selected (existing behavior)", async () => {
    let result: ReturnType<typeof render> | undefined;
    await act(async () => {
      result = render(<AssessmentsAggregateReport />);
    });
    // Drain any pending fetch promises.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    expect(result?.container).toBeDefined();
  });
});

describe("formatNullableNumber helper (D2.1 null-aware formatter)", () => {
  it("formats null as the em-dash indicator '—'", () => {
    expect(formatNullableNumber(null)).toBe("—");
  });

  it("formats undefined as '—'", () => {
    expect(formatNullableNumber(undefined)).toBe("—");
  });

  it("formats NaN as '—' (not the literal 'NaN' string)", () => {
    expect(formatNullableNumber(Number.NaN)).toBe("—");
  });

  it("formats Infinity as '—' (not 'Infinity')", () => {
    expect(formatNullableNumber(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("formats integers without decimals", () => {
    expect(formatNullableNumber(7)).toBe("7");
    expect(formatNullableNumber(0)).toBe("0");
  });

  it("formats fractional values to 2 decimals", () => {
    expect(formatNullableNumber(3.14159)).toBe("3.14");
    expect(formatNullableNumber(2.8)).toBe("2.80");
  });

  it("distinguishes null (no data) from 0 (scored zero) — the core D2 contract", () => {
    expect(formatNullableNumber(null)).not.toBe(formatNullableNumber(0));
    expect(formatNullableNumber(null)).toBe("—");
    expect(formatNullableNumber(0)).toBe("0");
  });
});
