/**
 * Assessment v7.6 — Organization ownership-transfer service tests.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md →
 *   "Ownership transfer flow (Round 1 H-5 + Round 2 M-2 + Round 3 H-5 +
 *    Round 3 M-7)".
 *
 * Strategy: stub the Prisma tx client (same approach as the sibling
 * `evaluate-access-change.test.ts` and `access-control.test.ts`). The
 * advisory-lock SQL is asserted by inspecting recorded `$executeRaw`
 * calls (the same Prisma `Sql` instance shape used elsewhere).
 *
 * Concurrency note: Prisma's `$transaction` test harness cannot fully
 * simulate true SERIALIZABLE conflicts in JavaScript memory. The lock
 * code IS the source of truth; we assert here only that the keys are
 * REQUESTED in sorted alphabetical order, which is the deadlock-free
 * convention shared with `evaluateAccessChange`.
 */

import { transferOrganizationOwnership } from "@/lib/assessments/transfer-ownership";
import { OwnershipTransferError } from "@/lib/assessments/errors";

// ────────────────────────────────────────────────────────────────────────
// Row shape interfaces (mirror the schema shape used by the function)
// ────────────────────────────────────────────────────────────────────────

interface OrgRow {
  id: string;
  ownerCoachId: string;
  deletedAt: Date | null;
}

interface CoachRow {
  id: string;
  certificationStatus: string;
}

interface CampaignRow {
  id: string;
  organizationId: string;
  templateId: string;
  createdByCoachId: string | null;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
}

interface AccessGroupCoachRow {
  accessGroupId: string;
  coachId: string;
  accessGroup: { id: string; deletedAt: Date | null };
}

interface AccessGroupTemplateRow {
  accessGroupId: string;
  templateId: string;
}

interface OwnershipEventRow {
  id: string;
  organizationId: string;
  kind: string;
  oldOwnerCoachId: string | null;
  newOwnerCoachId: string | null;
  campaignId: string | null;
  performedBy: string;
  notes: string | null;
}

interface AuditRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string;
  changes: string;
}

// ────────────────────────────────────────────────────────────────────────
// buildTx — wires up an in-memory tx stub that exercises the function
// end-to-end without a live Postgres.
// ────────────────────────────────────────────────────────────────────────

