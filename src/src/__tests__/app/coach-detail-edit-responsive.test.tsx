import { render, screen } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => false);
jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));

jest.mock("@/lib/auth/authorization", () => ({
  requireAuth: jest.fn().mockResolvedValue({ user: { role: "ADMIN" } }),
  isPrivilegedRole: jest.fn(() => true),
}));

const mockCoach = {
  id: "coach-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "avery.long.coach.email.address@example.com",
  phone: "+1 555 0100",
  title: "Certified Coach",
  company: "Analytical Engines",
  territory: "Global",
  bio: "Coach biography",
  profileImage: null,
  certificationStatus: "ACTIVE",
  paymentStatus: "CURRENT",
  hubspotId: "hubspot-1",
  circleId: "circle-1",
  syncedAt: new Date("2026-08-10T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  showBookCallCta: true,
  bookCallUrl: "https://example.com/call",
  linkedinUrl: "https://linkedin.com/in/ada",
  user: { email: "ada@example.com" },
  certifications: [],
  workshops: [],
};

jest.mock("@/lib/db", () => ({
  db: {
    coach: { findUnique: jest.fn().mockImplementation(() => Promise.resolve(mockCoach)) },
    workshop: { count: jest.fn().mockResolvedValue(0) },
  },
}));
jest.mock("@/services/hubspot", () => ({
  lookupHubSpotContact: jest.fn().mockResolvedValue({ status: "unconfigured" }),
  getHubSpotPortalId: jest.fn(() => null),
}));
jest.mock("@/components/coaches/hubspot-side-card", () => ({ HubSpotSideCard: () => null }));
jest.mock("@/components/coaches/add-certification-modal", () => ({ AddCertificationModal: () => <button>Add certification</button> }));
jest.mock("@/components/coaches/remove-certification-button", () => ({ RemoveCertificationButton: () => <button>Remove certification</button> }));
jest.mock("@/components/coaches/delete-coach-button", () => ({ DeleteCoachButton: () => <button>Delete coach</button> }));
jest.mock("@/components/coaches/send-password-reset-button", () => ({ SendPasswordResetButton: () => <button>Send password reset</button> }));

let formProps: Record<string, unknown> | null = null;
jest.mock("@/components/coach/coach-profile-form", () => ({
  CoachProfileForm: (props: Record<string, unknown>) => {
    formProps = props;
    return <div data-testid="coach-profile-form" />;
  },
}));

import CoachDetailPage from "@/app/(dashboard)/coaches/[id]/page";
import EditCoachPage from "@/app/(dashboard)/coaches/[id]/edit/page";

beforeEach(() => {
  mockResponsiveFlag.mockReturnValue(false);
  formProps = null;
});

it("leaves detail action sizing unchanged when disabled", async () => {
  render(await CoachDetailPage({ params: Promise.resolve({ id: "coach-1" }) }));
  expect(screen.getByRole("link", { name: "Edit Coach" })).not.toHaveClass("min-h-11");
});

it("reflows the detail header and long values with 44px actions when enabled", async () => {
  mockResponsiveFlag.mockReturnValue(true);
  const { container } = render(await CoachDetailPage({ params: Promise.resolve({ id: "coach-1" }) }));

  expect(container.querySelector("[data-responsive-page-header]")).toBeInTheDocument();
  expect(screen.getByText(mockCoach.email)).toHaveClass("break-all");
  expect(screen.getByRole("link", { name: "Edit Coach" })).toHaveClass("min-h-11");
  screen.getAllByRole("link", { name: /Create Workshop/i }).forEach((link) => {
    expect(link).toHaveClass("min-h-11");
  });
});

it("passes the default-off and enabled boundary into the admin edit form", async () => {
  render(await EditCoachPage({ params: Promise.resolve({ id: "coach-1" }) }));
  expect(formProps).toMatchObject({ responsiveEnabled: false });

  mockResponsiveFlag.mockReturnValue(true);
  render(await EditCoachPage({ params: Promise.resolve({ id: "coach-1" }) }));
  expect(formProps).toMatchObject({ responsiveEnabled: true });
});
