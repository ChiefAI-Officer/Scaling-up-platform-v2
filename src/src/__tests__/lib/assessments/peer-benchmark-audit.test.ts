import {
  buildPeerBenchmarkAuditSnapshot,
  type PeerBenchmarkAuditDb,
  type PeerBenchmarkEvidence,
} from "@/lib/assessments/peer-benchmark-audit";

const NOW = new Date("2026-08-04T06:00:00.000Z");
const QUESTIONS = [
  { stableKey: "S3_people", type: "SLIDER_LIKERT", label: "People" },
  { stableKey: "S3_strategy", type: "SLIDER_LIKERT", label: "Strategy" },
  { stableKey: "S1_revenue", type: "NUMBER", label: "Revenue" },
];

function knownGate(
  value: "enabled" | "dark",
): PeerBenchmarkEvidence<"enabled" | "dark"> {
  return { state: "known", value };
}

function makeDb(options: {
  template?: { id: string; alias: string } | null;
  version?: {
    versionNumber: number;
    language: string;
    publishedAt: Date;
    questions: unknown;
  } | null;
  metricKeys?: string[];
} = {}) {
  const template =
    "template" in options
      ? options.template
      : { id: "tpl_lva", alias: "leadership-vision-alignment" };
  const version =
    "version" in options
      ? options.version
      : {
          versionNumber: 3,
          language: "enUS",
          publishedAt: new Date("2026-07-02T16:20:09.782Z"),
          questions: QUESTIONS,
        };
  const assessmentTemplate = {
    findFirst: jest.fn().mockResolvedValue(template),
  };
  const assessmentTemplateVersion = {
    findFirst: jest.fn().mockResolvedValue(version),
  };
  const assessmentBenchmark = {
    findMany: jest
      .fn()
      .mockResolvedValue((options.metricKeys ?? []).map((metricKey) => ({ metricKey }))),
  };
  return {
    db: {
      assessmentTemplate,
      assessmentTemplateVersion,
      assessmentBenchmark,
    } as PeerBenchmarkAuditDb,
    assessmentTemplate,
    assessmentTemplateVersion,
    assessmentBenchmark,
  };
}

afterEach(() => jest.restoreAllMocks());

it("classifies full active-key coverage as ready without selecting values", async () => {
  const { db, assessmentTemplateVersion, assessmentBenchmark } = makeDb({
    metricKeys: ["S3_people", "S3_strategy"],
  });

  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });

  expect(snapshot).toMatchObject({
    generatedAt: NOW.toISOString(),
    targetAlias: "leadership-vision-alignment",
    effectiveGate: { state: "known", value: "enabled" },
    template: { state: "known", value: "present" },
    activeVersion: {
      state: "known",
      value: {
        versionNumber: 3,
        language: "enUS",
        publishedAt: "2026-07-02T16:20:09.782Z",
        ratingQuestionCount: 2,
      },
    },
    storedBenchmarks: { state: "known", value: { storedRowCount: 2 } },
    keyCoverage: {
      state: "known",
      value: {
        matchingRowCount: 2,
        missingRatingQuestionCount: 0,
        staleRowCount: 0,
      },
    },
    readiness: "ready",
  });
  expect(assessmentTemplateVersion.findFirst).toHaveBeenCalledWith({
    where: {
      templateId: "tpl_lva",
      language: "enUS",
      publishedAt: { not: null },
      archivedAt: null,
    },
    orderBy: { versionNumber: "desc" },
    select: {
      versionNumber: true,
      language: true,
      publishedAt: true,
      questions: true,
    },
  });
  expect(assessmentBenchmark.findMany).toHaveBeenCalledWith({
    where: { templateId: "tpl_lva", metricKind: "QUESTION" },
    select: { metricKey: true },
  });
  expect(JSON.stringify(snapshot)).not.toContain("value\":6");
  expect(JSON.stringify(snapshot)).not.toContain("WAVE_S_PEER_BENCHMARKS");
});

