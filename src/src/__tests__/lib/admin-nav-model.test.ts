import {
  ADMIN_NAV,
  adminNavHrefs,
  groupLeaves,
  type NavGroup,
  type NavLink,
} from "@/lib/nav/admin-nav-model";

const EXPECTED_HREFS = [
  "/admin/dashboard",
  "/workshops",
  "/admin/registrations",
  "/admin/surveys",
  "/templates",
  "/admin/categories",
  "/admin/pricing",
  "/admin/approvals",
  "/admin/assessments",
  "/admin/workflows",
  "/admin/transactional-emails",
  "/admin/files",
  "/coaches",
  "/partners",
  "/admin/financials",
  "/admin/refunds-needed",
];

describe("admin-nav-model", () => {
  it("homes all 16 known routes exactly once", () => {
    const hrefs = adminNavHrefs();
    expect(hrefs).toHaveLength(16);
    expect(new Set(hrefs).size).toBe(16);
    expect([...hrefs].sort()).toEqual([...EXPECTED_HREFS].sort());
  });

  it("Approvals is a standalone top-level link with the approvals badge", () => {
    const approvals = ADMIN_NAV.find(
      (e): e is NavLink => e.kind === "link" && e.label === "Approvals"
    );
    expect(approvals).toBeDefined();
    expect(approvals?.href).toBe("/admin/approvals");
    expect(approvals?.badge).toBe("approvals");
  });

  it("Workshops group does NOT contain Approvals and uses the 'Workshop Surveys' label", () => {
    const workshops = ADMIN_NAV.find(
      (e): e is NavGroup => e.kind === "group" && e.label === "Workshops"
    )!;
    const leaves = groupLeaves(workshops);
    expect(leaves.map((l) => l.label)).not.toContain("Approvals");
    expect(leaves.find((l) => l.href === "/admin/surveys")?.label).toBe("Workshop Surveys");
  });

  it("Assessments is a plain top-level link (no gateway arrow)", () => {
    const assessments = ADMIN_NAV.find(
      (e): e is NavLink => e.kind === "link" && e.label === "Assessments"
    );
    expect(assessments?.kind).toBe("link");
    expect(assessments?.href).toBe("/admin/assessments");
    expect(assessments).not.toHaveProperty("gateway");
    expect((assessments as { gateway?: unknown })?.gateway).toBeUndefined();
  });

  it("Financials group carries a rolled-up refunds badge and nests Refunds", () => {
    const fin = ADMIN_NAV.find(
      (e): e is NavGroup => e.kind === "group" && e.label === "Financials"
    )!;
    expect(fin.badge).toBe("refunds");
    const refunds = groupLeaves(fin).find((l) => l.label === "Refunds");
    expect(refunds?.href).toBe("/admin/refunds-needed");
    expect(refunds?.badge).toBe("refunds");
  });
});
