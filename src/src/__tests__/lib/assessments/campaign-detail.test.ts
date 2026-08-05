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
  type TemplateVersionRow,
} from "@/lib/assessments/campaign-detail";
import { activePublishedWhere } from "@/lib/assessments/active-version";

function baseCampaign() {
  const reportStyleLockedAt = new Date("2026-05-05T12:34:56.000Z");
  return {
    id: "c1",
    name: "Q2 Rockefeller",
    alias: "acme_rock_q2",
    status: "ACTIVE" as const,
    openAt: new Date("2026-05-01T10:00:00Z"),
    closeAt: new Date("2026-05-20T23:59:00Z"),
    createdAt: new Date("2026-04-25T08:00:00Z"),
    template: {
      id: "tpl-1",
      name: "Rockefeller Habits",
      alias: "rockefeller-habits",
    },
    reportStyle: "CLASSIC" as const,
    reportStyleSource: "TEMPLATE_DEFAULT" as const,
    reportStyleLockedAt,
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
  /** Wave EV — sibling versions for the newer-edition check. Typed, so a
   *  malformed fixture cannot compile silently (the hole the required-delegate
   *  change was justified by). */
  versions?: TemplateVersionRow[];
  /** Wave EV — make the sibling lookup reject, to exercise the degraded path. */
  versionsThrow?: boolean;
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
    assessmentTemplateVersion: {
      findMany: opts.versionsThrow
        ? jest.fn().mockRejectedValue(new Error("connection terminated"))
        : jest.fn().mockResolvedValue(opts.versions ?? []),
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

  it("projects the stored report appearance values with a Date lock timestamp", async () => {
    const { campaign } = await getCampaignOverview(buildDb({}), "c1");

    expect(campaign).toEqual(
      expect.objectContaining({
        templateAlias: "rockefeller-habits",
        reportStyle: "CLASSIC",
        reportStyleSource: "TEMPLATE_DEFAULT",
        reportStyleLockedAt: new Date("2026-05-05T12:34:56.000Z"),
      }),
    );
    expect(campaign.reportStyleLockedAt).toBeInstanceOf(Date);
    expect(campaign.reportStyleLockedAt?.toISOString()).toBe(
      "2026-05-05T12:34:56.000Z",
    );
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

// ────────────────────────────────────────────────────────────────────────
// Wave EV — the edition-standing seam inside getCampaignOverview()
//
// The pure decision is covered in edition-standing.test.ts and the render in
// campaign-edition-tile.test.tsx. This block covers the MIDDLE — the query
// shape and the degraded paths — because that is where the review of PR #241
// found a real defect: a failed sibling lookup used to fall back to `[]`, which
// made the tile assert "you are on the newest edition" after a transient read
// failure. Precisely the falsehood this feature exists to prevent.
// ────────────────────────────────────────────────────────────────────────

function campaignOnVersion(
  versionNumber: number,
  publishedAt: Date | null,
  archivedAt: Date | null = null,
) {
  return {
    ...baseCampaign(),
    // templateId is sourced from the VERSION in prod (the two FKs are
    // independent), so the fixture must carry it here too.
    version: {
      templateId: "tpl-1",
      versionNumber,
      publishedAt,
      archivedAt,
      language: "enUS",
    },
  };
}

const siblingVersion = (versionNumber: number) => ({
  templateId: "tpl-1",
  versionNumber,
  language: "enUS",
  publishedAt: new Date("2026-07-27T09:00:00Z"),
  archivedAt: null,
});

describe("getCampaignOverview — Wave EV edition standing", () => {
  it("reports the pinned edition and no warning when nothing newer exists", async () => {
    const db = buildDb({
      campaign: campaignOnVersion(3, new Date("2026-07-02T09:00:00Z")),
      versions: [],
    });
    const { campaign } = await getCampaignOverview(db, "c1");
    expect(campaign.edition).toEqual({
      versionNumber: 3,
      publishedAt: new Date("2026-07-02T09:00:00Z"),
      pinnedRetired: false,
      newerEditionAvailable: false,
    });
  });

  it("warns when a newer published edition exists", async () => {
    const db = buildDb({
      campaign: campaignOnVersion(3, new Date("2026-07-02T09:00:00Z")),
      versions: [siblingVersion(4)],
    });
    const { campaign } = await getCampaignOverview(db, "c1");
    expect(campaign.edition?.newerEditionAvailable).toBe(true);
    // Still the edition actually being served — never the newer one.
    expect(campaign.edition?.versionNumber).toBe(3);
  });

  it("projects archivedAt from the pinned version", async () => {
    const db = buildDb({
      campaign: campaignOnVersion(3, new Date("2026-07-02T09:00:00Z")),
    });
    await getCampaignOverview(db, "c1");
    const { select } = (
      db.assessmentCampaign.findUnique as jest.Mock
    ).mock.calls[0][0].include.version;
    expect(select).toEqual({
      templateId: true,
      versionNumber: true,
      publishedAt: true,
      language: true,
      archivedAt: true,
    });
  });

  it("reports a retired pin without querying sibling versions", async () => {
    const db = buildDb({
      campaign: campaignOnVersion(
        3,
        new Date("2026-07-02T09:00:00Z"),
        new Date("2026-07-30T12:00:00Z"),
      ),
      versionsThrow: true,
    });

    const { campaign } = await getCampaignOverview(db, "c1");

    expect(campaign.edition).toEqual({
      versionNumber: 3,
      publishedAt: new Date("2026-07-02T09:00:00Z"),
      pinnedRetired: true,
      newerEditionAvailable: false,
    });
    expect(db.assessmentTemplateVersion.findMany).not.toHaveBeenCalled();
  });

  it("scopes the lookup to this template, this language, and strictly newer rows", async () => {
    const db = buildDb({
      campaign: campaignOnVersion(3, new Date("2026-07-02T09:00:00Z")),
    });
    await getCampaignOverview(db, "c1");
    const where = (
      db.assessmentTemplateVersion.findMany as jest.Mock
    ).mock.calls[0][0].where;
    expect(where.templateId).toBe("tpl-1");
    expect(where.language).toBe("enUS");
    expect(where.versionNumber).toEqual({ gt: 3 });
  });

  it("filters to published, non-archived rows via the canonical Active filter", async () => {
    // "Newer edition available" must mean "available to campaign-create", so the
    // filter has to be the shared one from active-version.ts — not a hand-rolled
    // copy that could drift from what create actually offers.
    const db = buildDb({
      campaign: campaignOnVersion(3, new Date("2026-07-02T09:00:00Z")),
    });
    await getCampaignOverview(db, "c1");
    const where = (
      db.assessmentTemplateVersion.findMany as jest.Mock
    ).mock.calls[0][0].where;
    expect(where).toMatchObject(activePublishedWhere);
  });

  it("projects every field the edition decision re-checks", async () => {
    // resolveEditionStanding re-applies each predicate on the returned rows, so a
    // NARROWED projection is silently dangerous in a way a loosened WHERE is not:
    // without `versionNumber`, Number.isFinite(undefined) is false, every sibling
    // is rejected, and the tile asserts "you are on the newest edition" — round
    // 1's exact defect reached through the select instead of the fallback.
    const db = buildDb({
      campaign: campaignOnVersion(3, new Date("2026-07-02T09:00:00Z")),
    });
    await getCampaignOverview(db, "c1");
    const { select } = (
      db.assessmentTemplateVersion.findMany as jest.Mock
    ).mock.calls[0][0];
    // toEqual on VALUES, not Object.keys: Prisma reads `select: { f: false }` as
    // an exclusion, so a truthiness flip would slip past a key-presence check and
    // reopen the same reassuring-answer failure. Exact match also catches an
    // extra key or a nested-select rewrite.
    expect(select).toEqual({
      templateId: true,
      versionNumber: true,
      language: true,
      publishedAt: true,
      archivedAt: true,
    });
  });

  it("returns NULL — never a false 'you are current' — when the lookup fails", async () => {
    // Regression guard for the PR #241 review finding. A transient read failure
    // (Neon cold start, dropped connection) must not be reported as currency.
    const db = buildDb({
      campaign: campaignOnVersion(3, new Date("2026-07-02T09:00:00Z")),
      versionsThrow: true,
    });
    const { campaign } = await getCampaignOverview(db, "c1");
    expect(campaign.edition).toBeNull();
  });

  it("still returns the rest of the overview when the lookup fails", async () => {
    const db = buildDb({
      campaign: campaignOnVersion(3, new Date("2026-07-02T09:00:00Z")),
      versionsThrow: true,
    });
    const { campaign, stats } = await getCampaignOverview(db, "c1");
    expect(campaign.templateName).toBe("Rockefeller Habits");
    expect(stats).toBeDefined();
  });

  it("returns null and never queries when the campaign has no pinned version", async () => {
    const db = buildDb({ campaign: baseCampaign() });
    const { campaign } = await getCampaignOverview(db, "c1");
    expect(campaign.edition).toBeNull();
    expect(db.assessmentTemplateVersion.findMany).not.toHaveBeenCalled();
  });

  it("returns null when the pinned version is an unpublished draft", async () => {
    const db = buildDb({
      campaign: campaignOnVersion(3, null),
      versions: [siblingVersion(4)],
    });
    const { campaign } = await getCampaignOverview(db, "c1");
    expect(campaign.edition).toBeNull();
  });
});
