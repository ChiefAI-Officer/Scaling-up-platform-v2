const approvalCount = jest.fn();
const registrationCount = jest.fn();

jest.mock("@/lib/db", () => ({
  db: {
    approvalQueue: { count: (...a: unknown[]) => approvalCount(...a) },
    registration: { count: (...a: unknown[]) => registrationCount(...a) },
  },
}));

import { getAdminNavBadgeCounts } from "@/lib/nav/admin-nav-badges";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getAdminNavBadgeCounts", () => {
  it("counts PENDING approvals and unrefunded paid regs on canceled workshops", async () => {
    approvalCount.mockResolvedValue(3);
    registrationCount.mockResolvedValue(2);

    const counts = await getAdminNavBadgeCounts();
    expect(counts).toEqual({ approvals: 3, refunds: 2 });

    expect(approvalCount).toHaveBeenCalledWith({ where: { status: "PENDING" } });
    expect(registrationCount).toHaveBeenCalledWith({
      where: {
        paymentStatus: "COMPLETED",
        refundedAt: null,
        workshop: { status: "CANCELED" },
      },
    });
  });

  it("returns zeros when nothing is pending", async () => {
    approvalCount.mockResolvedValue(0);
    registrationCount.mockResolvedValue(0);
    expect(await getAdminNavBadgeCounts()).toEqual({ approvals: 0, refunds: 0 });
  });

  it("fails soft to zeros (never throws) when a count query rejects", async () => {
    approvalCount.mockRejectedValue(new Error("db down"));
    registrationCount.mockResolvedValue(2);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const counts = await getAdminNavBadgeCounts();
    expect(counts).toEqual({ approvals: 0, refunds: 0 });
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
  });
});
