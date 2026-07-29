import type { ApiActor } from "@/lib/auth/access-control";
import {
  getPublicReferralReport,
  listPublicReferrals,
  summarizePublicResult,
} from "@/lib/assessments/public-referrals";

const FROZEN_RESULT = {
  perQuestion: [{ stableKey: "q1", value: 7.4, achieved: true }],
  perSection: [
    {
      stableKey: "people",
      name: "People",
      totalPoints: 7.4,
      averagePoints: 7.4,
      achievedCount: 1,
      totalCount: 1,
    },
  ],
  perDomain: [
    {
      key: "people",
      label: "People",
      totalPoints: 7.4,
      averagePoints: 7.4,
      questionCount: 1,
      tier: null,
    },
  ],
  overallTotal: 7.4,
  overallAverage: 7.4,
  countAchieved: 1,
  tier: { label: "On the way", message: "Keep building." },
  tierMetricValue: 7.4,
  unansweredKeys: [],
};

const PUBLIC_SUBMISSION = {
  id: "sub-1",
  submittedAt: new Date("2026-07-29T08:30:00.000Z"),
  answers: [{ stableKey: "q1", value: 7.4 }],
  result: FROZEN_RESULT,
  publicTaker: {
    firstName: "Avery",
    lastName: "Leader",
    email: "avery@example.com",
  },
  referringCoachEmail: "old-owner-address@example.com",
  referringCoachId: "coach-owner",
  referringCoach: {
    id: "coach-owner",
    certificationStatus: "ACTIVE",
    certificationExpiry: new Date("2027-07-29T00:00:00.000Z"),
  },
  campaign: {
    name: "Quick Assessment",
    status: "ACTIVE",
    accessMode: "PUBLIC",
    deletedAt: null,
    importManifest: null,
    template: {
      id: "template-four-decisions",
      name: "Scaling Up Full",
      alias: "scaling-up-full",
    },
    organization: { name: "Scaling Up" },
    creatorCoach: null,
    version: {
      id: "version-1",
      contentHash: "frozen-content-hash",
      publishedAt: new Date("2026-07-01T00:00:00.000Z"),
      sections: [{ stableKey: "people", name: "People", domain: "people" }],
      questions: [
        {
          stableKey: "q1",
          label: "Do we have the right people?",
          type: "SLIDER_LIKERT",
          sectionStableKey: "people",
          scale: { min: 0, max: 10 },
        },
      ],
      scoringConfig: { tiers: [] },
    },
  },
};

function actor(overrides: Partial<ApiActor> = {}): ApiActor {
  return {
    userId: "user-owner",
    email: "owner@example.com",
    role: "COACH",
    coachId: "coach-owner",
    ...overrides,
  };
}

interface MockTx {
  assessmentSubmission: { findFirst: jest.Mock };
}

function makeReportDb(submission: typeof PUBLIC_SUBMISSION | null) {
  const findFirst = jest.fn().mockResolvedValue(submission);
  const tx: MockTx = { assessmentSubmission: { findFirst } };
  const $transaction = jest
    .fn()
    .mockImplementation(async (callback: (value: MockTx) => Promise<unknown>) =>
      callback(tx),
    );

  return { $transaction, findFirst };
}

