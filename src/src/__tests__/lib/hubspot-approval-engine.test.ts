/**
 * Unit Tests: HubSpot Coach Contract Status Auto-Approval (Wave 8-D)
 *
 * Tests the HubSpot-based auto-approval path in evaluateApproval.
 * Mocks: getHubSpotCoachContractStatus, db, inngest client.
 */

// ---------------------------------------------------------------------------
// Mock db before any module imports
// jest.mock factories are hoisted to the top of the file by Jest's babel
// transform, so we cannot reference const/let variables declared in the outer
// scope inside the factory body.  Instead we return jest.fn() stubs directly
// and import the mocked module after all mocks are registered so we can access
// the same function references in our assertions.
// ---------------------------------------------------------------------------
jest.mock("@/lib/db", () => ({
  db: {
    approvalQueue: {
      create: jest.fn().mockResolvedValue({ id: "approval-id-123" }),
      update: jest.fn().mockResolvedValue({ id: "approval-id-123" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock Circle certification service
// ---------------------------------------------------------------------------
jest.mock("@/services/circle", () => ({
  verifyCertification: jest.fn().mockResolvedValue({
    verified: false,
    confidence: 0,
    issues: ["auto-approve not via circle"],
  }),
}));

// ---------------------------------------------------------------------------
// Mock notification service
// ---------------------------------------------------------------------------
jest.mock("@/services/notifications", () => ({
  sendApprovalRequest: jest.fn().mockResolvedValue(undefined),
  sendEscalation: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock audit log
// ---------------------------------------------------------------------------
jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock approval-thread formatter
// ---------------------------------------------------------------------------
jest.mock("@/lib/approvals/approval-thread", () => ({
  formatApprovalMessage: jest.fn().mockReturnValue("test approval message"),
}));

// ---------------------------------------------------------------------------
// Mock HubSpot service — this is what we're testing integration with
// ---------------------------------------------------------------------------
jest.mock("@/services/hubspot", () => ({
  getHubSpotCoachContractStatus: jest.fn(),
  isHubSpotConfigured: jest.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Mock Inngest client
// ---------------------------------------------------------------------------
jest.mock("@/inngest/client", () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks — all modules are the mocked versions
// ---------------------------------------------------------------------------
import { evaluateApproval, ApprovalType } from "@/lib/approval-engine";
import { db } from "@/lib/db";
import { getHubSpotCoachContractStatus } from "@/services/hubspot";
import { inngest } from "@/inngest/client";

// Typed references to the mocked fns
const mockApprovalQueueCreate = db.approvalQueue.create as jest.Mock;
const mockApprovalQueueUpdate = db.approvalQueue.update as jest.Mock;
const mockAuditLogCreate = db.auditLog.create as jest.Mock;
const mockGetHubSpotCoachContractStatus = getHubSpotCoachContractStatus as jest.Mock;
const mockInngestSend = inngest.send as jest.Mock;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const baseInput = {
  coachId: "coach-abc",
  coachEmail: "coach@example.com",
  hubspotId: "hs-contact-789",
  details: "Workshop request details",
  requestedBy: "Coach Name",
  workshopId: "ws-001",
  workshopTypeSlug: "scaling-up",
};

// Silence console output in tests
beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("HubSpot auto-approval (Wave 8-D)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset env vars
    delete process.env.HUBSPOT_AUTO_APPROVE_ENABLED;
    delete process.env.HUBSPOT_AUTO_APPROVE_SHADOW;
    delete process.env.HUBSPOT_AUTO_APPROVE_ALLOWLIST;
    // Restore default return values after clearAllMocks
    mockApprovalQueueCreate.mockResolvedValue({ id: "approval-id-123" });
    mockApprovalQueueUpdate.mockResolvedValue({ id: "approval-id-123" });
    mockAuditLogCreate.mockResolvedValue({});
    mockInngestSend.mockResolvedValue(undefined);
  });

  // Test 1: Happy path — certified coach auto-approved
  it("auto-approves WORKSHOP_REQUEST when coach has Certified Coach status", async () => {
    process.env.HUBSPOT_AUTO_APPROVE_ENABLED = "true";
    mockGetHubSpotCoachContractStatus.mockResolvedValue("Certified Coach");

    const result = await evaluateApproval({
      ...baseInput,
      type: "WORKSHOP_REQUEST" as ApprovalType,
    });

    expect(result.autoApproved).toBe(true);
    expect(result.reason).toContain("Certified Coach");

    // ApprovalQueue row updated
    expect(mockApprovalQueueUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          respondedBy: "system:hubspot-coach-status",
          decision: "APPROVED",
        }),
      })
    );

    // AuditLog written
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "auto_approved_hubspot_coach_status",
          performedBy: "system:hubspot-coach-status",
        }),
      })
    );

    // Inngest event sent
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "workshop/approved",
      })
    );
  });

  // Test 2: Type gate — CANCELLATION should never auto-approve
  it("routes CANCELLATION to manual review even when all HubSpot conditions are met", async () => {
    process.env.HUBSPOT_AUTO_APPROVE_ENABLED = "true";
    mockGetHubSpotCoachContractStatus.mockResolvedValue("Certified Coach");

    const result = await evaluateApproval({
      ...baseInput,
      type: "CANCELLATION" as ApprovalType,
    });

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain("always requires manual approval");
    expect(mockGetHubSpotCoachContractStatus).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  // Test 3: Type gate — CUSTOM_PRICING should never auto-approve
  it("routes CUSTOM_PRICING to manual review even when all HubSpot conditions are met", async () => {
    process.env.HUBSPOT_AUTO_APPROVE_ENABLED = "true";
    mockGetHubSpotCoachContractStatus.mockResolvedValue("Certified Coach");

    const result = await evaluateApproval({
      ...baseInput,
      type: "CUSTOM_PRICING" as ApprovalType,
    });

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain("always requires manual approval");
    expect(mockGetHubSpotCoachContractStatus).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  // Test 4: Non-certified status → manual review
  it("routes to manual review when HubSpot coach_contract_status is Pending (not Certified Coach)", async () => {
    process.env.HUBSPOT_AUTO_APPROVE_ENABLED = "true";
    mockGetHubSpotCoachContractStatus.mockResolvedValue("Pending");

    const result = await evaluateApproval({
      ...baseInput,
      type: "WORKSHOP_REQUEST" as ApprovalType,
    });

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain("status_not_certified");
    expect(mockInngestSend).not.toHaveBeenCalled();
    // DB writes should NOT happen on this path (falls through to createManualApproval)
    expect(mockApprovalQueueUpdate).not.toHaveBeenCalled();
  });

  // Test 5: No hubspotId → manual review
  it("routes to manual review when coach.hubspotId is null", async () => {
    process.env.HUBSPOT_AUTO_APPROVE_ENABLED = "true";
    mockGetHubSpotCoachContractStatus.mockResolvedValue("Certified Coach");

    const result = await evaluateApproval({
      ...baseInput,
      hubspotId: undefined,
      type: "WORKSHOP_REQUEST" as ApprovalType,
    });

    expect(result.autoApproved).toBe(false);
    expect(mockGetHubSpotCoachContractStatus).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  // Test 6: Kill switch off → manual review regardless
  it("routes to manual review when HUBSPOT_AUTO_APPROVE_ENABLED is not set", async () => {
    // Env var intentionally NOT set
    mockGetHubSpotCoachContractStatus.mockResolvedValue("Certified Coach");

    const result = await evaluateApproval({
      ...baseInput,
      type: "WORKSHOP_REQUEST" as ApprovalType,
    });

    expect(result.autoApproved).toBe(false);
    expect(mockGetHubSpotCoachContractStatus).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  // Test 7: HubSpot API throws → fail closed, manual review
  it("fails closed to manual review when HubSpot API throws an error", async () => {
    process.env.HUBSPOT_AUTO_APPROVE_ENABLED = "true";
    mockGetHubSpotCoachContractStatus.mockRejectedValue(new Error("HubSpot 503 Service Unavailable"));

    const result = await evaluateApproval({
      ...baseInput,
      type: "WORKSHOP_REQUEST" as ApprovalType,
    });

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain("hubspot_api_error");
    expect(mockInngestSend).not.toHaveBeenCalled();
    // No auto-approve DB writes
    expect(mockApprovalQueueUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  // Test 8: Shadow mode — log but don't act
  it("shadow mode: logs would-auto-approve but returns manual review without DB writes", async () => {
    process.env.HUBSPOT_AUTO_APPROVE_ENABLED = "true";
    process.env.HUBSPOT_AUTO_APPROVE_SHADOW = "true";
    mockGetHubSpotCoachContractStatus.mockResolvedValue("Certified Coach");

    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const result = await evaluateApproval({
      ...baseInput,
      type: "WORKSHOP_REQUEST" as ApprovalType,
    });

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain("shadow_mode");

    // Shadow log was emitted
    const logCalls = consoleSpy.mock.calls.map((c) => c.join(" "));
    expect(logCalls.some((msg) => msg.includes("would auto-approve"))).toBe(true);

    // No DB writes or Inngest events
    expect(mockApprovalQueueUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // Test 9: Allowlist — listed coach auto-approves, unlisted does not
  it("only auto-approves coaches on the allowlist when HUBSPOT_AUTO_APPROVE_ALLOWLIST is set", async () => {
    process.env.HUBSPOT_AUTO_APPROVE_ENABLED = "true";
    process.env.HUBSPOT_AUTO_APPROVE_ALLOWLIST = "listed@example.com,other@example.com";
    mockGetHubSpotCoachContractStatus.mockResolvedValue("Certified Coach");

    // Unlisted coach → manual review
    const unlistedResult = await evaluateApproval({
      ...baseInput,
      coachEmail: "unlisted@example.com",
      type: "WORKSHOP_REQUEST" as ApprovalType,
    });
    expect(unlistedResult.autoApproved).toBe(false);
    expect(mockGetHubSpotCoachContractStatus).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();

    jest.clearAllMocks();
    mockApprovalQueueCreate.mockResolvedValue({ id: "approval-id-123" });
    mockApprovalQueueUpdate.mockResolvedValue({ id: "approval-id-123" });
    mockGetHubSpotCoachContractStatus.mockResolvedValue("Certified Coach");
    mockInngestSend.mockResolvedValue(undefined);

    // Listed coach → auto-approved
    const listedResult = await evaluateApproval({
      ...baseInput,
      coachEmail: "listed@example.com",
      type: "WORKSHOP_REQUEST" as ApprovalType,
    });
    expect(listedResult.autoApproved).toBe(true);
    expect(mockInngestSend).toHaveBeenCalled();
  });
});
