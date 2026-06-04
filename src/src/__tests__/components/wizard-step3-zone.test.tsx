/**
 * Step3Review (workshop request wizard) renders the event time with a
 * DST-aware short timezone abbreviation derived from the chosen IANA timezone,
 * NOT the raw IANA string.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { WizardProvider } from "@/components/workshops/wizard/WizardContext";
import { Step3Review } from "@/components/workshops/wizard/Step3Review";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/portal/request",
}));

function mockFetchWith(stepsData: Record<string, unknown>) {
  global.fetch = jest.fn((url: string) => {
    // Wizard draft load seeds formData
    if (typeof url === "string" && url.includes("/api/workshop-drafts")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            stepsData: JSON.stringify(stepsData),
            currentStep: 3,
            updatedAt: new Date().toISOString(),
          }),
      });
    }
    // Step3Review fetches categories — return empty list (legacy fallback)
    if (typeof url === "string" && url.includes("/api/categories")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as jest.Mock;
}

describe("Step3Review event time zone abbreviation", () => {
  it("renders the summer (DST) zone abbreviation next to the event time", async () => {
    mockFetchWith({
      title: "Scaling Up Workshop",
      eventDate: "2026-06-18",
      eventTime: "9:00 AM",
      timezone: "America/Chicago",
      format: "VIRTUAL",
      termsAccepted: false,
    });

    render(
      <WizardProvider>
        <Step3Review />
      </WizardProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/9:00 AM CDT/)).toBeInTheDocument();
    });
    // Raw IANA string must not leak into the review summary
    expect(document.body.innerHTML).not.toContain("America/Chicago");
  });
});
