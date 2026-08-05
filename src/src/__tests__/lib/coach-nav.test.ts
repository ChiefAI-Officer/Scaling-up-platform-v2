import {
  coachAccountNavItem,
  coachPrimaryNavItems,
  getCoachPrimaryNavItems,
} from "@/lib/coach-nav";

describe("coach navigation config", () => {
  it("matches the intended coach portal destinations", () => {
    expect(coachPrimaryNavItems.map((item) => item.href)).toEqual([
      "/portal/home",
      "/portal/workshops",
      "/portal/members",
      "/portal/assessments",
      "/portal/registrations",
      "/portal/request",
    ]);

    expect(coachAccountNavItem.href).toBe("/portal/settings");
  });

  it("does not expose admin-only or unsupported coach links", () => {
    const hrefs = [...coachPrimaryNavItems.map((item) => item.href), coachAccountNavItem.href];

    expect(hrefs).not.toContain("/portal/templates");
    expect(hrefs).not.toContain("/portal/follow-up");
  });

  it("preserves the existing navigation exactly while Referred Results is off", () => {
    expect(getCoachPrimaryNavItems({ referredResultsEnabled: false })).toEqual(
      coachPrimaryNavItems,
    );
  });

  it("places the enabled result surface between My Campaigns and Members", () => {
    const items = getCoachPrimaryNavItems({ referredResultsEnabled: true });

    expect(items.map(({ label, href }) => ({ label, href }))).toEqual([
      { label: "Dashboard", href: "/portal/home" },
      { label: "My Workshops", href: "/portal/workshops" },
      { label: "My Campaigns", href: "/portal/assessments" },
      {
        label: "Referred Results",
        href: "/portal/assessments/referred-results",
      },
      { label: "Members", href: "/portal/members" },
      { label: "Registrations", href: "/portal/registrations" },
      { label: "Request Workshop", href: "/portal/request" },
    ]);
  });
});