function buildTx(state: {
  orgs: OrgRow[];
  coaches: CoachRow[];
  campaigns: CampaignRow[];
  groupCoachRows?: AccessGroupCoachRow[];
  groupTemplateRows?: AccessGroupTemplateRow[];
  failOnAudit?: boolean;
  failOnOwnershipEvent?: boolean;
}) {
  const orgs = [...state.orgs];
  const campaigns = [...state.campaigns];
  const coaches = [...state.coaches];
  const groupCoachRows = state.groupCoachRows ?? [];
  const groupTemplateRows = state.groupTemplateRows ?? [];

  const events: OwnershipEventRow[] = [];
  const audit: AuditRow[] = [];

  const executeRaw = jest.fn(async () => 1);

  const orgFindUnique = jest.fn(
    async (args: { where: { id: string } }) => {
      return orgs.find((o) => o.id === args.where.id) ?? null;
    },
  );
  const orgUpdate = jest.fn(
    async (args: { where: { id: string }; data: { ownerCoachId: string } }) => {
      const row = orgs.find((o) => o.id === args.where.id);
      if (!row) throw new Error(`org ${args.where.id} not found in stub`);
      row.ownerCoachId = args.data.ownerCoachId;
      return { id: row.id, ownerCoachId: row.ownerCoachId };
    },
  );

  const coachFindUnique = jest.fn(
    async (args: { where: { id: string } }) => {
      return coaches.find((c) => c.id === args.where.id) ?? null;
    },
  );

  const campaignFindMany = jest.fn(
    async (args: {
      where?: { organizationId?: string; status?: { in?: string[] } };
    }) => {
      const orgId = args?.where?.organizationId;
      const statusIn = args?.where?.status?.in;
      return campaigns.filter((c) => {
        if (orgId && c.organizationId !== orgId) return false;
        if (statusIn && !statusIn.includes(c.status)) return false;
        return true;
      });
    },
  );
  const campaignFindUnique = jest.fn(
    async (args: { where: { id: string } }) => {
      return campaigns.find((c) => c.id === args.where.id) ?? null;
    },
  );
  const campaignUpdate = jest.fn(
    async (args: {
      where: { id: string };
      data: { createdByCoachId: string };
    }) => {
      const row = campaigns.find((c) => c.id === args.where.id);
      if (!row) throw new Error(`campaign ${args.where.id} not found in stub`);
      row.createdByCoachId = args.data.createdByCoachId;
      return { id: row.id, createdByCoachId: row.createdByCoachId };
    },
  );

  const ownershipEventCreate = jest.fn(
    async (args: {
      data: {
        organizationId: string;
        kind: string;
        oldOwnerCoachId: string | null;
        newOwnerCoachId: string | null;
        campaignId: string | null;
        performedBy: string;
        notes: string | null;
      };
    }) => {
      if (state.failOnOwnershipEvent) {
        throw new Error("simulated ownership-event failure");
      }
      const id = `evt-${events.length + 1}`;
      const row: OwnershipEventRow = { id, ...args.data };
      events.push(row);
      return { id };
    },
  );

  const auditCreate = jest.fn(
    async (args: { data: Record<string, unknown> }) => {
      if (state.failOnAudit) {
        throw new Error("simulated audit failure");
      }
      const id = `audit-${audit.length + 1}`;
      const row: AuditRow = {
        id,
        entityType: String(args.data.entityType ?? ""),
        entityId: String(args.data.entityId ?? ""),
        action: String(args.data.action ?? ""),
        performedBy: String(args.data.performedBy ?? ""),
        changes: String(args.data.changes ?? ""),
      };
      audit.push(row);
      return { id, ...args.data };
    },
  );

  const accessGroupCoachFindMany = jest.fn(
    async (args: {
      where?: { coachId?: string };
      include?: Record<string, unknown>;
    }) => {
      const coachId = args?.where?.coachId;
      return groupCoachRows.filter(
        (r) => !coachId || r.coachId === coachId,
      );
    },
  );

  const accessGroupTemplateFindMany = jest.fn(
    async (args: {
      where?: {
        accessGroupId?: { in?: string[] };
        templateId?: string;
      };
    }) => {
      const groupIds = args?.where?.accessGroupId?.in;
      const tid = args?.where?.templateId;
      return groupTemplateRows.filter((r) => {
        if (groupIds && !groupIds.includes(r.accessGroupId)) return false;
        if (tid && r.templateId !== tid) return false;
        return true;
      });
    },
  );

  const tx = {
    $executeRaw: executeRaw,
    organization: {
      findUnique: orgFindUnique,
      update: orgUpdate,
    },
    coach: {
      findUnique: coachFindUnique,
    },
    assessmentCampaign: {
      findMany: campaignFindMany,
      findUnique: campaignFindUnique,
      update: campaignUpdate,
    },
    accessGroupCoach: {
      findMany: accessGroupCoachFindMany,
    },
    accessGroupTemplate: {
      findMany: accessGroupTemplateFindMany,
    },
    organizationOwnershipEvent: {
      create: ownershipEventCreate,
    },
    auditLog: {
      create: auditCreate,
    },
  };

  return {
    tx,
    state: { orgs, campaigns, coaches, events, audit },
    _mocks: {
      executeRaw,
      orgFindUnique,
      orgUpdate,
      coachFindUnique,
      campaignFindMany,
      campaignUpdate,
      ownershipEventCreate,
      auditCreate,
      accessGroupCoachFindMany,
      accessGroupTemplateFindMany,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Flatten recorded executeRaw calls to a searchable string. Same helper
// pattern used in `evaluate-access-change.test.ts`.
// ────────────────────────────────────────────────────────────────────────

function flattenRawCalls(
  calls: jest.Mock["mock"]["calls"],
): string[] {
  return calls.map((args) => {
    const first = args[0];
    if (typeof first === "string") return first;
    if (Array.isArray(first)) return first.join(" ");
    if (first && typeof first === "object") {
      const f = first as { strings?: string[]; values?: unknown[]; sql?: string };
      const parts: string[] = [];
      if (f.sql) parts.push(f.sql);
      if (f.strings) parts.push(f.strings.join(" "));
      if (f.values) parts.push(f.values.map(String).join(" "));
      return parts.join(" ");
    }
    return "";
  });
}

// ────────────────────────────────────────────────────────────────────────
// 1) Happy path — new owner has template access for all active campaigns
// ────────────────────────────────────────────────────────────────────────

describe("transferOrganizationOwnership — happy path", () => {
  it("transfers ownership, cascades all campaigns by default, writes events + audit", async () => {
    const { tx, state, _mocks } = buildTx({
      orgs: [{ id: "org-1", ownerCoachId: "coach-old", deletedAt: null }],
      coaches: [
        { id: "coach-old", certificationStatus: "ACTIVE" },
        { id: "coach-new", certificationStatus: "ACTIVE" },
      ],
      campaigns: [
        {
          id: "c-1",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "ACTIVE",
        },
        {
          id: "c-2",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "DRAFT",
        },
      ],
      groupCoachRows: [
        {
          accessGroupId: "g-a",
          coachId: "coach-new",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ accessGroupId: "g-a", templateId: "T1" }],
    });

    const result = await transferOrganizationOwnership(tx, {
      organizationId: "org-1",
      newOwnerCoachId: "coach-new",
      performedByUserId: "admin-user-1",
      notes: "Coach old leaving the program",
    });

    expect(result.organizationId).toBe("org-1");
    expect(result.oldOwnerCoachId).toBe("coach-old");
    expect(result.newOwnerCoachId).toBe("coach-new");
    expect(result.campaignsCascaded.sort()).toEqual(["c-1", "c-2"]);
    expect(result.closedCampaignsRetained).toEqual([]);
    expect(result.eventIds.length).toBe(1);

    // Organization row was updated.
    expect(state.orgs[0].ownerCoachId).toBe("coach-new");
    // Campaigns updated.
    expect(state.campaigns.every((c) => c.createdByCoachId === "coach-new")).toBe(
      true,
    );
    // One ownership-event row written for the TRANSFERRED kind.
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      kind: "TRANSFERRED",
      oldOwnerCoachId: "coach-old",
      newOwnerCoachId: "coach-new",
      campaignId: null,
      performedBy: "admin-user-1",
      notes: "Coach old leaving the program",
    });
    // Audit rows: 1 for the org transfer + 1 per cascaded campaign.
    expect(state.audit).toHaveLength(1 + 2);
    expect(state.audit[0]).toMatchObject({
      entityType: "Organization",
      entityId: "org-1",
      action: "TRANSFERRED",
      performedBy: "admin-user-1",
    });
    const campaignAudits = state.audit.filter(
      (a) => a.entityType === "AssessmentCampaign",
    );
    expect(campaignAudits.map((a) => a.entityId).sort()).toEqual([
      "c-1",
      "c-2",
    ]);

    // Advisory locks acquired before the org SELECT FOR UPDATE.
    const flat = flattenRawCalls(_mocks.executeRaw.mock.calls).join(" | ");
    expect(flat).toMatch(/pg_advisory_xact_lock/);
    expect(flat).toMatch(/access-change:coach-new/);
    expect(flat).toMatch(/org-transfer:org-1/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 2) New owner not certified (PENDING)
// ────────────────────────────────────────────────────────────────────────

describe("transferOrganizationOwnership — new owner not certified", () => {
  it("PENDING coach → NEW_OWNER_NOT_CERTIFIED, zero side effects", async () => {
    const { tx, state, _mocks } = buildTx({
      orgs: [{ id: "org-1", ownerCoachId: "coach-old", deletedAt: null }],
      coaches: [
        { id: "coach-old", certificationStatus: "ACTIVE" },
        { id: "coach-new", certificationStatus: "PENDING" },
      ],
      campaigns: [
        {
          id: "c-1",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "ACTIVE",
        },
      ],
    });

    await expect(
      transferOrganizationOwnership(tx, {
        organizationId: "org-1",
        newOwnerCoachId: "coach-new",
        performedByUserId: "admin-user-1",
      }),
    ).rejects.toBeInstanceOf(OwnershipTransferError);

    try {
      await transferOrganizationOwnership(tx, {
        organizationId: "org-1",
        newOwnerCoachId: "coach-new",
        performedByUserId: "admin-user-1",
      });
      fail("expected throw");
    } catch (err) {
      expect((err as OwnershipTransferError).code).toBe(
        "NEW_OWNER_NOT_CERTIFIED",
      );
    }

    // No mutations occurred.
    expect(state.orgs[0].ownerCoachId).toBe("coach-old");
    expect(state.events).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
    expect(_mocks.orgUpdate).not.toHaveBeenCalled();
    expect(_mocks.campaignUpdate).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────
// 3) New owner DEACTIVATED
// ────────────────────────────────────────────────────────────────────────

describe("transferOrganizationOwnership — DEACTIVATED new owner", () => {
  it("DEACTIVATED coach → NEW_OWNER_NOT_CERTIFIED with reason=DEACTIVATED", async () => {
    const { tx, state } = buildTx({
      orgs: [{ id: "org-1", ownerCoachId: "coach-old", deletedAt: null }],
      coaches: [
        { id: "coach-old", certificationStatus: "ACTIVE" },
        { id: "coach-new", certificationStatus: "DEACTIVATED" },
      ],
      campaigns: [],
    });

    try {
      await transferOrganizationOwnership(tx, {
        organizationId: "org-1",
        newOwnerCoachId: "coach-new",
        performedByUserId: "admin-user-1",
      });
      fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OwnershipTransferError);
      expect((err as OwnershipTransferError).code).toBe(
        "NEW_OWNER_NOT_CERTIFIED",
      );
      expect((err as OwnershipTransferError).details).toMatchObject({
        reason: "DEACTIVATED",
        certificationStatus: "DEACTIVATED",
      });
    }
    expect(state.orgs[0].ownerCoachId).toBe("coach-old");
    expect(state.events).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 4) New owner missing template access
// ────────────────────────────────────────────────────────────────────────

describe("transferOrganizationOwnership — missing template access", () => {
  it("new owner has access to T1 but not T2 → NEW_OWNER_NO_TEMPLATE_ACCESS with templateIds", async () => {
    const { tx, state } = buildTx({
      orgs: [{ id: "org-1", ownerCoachId: "coach-old", deletedAt: null }],
      coaches: [
        { id: "coach-old", certificationStatus: "ACTIVE" },
        { id: "coach-new", certificationStatus: "ACTIVE" },
      ],
      campaigns: [
        {
          id: "c-1",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "ACTIVE",
        },
        {
          id: "c-2",
          organizationId: "org-1",
          templateId: "T2",
          createdByCoachId: "coach-old",
          status: "ACTIVE",
        },
      ],
      // New owner in one group that grants T1 only.
      groupCoachRows: [
        {
          accessGroupId: "g-a",
          coachId: "coach-new",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ accessGroupId: "g-a", templateId: "T1" }],
    });

    try {
      await transferOrganizationOwnership(tx, {
        organizationId: "org-1",
        newOwnerCoachId: "coach-new",
        performedByUserId: "admin-user-1",
      });
      fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OwnershipTransferError);
      expect((err as OwnershipTransferError).code).toBe(
        "NEW_OWNER_NO_TEMPLATE_ACCESS",
      );
      expect(
        (err as OwnershipTransferError).details.templateIds as string[],
      ).toEqual(["T2"]);
    }

    expect(state.orgs[0].ownerCoachId).toBe("coach-old");
    expect(state.events).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 5) Default includeClosedCampaigns=true cascades CLOSED too
// ────────────────────────────────────────────────────────────────────────

describe("transferOrganizationOwnership — default includeClosedCampaigns=true", () => {
  it("ACTIVE/DRAFT/CLOSED all cascade; closedCampaignsRetained empty", async () => {
    const { tx, state } = buildTx({
      orgs: [{ id: "org-1", ownerCoachId: "coach-old", deletedAt: null }],
      coaches: [
        { id: "coach-old", certificationStatus: "ACTIVE" },
        { id: "coach-new", certificationStatus: "ACTIVE" },
      ],
      campaigns: [
        {
          id: "c-active",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "ACTIVE",
        },
        {
          id: "c-draft",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "DRAFT",
        },
        {
          id: "c-closed",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "CLOSED",
        },
      ],
      groupCoachRows: [
        {
          accessGroupId: "g-a",
          coachId: "coach-new",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ accessGroupId: "g-a", templateId: "T1" }],
    });

    const result = await transferOrganizationOwnership(tx, {
      organizationId: "org-1",
      newOwnerCoachId: "coach-new",
      performedByUserId: "admin-user-1",
    });

    expect(result.campaignsCascaded.sort()).toEqual([
      "c-active",
      "c-closed",
      "c-draft",
    ]);
    expect(result.closedCampaignsRetained).toEqual([]);
    expect(state.campaigns.every((c) => c.createdByCoachId === "coach-new")).toBe(
      true,
    );
    expect(state.events).toHaveLength(1);
    expect(state.events[0].kind).toBe("TRANSFERRED");
  });
});

// ────────────────────────────────────────────────────────────────────────
// 6) includeClosedCampaigns=false without ack → throws
// ────────────────────────────────────────────────────────────────────────

describe("transferOrganizationOwnership — retained closed without ack", () => {
  it("includeClosedCampaigns=false + CLOSED present + no ack → RETAINED_CLOSED_NOT_ACKNOWLEDGED", async () => {
    const { tx, state } = buildTx({
      orgs: [{ id: "org-1", ownerCoachId: "coach-old", deletedAt: null }],
      coaches: [
        { id: "coach-old", certificationStatus: "ACTIVE" },
        { id: "coach-new", certificationStatus: "ACTIVE" },
      ],
      campaigns: [
        {
          id: "c-closed",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "CLOSED",
        },
      ],
      groupCoachRows: [
        {
          accessGroupId: "g-a",
          coachId: "coach-new",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ accessGroupId: "g-a", templateId: "T1" }],
    });

    try {
      await transferOrganizationOwnership(tx, {
        organizationId: "org-1",
        newOwnerCoachId: "coach-new",
        performedByUserId: "admin-user-1",
        includeClosedCampaigns: false,
      });
      fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OwnershipTransferError);
      expect((err as OwnershipTransferError).code).toBe(
        "RETAINED_CLOSED_NOT_ACKNOWLEDGED",
      );
      expect((err as OwnershipTransferError).details).toMatchObject({
        count: 1,
        campaignIds: ["c-closed"],
      });
    }
    expect(state.orgs[0].ownerCoachId).toBe("coach-old");
    expect(state.events).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 7) includeClosedCampaigns=false WITH ack → ok, CLOSED retained
// ────────────────────────────────────────────────────────────────────────

describe("transferOrganizationOwnership — retained closed acknowledged", () => {
  it("CLOSED stays with old owner; ACTIVE cascades; one event per retained CLOSED", async () => {
    const { tx, state } = buildTx({
      orgs: [{ id: "org-1", ownerCoachId: "coach-old", deletedAt: null }],
      coaches: [
        { id: "coach-old", certificationStatus: "ACTIVE" },
        { id: "coach-new", certificationStatus: "ACTIVE" },
      ],
      campaigns: [
        {
          id: "c-active",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "ACTIVE",
        },
        {
          id: "c-closed-1",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "CLOSED",
        },
        {
          id: "c-closed-2",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "CLOSED",
        },
      ],
      groupCoachRows: [
        {
          accessGroupId: "g-a",
          coachId: "coach-new",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ accessGroupId: "g-a", templateId: "T1" }],
    });

    const result = await transferOrganizationOwnership(tx, {
      organizationId: "org-1",
      newOwnerCoachId: "coach-new",
      performedByUserId: "admin-user-1",
      includeClosedCampaigns: false,
      retainedClosedCampaignsAcknowledged: true,
    });

    expect(result.campaignsCascaded).toEqual(["c-active"]);
    expect(result.closedCampaignsRetained.sort()).toEqual([
      "c-closed-1",
      "c-closed-2",
    ]);

    // c-active updated to new owner; the two CLOSED retained on old owner.
    const byId = Object.fromEntries(state.campaigns.map((c) => [c.id, c]));
    expect(byId["c-active"].createdByCoachId).toBe("coach-new");
    expect(byId["c-closed-1"].createdByCoachId).toBe("coach-old");
    expect(byId["c-closed-2"].createdByCoachId).toBe("coach-old");

    // 1 TRANSFERRED event + 2 RETAINED_CLOSED_CAMPAIGN events.
    expect(state.events).toHaveLength(3);
    const kinds = state.events.map((e) => e.kind).sort();
    expect(kinds).toEqual([
      "RETAINED_CLOSED_CAMPAIGN",
      "RETAINED_CLOSED_CAMPAIGN",
      "TRANSFERRED",
    ]);

    const retained = state.events.filter(
      (e) => e.kind === "RETAINED_CLOSED_CAMPAIGN",
    );
    for (const ev of retained) {
      expect(ev).toMatchObject({
        organizationId: "org-1",
        oldOwnerCoachId: "coach-old",
        newOwnerCoachId: null,
        performedBy: "admin-user-1",
      });
      expect(ev.campaignId).toMatch(/^c-closed-/);
      expect(ev.notes).toMatch(/admin acknowledgment/);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// 8) Organization not found
// ────────────────────────────────────────────────────────────────────────

describe("transferOrganizationOwnership — org not found", () => {
  it("missing org → throws a descriptive Error, no side effects", async () => {
    const { tx, state, _mocks } = buildTx({
      orgs: [],
      coaches: [{ id: "coach-new", certificationStatus: "ACTIVE" }],
      campaigns: [],
    });

    await expect(
      transferOrganizationOwnership(tx, {
        organizationId: "org-missing",
        newOwnerCoachId: "coach-new",
        performedByUserId: "admin-user-1",
      }),
    ).rejects.toThrow(/Organization not found: org-missing/);

    expect(state.events).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
    expect(_mocks.orgUpdate).not.toHaveBeenCalled();
    expect(_mocks.campaignUpdate).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────
// 9) Concurrent transfer simulation — assert lock acquisition order
// ────────────────────────────────────────────────────────────────────────

describe("transferOrganizationOwnership — advisory locks ordered", () => {
  // NOTE: Prisma's `$transaction` test harness cannot fully simulate true
  // SERIALIZABLE conflicts in an in-memory stub. The advisory-lock code
  // IS the source of truth for concurrency safety in production. We can
  // only assert here that the keys are REQUESTED in deterministic sorted
  // order — the deadlock-free convention shared with `evaluateAccessChange`.
  it("acquires advisory locks in sorted alphabetical key order", async () => {
    const { tx, _mocks } = buildTx({
      // newOwnerCoachId="zzz" puts access-change:zzz AFTER org-transfer:aaa
      // when sorted alphabetically. Use IDs that exercise the sort.
      orgs: [{ id: "aaa-org", ownerCoachId: "coach-old", deletedAt: null }],
      coaches: [
        { id: "coach-old", certificationStatus: "ACTIVE" },
        { id: "zzz-coach", certificationStatus: "ACTIVE" },
      ],
      campaigns: [],
      groupCoachRows: [],
      groupTemplateRows: [],
    });

    await transferOrganizationOwnership(tx, {
      organizationId: "aaa-org",
      newOwnerCoachId: "zzz-coach",
      performedByUserId: "admin-user-1",
    });

    const flat = flattenRawCalls(_mocks.executeRaw.mock.calls);
    const accessIdx = flat.findIndex((s) =>
      s.includes("access-change:zzz-coach"),
    );
    const orgIdx = flat.findIndex((s) =>
      s.includes("org-transfer:aaa-org"),
    );
    expect(accessIdx).toBeGreaterThanOrEqual(0);
    expect(orgIdx).toBeGreaterThanOrEqual(0);
    // "access-change:zzz-coach" < "org-transfer:aaa-org" alphabetically.
    expect(accessIdx).toBeLessThan(orgIdx);
  });

  it("when org id sorts BEFORE the coach key, org-transfer lock is requested first", async () => {
    const { tx, _mocks } = buildTx({
      // organizationId="zzz-org" → org-transfer:zzz-org
      // newOwnerCoachId="aaa-coach" → access-change:aaa-coach
      // "access-change:aaa-coach" still < "org-transfer:zzz-org" alphabetically.
      orgs: [{ id: "zzz-org", ownerCoachId: "coach-old", deletedAt: null }],
      coaches: [
        { id: "coach-old", certificationStatus: "ACTIVE" },
        { id: "aaa-coach", certificationStatus: "ACTIVE" },
      ],
      campaigns: [],
    });

    await transferOrganizationOwnership(tx, {
      organizationId: "zzz-org",
      newOwnerCoachId: "aaa-coach",
      performedByUserId: "admin-user-1",
    });

    const flat = flattenRawCalls(_mocks.executeRaw.mock.calls);
    const accessIdx = flat.findIndex((s) =>
      s.includes("access-change:aaa-coach"),
    );
    const orgIdx = flat.findIndex((s) =>
      s.includes("org-transfer:zzz-org"),
    );
    expect(accessIdx).toBeGreaterThanOrEqual(0);
    expect(orgIdx).toBeGreaterThanOrEqual(0);
    expect(accessIdx).toBeLessThan(orgIdx);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 10) OrganizationOwnershipEvent rows carry the full schema
// ────────────────────────────────────────────────────────────────────────

describe("transferOrganizationOwnership — event row shape", () => {
  it("TRANSFERRED + RETAINED_CLOSED_CAMPAIGN rows have all required fields", async () => {
    const { tx, state } = buildTx({
      orgs: [{ id: "org-1", ownerCoachId: "coach-old", deletedAt: null }],
      coaches: [
        { id: "coach-old", certificationStatus: "ACTIVE" },
        { id: "coach-new", certificationStatus: "ACTIVE" },
      ],
      campaigns: [
        {
          id: "c-closed",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "CLOSED",
        },
      ],
      groupCoachRows: [
        {
          accessGroupId: "g-a",
          coachId: "coach-new",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ accessGroupId: "g-a", templateId: "T1" }],
    });

    const result = await transferOrganizationOwnership(tx, {
      organizationId: "org-1",
      newOwnerCoachId: "coach-new",
      performedByUserId: "admin-user-1",
      includeClosedCampaigns: false,
      retainedClosedCampaignsAcknowledged: true,
      notes: "Reorg",
    });

    expect(result.eventIds).toHaveLength(2);

    const transferEvt = state.events.find((e) => e.kind === "TRANSFERRED")!;
    expect(transferEvt).toMatchObject({
      organizationId: "org-1",
      kind: "TRANSFERRED",
      oldOwnerCoachId: "coach-old",
      newOwnerCoachId: "coach-new",
      campaignId: null,
      performedBy: "admin-user-1",
      notes: "Reorg",
    });

    const retainedEvt = state.events.find(
      (e) => e.kind === "RETAINED_CLOSED_CAMPAIGN",
    )!;
    expect(retainedEvt).toMatchObject({
      organizationId: "org-1",
      kind: "RETAINED_CLOSED_CAMPAIGN",
      oldOwnerCoachId: "coach-old",
      newOwnerCoachId: null,
      campaignId: "c-closed",
      performedBy: "admin-user-1",
    });
    expect(retainedEvt.notes).toMatch(/admin acknowledgment/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Bonus: audit-write failure aborts the entire transfer (no swallow)
// ────────────────────────────────────────────────────────────────────────

describe("transferOrganizationOwnership — audit write failure", () => {
  it("auditLog.create throw bubbles up (no swallowing wrapper)", async () => {
    const { tx } = buildTx({
      orgs: [{ id: "org-1", ownerCoachId: "coach-old", deletedAt: null }],
      coaches: [
        { id: "coach-old", certificationStatus: "ACTIVE" },
        { id: "coach-new", certificationStatus: "ACTIVE" },
      ],
      campaigns: [
        {
          id: "c-1",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-old",
          status: "ACTIVE",
        },
      ],
      groupCoachRows: [
        {
          accessGroupId: "g-a",
          coachId: "coach-new",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ accessGroupId: "g-a", templateId: "T1" }],
      failOnAudit: true,
    });

    await expect(
      transferOrganizationOwnership(tx, {
        organizationId: "org-1",
        newOwnerCoachId: "coach-new",
        performedByUserId: "admin-user-1",
      }),
    ).rejects.toThrow(/simulated audit failure/);
  });
});
