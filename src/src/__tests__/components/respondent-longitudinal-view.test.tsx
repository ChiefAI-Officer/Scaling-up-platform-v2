/**
 * Component tests for RespondentLongitudinalView (Wave N #23).
 *
 * Covers the state handling per the IMPLEMENT spec:
 *   - notApplicable → qualitative card
 *   - empty → no-submissions card
 *   - ok: points/values + overall row, per-section rows
 *   - deltas: ▲/▼ on comparable points; no delta where not comparable
 *   - "different version" badge where deltaComparable === false
 *   - tier-movement row only where a tier exists
 *   - comparableCount === 0 → "need ≥2 to compare" note
 *   - bounded note when truncated
 */

import { render, screen } from "@testing-library/react";
import { RespondentLongitudinalView } from "@/components/assessments/RespondentLongitudinalView";
import type {
  RespondentLongitudinal,
  RespondentLongitudinalOutcome,
  RespondentLongitudinalPoint,
} from "@/lib/assessments/respondent-longitudinal";

function point(
  overrides: Partial<RespondentLongitudinalPoint> = {},
): RespondentLongitudinalPoint {
  return {
    campaignId: "c1",
    campaignLabel: "Q1 Pulse",
    submittedAt: new Date("2026-01-15T00:00:00Z"),
    versionId: "v1",
    versionNumber: 1,
    overall: { average: 2.1, deltaComparable: false },
    rows: [
      { stableKey: "trust", name: "Trust", value: 2.0, deltaComparable: false },
    ],
    ...overrides,
  };
}

function okData(overrides: Partial<RespondentLongitudinal> = {}): RespondentLongitudinal {
  return {
    respondent: { id: "resp-1", name: "Alice Smith", jobTitle: "CEO" },
    companyName: "Acme Corp",
    assessment: {
      templateId: "tpl-rock",
      alias: "RockHabits",
      name: "Rockefeller Habits Checklist",
    },
    matchedRespondentCount: 1,
    submissionCount: 2,
    points: [
      point({
        campaignId: "c1",
        submittedAt: new Date("2026-01-15T00:00:00Z"),
        overall: { average: 2.1, deltaComparable: false },
        rows: [
          { stableKey: "trust", name: "Trust", value: 2.0, deltaComparable: false },
          { stableKey: "results", name: "Results", value: 2.2, deltaComparable: false },
        ],
      }),
      point({
        campaignId: "c2",
        campaignLabel: "Q2 Pulse",
        submittedAt: new Date("2026-06-15T00:00:00Z"),
        overall: { average: 2.5, deltaComparable: true, delta: 0.4 },
        rows: [
          { stableKey: "trust", name: "Trust", value: 2.6, deltaComparable: true, delta: 0.6 },
          { stableKey: "results", name: "Results", value: 2.0, deltaComparable: true, delta: -0.2 },
        ],
      }),
    ],
    comparableCount: 1,
    hasMultipleVersions: false,
    ...overrides,
  };
}

function ok(data: RespondentLongitudinal): RespondentLongitudinalOutcome {
  return { kind: "ok", data };
}

