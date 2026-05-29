/**
 * Assessment v7.6 — campaign-detail service-helper tests (Task F).
 *
 * Covers getCampaignOverview() stats math + getCampaignRespondents()
 * join correctness. Pure-function tests against a stub DB.
 */

import {
  getCampaignOverview,
  getCampaignRespondents,
  type CampaignDetailDb,
} from "@/lib/assessments/campaign-detail";

function baseCampaign() {
  return {
    id: "c1",
    name: "Q2 Rockefeller",
    alias: "acme_rock_q2",
    status: "ACTIVE" as const,
    openAt: new Date("2026-05-01T10:00:00Z"),
    closeAt: new Date("2026-05-20T23:59:00Z"),
    createdAt: new Date("2026-04-25T08:00:00Z"),
    template: { id: "tpl-1", name: "Rockefeller Habits" },
    organization: { id: "org-1", name: "Acme Corp" },
  };
}

function participant(
  id: string,
  respondentId: string,
  firstName: string,
  opts: {
    isCEO?: boolean;
    jobTitle?: string | null;
    teamPathAtAdd?: string[] | null;
    teamLabelsAtAdd?: string[] | null;
  } = {},
) {
  return {
    id,
    isCEO: opts.isCEO ?? false,
    teamPathAtAdd: opts.teamPathAtAdd ?? null,
    teamLabelsAtAdd: opts.teamLabelsAtAdd ?? null,
    respondent: {
      id: respondentId,
      firstName,
      lastName: "Lastname",
      email: `${firstName.toLowerCase()}@example.com`,
      jobTitle: opts.jobTitle ?? null,
    },
  };
}

function invitation(
  id: string,
  respondentId: string,
  status: "PENDING" | "SENT" | "VIEWED" | "SUBMITTED",
  opts: {
    sentAt?: Date | null;
    submittedAt?: Date | null;
    revokedAt?: Date | null;
    resentCount?: number;
  } = {},
) {
  return {
    id,
    respondentId,
    status,
    sentAt: opts.sentAt ?? null,
    submittedAt: opts.submittedAt ?? null,
    expiresAt: new Date("2026-08-01T00:00:00Z"),
    resentCount: opts.resentCount ?? 0,
    revokedAt: opts.revokedAt ?? null,
  };
}