it("keeps reading prerequisites while the effective capability is dark", async () => {
  const { db, assessmentTemplateVersion, assessmentBenchmark } = makeDb();
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("dark"),
  });

  expect(snapshot.readiness).toBe("dark");
  expect(assessmentTemplateVersion.findFirst).toHaveBeenCalledTimes(1);
  expect(assessmentBenchmark.findMany).toHaveBeenCalledTimes(1);
  expect(snapshot.activeVersion.state).toBe("known");
  expect(snapshot.storedBenchmarks).toEqual({
    state: "known",
    value: { storedRowCount: 0 },
  });
});

it.each([
  {
    name: "zero matching rows",
    keys: [],
    readiness: "noData",
    coverage: {
      matchingRowCount: 0,
      missingRatingQuestionCount: 2,
      staleRowCount: 0,
    },
  },
  {
    name: "partial active coverage",
    keys: ["S3_people"],
    readiness: "partialData",
    coverage: {
      matchingRowCount: 1,
      missingRatingQuestionCount: 1,
      staleRowCount: 0,
    },
  },
  {
    name: "all active keys plus a stale row",
    keys: ["S3_people", "S3_strategy", "S3_retired"],
    readiness: "ready",
    coverage: {
      matchingRowCount: 2,
      missingRatingQuestionCount: 0,
      staleRowCount: 1,
    },
  },
])("$name", async ({ keys, readiness, coverage }) => {
  const { db } = makeDb({ metricKeys: keys });
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.readiness).toBe(readiness);
  expect(snapshot.keyCoverage).toEqual({ state: "known", value: coverage });
});

it("classifies stale-only stored keys as no data for active questions", async () => {
  const { db } = makeDb({ metricKeys: ["S3_retired"] });

  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });

  expect(snapshot.storedBenchmarks).toEqual({
    state: "known",
    value: { storedRowCount: 1 },
  });
  expect(snapshot.keyCoverage).toEqual({
    state: "known",
    value: {
      matchingRowCount: 0,
      missingRatingQuestionCount: 2,
      staleRowCount: 1,
    },
  });
  expect(snapshot.readiness).toBe("noData");
});

it("known missing template blocks readiness and marks dependents not applicable", async () => {
  const { db, assessmentTemplateVersion, assessmentBenchmark } = makeDb({
    template: null,
  });
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot).toMatchObject({
    template: { state: "missing", reason: "template_not_found" },
    activeVersion: { state: "notApplicable", reason: "template_missing" },
    storedBenchmarks: { state: "notApplicable", reason: "template_missing" },
    keyCoverage: { state: "notApplicable", reason: "template_missing" },
    readiness: "blocked",
  });
  expect(assessmentTemplateVersion.findFirst).not.toHaveBeenCalled();
  expect(assessmentBenchmark.findMany).not.toHaveBeenCalled();
});

it("known missing active version blocks but preserves stored-row count", async () => {
  const { db } = makeDb({
    version: null,
    metricKeys: ["S3_retired"],
  });
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.activeVersion).toEqual({
    state: "missing",
    reason: "active_version_not_found",
  });
  expect(snapshot.storedBenchmarks).toEqual({
    state: "known",
    value: { storedRowCount: 1 },
  });
  expect(snapshot.keyCoverage).toEqual({
    state: "notApplicable",
    reason: "active_version_missing",
  });
  expect(snapshot.readiness).toBe("blocked");
});

it("active-version failure preserves a successful stored-key count", async () => {
  const { db, assessmentTemplateVersion } = makeDb({
    metricKeys: ["S3_people"],
  });
  assessmentTemplateVersion.findFirst.mockRejectedValueOnce(
    new Error("version read failed"),
  );
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.activeVersion).toEqual({
    state: "unknown",
    reason: "query_failed",
  });
  expect(snapshot.storedBenchmarks).toEqual({
    state: "known",
    value: { storedRowCount: 1 },
  });
  expect(snapshot.keyCoverage).toEqual({
    state: "unknown",
    reason: "dependency_unknown",
  });
  expect(snapshot.readiness).toBe("unknown");
  expect(errorSpy).toHaveBeenCalledWith(
    "Peer benchmark audit read failed",
    expect.objectContaining({
      stage: "active_version",
      name: "Error",
      message: "version read failed",
    }),
  );
  errorSpy.mockRestore();
});

