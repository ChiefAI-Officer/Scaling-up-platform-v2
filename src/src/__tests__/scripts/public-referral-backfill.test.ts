/* eslint-disable @typescript-eslint/no-require-imports */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const {
  applyReviewedMappings,
  buildReviewCandidates,
  parseReviewedMappings,
  validateReviewedMappings,
  writeCommittedReceipt,
} = require("../../../scripts/public-referral-backfill-core.cjs") as {
  applyReviewedMappings: (
    db: unknown,
    value: unknown,
    bulkApplyNullOwners: (
      tx: { pendingWrites: unknown[] },
      rows: unknown[],
    ) => Promise<number>,
  ) => Promise<{
    reviewed: number;
    updated: number;
    alreadyApplied: number;
  }>;
  buildReviewCandidates: (
    submissions: unknown[],
    coaches: unknown[],
  ) => { candidates: unknown[]; excluded: unknown[] };
  parseReviewedMappings: (
    value: unknown,
  ) => Array<{ submissionId: string; coachId: string }>;
  validateReviewedMappings: (
    mappings: unknown,
    submissions: unknown[],
    coaches: unknown[],
  ) => Array<{
    submissionId: string;
    coachId: string;
    action: "update" | "already-applied";
  }>;
  writeCommittedReceipt: (
    writeSync: (output: string) => void,
    receipt: Record<string, unknown>,
    reportError: (...args: unknown[]) => void,
  ) => boolean;
};

function publicSubmission(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "submission-1",
    submittedAt: new Date("2026-07-01T00:00:00Z"),
    referringCoachId: null,
    referringCoachEmail: "coach@example.com",
    campaign: {
      id: "campaign-1",
      name: "Quick Assessment",
      accessMode: "PUBLIC",
      template: { name: "Scaling Up Quick" },
    },
    outboxEmails: [
      {
        recipientRole: "REFERRING_COACH",
        recipientEmail: "Coach@Example.com ",
      },
    ],
    ...overrides,
  };
}

const COACHES = [
  {
    id: "coach-1",
    firstName: "Ada",
    lastName: "Coach",
    email: "coach@example.com",
  },
];

describe("parseReviewedMappings", () => {
  it("accepts an explicit submission-to-Coach mapping array", () => {
    expect(
      parseReviewedMappings([
        { submissionId: " submission-1 ", coachId: " coach-1 " },
      ]),
    ).toEqual([{ submissionId: "submission-1", coachId: "coach-1" }]);
  });

  it.each([
    [
      "duplicate",
      [
        { submissionId: "submission-1", coachId: "coach-1" },
        { submissionId: "submission-1", coachId: "coach-1" },
      ],
    ],
    [
      "conflicting",
      [
        { submissionId: "submission-1", coachId: "coach-1" },
        { submissionId: "submission-1", coachId: "coach-2" },
      ],
    ],
  ])("rejects %s mappings for one submission", (_label, mappings) => {
    expect(() => parseReviewedMappings(mappings)).toThrow(
      /duplicate or conflicting submissionId/i,
    );
  });

  it("allows one Coach to own multiple independently reviewed submissions", () => {
    expect(
      parseReviewedMappings([
        { submissionId: "submission-1", coachId: "coach-1" },
        { submissionId: "submission-2", coachId: "coach-1" },
      ]),
    ).toHaveLength(2);
  });

  it.each([
    ["non-array input", {}],
    ["empty batch", []],
    ["missing submission ID", [{ submissionId: "", coachId: "coach-1" }]],
    ["missing Coach ID", [{ submissionId: "submission-1", coachId: "" }]],
  ])("rejects %s", (_label, mapping) => {
    expect(() => parseReviewedMappings(mapping)).toThrow();
  });
});

