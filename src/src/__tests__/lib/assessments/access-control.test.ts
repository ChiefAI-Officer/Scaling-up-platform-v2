/**
 * Assessment v7.6 — Service-layer access-control predicates.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md →
 *   - "canAccessTemplate — INTERSECTION semantics (decision 6)"
 *   - "Organization-level access"
 *   - "Campaign ownership and access revocation (Round 2 M-3, Round 1 H-8)"
 *   - "canCreateCampaign (Round 1 M-6 + Round 3 H-2)"
 *
 * Strategy: stub the Prisma client at the delegate level. The predicates
 * are pure functions over (db, actor, target) — we exercise the joins
 * by feeding the delegates' mock return values for AccessGroupCoach +
 * AccessGroupTemplate.
 */

import type { ApiActor } from "@/lib/auth/access-control";
import {
  canAccessTemplate,
  canAccessOrganization,
  canCreateCampaign,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import { resetAccessPolicyVersionCache } from "@/lib/auth/access-policy-version";

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
  // SEC-M6: optional in fixtures (defaults to live/not-deleted).
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
      // SEC-M6: canManageCampaign now loads via findFirst with a
      // `deletedAt: null` guard by default. Honor it in the stub so
      // soft-deleted fixtures are filtered out.
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
  // Default policy = intersection. Re-read after each test in case the
  // env was clobbered by a sibling.
  delete process.env.ACCESS_POLICY_VERSION;
  resetAccessPolicyVersionCache();
});

// ────────────────────────────────────────────────────────────────────────
// canAccessTemplate — INTERSECTION
// ────────────────────────────────────────────────────────────────────────

