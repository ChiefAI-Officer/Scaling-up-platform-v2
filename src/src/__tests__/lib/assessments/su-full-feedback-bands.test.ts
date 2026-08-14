import { buildScalingUpFullContent } from "../../../../prisma/seed-scaling-up-full-assessment";
import {
  createScalingUpFullFeedbackBandDraft,
  patchScalingUpFullFeedbackBandQuestions,
  publishScalingUpFullFeedbackBandDraft,
  type FeedbackBandDraftDb,
  type FeedbackBandPublishDb,
} from "@/lib/assessments/su-full-feedback-bands";

type Question = Record<string, unknown> & {
  type: string;
  stableKey: string;
  recommendations?: Array<Record<string, unknown> & {
    minScore: number;
    maxScore: number;
    text: string;
  }>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function oldBandQuestions(): Question[] {
  return (buildScalingUpFullContent().questions as Question[]).map((question) => {
    if (question.type !== "SLIDER_LIKERT") return clone(question);
    return {
      ...clone(question),
      recommendations: question.recommendations!.map((band) => {
        if (band.minScore === 7) return { ...band, maxScore: 9 };
        if (band.minScore === 9) {
          return { ...band, minScore: 10, maxScore: 10 };
        }
        return { ...band };
      }),
    };
  });
}

function recommendationTexts(questions: Question[]): string[][] {
  return questions
    .filter((question) => question.type === "SLIDER_LIKERT")
    .map((question) => question.recommendations!.map((band) => band.text));
}

describe("patchScalingUpFullFeedbackBandQuestions", () => {
  it("moves only the upper boundaries while preserving all 305 feedback records and their text", () => {
    const before = oldBandQuestions();

    const result = patchScalingUpFullFeedbackBandQuestions(before);

    expect(result.changed).toBe(true);
    expect(result.questionCount).toBe(61);
    expect(result.feedbackRecordCount).toBe(305);
    expect(recommendationTexts(result.questions as Question[])).toEqual(
      recommendationTexts(before),
    );
    for (const question of result.questions as Question[]) {
      if (question.type !== "SLIDER_LIKERT") continue;
      expect(
        question.recommendations!.map(({ minScore, maxScore }) => ({
          minScore,
          maxScore,
        })),
      ).toEqual([
        { minScore: 0, maxScore: 2 },
        { minScore: 3, maxScore: 4 },
        { minScore: 5, maxScore: 6 },
        { minScore: 7, maxScore: 8 },
        { minScore: 9, maxScore: 10 },
      ]);
    }
  });

  it("is an idempotent no-op when every question already has the corrected boundaries", () => {
    const questions = buildScalingUpFullContent().questions as Question[];

    const result = patchScalingUpFullFeedbackBandQuestions(questions);

    expect(result.changed).toBe(false);
    expect(result.feedbackRecordCount).toBe(305);
    expect(result.questions).toEqual(questions);
  });

  it("fails closed on mixed or unrecognized recommendation ranges", () => {
    const questions = oldBandQuestions();
    questions[0].recommendations![3].maxScore = 8;

    expect(() => patchScalingUpFullFeedbackBandQuestions(questions)).toThrow(
      /mixed or unrecognized.*Q01/i,
    );
  });
});

describe("createScalingUpFullFeedbackBandDraft", () => {
  function makeDb(options: { existingDraft?: boolean } = {}) {
    const questions = oldBandQuestions();
    const activeVersion = {
      id: "version-3",
      versionNumber: 3,
      language: "enUS",
      questions,
      sections: [{ stableKey: "S1" }],
      scoringConfig: { rollup: { overall: "meanOfDomains" } },
      reportConfig: null,
      contentHash: "old-hash",
      publishedAt: new Date("2026-06-30T07:06:59.092Z"),
      archivedAt: null,
    };
    const latestVersion = options.existingDraft
      ? {
          ...activeVersion,
          id: "version-4-draft",
          versionNumber: 4,
          contentHash: "unrelated-draft-hash",
          publishedAt: null,
        }
      : activeVersion;
    const tx = {
      assessmentTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: "template-su-full",
          invitationSubject: "Invitation",
          invitationBodyMarkdown: "Body",
        }),
      },
      assessmentTemplateVersion: {
        findFirst: jest.fn(({ where }: { where: { publishedAt?: unknown } }) =>
          Promise.resolve(where.publishedAt ? activeVersion : latestVersion),
        ),
        create: jest.fn().mockResolvedValue({
          id: "version-4",
          versionNumber: 4,
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const db = {
      $transaction: jest.fn(async (fn: (inner: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    return { db: db as unknown as FeedbackBandDraftDb, tx };
  }

  it("appends an audited draft cloned from the active published version", async () => {
    const { db, tx } = makeDb();

    const result = await createScalingUpFullFeedbackBandDraft(
      db,
      "operator@example.com",
    );

    expect(result).toMatchObject({
      action: "created",
      templateId: "template-su-full",
      sourceVersionId: "version-3",
      sourceVersionNumber: 3,
      draftVersionId: "version-4",
      draftVersionNumber: 4,
      questionCount: 61,
      feedbackRecordCount: 305,
    });
    expect(tx.assessmentTemplateVersion.create).toHaveBeenCalledTimes(1);
    const created = tx.assessmentTemplateVersion.create.mock.calls[0][0].data;
    expect(created.publishedAt).toBeNull();
    expect(created.publishedBy).toBeNull();
    expect(created.versionNumber).toBe(4);
    expect(recommendationTexts(created.questions)).toEqual(
      recommendationTexts(oldBandQuestions()),
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      entityType: "AssessmentTemplateVersion",
      entityId: "version-4",
      action: "SU_FULL_FEEDBACK_BANDS_PATCHED",
      performedBy: "operator@example.com",
    });
    expect(JSON.parse(audit.changes)).toMatchObject({
      sourceVersionId: "version-3",
      sourceVersionNumber: 3,
      draftVersionNumber: 4,
      beforeRanges: [[0, 2], [3, 4], [5, 6], [7, 9], [10, 10]],
      afterRanges: [[0, 2], [3, 4], [5, 6], [7, 8], [9, 10]],
      questionCount: 61,
      feedbackRecordCount: 305,
      feedbackTextPreserved: true,
    });
  });

  it("refuses to supersede an unrelated unpublished draft", async () => {
    const { db, tx } = makeDb({ existingDraft: true });

    await expect(
      createScalingUpFullFeedbackBandDraft(db, "operator@example.com"),
    ).rejects.toThrow(/unpublished draft version 4/i);
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("supports a read-only dry run that reports the next draft without writing", async () => {
    const { db, tx } = makeDb();

    const result = await createScalingUpFullFeedbackBandDraft(
      db,
      "operator@example.com",
      { dryRun: true },
    );

    expect(result).toMatchObject({
      action: "planned",
      sourceVersionNumber: 3,
      draftVersionNumber: 4,
      questionCount: 61,
      feedbackRecordCount: 305,
    });
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("requires an explicit operator before opening a transaction", async () => {
    const { db } = makeDb();

    await expect(
      createScalingUpFullFeedbackBandDraft(db, "  "),
    ).rejects.toThrow(/operator/i);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("publishScalingUpFullFeedbackBandDraft", () => {
  function makePublishDb(
    options: {
      patchAudit?: boolean;
      published?: boolean;
      role?: string;
    } = {},
  ) {
    const content = buildScalingUpFullContent();
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "admin-user",
          email: "admin@example.com",
          role: options.role ?? "ADMIN",
          deletedAt: null,
        }),
      },
      assessmentTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: "template-su-full" }),
      },
      assessmentTemplateVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: "version-4",
          templateId: "template-su-full",
          versionNumber: 4,
          contentHash: "corrected-content-hash",
          publishedAt: options.published
            ? new Date("2026-08-14T15:00:00.000Z")
            : null,
          questions: content.questions,
          sections: content.sections,
          scoringConfig: content.scoringConfig,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(
          options.patchAudit === false
            ? null
            : {
                changes: JSON.stringify({
                  contentHash: "corrected-content-hash",
                  feedbackTextPreserved: true,
                }),
              },
        ),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const db = {
      $transaction: jest.fn(async (fn: (inner: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    return { db: db as unknown as FeedbackBandPublishDb, tx };
  }

  it("publishes only the exact audited draft through the standard validation gate", async () => {
    const { db, tx } = makePublishDb();

    const result = await publishScalingUpFullFeedbackBandDraft(
      db,
      "admin@example.com",
      "version-4",
    );

    expect(result).toMatchObject({
      action: "published",
      templateId: "template-su-full",
      versionId: "version-4",
      versionNumber: 4,
      publishedBy: "admin@example.com",
    });
    expect(tx.assessmentTemplateVersion.updateMany).toHaveBeenCalledWith({
      where: {
        id: "version-4",
        templateId: "template-su-full",
        contentHash: "corrected-content-hash",
        publishedAt: null,
      },
      data: {
        publishedAt: expect.any(Date),
        publishedBy: "admin-user",
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "AssessmentTemplateVersion",
        entityId: "version-4",
        action: "UPDATE",
        performedBy: "admin@example.com",
      }),
    });
  });

  it("allows STAFF through the canonical privileged-role policy", async () => {
    const { db, tx } = makePublishDb({ role: "STAFF" });

    const result = await publishScalingUpFullFeedbackBandDraft(
      db,
      "admin@example.com",
      "version-4",
    );

    expect(result.action).toBe("published");
    expect(tx.assessmentTemplateVersion.updateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects COACH through the canonical privileged-role policy", async () => {
    const { db, tx } = makePublishDb({ role: "COACH" });

    await expect(
      publishScalingUpFullFeedbackBandDraft(
        db,
        "admin@example.com",
        "version-4",
      ),
    ).rejects.toThrow(/privileged operator/i);
    expect(tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to publish when the boundary-patch audit receipt is missing", async () => {
    const { db, tx } = makePublishDb({ patchAudit: false });

    await expect(
      publishScalingUpFullFeedbackBandDraft(
        db,
        "admin@example.com",
        "version-4",
      ),
    ).rejects.toThrow(/patch audit/i);
    expect(tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
  });

  it("is idempotent when the exact draft is already published", async () => {
    const { db, tx } = makePublishDb({ published: true });

    const result = await publishScalingUpFullFeedbackBandDraft(
      db,
      "admin@example.com",
      "version-4",
    );

    expect(result.action).toBe("noop");
    expect(tx.assessmentTemplateVersion.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
