/**
 * Wave F #22 — canViewGroupReport policy (R2-HIGH-3).
 *
 * The group report is a BULK named-PII disclosure (every respondent's
 * named answers side by side). It must NOT reuse the lenient
 * `canManageCampaign(..., "read")` gate, which intentionally permits
 * RETAINED access (a coach who has LOST template access can still read
 * reports they created). `canViewGroupReport` applies the STRICTER
 * write-level currency checks for non-privileged users:
 *   - coach is CURRENTLY active (certificationStatus === "ACTIVE")
 *   - coach CURRENTLY owns the campaign's org
 *   - coach CURRENTLY has template access (INTERSECTION)
 *
 * Strategy mirrors src/src/__tests__/lib/assessments/access-control.ts —
 * stub the Prisma client at the delegate level.
 */

import type { ApiActor } from "@/lib/auth/access-control";
import { canViewGroupReport } from "@/lib/assessments/access-control";
import { resetAccessPolicyVersionCache } from "@/lib/auth/access-policy-version";

// ────────────────────────────────────────────────────────────────────────
// Stub helpers (copied from the canManageCampaign test conventions)
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

interface AccessGroupCoachRow {
  accessGroupId: string;
  coachId: string;
  accessGroup: { id: string; deletedAt: Date | null };
}

interface AccessGroupTemplateRow {
  accessGroupId: string;
  templateId: string;
}

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
  deletedAt?: Date | null;
}

function buildDb(state: {
  groupCoachRows?: AccessGroupCoachRow[];
  groupTemplateRows?: AccessGroupTemplateRow[];
  orgs?: OrgRow[];
  coaches?: CoachRow[];
  campaigns?: CampaignRow[];
}) {
  const groupCoachRows = state.groupCoachRows ?? [];
  const groupTemplateRows = state.groupTemplateRows ?? [];
  const orgs = state.orgs ?? [];
  const coaches = state.coaches ?? [];
  const campaigns = state.campaigns ?? [];

  return {
    accessGroupCoach: {
      findMany: jest.fn(async (args: { where?: { coachId?: string } }) => {
        const coachId = args?.where?.coachId;
        return groupCoachRows.filter(
          (r) =>
            (!coachId || r.coachId === coachId) && r.accessGroup.deletedAt === null,
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
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        return orgs.find((o) => o.id === args.where.id) ?? null;
      }),
    },
    coach: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        return coaches.find((c) => c.id === args.where.id) ?? null;
      }),
    },
    assessmentCampaign: {
      findFirst: jest.fn(
        async (args: { where: { id?: string; deletedAt?: Date | null } }) => {
          const row = campaigns.find((c) => c.id === args.where.id) ?? null;
          if (!row) return null;
          if (args.where.deletedAt === null && (row.deletedAt ?? null) !== null) {
            return null;
          }
          return row;
        },
      ),
    },
  };
}

beforeEach(() => {
  delete process.env.ACCESS_POLICY_VERSION;
  resetAccessPolicyVersionCache();
});

// ────────────────────────────────────────────────────────────────────────
// canViewGroupReport
// ────────────────────────────────────────────────────────────────────────

