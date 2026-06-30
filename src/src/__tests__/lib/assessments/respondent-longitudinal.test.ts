/**
 * Wave N — getRespondentLongitudinal() unit tests.
 *
 * Mocking strategy (mirrors respondent-report.test.ts + trends.test.ts):
 *   - canAccessOrganization + canAccessTemplate (access-control) are mocked via
 *     jest.mock so authz is fully controllable; asAccessDb is identity.
 *   - reportConfigFor is the REAL module (not mocked) — the scope gate must
 *     react to actual template aliases.
 *   - `db` is a hand-built object exposing the narrow delegates the loader
 *     reads: orgRespondent.findFirst/findMany, assessmentTemplate.findUnique,
 *     assessmentSubmission.findMany (filtered against a fixture set).
 */

import type { ApiActor } from "@/lib/auth/access-control";
import type { ScoreResult } from "@/lib/assessments/scoring";
import {
  getRespondentLongitudinal,
  partitionPointsByVersion,
  DEFAULT_MAX_COLUMNS,
  type RespondentLongitudinalDb,
  type OrgRespondentRow,
  type LongitudinalSubmissionRow,
  type RespondentLongitudinalPoint,
} from "@/lib/assessments/respondent-longitudinal";

// ── Mock access-control: authz fully controllable; reportConfigFor is REAL ──
const mockCanAccessOrganization = jest.fn<Promise<boolean>, unknown[]>();
const mockCanAccessTemplate = jest.fn<Promise<boolean>, unknown[]>();

