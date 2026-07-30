import type { ApiActor } from "@/lib/auth/access-control";
import {
  exportPublicReferrals,
  getPublicReferralReport,
  listPublicReferrals,
  summarizePublicResult,
} from "@/lib/assessments/public-referrals";

describe("exportPublicReferrals", () => {
  it("returns only the five display scalars from one bounded query", async () => {
    const $queryRaw = jest.fn().mockResolvedValue([
      {
        coachEligible: true,
        isResultRow: true,
        rowOrder: 1,
        takerName: "Avery Leader",
        takerEmail: "avery@example.com",
        assessmentName: "Scaling Up Full",
        templateAlias: "scaling-up-4-decisions",
        overallScore: 7.4,
        tierLabel: "Accelerating",
        submittedAt: new Date("2026-07-29T08:30:00.000Z"),
        totalCount: 1,
      },
    ]);

    await expect(
      exportPublicReferrals(
        { $queryRaw },
        actor(),
        { query: "avery", templateId: "template-four-decisions" },
      ),
    ).resolves.toEqual({
      status: "ok",
      totalCount: 1,
      rows: [
        {
          takerName: "Avery Leader",
          takerEmail: "avery@example.com",
          assessmentName: "Scaling Up Full",
          resultLabel: "7.4 — Accelerating",
          submittedAt: new Date("2026-07-29T08:30:00.000Z"),
        },
      ],
    });
    expect($queryRaw).toHaveBeenCalledTimes(1);
    const sql = $queryRaw.mock.calls[0][0] as {
      sql: string;
      values: unknown[];
    };
    expect(sql.sql).toContain("COUNT(*) OVER()");
    expect(sql.sql).toContain(
      "JSONB_TYPEOF(s.\"result\"->'perSection') IS DISTINCT FROM 'array'",
    );
    expect(sql.sql).toContain(
      "JSONB_TYPEOF(s.\"result\"->'perQuestion') IS DISTINCT FROM 'array'",
    );
    expect(sql.sql).toContain("LIMIT");
    expect(sql.values).toContain(5001);
    expect(sql.values).toContain("coach-owner");
    expect(sql.values).toContain("template-four-decisions");
    expect(sql.values).toContain("%avery%");
  });

  it("returns a structured overflow instead of materializing an export", async () => {
    const $queryRaw = jest.fn().mockResolvedValue([
      {
        coachEligible: true,
        isResultRow: true,
        rowOrder: 1,
        takerName: "First",
        takerEmail: "first@example.com",
        assessmentName: "Assessment",
        templateAlias: "qsp-v2",
        overallScore: null,
        tierLabel: null,
        submittedAt: new Date(),
        totalCount: 5001,
      },
    ]);

    await expect(
      exportPublicReferrals({ $queryRaw }, actor(), {}),
    ).resolves.toEqual({
      status: "too-many",
      totalCount: 5001,
      maxAllowed: 5000,
    });
  });

  it("allows exactly 5,000 rows and formats scored, qualitative, and degraded results", async () => {
    const baseRow = {
      coachEligible: true,
      isResultRow: true,
      rowOrder: 1,
      takerName: "Avery Leader",
      takerEmail: "avery@example.com",
      assessmentName: "Assessment",
      templateAlias: "scaling-up-4-decisions",
      overallScore: 7.4,
      tierLabel: "Accelerating",
      submittedAt: new Date("2026-07-29T08:30:00.000Z"),
      totalCount: 5000,
    };
    const $queryRaw = jest.fn().mockResolvedValue(
      Array.from({ length: 5000 }, (_, index) => ({
        ...baseRow,
        rowOrder: index + 1,
        takerName: `Taker ${index}`,
        ...(index === 0
          ? { overallScore: 0, tierLabel: null }
          : index === 1
            ? { overallScore: 7, tierLabel: null }
            : index === 2
              ? { overallScore: 10, tierLabel: "Top" }
              : index === 3
                ? {
                    templateAlias: "qsp-v2",
                    overallScore: null,
                    tierLabel: null,
                  }
                : index === 4
                  ? { overallScore: null, tierLabel: "Stale tier" }
                  : {}),
      })),
    );

    const outcome = await exportPublicReferrals(
      { $queryRaw },
      actor(),
      {},
    );

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.rows).toHaveLength(5000);
    expect(outcome.rows.slice(0, 5).map((row) => row.resultLabel)).toEqual([
      "0",
      "7",
      "10 — Top",
      "Completed",
      "Result unavailable",
    ]);
  });

  it("rejects actors without an immutable Coach ID before querying", async () => {
    const $queryRaw = jest.fn();
    await expect(
      exportPublicReferrals(
        { $queryRaw },
        actor({ coachId: null }),
        {},
      ),
    ).resolves.toEqual({ status: "forbidden" });
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it("forbids an inactive or expired Coach from the query eligibility sentinel", async () => {
    const $queryRaw = jest.fn().mockResolvedValue([
      {
        coachEligible: false,
        isResultRow: false,
        rowOrder: null,
        takerName: null,
        takerEmail: null,
        assessmentName: null,
        templateAlias: null,
        overallScore: null,
        tierLabel: null,
        submittedAt: null,
        totalCount: 0,
      },
    ]);

    await expect(
      exportPublicReferrals({ $queryRaw }, actor(), {}),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("returns an empty export for an eligible Coach with no matching rows", async () => {
    const $queryRaw = jest.fn().mockResolvedValue([
      {
        coachEligible: true,
        isResultRow: false,
        rowOrder: null,
        takerName: null,
        takerEmail: null,
        assessmentName: null,
        templateAlias: null,
        overallScore: null,
        tierLabel: null,
        submittedAt: null,
        totalCount: 0,
      },
    ]);

    await expect(
      exportPublicReferrals({ $queryRaw }, actor(), {}),
    ).resolves.toEqual({ status: "ok", rows: [], totalCount: 0 });
  });
});

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
    email: "current-owner@example.com",
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
      respondentEmail: "avery@example.com",
      referringCoachEmail: "current-owner@example.com",
      companyName: "",
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
    expect(
      db.findFirst.mock.calls[0][0].select.campaign.select,
    ).not.toHaveProperty("organization");
    expect(
      db.findFirst.mock.calls[0][0].select.referringCoach.select,
    ).toHaveProperty("email", true);
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
    totalCount = matchingIds.length,
    ownedTotalCount = totalCount,
  ) {
    const findUnique = jest.fn().mockResolvedValue(coach);
    const $queryRaw = jest
      .fn()
      .mockImplementation(
        async (searchSql: { values?: unknown[] }) => {
          if (
            typeof (searchSql as { sql?: string }).sql === "string" &&
            (searchSql as { sql: string }).sql.includes("COUNT(")
          ) {
            return [{ count: totalCount }];
          }
          const limit = [...(searchSql.values ?? [])]
            .reverse()
            .find((value): value is number => typeof value === "number");
          return matchingIds
            .slice(0, limit ?? matchingIds.length)
            .map((id) => ({ id }));
        },
      );
    const count = jest.fn().mockImplementation(
      async (args: { where: Record<string, unknown> }) => {
        const campaign = args.where.campaign as
          | Record<string, unknown>
          | undefined;
        return campaign?.templateId ? totalCount : ownedTotalCount;
      },
    );
    const findFirst = jest.fn().mockImplementation(
      async (args: { where: Record<string, unknown> }) => ({
        id: args.where.id as string,
        submittedAt: new Date("2026-07-29T10:00:00.000Z"),
      }),
    );
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
      assessmentSubmission: { findFirst, findMany, count },
    };
    const $transaction = jest
      .fn()
      .mockImplementation(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      );
    return {
      $transaction,
      $queryRaw,
      findUnique,
      findFirst,
      findMany,
      count,
    };
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
    const db = makeListDb(
      PUBLIC_SUBMISSION.referringCoach,
      listRows,
      undefined,
      47,
      93,
    );

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
      totalCount: 47,
      ownedTotalCount: 93,
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
          OR: [
            {
              submittedAt: {
                lt: new Date("2026-07-29T10:00:00.000Z"),
              },
            },
            {
              submittedAt: new Date("2026-07-29T10:00:00.000Z"),
              id: { lt: "sub-cursor" },
            },
          ],
        }),
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        take: 3,
      }),
    );
    expect(db.findFirst).toHaveBeenCalledWith({
      where: {
        referringCoachId: "coach-owner",
        campaign: {
          accessMode: "PUBLIC",
          deletedAt: null,
          templateId: "template-four-decisions",
        },
        id: "sub-cursor",
      },
      select: { id: true, submittedAt: true },
    });
    expect(db.count).toHaveBeenCalledWith({
      where: {
        referringCoachId: "coach-owner",
        campaign: {
          accessMode: "PUBLIC",
          deletedAt: null,
          templateId: "template-four-decisions",
        },
      },
    });
  });

  it.each([
    ["another Coach", ""],
    ["another assessment filter", "template-four-decisions"],
  ])(
    "fails closed when an unsearched cursor belongs to %s",
    async (_case, templateId) => {
      const db = makeListDb(
        PUBLIC_SUBMISSION.referringCoach,
        listRows,
        undefined,
        3,
        3,
      );
      db.findFirst.mockResolvedValueOnce(null);

      const outcome = await listPublicReferrals(
        db as never,
        actor(),
        {
          cursor: "forged-cursor",
          templateId,
          take: 2,
        },
      );

      expect(outcome).toMatchObject({
        status: "ok",
        items: [],
        nextCursor: null,
      });
      expect(db.findFirst).toHaveBeenCalledWith({
        where: {
          referringCoachId: "coach-owner",
          campaign: {
            accessMode: "PUBLIC",
            deletedAt: null,
            ...(templateId
              ? { templateId: "template-four-decisions" }
              : {}),
          },
          id: "forged-cursor",
        },
        select: { id: true, submittedAt: true },
      });
      expect(db.findMany).not.toHaveBeenCalled();
    },
  );

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

    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    const sqlCalls = db.$queryRaw.mock.calls.map(
      (call) => call[0] as { sql: string; values: unknown[] },
    );
    const countSql = sqlCalls.find((sql) => /COUNT\(/.test(sql.sql));
    const searchSql = sqlCalls.find((sql) => /SELECT s\."id"/.test(sql.sql));
    expect(countSql).toBeDefined();
    expect(searchSql).toBeDefined();
    if (!countSql || !searchSql) return;
    expect(outcome.totalCount).toBe(1);
    expect(outcome.ownedTotalCount).toBe(1);
    for (const constrainedSql of [countSql, searchSql]) {
      expect(constrainedSql.sql).toMatch(/REGEXP_REPLACE/);
      expect(constrainedSql.sql).toMatch(/LOWER/);
      expect(constrainedSql.sql).toMatch(/firstName/);
      expect(constrainedSql.sql).toMatch(/lastName/);
      expect(constrainedSql.sql).toMatch(/email/);
      expect(constrainedSql.sql).toMatch(/referringCoachId/);
      expect(constrainedSql.sql).toMatch(/accessMode/);
      expect(constrainedSql.sql).toMatch(/deletedAt/);
      expect(constrainedSql.values).toEqual(
        expect.arrayContaining([
          "coach-owner",
          "template-four-decisions",
          "%avery leader%",
        ]),
      );
    }

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

  it("bounds searched cursor pages in SQL and does not skip again in Prisma", async () => {
    const broadMatchIds = [
      "sub-newest",
      "sub-older",
      "sub-overflow",
      ...Array.from({ length: 100 }, (_, index) => `match-${index}`),
    ];
    const db = makeListDb(
      PUBLIC_SUBMISSION.referringCoach,
      listRows,
      broadMatchIds,
    );

    const outcome = await listPublicReferrals(
      db as never,
      actor(),
      {
        query: "leader",
        templateId: "template-four-decisions",
        cursor: "sub-cursor",
        take: 2,
      },
    );

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.items.map((item) => item.submissionId)).toEqual([
      "sub-newest",
      "sub-older",
    ]);
    expect(outcome.nextCursor).toBe("sub-older");

    const searchSql = db.$queryRaw.mock.calls
      .map((call) => call[0] as { sql: string; values: unknown[] })
      .find((sql) => /SELECT s\."id"/.test(sql.sql));
    expect(searchSql).toBeDefined();
    if (!searchSql) return;
    expect(searchSql.sql).toMatch(
      /ORDER BY\s+s\."submittedAt" DESC,\s+s\."id" DESC/,
    );
    expect(searchSql.sql).toMatch(/LIMIT/);
    expect(searchSql.sql).toMatch(/cursor/i);
    expect(searchSql.sql).toMatch(
      /s\."submittedAt" < search_cursor\."submittedAt"/,
    );
    expect(searchSql.sql).toMatch(
      /s\."submittedAt" = search_cursor\."submittedAt"[\s\S]*s\."id" < search_cursor\."id"/,
    );
    expect(searchSql.sql.match(/referringCoachId/g)).toHaveLength(2);
    expect(searchSql.sql.match(/accessMode/g)).toHaveLength(2);
    expect(searchSql.sql.match(/deletedAt/g)).toHaveLength(2);
    expect(searchSql.sql.match(/templateId/g)).toHaveLength(2);
    expect(searchSql.sql).not.toContain("sub-cursor");
    expect(searchSql.values).toEqual(
      expect.arrayContaining(["sub-cursor", 3]),
    );

    const findManyArgs = db.findMany.mock.calls[0][0];
    expect(findManyArgs.where.id).toEqual({
      in: ["sub-newest", "sub-older", "sub-overflow"],
    });
    expect(findManyArgs.where.id.in).toHaveLength(3);
    expect(findManyArgs.take).toBe(3);
    expect(findManyArgs).not.toHaveProperty("cursor");
    expect(findManyArgs).not.toHaveProperty("skip");
    expect(findManyArgs.select).not.toHaveProperty("answers");
  });

  it("keeps wildcard and injection-like search text parameterized and escaped", async () => {
    const db = makeListDb(
      PUBLIC_SUBMISSION.referringCoach,
      listRows,
      ["sub-newest"],
    );

    await listPublicReferrals(db as never, actor(), {
      query: "  %_' OR 1=1 --  ",
    });

    const searchSql = db.$queryRaw.mock.calls
      .map((call) => call[0] as { sql: string; values: unknown[] })
      .find((sql) => /SELECT s\."id"/.test(sql.sql));
    expect(searchSql).toBeDefined();
    if (!searchSql) return;
    expect(searchSql.sql).not.toContain("1=1");
    expect(searchSql.values).toContain("%\\%\\_' or 1=1 --%");
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
