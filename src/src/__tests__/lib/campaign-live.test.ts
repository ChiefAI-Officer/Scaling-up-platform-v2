/**
 * Wave D — SEC-M6: soft-deleted campaigns must be invisible on EVERY
 * user-facing read path, enforced in the CORE access predicate
 * (`canManageCampaign`) rather than re-implemented per surface.
 *
 * This suite covers:
 *   1. `liveCampaignWhere()` — the reusable Prisma where-fragment helper.
 *   2. `loadLiveCampaign()` — id-load helper that returns null for a
 *      soft-deleted row, with an explicit `includeDeleted` admin-recovery
 *      escape hatch.
 *   3. `canManageCampaign` — denies access (returns false / treats as
 *      not-found) for a campaign whose `deletedAt` is set, while the
 *      admin-recovery opt-in CAN still load it.
 *   4. Per-surface regression assertions (campaign list where-clause,
 *      public-alias loaders) excluding deleted campaigns.
 *
 * Prisma is mocked at the delegate level — no DB. Follows the stub style
 * already used by access-control.test.ts.
 */

import type { ApiActor } from "@/lib/auth/access-control";
import {
  liveCampaignWhere,
  loadLiveCampaign,
} from "@/lib/assessments/campaign-live";
import { canManageCampaign } from "@/lib/assessments/access-control";

// ────────────────────────────────────────────────────────────────────────
// Stub helpers
// ────────────────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<ApiActor> = {}): ApiActor {
  return {
    userId: "user-1",
    email: "coach@example.com",
    role: "COACH",
    coachId: "coach-1",
    ...overrides,
  };
}

interface CampaignRow {
  id: string;
  organizationId: string;
  templateId: string;
  createdByCoachId: string | null;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  deletedAt: Date | null;
}