describe("validateReviewedMappings", () => {
  const mapping = [{ submissionId: "submission-1", coachId: "coach-1" }];

  it("returns a null-owner row as an update and never derives the Coach from email", () => {
    expect(
      validateReviewedMappings(mapping, [publicSubmission()], COACHES),
    ).toEqual([
      {
        submissionId: "submission-1",
        coachId: "coach-1",
        action: "update",
      },
    ]);
  });

  it("is idempotent when the reviewed owner is already applied", () => {
    expect(
      validateReviewedMappings(
        mapping,
        [publicSubmission({ referringCoachId: "coach-1" })],
        COACHES,
      ),
    ).toEqual([
      {
        submissionId: "submission-1",
        coachId: "coach-1",
        action: "already-applied",
      },
    ]);
  });

  it("rejects a conflicting existing owner", () => {
    expect(() =>
      validateReviewedMappings(
        mapping,
        [publicSubmission({ referringCoachId: "coach-other" })],
        COACHES,
      ),
    ).toThrow(/conflicting existing owner/i);
  });

  it("rejects a nonexistent submission ID", () => {
    expect(() => validateReviewedMappings(mapping, [], COACHES)).toThrow(
      /submission does not exist/i,
    );
  });

  it("rejects a nonexistent Coach ID", () => {
    expect(() =>
      validateReviewedMappings(mapping, [publicSubmission()], []),
    ).toThrow(/coach does not exist/i);
  });

  it("rejects a non-public submission", () => {
    expect(() =>
      validateReviewedMappings(
        mapping,
        [
          publicSubmission({
            campaign: { id: "campaign-1", accessMode: "INVITED" },
          }),
        ],
        COACHES,
      ),
    ).toThrow(/not public/i);
  });

  it("rejects a mapping without REFERRING_COACH outbox evidence", () => {
    expect(() =>
      validateReviewedMappings(
        mapping,
        [publicSubmission({ outboxEmails: [] })],
        COACHES,
      ),
    ).toThrow(/referring_coach outbox/i);
  });

  it("rejects conflicting stored and outbox email evidence", () => {
    expect(() =>
      validateReviewedMappings(
        mapping,
        [
          publicSubmission({
            referringCoachEmail: "different@example.com",
          }),
        ],
        COACHES,
      ),
    ).toThrow(/email evidence conflicts/i);
  });
});

describe("buildReviewCandidates", () => {
  it("prints normalized evidence and an unapproved candidate, not a write mapping", () => {
    const result = buildReviewCandidates([publicSubmission()], COACHES);

    expect(result.excluded).toEqual([]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        submissionId: "submission-1",
        storedReferralEmail: "coach@example.com",
        outboxRecipientEmail: "coach@example.com",
        candidateCoach: {
          id: "coach-1",
          name: "Ada Coach",
          email: "coach@example.com",
        },
        reviewStatus: "REQUIRES_HUMAN_CONFIRMATION",
      }),
    ]);
    expect(result.candidates[0]).not.toHaveProperty("coachId");
  });

  it("excludes conflicting evidence and missing candidate Coaches", () => {
    const conflict = publicSubmission({
      referringCoachEmail: "different@example.com",
    });

    const result = buildReviewCandidates(
      [conflict, publicSubmission({ id: "submission-2" })],
      [],
    );

    expect(result.candidates).toEqual([]);
    expect(result.excluded).toEqual([
      expect.objectContaining({
        submissionId: "submission-1",
        reason: "EMAIL_EVIDENCE_CONFLICT",
      }),
      expect.objectContaining({
        submissionId: "submission-2",
        reason: "COACH_NOT_FOUND",
      }),
    ]);
  });

  it("excludes ambiguous current Coach identities", () => {
    const result = buildReviewCandidates(
      [publicSubmission()],
      [
        ...COACHES,
        {
          id: "coach-2",
          firstName: "Other",
          lastName: "Coach",
          email: "COACH@example.com",
        },
      ],
    );

    expect(result.candidates).toEqual([]);
    expect(result.excluded).toEqual([
      {
        submissionId: "submission-1",
        reason: "COACH_AMBIGUOUS",
      },
    ]);
  });
});

