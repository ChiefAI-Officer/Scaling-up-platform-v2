/**
 * Unit Tests: Approval Engine
 * Tests the auto-approve logic and routing decisions.
 */

// Mock dependencies before importing the module
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    approvalQueue: {
      create: jest.fn().mockResolvedValue({ id: "test-approval-id" }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  })),
}));

jest.mock("@/services/circle", () => ({
  verifyCertification: jest.fn(),
}));

jest.mock("@/services/notifications", () => ({
  sendApprovalRequest: jest.fn().mockResolvedValue(undefined),
  sendEscalation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

import { evaluateApproval, ApprovalType } from "@/lib/approval-engine";
import { verifyCertification } from "@/services/circle";

describe("Approval Engine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("evaluateApproval", () => {
    const baseInput = {
      coachId: "coach-123",
      coachEmail: "coach@example.com",
      details: "Test request",
      requestedBy: "Coach Name",
    };

    describe("WORKSHOP_REQUEST type", () => {
      it("should route to manual approval even at high certification confidence (CHG-02: threshold raised to 101 / effective-off)", async () => {
        (verifyCertification as jest.Mock).mockResolvedValue({
          verified: true,
          confidence: 90,
          issues: [],
        });

        const result = await evaluateApproval({
          ...baseInput,
          type: "WORKSHOP_REQUEST" as ApprovalType,
          workshopTypeSlug: "scaling-up",
        });

        expect(result.autoApproved).toBe(false);
        expect(result.approvalId).toBe("test-approval-id");
      });

      it("CHG-02 regression: 100% confidence still routes to manual (Circle's max is 100; threshold 101 means always-manual)", async () => {
        (verifyCertification as jest.Mock).mockResolvedValue({
          verified: true,
          confidence: 100,
          issues: [],
        });

        const result = await evaluateApproval({
          ...baseInput,
          type: "WORKSHOP_REQUEST" as ApprovalType,
          workshopTypeSlug: "scaling-up",
        });

        expect(result.autoApproved).toBe(false);
        expect(result.approvalId).toBe("test-approval-id");
      });

      it("should route to manual approval when certification confidence < 85%", async () => {
        (verifyCertification as jest.Mock).mockResolvedValue({
          verified: true,
          confidence: 70,
          issues: ["Low confidence"],
        });

        const result = await evaluateApproval({
          ...baseInput,
          type: "WORKSHOP_REQUEST" as ApprovalType,
          workshopTypeSlug: "scaling-up",
        });

        expect(result.autoApproved).toBe(false);
        expect(result.approvalId).toBe("test-approval-id");
      });

      it("should route to manual approval when not verified", async () => {
        (verifyCertification as jest.Mock).mockResolvedValue({
          verified: false,
          confidence: 50,
          issues: ["Not a member"],
        });

        const result = await evaluateApproval({
          ...baseInput,
          type: "WORKSHOP_REQUEST" as ApprovalType,
        });

        expect(result.autoApproved).toBe(false);
      });
    });

    describe("CUSTOM_PRICING type", () => {
      it("should never auto-approve custom pricing", async () => {
        const result = await evaluateApproval({
          ...baseInput,
          type: "CUSTOM_PRICING" as ApprovalType,
        });

        expect(result.autoApproved).toBe(false);
        expect(result.reason).toContain("always requires manual approval");
      });
    });

    describe("CANCELLATION type", () => {
      it("should never auto-approve cancellations", async () => {
        const result = await evaluateApproval({
          ...baseInput,
          type: "CANCELLATION" as ApprovalType,
        });

        expect(result.autoApproved).toBe(false);
        expect(result.reason).toContain("always requires manual approval");
      });
    });

    describe("DATE_CHANGE type", () => {
      it("should never auto-approve date changes", async () => {
        const result = await evaluateApproval({
          ...baseInput,
          type: "DATE_CHANGE" as ApprovalType,
        });

        expect(result.autoApproved).toBe(false);
        expect(result.reason).toContain("always requires manual approval");
      });
    });

    describe("REFUND type", () => {
      it("should auto-approve refunds <= $250", async () => {
        const result = await evaluateApproval({
          ...baseInput,
          type: "REFUND" as ApprovalType,
          amount: 25000, // $250 in cents
        });

        expect(result.autoApproved).toBe(true);
        expect(result.reason).toContain("within auto-approval limit");
      });

      it("should route to manual approval for refunds > $250", async () => {
        const result = await evaluateApproval({
          ...baseInput,
          type: "REFUND" as ApprovalType,
          amount: 30000, // $300 in cents
        });

        expect(result.autoApproved).toBe(false);
        expect(result.reason).toContain("exceeds $250 limit");
      });
    });
  });
});
