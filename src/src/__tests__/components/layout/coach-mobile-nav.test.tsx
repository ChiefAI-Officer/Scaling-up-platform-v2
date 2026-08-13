let mockPathname = "/portal/home";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

import { fireEvent, render, screen } from "@testing-library/react";
import { CoachMobileNav } from "@/components/layout/coach-mobile-nav";

function openNavigation(referredResultsEnabled: boolean) {
  render(
    <CoachMobileNav
      coachName="Alex"
      {...(referredResultsEnabled
        ? { referredResultsEnabled: true as const }
        : {})}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
}

beforeEach(() => {
  mockPathname = "/portal/home";
});

describe("CoachMobileNav", () => {
  it.each(["Escape", "outside"])("responsive %s dismissal closes and restores trigger focus", (path) => {
    render(<CoachMobileNav coachName="Alex" responsiveEnabled />);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(trigger);
    if (path === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("keeps the existing mobile destinations while the surface is disabled", () => {
    openNavigation(false);

    expect(screen.getByRole("link", { name: "Assessments" })).toHaveAttribute(
      "href",
      "/portal/assessments",
    );
    expect(
      screen.queryByRole("link", { name: "Referred Results" }),
    ).not.toBeInTheDocument();
  });

  it("renders My Campaigns, Referred Results, then Members when enabled", () => {
    openNavigation(true);

    const links = screen
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
  });

  it("marks only Referred Results current on its route", () => {
    mockPathname = "/portal/assessments/referred-results";
    openNavigation(true);

    expect(
      screen.getByRole("link", { name: "My Campaigns" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("link", { name: "Referred Results" }),
    ).toHaveAttribute("aria-current", "page");
  });
});
