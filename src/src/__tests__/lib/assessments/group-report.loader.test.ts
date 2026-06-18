/**
 * Tests for getCampaignGroupReport — authorized GROUP-report DB loader (Wave F #22, T6).
 *
 * Mocking strategy (mirrors respondent-report.test.ts):
 *   - `canViewGroupReport` from access-control is mocked via jest.mock so the
 *     authz path is fully controllable.
 *   - `db` is a hand-built object whose `$transaction(cb, opts)` invokes its
 *     callback with a `tx` object exposing the Prisma delegates the loader
 *     touches (assessmentCampaign.findFirst, assessmentCampaignParticipant
 *     .findMany, assessmentSubmission.findMany, assessmentInvitation.count).
 *   - We assert (a) authz is consulted, (b) the fetch happens on the tx client,
 *     (c) INVITED-only / empty / ok dispatch, and (d) the contentHash semantics.
 */

import type { ApiActor } from "@/lib/auth/access-control";
import { getCampaignGroupReport } from "@/lib/assessments/group-report";

// ── Mock access-control so canViewGroupReport is fully controllable ──────────
const mockCanViewGroupReport =
  jest.fn<Promise<boolean>, [unknown, unknown, string]>();

jest.mock("@/lib/assessments/access-control", () => ({
  canViewGroupReport: (...args: unknown[]) =>
    mockCanViewGroupReport(...(args as [unknown, unknown, string])),
  asAccessDb: (prisma: unknown) => prisma,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<ApiActor> = {}): ApiActor {
  return {
    userId: "user-1",
    email: "coach@example.com",
    role: "COACH",
    coachId: "coach-1",
    ...overrides,
  };
}

const GENERATED_AT = new Date("2026-06-18T12:00:00Z");

const VERSION = {
  id: "ver-1",
  versionNumber: 2,
  contentHash: "vhash-1",
  sections: [{ stableKey: "s1", name: "Section One" }],
  questions: [
    {
      stableKey: "q1",
      label: "Question One",
      type: "SLIDER_LIKERT",
      sectionStableKey: "s1",
      scale: { min: 0, max: 3 },
    },
  ],
  scoringConfig: { tiers: [] },
};

// A LIVE INVITED campaign, alias "leadership-vision-alignment" (qualitative).
function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "camp-1",
    accessMode: "INVITED",
    organizationId: "org-1",
    templateId: "tpl-1",
    versionId: "ver-1",
    deletedAt: null,
    organization: { name: "Acme Corp" },
    template: { alias: "leadership-vision-alignment", name: "Leadership Vision Alignment" },
    version: VERSION,
    ...overrides,
  };
}

const PARTICIPANTS = [
  {
    id: "part-ceo",
    isCEO: true,
    respondentId: "resp-ceo",
    respondent: { firstName: "Carol", lastName: "Exec", jobTitle: "CEO" },
  },
  {
    id: "part-2",
    isCEO: false,
    respondentId: "resp-2",
    respondent: { firstName: "Bob", lastName: "Builder", jobTitle: "VP" },
  },
];

function makeSubmission(
  respondentId: string,
  value: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `sub-${respondentId}`,
    respondentId,
    submittedAt: new Date("2026-06-01T10:00:00Z"),
    answers: [{ stableKey: "q1", value }],
    result: { perSection: [], perQuestion: [] },
    respondent: { firstName: "X", lastName: "Y", jobTitle: null },
    ...overrides,
  };
}

interface MockTx {
  assessmentCampaign: { findFirst: jest.Mock };
  assessmentCampaignParticipant: { findMany: jest.Mock };
  assessmentSubmission: { findMany: jest.Mock };
  assessmentInvitation: { count: jest.Mock };
}

/**
 * Build a mock db whose $transaction calls the callback with the tx object.
 * `invitedCount` is what assessmentInvitation.count resolves to.
 */
function makeMockDb(opts: {
  campaign: Record<string, unknown> | null;
  participants?: unknown[];
  submissions?: unknown[];
  invitedCount?: number;
}) {
  const findFirstCampaign = jest.fn().mockResolvedValue(opts.campaign);
  const findManyParticipants = jest
    .fn()
    .mockResolvedValue(opts.participants ?? []);
  const findManySubmissions = jest
    .fn()
    .mockResolvedValue(opts.submissions ?? []);
  const countInvitations = jest
    .fn()
    .mockResolvedValue(opts.invitedCount ?? 0);

  const tx: MockTx = {
    assessmentCampaign: { findFirst: findFirstCampaign },
    assessmentCampaignParticipant: { findMany: findManyParticipants },
    assessmentSubmission: { findMany: findManySubmissions },
    assessmentInvitation: { count: countInvitations },
  };

  const $transaction = jest
    .fn()
    .mockImplementation(
      async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx),
    );

  return {
    db: { $transaction },
    $transaction,
    _findFirstCampaign: findFirstCampaign,
    _findManyParticipants: findManyParticipants,
    _findManySubmissions: findManySubmissions,
    _countInvitations: countInvitations,
    _tx: tx,
  };
}

