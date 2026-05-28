import { coachAccountNavItem, coachPrimaryNavItems } from "@/lib/coach-nav";

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
});
