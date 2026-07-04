/**
 * Wave S (Jeff #12/#13) — group-report loader peer-benchmark gating tests.
 *
 * The loader fetches AssessmentBenchmark rows ONLY when the Wave S flag is on
 * AND the campaign alias is peer-render-enabled (spec 19s S-2/S-4): flag OFF ⇒
 * the assessmentBenchmark delegate is NEVER touched (spy) and the report is
 * byte-identical; flag ON + LVA ⇒ the map is threaded into the model and
 * provenance.peerBenchmarks records ACTUAL application ({applied, updatedAt})
 * only when ≥1 factor joined.
 *
 * Harness mirrors group-report.loader.test.ts (mock db whose $transaction
 * invokes its callback with a hand-built tx).
 */

import type { ApiActor } from "@/lib/auth/access-control";
import { getCampaignGroupReport } from "@/lib/assessments/group-report";

const mockCanViewGroupReport = jest.fn<Promise<boolean>, [unknown, unknown, string]>();
jest.mock("@/lib/assessments/access-control", () => ({
  canViewGroupReport: (...args: unknown[]) =>
    mockCanViewGroupReport(...(args as [unknown, unknown, string])),
  asAccessDb: (prisma: unknown) => prisma,
}));

function makeActor(overrides: Partial<ApiActor> = {}): ApiActor {
  return { id: "user-1", role: "ADMIN", coachId: null, email: "a@b.c", ...overrides } as ApiActor;
}

const GENERATED_AT = new Date("2026-07-03T12:00:00Z");
const BENCH_UPDATED_OLD = new Date("2026-07-01T00:00:00Z");
const BENCH_UPDATED_NEW = new Date("2026-07-02T00:00:00Z");

const SLIDER_SCALE = { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" };

const VERSION = {
  id: "ver-1",
  versionNumber: 2,
  contentHash: "vhash-1",
  publishedAt: new Date("2026-05-15T00:00:00Z"),
  sections: [{ stableKey: "S3_strengths", name: "Strengths" }],
  questions: [
    {
      stableKey: "S3_culture",
      type: "SLIDER_LIKERT",
      label: "Culture",
      sectionStableKey: "S3_strengths",
      scale: SLIDER_SCALE,
    },
  ],
};

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "camp-1",
    accessMode: "INVITED",
    organizationId: "org-1",
    createdByCoachId: null,
    templateId: "tpl-1",
    versionId: "ver-1",
    deletedAt: null,
    organization: { name: "Acme Corp" },
    template: { alias: "leadership-vision-alignment", name: "Leadership Vision Alignment" },
    creatorCoach: null,
    version: VERSION,
    ...overrides,
  };
}

function makeSubmission(respondentId: string, value: number) {
  return {
    id: `sub-${respondentId}`,
    respondentId,
    submittedAt: new Date("2026-06-01T10:00:00Z"),
    answers: [{ stableKey: "S3_culture", value }],
    result: {},
    respondent: { firstName: "X", lastName: "Y", jobTitle: null },
  };
}

function makeParticipant(respondentId: string, isCEO = false) {
  return {
    respondentId,
    isCEO,
    respondent: { firstName: "X", lastName: "Y", jobTitle: null },
  };
}

function makeMockDb(opts: {
  campaign: Record<string, unknown> | null;
  participants?: unknown[];
  submissions?: unknown[];
  invitedCount?: number;
  benchmarkRows?: Array<{ metricKey: string; value: number; updatedAt: Date }>;
}) {
  const findManyBenchmarks = jest.fn().mockResolvedValue(opts.benchmarkRows ?? []);
  const tx = {
    assessmentCampaign: { findFirst: jest.fn().mockResolvedValue(opts.campaign) },
    assessmentCampaignParticipant: {
      findMany: jest.fn().mockResolvedValue(opts.participants ?? []),
    },
    assessmentSubmission: { findMany: jest.fn().mockResolvedValue(opts.submissions ?? []) },
    assessmentInvitation: { count: jest.fn().mockResolvedValue(opts.invitedCount ?? 0) },
    assessmentBenchmark: { findMany: findManyBenchmarks },
  };
  const $transaction = jest
    .fn()
    .mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));
  return { db: { $transaction }, _findManyBenchmarks: findManyBenchmarks };
}

function run(mock: ReturnType<typeof makeMockDb>) {
  return getCampaignGroupReport(
    mock.db as unknown as Parameters<typeof getCampaignGroupReport>[0],
    makeActor(),
    "camp-1",
    GENERATED_AT,
  );
}

/** A 2-respondent LVA cohort: culture = 3,2 → 1S+1A → scaledValue 7.5. */
function cohortOpts(benchmarkRows?: Array<{ metricKey: string; value: number; updatedAt: Date }>) {
  return {
    campaign: makeCampaign(),
    participants: [makeParticipant("r1", true), makeParticipant("r2")],
    submissions: [makeSubmission("r1", 3), makeSubmission("r2", 2)],
    invitedCount: 2,
    benchmarkRows,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanViewGroupReport.mockResolvedValue(true);
  process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
  delete process.env.WAVE_S_PEER_BENCHMARKS_ENABLED;
  delete process.env.WAVE_S_PEER_BENCHMARKS_KILL;
});