function callLoader(
  mock: ReturnType<typeof makeMockDb>,
  actor: ApiActor = makeActor(),
  generatedAt: Date = GENERATED_AT,
) {
  return getCampaignGroupReport(
    mock.db as unknown as Parameters<typeof getCampaignGroupReport>[0],
    actor,
    "camp-1",
    generatedAt,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanViewGroupReport.mockResolvedValue(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test("PUBLIC campaign → notApplicable (no model built)", async () => {
  const mock = makeMockDb({
    campaign: makeCampaign({ accessMode: "PUBLIC" }),
  });

  const res = await callLoader(mock);

  expect(res.kind).toBe("notApplicable");
  if (res.kind !== "notApplicable") return;
  expect(res.reason).toBe("public");
  // No submissions / participants need to be loaded for a non-applicable report.
  expect(mock._findManySubmissions).not.toHaveBeenCalled();
});

test("non-LVA INVITED campaign → notApplicable (unsupported-template; scored engine not surfaced)", async () => {
  // Jeff 2026-06-18: the group report is surfaced for LVA only. A scored
  // template (Rockefeller) must NOT build/audit a group report even when INVITED.
  const mock = makeMockDb({
    campaign: makeCampaign({
      template: { alias: "RockHabits", name: "Rockefeller Habits" },
    }),
  });

  const res = await callLoader(mock);

  expect(res.kind).toBe("notApplicable");
  if (res.kind !== "notApplicable") return;
  expect(res.reason).toBe("unsupported-template");
  expect(mock._findManySubmissions).not.toHaveBeenCalled();
});

test("campaign not found (null) → forbidden", async () => {
  const mock = makeMockDb({ campaign: null });

  const res = await callLoader(mock);

  expect(res.kind).toBe("forbidden");
});

test("INVITED + unauthorized actor → forbidden, canViewGroupReport consulted", async () => {
  mockCanViewGroupReport.mockResolvedValue(false);
  const mock = makeMockDb({ campaign: makeCampaign() });

  const res = await callLoader(mock);

  expect(res.kind).toBe("forbidden");
  expect(mockCanViewGroupReport).toHaveBeenCalledTimes(1);
  // Consulted with (db-ish, actor, campaignId).
  expect(mockCanViewGroupReport).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ coachId: "coach-1" }),
    "camp-1",
  );
  // Forbidden short-circuits BEFORE any cohort load.
  expect(mock._findManySubmissions).not.toHaveBeenCalled();
});

test("INVITED + 0 completed submissions → empty with provenance (invitedCount reflects invitations)", async () => {
  const mock = makeMockDb({
    campaign: makeCampaign(),
    participants: PARTICIPANTS,
    submissions: [],
    invitedCount: 3,
  });

  const res = await callLoader(mock);

  expect(res.kind).toBe("empty");
  if (res.kind !== "empty") return;
  expect(res.provenance.completedCount).toBe(0);
  expect(res.provenance.invitedCount).toBe(3);
  expect(res.provenance.versionId).toBe("ver-1");
  expect(res.provenance.templateAlias).toBe("leadership-vision-alignment");
  expect(res.provenance.generatedAt).toEqual(GENERATED_AT);
  expect(res.provenance.submissionIds).toEqual([]);
});

test("INVITED + completed submissions → ok with report + provenance", async () => {
  const submissions = [
    makeSubmission("resp-ceo", 3),
    makeSubmission("resp-2", 1),
  ];
  const mock = makeMockDb({
    campaign: makeCampaign(),
    participants: PARTICIPANTS,
    submissions,
    invitedCount: 2,
  });

  const res = await callLoader(mock);

  expect(res.kind).toBe("ok");
  if (res.kind !== "ok") return;

  // Model was built — respondentCount matches the cohort size.
  expect(res.report.respondentCount).toBe(2);
  // CEO ordered first.
  expect(res.report.respondents[0].isCEO).toBe(true);
  expect(res.report.respondents[0].respondentId).toBe("resp-ceo");

  // Provenance
  expect(res.provenance.completedCount).toBe(2);
  expect(res.provenance.invitedCount).toBe(2);
  expect(res.provenance.versionId).toBe("ver-1");
  expect(res.provenance.templateAlias).toBe("leadership-vision-alignment");
  expect(res.provenance.ceoParticipantId).toBe("part-ceo");
  expect(res.provenance.submissionIds.sort()).toEqual(
    ["sub-resp-2", "sub-resp-ceo"].sort(),
  );
  expect(typeof res.provenance.contentHash).toBe("string");
  expect(res.provenance.contentHash.length).toBeGreaterThan(0);
  expect(res.provenance.generatedAt).toEqual(GENERATED_AT);
});

test("ceoParticipantId is null when no participant is flagged CEO", async () => {
  const mock = makeMockDb({
    campaign: makeCampaign(),
    participants: [
      {
        id: "part-2",
        isCEO: false,
        respondentId: "resp-2",
        respondent: { firstName: "Bob", lastName: "Builder", jobTitle: "VP" },
      },
    ],
    submissions: [makeSubmission("resp-2", 2)],
    invitedCount: 1,
  });

  const res = await callLoader(mock);

  expect(res.kind).toBe("ok");
  if (res.kind !== "ok") return;
  expect(res.provenance.ceoParticipantId).toBeNull();
});

