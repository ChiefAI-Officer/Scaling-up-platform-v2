import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SelfComparisonPicker } from "@/components/assessments/SelfComparisonPicker";

test("selects Focus then Earlier and opens the one-person report route", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ candidates: [{
      submissionId: "earlier-1", campaignId: "campaign-2025", campaignLabel: "Annual 2025",
      submittedAt: "2025-05-01T00:00:00.000Z", versionId: "v5", versionNumber: 5, isImported: true,
    }], bounded: false }),
  });
  const open = jest.spyOn(window, "open").mockImplementation(() => null);

  render(<SelfComparisonPicker
    open
    onClose={jest.fn()}
    campaignId="campaign-2026"
    focusCandidates={[{ submissionId: "focus-1", label: "Ari Founder", submittedAt: "2026-05-01T00:00:00.000Z" }]}
  />);

  await screen.findByRole("option", { name: /Annual 2025.*Version 5.*Imported/ });
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/assessment-campaigns/campaign-2026/summary-reports/self-comparison-candidates?focusSubmissionId=focus-1",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  fireEvent.change(screen.getByLabelText("Earlier report"), { target: { value: "earlier-1" } });
  expect(screen.getByText(/Ari Founder.*May 1, 2026.*Annual 2025.*May 1, 2025/i)).toBeVisible();
  expect(screen.getByText(/CEO.s own trajectory, not the company average/i)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Open Self Comparison" }));

  await waitFor(() => expect(open).toHaveBeenCalledWith(
    "/assessments/campaign-2026/self-comparison?focus=focus-1&earlier=earlier-1",
    "_blank",
    "noopener,noreferrer",
  ));
  expect(screen.getByText(/one person's completed report/)).toBeVisible();
  expect(document.body).not.toHaveTextContent("Team average");
  open.mockRestore();
});
