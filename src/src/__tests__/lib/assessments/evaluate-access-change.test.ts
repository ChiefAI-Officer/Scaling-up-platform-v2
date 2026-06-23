/**
 * Assessment v7.6 — Pre-save guard for AccessGroup family mutations.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md →
 *   "evaluateAccessChange — transactional commit (Round 1 H-2 + Round 2 H-2
 *    + Round 2 M-4 + Round 3 H-4)" and "Lifecycle mutations covered by the
 *    same guard (Round 2 H-3)".
 *
 * The function runs INSIDE an outer `$transaction` at SERIALIZABLE
 * isolation level. The caller is responsible for opening the transaction
 * and applying the actual write (insert/delete/soft-delete). This
 * function is the PRE-SAVE GUARD: it acquires advisory locks, computes
 * BEFORE/AFTER effective access, decides whether to block, and (on
 * commit) writes the AuditLog row.
 *
 * Test strategy: stub the Prisma tx client. We exercise:
 *   - ADD-only changes (never block).
 *   - REMOVE that would zero out the coach AND coach has active
 *     campaigns → BLOCKED_ZERO_ACCESS.
 *   - same with `force: true` + `forceReason` → ok, AuditLog row written.
 *   - missing `forceReason` when `force=true` → INVALID_FORCE_REASON.
 *   - audit write throws → entire evaluation aborts (no swallowing).
 *   - advisory lock keys generated in sorted order.
 */

import { evaluateAccessChange } from "@/lib/assessments/evaluate-access-change";
import { AccessChangeError } from "@/lib/assessments/errors";

interface AccessGroupCoachRow {
  id: string;
  accessGroupId: string;
  coachId: string;
  accessGroup: { id: string; deletedAt: Date | null };
}

interface AccessGroupTemplateRow {
  id: string;
  accessGroupId: string;
  templateId: string;
}

interface AccessGroupRow {
  id: string;
  name: string;
  deletedAt: Date | null;
}

interface CampaignRow {
  id: string;
  templateId: string;
  createdByCoachId: string | null;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
}

function buildTx(state: {
  groupCoachRows?: AccessGroupCoachRow[];
  groupTemplateRows?: AccessGroupTemplateRow[];
  groupRows?: AccessGroupRow[];
  campaigns?: CampaignRow[];
  failOnAudit?: boolean;
}) {
  const executeRaw = jest.fn(async () => 1);
  const auditCreate = jest.fn(async (args: { data: Record<string, unknown> }) => {
    if (state.failOnAudit) {
      throw new Error("simulated audit failure");
    }
    return { id: "audit-1", ...args.data };
  });

  return {
    $executeRaw: executeRaw,
    $executeRawUnsafe: executeRaw,
    accessGroup: {
      findMany: jest.fn(async (args: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in;
        return (state.groupRows ?? []).filter(
          (g) => !ids || ids.includes(g.id),
        );
      }),
    },
    accessGroupCoach: {
      findMany: jest.fn(
        async (args: {
          where?: {
            coachId?: string | { in?: string[] };
            accessGroupId?: string | { in?: string[] };
          };
          include?: { accessGroup?: unknown };
        }) => {
          const rows = (state.groupCoachRows ?? []).filter(
            (r) => r.accessGroup.deletedAt === null,
          );
          const whereCoachId = args?.where?.coachId;
          const whereGroupId = args?.where?.accessGroupId;
          const filtered = rows.filter((r) => {
            if (typeof whereCoachId === "string" && r.coachId !== whereCoachId)
              return false;
            if (
              whereCoachId &&
              typeof whereCoachId === "object" &&
              whereCoachId.in &&
              !whereCoachId.in.includes(r.coachId)
            )
              return false;
            if (
              typeof whereGroupId === "string" &&
              r.accessGroupId !== whereGroupId
            )
              return false;
            if (
              whereGroupId &&
              typeof whereGroupId === "object" &&
              whereGroupId.in &&
              !whereGroupId.in.includes(r.accessGroupId)
            )
              return false;
            return true;
          });
          // Faithful to Prisma: the accessGroup relation is ONLY present when
          // the caller explicitly includes it. Code that reads
          // r.accessGroup.deletedAt MUST pass include — else it gets undefined
          // and throws (the prod bug this guards against).
          if (args?.include?.accessGroup) return filtered;
          return filtered.map((r) => {
            const { accessGroup: _omit, ...rest } = r;
            void _omit;
            return rest;
          });
        },
      ),
    },
    accessGroupTemplate: {
      findMany: jest.fn(
        async (args: {
          where?: {
            accessGroupId?: { in?: string[] };
            templateId?: string;
          };
        }) => {
          const groupIds = args?.where?.accessGroupId?.in;
          return (state.groupTemplateRows ?? []).filter((r) => {
            if (groupIds && !groupIds.includes(r.accessGroupId)) return false;
            if (
              args?.where?.templateId &&
              r.templateId !== args.where.templateId
            )
              return false;
            return true;
          });
        },
      ),
    },
    assessmentCampaign: {
      findMany: jest.fn(
        async (args: {
          where?: {
            createdByCoachId?: string | { in?: string[] };
            status?: { in?: string[] };
          };
        }) => {
          // Supports the batched `{ in: [...] }` query (and the legacy string form).
          const coachWhere = args?.where?.createdByCoachId;
          const coachIds =
            typeof coachWhere === "string"
              ? [coachWhere]
              : coachWhere?.in ?? null;
          const statusIn = args?.where?.status?.in;
          return (state.campaigns ?? []).filter((c) => {
            if (coachIds && !coachIds.includes(c.createdByCoachId)) return false;
            if (statusIn && !statusIn.includes(c.status)) return false;
            return true;
          });
        },
      ),
    },
    auditLog: {
      create: auditCreate,
    },
    // expose mocks for assertions
    _mocks: { executeRaw, auditCreate },
  };
}

