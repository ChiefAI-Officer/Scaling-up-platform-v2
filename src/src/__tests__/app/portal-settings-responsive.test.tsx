import { render, screen } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => false);
jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));

jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: jest.fn(),
}));
jest.mock("@/lib/validations", () => ({
  getCoachBioMissingFields: jest.fn(() => []),
}));
jest.mock("@/components/auth/change-password-form", () => function ChangePasswordFormMock() {
  return <div />;
});

function mockCoachProfileForm({
  responsiveEnabled = false,
}: {
  responsiveEnabled?: boolean;
}) {
  return <div data-testid="coach-profile-form" data-responsive={String(responsiveEnabled)} />;
}
jest.mock("@/components/coach/coach-profile-form", () => ({
  CoachProfileForm: mockCoachProfileForm,
}));

import { requireCoach } from "@/lib/auth/authorization";
import SettingsPage from "@/app/(portal)/portal/settings/page";

const coach = {
  id: "coach-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  bio: "Analytical engines coach",
  title: "Coach",
  company: "Analytical Engines",
  profileImage: null,
  linkedinUrl: null,
  showBookCallCta: true,
  hubspotId: null,
  circleId: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockResponsiveFlag.mockReturnValue(false);
  (requireCoach as jest.Mock).mockResolvedValue({ coach });
});

describe("Portal settings responsive host", () => {
  it("keeps the profile form on its default-off responsive boundary", async () => {
    render(await SettingsPage());

    expect(screen.getByTestId("coach-profile-form")).toBeInTheDocument();
    expect(screen.getByTestId("coach-profile-form")).toHaveAttribute("data-responsive", "false");
  });

  it("forwards the enabled root mobile flag to the profile form", async () => {
    mockResponsiveFlag.mockReturnValue(true);

    render(await SettingsPage());

    expect(screen.getByTestId("coach-profile-form")).toHaveAttribute("data-responsive", "true");
  });
});
