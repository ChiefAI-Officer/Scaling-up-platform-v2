import {
  activePublishedWhere,
  DEFAULT_TEMPLATE_LANGUAGE,
} from "@/lib/assessments/active-version";
import { LVA_TEMPLATE_ALIAS } from "@/lib/assessments/lva-report-display";
import { listRatingQuestionKeys } from "@/lib/assessments/peer-benchmarks";

export type EffectivePeerBenchmarkGate = "enabled" | "dark";
export type PeerBenchmarkReadiness =
  | "dark"
  | "blocked"
  | "noData"
  | "partialData"
  | "ready"
  | "unknown";

export type PeerBenchmarkEvidence<T> =
  | { state: "known"; value: T }
  | {
      state: "missing";
      reason: "template_not_found" | "active_version_not_found";
    }
  | {
      state: "notApplicable";
      reason: "template_missing" | "active_version_missing";
    }
  | {
      state: "unknown";
      reason: "query_failed" | "dependency_unknown";
    };

export interface PeerBenchmarkAuditSnapshot {
  generatedAt: string;
  targetAlias: typeof LVA_TEMPLATE_ALIAS;
  effectiveGate: PeerBenchmarkEvidence<EffectivePeerBenchmarkGate>;
  template: PeerBenchmarkEvidence<"present">;
  activeVersion: PeerBenchmarkEvidence<{
    versionNumber: number;
    language: string;
    publishedAt: string;
    ratingQuestionCount: number;
  }>;
  storedBenchmarks: PeerBenchmarkEvidence<{ storedRowCount: number }>;
  keyCoverage: PeerBenchmarkEvidence<{
    matchingRowCount: number;
    missingRatingQuestionCount: number;
    staleRowCount: number;
  }>;
  readiness: PeerBenchmarkReadiness;
}

export interface PeerBenchmarkAuditDb {
  assessmentTemplate: {
    findFirst(args: {
      where: { alias: string; deletedAt: null };
      select: { id: true; alias: true };
    }): Promise<{ id: string; alias: string } | null>;
  };
  assessmentTemplateVersion: {
    findFirst(args: {
      where: {
        templateId: string;
        language: string;
        publishedAt: { not: null };
        archivedAt: null;
      };
      orderBy: { versionNumber: "desc" };
      select: {
        versionNumber: true;
        language: true;
        publishedAt: true;
        questions: true;
      };
    }): Promise<{
      versionNumber: number;
      language: string;
      publishedAt: Date | null;
      questions: unknown;
    } | null>;
  };
  assessmentBenchmark: {
    findMany(args: {
      where: { templateId: string; metricKind: "QUESTION" };
      select: { metricKey: true };
    }): Promise<Array<{ metricKey: string }>>;
  };
}

type LoadedTemplate = { id: string; alias: string };
type ActiveVersionLoad = {
  evidence: PeerBenchmarkAuditSnapshot["activeVersion"];
  ratingKeys: Set<string> | null;
};
type StoredKeysLoad = {
  evidence: PeerBenchmarkAuditSnapshot["storedBenchmarks"];
  storedKeys: Set<string> | null;
};

function known<T>(value: T): PeerBenchmarkEvidence<T> {
  return { state: "known", value };
}

function deriveCoverage(
  activeKeys: ReadonlySet<string>,
  storedKeys: ReadonlySet<string>,
): {
  matchingRowCount: number;
  missingRatingQuestionCount: number;
  staleRowCount: number;
} {
  let matchingRowCount = 0;
  let missingRatingQuestionCount = 0;
  let staleRowCount = 0;
  for (const key of activeKeys) {
    if (storedKeys.has(key)) matchingRowCount += 1;
    else missingRatingQuestionCount += 1;
  }
  for (const key of storedKeys) {
    if (!activeKeys.has(key)) staleRowCount += 1;
  }
  return { matchingRowCount, missingRatingQuestionCount, staleRowCount };
}

function deriveReadiness(input: {
  effectiveGate: PeerBenchmarkEvidence<EffectivePeerBenchmarkGate>;
  template: PeerBenchmarkEvidence<"present">;
  activeVersion: PeerBenchmarkAuditSnapshot["activeVersion"];
  keyCoverage: PeerBenchmarkAuditSnapshot["keyCoverage"];
}): PeerBenchmarkReadiness {
  if (
    input.effectiveGate.state === "known" &&
    input.effectiveGate.value === "dark"
  ) {
    return "dark";
  }
  if (input.effectiveGate.state !== "known") return "unknown";
  if (input.template.state === "missing") return "blocked";
  if (input.activeVersion.state === "missing") return "blocked";
  if (
    input.activeVersion.state === "known" &&
    input.activeVersion.value.ratingQuestionCount === 0
  ) {
    return "blocked";
  }
  if (
    input.activeVersion.state !== "known" ||
    input.keyCoverage.state !== "known"
  ) {
    return "unknown";
  }
  const { matchingRowCount, missingRatingQuestionCount } =
    input.keyCoverage.value;
  if (matchingRowCount === 0) return "noData";
  if (missingRatingQuestionCount > 0) return "partialData";
  return "ready";
}