// ────────────────────────────────────────────────────────────────────────
// 1) ADD-only changes never block
// ────────────────────────────────────────────────────────────────────────

describe("evaluateAccessChange — ADD changes", () => {
  it("adding a template to a group EXPANDS access → never blocks", async () => {
    const tx = buildTx({
      groupCoachRows: [
        {
          id: "ac-1",
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ id: "agt-1", accessGroupId: "g-a", templateId: "T1" }],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
    });

    const result = await evaluateAccessChange(tx, {
      kind: "ADD_TEMPLATE_TO_GROUP",
      accessGroupId: "g-a",
      templateId: "T2",
      performedByUserId: "admin-1",
    });

    expect(result.blocked).toBe(false);
    expect(result.affectedCoachIds).toContain("coach-1");
    expect(tx._mocks.auditCreate).toHaveBeenCalledTimes(1);
    expect(tx._mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
      entityType: "AccessGroupTemplate",
      action: "ADDED",
      performedBy: "admin-1",
    });
  });

  it("adding a coach to a group is never blocked (always expands their access)", async () => {
    const tx = buildTx({
      groupCoachRows: [],
      groupTemplateRows: [{ id: "agt-1", accessGroupId: "g-a", templateId: "T1" }],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
    });

    const result = await evaluateAccessChange(tx, {
      kind: "ADD_COACH_TO_GROUP",
      accessGroupId: "g-a",
      coachId: "coach-1",
      performedByUserId: "admin-1",
    });

    expect(result.blocked).toBe(false);
    expect(tx._mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "AccessGroupCoach",
        action: "ADDED",
      }),
    });
  });
});

// ────────────────────────────────────────────────────────────────────────
// 2) REMOVE that drops a template still in use → BLOCKED_ZERO_ACCESS
// ────────────────────────────────────────────────────────────────────────

