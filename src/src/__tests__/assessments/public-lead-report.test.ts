import { getPublicLeadReport } from "@/lib/assessments/public-lead-report";

const enabledEnv = {
  WAVE_PUBLIC_LEADS_ENABLED: "1",
  PUBLIC_LEADS_POLICY_APPROVED: "1",
  PUBLIC_LEADS_POLICY_VERSION: "2026-07",
  PUBLIC_LEADS_RETENTION_DAYS: "365",
  PUBLIC_LEADS_DELETION_MODE: "ANONYMIZE",
  PUBLIC_LEADS_DISTRIBUTED_LIMITER_READY: "1",
};

const ownerActor = {
  userId: "u-coach",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    submittedAt: new Date("2026-07-30T01:00:00Z"),
    answers: [{ stableKey: "q1", value: 5 }],
    result: { perSection: [], perQuestion: [], tier: { label: "Strong" } },
    publicTaker: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    },
    referringCoachId: "coach-1",
    referringCoachEmailSnapshot: "coach@example.com",
    referringCoach: {
      id: "coach-1",
      email: "coach@example.com",
      firstName: "Casey",
      lastName: "Coach",
      profileImage: null,
      deletedAt: null,
      certificationStatus: "ACTIVE",
      certificationExpiry: null,
    },
    campaign: {
      name: "Quick Assessment",
      organization: { name: "Scaling Up" },
      template: { name: "Scaling Up Quick Assessment", alias: "scaling-up-quick" },
      version: {
        id: "version-1",
        contentHash: "hash-1",
        sections: [],
        questions: [],
        scoringConfig: {},
      },
    },
    ...overrides,
  };
}

function fakeDb(row: ReturnType<typeof submission> | null) {
  return {
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        assessmentSubmission: {
          findFirst: jest.fn().mockResolvedValue(row),
        },
      }),
    ),
  };
}

describe("getPublicLeadReport", () => {
  it("allows the exact eligible stable owner and reconstructs the frozen report", async () => {
    const outcome = await getPublicLeadReport(
      fakeDb(submission()) as never,
      ownerActor,
      "sub-1",
      enabledEnv,
    );

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") throw new Error("expected ok");
    expect(outcome.takerEmail).toBe("jane@example.com");
    expect(outcome.report.provenance).toMatchObject({
      submissionId: "sub-1",
      versionId: "version-1",
      contentHash: "hash-1",
    });
  });

  it("denies a different coach without revealing whether the submission exists", async () => {
    const outcome = await getPublicLeadReport(
      fakeDb(submission()) as never,
      { ...ownerActor, userId: "u-other", coachId: "coach-2" },
      "sub-1",
      enabledEnv,
    );
    expect(outcome).toEqual({ status: "forbidden" });
  });

  it("denies the owner after certification becomes inactive", async () => {
    const outcome = await getPublicLeadReport(
      fakeDb(
        submission({
          referringCoach: {
            ...submission().referringCoach,
            certificationStatus: "INACTIVE",
          },
        }),
      ) as never,
      ownerActor,
      "sub-1",
      enabledEnv,
    );
    expect(outcome).toEqual({ status: "forbidden" });
  });

  it("allows privileged oversight of a Scaling Up-owned public submission", async () => {
    const outcome = await getPublicLeadReport(
      fakeDb(
        submission({
          referringCoachId: null,
          referringCoachEmailSnapshot: null,
          referringCoach: null,
        }),
      ) as never,
      {
        userId: "u-admin",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      },
      "sub-1",
      enabledEnv,
    );
    expect(outcome.status).toBe("ok");
  });

  it("keeps the report dark when presentation is disabled", async () => {
    const outcome = await getPublicLeadReport(
      fakeDb(submission()) as never,
      ownerActor,
      "sub-1",
      {},
    );
    expect(outcome).toEqual({ status: "not-found" });
  });
});
