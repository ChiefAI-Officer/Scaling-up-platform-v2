import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
}));
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/components/assessments/AssessmentResultView", () => ({ AssessmentResultView: () => null }));

import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type { CampaignOverview } from "@/lib/assessments/campaign-detail";

const overview: CampaignOverview = {
  campaign: {
    id: "campaign-1", name: "Sydney campaign", alias: "sydney-campaign", status: "ACTIVE",
    openAt: new Date("2026-09-01T00:00:00.000Z"), closeAt: new Date("2026-10-01T06:00:00.000Z"),
    timezone: "Australia/Sydney", createdAt: new Date("2026-08-01T00:00:00.000Z"),
    templateId: "template-1", templateName: "Checklist", templateAlias: "checklist",
    organizationId: "org-1", organizationName: "Acme", invitationSubject: null,
    invitationBodyMarkdown: null, invitationBodyHtml: null, reportStyle: "CLASSIC",
    reportStyleSource: "TEMPLATE_DEFAULT", reportStyleLockedAt: null,
  },
  stats: { totalParticipants: 3, invited: 3, viewed: 2, submitted: 1, completionPct: 33 },
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async (_input, init) => {
    if ((init?.method ?? "GET") === "GET") {
      return { ok: true, json: async () => ({ success: true, data: { affectedCount: 2, completedCount: 1 } }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: { closeAt: "2026-10-16T06:00:00.000Z", affectedCount: 2 } }) } as Response;
  });
});

it("shows campaign zone and submits an extend-only deadline with server blast-radius counts", async () => {
  render(<CampaignDetail initialOverview={overview} initialRespondents={[]} timezonePickerEnabled />);
  expect(screen.getByText("Australia/Sydney")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /extend deadline/i }));
  expect(await screen.findByText(/extend 2 invitation links/i)).toBeInTheDocument();
  expect(screen.getByText(/leave 1 completed response untouched/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/new close date/i), {
    target: { value: "2026-10-16T17:00" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: /extend deadline/i }).at(-1)!);

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    "/api/assessment-campaigns/campaign-1/extend-deadline",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ closeAt: "2026-10-16T06:00:00.000Z", notifyAffected: false }),
    }),
  ));
});

it("does not expose shortening through the generic deadline UI", () => {
  render(<CampaignDetail initialOverview={overview} initialRespondents={[]} timezonePickerEnabled />);
  expect(screen.queryByRole("button", { name: /edit close date/i })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /extend deadline/i })).toBeInTheDocument();
});