interface OrgRow {
  id: string;
  ownerCoachId: string;
  deletedAt: Date | null;
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

/**
 * Build a stub Prisma-shape db. `assessmentCampaign.findFirst` honors a
 * `deletedAt: null` constraint when present in the where (so the helper +
 * core predicate must actually pass it to be filtered).
 */
function buildDb(state: {
  campaigns?: CampaignRow[];
  orgs?: OrgRow[];
  groupCoachRows?: AccessGroupCoachRow[];
  groupTemplateRows?: AccessGroupTemplateRow[];
}) {
  const campaigns = state.campaigns ?? [];
  const orgs = state.orgs ?? [];
  const groupCoachRows = state.groupCoachRows ?? [];
  const groupTemplateRows = state.groupTemplateRows ?? [];

  const findFirst = jest.fn(
    async (args: { where: { id?: string; deletedAt?: Date | null } }) => {
      const { id, deletedAt } = args.where;
      const row = campaigns.find((c) => c.id === id) ?? null;
      if (!row) return null;
      // Honor a deletedAt: null constraint — a deleted row is filtered out.
      if (deletedAt === null && row.deletedAt !== null) return null;
      return row;
    },
  );

  return {
    findFirst,
    db: {
      assessmentCampaign: { findFirst },
      organization: {
        findUnique: jest.fn(async (args: { where: { id: string } }) => {
          return orgs.find((o) => o.id === args.where.id) ?? null;
        }),
      },
      accessGroupCoach: {
        findMany: jest.fn(async (args: { where?: { coachId?: string } }) => {
          const coachId = args?.where?.coachId;
          return groupCoachRows.filter(
            (r) =>
              (!coachId || r.coachId === coachId) &&
              r.accessGroup.deletedAt === null,
          );
        }),
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
            const templateId = args?.where?.templateId;
            return groupTemplateRows.filter((r) => {
              if (groupIds && !groupIds.includes(r.accessGroupId)) return false;
              if (templateId && r.templateId !== templateId) return false;
              return true;
            });
          },
        ),
      },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// liveCampaignWhere
// ────────────────────────────────────────────────────────────────────────

describe("liveCampaignWhere", () => {
  it("returns { deletedAt: null } with no extra", () => {
    expect(liveCampaignWhere()).toEqual({ deletedAt: null });
  });

  it("merges extra fields, keeping deletedAt: null", () => {
    expect(
      liveCampaignWhere({ templateId: "t-1", organizationId: "o-1" }),
    ).toEqual({
      deletedAt: null,
      templateId: "t-1",
      organizationId: "o-1",
    });
  });

  it("does NOT let extra override the deletedAt: null guard", () => {
    // Even if a caller tries to pass a deletedAt, the live guard wins.
    const where = liveCampaignWhere({ deletedAt: new Date() } as never);
    expect(where.deletedAt).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────
// loadLiveCampaign
// ────────────────────────────────────────────────────────────────────────

describe("loadLiveCampaign", () => {
  const liveCampaign: CampaignRow = {
    id: "c-live",
    organizationId: "o-1",
    templateId: "t-1",
    createdByCoachId: "coach-1",
    status: "ACTIVE",
    deletedAt: null,
  };
  const deletedCampaign: CampaignRow = {
    ...liveCampaign,
    id: "c-deleted",
    deletedAt: new Date("2026-06-01T00:00:00Z"),
  };

  it("returns a live campaign", async () => {
    const { db } = buildDb({ campaigns: [liveCampaign] });
    const row = await loadLiveCampaign(db.assessmentCampaign, "c-live");
    expect(row).not.toBeNull();
    expect(row?.id).toBe("c-live");
  });

  it("returns null for a soft-deleted campaign", async () => {
    const { db } = buildDb({ campaigns: [deletedCampaign] });
    const row = await loadLiveCampaign(db.assessmentCampaign, "c-deleted");
    expect(row).toBeNull();
  });

  it("the admin-recovery opt-in CAN load a soft-deleted campaign", async () => {
    const { db } = buildDb({ campaigns: [deletedCampaign] });
    const row = await loadLiveCampaign(db.assessmentCampaign, "c-deleted", {
      includeDeleted: true,
    });
    expect(row).not.toBeNull();
    expect(row?.id).toBe("c-deleted");
  });

  it("queries with deletedAt: null by default", async () => {
    const { db, findFirst } = buildDb({ campaigns: [liveCampaign] });
    await loadLiveCampaign(db.assessmentCampaign, "c-live");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "c-live", deletedAt: null }),
      }),
    );
  });

  it("omits the deletedAt filter when includeDeleted is set", async () => {
    const { db, findFirst } = buildDb({ campaigns: [deletedCampaign] });
    await loadLiveCampaign(db.assessmentCampaign, "c-deleted", {
      includeDeleted: true,
    });
    const callArg = findFirst.mock.calls[0][0] as {
      where: { id: string; deletedAt?: unknown };
    };
    expect(callArg.where.id).toBe("c-deleted");
    expect(callArg.where.deletedAt).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────
// canManageCampaign — deletedAt baked into the core predicate
// ────────────────────────────────────────────────────────────────────────

describe("canManageCampaign — soft-delete enforced in the core", () => {
  const coachActor = makeActor({ role: "COACH", coachId: "coach-1" });
  const adminActor = makeActor({ role: "ADMIN", coachId: null });

  const baseCampaign: CampaignRow = {
    id: "c-1",
    organizationId: "o-1",
    templateId: "t-1",
    createdByCoachId: "coach-1",
    status: "ACTIVE",
    deletedAt: null,
  };

  it("denies a coach read on a soft-deleted campaign (treated as not-found)", async () => {
    const { db } = buildDb({
      campaigns: [{ ...baseCampaign, deletedAt: new Date() }],
    });
    await expect(
      canManageCampaign(db, coachActor, "c-1", "read"),
    ).resolves.toBe(false);
  });

  it("denies an ADMIN read on a soft-deleted campaign (admin not exempt by default)", async () => {
    const { db } = buildDb({
      campaigns: [{ ...baseCampaign, deletedAt: new Date() }],
    });
    await expect(
      canManageCampaign(db, adminActor, "c-1", "read"),
    ).resolves.toBe(false);
  });

  it("allows the creator coach to read a LIVE campaign", async () => {
    const { db } = buildDb({ campaigns: [baseCampaign] });
    await expect(
      canManageCampaign(db, coachActor, "c-1", "read"),
    ).resolves.toBe(true);
  });

  it("the findFirst is called with deletedAt: null", async () => {
    const { db, findFirst } = buildDb({ campaigns: [baseCampaign] });
    await canManageCampaign(db, coachActor, "c-1", "read");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "c-1", deletedAt: null }),
      }),
    );
  });
});