function logReadFailure(
  stage: "template" | "active_version" | "stored_benchmarks",
  error: unknown,
): void {
  console.error("Peer benchmark audit read failed", {
    stage,
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Non-Error thrown",
  });
}

const queryFailed = { state: "unknown", reason: "query_failed" } as const;
const dependencyUnknown = {
  state: "unknown",
  reason: "dependency_unknown",
} as const;
const templateMissing = {
  state: "notApplicable",
  reason: "template_missing",
} as const;
const activeVersionMissing = {
  state: "notApplicable",
  reason: "active_version_missing",
} as const;

async function loadActiveVersion(
  db: PeerBenchmarkAuditDb,
  templateId: string,
): Promise<ActiveVersionLoad> {
  const row = await db.assessmentTemplateVersion.findFirst({
    where: {
      templateId,
      language: DEFAULT_TEMPLATE_LANGUAGE,
      ...activePublishedWhere,
    },
    orderBy: { versionNumber: "desc" },
    select: {
      versionNumber: true,
      language: true,
      publishedAt: true,
      questions: true,
    },
  });
  if (!row) {
    return {
      evidence: { state: "missing", reason: "active_version_not_found" },
      ratingKeys: null,
    };
  }
  if (!(row.publishedAt instanceof Date)) {
    throw new TypeError("Published version has no publishedAt timestamp");
  }
  const ratingKeys = new Set(
    listRatingQuestionKeys(row.questions, LVA_TEMPLATE_ALIAS).map(
      ({ stableKey }) => stableKey,
    ),
  );
  return {
    evidence: known({
      versionNumber: row.versionNumber,
      language: row.language,
      publishedAt: row.publishedAt.toISOString(),
      ratingQuestionCount: ratingKeys.size,
    }),
    ratingKeys,
  };
}

async function loadStoredKeys(
  db: PeerBenchmarkAuditDb,
  templateId: string,
): Promise<StoredKeysLoad> {
  const rows = await db.assessmentBenchmark.findMany({
    where: { templateId, metricKind: "QUESTION" },
    select: { metricKey: true },
  });
  return {
    evidence: known({ storedRowCount: rows.length }),
    storedKeys: new Set(rows.map(({ metricKey }) => metricKey)),
  };
}

export async function buildPeerBenchmarkAuditSnapshot({
  db,
  now,
  effectiveGate,
}: {
  db: PeerBenchmarkAuditDb;
  now: Date;
  effectiveGate: PeerBenchmarkEvidence<EffectivePeerBenchmarkGate>;
}): Promise<PeerBenchmarkAuditSnapshot> {
  const base = {
    generatedAt: now.toISOString(),
    targetAlias: LVA_TEMPLATE_ALIAS,
    effectiveGate,
  } as const;

  let templateRow: LoadedTemplate | null;
  try {
    templateRow = await db.assessmentTemplate.findFirst({
      where: { alias: LVA_TEMPLATE_ALIAS, deletedAt: null },
      select: { id: true, alias: true },
    });
  } catch (error) {
    logReadFailure("template", error);
    return {
      ...base,
      template: queryFailed,
      activeVersion: dependencyUnknown,
      storedBenchmarks: dependencyUnknown,
      keyCoverage: dependencyUnknown,
      readiness: "unknown",
    };
  }

  if (!templateRow) {
    const template = {
      state: "missing",
      reason: "template_not_found",
    } as const;
    return {
      ...base,
      template,
      activeVersion: templateMissing,
      storedBenchmarks: templateMissing,
      keyCoverage: templateMissing,
      readiness: deriveReadiness({
        effectiveGate,
        template,
        activeVersion: templateMissing,
        keyCoverage: templateMissing,
      }),
    };
  }

  const templateId = templateRow.id;
  const [active, stored] = await Promise.all([
    (async (): Promise<ActiveVersionLoad> => {
      try {
        return await loadActiveVersion(db, templateId);
      } catch (error) {
        logReadFailure("active_version", error);
        return { evidence: queryFailed, ratingKeys: null };
      }
    })(),
    (async (): Promise<StoredKeysLoad> => {
      try {
        return await loadStoredKeys(db, templateId);
      } catch (error) {
        logReadFailure("stored_benchmarks", error);
        return { evidence: queryFailed, storedKeys: null };
      }
    })(),
  ]);

  let keyCoverage: PeerBenchmarkAuditSnapshot["keyCoverage"];
  if (active.evidence.state === "missing") {
    keyCoverage = activeVersionMissing;
  } else if (active.ratingKeys && stored.storedKeys) {
    keyCoverage = known(deriveCoverage(active.ratingKeys, stored.storedKeys));
  } else {
    keyCoverage = dependencyUnknown;
  }

  const template = known<"present">("present");
  return {
    ...base,
    template,
    activeVersion: active.evidence,
    storedBenchmarks: stored.evidence,
    keyCoverage,
    readiness: deriveReadiness({
      effectiveGate,
      template,
      activeVersion: active.evidence,
      keyCoverage,
    }),
  };
}
