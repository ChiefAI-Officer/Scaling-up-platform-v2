import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssessmentsAggregateReport } from "@/components/admin/AssessmentsAggregateReport";

afterEach(() => jest.restoreAllMocks());

it("keeps comparison columns in a named bounded region when responsive", async () => {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/admin/assessment-templates") {
      return { ok: true, json: async () => ({ success: true, data: [{ id: "template-1", name: "Scaling Up Full", alias: "su-full", aggregationMode: "FULL_VISIBILITY" }] }) } as Response;
    }
    if (url.includes("/versions")) {
      return { ok: true, json: async () => ({ success: true, data: [{ id: "version-1", versionNumber: 1, language: "en", publishedAt: "2026-08-01T00:00:00.000Z" }] }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: {
      templateId: "template-1", versionId: "version-1", totalSubmissions: 2,
      distinctOrgs: 1, avgCountAchieved: 3, avgOverallTotal: 4, avgOverallAverage: 2,
      tierHistogram: [],
      perSectionMeans: [{ stableKey: "people", name: "People", totalPointsAvg: 3, averagePointsAvg: 1.5 }],
      submissionsOverTime: [],
    } }) } as Response;
  }) as unknown as typeof fetch;

  render(<AssessmentsAggregateReport responsiveEnabled />);
  await screen.findByRole("option", { name: /Scaling Up Full/ });
  fireEvent.change(screen.getByLabelText("Template"), { target: { value: "template-1" } });
  expect(await screen.findByRole("region", { name: "Per-section means comparison" })).toHaveClass("max-w-full", "overflow-x-auto");
  expect(screen.getByRole("columnheader", { name: "Avg total (per section)" })).toBeInTheDocument();
  expect(screen.getByTestId("aggregate-export-buttons")).toHaveClass("flex-col", "sm:flex-row");
  await waitFor(() => expect(screen.getByText("People")).toBeInTheDocument());
});

it("does not add responsive regions or classes when disabled", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) }) as unknown as typeof fetch;
  const { container } = render(<AssessmentsAggregateReport responsiveEnabled={false} />);
  await screen.findByLabelText("Template");
  expect(container.firstElementChild).toHaveAttribute("class", "space-y-6");
  expect(screen.queryByRole("region", { name: "Per-section means comparison" })).not.toBeInTheDocument();
  expect(screen.getByTestId("aggregate-export-buttons")).not.toHaveClass("flex-col");
});
