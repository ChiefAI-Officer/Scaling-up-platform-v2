import {
  coachAccountNavItem,
  getCoachPrimaryNavItems,
} from "@/lib/coach-nav";

function navShape(referredResultsEnabled: boolean) {
  return getCoachPrimaryNavItems({ referredResultsEnabled }).map((group) => ({
    label: group.label,
    items: group.items.map(({ label, href }) => ({ label, href })),
  }));
}

describe("coach navigation config", () => {
  it("groups the enabled coach destinations in the requested order", () => {
    expect(navShape(true)).toEqual([
      {
        label: null,
        items: [{ label: "Dashboard", href: "/portal/home" }],
      },
      {
        label: "WORKSHOPS",
        items: [
          { label: "My Workshops", href: "/portal/workshops" },
          { label: "Registrations", href: "/portal/registrations" },
          { label: "Request Workshop", href: "/portal/request" },
        ],
      },
      {
        label: "ASSESSMENTS",
        items: [
          { label: "My Campaigns", href: "/portal/assessments" },
          {
            label: "Public Assessments",
            href: "/portal/assessments/referred-results",
          },
          { label: "Members", href: "/portal/members" },
        ],
      },
    ]);
  });

  it("groups the flag-off Assessments destination under ASSESSMENTS", () => {
    expect(navShape(false)).toEqual([
      {
        label: null,
        items: [{ label: "Dashboard", href: "/portal/home" }],
      },
      {
        label: "WORKSHOPS",
        items: [
          { label: "My Workshops", href: "/portal/workshops" },
          { label: "Registrations", href: "/portal/registrations" },
          { label: "Request Workshop", href: "/portal/request" },
        ],
      },
      {
        label: "ASSESSMENTS",
        items: [
          { label: "Assessments", href: "/portal/assessments" },
          { label: "Members", href: "/portal/members" },
        ],
      },
    ]);
  });

  it("does not expose admin-only or unsupported coach links", () => {
    const hrefs = [
      ...getCoachPrimaryNavItems({ referredResultsEnabled: true }).flatMap(
        (group) => group.items.map((item) => item.href),
      ),
      coachAccountNavItem.href,
    ];

    expect(hrefs).not.toContain("/portal/templates");
    expect(hrefs).not.toContain("/portal/follow-up");
    expect(coachAccountNavItem.href).toBe("/portal/settings");
  });
});