it("stored-key failure preserves active-version evidence", async () => {
  const { db, assessmentBenchmark } = makeDb();
  assessmentBenchmark.findMany.mockRejectedValueOnce(
    new Error("benchmark read failed"),
  );
  jest.spyOn(console, "error").mockImplementation(() => {});
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.activeVersion.state).toBe("known");
  expect(snapshot.storedBenchmarks).toEqual({
    state: "unknown",
    reason: "query_failed",
  });
  expect(snapshot.keyCoverage).toEqual({
    state: "unknown",
    reason: "dependency_unknown",
  });
  expect(snapshot.readiness).toBe("unknown");
});

it("template read failure is unknown, never missing or zero", async () => {
  const { db, assessmentTemplate } = makeDb();
  assessmentTemplate.findFirst.mockRejectedValueOnce(new Error("template down"));
  jest.spyOn(console, "error").mockImplementation(() => {});
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.template).toEqual({
    state: "unknown",
    reason: "query_failed",
  });
  expect(snapshot.activeVersion).toEqual({
    state: "unknown",
    reason: "dependency_unknown",
  });
  expect(snapshot.storedBenchmarks).toEqual({
    state: "unknown",
    reason: "dependency_unknown",
  });
  expect(snapshot.readiness).toBe("unknown");
});

it("keeps dark readiness when the template read fails", async () => {
  const { db, assessmentTemplate } = makeDb();
  assessmentTemplate.findFirst.mockRejectedValueOnce(new Error("template down"));
  jest.spyOn(console, "error").mockImplementation(() => {});

  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("dark"),
  });

  expect(snapshot.template).toEqual({
    state: "unknown",
    reason: "query_failed",
  });
  expect(snapshot.activeVersion).toEqual({
    state: "unknown",
    reason: "dependency_unknown",
  });
  expect(snapshot.storedBenchmarks).toEqual({
    state: "unknown",
    reason: "dependency_unknown",
  });
  expect(snapshot.keyCoverage).toEqual({
    state: "unknown",
    reason: "dependency_unknown",
  });
  expect(snapshot.readiness).toBe("dark");
});

it("unknown effective-gate evidence does not suppress database evidence", async () => {
  const { db, assessmentTemplateVersion, assessmentBenchmark } = makeDb({
    metricKeys: ["S3_people", "S3_strategy"],
  });
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: { state: "unknown", reason: "query_failed" },
  });
  expect(snapshot.readiness).toBe("unknown");
  expect(snapshot.activeVersion.state).toBe("known");
  expect(snapshot.storedBenchmarks.state).toBe("known");
  expect(assessmentTemplateVersion.findFirst).toHaveBeenCalledTimes(1);
  expect(assessmentBenchmark.findMany).toHaveBeenCalledTimes(1);
});

it("blocks an active version with no rating questions without hiding stored rows", async () => {
  const { db } = makeDb({
    version: {
      versionNumber: 3,
      language: "enUS",
      publishedAt: new Date("2026-07-02T16:20:09.782Z"),
      questions: [
        { stableKey: "S1_revenue", type: "NUMBER", label: "Revenue" },
      ],
    },
    metricKeys: ["S3_retired"],
  });
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.activeVersion).toMatchObject({
    state: "known",
    value: { ratingQuestionCount: 0 },
  });
  expect(snapshot.storedBenchmarks).toEqual({
    state: "known",
    value: { storedRowCount: 1 },
  });
  expect(snapshot.keyCoverage).toEqual({
    state: "known",
    value: {
      matchingRowCount: 0,
      missingRatingQuestionCount: 0,
      staleRowCount: 1,
    },
  });
  expect(snapshot.readiness).toBe("blocked");
});
