import { getMemberRespondentReport } from "@/lib/assessments/member-report";

const submission = (overrides: Record<string, unknown> = {}) => ({
  id: "submission-1",
  respondentId: "respondent-2",
  submittedAt: new Date("2026-09-01T00:00:00Z"),
  answers: {},
  result: { perSection: [], perQuestion: [] },
  respondent: {
    id: "respondent-2",
    firstName: "Pat",
    lastName: "Member",
    email: "member@example.com",
    jobTitle: null,
  },
  campaign: {
    id: "campaign-1",
    deletedAt: null,
    name: "Quarterly",
    language: "en",
    reportStyle: "CLASSIC",
    importManifest: null,
    template: { id: "template-1", name: "Assessment", alias: "assessment" },
    organization: { name: "Company" },
    creatorCoach: null,
    version: {
      id: "version-1",
      contentHash: "hash",
      reportConfig: null,
      sections: [],
      questions: [],
      scoringConfig: {},
    },
  },
  ...overrides,
});

function fixture(value: ReturnType<typeof submission> | null) {
  const tx = {
    orgRespondent: {
      findMany: jest.fn().mockResolvedValue([
        { id: "respondent-1", organizationId: "org-1", teamId: null, roleType: "employee" },
        { id: "respondent-2", organizationId: "org-2", teamId: null, roleType: "employee" },
      ]),
    },
    assessmentSubmission: { findUnique: jest.fn().mockResolvedValue(value) },
    assessmentTemplateVersion: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  return {
    tx,
    db: { $transaction: jest.fn(async (fn: (tx: typeof tx) => unknown) => fn(tx)) },
  };
}

describe("getMemberRespondentReport", () => {
  it("accepts only db and identity-bound input, never caller-supplied scope", () => {
    expect(getMemberRespondentReport).toHaveLength(2);
  });

  it("authorizes from the second row of a multi-row identity inside one transaction", async () => {
    const f = fixture(submission());
    const outcome = await getMemberRespondentReport(f.db, {
      normalizedEmail: "member@example.com",
      submissionId: "submission-1",
    });
    expect(outcome.status).toBe("ok");
    expect(f.db.$transaction).toHaveBeenCalledTimes(1);
    expect(f.tx.orgRespondent.findMany).toHaveBeenCalled();
    expect(f.tx.assessmentSubmission.findUnique).toHaveBeenCalled();
  });

  it("returns not-found for an unknown submission", async () => {
    const f = fixture(null);
    await expect(
      getMemberRespondentReport(f.db, {
        normalizedEmail: "member@example.com",
        submissionId: "missing",
      }),
    ).resolves.toEqual({ status: "not-found" });
  });

  it("forbids a report outside the live identity's own-only Release 1 scope", async () => {
    const f = fixture(submission({ respondentId: "someone-else" }));
    await expect(
      getMemberRespondentReport(f.db, {
        normalizedEmail: "member@example.com",
        submissionId: "submission-1",
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("forbids a soft-deleted campaign", async () => {
    const dead = submission();
    dead.campaign.deletedAt = new Date();
    const f = fixture(dead);
    await expect(
      getMemberRespondentReport(f.db, {
        normalizedEmail: "member@example.com",
        submissionId: "submission-1",
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });
});
