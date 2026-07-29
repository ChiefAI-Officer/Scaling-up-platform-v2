const mockRequireCoach = jest.fn();
const mockIsReferredResultsEnabled = jest.fn<boolean, []>();
const mockMobileNav = jest.fn(
  (props: { coachName: string; referredResultsEnabled: boolean }) => {
    void props;
    return null;
  },
);

jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: () => mockRequireCoach(),
}));

jest.mock("@/lib/assessments/wave-83-flags", () => ({
  isReferredResultsEnabled: () => mockIsReferredResultsEnabled(),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/portal/home",
}));

jest.mock("@/components/layout/coach-mobile-nav", () => ({
  CoachMobileNav: (props: {
    coachName: string;
    referredResultsEnabled: boolean;
  }) => mockMobileNav(props),
}));

jest.mock("@/components/layout/sign-out-button", () => ({
  SignOutButton: () => null,
}));

jest.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

import { render, within } from "@testing-library/react";
import PortalLayout from "@/app/(portal)/layout";

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireCoach.mockResolvedValue({
    coach: { firstName: "Alex" },
    session: { user: { name: "Alex Morgan" } },
  });
  mockIsReferredResultsEnabled.mockReturnValue(false);
});

describe("(portal)/layout coach navigation", () => {
  it("keeps the flag-off desktop sidebar unchanged and passes false to mobile", async () => {
    const { container } = render(
      await PortalLayout({ children: <div>Page</div> }),
    );
    const sidebar = container.querySelector("aside");
    expect(sidebar).not.toBeNull();
    expect(
      within(sidebar as HTMLElement)
        .getAllByRole("link")
        .map((link) => link.textContent?.trim()),
    ).toEqual([
      "Dashboard",
      "My Workshops",
      "Members",
      "Assessments",
      "Registrations",
      "Request Workshop",
      "Settings",
      "AAlexCoach",
    ]);
    expect(mockMobileNav).toHaveBeenCalledWith({
      coachName: "Alex",
      referredResultsEnabled: false,
    });
  });

  it("uses the server-derived flag for the real desktop and mobile contracts", async () => {
    mockIsReferredResultsEnabled.mockReturnValue(true);
    const { container } = render(
      await PortalLayout({ children: <div>Page</div> }),
    );

    const sidebar = container.querySelector("aside");
    expect(sidebar).not.toBeNull();
    const links = within(sidebar as HTMLElement)
      .getAllByRole("link")
      .map((link) => ({
        label: link.textContent?.trim(),
        href: link.getAttribute("href"),
      }));
    expect(links.slice(2, 5)).toEqual([
      { label: "My Campaigns", href: "/portal/assessments" },
      {
        label: "Referred Results",
        href: "/portal/assessments/referred-results",
      },
      { label: "Members", href: "/portal/members" },
    ]);
    expect(mockMobileNav).toHaveBeenCalledWith({
      coachName: "Alex",
      referredResultsEnabled: true,
    });
  });
});
