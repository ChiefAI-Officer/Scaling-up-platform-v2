import { render, screen, within } from "@testing-library/react";

import {
  CONDENSED_GOLDEN_CURRENT_SCORES,
  CONDENSED_GOLDEN_PEERS,
  condensedGoldenReport,
} from "@/__tests__/fixtures/summary-reports/scaling-condensed-ceo-golden";
import { ScalingCondensedCeoReport } from "@/components/assessments/ScalingCondensedCeoReport";
import { buildScalingCondensedCeoModel } from "@/lib/assessments/summary-reports/scaling-condensed-ceo-model";
import type { ScalingCondensedCeoSnapshot } from "@/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot";

function goldenSnapshot(): ScalingCondensedCeoSnapshot {
  const modeled = buildScalingCondensedCeoModel(condensedGoldenReport());
  if (modeled.kind !== "ok") throw new Error("Expected complete Condensed fixture");
  return {
    schemaVersion: 1,
    reportType: "SCALING_CONDENSED_CEO",
    generatedAt: "2026-08-30T00:00:00.000Z",
    destination: {
      campaignId: "campaign-1",
      campaignName: "Annual Scaling Up",
      assessmentName: "Scaling Up Full",
      companyName: "Acme",
      versionId: "version-1",
      versionLabel: "Version 6",
    },
    source: {
      participantId: "participant-ceo",
      submissionId: "submission-ceo",
      respondentName: "Golden CEO",
      submittedAt: "2026-07-14T12:22:02.000Z",
    },
    model: modeled.model,
    provenance: {
      coachLogoUrl: "https://example.com/coach.png",
      coachName: "Casey Coach",
      peer: modeled.model.peerProvenance,
    },
  };
}

test("renders Jeff's canonical two-page score-only Condensed report", () => {
  const { container } = render(
    <ScalingCondensedCeoReport snapshot={goldenSnapshot()} responsiveEnabled />,
  );

  expect(container.querySelectorAll("[data-page-number]")).toHaveLength(2);
  expect(screen.getByRole("heading", { name: "Your Scaling Up Report" })).toBeVisible();
  expect(screen.getByText("Condensed version")).toBeVisible();
  expect(screen.getByText("Report for: Golden CEO")).toBeVisible();
  expect(screen.getAllByText("Coached by Casey Coach").length).toBeGreaterThan(0);
  expect(screen.getAllByTestId(/^su-landscape-vertical-chart-/)).toHaveLength(5);

  const rows = screen.getAllByTestId(/^su-landscape-vertical-row-Q\d{2}$/);
  expect(rows).toHaveLength(61);
  expect(new Set(rows.map((row) => row.dataset.testid)).size).toBe(61);
  rows.forEach((row, index) => {
    expect(row).toHaveAttribute("data-peer-score", String(CONDENSED_GOLDEN_PEERS[index]));
    expect(within(row).getByText(CONDENSED_GOLDEN_CURRENT_SCORES[index].toFixed(1))).toBeVisible();
    expect(within(row).getByText(
      `You ${CONDENSED_GOLDEN_CURRENT_SCORES[index].toFixed(1)}. Peers ${CONDENSED_GOLDEN_PEERS[index].toFixed(1)}.`,
    )).toBeInTheDocument();
  });

  expect(container.firstElementChild).toHaveAttribute("data-responsive-report", "");
  for (const excluded of [
    "Team score",
    "Narrative",
    "Profile",
    "Conclusion",
    "Appendix B",
    "Appendix C",
    "Remarks",
    "Verbatims",
  ]) {
    expect(screen.queryByText(excluded, { exact: false })).not.toBeInTheDocument();
  }
});