test("contentHash is STABLE across two calls with identical data", async () => {
  const submissions = [makeSubmission("resp-ceo", 3), makeSubmission("resp-2", 1)];

  const mockA = makeMockDb({
    campaign: makeCampaign(),
    participants: PARTICIPANTS,
    submissions,
    invitedCount: 2,
  });
  const mockB = makeMockDb({
    campaign: makeCampaign(),
    participants: PARTICIPANTS,
    submissions: [makeSubmission("resp-ceo", 3), makeSubmission("resp-2", 1)],
    invitedCount: 2,
  });

  const a = await callLoader(mockA);
  const b = await callLoader(mockB);

  expect(a.kind).toBe("ok");
  expect(b.kind).toBe("ok");
  if (a.kind !== "ok" || b.kind !== "ok") return;
  expect(a.provenance.contentHash).toBe(b.provenance.contentHash);
});

test("contentHash is identical regardless of generatedAt", async () => {
  const submissions = [makeSubmission("resp-ceo", 3)];
  const mockA = makeMockDb({
    campaign: makeCampaign(),
    participants: PARTICIPANTS,
    submissions,
    invitedCount: 1,
  });
  const mockB = makeMockDb({
    campaign: makeCampaign(),
    participants: PARTICIPANTS,
    submissions: [makeSubmission("resp-ceo", 3)],
    invitedCount: 1,
  });

  const a = await callLoader(mockA, makeActor(), new Date("2020-01-01T00:00:00Z"));
  const b = await callLoader(mockB, makeActor(), new Date("2099-12-31T23:59:59Z"));

  expect(a.kind).toBe("ok");
  expect(b.kind).toBe("ok");
  if (a.kind !== "ok" || b.kind !== "ok") return;
  expect(a.provenance.contentHash).toBe(b.provenance.contentHash);
  // But generatedAt is still carried through verbatim.
  expect(a.provenance.generatedAt).toEqual(new Date("2020-01-01T00:00:00Z"));
  expect(b.provenance.generatedAt).toEqual(new Date("2099-12-31T23:59:59Z"));
});

test("contentHash CHANGES when a submission's answers change", async () => {
  const mockA = makeMockDb({
    campaign: makeCampaign(),
    participants: PARTICIPANTS,
    submissions: [makeSubmission("resp-ceo", 3)],
    invitedCount: 1,
  });
  const mockB = makeMockDb({
    campaign: makeCampaign(),
    participants: PARTICIPANTS,
    submissions: [makeSubmission("resp-ceo", 0)], // different answer value
    invitedCount: 1,
  });

  const a = await callLoader(mockA);
  const b = await callLoader(mockB);

  expect(a.kind).toBe("ok");
  expect(b.kind).toBe("ok");
  if (a.kind !== "ok" || b.kind !== "ok") return;
  expect(a.provenance.contentHash).not.toBe(b.provenance.contentHash);
});

test("the fetch happens inside the $transaction callback (snapshot consistency)", async () => {
  const mock = makeMockDb({
    campaign: makeCampaign(),
    participants: PARTICIPANTS,
    submissions: [makeSubmission("resp-ceo", 3)],
    invitedCount: 1,
  });

  await callLoader(mock);

  expect(mock.$transaction).toHaveBeenCalledTimes(1);
  // The campaign load happens on the tx client.
  expect(mock._findFirstCampaign).toHaveBeenCalledTimes(1);
  expect(mock._findManyParticipants).toHaveBeenCalledTimes(1);
  expect(mock._findManySubmissions).toHaveBeenCalledTimes(1);
});

test("only SUBMITTED / non-null-respondentId submissions feed the cohort", async () => {
  // The loader's submission query is responsible for SUBMITTED-only + non-null
  // respondentId filtering. We assert the query was issued with a where that
  // pins status SUBMITTED and excludes null respondentId, and that the model
  // only counts the rows the (mocked) query returned.
  const mock = makeMockDb({
    campaign: makeCampaign(),
    participants: PARTICIPANTS,
    submissions: [makeSubmission("resp-ceo", 3)], // mock returns the filtered set
    invitedCount: 2,
  });

  const res = await callLoader(mock);

  expect(res.kind).toBe("ok");
  if (res.kind !== "ok") return;
  expect(res.report.respondentCount).toBe(1);
  expect(res.provenance.completedCount).toBe(1);

  // The submission query filters to completed (SUBMITTED) + non-null respondent.
  const whereArg = mock._findManySubmissions.mock.calls[0][0].where;
  expect(whereArg).toEqual(
    expect.objectContaining({
      campaignId: "camp-1",
      respondentId: expect.objectContaining({ not: null }),
    }),
  );
  // The completed-only constraint is keyed on the invitation's SUBMITTED status.
  expect(JSON.stringify(whereArg)).toContain("SUBMITTED");

  // The invitation count query excludes revoked invitations.
  const countWhere = mock._countInvitations.mock.calls[0][0].where;
  expect(JSON.stringify(countWhere)).toContain("revokedAt");
});