describe("evaluateAccessChange — REMOVE that zeros access", () => {
  it("removing the last template from a group with an active-campaign coach → BLOCKED_ZERO_ACCESS", async () => {
    const tx = buildTx({
      groupCoachRows: [
        {
          id: "ac-1",
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ id: "agt-1", accessGroupId: "g-a", templateId: "T1" }],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
      campaigns: [
        {
          id: "c-1",
          templateId: "T1",
          createdByCoachId: "coach-1",
          status: "ACTIVE",
        },
      ],
    });

    await expect(
      evaluateAccessChange(tx, {
        kind: "REMOVE_TEMPLATE_FROM_GROUP",
        accessGroupId: "g-a",
        templateId: "T1",
        performedByUserId: "admin-1",
      }),
    ).rejects.toBeInstanceOf(AccessChangeError);

    // no audit row on the failing path
    expect(tx._mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("error code is BLOCKED_ZERO_ACCESS with affectedCoachIds in details", async () => {
    const tx = buildTx({
      groupCoachRows: [
        {
          id: "ac-1",
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ id: "agt-1", accessGroupId: "g-a", templateId: "T1" }],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
      campaigns: [
        {
          id: "c-1",
          templateId: "T1",
          createdByCoachId: "coach-1",
          status: "ACTIVE",
        },
      ],
    });

    try {
      await evaluateAccessChange(tx, {
        kind: "REMOVE_TEMPLATE_FROM_GROUP",
        accessGroupId: "g-a",
        templateId: "T1",
        performedByUserId: "admin-1",
      });
      fail("expected throw");
    } catch (err) {
      expect((err as AccessChangeError).code).toBe("BLOCKED_ZERO_ACCESS");
      expect((err as AccessChangeError).details).toMatchObject({
        affectedCoachIds: ["coach-1"],
      });
    }
  });

  it("removing a coach from a group whose other templates also vanish → BLOCKED for that coach", async () => {
    // Coach is in group A {T1} only. Remove the coach from group A →
    // coach lands at zero effective groups and has active campaigns.
    const tx = buildTx({
      groupCoachRows: [
        {
          id: "ac-1",
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ id: "agt-1", accessGroupId: "g-a", templateId: "T1" }],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
      campaigns: [
        {
          id: "c-1",
          templateId: "T1",
          createdByCoachId: "coach-1",
          status: "ACTIVE",
        },
      ],
    });

    await expect(
      evaluateAccessChange(tx, {
        kind: "REMOVE_COACH_FROM_GROUP",
        accessGroupId: "g-a",
        coachId: "coach-1",
        performedByUserId: "admin-1",
      }),
    ).rejects.toMatchObject({ code: "BLOCKED_ZERO_ACCESS" });
  });
});

// ────────────────────────────────────────────────────────────────────────
// 3) force=true path
// ────────────────────────────────────────────────────────────────────────

describe("evaluateAccessChange — force override", () => {
  it("force=true + forceReason → succeeds, writes audit row with FORCE_ZERO action", async () => {
    const tx = buildTx({
      groupCoachRows: [
        {
          id: "ac-1",
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ id: "agt-1", accessGroupId: "g-a", templateId: "T1" }],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
      campaigns: [
        {
          id: "c-1",
          templateId: "T1",
          createdByCoachId: "coach-1",
          status: "ACTIVE",
        },
      ],
    });

    const result = await evaluateAccessChange(tx, {
      kind: "REMOVE_TEMPLATE_FROM_GROUP",
      accessGroupId: "g-a",
      templateId: "T1",
      performedByUserId: "admin-1",
      force: true,
      forceReason: "Coach is on leave; admin will re-grant after",
    });

    expect(result.blocked).toBe(false);
    expect(result.forcedZeroCoachIds).toEqual(["coach-1"]);
    expect(tx._mocks.auditCreate).toHaveBeenCalledTimes(1);
    const auditCall = tx._mocks.auditCreate.mock.calls[0][0].data;
    // Spec: force-override audit row uses action="FORCE_ZERO".
    expect(auditCall).toMatchObject({
      entityType: "AccessGroupTemplate",
      action: "FORCE_ZERO",
      performedBy: "admin-1",
    });
    expect(JSON.parse(auditCall.changes)).toMatchObject({
      reason: "Coach is on leave; admin will re-grant after",
      forcedZeroCoachIds: ["coach-1"],
    });
  });

  it("force=true without forceReason → INVALID_FORCE_REASON", async () => {
    const tx = buildTx({
      groupCoachRows: [
        {
          id: "ac-1",
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ id: "agt-1", accessGroupId: "g-a", templateId: "T1" }],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
      campaigns: [
        {
          id: "c-1",
          templateId: "T1",
          createdByCoachId: "coach-1",
          status: "ACTIVE",
        },
      ],
    });

    await expect(
      evaluateAccessChange(tx, {
        kind: "REMOVE_TEMPLATE_FROM_GROUP",
        accessGroupId: "g-a",
        templateId: "T1",
        performedByUserId: "admin-1",
        force: true,
        // intentionally omit forceReason — caller bug
      } as unknown as Parameters<typeof evaluateAccessChange>[1]),
    ).rejects.toMatchObject({ code: "INVALID_FORCE_REASON" });
  });

  it("force=true + empty forceReason → INVALID_FORCE_REASON", async () => {
    const tx = buildTx({
      groupCoachRows: [
        {
          id: "ac-1",
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ id: "agt-1", accessGroupId: "g-a", templateId: "T1" }],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
      campaigns: [
        {
          id: "c-1",
          templateId: "T1",
          createdByCoachId: "coach-1",
          status: "ACTIVE",
        },
      ],
    });

    await expect(
      evaluateAccessChange(tx, {
        kind: "REMOVE_TEMPLATE_FROM_GROUP",
        accessGroupId: "g-a",
        templateId: "T1",
        performedByUserId: "admin-1",
        force: true,
        forceReason: "   ",
      }),
    ).rejects.toMatchObject({ code: "INVALID_FORCE_REASON" });
  });
});

// ────────────────────────────────────────────────────────────────────────
// 4) Audit failure rolls back
// ────────────────────────────────────────────────────────────────────────

describe("evaluateAccessChange — audit write failure", () => {
  it("auditLog.create throw bubbles up (Round 2 M-4: no swallowing wrapper)", async () => {
    const tx = buildTx({
      groupCoachRows: [
        {
          id: "ac-1",
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [
        { id: "agt-1", accessGroupId: "g-a", templateId: "T1" },
      ],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
      failOnAudit: true,
    });

    await expect(
      evaluateAccessChange(tx, {
        kind: "ADD_TEMPLATE_TO_GROUP",
        accessGroupId: "g-a",
        templateId: "T2",
        performedByUserId: "admin-1",
      }),
    ).rejects.toThrow(/simulated audit failure/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 5) Advisory locks acquired (smoke test — keys ordered)
// ────────────────────────────────────────────────────────────────────────

describe("evaluateAccessChange — advisory locks", () => {
  it("acquires pg_advisory_xact_lock at least once before reading state", async () => {
    const tx = buildTx({
      groupCoachRows: [
        {
          id: "ac-1",
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [
        { id: "agt-1", accessGroupId: "g-a", templateId: "T1" },
      ],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
    });

    await evaluateAccessChange(tx, {
      kind: "ADD_TEMPLATE_TO_GROUP",
      accessGroupId: "g-a",
      templateId: "T2",
      performedByUserId: "admin-1",
    });

    expect(tx._mocks.executeRaw).toHaveBeenCalled();
    // Prisma.sql tagged-template produces a Sql instance with .strings +
    // .values. Flatten everything we can see into one searchable string.
    const flatSql = tx._mocks.executeRaw.mock.calls
      .map((args) => {
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
      })
      .join(" | ");
    expect(flatSql).toMatch(/pg_advisory_xact_lock/);
  });

  it("when multiple coaches are affected, lock keys are acquired in sorted order", async () => {
    const tx = buildTx({
      groupCoachRows: [
        {
          id: "ac-1",
          accessGroupId: "g-a",
          coachId: "coach-bravo",
          accessGroup: { id: "g-a", deletedAt: null },
        },
        {
          id: "ac-2",
          accessGroupId: "g-a",
          coachId: "coach-alpha",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [
        { id: "agt-1", accessGroupId: "g-a", templateId: "T1" },
        { id: "agt-2", accessGroupId: "g-a", templateId: "T2" },
      ],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
    });

    await evaluateAccessChange(tx, {
      kind: "ADD_TEMPLATE_TO_GROUP",
      accessGroupId: "g-a",
      templateId: "T3",
      performedByUserId: "admin-1",
    });

    // Find the order in which coach lock keys appear in the executeRaw calls.
    // Tagged-template invocation: args[0] is the TemplateStringsArray,
    // args[1..N] are the interpolated values (coach IDs). Flatten both.
    const calls = tx._mocks.executeRaw.mock.calls.map((args) => {
      const first = args[0];
      const restValues = args.slice(1).map(String).join(" ");
      if (typeof first === "string") {
        return first + (restValues ? " " + restValues : "");
      }
      if (Array.isArray(first)) {
        return first.join(" ") + (restValues ? " " + restValues : "");
      }
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
    const alphaIdx = calls.findIndex((s) => s.includes("coach-alpha"));
    const bravoIdx = calls.findIndex((s) => s.includes("coach-bravo"));
    // Sorted asc → alpha comes before bravo.
    expect(alphaIdx).toBeGreaterThanOrEqual(0);
    expect(bravoIdx).toBeGreaterThanOrEqual(0);
    expect(alphaIdx).toBeLessThan(bravoIdx);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 6) Coach with no campaigns — zero access allowed without force
// ────────────────────────────────────────────────────────────────────────

describe("evaluateAccessChange — coach with no active workload", () => {
  it("coach lands at zero access BUT has no active/draft campaigns → no block", async () => {
    const tx = buildTx({
      groupCoachRows: [
        {
          id: "ac-1",
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ id: "agt-1", accessGroupId: "g-a", templateId: "T1" }],
      groupRows: [{ id: "g-a", name: "Coaches", deletedAt: null }],
      // no campaigns
      campaigns: [],
    });

    const result = await evaluateAccessChange(tx, {
      kind: "REMOVE_TEMPLATE_FROM_GROUP",
      accessGroupId: "g-a",
      templateId: "T1",
      performedByUserId: "admin-1",
    });

    expect(result.blocked).toBe(false);
  });
});