function buildDb(opts: {
  campaign?: ReturnType<typeof baseCampaign> | null;
  participants?: ReturnType<typeof participant>[];
  invitations?: ReturnType<typeof invitation>[];
  submissions?: Array<{ id: string; respondentId: string | null; submittedAt: Date }>;
}): CampaignDetailDb {
  return {
    assessmentCampaign: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.campaign === undefined ? baseCampaign() : opts.campaign),
    },
    assessmentCampaignParticipant: {
      findMany: jest.fn().mockResolvedValue(opts.participants ?? []),
    },
    assessmentInvitation: {
      findMany: jest.fn().mockResolvedValue(opts.invitations ?? []),
    },
    assessmentSubmission: {
      findMany: jest.fn().mockResolvedValue(opts.submissions ?? []),
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// getCampaignOverview()
// ────────────────────────────────────────────────────────────────────────

describe("getCampaignOverview", () => {
  it("throws when campaign is missing", async () => {
    const db = buildDb({ campaign: null });
    await expect(getCampaignOverview(db, "c1")).rejects.toThrow(/not found/);
  });

  it("zero participants → all-zero stats", async () => {
    const db = buildDb({ participants: [], invitations: [] });
    const o = await getCampaignOverview(db, "c1");
    expect(o.stats).toEqual({
      totalParticipants: 0,
      invited: 0,
      viewed: 0,
      submitted: 0,
      completionPct: 0,
    });
    expect(o.campaign.templateName).toBe("Rockefeller Habits");
    expect(o.campaign.organizationName).toBe("Acme Corp");
  });

  it("all PENDING — invited/viewed/submitted = 0", async () => {
    const db = buildDb({
      participants: [
        participant("p1", "r1", "Alice"),
        participant("p2", "r2", "Bob"),
      ],
      invitations: [
        invitation("i1", "r1", "PENDING"),
        invitation("i2", "r2", "PENDING"),
      ],
    });
    const o = await getCampaignOverview(db, "c1");
    expect(o.stats).toEqual({
      totalParticipants: 2,
      invited: 0,
      viewed: 0,
      submitted: 0,
      completionPct: 0,
    });
  });

  it("mixed statuses — monotonic counting (SUBMITTED ⊂ VIEWED ⊂ INVITED)", async () => {
    const db = buildDb({
      participants: [
        participant("p1", "r1", "Alice"),
        participant("p2", "r2", "Bob"),
        participant("p3", "r3", "Carol"),
        participant("p4", "r4", "Dan"),
        participant("p5", "r5", "Erin"),
      ],
      invitations: [
        invitation("i1", "r1", "PENDING"),
        invitation("i2", "r2", "SENT", { sentAt: new Date() }),
        invitation("i3", "r3", "VIEWED", { sentAt: new Date() }),
        invitation("i4", "r4", "SUBMITTED", {
          sentAt: new Date(),
          submittedAt: new Date(),
        }),
        invitation("i5", "r5", "SUBMITTED", {
          sentAt: new Date(),
          submittedAt: new Date(),
        }),
      ],
    });
    const o = await getCampaignOverview(db, "c1");
    expect(o.stats).toEqual({
      totalParticipants: 5,
      invited: 4, // SENT + VIEWED + 2 SUBMITTED
      viewed: 3, // VIEWED + 2 SUBMITTED
      submitted: 2,
      completionPct: 40, // 2/5
    });
  });

  it("100% submitted — completionPct=100", async () => {
    const db = buildDb({
      participants: [
        participant("p1", "r1", "Alice"),
        participant("p2", "r2", "Bob"),
      ],
      invitations: [
        invitation("i1", "r1", "SUBMITTED", { sentAt: new Date() }),
        invitation("i2", "r2", "SUBMITTED", { sentAt: new Date() }),
      ],
    });
    const o = await getCampaignOverview(db, "c1");
    expect(o.stats).toEqual({
      totalParticipants: 2,
      invited: 2,
      viewed: 2,
      submitted: 2,
      completionPct: 100,
    });
  });

  it("revoked invitations don't count toward invited stat", async () => {
    const db = buildDb({
      participants: [
        participant("p1", "r1", "Alice"),
        participant("p2", "r2", "Bob"),
      ],
      invitations: [
        invitation("i1", "r1", "SENT", {
          sentAt: new Date(),
          revokedAt: new Date(),
        }),
        invitation("i2", "r2", "SUBMITTED", { sentAt: new Date() }),
      ],
    });
    const o = await getCampaignOverview(db, "c1");
    expect(o.stats.invited).toBe(1); // r1 revoked, only r2 counted
    expect(o.stats.submitted).toBe(1);
  });

  it("rounds completionPct correctly (1/3 = 33%)", async () => {
    const db = buildDb({
      participants: [
        participant("p1", "r1", "A"),
        participant("p2", "r2", "B"),
        participant("p3", "r3", "C"),
      ],
      invitations: [
        invitation("i1", "r1", "SUBMITTED", { sentAt: new Date() }),
        invitation("i2", "r2", "VIEWED", { sentAt: new Date() }),
        invitation("i3", "r3", "PENDING"),
      ],
    });
    const o = await getCampaignOverview(db, "c1");
    expect(o.stats.completionPct).toBe(33);
  });
});

// ────────────────────────────────────────────────────────────────────────
// getCampaignRespondents()
// ────────────────────────────────────────────────────────────────────────

describe("getCampaignRespondents", () => {
  it("missing invitation → invitation: null", async () => {
    const db = buildDb({
      participants: [participant("p1", "r1", "Alice")],
      invitations: [],
      submissions: [],
    });
    const rows = await getCampaignRespondents(db, "c1");
    expect(rows).toHaveLength(1);
    expect(rows[0].invitation).toBeNull();
    expect(rows[0].hasSubmission).toBe(false);
    expect(rows[0].submissionId).toBeNull();
    expect(rows[0].submittedAt).toBeNull();
  });

  it("invitation join — fields propagate", async () => {
    const sentAt = new Date("2026-05-06T10:30:00Z");
    const db = buildDb({
      participants: [participant("p1", "r1", "Alice")],
      invitations: [
        invitation("i1", "r1", "SENT", { sentAt, resentCount: 2 }),
      ],
      submissions: [],
    });
    const rows = await getCampaignRespondents(db, "c1");
    expect(rows[0].invitation).toMatchObject({
      id: "i1",
      status: "SENT",
      sentAt,
      resentCount: 2,
      revokedAt: null,
    });
    expect(rows[0].hasSubmission).toBe(false);
  });

  it("submission join — hasSubmission true with submissionId + submittedAt", async () => {
    const submittedAt = new Date("2026-05-08T12:00:00Z");
    const db = buildDb({
      participants: [participant("p1", "r1", "Alice")],
      invitations: [
        invitation("i1", "r1", "SUBMITTED", {
          sentAt: new Date(),
          submittedAt,
        }),
      ],
      submissions: [{ id: "sub-1", respondentId: "r1", submittedAt }],
    });
    const rows = await getCampaignRespondents(db, "c1");
    expect(rows[0].hasSubmission).toBe(true);
    expect(rows[0].submissionId).toBe("sub-1");
    expect(rows[0].submittedAt).toEqual(submittedAt);
  });

  it("public submissions (respondentId null) don't blow up", async () => {
    const db = buildDb({
      participants: [participant("p1", "r1", "Alice")],
      invitations: [invitation("i1", "r1", "PENDING")],
      submissions: [
        { id: "pub-1", respondentId: null, submittedAt: new Date() },
      ],
    });
    const rows = await getCampaignRespondents(db, "c1");
    expect(rows[0].hasSubmission).toBe(false); // public submission isn't joined to a participant
  });

  it("CEO flag propagates", async () => {
    const db = buildDb({
      participants: [
        participant("p1", "r1", "Alice", { isCEO: true, jobTitle: "CEO" }),
      ],
      invitations: [invitation("i1", "r1", "PENDING")],
    });
    const rows = await getCampaignRespondents(db, "c1");
    expect(rows[0].isCEO).toBe(true);
    expect(rows[0].respondent.jobTitle).toBe("CEO");
  });

  it("revoked invitation preserved in row data for UI affordance", async () => {
    const revokedAt = new Date("2026-05-07T09:00:00Z");
    const db = buildDb({
      participants: [participant("p1", "r1", "Alice")],
      invitations: [
        invitation("i1", "r1", "SENT", {
          sentAt: new Date(),
          revokedAt,
        }),
      ],
    });
    const rows = await getCampaignRespondents(db, "c1");
    expect(rows[0].invitation?.revokedAt).toEqual(revokedAt);
  });

  it("teamSnapshot: null snapshot fields → empty arrays", async () => {
    const db = buildDb({
      participants: [participant("p1", "r1", "Alice")],
      invitations: [],
    });
    const rows = await getCampaignRespondents(db, "c1");
    expect(rows[0].teamSnapshot).toEqual({ pathIds: [], pathLabels: [] });
  });

  it("teamSnapshot: single-segment path → one label", async () => {
    const db = buildDb({
      participants: [
        participant("p1", "r1", "Alice", {
          teamPathAtAdd: ["org-1"],
          teamLabelsAtAdd: ["Acme Corp"],
        }),
      ],
      invitations: [],
    });
    const rows = await getCampaignRespondents(db, "c1");
    expect(rows[0].teamSnapshot).toEqual({
      pathIds: ["org-1"],
      pathLabels: ["Acme Corp"],
    });
  });

  it("teamSnapshot: multi-segment path → ids and labels preserved in order", async () => {
    const db = buildDb({
      participants: [
        participant("p1", "r1", "Alice", {
          teamPathAtAdd: ["t1", "t2", "t3"],
          teamLabelsAtAdd: ["ABC Corp", "Engineering", "Backend"],
        }),
      ],
      invitations: [],
    });
    const rows = await getCampaignRespondents(db, "c1");
    expect(rows[0].teamSnapshot).toEqual({
      pathIds: ["t1", "t2", "t3"],
      pathLabels: ["ABC Corp", "Engineering", "Backend"],
    });
  });
});