describe("RespondentLongitudinalView", () => {
  it("renders the qualitative not-applicable card", () => {
    render(
      <RespondentLongitudinalView
        outcome={{ kind: "notApplicable", reason: "qualitative-template" }}
      />,
    );
    expect(screen.getByTestId("longitudinal-not-applicable")).toBeInTheDocument();
    expect(
      screen.getByText(/qualitative assessment/i),
    ).toBeInTheDocument();
  });

  it("renders the empty (no submissions) card", () => {
    render(<RespondentLongitudinalView outcome={{ kind: "empty" }} />);
    expect(screen.getByTestId("longitudinal-empty")).toBeInTheDocument();
  });

  it("ok: renders header (name, company, assessment, count + date range)", () => {
    render(<RespondentLongitudinalView outcome={ok(okData())} />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
    expect(
      screen.getByText("Rockefeller Habits Checklist"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 assessments")).toBeInTheDocument();
    // first–last date range
    expect(screen.getByText(/Jan 2026.*Jun 2026/)).toBeInTheDocument();
  });

  it("ok: renders the trend chart + the section table with overall + per-section rows", () => {
    render(<RespondentLongitudinalView outcome={ok(okData())} />);
    expect(screen.getByTestId("longitudinal-trend-chart")).toBeInTheDocument();
    const table = screen.getByTestId("longitudinal-section-table");
    expect(table).toBeInTheDocument();
    expect(screen.getByText("Overall average")).toBeInTheDocument();
    expect(screen.getByText("Trust")).toBeInTheDocument();
    expect(screen.getByText("Results")).toBeInTheDocument();
  });

  it("ok: shows ▲ delta on a comparable up-move and ▼ on a comparable down-move", () => {
    render(<RespondentLongitudinalView outcome={ok(okData())} />);
    const table = screen.getByTestId("longitudinal-section-table");
    // Trust went 2.0 → 2.6 (+0.6, up) ⇒ ▲ present
    expect(table.textContent).toContain("▲");
    // Results went 2.2 → 2.0 (-0.2, down) ⇒ ▼ present
    expect(table.textContent).toContain("▼");
    // The first column (not comparable) shows values without arrows for its cells.
  });

  it("ok: shows a 'different version' badge where deltaComparable === false on overall", () => {
    const data = okData({
      hasMultipleVersions: true,
      points: [
        point({
          campaignId: "c1",
          versionId: "v1",
          overall: { average: 2.1, deltaComparable: false },
          rows: [],
        }),
        point({
          campaignId: "c2",
          versionId: "v2",
          submittedAt: new Date("2026-06-15T00:00:00Z"),
          overall: { average: 2.5, deltaComparable: false },
          rows: [],
        }),
      ],
      comparableCount: 0,
    });
    render(<RespondentLongitudinalView outcome={ok(data)} />);
    const badges = screen.getAllByTestId("longitudinal-version-badge");
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(badges[0].textContent).toMatch(/different version/i);
  });

  it("ok: renders a tier-movement row ONLY where a tier exists", () => {
    const withTier = okData({
      points: [
        point({
          campaignId: "c1",
          overall: { average: 2.1, tier: "Developing", deltaComparable: false },
        }),
        point({
          campaignId: "c2",
          submittedAt: new Date("2026-06-15T00:00:00Z"),
          overall: {
            average: 2.5,
            tier: "Strong",
            deltaComparable: true,
            delta: 0.4,
          },
        }),
      ],
    });
    const { rerender } = render(
      <RespondentLongitudinalView outcome={ok(withTier)} />,
    );
    expect(screen.getByTestId("longitudinal-tier-row")).toBeInTheDocument();
    expect(screen.getByText("Developing")).toBeInTheDocument();
    expect(screen.getByText("Strong")).toBeInTheDocument();

    // No tier on any point ⇒ no tier row (SU-Full, ADR-0015).
    rerender(<RespondentLongitudinalView outcome={ok(okData())} />);
    expect(screen.queryByTestId("longitudinal-tier-row")).not.toBeInTheDocument();
  });

  it("ok: comparableCount === 0 → 'need ≥2 to compare' note", () => {
    const single = okData({
      submissionCount: 1,
      points: [point({ campaignId: "c1" })],
      comparableCount: 0,
    });
    render(<RespondentLongitudinalView outcome={ok(single)} />);
    expect(screen.getByTestId("longitudinal-need-two")).toBeInTheDocument();
    expect(screen.getByText("1 assessment")).toBeInTheDocument();
  });

  it("ok: all-different-versions → 'need ≥2' note with the all-different wording", () => {
    const data = okData({
      hasMultipleVersions: true,
      comparableCount: 0,
      points: [
        point({ campaignId: "c1", versionId: "v1", overall: { average: 2.1, deltaComparable: false } }),
        point({
          campaignId: "c2",
          versionId: "v2",
          submittedAt: new Date("2026-06-15T00:00:00Z"),
          overall: { average: 2.5, deltaComparable: false },
        }),
      ],
    });
    render(<RespondentLongitudinalView outcome={ok(data)} />);
    expect(screen.getByTestId("longitudinal-need-two")).toBeInTheDocument();
    expect(
      screen.getByText(/different assessment version/i),
    ).toBeInTheDocument();
  });

  it("ok: bounded set → 'showing latest N' note", () => {
    const data = okData({ bounded: { shown: 12, total: 15 } });
    render(<RespondentLongitudinalView outcome={ok(data)} />);
    const note = screen.getByTestId("longitudinal-bounded-note");
    expect(note.textContent).toMatch(/latest 12 of 15/i);
  });

  it("ok: multi-version (but with some comparable) → version note", () => {
    const data = okData({ hasMultipleVersions: true, comparableCount: 1 });
    render(<RespondentLongitudinalView outcome={ok(data)} />);
    expect(screen.getByTestId("longitudinal-version-note")).toBeInTheDocument();
  });
});