describe("canAccessTemplate (INTERSECTION semantics)", () => {
  const actor = makeActor({ role: "COACH", coachId: "coach-1" });

  it("group A {T1,T2,T3,T4} + group B {T1} → true only for T1", async () => {
    const db = buildDb({
      groupCoachRows: [
        {
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
        {
          accessGroupId: "g-b",
          coachId: "coach-1",
          accessGroup: { id: "g-b", deletedAt: null },
        },
      ],
      groupTemplateRows: [
        { accessGroupId: "g-a", templateId: "T1" },
        { accessGroupId: "g-a", templateId: "T2" },
        { accessGroupId: "g-a", templateId: "T3" },
        { accessGroupId: "g-a", templateId: "T4" },
        { accessGroupId: "g-b", templateId: "T1" },
      ],
    });

    await expect(canAccessTemplate(db, actor, "T1")).resolves.toBe(true);
    await expect(canAccessTemplate(db, actor, "T2")).resolves.toBe(false);
    await expect(canAccessTemplate(db, actor, "T3")).resolves.toBe(false);
    await expect(canAccessTemplate(db, actor, "T4")).resolves.toBe(false);
  });

  it("group A {T1,T2} alone → true for T1, T2", async () => {
    const db = buildDb({
      groupCoachRows: [
        {
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [
        { accessGroupId: "g-a", templateId: "T1" },
        { accessGroupId: "g-a", templateId: "T2" },
      ],
    });

    await expect(canAccessTemplate(db, actor, "T1")).resolves.toBe(true);
    await expect(canAccessTemplate(db, actor, "T2")).resolves.toBe(true);
    await expect(canAccessTemplate(db, actor, "T9")).resolves.toBe(false);
  });

  it("zero non-archived groups → false for everything (no fallback)", async () => {
    const db = buildDb({
      groupCoachRows: [],
      groupTemplateRows: [
        { accessGroupId: "g-a", templateId: "T1" },
      ],
    });

    await expect(canAccessTemplate(db, actor, "T1")).resolves.toBe(false);
  });

  it("soft-deleted group is excluded from the intersection", async () => {
    const db = buildDb({
      groupCoachRows: [
        // The DB's findMany filters deletedAt IS NULL, so we emulate that
        // by only returning non-soft-deleted group rows. The "g-archived"
        // row exists in DB but is filtered out by the buildDb helper.
        {
          accessGroupId: "g-a",
          coachId: "coach-1",
          accessGroup: { id: "g-a", deletedAt: null },
        },
      ],
      groupTemplateRows: [
        { accessGroupId: "g-a", templateId: "T1" },
        { accessGroupId: "g-archived", templateId: "T1" }, // should be unreachable
      ],
    });

    await expect(canAccessTemplate(db, actor, "T1")).resolves.toBe(true);
  });

  it("only-archived membership → zero effective groups → false", async () => {
    // buildDb auto-filters deletedAt IS NULL — emulate the scenario where
    // the coach's ONLY membership row points at an archived group.
    const db = buildDb({
      groupCoachRows: [],
      groupTemplateRows: [{ accessGroupId: "g-archived", templateId: "T1" }],
    });

    await expect(canAccessTemplate(db, actor, "T1")).resolves.toBe(false);
  });

  it("admin actor → true regardless of groups (bypass)", async () => {
    const admin = makeActor({ role: "ADMIN", coachId: null });
    const db = buildDb({
      groupCoachRows: [],
      groupTemplateRows: [],
    });

    await expect(canAccessTemplate(db, admin, "T1")).resolves.toBe(true);
    await expect(canAccessTemplate(db, admin, "T-anything")).resolves.toBe(true);
  });

  it("staff actor → true regardless of groups (bypass)", async () => {
    const staff = makeActor({ role: "STAFF", coachId: null });
    const db = buildDb({});
    await expect(canAccessTemplate(db, staff, "T1")).resolves.toBe(true);
  });

  it("coach actor with null coachId → false (degenerate)", async () => {
    const broken = makeActor({ role: "COACH", coachId: null });
    const db = buildDb({});
    await expect(canAccessTemplate(db, broken, "T1")).resolves.toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// canAccessOrganization
// ────────────────────────────────────────────────────────────────────────

describe("canAccessOrganization", () => {
  it("returns true when org.ownerCoachId === actor.coachId", async () => {
    const db = buildDb({
      orgs: [{ id: "org-1", ownerCoachId: "coach-1", deletedAt: null }],
    });
    await expect(
      canAccessOrganization(db, makeActor({ coachId: "coach-1" }), "org-1"),
    ).resolves.toBe(true);
  });

  it("returns false when owner is different + actor not privileged", async () => {
    const db = buildDb({
      orgs: [{ id: "org-1", ownerCoachId: "other-coach", deletedAt: null }],
    });
    await expect(
      canAccessOrganization(db, makeActor({ coachId: "coach-1" }), "org-1"),
    ).resolves.toBe(false);
  });

  it("returns true for admin actor regardless of owner", async () => {
    const db = buildDb({
      orgs: [{ id: "org-1", ownerCoachId: "other-coach", deletedAt: null }],
    });
    await expect(
      canAccessOrganization(db, makeActor({ role: "ADMIN" }), "org-1"),
    ).resolves.toBe(true);
  });

  it("returns true for staff actor", async () => {
    const db = buildDb({
      orgs: [{ id: "org-1", ownerCoachId: "other-coach", deletedAt: null }],
    });
    await expect(
      canAccessOrganization(db, makeActor({ role: "STAFF" }), "org-1"),
    ).resolves.toBe(true);
  });

  it("returns false for soft-deleted org (everyone, including admin)", async () => {
    const db = buildDb({
      orgs: [
        { id: "org-1", ownerCoachId: "coach-1", deletedAt: new Date() },
      ],
    });
    await expect(
      canAccessOrganization(db, makeActor({ coachId: "coach-1" }), "org-1"),
    ).resolves.toBe(false);
    await expect(
      canAccessOrganization(db, makeActor({ role: "ADMIN" }), "org-1"),
    ).resolves.toBe(false);
  });

  it("returns false when org does not exist", async () => {
    const db = buildDb({ orgs: [] });
    await expect(
      canAccessOrganization(db, makeActor({ role: "ADMIN" }), "nope"),
    ).resolves.toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// canCreateCampaign
// ────────────────────────────────────────────────────────────────────────

describe("canCreateCampaign", () => {
  function setup(certificationStatus: string, groupTemplate: boolean) {
    return buildDb({
      coaches: [{ id: "coach-1", certificationStatus }],
      groupCoachRows: groupTemplate
        ? [
            {
              accessGroupId: "g-a",
              coachId: "coach-1",
              accessGroup: { id: "g-a", deletedAt: null },
            },
          ]
        : [],
      groupTemplateRows: groupTemplate
        ? [{ accessGroupId: "g-a", templateId: "T1" }]
        : [],
    });
  }

  it("ACTIVE coach + template in group → true", async () => {
    const db = setup("ACTIVE", true);
    await expect(
      canCreateCampaign(db, makeActor({ coachId: "coach-1" }), "T1"),
    ).resolves.toBe(true);
  });

  it("PENDING coach + template in group → false (NOT_CERTIFIED)", async () => {
    const db = setup("PENDING", true);
    await expect(
      canCreateCampaign(db, makeActor({ coachId: "coach-1" }), "T1"),
    ).resolves.toBe(false);
  });

  it("DEACTIVATED coach + template in group → false (COACH_DEACTIVATED)", async () => {
    const db = setup("DEACTIVATED", true);
    await expect(
      canCreateCampaign(db, makeActor({ coachId: "coach-1" }), "T1"),
    ).resolves.toBe(false);
  });

  it("ACTIVE coach + no group → false (NO_TEMPLATE_ACCESS)", async () => {
    const db = setup("ACTIVE", false);
    await expect(
      canCreateCampaign(db, makeActor({ coachId: "coach-1" }), "T1"),
    ).resolves.toBe(false);
  });

  it("admin actor → always true (bypass)", async () => {
    const db = setup("PENDING", false);
    await expect(
      canCreateCampaign(db, makeActor({ role: "ADMIN" }), "T1"),
    ).resolves.toBe(true);
  });

  it("coach actor with null coachId → false", async () => {
    const db = setup("ACTIVE", true);
    await expect(
      canCreateCampaign(db, makeActor({ role: "COACH", coachId: null }), "T1"),
    ).resolves.toBe(false);
  });

  it("coach not found in DB → false", async () => {
    const db = buildDb({}); // no coaches
    await expect(
      canCreateCampaign(db, makeActor({ coachId: "ghost" }), "T1"),
    ).resolves.toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// canManageCampaign
// ────────────────────────────────────────────────────────────────────────

describe("canManageCampaign", () => {
  function setup(args: {
    campaignCreatedByCoachId: string | null;
    orgOwnerCoachId: string;
    groupGrantsTemplate: boolean;
    status?: "DRAFT" | "ACTIVE" | "CLOSED";
    coachCertStatus?: string;
  }) {
    return buildDb({
      campaigns: [
        {
          id: "camp-1",
          organizationId: "org-1",
          templateId: "T1",
          createdByCoachId: args.campaignCreatedByCoachId,
          status: args.status ?? "ACTIVE",
        },
      ],
      orgs: [
        {
          id: "org-1",
          ownerCoachId: args.orgOwnerCoachId,
          deletedAt: null,
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

  it("admin → write=true regardless", async () => {
    const db = setup({
      campaignCreatedByCoachId: "other",
      orgOwnerCoachId: "other",
      groupGrantsTemplate: false,
    });
    await expect(
      canManageCampaign(db, makeActor({ role: "ADMIN" }), "camp-1", "write"),
    ).resolves.toBe(true);
  });

  it("owner-coach with template access + owns org → write=true", async () => {
    const db = setup({
      campaignCreatedByCoachId: "coach-1",
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: true,
    });
    await expect(
      canManageCampaign(db, makeActor({ coachId: "coach-1" }), "camp-1", "write"),
    ).resolves.toBe(true);
  });

  it("owner-coach who LOST template access → read=true, write=false", async () => {
    const db = setup({
      campaignCreatedByCoachId: "coach-1",
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: false, // template access revoked
    });
    await expect(
      canManageCampaign(db, makeActor({ coachId: "coach-1" }), "camp-1", "read"),
    ).resolves.toBe(true);
    await expect(
      canManageCampaign(db, makeActor({ coachId: "coach-1" }), "camp-1", "write"),
    ).resolves.toBe(false);
  });

  it("coach who does NOT own the campaign → both read and write false", async () => {
    const db = setup({
      campaignCreatedByCoachId: "someone-else",
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: true,
    });
    await expect(
      canManageCampaign(db, makeActor({ coachId: "coach-1" }), "camp-1", "read"),
    ).resolves.toBe(false);
    await expect(
      canManageCampaign(db, makeActor({ coachId: "coach-1" }), "camp-1", "write"),
    ).resolves.toBe(false);
  });

  it("missing campaign → false", async () => {
    const db = buildDb({});
    await expect(
      canManageCampaign(db, makeActor({ role: "ADMIN" }), "ghost", "write"),
    ).resolves.toBe(false);
  });

  it("PUBLIC campaign with createdByCoachId=null → coach actor read/write false (admin-only)", async () => {
    const db = setup({
      campaignCreatedByCoachId: null,
      orgOwnerCoachId: "coach-1",
      groupGrantsTemplate: true,
    });
    await expect(
      canManageCampaign(db, makeActor({ coachId: "coach-1" }), "camp-1", "write"),
    ).resolves.toBe(false);
    await expect(
      canManageCampaign(db, makeActor({ coachId: "coach-1" }), "camp-1", "read"),
    ).resolves.toBe(false);
  });
});
