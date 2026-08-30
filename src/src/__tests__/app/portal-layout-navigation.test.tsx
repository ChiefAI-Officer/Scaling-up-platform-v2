const mockRequireCoach = jest.fn();
const mockIsReferredResultsEnabled = jest.fn<boolean, []>();
const mockMobileNav = jest.fn(
  (props: { coachName: string; referredResultsEnabled?: true }) => {
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
    referredResultsEnabled?: true;
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
  it("groups the flag-off desktop sidebar and keeps mobile props unchanged", async () => {
    const { container } = render(
      await PortalLayout({ children: <div>Page</div> }),
    );
    const sidebar = container.querySelector("aside");
    expect(sidebar).not.toBeNull();
    const sidebarQueries = within(sidebar as HTMLElement);
    expect(
      sidebarQueries
        .getAllByRole("link")
        .map((link) => link.textContent?.trim()),
    ).toEqual([
      "Dashboard",
      "My Workshops",
      "Registrations",
      "Request Workshop",
      "Assessments",
      "Members",
      "Settings",
      "AAlexCoach",
    ]);
    for (const label of ["WORKSHOPS", "ASSESSMENTS"]) {
      const heading = sidebarQueries.getByText(label);
      expect(heading.closest("a, button")).toBeNull();
      expect(
        sidebarQueries.getByRole("group", { name: label }),
      ).toContainElement(heading);
    }
    expect(mockMobileNav).toHaveBeenCalledWith({
      coachName: "Alex",
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
    expect(links.slice(4, 7)).toEqual([
      { label: "My Campaigns", href: "/portal/assessments" },
      {
        label: "Public Assessments",
        href: "/portal/assessments/referred-results",
      },
      { label: "Members", href: "/portal/members" },
    ]);
    const sidebarQueries = within(sidebar as HTMLElement);
    expect(sidebarQueries.getByText("WORKSHOPS").closest("a, button")).toBeNull();
    expect(sidebarQueries.getByText("ASSESSMENTS").closest("a, button")).toBeNull();
    expect(
      sidebarQueries.getByRole("group", { name: "WORKSHOPS" }),
    ).toContainElement(sidebarQueries.getByText("WORKSHOPS"));
    expect(
      sidebarQueries.getByRole("group", { name: "ASSESSMENTS" }),
    ).toContainElement(sidebarQueries.getByText("ASSESSMENTS"));
    expect(mockMobileNav).toHaveBeenCalledWith({
      coachName: "Alex",
      referredResultsEnabled: true,
    });
  });
});
