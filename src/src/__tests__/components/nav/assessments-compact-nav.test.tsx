import { fireEvent, render, screen } from "@testing-library/react";
import { AssessmentsCompactNav } from "@/components/nav/assessments-compact-nav";

let pathname = "/admin/assessments/templates/template-1/versions/version-1/edit";

jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const entries = [
  { href: "/admin/assessments", label: "Dashboard", exact: true },
  { href: "/admin/assessments/organizations", label: "Organizations" },
  { href: "/admin/assessments/templates", label: "Templates" },
];

describe("AssessmentsCompactNav", () => {
  beforeEach(() => {
    pathname =
      "/admin/assessments/templates/template-1/versions/version-1/edit";
  });

  it("labels nested routes by their longest matching assessment entry", () => {
    render(<AssessmentsCompactNav entries={entries} />);

    expect(
      screen.getByRole("button", {
        name: "Assessment section: Templates",
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("discloses the same links and marks the current section", () => {
    render(<AssessmentsCompactNav entries={entries} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Assessment section: Templates",
      }),
    );

    expect(screen.getByRole("link", { name: "Organizations" })).toHaveAttribute(
      "href",
      "/admin/assessments/organizations",
    );
    expect(screen.getByRole("link", { name: "Templates" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("uses 44px controls and closes after navigation", () => {
    render(<AssessmentsCompactNav entries={entries} />);
    const trigger = screen.getByRole("button", {
      name: "Assessment section: Templates",
    });

    expect(trigger).toHaveClass("min-h-11");
    fireEvent.click(trigger);
    expect(screen.getByRole("link", { name: "Organizations" })).toHaveClass(
      "min-h-11",
    );

    fireEvent.click(screen.getByRole("link", { name: "Organizations" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Templates" })).toBeNull();
  });

  it("closes when the pathname changes outside its own links", () => {
    const { rerender } = render(<AssessmentsCompactNav entries={entries} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Assessment section: Templates" }),
    );

    pathname = "/admin/assessments/organizations";
    rerender(<AssessmentsCompactNav entries={entries} />);

    expect(
      screen.getByRole("button", {
        name: "Assessment section: Organizations",
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