afterEach(() => {
  delete process.env.WAVE_F_GROUP_REPORT_ENABLED;
  delete process.env.WAVE_S_PEER_BENCHMARKS_ENABLED;
  delete process.env.WAVE_S_PEER_BENCHMARKS_KILL;
});

test("flag OFF ⇒ assessmentBenchmark is NEVER queried and no peers render", async () => {
  const mock = makeMockDb(
    cohortOpts([{ metricKey: "S3_culture", value: 6.0, updatedAt: BENCH_UPDATED_OLD }]),
  );
  const result = await run(mock);
  expect(result.kind).toBe("ok");
  expect(mock._findManyBenchmarks).not.toHaveBeenCalled();
  if (result.kind === "ok") {
    const s3 = result.report.qualitative!.sections[0];
    if (s3.presentation === "rating") {
      for (const f of s3.factors) expect("peers" in f).toBe(false);
    }
    expect(result.provenance.peerBenchmarks).toBeUndefined();
  }
});

test("KILL beats ENABLED ⇒ no benchmark query", async () => {
  process.env.WAVE_S_PEER_BENCHMARKS_ENABLED = "1";
  process.env.WAVE_S_PEER_BENCHMARKS_KILL = "1";
  const mock = makeMockDb(cohortOpts());
  await run(mock);
  expect(mock._findManyBenchmarks).not.toHaveBeenCalled();
});

test("flag ON + LVA ⇒ rows join the model and provenance records actual application", async () => {
  process.env.WAVE_S_PEER_BENCHMARKS_ENABLED = "1";
  const mock = makeMockDb(
    cohortOpts([
      { metricKey: "S3_culture", value: 6.0, updatedAt: BENCH_UPDATED_OLD },
      // A row for a key nobody answered — fetched, but never applied.
      { metricKey: "S3_ghost", value: 4.0, updatedAt: BENCH_UPDATED_NEW },
    ]),
  );
  const result = await run(mock);
  expect(mock._findManyBenchmarks).toHaveBeenCalledWith({
    where: { templateId: "tpl-1", metricKind: "QUESTION" },
    select: { metricKey: true, value: true, updatedAt: true },
  });
  expect(result.kind).toBe("ok");
  if (result.kind === "ok") {
    const s3 = result.report.qualitative!.sections[0];
    expect(s3.presentation).toBe("rating");
    if (s3.presentation === "rating") {
      const culture = s3.factors.find((f) => f.stableKey === "S3_culture")!;
      // 1S+1A → (10+5)/2 = 7.5; dev = 7.5 − 6.0 = +1.5
      expect(culture.scaledValue).toBe(7.5);
      expect(culture.peers).toBe(6.0);
      expect(culture.devPeers).toBe(1.5);
    }
    // applied counts JOINED factors (1), not fetched rows (2); updatedAt is the
    // max over fetched rows (the peer set in force).
    expect(result.provenance.peerBenchmarks).toEqual({
      applied: 1,
      updatedAt: BENCH_UPDATED_NEW,
    });
  }
});

test("flag ON but zero rows ⇒ no provenance entry, no peers", async () => {
  process.env.WAVE_S_PEER_BENCHMARKS_ENABLED = "1";
  const mock = makeMockDb(cohortOpts([]));
  const result = await run(mock);
  expect(mock._findManyBenchmarks).toHaveBeenCalledTimes(1);
  if (result.kind === "ok") {
    expect(result.provenance.peerBenchmarks).toBeUndefined();
  }
});

test("flag ON but rows join nothing (unanswered keys only) ⇒ no provenance entry", async () => {
  process.env.WAVE_S_PEER_BENCHMARKS_ENABLED = "1";
  const mock = makeMockDb(
    cohortOpts([{ metricKey: "S3_ghost", value: 4.0, updatedAt: BENCH_UPDATED_OLD }]),
  );
  const result = await run(mock);
  if (result.kind === "ok") {
    expect(result.provenance.peerBenchmarks).toBeUndefined();
  }
});

test("flag ON + non-render-enabled alias ⇒ no benchmark query", async () => {
  process.env.WAVE_S_PEER_BENCHMARKS_ENABLED = "1";
  // SU-Full is scored (different render path), but the gate we assert here is
  // alias-based and runs before any benchmark read.
  const mock = makeMockDb({
    ...cohortOpts(),
    campaign: makeCampaign({
      template: { alias: "qsp-v2", name: "Quarterly Session Prep v2" },
    }),
  });
  await run(mock);
  expect(mock._findManyBenchmarks).not.toHaveBeenCalled();
});
