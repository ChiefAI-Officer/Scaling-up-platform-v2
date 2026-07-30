/* eslint-disable @typescript-eslint/no-require-imports */

const {
  buildReviewCandidates,
  parseReviewedMappings,
  validateReviewedMappings,
} = require("../../../scripts/public-referral-backfill-core.cjs") as {
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
});