describe("canViewGroupReport", () => {
  function setup(args: {
    campaignCreatedByCoachId: string | null;
    orgOwnerCoachId: string;
    groupGrantsTemplate: boolean;
    coachCertStatus?: string;
    campaignDeletedAt?: Date | null;
    orgDeletedAt?: Date | null;
  }) {
    return buildDb({
      campaigns: [
        {
          id: "camp-1",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: args.campaignCreatedByCoachId,
          status: "ACTIVE",
          deletedAt: args.campaignDeletedAt ?? null,
        },
      ],
      orgs: [
        {
          id: "org-1",
          ownerCoachId: args.orgOwnerCoachId,
          deletedAt: args.orgDeletedAt ?? null,
        },
      ],
      coaches: [
        {
          id: "coach-1",
          certificationStatus: args.coachCertStatus ?? "ACTIVE",
        },
      ],
      groupCoachRows: args.groupGrantsTemplate
        ? [
            {
              accessGroupId: "g-a",
              coachId: "coach-1",
              accessGroup: { id: "g-a", deletedAt: null },
            },
          ]
        : [],
      groupTemplateRows: args.groupGrantsTemplate
        ? [{ accessGroupId: "g-a", templateId: "T1" }]
        : [],
    });
  }

  it("admin → true regardless (bypass)", async () => {
    const db = setup({
      campaignCreatedByCoachId: "other",
      orgOwnerCoachId: "other",
      groupGrantsTemplate: false,
    });
    await expect(
      canViewGroupReport(db, makeActor({ role: "ADMIN", coachId: null }), "camp-1"),
    ).resolves.toBe(true);
  });

  it("staff → true regardless (bypass)", async () => {
    const db = setup({
      campaignCreatedByCoachId: "other",
      orgOwnerCoachId: "other",
      groupGrantsTemplate: false,
    });
    await expect(
      canViewGroupReport(db, makeActor({ role: "STAFF", coachId: null }), "camp-1"),
    ).resolves.toBe(true);
  });

  it("active owner-coach WITH template access → true", async () => {
    const db = setup({
      campaignCreatedByCoachId: "coach-1",
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: true,
    });
    await expect(
      canViewGroupReport(db, makeActor({ coachId: "coach-1" }), "camp-1"),
    ).resolves.toBe(true);
  });

  it("owner-coach who LOST template access → false (key difference from the lenient read gate)", async () => {
    const db = setup({
      campaignCreatedByCoachId: "coach-1",
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: false, // template access revoked
    });
    await expect(
      canViewGroupReport(db, makeActor({ coachId: "coach-1" }), "camp-1"),
    ).resolves.toBe(false);
  });

  it("inactive (DEACTIVATED) owner-coach → false", async () => {
    const db = setup({
      campaignCreatedByCoachId: "coach-1",
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: true,
      coachCertStatus: "DEACTIVATED",
    });
    await expect(
      canViewGroupReport(db, makeActor({ coachId: "coach-1" }), "camp-1"),
    ).resolves.toBe(false);
  });

  it("PENDING (not-yet-active) owner-coach → false", async () => {
    const db = setup({
      campaignCreatedByCoachId: "coach-1",
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: true,
      coachCertStatus: "PENDING",
    });
    await expect(
      canViewGroupReport(db, makeActor({ coachId: "coach-1" }), "camp-1"),
    ).resolves.toBe(false);
  });

  it("owner-coach who LOST org ownership → false", async () => {
    const db = setup({
      campaignCreatedByCoachId: "coach-1",
      orgOwnerCoachId: "someone-else", // org ownership transferred away
      groupGrantsTemplate: true,
    });
    await expect(
      canViewGroupReport(db, makeActor({ coachId: "coach-1" }), "camp-1"),
    ).resolves.toBe(false);
  });

  it("non-owner coach (did not create the campaign) → false", async () => {
    const db = setup({
      campaignCreatedByCoachId: "someone-else",
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: true,
    });
    await expect(
      canViewGroupReport(db, makeActor({ coachId: "coach-1" }), "camp-1"),
    ).resolves.toBe(false);
  });

  it("PUBLIC campaign (createdByCoachId=null) → coach false (admin-only)", async () => {
    const db = setup({
      campaignCreatedByCoachId: null,
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: true,
    });
    await expect(
      canViewGroupReport(db, makeActor({ coachId: "coach-1" }), "camp-1"),
    ).resolves.toBe(false);
  });

  it("soft-deleted campaign → false (LIVE-only)", async () => {
    const db = setup({
      campaignCreatedByCoachId: "coach-1",
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: true,
      campaignDeletedAt: new Date(),
    });
    await expect(
      canViewGroupReport(db, makeActor({ coachId: "coach-1" }), "camp-1"),
    ).resolves.toBe(false);
  });

  it("soft-deleted org → false", async () => {
    const db = setup({
      campaignCreatedByCoachId: "coach-1",
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: true,
      orgDeletedAt: new Date(),
    });
    await expect(
      canViewGroupReport(db, makeActor({ coachId: "coach-1" }), "camp-1"),
    ).resolves.toBe(false);
  });

  it("unknown campaign → false (never throws)", async () => {
    const db = buildDb({});
    await expect(
      canViewGroupReport(db, makeActor({ coachId: "coach-1" }), "ghost"),
    ).resolves.toBe(false);
  });

  it("coach actor with null coachId → false (degenerate)", async () => {
    const db = setup({
      campaignCreatedByCoachId: "coach-1",
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: true,
    });
    await expect(
      canViewGroupReport(db, makeActor({ role: "COACH", coachId: null }), "camp-1"),
    ).resolves.toBe(false);
  });

  it("coach row missing in DB → false (cannot confirm active status)", async () => {
    const db = buildDb({
      campaigns: [
        {
          id: "camp-1",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: "coach-1",
          status: "ACTIVE",
        },
      ],
      orgs: [{ id: "org-1", ownerCoachId: "coach-1", deletedAt: null }],
      coaches: [], // no coach row
      groupCoachRows: [
        {
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [{ accessGroupId: "g-a", templateId: "T1" }],
    });
    await expect(
      canViewGroupReport(db, makeActor({ coachId: "coach-1" }), "camp-1"),
    ).resolves.toBe(false);
  });
});