jest.mock("@/lib/assessments/access-control", () => ({
  canAccessOrganization: (...args: unknown[]) =>
    mockCanAccessOrganization(...args),
  canAccessTemplate: (...args: unknown[]) => mockCanAccessTemplate(...args),
  asAccessDb: (prisma: unknown) => prisma,
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────

const ORG_ID = "org-1";
const TEMPLATE_ID = "tpl-rock";
const SCORED_ALIAS = "RockHabits"; // reportType: "scored"
const QUALITATIVE_ALIAS = "leadership-vision-alignment"; // qualitative

function makeActor(overrides: Partial<ApiActor> = {}): ApiActor {
  return {
    userId: "user-1",
    email: "coach@example.com",
    role: "COACH",
    coachId: "coach-1",
    ...overrides,
  };
}

function makeRespondent(
  overrides: Partial<OrgRespondentRow> = {},
): OrgRespondentRow {
  return {
    id: "resp-1",
    organizationId: ORG_ID,
    normalizedEmail: "alice@example.com",
    firstName: "Alice",
    lastName: "Smith",
    jobTitle: "CEO",
    deletedAt: null,
    ...overrides,
  };
}

function buildResult(opts: {
  overallAverage: number;
  scaleUpScore?: number;
  tierLabel?: string;
  perSection?: Array<{ stableKey: string; name: string; averagePoints: number }>;
  perDomain?: Array<{ key: string; label: string; averagePoints: number | null }>;
}): ScoreResult {
  return {
    perQuestion: [],
    perSection: (opts.perSection ?? []).map((s) => ({
      stableKey: s.stableKey,
      name: s.name,
      totalPoints: s.averagePoints,
      averagePoints: s.averagePoints,
      achievedCount: 0,
      totalCount: 1,
    })),
    ...(opts.perDomain
      ? {
          perDomain: opts.perDomain.map((d) => ({
            key: d.key,
            label: d.label,
            averagePoints: d.averagePoints,
            answeredSectionCount: d.averagePoints === null ? 0 : 1,
            totalSectionCount: 1,
            tier: null,
          })),
        }
      : {}),
    overallTotal: opts.overallAverage,
    overallAverage: opts.overallAverage,
    countAchieved: 0,
    tier: opts.tierLabel ? { label: opts.tierLabel, message: "" } : null,
    tierMetricValue: opts.overallAverage,
    ...(opts.scaleUpScore !== undefined ? { scaleUpScore: opts.scaleUpScore } : {}),
    unansweredKeys: [],
  };
}

interface SubmissionFixture {
  id: string;
  campaignId: string;
  respondentId: string | null;
  submittedAt: Date;
  result: unknown;
  campaignName?: string | null;
  openAt?: Date;
  versionId: string;
  versionNumber?: number;
  campaignDeletedAt?: Date | null;
  orgName?: string | null;
}

function toSubmissionRow(f: SubmissionFixture): LongitudinalSubmissionRow {
  return {
    id: f.id,
    campaignId: f.campaignId,
    respondentId: f.respondentId,
    submittedAt: f.submittedAt,
    result: f.result,
    campaign: {
      id: f.campaignId,
      name: f.campaignName ?? null,
      openAt: f.openAt ?? f.submittedAt,
      versionId: f.versionId,
      deletedAt: f.campaignDeletedAt ?? null,
      organization: { name: f.orgName ?? "Acme Corp" },
      version: { versionNumber: f.versionNumber ?? 1 },
    },
  };
}

interface DbFixture {
  /** The path/entry OrgRespondent returned by findFirst (or null ⇒ not found). */
  entry?: OrgRespondentRow | null;
  /** Rows returned by orgRespondent.findMany (email-union). */
  emailUnionRows?: OrgRespondentRow[];
  /** Template returned by assessmentTemplate.findUnique (or null). */
  template?: { id: string; name: string; alias: string } | null;
  /** Full submission fixture set; findMany filters by respondentId IN + live. */
  submissions?: SubmissionFixture[];
}

function buildDb(f: DbFixture): RespondentLongitudinalDb {
  const entry = f.entry === undefined ? makeRespondent() : f.entry;
  const template =
    f.template === undefined
      ? { id: TEMPLATE_ID, name: "Rockefeller Habits", alias: SCORED_ALIAS }
      : f.template;
  const allSubs = (f.submissions ?? []).map(toSubmissionRow);

  return {
    orgRespondent: {
      findFirst: jest.fn().mockResolvedValue(entry),
      findMany: jest.fn().mockResolvedValue(f.emailUnionRows ?? (entry ? [entry] : [])),
    },
    assessmentTemplate: {
      findUnique: jest.fn().mockResolvedValue(template),
    },
    assessmentSubmission: {
      findMany: jest.fn().mockImplementation(async (args) => {
        const ids = new Set(args.where.respondentId.in as string[]);
        return allSubs.filter(
          (s) =>
            s.respondentId !== null &&
            ids.has(s.respondentId) &&
            s.campaign.deletedAt === null,
        );
      }),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCanAccessOrganization.mockResolvedValue(true);
  mockCanAccessTemplate.mockResolvedValue(true);
});

// ─── Authz: forbidden ───────────────────────────────────────────────────────

test("forbidden when canAccessOrganization is false", async () => {
  mockCanAccessOrganization.mockResolvedValue(false);
  const db = buildDb({});
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("forbidden");
  // Scope gate / submission load must NOT run on the forbidden path.
  expect((db.assessmentSubmission.findMany as jest.Mock)).not.toHaveBeenCalled();
});

test("forbidden when canAccessTemplate is false (lost template access)", async () => {
  mockCanAccessTemplate.mockResolvedValue(false);
  const db = buildDb({});
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("forbidden");
});

test("forbidden when entry OrgRespondent is missing / cross-org / soft-deleted (org-bind)", async () => {
  const db = buildDb({ entry: null });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-stale",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("forbidden");
  // Org-bind 404s BEFORE the scope-gate template load.
  expect((db.assessmentTemplate.findUnique as jest.Mock)).not.toHaveBeenCalled();
});

test("org-bind query pins {id, organizationId, deletedAt:null}", async () => {
  const db = buildDb({ submissions: [] });
  await getRespondentLongitudinal(db, makeActor(), ORG_ID, "resp-1", TEMPLATE_ID);
  const call = (db.orgRespondent.findFirst as jest.Mock).mock.calls[0][0];
  expect(call.where).toEqual({
    id: "resp-1",
    organizationId: ORG_ID,
    deletedAt: null,
  });
});

// ─── Scope gate ─────────────────────────────────────────────────────────────

test("qualitative template ⇒ notApplicable: qualitative-template, no submission load", async () => {
  const db = buildDb({
    template: { id: TEMPLATE_ID, name: "LVA", alias: QUALITATIVE_ALIAS },
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out).toEqual({ kind: "notApplicable", reason: "qualitative-template" });
  expect((db.assessmentSubmission.findMany as jest.Mock)).not.toHaveBeenCalled();
});

test("missing template ⇒ forbidden (route 404), no submission load", async () => {
  const db = buildDb({ template: null });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("forbidden");
  expect((db.assessmentSubmission.findMany as jest.Mock)).not.toHaveBeenCalled();
});

// ─── Empty ──────────────────────────────────────────────────────────────────

test("empty when the person has zero submissions for this template", async () => {
  const db = buildDb({ submissions: [] });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("empty");
});

// ─── Email-union matching across two OrgRespondent rows ─────────────────────

test("email-union: submissions across two same-email OrgRespondent rows are merged", async () => {
  const entry = makeRespondent({ id: "resp-email" });
  const esperto = makeRespondent({
    id: "resp-external",
    normalizedEmail: "alice@example.com",
  });
  const db = buildDb({
    entry,
    emailUnionRows: [entry, esperto],
    submissions: [
      {
        id: "sub-y1",
        campaignId: "camp-y1",
        respondentId: "resp-external", // Esperto import
        submittedAt: new Date("2024-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({
          overallAverage: 2,
          perSection: [{ stableKey: "s1", name: "S1", averagePoints: 2 }],
        }),
      },
      {
        id: "sub-y2",
        campaignId: "camp-y2",
        respondentId: "resp-email", // platform invite
        submittedAt: new Date("2025-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({
          overallAverage: 3,
          perSection: [{ stableKey: "s1", name: "S1", averagePoints: 3 }],
        }),
      },
    ],
  });

  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-email",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  expect(out.data.matchedRespondentCount).toBe(2);
  expect(out.data.points).toHaveLength(2);
  // Esperto (Year 1) is plotted alongside the platform (Year 2) point.
  expect(out.data.points[0].campaignId).toBe("camp-y1");
  expect(out.data.points[1].campaignId).toBe("camp-y2");
  // The findMany IN clause must contain BOTH ids.
  const subCall = (db.assessmentSubmission.findMany as jest.Mock).mock.calls[0][0];
  expect(new Set(subCall.where.respondentId.in)).toEqual(
    new Set(["resp-email", "resp-external"]),
  );
});

test("no normalizedEmail ⇒ falls back to the single entry respondentId", async () => {
  const entry = makeRespondent({ id: "resp-noemail", normalizedEmail: null });
  const db = buildDb({
    entry,
    submissions: [
      {
        id: "sub-1",
        campaignId: "camp-1",
        respondentId: "resp-noemail",
        submittedAt: new Date("2025-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({ overallAverage: 3 }),
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-noemail",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  expect(out.data.matchedRespondentCount).toBe(1);
  // The email-union findMany must NOT have been used.
  expect((db.orgRespondent.findMany as jest.Mock)).not.toHaveBeenCalled();
  const subCall = (db.assessmentSubmission.findMany as jest.Mock).mock.calls[0][0];
  expect(subCall.where.respondentId.in).toEqual(["resp-noemail"]);
});

test("email-union strictly excludes cross-org / soft-deleted rows from a loose stub", async () => {
  const entry = makeRespondent({ id: "resp-1" });
  const otherOrg = makeRespondent({
    id: "resp-otherorg",
    organizationId: "org-OTHER",
  });
  const deleted = makeRespondent({
    id: "resp-deleted",
    deletedAt: new Date("2025-06-01T00:00:00Z"),
  });
  const db = buildDb({
    entry,
    emailUnionRows: [entry, otherOrg, deleted],
    submissions: [],
  });
  await getRespondentLongitudinal(db, makeActor(), ORG_ID, "resp-1", TEMPLATE_ID);
  const subCall = (db.assessmentSubmission.findMany as jest.Mock).mock.calls[0][0];
  // Only the in-org, live ids survive.
  expect(new Set(subCall.where.respondentId.in)).toEqual(new Set(["resp-1"]));
});

// ─── Imported submission included (GM-1) ────────────────────────────────────

test("imported (CLOSED, back-dated) submission is included, no status filter", async () => {
  const db = buildDb({
    submissions: [
      {
        id: "sub-imported",
        campaignId: "camp-esperto",
        respondentId: "resp-1",
        submittedAt: new Date("2023-05-01T00:00:00Z"),
        versionId: "v1",
        campaignName: "Esperto 2023",
        result: buildResult({ overallAverage: 2.5 }),
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  expect(out.data.points).toHaveLength(1);
  expect(out.data.points[0].campaignLabel).toBe("Esperto 2023");
  // The submission where-clause never restricts campaign.status.
  const subCall = (db.assessmentSubmission.findMany as jest.Mock).mock.calls[0][0];
  expect(subCall.where.campaign).not.toHaveProperty("status");
});

// ─── One-point-per-campaign collapse (R1-High-3) ────────────────────────────

test("one-point collapse: a campaign with 2 matched subs yields ONE degraded point (latest)", async () => {
  const entry = makeRespondent({ id: "resp-a" });
  const dup = makeRespondent({ id: "resp-b", normalizedEmail: "alice@example.com" });
  const db = buildDb({
    entry,
    emailUnionRows: [entry, dup],
    submissions: [
      {
        id: "sub-early",
        campaignId: "camp-shared",
        respondentId: "resp-a",
        submittedAt: new Date("2025-01-10T08:00:00Z"),
        versionId: "v1",
        result: buildResult({ overallAverage: 2 }),
      },
      {
        id: "sub-late",
        campaignId: "camp-shared",
        respondentId: "resp-b",
        submittedAt: new Date("2025-01-10T10:00:00Z"),
        versionId: "v1",
        result: buildResult({ overallAverage: 4 }),
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-a",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  // Never two points for one campaign.
  expect(out.data.points).toHaveLength(1);
  expect(out.data.submissionCount).toBe(1);
  // The LATEST submission (overall 4) survives.
  expect(out.data.points[0].overall.average).toBe(4);
  // The surviving point is flagged degraded (ambiguity).
  expect(out.data.points[0].degraded).toBe(true);
});

// ─── Same-version delta vs cross-version no-delta (ADR-0016) ────────────────

test("same-version delta computed; cross-version shows value with no delta", async () => {
  const db = buildDb({
    submissions: [
      {
        id: "sub-1",
        campaignId: "camp-1",
        respondentId: "resp-1",
        submittedAt: new Date("2024-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({
          overallAverage: 2,
          perSection: [{ stableKey: "s1", name: "S1", averagePoints: 2 }],
        }),
      },
      {
        id: "sub-2",
        campaignId: "camp-2",
        respondentId: "resp-1",
        submittedAt: new Date("2025-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({
          overallAverage: 3.5,
          perSection: [{ stableKey: "s1", name: "S1", averagePoints: 3.5 }],
        }),
      },
      {
        id: "sub-3",
        campaignId: "camp-3",
        respondentId: "resp-1",
        submittedAt: new Date("2026-01-10T00:00:00Z"),
        versionId: "v2", // different version ⇒ no delta vs v1
        result: buildResult({
          overallAverage: 4,
          perSection: [{ stableKey: "s1", name: "S1", averagePoints: 4 }],
        }),
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  const [p1, p2, p3] = out.data.points;

  // First v1 point: no predecessor ⇒ no delta.
  expect(p1.overall.deltaComparable).toBe(false);
  expect(p1.overall.delta).toBeUndefined();

  // Second v1 point: delta vs the first v1 point (3.5 - 2 = 1.5).
  expect(p2.overall.deltaComparable).toBe(true);
  expect(p2.overall.delta).toBe(1.5);
  expect(p2.rows[0].deltaComparable).toBe(true);
  expect(p2.rows[0].delta).toBe(1.5);

  // Third point on v2: no same-version predecessor ⇒ value shown, no delta.
  expect(p3.overall.deltaComparable).toBe(false);
  expect(p3.overall.delta).toBeUndefined();
  expect(p3.rows[0].deltaComparable).toBe(false);
  expect(p3.rows[0].delta).toBeUndefined();

  // comparableCount = 1 (only p2 has a same-version predecessor).
  expect(out.data.comparableCount).toBe(1);
  expect(out.data.hasMultipleVersions).toBe(true);
});

test("degraded point is skipped from delta AND does not poison the same-version baseline", async () => {
  // Regression (whole-branch review): a malformed result between two good
  // same-version points must (a) get NO fabricated delta, and (b) NOT seed the
  // version baseline — so the next good point deltas vs the last GOOD value.
  const db = buildDb({
    submissions: [
      {
        id: "sub-a",
        campaignId: "camp-a",
        respondentId: "resp-1",
        submittedAt: new Date("2024-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({
          overallAverage: 2,
          perSection: [{ stableKey: "s1", name: "S1", averagePoints: 2 }],
        }),
      },
      {
        id: "sub-b", // malformed result, same version, chronologically in the middle
        campaignId: "camp-b",
        respondentId: "resp-1",
        submittedAt: new Date("2025-01-10T00:00:00Z"),
        versionId: "v1",
        result: { garbage: true },
      },
      {
        id: "sub-c",
        campaignId: "camp-c",
        respondentId: "resp-1",
        submittedAt: new Date("2026-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({
          overallAverage: 3.2,
          perSection: [{ stableKey: "s1", name: "S1", averagePoints: 3.2 }],
        }),
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  const [pGood1, pBad, pGood2] = out.data.points;

  // Baseline good point — no predecessor.
  expect(pGood1.overall.deltaComparable).toBe(false);

  // Malformed point: degraded, NO fabricated delta.
  expect(pBad.degraded).toBe(true);
  expect(pBad.overall.deltaComparable).toBe(false);
  expect(pBad.overall.delta).toBeUndefined();

  // Next good same-version point deltas vs the last GOOD value (2), NOT the
  // poisoned 0: 3.2 - 2 = 1.2.
  expect(pGood2.overall.deltaComparable).toBe(true);
  expect(pGood2.overall.delta).toBe(1.2);

  // Only the final good point is comparable; the degraded one is excluded.
  expect(out.data.comparableCount).toBe(1);
});

test("partitionPointsByVersion: delta is vs the previous SAME-version point, not merely previous chronological", () => {
  // Order: v1(2.0), v2(9.0), v1(5.0). The third point's delta must be vs the
  // FIRST v1 point (5 - 2 = 3), NOT vs the immediately-previous v2 point.
  const points: RespondentLongitudinalPoint[] = [
    {
      campaignId: "c1",
      campaignLabel: "C1",
      submittedAt: new Date("2024-01-01T00:00:00Z"),
      versionId: "v1",
      versionNumber: 1,
      overall: { average: 2, deltaComparable: false },
      rows: [{ stableKey: "s1", name: "S1", value: 2, deltaComparable: false }],
    },
    {
      campaignId: "c2",
      campaignLabel: "C2",
      submittedAt: new Date("2024-06-01T00:00:00Z"),
      versionId: "v2",
      versionNumber: 2,
      overall: { average: 9, deltaComparable: false },
      rows: [{ stableKey: "s1", name: "S1", value: 9, deltaComparable: false }],
    },
    {
      campaignId: "c3",
      campaignLabel: "C3",
      submittedAt: new Date("2025-01-01T00:00:00Z"),
      versionId: "v1",
      versionNumber: 1,
      overall: { average: 5, deltaComparable: false },
      rows: [{ stableKey: "s1", name: "S1", value: 5, deltaComparable: false }],
    },
  ];
  const comparable = partitionPointsByVersion(points);
  expect(points[1].overall.deltaComparable).toBe(false); // first v2
  expect(points[2].overall.deltaComparable).toBe(true);
  expect(points[2].overall.delta).toBe(3); // 5 - 2, NOT 5 - 9
  expect(points[2].rows[0].delta).toBe(3);
  expect(comparable).toBe(1);
});

test("all-different-versions ⇒ values shown, zero deltas, comparableCount 0", async () => {
  const db = buildDb({
    submissions: [
      {
        id: "sub-1",
        campaignId: "camp-1",
        respondentId: "resp-1",
        submittedAt: new Date("2024-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({ overallAverage: 2 }),
      },
      {
        id: "sub-2",
        campaignId: "camp-2",
        respondentId: "resp-1",
        submittedAt: new Date("2025-01-10T00:00:00Z"),
        versionId: "v2",
        result: buildResult({ overallAverage: 3 }),
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  expect(out.data.comparableCount).toBe(0);
  expect(out.data.points.every((p) => p.overall.deltaComparable === false)).toBe(
    true,
  );
});

// ─── Equal-timestamp tie-break determinism (R2-Med-2) ───────────────────────

test("equal submittedAt ⇒ deterministic order by openAt, campaignId, submissionId", async () => {
  const sameTime = new Date("2025-03-01T12:00:00Z");
  const db = buildDb({
    submissions: [
      // Intentionally inserted out of order; same submittedAt + same openAt ⇒
      // tie-break falls to campaignId asc.
      {
        id: "sub-z",
        campaignId: "camp-zzz",
        respondentId: "resp-1",
        submittedAt: sameTime,
        openAt: sameTime,
        versionId: "v1",
        result: buildResult({ overallAverage: 9 }),
      },
      {
        id: "sub-a",
        campaignId: "camp-aaa",
        respondentId: "resp-1",
        submittedAt: sameTime,
        openAt: sameTime,
        versionId: "v1",
        result: buildResult({ overallAverage: 1 }),
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  expect(out.data.points.map((p) => p.campaignId)).toEqual([
    "camp-aaa",
    "camp-zzz",
  ]);
});

// ─── Capacity bound truncation (R3-Med-3) ───────────────────────────────────

test("more than DEFAULT_MAX_COLUMNS campaigns ⇒ keep latest N, set bounded", async () => {
  const total = DEFAULT_MAX_COLUMNS + 3;
  const submissions: SubmissionFixture[] = [];
  for (let i = 0; i < total; i++) {
    const day = String(i + 1).padStart(2, "0");
    submissions.push({
      id: `sub-${i}`,
      campaignId: `camp-${day}`,
      respondentId: "resp-1",
      submittedAt: new Date(`2025-01-${day}T00:00:00Z`),
      versionId: "v1",
      result: buildResult({ overallAverage: i }),
    });
  }
  const db = buildDb({ submissions });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  expect(out.data.points).toHaveLength(DEFAULT_MAX_COLUMNS);
  expect(out.data.bounded).toEqual({ shown: DEFAULT_MAX_COLUMNS, total });
  // Latest N retained: the FIRST (oldest) 3 are dropped, ascending order kept.
  expect(out.data.points[0].campaignId).toBe("camp-04");
  expect(out.data.points[DEFAULT_MAX_COLUMNS - 1].campaignId).toBe(
    `camp-${String(total).padStart(2, "0")}`,
  );
});

// ─── Degraded malformed result ──────────────────────────────────────────────

test("malformed result ⇒ point marked degraded, rows skipped, others continue", async () => {
  const db = buildDb({
    submissions: [
      {
        id: "sub-good",
        campaignId: "camp-1",
        respondentId: "resp-1",
        submittedAt: new Date("2024-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({
          overallAverage: 3,
          perSection: [{ stableKey: "s1", name: "S1", averagePoints: 3 }],
        }),
      },
      {
        id: "sub-bad",
        campaignId: "camp-2",
        respondentId: "resp-1",
        submittedAt: new Date("2025-01-10T00:00:00Z"),
        versionId: "v1",
        result: { garbage: true }, // not a ScoreResult
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  expect(out.data.points).toHaveLength(2);
  const bad = out.data.points[1];
  expect(bad.degraded).toBe(true);
  expect(bad.rows).toHaveLength(0);
  // The good point is unaffected.
  expect(out.data.points[0].degraded).toBeUndefined();
  expect(out.data.points[0].rows).toHaveLength(1);
});

// ─── SU-Full perDomain headline ─────────────────────────────────────────────

test("SU-Full perDomain rows are projected (null-domain rows skipped) + scaleUpScore carried", async () => {
  const db = buildDb({
    template: { id: TEMPLATE_ID, name: "Scaling Up Full", alias: "scaling-up-full" },
    submissions: [
      {
        id: "sub-1",
        campaignId: "camp-1",
        respondentId: "resp-1",
        submittedAt: new Date("2025-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({
          overallAverage: 6,
          scaleUpScore: 72,
          perDomain: [
            { key: "people", label: "People", averagePoints: 6 },
            { key: "strategy", label: "Strategy", averagePoints: null }, // no data
          ],
        }),
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  const point = out.data.points[0];
  expect(point.overall.scaleUpScore).toBe(72);
  // null-domain skipped ⇒ only People row.
  expect(point.rows.map((r) => r.stableKey)).toEqual(["people"]);
});

// ─── comparableCount for the ≥2 rule ────────────────────────────────────────

test("single submission ⇒ ok with comparableCount 0 (need ≥2 to compare)", async () => {
  const db = buildDb({
    submissions: [
      {
        id: "sub-1",
        campaignId: "camp-1",
        respondentId: "resp-1",
        submittedAt: new Date("2025-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({ overallAverage: 3, tierLabel: "Good" }),
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  expect(out.data.points).toHaveLength(1);
  expect(out.data.comparableCount).toBe(0);
  expect(out.data.points[0].overall.tier).toBe("Good");
});

// ─── No raw emails anywhere in returned data (R2-Med-6) ─────────────────────

test("returned data carries NO raw emails (only audit-safe counts)", async () => {
  const db = buildDb({
    submissions: [
      {
        id: "sub-1",
        campaignId: "camp-1",
        respondentId: "resp-1",
        submittedAt: new Date("2025-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({ overallAverage: 3 }),
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  expect(out.kind).toBe("ok");
  if (out.kind !== "ok") return;
  const serialized = JSON.stringify(out.data);
  expect(serialized).not.toContain("@");
  expect(serialized).not.toContain("alice@example.com");
  // Audit-safe counts ARE present.
  expect(out.data.matchedRespondentCount).toBe(1);
  expect(out.data.submissionCount).toBe(1);
});

// ─── Public takers excluded ─────────────────────────────────────────────────

test("public takers (null respondentId) are excluded by the filter", async () => {
  const db = buildDb({
    submissions: [
      {
        id: "sub-public",
        campaignId: "camp-public",
        respondentId: null,
        submittedAt: new Date("2025-01-10T00:00:00Z"),
        versionId: "v1",
        result: buildResult({ overallAverage: 5 }),
      },
    ],
  });
  const out = await getRespondentLongitudinal(
    db,
    makeActor(),
    ORG_ID,
    "resp-1",
    TEMPLATE_ID,
  );
  // No non-public submissions for resp-1 ⇒ empty.
  expect(out.kind).toBe("empty");
});