describe("applyReviewedMappings transaction orchestration", () => {
  function makeDb(submissions: unknown[], coaches: unknown[] = COACHES) {
    const committedWrites: unknown[] = [];
    const transaction = jest.fn(
      async (
        callback: (tx: Record<string, unknown>) => Promise<unknown>,
        options: unknown,
      ) => {
        void options;
        const pendingWrites: unknown[] = [];
        const tx = {
          assessmentSubmission: {
            findMany: jest.fn().mockResolvedValue(submissions),
          },
          coach: {
            findMany: jest.fn().mockResolvedValue(coaches),
          },
          pendingWrites,
        };
        try {
          const result = await callback(tx);
          committedWrites.push(...pendingWrites);
          return result;
        } catch (error) {
          throw error;
        }
      },
    );
    return {
      db: { $transaction: transaction },
      transaction,
      committedWrites,
    };
  }

  it("applies a multi-row batch through one bulk CAS inside a bounded transaction", async () => {
    const submissions = [
      publicSubmission(),
      publicSubmission({ id: "submission-2" }),
    ];
    const harness = makeDb(submissions);
    const bulkApply = jest.fn(
      async (tx: { pendingWrites: unknown[] }, rows: unknown[]) => {
        tx.pendingWrites.push(...rows);
        return rows.length;
      },
    );

    await expect(
      applyReviewedMappings(
        harness.db,
        [
          { submissionId: "submission-1", coachId: "coach-1" },
          { submissionId: "submission-2", coachId: "coach-1" },
        ],
        bulkApply,
      ),
    ).resolves.toEqual({
      reviewed: 2,
      updated: 2,
      alreadyApplied: 0,
    });
    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.transaction.mock.calls[0][1]).toEqual({
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(bulkApply).toHaveBeenCalledTimes(1);
    expect(harness.committedWrites).toHaveLength(2);
  });

  it("rolls the whole simulated batch back when the bulk CAS count mismatches", async () => {
    const submissions = [
      publicSubmission(),
      publicSubmission({ id: "submission-2" }),
    ];
    const harness = makeDb(submissions);
    const bulkApply = jest.fn(
      async (tx: { pendingWrites: unknown[] }, rows: unknown[]) => {
        tx.pendingWrites.push(rows[0]);
        return 1;
      },
    );

    await expect(
      applyReviewedMappings(
        harness.db,
        [
          { submissionId: "submission-1", coachId: "coach-1" },
          { submissionId: "submission-2", coachId: "coach-1" },
        ],
        bulkApply,
      ),
    ).rejects.toThrow(/compare-and-set conflict/i);
    expect(harness.committedWrites).toEqual([]);
  });

  it("does not call the writer for an entirely idempotent batch", async () => {
    const harness = makeDb([
      publicSubmission({ referringCoachId: "coach-1" }),
    ]);
    const bulkApply = jest.fn();

    await expect(
      applyReviewedMappings(
        harness.db,
        [{ submissionId: "submission-1", coachId: "coach-1" }],
        bulkApply,
      ),
    ).resolves.toEqual({
      reviewed: 1,
      updated: 0,
      alreadyApplied: 1,
    });
    expect(bulkApply).not.toHaveBeenCalled();
  });

  it("rejects validation failures before the writer and commits nothing", async () => {
    const harness = makeDb([]);
    const bulkApply = jest.fn();

    await expect(
      applyReviewedMappings(
        harness.db,
        [{ submissionId: "submission-1", coachId: "coach-1" }],
        bulkApply,
      ),
    ).rejects.toThrow(/submission does not exist/i);
    expect(bulkApply).not.toHaveBeenCalled();
    expect(harness.committedWrites).toEqual([]);
  });
});

describe("apply CLI failure behavior", () => {
  it("exits nonzero before connecting when the explicit mapping argument is missing", () => {
    const result = spawnSync(
      process.execPath,
      [resolve(process.cwd(), "scripts/apply-public-referral-backfill.mjs")],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no batch writes applied/i);
    expect(result.stderr).toMatch(/--mapping/i);
  });

  it("reports synchronous stdout failure as post-commit, never as rollback", () => {
    const reportError = jest.fn();

    expect(
      writeCommittedReceipt(
        () => {
          throw Object.assign(new Error("broken pipe"), { code: "EPIPE" });
        },
        { reviewed: 2, updated: 2, alreadyApplied: 0 },
        reportError,
      ),
    ).toBe(false);
    expect(reportError).toHaveBeenCalledWith(
      expect.stringMatching(/COMMITTED.*receipt failed/i),
      expect.objectContaining({ code: "EPIPE" }),
    );
    expect(reportError.mock.calls[0][0]).not.toMatch(/no batch writes/i);
  });
});