describe("getPublicReferralReport", () => {
  it("returns the frozen public report to its immutable active Coach owner", async () => {
    const db = makeReportDb(PUBLIC_SUBMISSION);

    const outcome = await getPublicReferralReport(
      db as never,
      actor(),
      "sub-1",
    );

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.report).toMatchObject({
      respondentName: "Avery Leader",
      companyName: "Scaling Up",
      assessmentName: "Scaling Up Full",
      templateAlias: "scaling-up-full",
      result: FROZEN_RESULT,
      rawAnswers: PUBLIC_SUBMISSION.answers,
      provenance: {
        submissionId: "sub-1",
        versionId: "version-1",
        contentHash: "frozen-content-hash",
      },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("forbids another Coach even when their email matches the delivery snapshot", async () => {
    const db = makeReportDb(PUBLIC_SUBMISSION);

    await expect(
      getPublicReferralReport(
        db as never,
        actor({
          userId: "user-other",
          coachId: "coach-other",
          email: PUBLIC_SUBMISSION.referringCoachEmail,
        }),
        "sub-1",
      ),
    ).resolves.toEqual({ status: "forbidden" });
    expect(db.findFirst.mock.calls[0][0].select).not.toHaveProperty(
      "referringCoachEmail",
    );
  });

  it("forbids the immutable owner when the current Coach is inactive", async () => {
    const db = makeReportDb({
      ...PUBLIC_SUBMISSION,
      referringCoach: {
        ...PUBLIC_SUBMISSION.referringCoach,
        certificationStatus: "DEACTIVATED",
      },
    });

    await expect(
      getPublicReferralReport(db as never, actor(), "sub-1"),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("forbids the immutable owner when certification has expired", async () => {
    const db = makeReportDb({
      ...PUBLIC_SUBMISSION,
      referringCoach: {
        ...PUBLIC_SUBMISSION.referringCoach,
        certificationExpiry: new Date("2025-01-01T00:00:00.000Z"),
      },
    });

    await expect(
      getPublicReferralReport(db as never, actor(), "sub-1"),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it.each(["ADMIN", "STAFF"] as const)(
    "allows %s oversight of an unverified public referral",
    async (role) => {
      const db = makeReportDb({
        ...PUBLIC_SUBMISSION,
        referringCoachId: null as never,
        referringCoach: null as never,
      });

      const outcome = await getPublicReferralReport(
        db as never,
        actor({ role, coachId: null }),
        "sub-1",
      );

      expect(outcome.status).toBe("ok");
    },
  );

  it("keeps a CLOSED Public Campaign report readable", async () => {
    const db = makeReportDb({
      ...PUBLIC_SUBMISSION,
      campaign: { ...PUBLIC_SUBMISSION.campaign, status: "CLOSED" },
    });

    const outcome = await getPublicReferralReport(
      db as never,
      actor(),
      "sub-1",
    );

    expect(outcome.status).toBe("ok");
    expect(db.findFirst.mock.calls[0][0].where.campaign).not.toHaveProperty(
      "status",
    );
  });

  it("treats a soft-deleted or non-public campaign submission as not found", async () => {
    const db = makeReportDb(null);

    await expect(
      getPublicReferralReport(db as never, actor(), "sub-deleted"),
    ).resolves.toEqual({ status: "not-found" });
    expect(db.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "sub-deleted",
          campaign: {
            accessMode: "PUBLIC",
            deletedAt: null,
          },
        },
      }),
    );
  });
});

describe("summarizePublicResult", () => {
  it("suppresses the frozen tier when the scored report policy hides tiers", () => {
    expect(
      summarizePublicResult("scaling-up-full", FROZEN_RESULT),
    ).toEqual({
      kind: "scored",
      overallScore: 7.4,
      tierLabel: null,
      domains: [
        {
          key: "people",
          label: "People",
          score: 7.4,
        },
      ],
    });
  });

  it("shows the frozen tier when the scored report policy enables tiers", () => {
    expect(summarizePublicResult("RockHabits", FROZEN_RESULT)).toMatchObject({
      kind: "scored",
      overallScore: 7.4,
      tierLabel: "On the way",
    });
  });

  it("uses the qualitative instrument policy instead of fabricating a score", () => {
    expect(summarizePublicResult("qsp-v2", FROZEN_RESULT)).toEqual({
      kind: "qualitative",
      label: "Completed",
    });
  });

  it("degrades safely when a scored frozen result is malformed", () => {
    expect(
      summarizePublicResult("scaling-up-full", {
        overallAverage: 7.4,
      }),
    ).toEqual({
      kind: "degraded",
      label: "Result unavailable",
    });
  });
});

describe("listPublicReferrals", () => {
  function makeListDb(
    coach: {
      id: string;
      certificationStatus: string;
      certificationExpiry: Date | null;
    } | null,
    rows: Array<{
      id: string;
      submittedAt: Date;
      publicTaker: unknown;
      result: unknown;
      campaign: {
        template: { id: string; name: string; alias: string };
      };
    }>,
    matchingIds: string[] = rows.map((row) => row.id),
  ) {
    const findUnique = jest.fn().mockResolvedValue(coach);
    const $queryRaw = jest
      .fn()
      .mockResolvedValue(matchingIds.map((id) => ({ id })));
    const findMany = jest.fn().mockImplementation(
      async (args: { where: Record<string, unknown> }) => {
        const idFilter = args.where.id as { in?: string[] } | undefined;
        return idFilter?.in
          ? rows.filter((row) => idFilter.in?.includes(row.id))
          : rows;
      },
    );
    const tx = {
      $queryRaw,
      coach: { findUnique },
      assessmentSubmission: { findMany },
    };
    const $transaction = jest
      .fn()
      .mockImplementation(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      );
    return { $transaction, $queryRaw, findUnique, findMany };
  }

  const listRows = [
    {
      id: "sub-newest",
      submittedAt: new Date("2026-07-29T09:00:00.000Z"),
      publicTaker: {
        firstName: "Avery",
        lastName: "Leader",
        email: "avery@example.com",
      },
      result: FROZEN_RESULT,
      campaign: { template: PUBLIC_SUBMISSION.campaign.template },
    },
    {
      id: "sub-older",
      submittedAt: new Date("2026-07-29T08:00:00.000Z"),
      publicTaker: {
        firstName: "",
        lastName: "",
        email: "fallback@example.com",
      },
      result: FROZEN_RESULT,
      campaign: { template: PUBLIC_SUBMISSION.campaign.template },
    },
    {
      id: "sub-overflow",
      submittedAt: new Date("2026-07-29T07:00:00.000Z"),
      publicTaker: {
        firstName: "Page",
        lastName: "Two",
        email: "page-two@example.com",
      },
      result: FROZEN_RESULT,
      campaign: { template: PUBLIC_SUBMISSION.campaign.template },
    },
  ];

  it("pins active Coach ownership, filters server-side, and paginates newest-first", async () => {
    const db = makeListDb(PUBLIC_SUBMISSION.referringCoach, listRows);

    const outcome = await listPublicReferrals(
      db as never,
      actor(),
      {
        templateId: "template-four-decisions",
        cursor: "sub-cursor",
        take: 2,
      },
    );

    expect(outcome).toEqual({
      status: "ok",
      items: [
        {
          submissionId: "sub-newest",
          submittedAt: new Date("2026-07-29T09:00:00.000Z"),
          takerName: "Avery Leader",
          takerEmail: "avery@example.com",
          template: PUBLIC_SUBMISSION.campaign.template,
          summary: {
            kind: "scored",
            overallScore: 7.4,
            tierLabel: null,
            domains: [
              { key: "people", label: "People", score: 7.4 },
            ],
          },
        },
        {
          submissionId: "sub-older",
          submittedAt: new Date("2026-07-29T08:00:00.000Z"),
          takerName: "fallback@example.com",
          takerEmail: "fallback@example.com",
          template: PUBLIC_SUBMISSION.campaign.template,
          summary: {
            kind: "scored",
            overallScore: 7.4,
            tierLabel: null,
            domains: [
              { key: "people", label: "People", score: 7.4 },
            ],
          },
        },
      ],
      nextCursor: "sub-older",
    });

    expect(db.findUnique).toHaveBeenCalledWith({
      where: { id: "coach-owner" },
      select: {
        id: true,
        certificationStatus: true,
        certificationExpiry: true,
      },
    });
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          referringCoachId: "coach-owner",
          campaign: expect.objectContaining({
            accessMode: "PUBLIC",
            deletedAt: null,
            templateId: "template-four-decisions",
          }),
        }),
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        cursor: { id: "sub-cursor" },
        skip: 1,
        take: 3,
      }),
    );
  });

  it("normalizes mixed-case full-name search in SQL before applying the Prisma list filter", async () => {
    const db = makeListDb(
      PUBLIC_SUBMISSION.referringCoach,
      listRows,
      ["sub-newest"],
    );

    const outcome = await listPublicReferrals(
      db as never,
      actor(),
      {
        query: "  aVeRy   LEADER ",
        templateId: "template-four-decisions",
      },
    );

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.items.map((item) => item.submissionId)).toEqual([
      "sub-newest",
    ]);

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const searchSql = db.$queryRaw.mock.calls[0][0] as {
      sql: string;
      values: unknown[];
    };
    expect(searchSql.sql).toMatch(/REGEXP_REPLACE/);
    expect(searchSql.sql).toMatch(/LOWER/);
    expect(searchSql.sql).toMatch(/firstName/);
    expect(searchSql.sql).toMatch(/lastName/);
    expect(searchSql.sql).toMatch(/email/);
    expect(searchSql.sql).toMatch(/referringCoachId/);
    expect(searchSql.sql).toMatch(/accessMode/);
    expect(searchSql.sql).toMatch(/deletedAt/);
    expect(searchSql.values).toEqual(
      expect.arrayContaining([
        "coach-owner",
        "template-four-decisions",
        "%avery leader%",
      ]),
    );

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          referringCoachId: "coach-owner",
          campaign: {
            accessMode: "PUBLIC",
            deletedAt: null,
            templateId: "template-four-decisions",
          },
          id: { in: ["sub-newest"] },
        },
      }),
    );
  });

  it("returns no raw answers or frozen result in display-safe list rows", async () => {
    const db = makeListDb(PUBLIC_SUBMISSION.referringCoach, listRows.slice(0, 1));

    const outcome = await listPublicReferrals(db as never, actor(), {});

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.items[0]).not.toHaveProperty("answers");
    expect(outcome.items[0]).not.toHaveProperty("rawAnswers");
    expect(outcome.items[0]).not.toHaveProperty("result");
    const select = db.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("answers");
  });

  it("forbids a Coach whose current certification is inactive or expired", async () => {
    const inactiveDb = makeListDb(
      {
        ...PUBLIC_SUBMISSION.referringCoach,
        certificationStatus: "DEACTIVATED",
      },
      listRows,
    );
    const expiredDb = makeListDb(
      {
        ...PUBLIC_SUBMISSION.referringCoach,
        certificationExpiry: new Date("2025-01-01T00:00:00.000Z"),
      },
      listRows,
    );

    await expect(
      listPublicReferrals(inactiveDb as never, actor(), {}),
    ).resolves.toEqual({ status: "forbidden" });
    await expect(
      listPublicReferrals(expiredDb as never, actor(), {}),
    ).resolves.toEqual({ status: "forbidden" });
    expect(inactiveDb.findMany).not.toHaveBeenCalled();
    expect(expiredDb.findMany).not.toHaveBeenCalled();
  });

  it("never resolves collection ownership from actor email", async () => {
    const db = makeListDb(PUBLIC_SUBMISSION.referringCoach, listRows);

    await expect(
      listPublicReferrals(
        db as never,
        actor({
          coachId: null,
          email: PUBLIC_SUBMISSION.referringCoachEmail,
        }),
        {},
      ),
    ).resolves.toEqual({ status: "forbidden" });
    expect(db.findUnique).not.toHaveBeenCalled();
    expect(db.findMany).not.toHaveBeenCalled();
  });
});
